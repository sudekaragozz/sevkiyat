from rest_framework.routers import DefaultRouter
from .views import BranchViewSet, EmployeeViewSet, PackageViewSet, VehicleViewSet, SeferViewSet

router = DefaultRouter()
router.register('employees', EmployeeViewSet, basename='employee')
router.register('branches', BranchViewSet, basename='branch')
router.register('packages', PackageViewSet)
router.register('vehicles', VehicleViewSet, basename='vehicle')
router.register('sefer', SeferViewSet, basename='sefer')

urlpatterns = router.urls
