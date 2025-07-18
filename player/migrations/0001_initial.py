# Generated by Django 4.2.7 on 2025-06-23 09:10

from django.conf import settings
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MusicFile",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("title", models.CharField(max_length=200)),
                (
                    "file",
                    models.FileField(
                        upload_to="music/",
                        validators=[
                            django.core.validators.FileExtensionValidator(
                                allowed_extensions=["mp3", "wav", "flac", "aac"]
                            )
                        ],
                    ),
                ),
                ("duration", models.IntegerField(default=0)),
                ("file_size", models.IntegerField(default=0)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="MusicAnalysis",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("bpm", models.FloatField(blank=True, null=True)),
                ("beat_times", models.JSONField(default=list)),
                ("sections", models.JSONField(default=dict)),
                ("last_play_position", models.FloatField(default=0.0)),
                ("analysis_updated_at", models.DateTimeField(auto_now=True)),
                (
                    "music_file",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="player.musicfile",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="VoiceCommand",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("command", models.CharField(max_length=100)),
                ("action", models.CharField(max_length=100)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "unique_together": {("command", "user")},
            },
        ),
    ]
