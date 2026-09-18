from rest_framework import serializers
from .models import Branch, Employee, Package, Vehicle, Sefer, PackageHistory


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ['id', 'name', 'role']


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ['id', 'name']


class PackageHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PackageHistory
        fields = [
            'id',
            'package',
            'sefer',
            'branch',
            'employee',
            'status',
            'created_at',
        ]


class PackageSerializer(serializers.ModelSerializer):

    class Meta:
        model = Package
        fields = [
            'id',
            'employee',
            'origin_branch',
            'destination_branch',
            'current_branch',
            'sefer',
            'recipient_name',
            'recipient_phone',
            'desi',
            'payment_type',
            'tracking_number',
        ]
        read_only_fields = ['tracking_number']


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ['id', 'plate_number', 'capacity']


class SeferSerializer(serializers.ModelSerializer):

    package_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Sefer
        fields = [
            'id',
            'vehicle',
            'loaded_by',
            'origin_branch',
            'destination_branch',
            'status',
            'loading_date',
            'package_count',
        ]
        read_only_fields = ['loading_date']
