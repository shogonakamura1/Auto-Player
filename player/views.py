from django.shortcuts import render, redirect
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import os
import json
import uuid
import speech_recognition as sr
from django.conf import settings
import mimetypes
from mutagen import File as MutagenFile
import tempfile
import shutil

# Create your views here.

def test_api(request):
    """テスト用のAPIエンドポイント"""
    return JsonResponse({'message': 'API is working!'})

def main_player(request):
    """
    Single page music player with session-based file management.
    """
    # セッションからファイルリストを取得
    session_files = request.session.get('uploaded_files', [])
    return render(request, 'player/main_player.html', {'session_files': session_files})

@csrf_exempt
@require_http_methods(["POST"])
def upload_file(request):
    """セッション限定のファイルアップロード"""
    try:
        # セッションを確実に初期化
        if not request.session.session_key:
            request.session.create()
        
        if 'file' not in request.FILES:
            return JsonResponse({'error': 'ファイルが選択されていません'}, status=400)
        
        uploaded_file = request.FILES['file']
        
        # ファイル形式の検証
        allowed_extensions = ['mp3', 'wav', 'flac', 'aac', 'ogg']
        file_extension = uploaded_file.name.split('.')[-1].lower()
        
        if file_extension not in allowed_extensions:
            return JsonResponse({'error': f'対応していないファイル形式です: {file_extension}'}, status=400)
        
        # ファイルサイズ制限（12MB）
        if uploaded_file.size > 12 * 1024 * 1024:
            return JsonResponse({'error': 'ファイルサイズが大きすぎます（12MB以下）'}, status=400)
        
        # MEDIA_ROOTとセッション用の一時ディレクトリを必ず作成
        if not os.path.exists(settings.MEDIA_ROOT):
            os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
        session_temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp', str(request.session.session_key))
        os.makedirs(session_temp_dir, exist_ok=True)
        
        # ユニークなファイル名を生成
        file_id = str(uuid.uuid4())
        file_extension = uploaded_file.name.split('.')[-1]
        filename = f"{file_id}.{file_extension}"
        file_path = os.path.join(session_temp_dir, filename)
        
        # ファイルをBase64エンコードしてセッションに保存
        try:
            file_content = uploaded_file.read()
            import base64
            file_base64 = base64.b64encode(file_content).decode('utf-8')
            
            # Base64データのサイズチェック（セッション制限を考慮）
            if len(file_base64) > 16 * 1024 * 1024:  # 16MB制限（12MBファイルのBase64エンコード後）
                return JsonResponse({'error': 'ファイルが大きすぎてセッションに保存できません（12MB以下）'}, status=400)
                
        except Exception as e:
            return JsonResponse({'error': f'ファイルの読み込みに失敗しました: {str(e)}'}, status=500)
        
        # ファイルのメタデータを取得（一時ファイルから）
        temp_file_path = os.path.join(session_temp_dir, filename)
        with open(temp_file_path, 'wb+') as destination:
            destination.write(file_content)
        
        try:
            audio = MutagenFile(temp_file_path)
            duration = int(audio.info.length) if audio.info else 0
        except:
            duration = 0
        
        # 一時ファイルを削除
        try:
            os.remove(temp_file_path)
        except:
            pass
        
        # 既存のファイルがある場合は削除
        session_files = request.session.get('uploaded_files', [])
        if session_files:
            for existing_file in session_files:
                try:
                    if os.path.exists(existing_file.get('file_path', '')):
                        os.remove(existing_file['file_path'])
                except:
                    pass
        
        # セッションにファイル情報を保存（一つだけ）
        file_info = {
            'id': file_id,
            'title': uploaded_file.name,
            'filename': filename,
            'file_base64': file_base64,
            'duration': duration,
            'file_size': uploaded_file.size,
            'uploaded_at': str(uuid.uuid4())
        }
        request.session['uploaded_files'] = [file_info]
        request.session.modified = True
        
        return JsonResponse({
            'success': True,
            'file': file_info,
            'message': 'ファイルが正常にアップロードされました'
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["DELETE"])
def delete_file(request, file_id):
    """セッションからファイルを削除"""
    try:
        session_files = request.session.get('uploaded_files', [])
        
        # ファイルを検索
        file_to_delete = None
        for file_info in session_files:
            if file_info['id'] == file_id:
                file_to_delete = file_info
                break
        
        if not file_to_delete:
            return JsonResponse({'error': 'ファイルが見つかりません'}, status=404)
        
        # ファイルを物理的に削除
        try:
            if os.path.exists(file_to_delete.get('file_path', '')):
                os.remove(file_to_delete['file_path'])
        except:
            pass  # ファイルが既に削除されている場合
        
        # セッションから削除
        session_files = [f for f in session_files if f['id'] != file_id]
        request.session['uploaded_files'] = session_files
        request.session.modified = True
        
        return JsonResponse({'success': True, 'message': 'ファイルが削除されました'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_file_data(request, file_id):
    """ファイルのBase64データを取得"""
    try:
        session_files = request.session.get('uploaded_files', [])
        
        for file_info in session_files:
            if file_info['id'] == file_id:
                return JsonResponse({
                    'success': True,
                    'file_base64': file_info.get('file_base64', ''),
                    'file_info': file_info
                })
        
        return JsonResponse({'error': 'ファイルが見つかりません'}, status=404)
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def save_playback_position(request):
    """再生位置をローカルストレージに保存（クライアントサイドで処理）"""
    try:
        data = json.loads(request.body)
        file_id = data.get('file_id')
        position = data.get('position', 0.0)
        
        if not file_id:
            return JsonResponse({'error': 'file_id is required'}, status=400)
        
        # セッションに再生位置を保存（オプション）
        playback_positions = request.session.get('playback_positions', {})
        playback_positions[file_id] = position
        request.session['playback_positions'] = playback_positions
        request.session.modified = True
        
        return JsonResponse({'success': True, 'position': position})
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_playback_position(request, file_id):
    """前回再生位置を取得"""
    try:
        playback_positions = request.session.get('playback_positions', {})
        position = playback_positions.get(file_id, 0.0)
        
        return JsonResponse({
            'success': True,
            'position': position
        })
    
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

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

def cleanup_session_files(request):
    """セッション終了時のクリーンアップ（オプション）"""
    try:
        session_temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp', str(request.session.session_key))
        if os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)
        
        # セッションデータをクリア
        request.session['uploaded_files'] = []
        request.session['playback_positions'] = {}
        request.session.modified = True
        
        return JsonResponse({'success': True, 'message': 'セッションファイルがクリーンアップされました'})
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["POST"])
def upload_file_lightweight(request):
    """軽量版ファイルアップロード（ファイルシステム使用）"""
    try:
        # セッションを確実に初期化
        if not request.session.session_key:
            request.session.create()
        
        if 'file' not in request.FILES:
            return JsonResponse({'error': 'ファイルが選択されていません'}, status=400)
        
        uploaded_file = request.FILES['file']
        
        # ファイル形式の検証
        allowed_extensions = ['mp3', 'wav', 'flac', 'aac', 'ogg']
        file_extension = uploaded_file.name.split('.')[-1].lower()
        
        if file_extension not in allowed_extensions:
            return JsonResponse({'error': f'対応していないファイル形式です: {file_extension}'}, status=400)
        
        # ファイルサイズ制限（12MB）
        if uploaded_file.size > 12 * 1024 * 1024:
            return JsonResponse({'error': 'ファイルサイズが大きすぎます（12MB以下）'}, status=400)
        
        # ユニークなファイル名を生成
        file_id = str(uuid.uuid4())
        filename = f"{file_id}.{file_extension}"
        
        # 一時ディレクトリに保存
        temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp_uploads')
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, filename)
        
        # ファイルを保存
        with open(file_path, 'wb+') as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)
        
        # ファイルのメタデータを取得
        try:
            audio = MutagenFile(file_path)
            duration = int(audio.info.length) if audio.info else 0
        except:
            duration = 0
        
        # 既存のファイルがある場合は削除
        session_files = request.session.get('uploaded_files', [])
        if session_files:
            for existing_file in session_files:
                try:
                    if os.path.exists(existing_file.get('file_path', '')):
                        os.remove(existing_file['file_path'])
                except:
                    pass
        
        # セッションにファイル情報を保存（一つだけ）
        file_info = {
            'id': file_id,
            'title': uploaded_file.name,
            'filename': filename,
            'file_path': file_path,
            'duration': duration,
            'file_size': uploaded_file.size,
            'uploaded_at': str(uuid.uuid4())
        }
        request.session['uploaded_files'] = [file_info]
        request.session.modified = True
        
        return JsonResponse({
            'success': True,
            'file': file_info,
            'message': 'ファイルが正常にアップロードされました'
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_http_methods(["GET"])
def get_file_url_lightweight(request, file_id):
    """軽量版ファイルURL取得"""
    try:
        session_files = request.session.get('uploaded_files', [])
        
        for file_info in session_files:
            if file_info['id'] == file_id:
                # ファイルが存在するかチェック
                if os.path.exists(file_info.get('file_path', '')):
                    file_url = f"/media/temp_uploads/{file_info['filename']}"
                    return JsonResponse({
                        'success': True,
                        'file_url': file_url,
                        'file_info': file_info
                    })
                else:
                    return JsonResponse({'error': 'ファイルが見つかりません'}, status=404)
        
        return JsonResponse({'error': 'ファイルが見つかりません'}, status=404)
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
