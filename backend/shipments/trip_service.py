from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404

from .models import Package, PackageHistory, Trip


class TripService:

    @staticmethod
    @transaction.atomic
    def start_trip(*, trip_id):
        trip = get_object_or_404(Trip.objects.select_for_update(), pk=trip_id)

        if trip.status != Trip.Status.PLANNED:
            raise ValidationError(
                "Sadece planlanmış sefer yola çıkarılabilir."
            )

        trip.status = Trip.Status.IN_TRANSIT
        trip.save(update_fields=["status"])

        for package in trip.packages.all():
            package.current_branch = None
            package.save(update_fields=["current_branch"])

            PackageHistory.objects.create(
                package=package,
                trip=trip,
                status=PackageHistory.Status.IN_TRANSIT,
            )

        return trip

    @staticmethod
    @transaction.atomic
    def arrive_trip(*, trip_id):
        trip = get_object_or_404(Trip.objects.select_for_update(), pk=trip_id)

        if trip.status != Trip.Status.IN_TRANSIT:
            raise ValidationError(
                "Sadece yolda olan sefer varış yapabilir."
            )

        trip.status = Trip.Status.COMPLETED
        trip.save(update_fields=["status"])

        for package in trip.packages.all():
            package.current_branch = trip.destination_branch
            package.trip = None
            package.status = Package.Status.AT_BRANCH
            package.save(update_fields=["current_branch", "trip", "status"])

            PackageHistory.objects.create(
                package=package,
                branch=trip.destination_branch,
                trip=trip,
                status=PackageHistory.Status.AT_BRANCH,
            )
        return trip
