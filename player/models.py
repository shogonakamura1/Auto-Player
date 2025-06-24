from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator

class MusicFile(models.Model):
    title = models.CharField(max_length=200)
    file = models.FileField(
        upload_to='music/',
        validators=[FileExtensionValidator(allowed_extensions=['mp3', 'wav', 'flac', 'aac'])]
    )
    duration = models.IntegerField(default=0)  # 秒数
    file_size = models.IntegerField(default=0)  # バイト数
    uploaded_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.file:
            self.file_size = self.file.size
        super().save(*args, **kwargs)

class VoiceCommand(models.Model):
    command = models.CharField(max_length=100)
    action = models.CharField(max_length=100)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.command} → {self.action}"

    class Meta:
        unique_together = ['command', 'user']
