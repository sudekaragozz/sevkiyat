from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone


class Notification(models.Model):

    class Channel(models.TextChoices):
        SMS = "SMS", "SMS"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Bekliyor"
        SENT = "SENT", "Gönderildi"
        FAILED = "FAILED", "Gönderilemedi"

    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    event = models.CharField(max_length=50)
    recipient = models.CharField(max_length=20)
    message = models.TextField()

    target_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    target_object_id = models.PositiveBigIntegerField(null=True, blank=True)
    target = GenericForeignKey("target_content_type", "target_object_id")

    dedup_key = models.CharField(max_length=200, unique=True, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    #kaç kere gönderdiğimizi tutuyo
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True)
    #SMS sağlayıcısının bize verdiği mesaj ID'si.
    provider_message_id = models.CharField(max_length=100, blank=True)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "next_attempt_at"]),
            models.Index(fields=["target_content_type", "target_object_id"]),
        ]

    def __str__(self):
        return f"{self.event} → {self.recipient} ({self.get_status_display()})"
