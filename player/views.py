from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import os
import json
import speech_recognition as sr
from .models import MusicFile, PlaybackPosition
from .forms import MusicFileForm, MusicFileUploadForm

# Create your views here.

def test_api(request):
    """テスト用のAPIエンドポイント"""
    return JsonResponse({'message': 'API is working!'})

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

@csrf_exempt
@require_http_methods(["POST"])
def save_playback_position(request):
    """再生位置を保存するAPI"""
    try:
        data = json.loads(request.body)
        music_file_id = data.get('music_file_id')
        position = data.get('position', 0.0)
        
        if not music_file_id:
            return JsonResponse({'error': 'music_file_id is required'}, status=400)
        
        music_file = get_object_or_404(MusicFile, id=music_file_id)
        
        # 一時的にユーザーをNoneに設定（テスト用）
        user = None
        
        # 既存の位置を更新するか、新しく作成
        playback_position, created = PlaybackPosition.objects.get_or_create(
            user=user,
            music_file=music_file,
            defaults={'position': position}
        )
        
        if not created:
            playback_position.position = position
            playback_position.save()
        
        return JsonResponse({'success': True, 'position': position})
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_playback_position(request, music_file_id):
    """前回再生位置を取得するAPI"""
    try:
        music_file = get_object_or_404(MusicFile, id=music_file_id)
        
        # 一時的にユーザーをNoneに設定（テスト用）
        user = None
        
        playback_position = PlaybackPosition.objects.filter(
            user=user,
            music_file=music_file
        ).first()
        
        if playback_position:
            return JsonResponse({
                'success': True,
                'position': playback_position.position,
                'last_played_at': playback_position.last_played_at.isoformat()
            })
        else:
            return JsonResponse({'success': True, 'position': 0.0})
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@login_required
@csrf_exempt
@require_http_methods(["POST"])
def voice_command(request):
    """音声コマンドを処理するAPI"""
    try:
        # 音声認識の初期化
        recognizer = sr.Recognizer()
        
        # マイクから音声を取得
        with sr.Microphone() as source:
            print("音声を聞いています...")
            audio = recognizer.listen(source, timeout=5, phrase_time_limit=3)
        
        # 音声をテキストに変換
        try:
            text = recognizer.recognize_google(audio, language='ja-JP')
            print(f"認識された音声: {text}")
            
            # コマンドの判定
            if "戻って" in text or "もどって" in text:
                return JsonResponse({
                    'success': True,
                    'command': 'go_back',
                    'message': '前回再生位置に戻ります'
                })
            elif "停止" in text or "とめる" in text:
                return JsonResponse({
                    'success': True,
                    'command': 'stop',
                    'message': '再生を停止します'
                })
            elif "再生" in text or "さいせい" in text:
                return JsonResponse({
                    'success': True,
                    'command': 'play',
                    'message': '再生を開始します'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'message': f'認識された音声: "{text}" は対応していないコマンドです'
                })
        
        except sr.UnknownValueError:
            return JsonResponse({
                'success': False,
                'message': '音声を認識できませんでした'
            })
        except sr.RequestError as e:
            return JsonResponse({
                'success': False,
                'message': f'音声認識サービスでエラーが発生しました: {str(e)}'
            })
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
