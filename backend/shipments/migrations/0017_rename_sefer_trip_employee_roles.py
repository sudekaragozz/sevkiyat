from django.db import migrations, models


ROLE_RENAMES = {"SOFOR": "DRIVER", "KURYE": "COURIER"}


def rename_roles(apps, schema_editor):
    Employee = apps.get_model("shipments", "Employee")
    for old, new in ROLE_RENAMES.items():
        Employee.objects.filter(role=old).update(role=new)


def restore_roles(apps, schema_editor):
    Employee = apps.get_model("shipments", "Employee")
    for old, new in ROLE_RENAMES.items():
        Employee.objects.filter(role=new).update(role=old)


class Migration(migrations.Migration):

    dependencies = [
        ('shipments', '0016_alter_packagehistory_status'),
    ]

    operations = [
        migrations.RenameModel(old_name='Sefer', new_name='Trip'),
        migrations.RenameField(model_name='package', old_name='sefer', new_name='trip'),
        migrations.RenameField(model_name='packagehistory', old_name='sefer', new_name='trip'),
        migrations.AlterField(
            model_name='employee',
            name='role',
            field=models.CharField(choices=[('DRIVER', 'Şoför'), ('COURIER', 'Kurye')], max_length=20),
        ),
        migrations.RunPython(rename_roles, restore_roles),
    ]
