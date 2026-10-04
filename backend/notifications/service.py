from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from .conf import get_setting
from .gateways import get_sms_gateway
from .models import Notification


class NotificationService:

    @staticmethod
    #Mesela tablo şöyle:

#id	event	recipient	dedup_key
#1	OUT_FOR_DELIVERY	+90532...	out_for_delivery:distribution-5:package-12
#2	DELIVERED	+90532...	delivered:distribution-5:package-12

#Burada:

#id → primary key
#dedup_key → unique alan
    def enqueue_sms(*,dedup_key=None, recipient, message, event, target=None, metadata=None):
        normalize = import_string(get_setting("PHONE_NORMALIZER"))
        phone = normalize(recipient)
        notification = Notification(
            dedup_key=dedup_key,
            channel=Notification.Channel.SMS,
            event=event,
            recipient=phone or recipient,
            message=message,
            target=target,
            metadata=metadata or {},
        )
        if phone is None:
            notification.status = Notification.Status.FAILED
            notification.last_error = "Geçersiz telefon numarası."
        notification.save()
        return notification

    @staticmethod
    def send_pending():
        gateway = get_sms_gateway()
        max_attempts = get_setting("MAX_ATTEMPTS")
        now = timezone.now()

        with transaction.atomic():
            batch = list(
                Notification.objects.select_for_update(skip_locked=True)
                .filter(status=Notification.Status.PENDING, next_attempt_at__lte=now)
                .order_by("next_attempt_at", "id")[:get_setting("BATCH_SIZE")]
            )
            for notification in batch:
                notification.attempts += 1
                try:
                    notification.provider_message_id = gateway.send(
                        notification.recipient, notification.message
                    )
                except Exception as error:
                    notification.last_error = str(error)
                    if notification.attempts >= max_attempts:
                        notification.status = Notification.Status.FAILED
                    else:
                        notification.next_attempt_at = now + timedelta(minutes=2 ** notification.attempts)
                else:
                    notification.status = Notification.Status.SENT
                    notification.sent_at = timezone.now()
                    notification.last_error = ""
                notification.save(update_fields=[
                    "attempts", "status", "last_error", "provider_message_id",
                    "next_attempt_at", "sent_at",
                ])

        return len(batch)
