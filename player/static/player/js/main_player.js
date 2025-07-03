document.addEventListener('DOMContentLoaded', function() {
    const audioPlayer = document.getElementById('audio-player');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const currentTimeDisplay = document.getElementById('currentTimeDisplay');
    const durationDisplay = document.getElementById('durationDisplay');
    const voiceCommandBtn = document.getElementById('voice-command-btn');
    const voiceStatus = document.getElementById('voice-status');
    const seekBars = [
        document.getElementById('seek-bar-1'),
        document.getElementById('seek-bar-2'),
        document.getElementById('seek-bar-3'),
        document.getElementById('seek-bar-4'),
        document.getElementById('seek-bar-5')
    ];
    
    const speedRange = document.getElementById('speed-range');
    const currentSpeedDisplay = document.getElementById('current-speed');
    const speedDisplay = document.getElementById('speed-display');
    const speedBtn = document.getElementById('speed-btn');
    const loopCheck = document.getElementById('loop-check');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const waveformCanvas2 = document.getElementById('waveform-canvas-2');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const fileInput = document.getElementById('file-input');
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
    const uploadProgress = document.getElementById('upload-progress');
    const uploadStatus = document.getElementById('upload-status');
    const sessionFilesList = document.getElementById('session-files-list');
    
    let isSeeking = false;
    let wasPlaying = false;
    let currentActiveBar = 0;
    let currentSpeed = 1.0;
    let seekTimeout = null;
    let audioData = null;  // 音声データ（波形表示用）
    let audioDuration = 0;  // 音声の長さ
    let currentFileId = null;  // 現在選択されているファイルのID
    let previousPosition = 0;  // 前回再生位置
    let isVoiceCommandActive = false;
    let isListeningForKeyword = false;
    let recognition = null;
    let isMicrophoneActive = false;
    let shouldKeepListening = false; // 継続的に音声認識を続けるかどうか
    
    // CSRFトークンを取得
    function getCSRFToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]').value;
    }
    
    // 時間を分:秒形式でフォーマットする関数
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    // ローカルストレージに再生位置を保存する関数
    function savePlaybackPositionToLocalStorage(fileId, position) {
        if (!fileId) return;
        
        try {
            const positions = JSON.parse(localStorage.getItem('playbackPositions') || '{}');
            positions[fileId] = position;
            localStorage.setItem('playbackPositions', JSON.stringify(positions));
        } catch (error) {
            console.error('ローカルストレージへの保存に失敗しました:', error);
        }
    }
    
    // ローカルストレージから再生位置を取得する関数
    function getPlaybackPositionFromLocalStorage(fileId) {
        try {
            const positions = JSON.parse(localStorage.getItem('playbackPositions') || '{}');
            return positions[fileId] || 0;
        } catch (error) {
            console.error('ローカルストレージからの取得に失敗しました:', error);
            return 0;
        }
    }
    
    // 前回再生位置を保存する関数
    async function savePlaybackPosition(position) {
        if (!currentFileId) return;
        
        // ローカルストレージに保存
        savePlaybackPositionToLocalStorage(currentFileId, position);
        
        // サーバーにも保存（オプション）
        try {
            const response = await fetch('/api/save-position/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify({
                    file_id: currentFileId,
                    position: position
                })
            });
            
            const data = await response.json();
            if (!data.success) {
                console.error('サーバーへの再生位置保存に失敗しました:', data.error);
            }
        } catch (error) {
            console.error('サーバーへの再生位置保存に失敗しました:', error);
        }
    }
    
    // 前回再生位置を取得する関数
    async function getPlaybackPosition(fileId) {
        // まずローカルストレージから取得
        const localPosition = getPlaybackPositionFromLocalStorage(fileId);
        
        // サーバーからも取得（オプション）
        try {
            const response = await fetch(`/api/get-position/${fileId}/`);
            const data = await response.json();
            
            if (data.success) {
                // サーバーの値が新しい場合は更新
                if (data.position > localPosition) {
                    savePlaybackPositionToLocalStorage(fileId, data.position);
                    return data.position;
                }
            }
        } catch (error) {
            console.error('サーバーからの再生位置取得に失敗しました:', error);
        }
        
        return localPosition;
    }
    
    // ファイルをアップロードする関数
    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            uploadProgress.style.display = 'block';
            uploadProgress.querySelector('.progress-bar').style.width = '0%';
            uploadStatus.innerHTML = '<small class="text-info">アップロード中...</small>';
            
            const response = await fetch('/api/upload-lightweight/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCSRFToken()
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                uploadStatus.innerHTML = '<small class="text-success">アップロード成功!</small>';
                
                // 既存のファイルがある場合は停止
                if (currentFileId) {
                    audioPlayer.pause();
                    stopContinuousListening();
                }
                
                // 音声コマンドの状態をリセット
                isVoiceCommandActive = false;
                
                // ファイルリストを更新
                updateFileList(data.file);
                
                // アップロードしたファイルを自動再生
                setTimeout(() => {
                    playFile(data.file.id);
                }, 100);
                
                // モーダルを閉じる
                hideModal('uploadModal');
            } else {
                uploadStatus.innerHTML = `<small class="text-danger">アップロード失敗: ${data.error}</small>`;
            }
        } catch (error) {
            console.error('アップロードエラー:', error);
            uploadStatus.innerHTML = '<small class="text-danger">アップロードエラーが発生しました</small>';
        } finally {
            uploadProgress.style.display = 'none';
        }
    }
    
    // ファイルを削除する関数
    async function deleteFile(fileId) {
        if (!confirm('このファイルを削除しますか？')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/delete/${fileId}/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': getCSRFToken()
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // 現在選択中のファイルが削除された場合
                if (currentFileId === fileId) {
                    audioPlayer.pause();
                    audioPlayer.src = '';
                    audioPlayer.currentTime = 0;
                    currentFileId = null;
                    // 再生ボタンを無効化してグレーに戻す
                    playPauseBtn.disabled = true;
                    playPauseBtn.classList.remove('btn-primary');
                    playPauseBtn.classList.add('btn-secondary');
                    playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                    // 再生時間表示もリセット
                    currentTimeDisplay.textContent = '0.0';
                    durationDisplay.textContent = '0.0';
                }
                
                // ファイルリストを空の状態に更新
                const sessionFilesList = document.getElementById('session-files-list');
                sessionFilesList.innerHTML = '<p class="text-muted">アップロードされたファイルはありません</p>';
                
                // 音声コマンドを停止
                stopContinuousListening();
                document.getElementById('voice-status').innerHTML = '<small class="text-muted">ファイルが選択されていません</small>';
            } else {
                alert('ファイルの削除に失敗しました: ' + data.error);
            }
        } catch (error) {
            console.error('削除エラー:', error);
            alert('ファイルの削除中にエラーが発生しました');
        }
    }
    
    // ファイルリストを更新する関数
    function updateFileList(fileInfo) {
        // セッションファイルリストを完全に更新
        const sessionFilesList = document.getElementById('session-files-list');
        
        // 既存の内容をクリア
        sessionFilesList.innerHTML = '';
        
        // ファイルリストのヘッダーを追加
        const header = document.createElement('h6');
        header.textContent = 'セッション内のファイル:';
        sessionFilesList.appendChild(header);
        
        // ファイルリストのコンテナを作成
        const listGroup = document.createElement('div');
        listGroup.className = 'list-group';
        sessionFilesList.appendChild(listGroup);
        
        // 新しいファイルアイテムを作成
        const fileItem = document.createElement('div');
        fileItem.className = 'list-group-item d-flex justify-content-between align-items-center';
        fileItem.setAttribute('data-file-id', fileInfo.id);
        
        fileItem.innerHTML = `
            <span>${fileInfo.title}</span>
            <button class="btn btn-sm btn-danger delete-file-btn" data-file-id="${fileInfo.id}">
                <i class="bi bi-trash"></i>
            </button>
        `;
        
        listGroup.appendChild(fileItem);
    }
    
    // ファイルのURLを取得する関数（軽量版）
    async function getFileUrl(fileId) {
        try {
            const response = await fetch(`/api/file-url-lightweight/${fileId}/`);
            const data = await response.json();
            
            if (data.success) {
                return data.file_url;
            } else {
                console.error('ファイルURLの取得に失敗しました:', data.error);
                return null;
            }
        } catch (error) {
            console.error('ファイルURLの取得に失敗しました:', error);
            return null;
        }
    }
    
    // 音声コマンドを実行する関数
    async function executeVoiceCommand() {
        try {
            // 音声認識でコマンドを取得
            const command = await listenForCommand();
            
            if (command) {
                // コマンドに応じた処理
                switch (command) {
                    case 'go_back':
                        // ★デバッグ用：previousPositionの値を確認★
                        console.log('デバッグ - previousPosition:', previousPosition);
                        console.log('デバッグ - currentFileId:', currentFileId);
                        
                        if (previousPosition > 0 && currentFileId) {
                            audioPlayer.currentTime = previousPosition;
                            console.log('前回再生位置に戻りました:', formatTime(previousPosition));
                            voiceStatus.innerHTML = '<small class="text-success">前回再生位置に戻りました</small>';
                        } else {
                            voiceStatus.innerHTML = '<small class="text-warning">前回再生位置がありません</small>';
                        }
                        break;
                    case 'stop':
                        audioPlayer.pause();
                        playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                        console.log('再生を停止しました');
                        voiceStatus.innerHTML = '<small class="text-success">再生を停止しました</small>';
                        break;
                    case 'play':
                        audioPlayer.play();
                        playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                        console.log('再生を開始しました');
                        voiceStatus.innerHTML = '<small class="text-success">再生を開始しました</small>';
                        break;
                    default:
                        voiceStatus.innerHTML = '<small class="text-warning">認識できませんでした</small>';
                        break;
                }
            } else {
                voiceStatus.innerHTML = '<small class="text-warning">コマンドを認識できませんでした</small>';
            }
        } catch (error) {
            console.error('音声コマンドの実行に失敗しました:', error);
            voiceStatus.innerHTML = '<small class="text-danger">音声コマンドの実行に失敗しました</small>';
        } finally {
            isVoiceCommandActive = false;
            voiceCommandBtn.disabled = false;
            
            // 常時マイクオンを再開
            setTimeout(() => {
                if (shouldKeepListening) {
                    startContinuousListening();
                }
            }, 1000);
        }
    }
    
    // コマンド認識用の音声認識
    function listenForCommand() {
        return new Promise((resolve, reject) => {
            if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
                reject(new Error('音声認識APIがサポートされていません'));
                return;
            }
            
            const commandRecognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            commandRecognition.continuous = false;
            commandRecognition.interimResults = false;
            commandRecognition.lang = 'ja-JP';
            commandRecognition.maxAlternatives = 1;
            
            commandRecognition.onstart = function() {
                console.log('コマンド認識を開始しました');
                voiceStatus.innerHTML = '<small class="text-warning">コマンドを聞いています...</small>';
            };
            
            commandRecognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                console.log('認識されたコマンド:', transcript);
                
                // コマンドの判定
                if (transcript.includes('戻って') || transcript.includes('もどって')) {
                    resolve('go_back');
                } else if (transcript.includes('停止') || transcript.includes('とめる')) {
                    resolve('stop');
                } else if (transcript.includes('再生') || transcript.includes('さいせい')) {
                    resolve('play');
                } else {
                    resolve(null);
                }
            };
            
            commandRecognition.onerror = function(event) {
                console.error('コマンド認識エラー:', event.error);
                reject(new Error(event.error));
            };
            
            commandRecognition.onend = function() {
                console.log('コマンド認識が終了しました');
            };
            
            // 5秒でタイムアウト
            setTimeout(() => {
                commandRecognition.stop();
                reject(new Error('タイムアウト'));
            }, 5000);
            
            commandRecognition.start();
        });
    }
    
    // CSSスタイルを動的に適用
    function applyCustomStyles() {
        const style = document.createElement('style');
        style.textContent = `
            input[type=range].form-range {
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
                appearance: none !important;
                background: transparent !important;
                outline: none !important;
                border: none !important;
            }
            
            input[type=range].form-range::-webkit-slider-thumb {
                -webkit-appearance: none !important;
                appearance: none !important;
                width: 16px !important;
                height: 16px !important;
                border-radius: 50% !important;
                background: #007bff !important;
                cursor: pointer !important;
                border: 2px solid #fff !important;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            
            input[type=range].form-range::-moz-range-thumb {
                width: 16px !important;
                height: 16px !important;
                border-radius: 50% !important;
                background: #007bff !important;
                cursor: pointer !important;
                border: 2px solid #fff !important;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            
            input[type=range].form-range::-webkit-slider-track {
                width: 100% !important;
                height: 6px !important;
                background: #e9ecef !important;
                border-radius: 3px !important;
                cursor: pointer !important;
                border: none !important;
                outline: none !important;
            }
            
            input[type=range].form-range::-moz-range-track {
                width: 100% !important;
                height: 6px !important;
                background: #e9ecef !important;
                border-radius: 3px !important;
                cursor: pointer !important;
                border: none !important;
                outline: none !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    // スタイルを適用
    applyCustomStyles();
    
    // 初期状態では再生ボタンを無効化
    playPauseBtn.disabled = true;
    playPauseBtn.classList.remove('btn-primary');
    playPauseBtn.classList.add('btn-secondary');
    
    // 音声認識を初期化
    initializeSpeechRecognition();
    
    // 音声コマンドボタンの初期状態を設定
    voiceCommandBtn.innerHTML = '<i class="bi bi-mic-mute"></i> マイク開始';
    voiceStatus.innerHTML = '<small class="text-muted">ファイルを選択してください</small>';
    
    // 初期状態でシークバーを設定
    seekBars.forEach((bar, index) => {
        if (index === 0) {
            bar.classList.add('seek-bar-active');
        } else {
            bar.classList.add('seek-bar-inactive');
        }
    });
    
    // 波形表示エリアを初期化
    if (waveformCanvas && waveformCanvas2) {
        const ctx = waveformCanvas.getContext('2d');
        const ctx2 = waveformCanvas2.getContext('2d');
        
        // 背景を描画
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        ctx2.fillStyle = '#f8f9fa';
        ctx2.fillRect(0, 0, waveformCanvas2.width, waveformCanvas2.height);
        
        // 初期メッセージを表示
        ctx.fillStyle = '#6c757d';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('音楽ファイルを選択すると波形が表示されます', waveformCanvas.width / 2, waveformCanvas.height / 2);
        
        ctx2.fillStyle = '#6c757d';
        ctx2.font = '16px Arial';
        ctx2.textAlign = 'center';
        ctx2.fillText('音楽ファイルを選択すると波形が表示されます', waveformCanvas2.width / 2, waveformCanvas2.height / 2);
    }
    
    // 時間表示の更新
    function updateTimeDisplay() {
        if (audioPlayer.duration) {
            const currentTime = audioPlayer.currentTime;
            const duration = audioPlayer.duration;
            
            currentTimeDisplay.textContent = formatTime(currentTime);
            durationDisplay.textContent = formatTime(duration);
            
            // シークバーの更新
            const progress = (currentTime / duration) * 100;
            seekBars.forEach((bar, index) => {
                const startPercent = index * 20;
                const endPercent = (index + 1) * 20;
                
                // 再生中のシークバーかどうかを判定
                const isActive = startPercent <= progress && progress < endPercent;
                
                if (isActive) {
                    bar.classList.remove('seek-bar-inactive');
                    bar.classList.add('seek-bar-active');
                    bar.value = progress;
                } else {
                    bar.classList.remove('seek-bar-active');
                    bar.classList.add('seek-bar-inactive');
                    bar.value = startPercent;
                }
            });
            
            // 波形の再生位置を更新
            updateCurrentPlaybackPosition();
        }
    }
    
    // 再生速度表示の更新
    function updateSpeedDisplay() {
        speedDisplay.textContent = `${currentSpeed.toFixed(2)}x`;
    }
    
    // 波形表示機能
    function drawWaveform() {
        if (!audioData || !waveformCanvas) return;
        
        const ctx = waveformCanvas.getContext('2d');
        const ctx2 = waveformCanvas2.getContext('2d');
        const canvasWidth = waveformCanvas.width;
        const canvasHeight = waveformCanvas.height;
        
        // キャンバスをクリア
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx2.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // データを2段に分割
        const halfLength = Math.floor(audioData.length / 2);
        const firstHalf = audioData.slice(0, halfLength);
        const secondHalf = audioData.slice(halfLength);
        
        // 第1段の波形を描画
        drawWaveformSegment(ctx, firstHalf, canvasWidth, canvasHeight, 0, audioDuration / 2);
        
        // 第2段の波形を描画
        drawWaveformSegment(ctx2, secondHalf, canvasWidth, canvasHeight, audioDuration / 2, audioDuration);
    }
    
    function drawWaveformSegment(ctx, data, width, height, startTime, endTime) {
        const step = Math.ceil(data.length / width);
        const centerY = height / 2;
        
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        for (let i = 0; i < width; i++) {
            const dataIndex = i * step;
            if (dataIndex < data.length) {
                const value = data[dataIndex];
                const y = centerY + (value * centerY);
                if (i === 0) {
                    ctx.moveTo(i, y);
                } else {
                    ctx.lineTo(i, y);
                }
            }
        }
        
        ctx.stroke();
    }
    
    function updateCurrentPlaybackPosition() {
        if (!audioPlayer.duration || !waveformCanvas || !waveformCanvas2) return;
        
        const currentTime = audioPlayer.currentTime;
        const duration = audioPlayer.duration;
        const progress = currentTime / duration;
        
        // 第1段と第2段のキャンバス
        const canvas1 = waveformCanvas;
        const canvas2 = waveformCanvas2;
        const ctx1 = canvas1.getContext('2d');
        const ctx2 = canvas2.getContext('2d');
        
        // 既存の波形を再描画
        drawWaveform();
        
        // 再生位置の線を描画
        const canvasWidth = canvas1.width;
        const canvasHeight = canvas1.height;
        
        if (progress <= 0.5) {
            // 第1段に表示
            const x = (progress * 2) * canvasWidth;
            ctx1.strokeStyle = '#28a745';
            ctx1.lineWidth = 2;
            ctx1.beginPath();
            ctx1.moveTo(x, 0);
            ctx1.lineTo(x, canvasHeight);
            ctx1.stroke();
        } else {
            // 第2段に表示
            const x = ((progress - 0.5) * 2) * canvasWidth;
            ctx2.strokeStyle = '#28a745';
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ctx2.moveTo(x, 0);
            ctx2.lineTo(x, canvasHeight);
            ctx2.stroke();
        }
    }
    
    // 音声データを読み込む
    async function loadAudioData() {
        if (!audioPlayer.src) return;
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const response = await fetch(audioPlayer.src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // 音声データを取得
            const channelData = audioBuffer.getChannelData(0);
            audioData = channelData;
            audioDuration = audioBuffer.duration;
            
            // 波形を描画
            drawWaveform();
            
        } catch (error) {
            console.error('音声データの読み込みに失敗しました:', error);
        }
    }
    
    // モーダル表示関数
    function showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
            modal.classList.add('show');
        }
    }
    
    // モーダル非表示関数
    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
        }
    }
    
    // ファイルを自動再生する関数
    async function playFile(fileId) {
        if (!fileId) return;
        currentFileId = fileId;
        // ファイルのURLを取得（軽量版）
        const fileUrl = await getFileUrl(fileId);
        if (fileUrl) {
            // 1. srcをセットし、load()を必ず呼ぶ
            audioPlayer.src = fileUrl;
            audioPlayer.load();

            // 2. canplayイベントの多重バインドを防ぐ
            const onCanPlay = async function() {
                audioPlayer.removeEventListener('canplay', onCanPlay);
                // 3. 再生ボタン有効化・UI更新
                playPauseBtn.disabled = false;
                playPauseBtn.classList.remove('btn-secondary');
                playPauseBtn.classList.add('btn-primary');
                // 前回再生位置を取得
                const savedPosition = await getPlaybackPosition(currentFileId);
                previousPosition = savedPosition;
                if (savedPosition > 0) {
                    audioPlayer.currentTime = savedPosition;
                }
                // 4. 自動再生
                audioPlayer.play();
                playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                // 5. isVoiceCommandActiveリセット＆マイクON
                isVoiceCommandActive = false;
                setTimeout(() => {
                    if (!isVoiceCommandActive) {
                        startVoiceCommand();
                        document.getElementById('voice-status').innerHTML = '<small class="text-success">音声コマンドON</small>';
                    }
                }, 300);
            };
            audioPlayer.removeEventListener('canplay', onCanPlay); // 念のため解除
            audioPlayer.addEventListener('canplay', onCanPlay);
        } else {
            alert('ファイルの読み込みに失敗しました');
            currentFileId = null;
            playPauseBtn.disabled = true;
        }
    }
    
    // 再生/停止ボタンのイベント
    playPauseBtn.addEventListener('click', function() {
        if (audioPlayer.paused) {
            audioPlayer.play();
            this.innerHTML = '<i class="bi bi-pause-fill"></i>';
        } else {
            // 停止前に現在位置を保存
            if (currentFileId && audioPlayer.duration) {
                const currentPosition = audioPlayer.currentTime;
                savePlaybackPosition(currentPosition);
                previousPosition = currentPosition;
            }
            audioPlayer.pause();
            this.innerHTML = '<i class="bi bi-play-fill"></i>';
        }
    });
    
    // 音声プレーヤーのイベント
    audioPlayer.addEventListener('timeupdate', updateTimeDisplay);
    
    audioPlayer.addEventListener('ended', function() {
        if (loopCheck.checked) {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        } else {
            playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        }
    });
    
    audioPlayer.addEventListener('loadedmetadata', function() {
        updateTimeDisplay();
    });
    
    // シークバーのイベント
    seekBars.forEach((bar, index) => {
        bar.addEventListener('mousedown', function() {
            isSeeking = true;
            wasPlaying = !audioPlayer.paused;
            if (wasPlaying) {
                audioPlayer.pause();
            }
        });
        
        bar.addEventListener('input', function() {
            if (audioPlayer.duration) {
                const progress = parseFloat(this.value);
                const newTime = (progress / 100) * audioPlayer.duration;
                audioPlayer.currentTime = newTime;
                updateTimeDisplay();
            }
        });
        
        bar.addEventListener('mouseup', function() {
            isSeeking = false;
            if (audioPlayer.duration && currentFileId) {
                const progress = parseFloat(this.value);
                const newTime = (progress / 100) * audioPlayer.duration;
                savePlaybackPosition(newTime);
                previousPosition = newTime;
            }
            if (wasPlaying) {
                audioPlayer.play();
            }
        });
    });
    
    // 再生速度のイベント
    speedRange.addEventListener('input', function() {
        currentSpeed = parseFloat(this.value);
        audioPlayer.playbackRate = currentSpeed;
        updateSpeedDisplay();
        currentSpeedDisplay.textContent = currentSpeed.toFixed(2);
    });
    
    // ループチェックボックスのイベント
    loopCheck.addEventListener('change', function() {
        audioPlayer.loop = this.checked;
    });
    
    // 速度ボタンのイベント
    speedBtn.addEventListener('click', function() {
        showModal('speedModal');
    });
    
    // アップロードボタンのイベント
    uploadBtn.addEventListener('click', function() {
        showModal('uploadModal');
    });
    
    // ファイル削除ボタンのイベント
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-file-btn') || (e.target.closest('.delete-file-btn'))) {
            const btn = e.target.classList.contains('delete-file-btn') ? e.target : e.target.closest('.delete-file-btn');
            const fileId = btn.getAttribute('data-file-id');
            deleteFile(fileId);
        }
    });
    
    // アップロード送信ボタンのイベント
    uploadSubmitBtn.addEventListener('click', function() {
        const file = fileInput.files[0];
        if (file) {
            uploadFile(file);
        } else {
            uploadStatus.innerHTML = '<small class="text-warning">ファイルを選択してください</small>';
        }
    });
    
    // モーダル閉じるボタンのイベント
    document.getElementById('speedModalClose').addEventListener('click', function() {
        hideModal('speedModal');
    });
    
    document.getElementById('speedModalCloseBtn').addEventListener('click', function() {
        hideModal('speedModal');
    });
    
    document.getElementById('uploadModalClose').addEventListener('click', function() {
        hideModal('uploadModal');
    });
    
    document.getElementById('uploadModalCloseBtn').addEventListener('click', function() {
        hideModal('uploadModal');
    });
    
    // モーダル外クリックで閉じる
    window.addEventListener('click', function(event) {
        const speedModal = document.getElementById('speedModal');
        const uploadModal = document.getElementById('uploadModal');
        
        if (event.target === speedModal) {
            hideModal('speedModal');
        }
        if (event.target === uploadModal) {
            hideModal('uploadModal');
        }
    });
    
    // ページ離脱時に再生位置を保存
    window.addEventListener('beforeunload', function() {
        if (currentFileId && audioPlayer.currentTime > 0) {
            savePlaybackPosition(audioPlayer.currentTime);
        }
    });
    
    // コマンド実行
    function executeCommand(commandText) {
        console.log('⚡ コマンドを実行中:', commandText);
        
        try {
            // コマンドの判定
            if (commandText.includes('戻って') || commandText.includes('もどって')) {
                console.log('🔄 「戻って」コマンドを実行');
                if (previousPosition > 0 && currentFileId) {
                    console.log('🔄 前回再生位置:', previousPosition, '現在のファイルID:', currentFileId);
                    // audioPlayerが準備できているか確認
                    if (audioPlayer.readyState >= 2) { // HAVE_CURRENT_DATA以上
                        audioPlayer.currentTime = previousPosition;
                        voiceStatus.innerHTML = '<small class="text-success">前回再生位置に戻りました</small>';
                        console.log('✅ 前回再生位置に戻りました:', formatTime(previousPosition));
                    } else {
                        // audioPlayerが準備できていない場合は、準備完了を待つ
                        console.log('⏳ audioPlayerの準備を待機中...');
                        audioPlayer.addEventListener('canplay', function onCanPlay() {
                            audioPlayer.removeEventListener('canplay', onCanPlay);
                            audioPlayer.currentTime = previousPosition;
                            voiceStatus.innerHTML = '<small class="text-success">前回再生位置に戻りました</small>';
                            console.log('✅ 前回再生位置に戻りました:', formatTime(previousPosition));
                        }, { once: true });
                    }
                } else {
                    voiceStatus.innerHTML = '<small class="text-warning">前回再生位置がありません</small>';
                    console.log('⚠️ 前回再生位置がありません');
                }
            } else if (commandText.includes('最初から') || commandText.includes('初めから')) {
                console.log('🔄 「最初から」コマンドを実行');
                // audioPlayerが準備できているか確認
                if (audioPlayer.readyState >= 2) { // HAVE_CURRENT_DATA以上
                    audioPlayer.currentTime = 0;
                    audioPlayer.play();
                    playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                    voiceStatus.innerHTML = '<small class="text-success">最初から再生を開始しました</small>';
                    console.log('✅ 最初から再生を開始しました');
                } else {
                    // audioPlayerが準備できていない場合は、準備完了を待つ
                    console.log('⏳ audioPlayerの準備を待機中...');
                    audioPlayer.addEventListener('canplay', function onCanPlay() {
                        audioPlayer.removeEventListener('canplay', onCanPlay);
                        audioPlayer.currentTime = 0;
                        audioPlayer.play();
                        playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                        voiceStatus.innerHTML = '<small class="text-success">最初から再生を開始しました</small>';
                        console.log('✅ 最初から再生を開始しました');
                    }, { once: true });
                }
            } else if (commandText.includes('停止') || commandText.includes('とめる') || commandText.includes('ストップ')) {
                console.log('🔄 「停止」コマンドを実行');
                // 停止前に現在位置を保存
                if (currentFileId && audioPlayer.duration) {
                    const currentPosition = audioPlayer.currentTime;
                    savePlaybackPosition(currentPosition);
                    previousPosition = currentPosition;
                    console.log('💾 再生位置を保存:', formatTime(currentPosition));
                }
                audioPlayer.pause();
                playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                voiceStatus.innerHTML = '<small class="text-success">再生を停止しました</small>';
                console.log('✅ 再生を停止しました');
            } else if (commandText.includes('再生') || commandText.includes('さいせい') || commandText.includes('スタート')) {
                console.log('🔄 「再生」コマンドを実行');
                if (audioPlayer.readyState >= 2) { // HAVE_CURRENT_DATA以上
                    audioPlayer.play();
                    playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                    voiceStatus.innerHTML = '<small class="text-success">再生を開始しました</small>';
                    console.log('✅ 再生を開始しました');
                } else {
                    // audioPlayerが準備できていない場合は、準備完了を待つ
                    console.log('⏳ audioPlayerの準備を待機中...');
                    audioPlayer.addEventListener('canplay', function onCanPlay() {
                        audioPlayer.removeEventListener('canplay', onCanPlay);
                        audioPlayer.play();
                        playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                        voiceStatus.innerHTML = '<small class="text-success">再生を開始しました</small>';
                        console.log('✅ 再生を開始しました');
                    }, { once: true });
                }
            } else {
                console.log('❓ 認識できないコマンド:', commandText);
                voiceStatus.innerHTML = '<small class="text-warning">認識できないコマンドです</small>';
            }
        } catch (error) {
            console.error('❌ コマンド実行エラー:', error);
            voiceStatus.innerHTML = '<small class="text-danger">コマンド実行中にエラーが発生しました</small>';
        }
    }
    
    // 音声認識の初期化
    function initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            console.warn('音声認識APIがサポートされていません');
            voiceStatus.innerHTML = '<small class="text-warning">お使いのブラウザは音声認識に対応していません</small>';
            return;
        }
        
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ja-JP';
        recognition.maxAlternatives = 1;
        
        recognition.onstart = function() {
            console.log('🎤 音声認識を開始しました');
            isMicrophoneActive = true;
            updateMicrophoneStatus();
        };
        
        recognition.onresult = function(event) {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // 最終結果がある場合
            if (finalTranscript) {
                console.log('🎯 最終認識結果:', finalTranscript);
                
                // キーワードチェック
                const keyword = checkKeyword(finalTranscript);
                if (keyword) {
                    startVoiceCommandFromKeyword(finalTranscript, keyword);
                }
            }
            
            // 中間結果がある場合（デバッグ用）
            if (interimTranscript) {
                console.log('🔄 中間認識結果:', interimTranscript);
            }
        };
        
        recognition.onerror = function(event) {
            console.error('🎤 音声認識エラー:', event.error);
            if (event.error === 'no-speech') {
                // 音声が検出されなかった場合は再開
                if (shouldKeepListening) {
                    setTimeout(() => {
                        if (shouldKeepListening) {
                            recognition.start();
                        }
                    }, 1000);
                }
            } else {
                isMicrophoneActive = false;
                updateMicrophoneStatus();
            }
        };
        
        recognition.onend = function() {
            console.log('🎤 音声認識が終了しました');
            isMicrophoneActive = false;
            updateMicrophoneStatus();
            
            // 継続的に聞き続ける場合
            if (shouldKeepListening) {
                setTimeout(() => {
                    if (shouldKeepListening) {
                        recognition.start();
                    }
                }, 1000);
            }
        };
    }
    
    // キーワードチェック
    function checkKeyword(text) {
        const keywords = ['戻って', 'もどって', '停止', 'とめる', 'ストップ', '再生', 'さいせい', 'スタート', '最初から', '初めから'];
        
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                return keyword;
            }
        }
        return null;
    }
    
    // キーワードから音声コマンドを開始
    function startVoiceCommandFromKeyword(keywordText, keyword) {
        console.log('🎯 キーワード検出:', keyword, 'テキスト:', keywordText);
        
        // 音声認識を一時停止
        if (recognition) {
            recognition.stop();
        }
        
        // コマンドを実行
        executeCommand(keywordText);
        
        // 少し待ってから音声認識を再開
        setTimeout(() => {
            if (shouldKeepListening) {
                startContinuousListening();
            }
        }, 2000);
    }
    
    // 音声コマンドボタンのイベント
    voiceCommandBtn.addEventListener('click', function() {
        if (!isVoiceCommandActive) {
            startVoiceCommand();
        }
    });
    
    // 音声コマンドを開始
    function startVoiceCommand() {
        if (isVoiceCommandActive) return;
        
        isVoiceCommandActive = true;
        voiceCommandBtn.disabled = true;
        
        // 継続的な音声認識を開始
        shouldKeepListening = true;
        startContinuousListening();
    }
    
    // マイクの状態を更新
    function updateMicrophoneStatus() {
        if (isMicrophoneActive) {
            voiceCommandBtn.innerHTML = '<i class="bi bi-mic-mute"></i> 音声コマンド (ON)';
            voiceCommandBtn.classList.remove('btn-warning');
            voiceCommandBtn.classList.add('btn-success');
        } else {
            voiceCommandBtn.innerHTML = '<i class="bi bi-mic"></i> 音声コマンド';
            voiceCommandBtn.classList.remove('btn-success');
            voiceCommandBtn.classList.add('btn-warning');
        }
    }
    
    // 継続的な音声認識を開始
    function startContinuousListening() {
        if (recognition && shouldKeepListening) {
            try {
                recognition.start();
            } catch (error) {
                console.error('音声認識の開始に失敗しました:', error);
            }
        }
    }
    
    // 継続的な音声認識を停止
    function stopContinuousListening() {
        shouldKeepListening = false;
        if (recognition) {
            recognition.stop();
        }
        isVoiceCommandActive = false;
        voiceCommandBtn.disabled = false;
        updateMicrophoneStatus();
    }
    
    // 初期化
    applyCustomStyles();
    initializeSpeechRecognition();
    
    // 1. ページロード時にセッション内のファイルがあれば自動再生＆マイクON
    if (sessionFilesList) {
        const fileItem = sessionFilesList.querySelector('.list-group-item[data-file-id]');
        if (fileItem) {
            const fileId = fileItem.getAttribute('data-file-id');
            if (fileId) {
                playFile(fileId);
            }
        }
    }

    // ページ離脱時に音声認識を停止
    window.addEventListener('beforeunload', function() {
        stopContinuousListening();
    });
}); 