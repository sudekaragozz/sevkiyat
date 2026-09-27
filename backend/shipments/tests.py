from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APITestCase

from .distribution_service import DistributionService, eligible_packages
from .exceptions import ShipmentError
from .models import (
    Branch,
    Distribution,
    DistributionPackage,
    Employee,
    Package,
    PackageHistory,
    Vehicle,
)


class DistributionFixtures:

    def setup_fixtures(self):
        self.origin = Branch.objects.create(name="Ankara")
        self.branch = Branch.objects.create(name="İzmir")
        self.courier = Employee.objects.create(name="Kurye Ali", role=Employee.Role.COURIER)
        self.driver = Employee.objects.create(name="Şoför Veli", role=Employee.Role.DRIVER)
        self.vehicle = Vehicle.objects.create(plate_number="35 ABC 01", capacity=Decimal("10"))
        self._package_counter = 0

    def make_package(self, *, desi="2", status=Package.Status.AT_BRANCH, current_branch="default", destination=None):
        self._package_counter += 1
        return Package.objects.create(
            employee=self.driver,
            origin_branch=self.origin,
            destination_branch=destination or self.branch,
            current_branch=self.branch if current_branch == "default" else current_branch,
            desi=Decimal(desi),
            recipient_name=f"Alıcı {self._package_counter}",
            recipient_phone="5550000000",
            payment_type="Alıcı Ödemeli",
            status=status,
            tracking_number=f"TST{self._package_counter:010d}",
        )

    def create_distribution(self, packages, **overrides):
        kwargs = {
            "branch_id": self.branch.id,
            "courier_id": self.courier.id,
            "vehicle_id": self.vehicle.id,
            "package_ids": [package.id for package in packages],
        }
        kwargs.update(overrides)
        return DistributionService.create(**kwargs)


class EligiblePackagesTests(DistributionFixtures, TestCase):

    def setUp(self):
        self.setup_fixtures()

    def eligible_ids(self):
        return set(eligible_packages(self.branch.id).values_list("id", flat=True))

    def test_includes_waiting_and_failed_packages_at_destination(self):
        waiting = self.make_package()
        failed = self.make_package(status=Package.Status.DELIVERY_FAILED)
        self.make_package(current_branch=self.origin)                      # başka şubede
        self.make_package(destination=self.origin)                         # varışı başka şube
        self.make_package(status=Package.Status.DELIVERED, current_branch=None)

        self.assertEqual(self.eligible_ids(), {waiting.id, failed.id})

    def test_excludes_packages_in_unfinished_distribution_only(self):
        package = self.make_package()
        distribution = self.create_distribution([package])
        self.assertNotIn(package.id, self.eligible_ids())

        Distribution.objects.filter(pk=distribution.pk).update(status=Distribution.Status.COMPLETED)
        self.assertIn(package.id, self.eligible_ids())


class DistributionCreateTests(DistributionFixtures, TestCase):

    def setUp(self):
        self.setup_fixtures()

    def test_create_saves_ready_distribution_without_history(self):
        first, second = self.make_package(), self.make_package()

        distribution = self.create_distribution([first, second])

        self.assertEqual(distribution.status, Distribution.Status.READY_TO_GO)
        self.assertIsNone(distribution.started_at)
        self.assertEqual(
            list(distribution.items.order_by("package_id").values_list("package_id", "result")),
            [(first.id, "PENDING"), (second.id, "PENDING")],
        )
        self.assertFalse(PackageHistory.objects.filter(distribution=distribution).exists())
        first.refresh_from_db()
        self.assertEqual(first.status, Package.Status.AT_BRANCH)

    def test_create_rejects_non_courier(self):
        package = self.make_package()
        with self.assertRaises(ShipmentError):
            self.create_distribution([package], courier_id=self.driver.id)
        self.assertEqual(Distribution.objects.count(), 0)

    def test_create_rejects_empty_package_list(self):
        with self.assertRaises(ShipmentError):
            self.create_distribution([])

    def test_create_rejects_unknown_package(self):
        with self.assertRaises(ShipmentError) as ctx:
            self.create_distribution([], package_ids=[999999])
        self.assertEqual(ctx.exception.code, "package_not_found")

    def test_create_ignores_duplicate_ids(self):
        package = self.make_package()
        distribution = self.create_distribution([], package_ids=[package.id, package.id])
        self.assertEqual(distribution.items.count(), 1)

    def test_create_rejects_over_capacity(self):
        packages = [self.make_package(desi="6"), self.make_package(desi="5")]
        with self.assertRaises(ShipmentError) as ctx:
            self.create_distribution(packages)
        self.assertEqual(ctx.exception.code, "capacity_exceeded")
        self.assertEqual(Distribution.objects.count(), 0)

    def test_create_accepts_exact_capacity(self):
        packages = [self.make_package(desi="6"), self.make_package(desi="4")]
        distribution = self.create_distribution(packages)
        self.assertEqual(distribution.items.count(), 2)

    def test_create_rejects_ineligible_package(self):
        elsewhere = self.make_package(current_branch=self.origin)
        with self.assertRaises(ShipmentError) as ctx:
            self.create_distribution([elsewhere])
        self.assertIn(elsewhere.tracking_number, ctx.exception.message)

    def test_create_rejects_package_in_active_distribution(self):
        package = self.make_package()
        self.create_distribution([package])
        with self.assertRaises(ShipmentError):
            self.create_distribution([package])
        self.assertEqual(Distribution.objects.count(), 1)


class DistributionStartTests(DistributionFixtures, TestCase):

    def setUp(self):
        self.setup_fixtures()

    def test_start_sends_packages_out_with_history(self):
        package = self.make_package()
        distribution = self.create_distribution([package])

        DistributionService.start(distribution_id=distribution.id)

        distribution.refresh_from_db()
        package.refresh_from_db()
        self.assertEqual(distribution.status, Distribution.Status.OUT_FOR_DELIVERY)
        self.assertIsNotNone(distribution.started_at)
        self.assertEqual(package.status, Package.Status.OUT_FOR_DELIVERY)
        history = PackageHistory.objects.get(package=package, distribution=distribution)
        self.assertEqual(history.status, PackageHistory.Status.OUT_FOR_DELIVERY)
        self.assertEqual(history.employee_id, self.courier.id)
        self.assertEqual(history.branch_id, self.branch.id)

    def test_start_rejects_already_started(self):
        distribution = self.create_distribution([self.make_package()])
        DistributionService.start(distribution_id=distribution.id)
        with self.assertRaises(ShipmentError):
            DistributionService.start(distribution_id=distribution.id)

    def test_start_rolls_back_when_a_package_is_no_longer_available(self):
        first, second = self.make_package(), self.make_package()
        distribution = self.create_distribution([first, second])
        # Paket bu arada bir sefere yüklenmiş gibi.
        Package.objects.filter(pk=second.pk).update(status=Package.Status.IN_TRANSIT, current_branch=None)

        with self.assertRaises(ShipmentError):
            DistributionService.start(distribution_id=distribution.id)

        distribution.refresh_from_db()
        first.refresh_from_db()
        self.assertEqual(distribution.status, Distribution.Status.READY_TO_GO)
        self.assertEqual(first.status, Package.Status.AT_BRANCH)
        self.assertFalse(PackageHistory.objects.filter(distribution=distribution).exists())


class DistributionResultTests(DistributionFixtures, TestCase):

    def setUp(self):
        self.setup_fixtures()
        self.package = self.make_package()
        self.distribution = self.create_distribution([self.package])

    def start(self):
        DistributionService.start(distribution_id=self.distribution.id)

    def set_result(self, result):
        return DistributionService.set_result(
            distribution_id=self.distribution.id, package_id=self.package.id, result=result,
        )

    def test_delivered(self):
        self.start()
        item = self.set_result("DELIVERED")

        self.assertEqual(item.result, DistributionPackage.Result.DELIVERED)
        self.package.refresh_from_db()
        self.assertEqual(self.package.status, Package.Status.DELIVERED)
        self.assertIsNone(self.package.current_branch_id)
        self.assertTrue(PackageHistory.objects.filter(
            package=self.package, distribution=self.distribution,
            status=PackageHistory.Status.DELIVERED, employee=self.courier,
        ).exists())

    def test_failed(self):
        self.start()
        item = self.set_result("FAILED")

        self.assertEqual(item.result, DistributionPackage.Result.FAILED)
        self.package.refresh_from_db()
        self.assertEqual(self.package.status, Package.Status.DELIVERY_FAILED)
        self.assertEqual(self.package.current_branch_id, self.branch.id)
        self.assertTrue(PackageHistory.objects.filter(
            package=self.package, distribution=self.distribution,
            status=PackageHistory.Status.DELIVERY_FAILED,
        ).exists())

    def test_set_result_rejects_second_mark(self):
        self.start()
        self.set_result("DELIVERED")
        with self.assertRaises(ShipmentError):
            self.set_result("FAILED")
        self.assertEqual(PackageHistory.objects.filter(
            package=self.package, distribution=self.distribution,
        ).exclude(status=PackageHistory.Status.OUT_FOR_DELIVERY).count(), 1)

    def test_set_result_rejects_invalid_or_missing_result(self):
        self.start()
        for result in ("LOST", None, "PENDING"):
            with self.assertRaises(ShipmentError):
                self.set_result(result)

    def test_set_result_requires_out_for_delivery(self):
        with self.assertRaises(ShipmentError):
            self.set_result("DELIVERED")


class DistributionCompleteTests(DistributionFixtures, TestCase):

    def setUp(self):
        self.setup_fixtures()

    def test_complete_marks_pending_packages_failed(self):
        delivered, pending = self.make_package(), self.make_package()
        distribution = self.create_distribution([delivered, pending])
        DistributionService.start(distribution_id=distribution.id)
        DistributionService.set_result(distribution_id=distribution.id, package_id=delivered.id, result="DELIVERED")

        DistributionService.complete(distribution_id=distribution.id)

        distribution.refresh_from_db()
        pending.refresh_from_db()
        self.assertEqual(distribution.status, Distribution.Status.COMPLETED)
        self.assertIsNotNone(distribution.completed_at)
        self.assertEqual(
            dict(distribution.items.values_list("package_id", "result")),
            {delivered.id: "DELIVERED", pending.id: "FAILED"},
        )
        self.assertEqual(pending.status, Package.Status.DELIVERY_FAILED)
        self.assertTrue(PackageHistory.objects.filter(
            package=pending, distribution=distribution, status=PackageHistory.Status.DELIVERY_FAILED,
        ).exists())
        self.assertFalse(PackageHistory.objects.filter(
            package=delivered, status=PackageHistory.Status.DELIVERY_FAILED,
        ).exists())

    def test_complete_requires_out_for_delivery(self):
        distribution = self.create_distribution([self.make_package()])
        with self.assertRaises(ShipmentError):
            DistributionService.complete(distribution_id=distribution.id)

    def test_failed_package_can_join_a_new_distribution(self):
        package = self.make_package()
        first = self.create_distribution([package])
        DistributionService.start(distribution_id=first.id)
        DistributionService.complete(distribution_id=first.id)

        second = self.create_distribution([package])

        self.assertEqual(second.items.count(), 1)
        self.assertEqual(first.items.get().result, DistributionPackage.Result.FAILED)


class DistributionApiTests(DistributionFixtures, APITestCase):

    def setUp(self):
        self.setup_fixtures()

    def test_create_returns_distribution_with_package_count(self):
        package = self.make_package()

        response = self.client.post("/api/distributions/", {
            "branch": self.branch.id,
            "courier": self.courier.id,
            "vehicle": self.vehicle.id,
            "package_ids": [package.id],
        }, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "READY_TO_GO")
        self.assertEqual(response.data["package_count"], 1)
        self.assertIsNone(response.data["started_at"])

    def test_create_business_error_is_400_with_detail(self):
        package = self.make_package()

        response = self.client.post("/api/distributions/", {
            "branch": self.branch.id,
            "courier": self.driver.id,
            "vehicle": self.vehicle.id,
            "package_ids": [package.id],
        }, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("kurye değil", response.data["detail"])

    def test_create_requires_package_ids(self):
        response = self.client.post("/api/distributions/", {
            "branch": self.branch.id,
            "courier": self.courier.id,
            "vehicle": self.vehicle.id,
            "package_ids": [],
        }, format="json")

        self.assertEqual(response.status_code, 400)

    def test_list_is_paginated_and_filters_by_status(self):
        self.create_distribution([self.make_package()])

        response = self.client.get("/api/distributions/?page_number=1&page_size=20&status=READY_TO_GO")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["package_count"], 1)

        response = self.client.get("/api/distributions/?page_number=1&page_size=20&status=COMPLETED")
        self.assertEqual(response.data["count"], 0)

    def test_filter_options_lists_used_statuses(self):
        self.create_distribution([self.make_package()])

        response = self.client.get("/api/distributions/filter-options/?field=status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [{"value": "READY_TO_GO", "label": "Dağıtıma Hazır"}])

    def test_eligible_packages_requires_branch(self):
        response = self.client.get("/api/distributions/eligible-packages/")
        self.assertEqual(response.status_code, 400)

    def test_eligible_packages_lists_packages(self):
        package = self.make_package()
        response = self.client.get(f"/api/distributions/eligible-packages/?branch={self.branch.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [package.id])

    def test_packages_endpoint_includes_result(self):
        package = self.make_package()
        distribution = self.create_distribution([package])

        response = self.client.get(f"/api/distributions/{distribution.id}/packages/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], package.id)
        self.assertEqual(response.data[0]["tracking_number"], package.tracking_number)
        self.assertEqual(response.data[0]["result"], "PENDING")

    def test_start_result_and_complete_flow(self):
        delivered, pending = self.make_package(), self.make_package()
        distribution = self.create_distribution([delivered, pending])
        base = f"/api/distributions/{distribution.id}"

        response = self.client.post(f"{base}/start/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "OUT_FOR_DELIVERY")

        response = self.client.post(f"{base}/packages/{delivered.id}/result/", {"result": "DELIVERED"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"], "DELIVERED")

        response = self.client.post(f"{base}/complete/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "COMPLETED")

    def test_result_endpoint_rejects_invalid_result(self):
        package = self.make_package()
        distribution = self.create_distribution([package])
        self.client.post(f"/api/distributions/{distribution.id}/start/")

        response = self.client.post(
            f"/api/distributions/{distribution.id}/packages/{package.id}/result/",
            {"result": "LOST"}, format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_complete_on_ready_distribution_is_400(self):
        distribution = self.create_distribution([self.make_package()])
        response = self.client.post(f"/api/distributions/{distribution.id}/complete/")
        self.assertEqual(response.status_code, 400)

    def test_unknown_distribution_is_404(self):
        self.assertEqual(self.client.get("/api/distributions/999999/").status_code, 404)
        self.assertEqual(self.client.post("/api/distributions/999999/start/").status_code, 404)
