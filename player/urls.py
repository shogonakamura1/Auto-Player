from django.urls import path
from . import views

app_name = 'player'
 
urlpatterns = [
    path('', views.main_player, name='main_player'),
    path('api/upload/', views.upload_file, name='upload_file'),
    path('api/delete/<str:file_id>/', views.delete_file, name='delete_file'),
    path('api/file-data/<str:file_id>/', views.get_file_data, name='get_file_data'),
    path('api/save-position/', views.save_playback_position, name='save_playback_position'),
    path('api/get-position/<str:file_id>/', views.get_playback_position, name='get_playback_position'),
    path('api/voice-command/', views.voice_command, name='voice_command'),
    path('api/cleanup/', views.cleanup_session_files, name='cleanup_session_files'),
    path('test-api/', views.test_api, name='test_api'),
] 