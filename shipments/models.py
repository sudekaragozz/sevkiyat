from random import choices

from django.db import models


class Employee(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

class Branch(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

class Package(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT
        #bak
    )

    origin_branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="origin_packages"
        #bak
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
        #bak
    )
    sefer = models.ForeignKey(
        "Sefer",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="packages"
    )

    recipient_name = models.CharField(max_length=100)

    recipient_phone = models.CharField( max_length=20)

    payment_type = models.CharField( max_length=20)

    tracking_number = models.CharField(
        max_length=13,
        unique=True,
    )


    def save(self, *args, **kwargs):
        if not self.tracking_number:
            last_package = Package.objects.order_by('-id').first()

            if last_package:
                last_number = int(last_package.tracking_number[3:])
                next_number = last_number + 1
            else:
                next_number = 1

            self.tracking_number = f"PKG{next_number:010d}"

        super().save(*args, **kwargs)
        #bak

    def __str__(self):
        return self.tracking_number or f"Package {self.id}"

class Vehicle(models.Model):
        plate_number = models.CharField(max_length=20)
        capacity = models.DecimalField(max_digits=10, decimal_places=2)

        def __str__(self):
            return self.plate_number

class Sefer(models.Model):

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
    previous_sefer = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="next_seferler"
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED
    )

    loading_date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.origin_branch} → {self.destination_branch}"

    def paket_yuklenebilir_mi(self):
        if self.status != Sefer.Status.PLANNED:
            return False
        return True


class PackageHistory(models.Model):

    class Status(models.TextChoices):
        AT_BRANCH = "AT_BRANCH", "Şubeye Ulaştı" # branch id dolu
        LEAVE_BRANCH = "LEAVE_BRANCH", "Şubeden Ayrıldı." # branch id dolu
        IN_TRANSIT = "IN_TRANSIT", "Yolda" # sefer id dolu
        LEFT_TRANSIT = "LEFT_TRANSIT", "Sefer bitti" # sefer id dolu
        OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Dağıtıma Çıktı" #
        DELIVERED = "DELIVERED", "Teslim Edildi"

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

    sefer = models.ForeignKey(
        Sefer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="package_histories",
    )

    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        null=True,
        related_name="dfsifdskfdsğ"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    #bak add

    status = models.CharField(
        max_length=20,
        choices=Status.choices
    )

    def __str__(self):
        return f"{self.package} - {self.sefer}"
