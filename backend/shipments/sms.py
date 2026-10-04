from notifications.service import NotificationService

OUT_FOR_DELIVERY = "out_for_delivery"


def notify_out_for_delivery(*, package, distribution):
    return NotificationService.enqueue_sms(
        recipient=package.recipient_phone,
        message=(
            f"Sayın {package.recipient_name}, {package.tracking_number} takip numaralı "
            f"kargonuz dağıtıma çıkmıştır. {distribution.branch.name} Şubesi"
        ),
        event=OUT_FOR_DELIVERY,
        target=package,
        dedup_key=f"{OUT_FOR_DELIVERY}:distribution-{distribution.id}:package-{package.id}",
        metadata={"distribution_id": distribution.id},
    )
