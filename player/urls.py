from django.urls import path
from . import views

app_name = 'player'
 
urlpatterns = [
    path('', views.main_player, name='main_player'),
    path('upload/', views.file_upload, name='file_upload'),
] 