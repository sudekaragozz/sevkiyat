from django.conf import settings

DEFAULTS = {
    "SMS_GATEWAY": "notifications.gateways.ConsoleSmsGateway",
    "PHONE_NORMALIZER": "notifications.phone.normalize_tr_mobile",
    "MAX_ATTEMPTS": 5,
    "BATCH_SIZE": 50,
}


def get_setting(name):
    return getattr(settings, "NOTIFICATIONS", {}).get(name, DEFAULTS[name])
