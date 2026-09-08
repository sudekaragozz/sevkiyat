from rest_framework import serializers
from .models import Branch, Employee, Package, Vehicle, Sefer


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ['id', 'name']


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ['id', 'name']


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

    def create(self, validated_data):
            validated_data['current_branch'] = validated_data['origin_branch']
            return Package.objects.create(**validated_data)

class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ['id', 'plate_number', 'capacity']


class SeferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sefer
        fields = [
            'id',
            'vehicle',
            'loaded_by',
            'origin_branch',
            'destination_branch',
            'previous_sefer',
            'status',
            'loading_date',
        ]

        read_only_fields = ['loading_date']
