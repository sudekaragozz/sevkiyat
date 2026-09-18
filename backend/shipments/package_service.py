from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404

from .exceptions import SevkiyatError
from .models import Branch, Counter,  Package, PackageHistory, Sefer


# Bir paket hangi durumdan hangi durumlara geçebilir.
# Geçersiz geçişler tek yerden engellenir, servislere dağılmaz.
GECERLI_GECISLER = {
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

    # ---------------------------------------------------------------- yardımcı
    @staticmethod
    def _tracking_number_uret():
        counter, _ = Counter.objects.select_for_update().get_or_create(name="package")
        counter.value += 1
        counter.save(update_fields=["value"])
        return f"PKG{counter.value:010d}"

    @staticmethod
    def _kilitle(package_id):
        return get_object_or_404(
            Package.objects.select_for_update(), pk=package_id
        )

    @staticmethod
    def _gecis_kontrol(package, yeni_status):
        izinli = GECERLI_GECISLER.get(package.status, set())
        if yeni_status not in izinli:
            raise SevkiyatError(
                f"{package.tracking_number}: "
                f"'{package.get_status_display()}' durumundan "
                f"'{Package.Status(yeni_status).label}' durumuna geçilemez."
            )

    @staticmethod
    def _kapasite_kontrol(sefer, eklenecek_desi):
        kapasite = sefer.vehicle.capacity
        yuklu = sefer.packages.aggregate(t=Sum("desi"))["t"] or Decimal("0")
        if yuklu + eklenecek_desi > kapasite:
            raise SevkiyatError(
                f"Kapasite aşımı: {sefer.vehicle.plate_number} aracına "
                f"{yuklu + eklenecek_desi} desi yüklenmek isteniyor, "
                f"kapasite {kapasite} desi."
            )

    # ------------------------------------------------------------------ kabul

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
            raise SevkiyatError("Çıkış ve varış şubesi aynı olamaz.")

        if desi <= 0:
            raise SevkiyatError("Desi değeri sıfırdan büyük olmalı.")

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
            tracking_number=PackageService._tracking_number_uret(),
        )

        PackageHistory.objects.create(
            package=package,
            branch=origin_branch,
            employee=employee,
            status=PackageHistory.Status.AT_BRANCH,
        )

        return package

    # ------------------------------------------------------------ sefere yükle

    @transaction.atomic
    def sefere_cikart(*, package_id, sefer_id, employee_id):
        package = get_object_or_404(Package.objects.select_for_update(), pk=package_id)
        sefer = get_object_or_404(Sefer.objects.select_for_update(), pk=sefer_id)

        if sefer.status != Sefer.Status.PLANNED:
            raise SevkiyatError(
                f"Sefer yüklemeye kapalı (durum: {sefer.get_status_display()}).",
                code="sefer_not_loadable",
            )

        if package.sefer_id is not None:
            raise SevkiyatError("Paket zaten bir seferde.", code="already_in_transit")

        if package.current_branch_id is None:
            raise SevkiyatError("Paket herhangi bir şubede değil.", code="not_at_branch")

        if package.current_branch_id != sefer.origin_branch_id:
            raise SevkiyatError(
                f"Paket {package.current_branch} şubesinde, sefer {sefer.origin_branch} "
                f"şubesinden kalkıyor.",
                code="branch_mismatch",
            )

        kapasite = sefer.vehicle.capacity
        yuklu = sefer.packages.aggregate(t=Sum("desi"))["t"] or Decimal("0")
        if yuklu + package.desi > kapasite:
            raise SevkiyatError(
                f"Kapasite aşımı: {yuklu + package.desi} / {kapasite} desi.",
                code="capacity_exceeded",
            )

        PackageService._gecis_kontrol(package, Package.Status.IN_TRANSIT)

        cikis_subesi = package.current_branch
        package.sefer = sefer
        package.current_branch = None
        package.status = Package.Status.IN_TRANSIT
        package.save(update_fields=["sefer", "current_branch", "status"])

        PackageHistory.objects.bulk_create([
            PackageHistory(
                package=package, branch=cikis_subesi, employee_id=employee_id,
                status=PackageHistory.Status.LEAVE_BRANCH,
            ),
            PackageHistory(
                package=package, sefer=sefer, employee_id=employee_id,
                status=PackageHistory.Status.IN_TRANSIT,
            ),
        ])

        return package

    # ----------------------------------------------------------- seferden indir

    @staticmethod
    @transaction.atomic
    def seferden_indir(*, package_id, branch_id, employee_id):
        package = PackageService._kilitle(package_id)
        branch = get_object_or_404(Branch, pk=branch_id)

        PackageService._gecis_kontrol(package, Package.Status.AT_BRANCH)

        if package.sefer_id is None:
            raise SevkiyatError(
                f"{package.tracking_number} herhangi bir seferde değil."
            )

        sefer = package.sefer

        package.sefer = None
        package.current_branch = branch
        package.status = Package.Status.AT_BRANCH
        package.save(update_fields=["sefer", "current_branch", "status"])

        PackageHistory.objects.bulk_create([
            PackageHistory(
                package=package,
                sefer=sefer,
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

    # --------------------------------------------------------- dağıtıma çıkart

    @staticmethod
    @transaction.atomic
    def dagitima_cikart(*, package_id, employee_id):
        package = PackageService._kilitle(package_id)

        PackageService._gecis_kontrol(package, Package.Status.OUT_FOR_DELIVERY)

        if package.current_branch_id != package.destination_branch_id:
            raise SevkiyatError(
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

    # ---------------------------------------------------------------- teslimat

    @staticmethod
    @transaction.atomic
    def teslim_et(*, package_id, employee_id):
        package = PackageService._kilitle(package_id)

        PackageService._gecis_kontrol(package, Package.Status.DELIVERED)

        teslim_subesi = package.current_branch

        package.status = Package.Status.DELIVERED
        package.current_branch = None
        package.save(update_fields=["status", "current_branch"])

        PackageHistory.objects.create(
            package=package,
            branch=teslim_subesi,
            employee_id=employee_id,
            status=PackageHistory.Status.DELIVERED,
        )

        return package

    @staticmethod
    @transaction.atomic
    def teslim_edilemedi(*, package_id, employee_id):
        package = PackageService._kilitle(package_id)

        PackageService._gecis_kontrol(package, Package.Status.DELIVERY_FAILED)

        package.status = Package.Status.DELIVERY_FAILED
        package.save(update_fields=["status"])

        PackageHistory.objects.create(
            package=package,
            branch=package.current_branch,
            employee_id=employee_id,
            status=PackageHistory.Status.DELIVERY_FAILED,
        )

        return package