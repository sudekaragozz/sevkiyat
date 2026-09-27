from django.urls import path

from .views import (
    BranchViewset,
    EmployeeViewset,
    EmployeePackagesView,
    PackageFilterOptionsView,
    PackageHistoryView,
    PackageViewset,
    TripFilterOptionsView,
    TripViewset,
    VehicleViewset,
)
from .distribution_views import (
    DistributionEligiblePackagesView,
    DistributionFilterOptionsView,
    DistributionViewset,
)

urlpatterns = [
    path('employees/', EmployeeViewset.as_view(), name='employee-list'),
    path('employees/<int:pk>/', EmployeeViewset.as_view(), name='employee-detail'),
    path('employees/<int:pk>/packages/', EmployeePackagesView.as_view(), name='employee-packages'),

    path('branches/', BranchViewset.as_view(), name='branch-list'),
    path('branches/<int:pk>/', BranchViewset.as_view(), name='branch-detail'),

    path('vehicles/', VehicleViewset.as_view(), name='vehicle-list'),
    path('vehicles/<int:pk>/', VehicleViewset.as_view(), name='vehicle-detail'),

    path('trips/', TripViewset.as_view(), name='trip-list'),
    path('trips/filter-options/', TripFilterOptionsView.as_view(), name='trip-filter-options'),
    path('trips/<int:pk>/', TripViewset.as_view(), name='trip-detail'),
    path('trips/<int:pk>/start/', TripViewset.as_view(), {'action': 'start'}, name='trip-start'),
    path('trips/<int:pk>/arrive/', TripViewset.as_view(), {'action': 'arrive'}, name='trip-arrive'),
    path('trips/<int:pk>/packages/', TripViewset.as_view(), {'action': 'packages'}, name='trip-packages'),

    path('distributions/', DistributionViewset.as_view(), name='distribution-list'),
    path('distributions/filter-options/', DistributionFilterOptionsView.as_view(), name='distribution-filter-options'),
    path('distributions/eligible-packages/', DistributionEligiblePackagesView.as_view(), name='distribution-eligible-packages'),
    path('distributions/<int:pk>/', DistributionViewset.as_view(), name='distribution-detail'),
    path('distributions/<int:pk>/start/', DistributionViewset.as_view(), {'action': 'start'}, name='distribution-start'),
    path('distributions/<int:pk>/complete/', DistributionViewset.as_view(), {'action': 'complete'}, name='distribution-complete'),
    path('distributions/<int:pk>/packages/', DistributionViewset.as_view(), {'action': 'packages'}, name='distribution-packages'),
    path(
        'distributions/<int:pk>/packages/<int:package_id>/result/',
        DistributionViewset.as_view(),
        {'action': 'result'},
        name='distribution-package-result',
    ),

    path('packages/', PackageViewset.as_view(), name='package-list'),
    path('packages/filter-options/', PackageFilterOptionsView.as_view(), name='package-filter-options'),
    path(
        'packages/<int:pk>/load-to-trip/',
        PackageViewset.as_view(),
        name='package-load-to-trip',
    ),
    path('package-history/', PackageHistoryView.as_view(), name='package-history'),
]
