from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BranchViewSet,
    EmployeeViewSet,
    PackageHistoryView,
    PackageSefereCikartView,
    PackageView,
    SeferPackagesView,
    SeferViewSet,
    VehicleViewSet,
)

router = DefaultRouter()
router.register('employees', EmployeeViewSet, basename='employee')
router.register('branches', BranchViewSet, basename='branch')
router.register('vehicles', VehicleViewSet, basename='vehicle')
router.register('sefer', SeferViewSet, basename='sefer')

urlpatterns = router.urls + [
    path('packages/', PackageView.as_view(), name='package-list'),
    path(
        'packages/<int:pk>/sefere-cikart/',
        PackageSefereCikartView.as_view(),
        name='package-sefere-cikart',
    ),
    path('package-history/', PackageHistoryView.as_view(), name='package-history'),
    path('sefer/<int:pk>/packages/', SeferPackagesView.as_view(), name='sefer-packages'),
]