from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .packageService import PackageService

from .models import Branch, Employee, Package, Vehicle, Sefer
from .serializers import (
    BranchSerializer,
    EmployeeSerializer,
    PackageSerializer,
    VehicleSerializer,
    SeferSerializer,
)
from .seferService import SeferService


class EmployeeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Employee.objects.all().order_by('name')
    serializer_class = EmployeeSerializer


class BranchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Branch.objects.all().order_by('name')
    serializer_class = BranchSerializer


class PackageViewSet(viewsets.ModelViewSet):
    queryset = Package.objects.all()
    serializer_class = PackageSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        package = PackageService.create_package(
            serializer.validated_data
        )

        return Response(
            self.get_serializer(package).data,
            status=status.HTTP_201_CREATED
        )


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer


class SeferViewSet(viewsets.ModelViewSet):
    queryset = Sefer.objects.all()
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
    #viewset