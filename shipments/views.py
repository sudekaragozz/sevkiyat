from rest_framework import viewsets
from .models import Branch, Employee, Package, Vehicle, Sefer
from .serializers import BranchSerializer, EmployeeSerializer, PackageSerializer, VehicleSerializer, SeferSerializer


class EmployeeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Employee.objects.all().order_by('name')
    serializer_class = EmployeeSerializer


class BranchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Branch.objects.all().order_by('name')
    serializer_class = BranchSerializer


class PackageViewSet(viewsets.ModelViewSet):
    queryset = Package.objects.all()
    serializer_class = PackageSerializer

class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer

class SeferViewSet(viewsets.ModelViewSet):
    queryset = Sefer.objects.all()
    serializer_class = SeferSerializer