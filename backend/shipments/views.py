from django.core.paginator import Paginator
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .exceptions import SevkiyatError
from .package_service import PackageService

from .models import Branch, Employee, Package, Vehicle, Sefer, PackageHistory
from .serializers import (
    BranchSerializer,
    EmployeeSerializer,
    PackageSerializer,
    PackageHistorySerializer,
    VehicleSerializer,
    SeferSerializer,
)
from .sefer_service import SeferService


class EmployeeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Employee.objects.all().order_by('name')
    serializer_class = EmployeeSerializer


class BranchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Branch.objects.all().order_by('name')
    serializer_class = BranchSerializer


class PackageView(APIView):
    SORTABLE_FIELDS = {
        'id',
        'created_at',
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

        sort_by = request.query_params.get('sort_by', 'id')
        sort_field = sort_by[1:] if sort_by.startswith('-') else sort_by

        if sort_field not in self.SORTABLE_FIELDS:
            return Response(
                {"detail": f"sort_by must be one of: {', '.join(sorted(self.SORTABLE_FIELDS))}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        paginator = Paginator(Package.objects.all().order_by(sort_by), page_size)
        page = paginator.get_page(page_number)

        return Response({
            'count': paginator.count,
            'total_pages': paginator.num_pages,
            'page_number': page.number,
            'page_size': page_size,
            'results': PackageSerializer(page.object_list, many=True).data,
        })

    def post(self, request, *args, **kwargs):
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

class PackageSefereCikartView(APIView):
    def post(self, request, pk=None):
        package = Package.objects.filter(id=pk).first()

        if not package:
            return Response(
                {"detail": "Package not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        employee_id = request.data.get('employee_id')
        sefer_id = request.data.get('sefer_id')

        if not employee_id or not sefer_id:
            return Response(
                {"detail": "employee_id and sefer_id are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not Employee.objects.filter(id=employee_id).exists():
            return Response(
                {"detail": "Employee not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        if not Sefer.objects.filter(id=sefer_id).exists():
            return Response(
                {"detail": "Sefer not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            package = PackageService.sefere_cikart(
                package_id=package.id,
                sefer_id=sefer_id,
                employee_id=employee_id,
            )
        except SevkiyatError as error:
            return Response(
                {"detail": error.message},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            PackageSerializer(package).data,
            status=status.HTTP_200_OK
        )

class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer


class SeferViewSet(viewsets.ModelViewSet):

    queryset = Sefer.objects.annotate(package_count=Count('package_histories__package', distinct=True))
    serializer_class = SeferSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        sefer = serializer.save()

        return Response(
            self.get_serializer(sefer).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        sefer = self.get_object()

        SeferService.start_sefer(sefer)

        return Response(
            self.get_serializer(sefer).data
        )

    @action(detail=True, methods=['post'])
    def arrive(self, request, pk=None):
        sefer = self.get_object()

        SeferService.arrive_sefer(sefer)

        return Response(
            self.get_serializer(sefer).data
        )
    @action(detail=True, methods=['post'])
    def create_next(self, request, pk=None):
        previous_sefer = self.get_object()

        vehicle_id = request.data.get('vehicle')
        loaded_by_id = request.data.get('loaded_by')
        destination_branch_id = request.data.get('destination_branch')

        vehicle = Vehicle.objects.get(id=vehicle_id)
        loaded_by = Employee.objects.get(id=loaded_by_id)
        destination_branch = Branch.objects.get(id=destination_branch_id)

        new_sefer = SeferService.create_next_sefer(
            previous_sefer=previous_sefer,
            vehicle=vehicle,
            loaded_by=loaded_by,
            destination_branch=destination_branch
        )

        return Response(
            self.get_serializer(new_sefer).data,
            status=status.HTTP_201_CREATED
        )

class PackageHistoryView(APIView):

        SORTABLE_FIELDS = {
            'id',
            'created_at',
        }

        FILTER_FIELDS = {
            'package': 'package_id',
            'branch': 'branch_id',
            'employee': 'employee_id',
            'sefer': 'sefer_id',
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
                'package', 'branch', 'employee', 'sefer'
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


class SeferPackagesView(APIView):

    def get(self, request, pk=None):
        if not Sefer.objects.filter(id=pk).exists():
            return Response({"detail": "Sefer not found."}, status=status.HTTP_404_NOT_FOUND)

        package_ids = PackageHistory.objects.filter(sefer_id=pk).values_list('package_id', flat=True).distinct()
        packages = Package.objects.filter(id__in=package_ids)

        return Response(PackageSerializer(packages, many=True).data)