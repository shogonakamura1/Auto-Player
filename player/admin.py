from django.contrib import admin
from .models import MusicFile, VoiceCommand

@admin.register(MusicFile)
class MusicFileAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'duration', 'file_size', 'uploaded_at')
    search_fields = ('title', 'user__username')

@admin.register(VoiceCommand)
class VoiceCommandAdmin(admin.ModelAdmin):
    list_display = ('command', 'action', 'user', 'is_active')
    search_fields = ('command', 'user__username')
    list_filter = ('is_active',)
