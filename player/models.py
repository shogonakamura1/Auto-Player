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
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.file:
            self.file_size = self.file.size
        super().save(*args, **kwargs)

class PlaybackPosition(models.Model):
    """前回再生位置を記憶するモデル"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    music_file = models.ForeignKey(MusicFile, on_delete=models.CASCADE)
    position = models.FloatField(default=0.0)  # 秒数
    last_played_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['user', 'music_file']
    
    def __str__(self):
        return f"{self.user.username if self.user else 'Anonymous'} - {self.music_file.title} at {self.position}s"

class VoiceCommand(models.Model):
    command = models.CharField(max_length=100)
    action = models.CharField(max_length=100)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.command} → {self.action}"

    class Meta:
        unique_together = ['command', 'user']
