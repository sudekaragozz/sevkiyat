import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('contenttypes', '0002_remove_content_type_name'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('channel', models.CharField(choices=[('SMS', 'SMS')], default='SMS', max_length=10)),
                ('event', models.CharField(max_length=50)),
                ('recipient', models.CharField(max_length=20)),
                ('message', models.TextField()),
                ('target_object_id', models.PositiveBigIntegerField(blank=True, null=True)),
                ('dedup_key', models.CharField(blank=True, max_length=200, null=True, unique=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('status', models.CharField(choices=[('PENDING', 'Bekliyor'), ('SENT', 'Gönderildi'), ('FAILED', 'Gönderilemedi')], default='PENDING', max_length=10)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('last_error', models.TextField(blank=True)),
                ('provider_message_id', models.CharField(blank=True, max_length=100)),
                ('next_attempt_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('target_content_type', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='contenttypes.contenttype')),
            ],
            options={
                'indexes': [models.Index(fields=['status', 'next_attempt_at'], name='notificatio_status_444bb6_idx'), models.Index(fields=['target_content_type', 'target_object_id'], name='notificatio_target__dfbaf5_idx')],
            },
        ),
    ]
