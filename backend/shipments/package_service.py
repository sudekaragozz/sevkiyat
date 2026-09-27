from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404

from .exceptions import ShipmentError
from .models import Branch, Counter, Package, PackageHistory, Trip


VALID_TRANSITIONS = {
    Package.Status.AT_BRANCH: {
        Package.Status.IN_TRANSIT,
        Package.Status.OUT_FOR_DELIVERY,
    },
    Package.Status.IN_TRANSIT: {
        Package.Status.AT_BRANCH,
    },
    Package.Status.OUT_FOR_DELIVERY: {
        Package.Status.DELIVERED,
        Package.Status.DELIVERY_FAILED,
    },
    Package.Status.DELIVERY_FAILED: {
        Package.Status.OUT_FOR_DELIVERY,
        Package.Status.AT_BRANCH,
    },
    Package.Status.DELIVERED: set(),
}


class PackageService:

    @staticmethod
    def _generate_tracking_number():
        counter, _ = Counter.objects.select_for_update().get_or_create(name="package")
        counter.value += 1
        counter.save(update_fields=["value"])
        return f"PKG{counter.value:010d}"

    @staticmethod
    def _lock_package(package_id):
        return get_object_or_404(
            Package.objects.select_for_update(), pk=package_id
        )

    @staticmethod
    def _check_transition(package, new_status):
        allowed = VALID_TRANSITIONS.get(package.status, set())
        if new_status not in allowed:
            raise ShipmentError(
                f"{package.tracking_number}: "
                f"'{package.get_status_display()}' durumundan "
                f"'{Package.Status(new_status).label}' durumuna geçilemez."
            )

    @staticmethod
    def _check_capacity(trip, extra_desi):
        capacity = trip.vehicle.capacity
        loaded = trip.packages.aggregate(t=Sum("desi"))["t"] or Decimal("0")
        if loaded + extra_desi > capacity:
            raise ShipmentError(
                f"Kapasite aşımı: {trip.vehicle.plate_number} aracına "
                f"{loaded + extra_desi} desi yüklenmek isteniyor, "
                f"kapasite {capacity} desi.",
                code="capacity_exceeded",
            )


    @staticmethod
    @transaction.atomic
    def create_package(
        *,
        employee,
        origin_branch,
        destination_branch,
        desi,
        recipient_name,
        recipient_phone,
        payment_type,
    ):
        if origin_branch == destination_branch:
            raise ShipmentError("Çıkış ve varış şubesi aynı olamaz.")

        if desi <= 0:
            raise ShipmentError("Desi değeri sıfırdan büyük olmalı.")

        tracking_number = PackageService._generate_tracking_number()

        package = Package.objects.create(
            employee=employee,
            origin_branch=origin_branch,
            destination_branch=destination_branch,
            current_branch=origin_branch,
            desi=desi,
            recipient_name=recipient_name,
            recipient_phone=recipient_phone,
            payment_type=payment_type,
            status=Package.Status.AT_BRANCH,
            tracking_number=tracking_number,
        )

        PackageHistory.objects.create(
            package=package,
            branch=origin_branch,
            employee=employee,
            status=PackageHistory.Status.AT_BRANCH,
        )

        return package

    @transaction.atomic
    def load_to_trip(*, package_id, trip_id, employee_id):
        package = get_object_or_404(Package.objects.select_for_update(), pk=package_id)
        trip = get_object_or_404(Trip.objects.select_for_update(), pk=trip_id)

        if trip.status != Trip.Status.PLANNED:
            raise ShipmentError(
                f"Sefer yüklemeye kapalı (durum: {trip.get_status_display()}).",
                code="sefer_not_loadable",
            )

        if package.trip_id is not None:
            raise ShipmentError("Paket zaten bir seferde.", code="already_in_transit")

        if package.current_branch_id is None:
            raise ShipmentError("Paket herhangi bir şubede değil.", code="not_at_branch")

        if package.current_branch_id != trip.origin_branch_id:
            raise ShipmentError(
                f"Paket {package.current_branch} şubesinde, sefer {trip.origin_branch} "
                f"şubesinden kalkıyor.",
                code="branch_mismatch",
            )

        PackageService._check_capacity(trip, package.desi)

        PackageService._check_transition(package, Package.Status.IN_TRANSIT)

        departure_branch = package.current_branch
        package.trip = trip
        package.current_branch = None
        package.status = Package.Status.IN_TRANSIT
        package.save(update_fields=["trip", "current_branch", "status"])

        PackageHistory.objects.bulk_create([
            PackageHistory(
                package=package, branch=departure_branch, employee_id=employee_id,
                status=PackageHistory.Status.LEAVE_BRANCH,
            ),
            PackageHistory(
                package=package, trip=trip, employee_id=employee_id,
                status=PackageHistory.Status.IN_TRANSIT,
            ),
        ])

        return package


    @staticmethod
    @transaction.atomic
    def unload_from_trip(*, package_id, branch_id, employee_id):
        package = PackageService._lock_package(package_id)
        branch = get_object_or_404(Branch, pk=branch_id)

        PackageService._check_transition(package, Package.Status.AT_BRANCH)

        if package.trip_id is None:
            raise ShipmentError(
                f"{package.tracking_number} herhangi bir seferde değil."
            )

        trip = package.trip

        package.trip = None
        package.current_branch = branch
        package.status = Package.Status.AT_BRANCH
        package.save(update_fields=["trip", "current_branch", "status"])

        PackageHistory.objects.bulk_create([
            PackageHistory(
                package=package,
                trip=trip,
                employee_id=employee_id,
                status=PackageHistory.Status.LEFT_TRANSIT,
            ),
            PackageHistory(
                package=package,
                branch=branch,
                employee_id=employee_id,
                status=PackageHistory.Status.AT_BRANCH,
            ),
        ])

        return package


    @staticmethod
    @transaction.atomic
    def send_out_for_delivery(*, package_id, employee_id):
        package = PackageService._lock_package(package_id)

        PackageService._check_transition(package, Package.Status.OUT_FOR_DELIVERY)

        if package.current_branch_id != package.destination_branch_id:
            raise ShipmentError(
                f"Paket {package.current_branch} şubesinde, varış şubesi "
                f"{package.destination_branch}. Dağıtıma çıkarılamaz."
            )

        package.status = Package.Status.OUT_FOR_DELIVERY
        package.save(update_fields=["status"])

        PackageHistory.objects.create(
            package=package,
            branch=package.current_branch,
            employee_id=employee_id,
            status=PackageHistory.Status.OUT_FOR_DELIVERY,
        )

        return package


    @staticmethod
    @transaction.atomic
    def deliver(*, package_id, employee_id):
        package = PackageService._lock_package(package_id)

        PackageService._check_transition(package, Package.Status.DELIVERED)

        delivery_branch = package.current_branch

        package.status = Package.Status.DELIVERED
        package.current_branch = None
        package.save(update_fields=["status", "current_branch"])

        PackageHistory.objects.create(
            package=package,
            branch=delivery_branch,
            employee_id=employee_id,
            status=PackageHistory.Status.DELIVERED,
        )

        return package

    @staticmethod
    @transaction.atomic
    def mark_delivery_failed(*, package_id, employee_id):
        package = PackageService._lock_package(package_id)

        PackageService._check_transition(package, Package.Status.DELIVERY_FAILED)

        package.status = Package.Status.DELIVERY_FAILED
        package.save(update_fields=["status"])

        PackageHistory.objects.create(
            package=package,
            branch=package.current_branch,
            employee_id=employee_id,
            status=PackageHistory.Status.DELIVERY_FAILED,
        )

        return package
