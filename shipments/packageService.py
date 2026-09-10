from django.db import transaction

from .models import Package, PackageHistory


class PackageService:

    @staticmethod
    @transaction.atomic
    def create_package(validated_data):

        history_data = validated_data.pop('history')

        validated_data['current_branch'] = validated_data['origin_branch']

        package = Package.objects.create(**validated_data)

        for history in history_data:
            PackageHistory.objects.create(
                package=package,
                **history
            )

        return package