
from django.db import models


class Employee(models.Model):
    class Role(models.TextChoices):
        DRIVER = "DRIVER", "Şoför"
        COURIER = "COURIER", "Kurye"

    name = models.CharField(max_length=100)
    role = models.CharField(max_length=20, choices=Role.choices)

    def __str__(self):
        return self.name


class Branch(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Package(models.Model):
    class Status(models.TextChoices):
        AT_BRANCH = "AT_BRANCH", "Şubede"
        IN_TRANSIT = "IN_TRANSIT", "Yolda"
        OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Dağıtımda"
        DELIVERED = "DELIVERED", "Teslim Edildi"
        DELIVERY_FAILED = "DELIVERY_FAILED", "Teslim Edilemedi"

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.AT_BRANCH, db_index=True
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT
        #employee silmeye çalışırsan protectederror
    )

    origin_branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="origin_packages"
        # reverse relation
    )

    destination_branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="destination_packages"
    )

    desi = models.DecimalField(
        max_digits=6,
        decimal_places=2
    )
    current_branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="current_packages",
        null=True,
        blank=True
    )
    trip = models.ForeignKey(
        "Trip",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="packages"
    )

    recipient_name = models.CharField(max_length=100)

    recipient_phone = models.CharField(max_length=20)

    payment_type = models.CharField(max_length=20)

    tracking_number = models.CharField(
        max_length=13,
        unique=True,
    )


class Counter(models.Model):
    name = models.CharField(max_length=50, primary_key=True)
    value = models.BigIntegerField(default=0)


class Vehicle(models.Model):
    plate_number = models.CharField(max_length=20)
    capacity = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return self.plate_number


class Trip(models.Model):

    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planlandı"
        IN_TRANSIT = "IN_TRANSIT", "Yolda"
        COMPLETED = "COMPLETED", "Tamamlandı"

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.PROTECT
    )

    loaded_by = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT
    )

    origin_branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="trip_origins"
    )

    destination_branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="trip_destinations"
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED
    )

    loading_date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.origin_branch} → {self.destination_branch}"

    def can_load_packages(self):
        if self.status != Trip.Status.PLANNED:
            return False
        return True


class Distribution(models.Model):

    class Status(models.TextChoices):
        READY_TO_GO = "READY_TO_GO", "Dağıtıma Hazır"
        OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Dağıtımda"
        COMPLETED = "COMPLETED", "Tamamlandı"

    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="distributions"
    )

    courier = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="distributions"
    )

    vehicle = models.ForeignKey(
        Vehicle,
        on_delete=models.PROTECT,
        related_name="distributions"
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.READY_TO_GO
    )

    created_at = models.DateTimeField(auto_now_add=True)

    # "Dağıtıma Çıkma Tarihi"
    started_at = models.DateTimeField(null=True, blank=True)

    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Dağıtım #{self.pk} - {self.branch}"


class DistributionPackage(models.Model):

    class Result(models.TextChoices):
        PENDING = "PENDING", "Bekliyor"
        DELIVERED = "DELIVERED", "Teslim Edildi"
        FAILED = "FAILED", "Teslim Edilemedi"

    distribution = models.ForeignKey(
        Distribution,
        on_delete=models.PROTECT,
        related_name="items"
    )

    package = models.ForeignKey(
        Package,
        on_delete=models.PROTECT,
        related_name="distribution_items"
    )

    result = models.CharField(
        max_length=20,
        choices=Result.choices,
        default=Result.PENDING
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["distribution", "package"],
                name="unique_distribution_package",
            ),
        ]


class PackageHistory(models.Model):

    class Status(models.TextChoices):
        AT_BRANCH = "AT_BRANCH", "Şubeye Ulaştı"  # branch id dolu
        LEAVE_BRANCH = "LEAVE_BRANCH", "Şubeden Ayrıldı."  # branch id dolu
        IN_TRANSIT = "IN_TRANSIT", "Yolda"  # trip id dolu
        LEFT_TRANSIT = "LEFT_TRANSIT", "Sefer bitti"  # trip id dolu
        OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Dağıtıma Çıktı"
        DELIVERED = "DELIVERED", "Teslim Edildi"
        DELIVERY_FAILED = "DELIVERY_FAILED", "Teslim Edilemedi"

    package = models.ForeignKey(
        Package,
        on_delete=models.PROTECT,
        related_name="history"
    )

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        null=True,
        blank=True
    )

    trip = models.ForeignKey(
        Trip,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="package_histories",
    )

    distribution = models.ForeignKey(
        Distribution,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="package_histories",
    )

    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        null=True,
        related_name="package_histories"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices
    )

    def __str__(self):
        return f"{self.package} - {self.trip}"
