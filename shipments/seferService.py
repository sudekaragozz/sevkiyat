from django.core.exceptions import ValidationError

from django.db import transaction
from .models import Sefer, PackageHistory


class SeferService:

    @staticmethod
    def start_sefer(sefer):
        if sefer.status != Sefer.Status.PLANNED:
            raise ValidationError(
                "Sadece planlanmış sefer yola çıkarılabilir."
            )

        sefer.status = Sefer.Status.IN_TRANSIT
        sefer.save(update_fields=["status"])

        for package in sefer.packages.all():
            package.current_branch = None
            package.save(update_fields=["current_branch"])

            PackageHistory.objects.create(
                package=package,
                sefer=sefer,
                origin_branch=sefer.origin_branch,
                destination_branch=sefer.destination_branch,
                sequence_no=package.history.count() + 1,
                status=PackageHistory.Status.IN_TRANSIT
            )

        return sefer

    @staticmethod
    def arrive_sefer(sefer):
        if sefer.status != Sefer.Status.IN_TRANSIT:
            raise ValidationError(
                "Sadece yolda olan sefer varış yapabilir."
            )

        sefer.status = Sefer.Status.ARRIVED
        sefer.save(update_fields=["status"])

        for package in sefer.packages.all():
            package.current_branch = sefer.destination_branch
            package.save(update_fields=["current_branch"])

            history = package.history.filter(
                sefer=sefer
            ).last()

            if history:
                history.status = PackageHistory.Status.AT_BRANCH
                history.save(update_fields=["status"])

        return sefer

    @staticmethod
    def create_next_sefer(
        previous_sefer,
        vehicle,
        loaded_by,
        destination_branch
    ):
        if previous_sefer.status != Sefer.Status.ARRIVED:
            raise ValidationError(
                "Önceki sefer varış yapmadan yeni sefer oluşturulamaz."
            )

        return Sefer.objects.create(
            vehicle=vehicle,
            loaded_by=loaded_by,
            origin_branch=previous_sefer.destination_branch,
            destination_branch=destination_branch,
            previous_sefer=previous_sefer,
        )
    #@staticmetot
