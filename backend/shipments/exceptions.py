class SevkiyatError(Exception):
    def __init__(self, message, code=None):
        self.message = message
        self.code = code or "sevkiyat_error"
        super().__init__(message)