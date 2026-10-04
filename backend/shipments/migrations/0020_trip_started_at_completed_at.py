from django.db import migrations, models
from django.db.models import Min


def forwards(apps, schema_editor):
    Trip = apps.get_model('shipments', 'Trip')
    PackageHistory = apps.get_model('shipments', 'PackageHistory')

    for trip in Trip.objects.exclude(status='PLANNED'):
        records = PackageHistory.objects.filter(trip=trip)
        trip.started_at = records.filter(status='IN_TRANSIT').aggregate(t=Min('created_at'))['t']
        if trip.status == 'COMPLETED':
            trip.completed_at = records.filter(status='AT_BRANCH').aggregate(t=Min('created_at'))['t']
        trip.save(update_fields=['started_at', 'completed_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('shipments', '0019_package_loaded_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='trip',
            name='started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='trip',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
