from django.contrib import admin
from .models import Employee, Branch, Package

admin.site.register(Employee)
admin.site.register(Branch)
admin.site.register(Package)

# Register your models here.
