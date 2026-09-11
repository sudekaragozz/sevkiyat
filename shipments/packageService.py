from django.db import transaction

from .models import Package, PackageHistory, Sefer


class PackageService:

    @staticmethod
    @transaction.atomic
    def create_package(validated_data):
        validated_data['current_branch'] = validated_data['origin_branch']

        package = Package.objects.create(**validated_data)

        PackageHistory.objects.create(
            package=package,
            sefer=None,
            branch=package.origin_branch,
            employee_id=validated_data['employee_id'],
            status=PackageHistory.Status.AT_BRANCH,
        )

        return package
    @staticmethod
    @transaction.atomic
    def sefere_cikart(id, validated_data):
        package = Package.objects.filter(id=id).first()

        sefer = Sefer.objects.filter(id=validated_data['sefer_id']).first()

        paket_yuklenebilir = sefer.paket_yuklenebilir_mi()

        if not paket_yuklenebilir:
            return False

        package.sefer = sefer
        package.current_branch = None

        PackageHistory.objects.create(
            package=package,
            sefer=sefer,
            status=PackageHistory.Status.IN_TRANSIT,
            employee_id=validated_data['employee_id'],
        )
