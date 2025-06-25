document.addEventListener('DOMContentLoaded', function() {
    const audioPlayer = document.getElementById('audio-player');
    const musicSelect = document.getElementById('music-select');
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
    
    let isSeeking = false;
    let wasPlaying = false;
    let currentActiveBar = 0;
    let currentSpeed = 1.0;
    let seekTimeout = null;
    let audioData = null;  // 音声データ（波形表示用）
    let audioDuration = 0;  // 音声の長さ
    let currentMusicFileId = null;  // 現在選択されている音楽ファイルのID
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
    
    // 前回再生位置を保存する関数
    async function savePlaybackPosition(position) {
        if (!currentMusicFileId) return;
        
        try {
            const response = await fetch('/api/save-position/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                body: JSON.stringify({
                    music_file_id: currentMusicFileId,
                    position: position
                })
            });
            
            const data = await response.json();
            if (data.success) {
                // 保存成功
            } else {
                console.error('再生位置の保存に失敗しました:', data.error);
            }
        } catch (error) {
            console.error('再生位置の保存に失敗しました:', error);
        }
    }
    
    // 前回再生位置を取得する関数
    async function getPlaybackPosition(musicFileId) {
        try {
            const response = await fetch(`/api/get-position/${musicFileId}/`);
            const data = await response.json();
            
            if (data.success) {
                previousPosition = data.position;
                return data.position;
            } else {
                console.error('前回再生位置の取得に失敗しました:', data.error);
            }
        } catch (error) {
            console.error('前回再生位置の取得に失敗しました:', error);
        }
        return 0;
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
                        console.log('デバッグ - currentMusicFileId:', currentMusicFileId);
                        
                        if (previousPosition > 0 && currentMusicFileId) {
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
                resolve(null);
            }, 500000);
            
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
    
    // 音楽ファイル選択時の処理
    musicSelect.addEventListener('change', async function() {
        const selectedOption = this.options[this.selectedIndex];
        const musicFileId = this.value;
        
        if (musicFileId) {
            currentMusicFileId = parseInt(musicFileId);
            const musicUrl = selectedOption.getAttribute('data-url');
            
            // 音声プレーヤーのソースを設定
            audioPlayer.src = musicUrl;
            
            // 前回再生位置を取得
            const savedPosition = await getPlaybackPosition(currentMusicFileId);
            
            // 音声データを読み込み
            await loadAudioData();
            
            // 再生ボタンを有効化
            playPauseBtn.disabled = false;
            playPauseBtn.classList.remove('btn-secondary');
            playPauseBtn.classList.add('btn-primary');
            
            // 音声認識を開始
            setTimeout(() => {
                startContinuousListening();
                voiceStatus.innerHTML = '<small class="text-success">マイクオン - 再生中は「はい」、停止中は「行きます」で音声コマンド開始</small>';
            }, 1000);
            
            // 前回再生位置がある場合は確認ダイアログを表示
            if (savedPosition > 0) {
                const shouldResume = confirm(`前回再生位置（${formatTime(savedPosition)}）から再生しますか？`);
                if (shouldResume) {
                    audioPlayer.currentTime = savedPosition;
                }
            }
        } else {
            currentMusicFileId = null;
            audioPlayer.src = '';
            playPauseBtn.disabled = true;
            playPauseBtn.classList.remove('btn-primary');
            playPauseBtn.classList.add('btn-secondary');
            
            // 音声認識を停止
            stopContinuousListening();
            voiceStatus.innerHTML = '<small class="text-muted">ファイルを選択してください</small>';
            
            // 波形表示をリセット
            if (waveformCanvas && waveformCanvas2) {
                const ctx = waveformCanvas.getContext('2d');
                const ctx2 = waveformCanvas2.getContext('2d');
                
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
                ctx2.fillStyle = '#f8f9fa';
                ctx2.fillRect(0, 0, waveformCanvas2.width, waveformCanvas2.height);
                
                ctx.fillStyle = '#6c757d';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('音楽ファイルを選択すると波形が表示されます', waveformCanvas.width / 2, waveformCanvas.height / 2);
                
                ctx2.fillStyle = '#6c757d';
                ctx2.font = '16px Arial';
                ctx2.textAlign = 'center';
                ctx2.fillText('音楽ファイルを選択すると波形が表示されます', waveformCanvas2.width / 2, waveformCanvas2.height / 2);
            }
        }
    });
    
    // 音声認識の初期化
    function initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'ja-JP';
            
            recognition.onstart = function() {
                isMicrophoneActive = true;
                updateMicrophoneStatus();
            };
            
            recognition.onresult = function(event) {
                let interimTranscript = '';
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // キーワード検出
                if (finalTranscript) {
                    checkKeyword(finalTranscript);
                }
            };
            
            recognition.onerror = function(event) {
                console.error('音声認識エラー:', event.error);
                if (event.error === 'no-speech') {
                    // 無音の場合は再開
                    if (shouldKeepListening) {
                        setTimeout(() => {
                            if (shouldKeepListening) {
                                recognition.start();
                            }
                        }, 1000);
                    }
                } else {
                    // その他のエラーの場合も再開を試行
                    setTimeout(() => {
                        if (shouldKeepListening) {
                            recognition.start();
                        }
                    }, 2000);
                }
            };
            
            recognition.onend = function() {
                isMicrophoneActive = false;
                updateMicrophoneStatus();
                
                // 継続的に音声認識を続けるべき場合は再開
                if (shouldKeepListening) {
                    setTimeout(() => {
                        if (shouldKeepListening) {
                            recognition.start();
                        }
                    }, 1000);
                }
            };
        } else {
            console.error('音声認識APIがサポートされていません');
        }
    }
    
    // キーワード検出
    function checkKeyword(text) {
        const isPlaying = !audioPlayer.paused;
        
        if (isPlaying) {
            // 音楽再生中は「はい」が含まれている場合
            if (text.includes('はい') || text.includes('ハイ')) {
                startVoiceCommandFromKeyword(text, 'はい');
            }
        } else {
            // 音楽停止中は「行きます」が含まれている場合
            if (text.includes('行きます') || text.includes('いきます') || text.includes('イキマス')) {
                startVoiceCommandFromKeyword(text, '行きます');
            }
        }
    }
    
    // キーワード検出からの音声コマンド開始
    function startVoiceCommandFromKeyword(keywordText, keyword) {
        if (isVoiceCommandActive) return;
        
        isVoiceCommandActive = true;
        voiceCommandBtn.disabled = true;
        voiceStatus.innerHTML = '<small class="text-warning">コマンドを聞いています...</small>';
        
        // キーワード部分を除いたコマンド部分を抽出
        let commandText;
        if (keyword === 'はい') {
            commandText = keywordText.replace(/はい|ハイ/g, '').trim();
        } else if (keyword === '行きます') {
            commandText = keywordText.replace(/行きます|いきます|イキマス/g, '').trim();
        }
        
        // 空のコマンドの場合は処理しない
        if (!commandText) {
            isVoiceCommandActive = false;
            voiceCommandBtn.disabled = false;
            setTimeout(() => {
                if (shouldKeepListening) {
                    startContinuousListening();
                }
            }, 1000);
            return;
        }
        
        // コマンドを実行
        executeCommand(commandText);
    }
    
    // 音声コマンド開始（ボタンからの場合）
    function startVoiceCommand() {
        if (isVoiceCommandActive) return;
        
        isVoiceCommandActive = true;
        voiceCommandBtn.disabled = true;
        voiceStatus.innerHTML = '<small class="text-warning">音声を聞いています...</small>';
        
        // 一時的に音声認識を停止して、コマンド認識に集中
        if (recognition) {
            recognition.stop();
        }
        
        executeVoiceCommand();
    }
    
    // マイク状態の更新
    function updateMicrophoneStatus() {
        if (isMicrophoneActive) {
            voiceStatus.innerHTML = '<small class="text-success">マイクオン - キーワード待機中</small>';
        } else {
            voiceStatus.innerHTML = '<small class="text-muted">マイクオフ</small>';
        }
    }
    
    // 常時マイクオン開始
    function startContinuousListening() {
        if (recognition && !isMicrophoneActive) {
            shouldKeepListening = true;
            recognition.start();
        }
    }
    
    // 常時マイクオン停止
    function stopContinuousListening() {
        if (recognition && isMicrophoneActive) {
            shouldKeepListening = false;
            recognition.stop();
        }
    }
    
    // 音声コマンドボタンのイベント
    voiceCommandBtn.addEventListener('click', function() {
        if (isMicrophoneActive) {
            // マイクがオンの場合は停止
            stopContinuousListening();
            voiceCommandBtn.innerHTML = '<i class="bi bi-mic-mute"></i> マイク開始';
            voiceStatus.innerHTML = '<small class="text-muted">マイクオフ</small>';
        } else {
            // マイクがオフの場合は開始
            startContinuousListening();
            voiceCommandBtn.innerHTML = '<i class="bi bi-mic"></i> マイク停止';
            voiceStatus.innerHTML = '<small class="text-success">マイクオン - 再生中は「はい」、停止中は「行きます」で音声コマンド開始</small>';
        }
    });
    
    // 再生/一時停止ボタンのイベント
    playPauseBtn.addEventListener('click', function() {
        if (audioPlayer.paused) {
            audioPlayer.play();
            this.innerHTML = '<i class="bi bi-pause-fill"></i>';
        } else {
            // 停止前に現在位置を保存
            if (currentMusicFileId && audioPlayer.duration) {
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
            if (audioPlayer.duration && currentMusicFileId) {
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
        if (currentMusicFileId && audioPlayer.currentTime > 0) {
            savePlaybackPosition(audioPlayer.currentTime);
        }
    });
    
    // コマンド実行
    function executeCommand(commandText) {
        try {
            // コマンドの判定
            if (commandText.includes('戻って') || commandText.includes('もどって')) {
                if (previousPosition > 0 && currentMusicFileId) {
                    // audioPlayerが準備できているか確認
                    if (audioPlayer.readyState >= 2) { // HAVE_CURRENT_DATA以上
                        audioPlayer.currentTime = previousPosition;
                        voiceStatus.innerHTML = '<small class="text-success">前回再生位置に戻りました</small>';
                    } else {
                        // audioPlayerが準備できていない場合は、準備完了を待つ
                        audioPlayer.addEventListener('canplay', function onCanPlay() {
                            audioPlayer.removeEventListener('canplay', onCanPlay);
                            audioPlayer.currentTime = previousPosition;
                            voiceStatus.innerHTML = '<small class="text-success">前回再生位置に戻りました</small>';
                        }, { once: true });
                    }
                } else {
                    voiceStatus.innerHTML = '<small class="text-warning">前回再生位置がありません</small>';
                }
            } else if (commandText.includes('最初から') || commandText.includes('初めから')) {
                // audioPlayerが準備できているか確認
                if (audioPlayer.readyState >= 2) { // HAVE_CURRENT_DATA以上
                    audioPlayer.currentTime = 0;
                    audioPlayer.play();
                    playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                    voiceStatus.innerHTML = '<small class="text-success">最初から再生を開始しました</small>';
                } else {
                    // audioPlayerが準備できていない場合は、準備完了を待つ
                    audioPlayer.addEventListener('canplay', function onCanPlay() {
                        audioPlayer.removeEventListener('canplay', onCanPlay);
                        audioPlayer.currentTime = 0;
                        audioPlayer.play();
                        playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                        voiceStatus.innerHTML = '<small class="text-success">最初から再生を開始しました</small>';
                    }, { once: true });
                }
            } else if (commandText.includes('停止') || commandText.includes('とめる') || commandText.includes('ストップ')) {
                // 停止前に現在位置を保存
                if (currentMusicFileId && audioPlayer.duration) {
                    const currentPosition = audioPlayer.currentTime;
                    savePlaybackPosition(currentPosition);
                    previousPosition = currentPosition;
                }
                audioPlayer.pause();
                playPauseBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
                voiceStatus.innerHTML = '<small class="text-success">再生を停止しました</small>';
            } else if (commandText.includes('再生') || commandText.includes('さいせい') || commandText.includes('スタート')) {
                audioPlayer.play();
                playPauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
                voiceStatus.innerHTML = '<small class="text-success">再生を開始しました</small>';
            } else {
                voiceStatus.innerHTML = '<small class="text-warning">認識できませんでした</small>';
            }
        } catch (error) {
            console.error('コマンドの実行に失敗しました:', error);
            voiceStatus.innerHTML = '<small class="text-danger">コマンドの実行に失敗しました</small>';
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
}); 