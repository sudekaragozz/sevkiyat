from django.core.paginator import Paginator
from django.db.models import Count, Max, Min
from django.utils.dateparse import parse_date
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .exceptions import ShipmentError
from .models import Branch, Employee, Package, PackageHistory, Trip, Vehicle
from .package_service import PackageService
from .trip_service import TripService
from .serializers import (
    BranchSerializer,
    EmployeeSerializer,
    PackageHistorySerializer,
    PackageSerializer,
    TripSerializer,
    VehicleSerializer,
)


class EmployeeViewset(APIView):

    def get(self, request, pk=None):
        if pk is None:
            employees = Employee.objects.order_by('name')
            return Response(EmployeeSerializer(employees, many=True).data)

        employee = get_object_or_404(Employee, pk=pk)
        return Response(EmployeeSerializer(employee).data)


class BranchViewset(APIView):

    def get(self, request, pk=None):
        if pk is None:
            branches = Branch.objects.order_by('name')
            return Response(BranchSerializer(branches, many=True).data)

        branch = get_object_or_404(Branch, pk=pk)
        return Response(BranchSerializer(branch).data)


def _split_param(request, name):
    raw = request.query_params.get(name, '')
    return [item.strip() for item in raw.split(',') if item.strip()]


def apply_list_filters(queryset, request, multi_fields=None, date_fields=None, int_fields=None):
    """Apply list-page filters from query params; raises ValueError with a user-facing message.

    multi_fields: param -> (lookup, cast), comma-separated values.
    date_fields:  param -> lookup, YYYY-MM-DD.
    int_fields:   param -> lookup, single integer.
    """
    for param, (lookup, cast) in (multi_fields or {}).items():
        values = _split_param(request, param)
        if not values:
            continue
        try:
            values = [cast(value) for value in values]
        except ValueError:
            raise ValueError(f"{param} must be a comma-separated list of ids.")
        queryset = queryset.filter(**{lookup: values})

    for param, lookup in (date_fields or {}).items():
        raw = request.query_params.get(param)
        if not raw:
            continue
        try:
            value = parse_date(raw)
        except ValueError:
            value = None
        if value is None:
            raise ValueError(f"{param} must be a date in YYYY-MM-DD format.")
        queryset = queryset.filter(**{lookup: value})

    for param, lookup in (int_fields or {}).items():
        raw = request.query_params.get(param)
        if not raw:
            continue
        try:
            value = int(raw)
        except ValueError:
            raise ValueError(f"{param} must be an integer.")
        queryset = queryset.filter(**{lookup: value})

    return queryset


def paginate(request, queryset, serializer_class):
    try:
        page_size = int(request.query_params.get('page_size', 20))
    except (TypeError, ValueError):
        page_size = 20

    try:
        page_number = int(request.query_params.get('page_number', 1))
    except (TypeError, ValueError):
        page_number = 1

    page_size = max(page_size, 1)
    page_number = max(page_number, 1)

    paginator = Paginator(queryset, page_size)
    page = paginator.get_page(page_number)

    return Response({
        'count': paginator.count,
        'total_pages': paginator.num_pages,
        'page_number': page.number,
        'page_size': page_size,
        'results': serializer_class(page.object_list, many=True).data,
    })


class PackageViewset(APIView):
    SORTABLE_FIELDS = {
        'id',
        'created_at',
        'last_movement_at',
    }

    # query param -> (ORM lookup, value type). Values are comma-separated for multi-select.
    MULTI_FILTER_FIELDS = {
        'tracking_number': ('tracking_number__in', str),
        'recipient_name': ('recipient_name__in', str),
        'payment_type': ('payment_type__in', str),
        'status': ('status__in', str),
        'employee': ('employee_id__in', int),
        'origin_branch': ('origin_branch_id__in', int),
        'destination_branch': ('destination_branch_id__in', int),
    }

    # query param -> ORM lookup on the annotated history dates (YYYY-MM-DD, inclusive).
    DATE_FILTER_FIELDS = {
        'created_after': 'created_at__date__gte',
        'created_before': 'created_at__date__lte',
        'last_movement_after': 'last_movement_at__date__gte',
        'last_movement_before': 'last_movement_at__date__lte',
    }

    def _filtered_queryset(self, request):
        queryset = Package.objects.annotate(
            created_at=Min('history__created_at'),
            last_movement_at=Max('history__created_at'),
        )

        return apply_list_filters(
            queryset, request,
            multi_fields=self.MULTI_FILTER_FIELDS,
            date_fields=self.DATE_FILTER_FIELDS,
        )

    def get(self, request, *args, **kwargs):
        sort_by = request.query_params.get('sort_by', 'id')
        sort_field = sort_by[1:] if sort_by.startswith('-') else sort_by

        if sort_field not in self.SORTABLE_FIELDS:
            return Response(
                {"detail": f"sort_by must be one of: {', '.join(sorted(self.SORTABLE_FIELDS))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            queryset = self._filtered_queryset(request)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return paginate(request, queryset.order_by(sort_by, 'id'), PackageSerializer)

    def post(self, request, pk=None, *args, **kwargs):
        if pk is None:
            return self._create(request)
        return self._load_to_trip(request, pk)

    def _create(self, request):
        serializer = PackageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        package = PackageService.create_package(
            employee=data['employee'],
            origin_branch=data['origin_branch'],
            destination_branch=data['destination_branch'],
            desi=data['desi'],
            recipient_name=data['recipient_name'],
            recipient_phone=data['recipient_phone'],
            payment_type=data['payment_type'],
        )

        return Response(
            PackageSerializer(package).data,
            status=status.HTTP_201_CREATED
        )

    def _load_to_trip(self, request, pk):
        package = Package.objects.filter(id=pk).first()

        if not package:
            return Response(
                {"detail": "Package not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        employee_id = request.data.get('employee_id')
        trip_id = request.data.get('trip_id')

        if not employee_id or not trip_id:
            return Response(
                {"detail": "employee_id and trip_id are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not Employee.objects.filter(id=employee_id).exists():
            return Response(
                {"detail": "Employee not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        if not Trip.objects.filter(id=trip_id).exists():
            return Response(
                {"detail": "Trip not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            package = PackageService.load_to_trip(
                package_id=package.id,
                trip_id=trip_id,
                employee_id=employee_id,
            )
        except ShipmentError as error:
            return Response(
                {"detail": error.message},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            PackageSerializer(package).data,
            status=status.HTTP_200_OK
        )


class PackageFilterOptionsView(APIView):
    """Distinct values for the free-text package columns, used by the list page's filter dropdowns."""

    FIELDS = {'tracking_number', 'recipient_name', 'payment_type'}
    LIMIT = 50

    def get(self, request):
        field = request.query_params.get('field')
        if field not in self.FIELDS:
            return Response(
                {"detail": f"field must be one of: {', '.join(sorted(self.FIELDS))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = Package.objects.all()
        search = request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(**{f'{field}__icontains': search})

        values = queryset.order_by(field).values_list(field, flat=True).distinct()[:self.LIMIT]
        return Response(list(values))


class VehicleViewset(APIView):

    def get(self, request, pk=None):
        if pk is None:
            vehicles = Vehicle.objects.all()
            return Response(VehicleSerializer(vehicles, many=True).data)

        vehicle = get_object_or_404(Vehicle, pk=pk)
        return Response(VehicleSerializer(vehicle).data)

    def post(self, request):
        serializer = VehicleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vehicle = serializer.save()
        return Response(
            VehicleSerializer(vehicle).data,
            status=status.HTTP_201_CREATED
        )

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        vehicle = get_object_or_404(Vehicle, pk=pk)
        vehicle.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _update(self, request, pk, partial):
        vehicle = get_object_or_404(Vehicle, pk=pk)
        serializer = VehicleSerializer(vehicle, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class TripFilterOptionsView(APIView):
    """Values actually used by trips, as {value, label}, for the sefer list page's filter dropdowns."""

    # field -> (value lookup, label lookup)
    RELATED_FIELDS = {
        'vehicle': ('vehicle_id', 'vehicle__plate_number'),
        'loaded_by': ('loaded_by_id', 'loaded_by__name'),
        'origin_branch': ('origin_branch_id', 'origin_branch__name'),
        'destination_branch': ('destination_branch_id', 'destination_branch__name'),
    }

    def get(self, request):
        field = request.query_params.get('field')

        if field == 'status':
            used = set(Trip.objects.values_list('status', flat=True).distinct())
            return Response([
                {'value': value, 'label': label}
                for value, label in Trip.Status.choices if value in used
            ])

        if field not in self.RELATED_FIELDS:
            allowed = sorted([*self.RELATED_FIELDS, 'status'])
            return Response(
                {"detail": f"field must be one of: {', '.join(allowed)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        value_lookup, label_lookup = self.RELATED_FIELDS[field]
        rows = Trip.objects.values(value_lookup, label_lookup).distinct().order_by(label_lookup, value_lookup)
        return Response([{'value': row[value_lookup], 'label': row[label_lookup]} for row in rows])


def trip_queryset():
    return Trip.objects.annotate(
        package_count=Count('package_histories__package', distinct=True)
    )


class TripViewset(APIView):

    # query param -> (ORM lookup, value type). Values are comma-separated for multi-select.
    MULTI_FILTER_FIELDS = {
        'status': ('status__in', str),
        'vehicle': ('vehicle_id__in', int),
        'loaded_by': ('loaded_by_id__in', int),
        'origin_branch': ('origin_branch_id__in', int),
        'destination_branch': ('destination_branch_id__in', int),
    }

    # YYYY-MM-DD, inclusive.
    DATE_FILTER_FIELDS = {
        'loading_after': 'loading_date__date__gte',
        'loading_before': 'loading_date__date__lte',
    }

    INT_FILTER_FIELDS = {
        'package_count_min': 'package_count__gte',
        'package_count_max': 'package_count__lte',
    }

    def get(self, request, pk=None, action=None):
        if pk is None:
            return self._list(request)

        if action == 'packages':
            return self._packages(pk)

        trip = get_object_or_404(trip_queryset(), pk=pk)
        return Response(TripSerializer(trip).data)

    def post(self, request, pk=None, action=None):
        if pk is None:
            serializer = TripSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            trip = serializer.save()
            return Response(
                TripSerializer(trip).data,
                status=status.HTTP_201_CREATED
            )

        if action == 'start':
            TripService.start_trip(trip_id=pk)
            trip = get_object_or_404(trip_queryset(), pk=pk)
            return Response(TripSerializer(trip).data)

        if action == 'arrive':
            TripService.arrive_trip(trip_id=pk)
            trip = get_object_or_404(trip_queryset(), pk=pk)
            return Response(TripSerializer(trip).data)

        return Response({"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        trip = get_object_or_404(Trip, pk=pk)
        trip.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _update(self, request, pk, partial):
        trip = get_object_or_404(trip_queryset(), pk=pk)
        serializer = TripSerializer(trip, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def _list(self, request):
        try:
            queryset = apply_list_filters(
                trip_queryset(), request,
                multi_fields=self.MULTI_FILTER_FIELDS,
                date_fields=self.DATE_FILTER_FIELDS,
                int_fields=self.INT_FILTER_FIELDS,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Sayfalama isteğe bağlı: page_number yoksa eski davranış (tüm seferler dizi olarak),
        # çünkü referans verisi (sefer listesi/seferById) bu şekli kullanıyor.
        if 'page_number' not in request.query_params:
            return Response(TripSerializer(queryset, many=True).data)

        return paginate(request, queryset.order_by('-id'), TripSerializer)

    def _packages(self, pk):
        if not Trip.objects.filter(id=pk).exists():
            return Response({"detail": "Trip not found."}, status=status.HTTP_404_NOT_FOUND)

        package_ids = PackageHistory.objects.filter(trip_id=pk).values_list('package_id', flat=True).distinct()
        packages = Package.objects.filter(id__in=package_ids)
        return Response(PackageSerializer(packages, many=True).data)


class PackageHistoryView(APIView):

    SORTABLE_FIELDS = {
        'id',
        'created_at',
    }

    FILTER_FIELDS = {
        'package': 'package_id',
        'branch': 'branch_id',
        'employee': 'employee_id',
        'trip': 'trip_id',
        'status': 'status',
    }

    def get(self, request, *args, **kwargs):
        try:
            page_size = int(request.query_params.get('page_size', 20))
        except (TypeError, ValueError):
            page_size = 20

        try:
            page_number = int(request.query_params.get('page_number', 1))
        except (TypeError, ValueError):
            page_number = 1

        page_size = max(page_size, 1)
        page_number = max(page_number, 1)

        sort_by = request.query_params.get('sort_by', '-created_at')
        sort_field = sort_by[1:] if sort_by.startswith('-') else sort_by

        if sort_field not in self.SORTABLE_FIELDS:
            return Response(
                {"detail": f"sort_by must be one of: {', '.join(sorted(self.SORTABLE_FIELDS))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        queryset = PackageHistory.objects.select_related(
            'package', 'branch', 'employee', 'trip'
        )

        for param, lookup in self.FILTER_FIELDS.items():
            value = request.query_params.get(param)
            if value:
                queryset = queryset.filter(**{lookup: value})

        created_after = request.query_params.get('created_after')
        if created_after:
            queryset = queryset.filter(created_at__gte=created_after)

        created_before = request.query_params.get('created_before')
        if created_before:
            queryset = queryset.filter(created_at__lte=created_before)

        paginator = Paginator(queryset.order_by(sort_by, '-id'), page_size)
        page = paginator.get_page(page_number)

        return Response({
            'count': paginator.count,
            'total_pages': paginator.num_pages,
            'page_number': page.number,
            'page_size': page_size,
            'results': PackageHistorySerializer(page.object_list, many=True).data,
        })


class EmployeePackagesView(APIView):

    def get(self, request, pk=None):
        if not Employee.objects.filter(id=pk).exists():
            return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        package_ids = PackageHistory.objects.filter(employee_id=pk).values_list('package_id', flat=True).distinct()
        packages = Package.objects.filter(id__in=package_ids)

        return Response(PackageSerializer(packages, many=True).data)
