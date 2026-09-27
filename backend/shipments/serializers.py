from rest_framework import serializers
from .models import Branch, Employee, Package, PackageHistory, Trip, Vehicle


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
            'trip',
            'branch',
            'employee',
            'status',
            'created_at',
        ]


class PackageSerializer(serializers.ModelSerializer):
    # Annotated by PackageViewset from the first/last PackageHistory rows; null elsewhere.
    created_at = serializers.DateTimeField(read_only=True, allow_null=True)
    last_movement_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = Package
        fields = [
            'id',
            'employee',
            'origin_branch',
            'destination_branch',
            'current_branch',
            'trip',
            'recipient_name',
            'recipient_phone',
            'desi',
            'payment_type',
            'tracking_number',
            'status',
            'created_at',
            'last_movement_at',
        ]
        read_only_fields = ['tracking_number','status']


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ['id', 'plate_number', 'capacity']


class TripSerializer(serializers.ModelSerializer):

    package_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Trip
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
