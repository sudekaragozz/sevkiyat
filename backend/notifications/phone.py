import re

ALLOWED_CHARACTERS = re.compile(r"[\d\s+\-().]+")
TR_MOBILE = re.compile(r"5\d{9}")


def normalize_tr_mobile(value):
    if not value or not ALLOWED_CHARACTERS.fullmatch(value.strip()):
        return None

    digits = re.sub(r"\D", "", value)
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 12 and digits.startswith("90"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]

    if not TR_MOBILE.fullmatch(digits):
        return None
    return f"+90{digits}"
