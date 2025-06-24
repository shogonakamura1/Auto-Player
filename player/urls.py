from django.urls import path
from . import views

app_name = 'player'
 
urlpatterns = [
    path('', views.main_player, name='main_player'),
    path('upload/', views.file_upload, name='file_upload'),
    path('test-api/', views.test_api, name='test_api'),
    path('api/save-position/', views.save_playback_position, name='save_playback_position'),
    path('api/get-position/<int:music_file_id>/', views.get_playback_position, name='get_playback_position'),
    path('api/voice-command/', views.voice_command, name='voice_command'),
] 