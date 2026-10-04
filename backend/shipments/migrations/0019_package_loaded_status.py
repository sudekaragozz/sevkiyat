from django.db import migrations, models


def forwards(apps, schema_editor):
    Package = apps.get_model('shipments', 'Package')
    PackageHistory = apps.get_model('shipments', 'PackageHistory')

    for package in Package.objects.filter(status='IN_TRANSIT', trip__status='PLANNED').select_related('trip'):
        package.status = 'LOADED'
        package.current_branch_id = package.trip.origin_branch_id
        package.save(update_fields=['status', 'current_branch'])

        leave = (PackageHistory.objects
                 .filter(package=package, status='LEAVE_BRANCH')
                 .order_by('-created_at', '-id').first())
        if leave:
            leave.delete()

    seen = set()
    records = (PackageHistory.objects
               .filter(status='IN_TRANSIT', trip__isnull=False)
               .select_related('trip')
               .order_by('created_at', 'id'))
    for record in records:
        key = (record.package_id, record.trip_id)
        if key in seen:
            continue
        seen.add(key)
        has_departure = PackageHistory.objects.filter(
            package_id=record.package_id, trip_id=record.trip_id, status='IN_TRANSIT',
        ).exclude(pk=record.pk).exists()
        if has_departure or record.trip.status == 'PLANNED':
            record.status = 'LOADED'
            record.branch_id = record.branch_id or record.trip.origin_branch_id
            record.save(update_fields=['status', 'branch'])


class Migration(migrations.Migration):

    dependencies = [
        ('shipments', '0018_distribution_packagehistory_distribution_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='package',
            name='status',
            field=models.CharField(
                choices=[('AT_BRANCH', 'Şubede'), ('LOADED', 'Sefere Yüklendi'), ('IN_TRANSIT', 'Yolda'),
                         ('OUT_FOR_DELIVERY', 'Dağıtımda'), ('DELIVERED', 'Teslim Edildi'),
                         ('DELIVERY_FAILED', 'Teslim Edilemedi')],
                db_index=True, default='AT_BRANCH', max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='packagehistory',
            name='status',
            field=models.CharField(
                choices=[('AT_BRANCH', 'Şubeye Ulaştı'), ('LOADED', 'Sefere Yüklendi'),
                         ('LEAVE_BRANCH', 'Şubeden Ayrıldı.'), ('IN_TRANSIT', 'Yolda'),
                         ('LEFT_TRANSIT', 'Sefer bitti'), ('OUT_FOR_DELIVERY', 'Dağıtıma Çıktı'),
                         ('DELIVERED', 'Teslim Edildi'), ('DELIVERY_FAILED', 'Teslim Edilemedi')],
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
