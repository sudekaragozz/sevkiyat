from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('shipments', '0013_counter_remove_sefer_previous_sefer_package_status_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='role',
            # Mevcut çalışan kayıtları için tek seferlik varsayılan: hepsi "Kurye" olarak
            # işaretlenir. Bu varsayılan sadece bu migration'a ait — modelde (models.py)
            # kalıcı bir default yok, yeni eklenecek çalışanlar için rol seçimi zorunlu.
            field=models.CharField(
                choices=[('SOFOR', 'Şoför'), ('KURYE', 'Kurye')],
                default='KURYE',
                max_length=20,
            ),
            preserve_default=False,
        ),
    ]
