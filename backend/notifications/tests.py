from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from .gateways import ConsoleSmsGateway, SmsError, get_sms_gateway
from .models import Notification
from .phone import normalize_tr_mobile
from .service import NotificationService


class FakeSmsGateway:

    def __init__(self, fail=False):
        self.fail = fail
        self.sent = []

    def send(self, phone, message):
        if self.fail:
            raise SmsError("Sağlayıcı hatası")
        self.sent.append((phone, message))
        return "fake-id"


class PhoneNormalizationTests(SimpleTestCase):

    def test_accepts_common_tr_mobile_formats(self):
        for value in [
            "5321234567",
            "05321234567",
            "0532 123 45 67",
            "(0532) 123-45-67",
            "+90 532 123 45 67",
            "0090 532 123 45 67",
        ]:
            with self.subTest(value=value):
                self.assertEqual(normalize_tr_mobile(value), "+905321234567")

    def test_rejects_invalid_numbers(self):
        for value in [
            "",
            None,
            "0212 123 45 67",
            "1234567890",
            "532123456",
            "53212345678",
            "0532abc1234567",
            "+44 7911 123456",
        ]:
            with self.subTest(value=value):
                self.assertIsNone(normalize_tr_mobile(value))


class GatewaySettingTests(SimpleTestCase):

    def test_default_gateway_is_console(self):
        self.assertIsInstance(get_sms_gateway(), ConsoleSmsGateway)

    @override_settings(NOTIFICATIONS={"SMS_GATEWAY": "notifications.tests.FakeSmsGateway"})
    def test_gateway_is_loaded_from_settings(self):
        self.assertIsInstance(get_sms_gateway(), FakeSmsGateway)


class EnqueueTests(TestCase):

    def setUp(self):
        self.user = get_user_model().objects.create(username="alici")

    def test_enqueue_normalizes_phone_and_links_target(self):
        notification = NotificationService.enqueue_sms(
            recipient="0532 123 45 67",
            message="Merhaba",
            event="test_event",
            target=self.user,
            metadata={"order_id": 7},
        )

        notification.refresh_from_db()
        self.assertEqual(notification.status, Notification.Status.PENDING)
        self.assertEqual(notification.recipient, "+905321234567")
        self.assertEqual(notification.target, self.user)
        self.assertEqual(notification.metadata, {"order_id": 7})

    def test_invalid_phone_is_recorded_as_failed(self):
        notification = NotificationService.enqueue_sms(recipient="1234567890", message="Merhaba", event="test_event")

        self.assertEqual(notification.status, Notification.Status.FAILED)
        self.assertEqual(notification.last_error, "Geçersiz telefon numarası.")

    def test_dedup_key_prevents_duplicates(self):
        NotificationService.enqueue_sms(recipient="05321234567", message="1", event="e", dedup_key="k")

        with self.assertRaises(IntegrityError):
            NotificationService.enqueue_sms(recipient="05321234567", message="2", event="e", dedup_key="k")


class SendPendingTests(TestCase):

    def setUp(self):
        self.notification = NotificationService.enqueue_sms(
            recipient="05321234567", message="Merhaba", event="test_event",
        )

    def send(self, gateway):
        with patch("notifications.service.get_sms_gateway", return_value=gateway):
            return NotificationService.send_pending()

    def test_successful_send_marks_sent(self):
        gateway = FakeSmsGateway()

        self.assertEqual(self.send(gateway), 1)

        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, Notification.Status.SENT)
        self.assertEqual(self.notification.provider_message_id, "fake-id")
        self.assertIsNotNone(self.notification.sent_at)
        self.assertEqual(gateway.sent, [("+905321234567", "Merhaba")])

    def test_failed_send_is_retried_later(self):
        self.send(FakeSmsGateway(fail=True))

        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, Notification.Status.PENDING)
        self.assertEqual(self.notification.attempts, 1)
        self.assertEqual(self.notification.last_error, "Sağlayıcı hatası")
        self.assertGreater(self.notification.next_attempt_at, timezone.now())
        self.assertEqual(self.send(FakeSmsGateway()), 0)

    @override_settings(NOTIFICATIONS={"MAX_ATTEMPTS": 1})
    def test_gives_up_after_max_attempts(self):
        self.send(FakeSmsGateway(fail=True))

        self.notification.refresh_from_db()
        self.assertEqual(self.notification.status, Notification.Status.FAILED)

    def test_sent_notification_is_not_sent_again(self):
        self.send(FakeSmsGateway())
        gateway = FakeSmsGateway()

        self.assertEqual(self.send(gateway), 0)
        self.assertEqual(gateway.sent, [])
