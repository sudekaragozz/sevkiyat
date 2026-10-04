import time

from django.core.management.base import BaseCommand

from notifications.service import NotificationService


class Command(BaseCommand):
    help = "Bekleyen bildirimleri gönderir."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--interval", type=int, default=5)

    def handle(self, *args, once, interval, **options):
        while True:
            processed = NotificationService.send_pending()
            if processed:
                self.stdout.write(f"{processed} bildirim işlendi.")
            if once:
                return
            time.sleep(interval)
