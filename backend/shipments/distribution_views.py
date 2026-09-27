from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .distribution_service import DistributionService, eligible_packages
from .exceptions import ShipmentError
from .models import Distribution, DistributionPackage
from .serializers import (
    DistributionCreateSerializer,
    DistributionPackageSerializer,
    DistributionSerializer,
    PackageSerializer,
)
from .views import apply_list_filters, paginate


def distribution_queryset():
    return Distribution.objects.annotate(package_count=Count('items'))


def _distribution_response(pk, status_code=status.HTTP_200_OK):
    distribution = get_object_or_404(distribution_queryset(), pk=pk)
    return Response(DistributionSerializer(distribution).data, status=status_code)


class DistributionViewset(APIView):

    # query param -> (ORM lookup, value type). Values are comma-separated for multi-select.
    MULTI_FILTER_FIELDS = {
        'status': ('status__in', str),
        'branch': ('branch_id__in', int),
        'courier': ('courier_id__in', int),
        'vehicle': ('vehicle_id__in', int),
    }

    # YYYY-MM-DD, inclusive.
    DATE_FILTER_FIELDS = {
        'started_after': 'started_at__date__gte',
        'started_before': 'started_at__date__lte',
    }

    INT_FILTER_FIELDS = {
        'package_count_min': 'package_count__gte',
        'package_count_max': 'package_count__lte',
    }

    def get(self, request, pk=None, action=None, **kwargs):
        if pk is None:
            return self._list(request)

        if action == 'packages':
            return self._packages(pk)

        return _distribution_response(pk)

    def post(self, request, pk=None, action=None, package_id=None):
        try:
            if pk is None:
                return self._create(request)

            if action == 'start':
                DistributionService.start(distribution_id=pk)
                return _distribution_response(pk)

            if action == 'complete':
                DistributionService.complete(distribution_id=pk)
                return _distribution_response(pk)

            if action == 'result':
                item = DistributionService.set_result(
                    distribution_id=pk,
                    package_id=package_id,
                    result=request.data.get('result'),
                )
                return Response(DistributionPackageSerializer(item).data)
        except ShipmentError as error:
            return Response({"detail": error.message}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST)

    def _create(self, request):
        serializer = DistributionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        distribution = DistributionService.create(
            branch_id=data['branch'].id,
            courier_id=data['courier'].id,
            vehicle_id=data['vehicle'].id,
            package_ids=data['package_ids'],
        )
        return _distribution_response(distribution.pk, status.HTTP_201_CREATED)

    def _list(self, request):
        try:
            queryset = apply_list_filters(
                distribution_queryset(), request,
                multi_fields=self.MULTI_FILTER_FIELDS,
                date_fields=self.DATE_FILTER_FIELDS,
                int_fields=self.INT_FILTER_FIELDS,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return paginate(request, queryset.order_by('-id'), DistributionSerializer)

    def _packages(self, pk):
        get_object_or_404(Distribution, pk=pk)
        items = DistributionPackage.objects.filter(distribution_id=pk).select_related('package').order_by('id')
        return Response(DistributionPackageSerializer(items, many=True).data)


class DistributionFilterOptionsView(APIView):
    """Values actually used by distributions, as {value, label}, for the list page's filter dropdowns."""

    # field -> (value lookup, label lookup)
    RELATED_FIELDS = {
        'branch': ('branch_id', 'branch__name'),
        'courier': ('courier_id', 'courier__name'),
        'vehicle': ('vehicle_id', 'vehicle__plate_number'),
    }

    def get(self, request):
        field = request.query_params.get('field')

        if field == 'status':
            used = set(Distribution.objects.values_list('status', flat=True).distinct())
            return Response([
                {'value': value, 'label': label}
                for value, label in Distribution.Status.choices if value in used
            ])

        if field not in self.RELATED_FIELDS:
            allowed = sorted([*self.RELATED_FIELDS, 'status'])
            return Response(
                {"detail": f"field must be one of: {', '.join(allowed)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        value_lookup, label_lookup = self.RELATED_FIELDS[field]
        rows = Distribution.objects.values(value_lookup, label_lookup).distinct().order_by(label_lookup, value_lookup)
        return Response([{'value': row[value_lookup], 'label': row[label_lookup]} for row in rows])


class DistributionEligiblePackagesView(APIView):
    """Packages that can be added to a new distribution from the given branch."""

    def get(self, request):
        try:
            branch_id = int(request.query_params.get('branch', ''))
        except ValueError:
            return Response({"detail": "branch must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        packages = eligible_packages(branch_id).order_by('id')
        return Response(PackageSerializer(packages, many=True).data)
