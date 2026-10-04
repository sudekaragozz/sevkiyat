from uuid import uuid4

from django.utils.module_loading import import_string

from .conf import get_setting


class SmsError(Exception):
    pass


class SmsGateway:

    def send(self, phone, message):
        raise NotImplementedError


class ConsoleSmsGateway(SmsGateway):

    def send(self, phone, message):
        print(f"[SMS] {phone}: {message}", flush=True)
        return f"console-{uuid4().hex[:12]}"


def get_sms_gateway():
    return import_string(get_setting("SMS_GATEWAY"))()
#Burada sistem hangi SMS gateway'ini kullanacağını ayarlardan öğreniyor.