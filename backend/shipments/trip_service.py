from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .exceptions import ShipmentError
from .models import Package, PackageHistory, Trip
from .package_service import PackageService


class TripService:

    @staticmethod
    @transaction.atomic
    def start_trip(*, trip_id):
        trip = get_object_or_404(Trip.objects.select_for_update(), pk=trip_id)

        if trip.status != Trip.Status.PLANNED:
            raise ShipmentError(
                "Sadece planlanmış sefer yola çıkarılabilir.",
                code="trip_not_startable",
            )

        trip.status = Trip.Status.IN_TRANSIT
        trip.started_at = timezone.now()
        trip.save(update_fields=["status", "started_at"])

        history = []
        for package in trip.packages.select_for_update():
            PackageService._check_transition(package, Package.Status.IN_TRANSIT)
            departure_branch = package.current_branch

            package.current_branch = None
            package.status = Package.Status.IN_TRANSIT
            package.save(update_fields=["current_branch", "status"])

            history += [
                PackageHistory(package=package, branch=departure_branch,
                               status=PackageHistory.Status.LEAVE_BRANCH),
                PackageHistory(package=package, trip=trip,
                               status=PackageHistory.Status.IN_TRANSIT),
            ]
        PackageHistory.objects.bulk_create(history)

        return trip

    @staticmethod
    @transaction.atomic
    def arrive_trip(*, trip_id):
        trip = get_object_or_404(Trip.objects.select_for_update(), pk=trip_id)

        if trip.status != Trip.Status.IN_TRANSIT:
            raise ShipmentError(
                "Sadece yolda olan sefer varış yapabilir.",
                code="trip_not_arrivable",
            )

        trip.status = Trip.Status.COMPLETED
        trip.completed_at = timezone.now()
        trip.save(update_fields=["status", "completed_at"])

        for package in trip.packages.select_for_update():
            PackageService._check_transition(package, Package.Status.AT_BRANCH)
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
