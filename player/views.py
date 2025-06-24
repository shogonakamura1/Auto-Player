from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import os
from .models import MusicFile
from .forms import MusicFileForm, MusicFileUploadForm

# Create your views here.

@login_required
def main_player(request):
    """
    Single page music player.
    """
    music_files = MusicFile.objects.all().order_by('-uploaded_at')
    return render(request, 'player/main_player.html', {'music_files': music_files})

@login_required
def file_upload(request):
    if request.method == 'POST':
        form = MusicFileUploadForm(request.POST, request.FILES)
        if form.is_valid():
            form.save()
            messages.success(request, '音楽ファイルが正常にアップロードされました。')
            return redirect('player:main_player')
        else:
            messages.error(request, 'アップロードに失敗しました。')
    return redirect('player:main_player')
