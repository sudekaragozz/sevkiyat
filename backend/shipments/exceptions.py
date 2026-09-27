class ShipmentError(Exception):
    def __init__(self, message, code=None):
        self.message = message
        self.code = code or "shipment_error"
        super().__init__(message)
