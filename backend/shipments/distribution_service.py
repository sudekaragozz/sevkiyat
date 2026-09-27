from decimal import Decimal

from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .exceptions import ShipmentError
from .models import Branch, Distribution, DistributionPackage, Employee, Package, Vehicle
from .package_service import PackageService


def eligible_packages(branch_id):
    """Packages waiting at their destination branch that are not in an unfinished distribution."""
    in_unfinished_distribution = DistributionPackage.objects.filter(
        package_id=OuterRef("pk"),
    ).exclude(distribution__status=Distribution.Status.COMPLETED)

    return Package.objects.filter(
        current_branch_id=branch_id,
        destination_branch_id=branch_id,
        status__in=[Package.Status.AT_BRANCH, Package.Status.DELIVERY_FAILED],
    ).exclude(Exists(in_unfinished_distribution))


class DistributionService:

    @staticmethod
    def _lock(distribution_id):
        return get_object_or_404(Distribution.objects.select_for_update(), pk=distribution_id)

    @staticmethod
    def _require_status(distribution, expected, message):
        if distribution.status != expected:
            raise ShipmentError(message, code="invalid_distribution_status")

    @staticmethod
    @transaction.atomic
    def create(*, branch_id, courier_id, vehicle_id, package_ids):
        branch = get_object_or_404(Branch, pk=branch_id)
        vehicle = get_object_or_404(Vehicle, pk=vehicle_id)
        courier = get_object_or_404(Employee, pk=courier_id)

        if courier.role != Employee.Role.COURIER:
            raise ShipmentError(f"{courier.name} kurye değil.", code="not_a_courier")

        package_ids = list(dict.fromkeys(package_ids))
        if not package_ids:
            raise ShipmentError("En az bir paket seçilmelidir.", code="no_packages")

        # Kilit, aynı paketin eşzamanlı iki dağıtıma eklenmesini engeller: ikinci istek
        # birincinin commit'ini bekler ve uygunluk kontrolünde paketi dolu görür.
        packages = list(
            Package.objects.select_for_update().filter(id__in=package_ids).order_by("id")
        )

        missing = set(package_ids) - {package.id for package in packages}
        if missing:
            raise ShipmentError(
                f"Paket bulunamadı: {', '.join(str(package_id) for package_id in sorted(missing))}",
                code="package_not_found",
            )

        eligible_ids = set(
            eligible_packages(branch.id).filter(id__in=package_ids).values_list("id", flat=True)
        )
        ineligible = [package.tracking_number for package in packages if package.id not in eligible_ids]
        if ineligible:
            raise ShipmentError(
                f"Dağıtıma uygun olmayan paketler: {', '.join(ineligible)}",
                code="package_not_eligible",
            )

        total_desi = sum((package.desi for package in packages), Decimal("0"))
        if total_desi > vehicle.capacity:
            raise ShipmentError(
                f"Kapasite aşımı: {vehicle.plate_number} aracına {total_desi} desi "
                f"yüklenmek isteniyor, kapasite {vehicle.capacity} desi.",
                code="capacity_exceeded",
            )

        distribution = Distribution.objects.create(branch=branch, courier=courier, vehicle=vehicle)
        DistributionPackage.objects.bulk_create([
            DistributionPackage(distribution=distribution, package=package)
            for package in packages
        ])
        return distribution

    @staticmethod
    @transaction.atomic
    def start(*, distribution_id):
        distribution = DistributionService._lock(distribution_id)
        DistributionService._require_status(
            distribution,
            Distribution.Status.READY_TO_GO,
            "Sadece dağıtıma hazır bir dağıtım yola çıkarılabilir.",
        )

        # send_out_for_delivery geçiş kuralını ve paketin varış şubesinde olduğunu kontrol eder;
        # herhangi bir paket uygun değilse hata tüm işlemi geri alır.
        for item in distribution.items.order_by("package_id"):
            PackageService.send_out_for_delivery(
                package_id=item.package_id,
                employee_id=distribution.courier_id,
                distribution=distribution,
            )

        distribution.status = Distribution.Status.OUT_FOR_DELIVERY
        distribution.started_at = timezone.now()
        distribution.save(update_fields=["status", "started_at"])
        return distribution

    @staticmethod
    @transaction.atomic
    def set_result(*, distribution_id, package_id, result):
        if result not in (DistributionPackage.Result.DELIVERED, DistributionPackage.Result.FAILED):
            raise ShipmentError("result DELIVERED veya FAILED olmalı.", code="invalid_result")

        distribution = DistributionService._lock(distribution_id)
        DistributionService._require_status(
            distribution,
            Distribution.Status.OUT_FOR_DELIVERY,
            "Teslim sonucu yalnızca dağıtımdaki bir dağıtım için girilebilir.",
        )

        item = get_object_or_404(
            DistributionPackage.objects.select_for_update().select_related("package"),
            distribution=distribution,
            package_id=package_id,
        )
        if item.result != DistributionPackage.Result.PENDING:
            raise ShipmentError(
                f"{item.package.tracking_number} için sonuç zaten girildi.",
                code="result_already_set",
            )

        mark = (
            PackageService.deliver
            if result == DistributionPackage.Result.DELIVERED
            else PackageService.mark_delivery_failed
        )
        mark(package_id=package_id, employee_id=distribution.courier_id, distribution=distribution)

        item.result = result
        item.save(update_fields=["result"])
        return item

    @staticmethod
    @transaction.atomic
    def complete(*, distribution_id):
        distribution = DistributionService._lock(distribution_id)
        DistributionService._require_status(
            distribution,
            Distribution.Status.OUT_FOR_DELIVERY,
            "Sadece dağıtımdaki bir dağıtım sonlandırılabilir.",
        )

        pending_items = distribution.items.select_for_update().filter(
            result=DistributionPackage.Result.PENDING,
        ).order_by("package_id")
        for item in pending_items:
            PackageService.mark_delivery_failed(
                package_id=item.package_id,
                employee_id=distribution.courier_id,
                distribution=distribution,
            )
            item.result = DistributionPackage.Result.FAILED
            item.save(update_fields=["result"])

        distribution.status = Distribution.Status.COMPLETED
        distribution.completed_at = timezone.now()
        distribution.save(update_fields=["status", "completed_at"])
        return distribution
