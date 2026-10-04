from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["id", "event", "recipient", "status", "attempts", "created_at", "sent_at"]
    list_filter = ["status", "channel", "event"]
    search_fields = ["recipient", "dedup_key"]
    readonly_fields = ["created_at", "sent_at", "provider_message_id"]
