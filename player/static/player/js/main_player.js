document.addEventListener('DOMContentLoaded', function() {
    const audioPlayer = document.getElementById('audio-player');
    const musicSelect = document.getElementById('music-select');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const currentTimeDisplay = document.getElementById('currentTimeDisplay');
    const durationDisplay = document.getElementById('durationDisplay');
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
    const loopCheck = document.getElementById('loop-check');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const waveformCanvas2 = document.getElementById('waveform-canvas-2');
    
    let isSeeking = false;
    let wasPlaying = false;
    let currentActiveBar = 0;
    let currentSpeed = 1.0;
    let seekTimeout = null;
    let audioData = null;  // 音声データ（波形表示用）
    let audioDuration = 0;  // 音声の長さ
    
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
    
    // 時間を分:秒形式でフォーマットする関数
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    // 初期状態では再生ボタンを無効化
    playPauseBtn.disabled = true;
    playPauseBtn.classList.remove('btn-primary');
    playPauseBtn.classList.add('btn-secondary');
    
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
        const centerY = height / 2;
        const timeRange = endTime - startTime;
        
        // 波形を描画
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        for (let i = 0; i < data.length; i++) {
            const x = (i / data.length) * width;
            const amplitude = data[i] * (height / 2) * 0.8; // 振幅を調整
            const y = centerY + amplitude;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
    }
    
    function updateCurrentPlaybackPosition() {
        if (!waveformCanvas || !waveformCanvas2) return;
        
        const currentTime = audioPlayer.currentTime || 0;
        const ctx = waveformCanvas.getContext('2d');
        const ctx2 = waveformCanvas2.getContext('2d');
        const canvasWidth = waveformCanvas.width;
        const canvasHeight = waveformCanvas.height;
        
        // 音声データがある場合は波形を再描画してから再生位置を描画
        if (audioData && audioDuration > 0) {
            drawWaveform();
        }
        
        // 現在の再生位置を描画
        if (audioDuration > 0) {
            if (currentTime <= audioDuration / 2) {
                // 第1段に描画
                const x = (currentTime / (audioDuration / 2)) * canvasWidth;
                ctx.strokeStyle = '#28a745';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvasHeight);
                ctx.stroke();
            } else {
                // 第2段に描画
                const x = ((currentTime - audioDuration / 2) / (audioDuration / 2)) * canvasWidth;
                ctx2.strokeStyle = '#28a745';
                ctx2.lineWidth = 3;
                ctx2.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvasHeight);
                ctx2.stroke();
            }
        } else {
            // 音声データがない場合でも、現在の再生時間に基づいて位置を表示
            const duration = audioPlayer.duration || 1;
            if (currentTime <= duration / 2) {
                // 第1段に描画
                const x = (currentTime / (duration / 2)) * canvasWidth;
                ctx.strokeStyle = '#28a745';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvasHeight);
                ctx.stroke();
            } else {
                // 第2段に描画
                const x = ((currentTime - duration / 2) / (duration / 2)) * canvasWidth;
                ctx2.strokeStyle = '#28a745';
                ctx2.lineWidth = 3;
                ctx2.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvasHeight);
                ctx2.stroke();
            }
        }
    }
    
    // 音楽選択時の処理
    musicSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value) {
            audioPlayer.src = selectedOption.dataset.url;
            audioPlayer.load();
            
            // 波形データを読み込み
            loadAudioData();
            
            // 再生ボタンを有効化
            playPauseBtn.disabled = false;
            playPauseBtn.classList.remove('btn-secondary');
            playPauseBtn.classList.add('btn-primary');
            
            // シークバーを初期化
            seekBars.forEach((bar, index) => {
                if (index === 0) {
                    bar.classList.add('seek-bar-active');
                } else {
                    bar.classList.add('seek-bar-inactive');
                }
            });
        } else {
            // 音楽が選択されていない場合
            audioPlayer.src = '';
            playPauseBtn.disabled = true;
            playPauseBtn.classList.remove('btn-primary');
            playPauseBtn.classList.add('btn-secondary');
            
            // 波形をクリア
            audioData = null;
            audioDuration = 0;
            if (waveformCanvas) {
                const ctx = waveformCanvas.getContext('2d');
                const ctx2 = waveformCanvas2.getContext('2d');
                ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
                ctx2.clearRect(0, 0, waveformCanvas2.width, waveformCanvas2.height);
                
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
            
            // シークバーをリセット
            seekBars.forEach((bar, index) => {
                bar.classList.add('seek-bar-inactive');
                bar.value = index * 20;
            });
        }
    });
    
    // 再生速度変更の処理
    speedRange.addEventListener('input', function() {
        const speed = parseFloat(this.value);
        currentSpeed = speed;
        audioPlayer.playbackRate = speed;
        currentSpeedDisplay.textContent = speed.toFixed(2);
        updateSpeedDisplay();
    });
    
    // 再生/一時停止ボタンの処理
    playPauseBtn.addEventListener('click', function() {
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => {
                console.log('再生エラー:', e);
                alert('音楽ファイルの再生に失敗しました。');
            });
            this.innerHTML = '<i class="bi bi-pause-fill" style="font-size: 2rem;"></i>';
        } else {
            audioPlayer.pause();
            this.innerHTML = '<i class="bi bi-play-fill" style="font-size: 2rem;"></i>';
        }
    });
    
    // シークバーの処理
    audioPlayer.addEventListener('timeupdate', function() {
        updateTimeDisplay();
    });
    
    // メタデータ読み込み完了
    audioPlayer.addEventListener('loadedmetadata', function() {
        updateTimeDisplay();
        
        // 音声データが読み込まれていない場合でも再生位置を表示
        if (!audioData) {
            audioDuration = audioPlayer.duration || 0;
            updateCurrentPlaybackPosition();
        }
        
        // 初期状態で最初のバーのみアクティブにする（ただしすべて操作可能）
        seekBars.forEach((bar, index) => {
            if (index === 0) {
                bar.classList.add('seek-bar-active');
            } else {
                bar.classList.add('seek-bar-inactive');
            }
        });
    });
    
    // エラーハンドリング
    audioPlayer.addEventListener('error', function(e) {
        console.log('音声ファイルエラー:', e);
        alert('音声ファイルの読み込みに失敗しました。');
    });
    
    // 一曲リピート機能
    audioPlayer.addEventListener('ended', function() {
        if (loopCheck.checked) {
            audioPlayer.currentTime = 0;
            audioPlayer.play().catch(e => console.log('リピート再生エラー:', e));
        }
    });
    
    // 各シークバーのイベント処理
    seekBars.forEach((bar, index) => {
        // ドラッグ開始
        bar.addEventListener('mousedown', function() {
            isSeeking = true;
            wasPlaying = !audioPlayer.paused;
            if (wasPlaying) {
                audioPlayer.pause();
            }
        });
        
        // ドラッグ中（リアルタイム更新）
        bar.addEventListener('input', function() {
            if (seekTimeout) {
                clearTimeout(seekTimeout);
            }
            
            const percentage = parseFloat(this.value);
            seekTimeout = setTimeout(() => {
                const targetTime = (percentage / 100) * audioPlayer.duration;
                audioPlayer.currentTime = targetTime;
            }, 50); // 50msのディレイでパフォーマンスを改善
        });
        
        // ドラッグ終了（マウス）
        bar.addEventListener('mouseup', function() {
            if (isSeeking) {
                const percentage = parseFloat(this.value);
                const targetTime = (percentage / 100) * audioPlayer.duration;
                audioPlayer.currentTime = targetTime;
                
                // 少し遅延させてから再生を再開
                setTimeout(() => {
                    if (wasPlaying) {
                        audioPlayer.play().catch(e => console.log('再生エラー:', e));
                    }
                }, 100);
            }
            isSeeking = false;
        });
        
        // タッチデバイス対応
        bar.addEventListener('touchstart', function(e) {
            e.preventDefault(); // デフォルトのタッチ動作を防止
            isSeeking = true;
            wasPlaying = !audioPlayer.paused;
            if (wasPlaying) {
                audioPlayer.pause();
            }
        });
        
        bar.addEventListener('touchmove', function(e) {
            e.preventDefault();
            if (seekTimeout) {
                clearTimeout(seekTimeout);
            }
            
            const percentage = parseFloat(this.value);
            seekTimeout = setTimeout(() => {
                const targetTime = (percentage / 100) * audioPlayer.duration;
                audioPlayer.currentTime = targetTime;
            }, 50);
        });
        
        bar.addEventListener('touchend', function(e) {
            e.preventDefault();
            if (isSeeking) {
                const percentage = parseFloat(this.value);
                const targetTime = (percentage / 100) * audioPlayer.duration;
                audioPlayer.currentTime = targetTime;
                
                // 少し遅延させてから再生を再開
                setTimeout(() => {
                    if (wasPlaying) {
                        audioPlayer.play().catch(e => console.log('再生エラー:', e));
                    }
                }, 100);
            }
            isSeeking = false;
        });
    });
    
    // 音声データを読み込んで波形表示
    function loadAudioData() {
        const selectedOption = musicSelect.options[musicSelect.selectedIndex];
        if (!selectedOption.value) return;
        
        // AudioContextを使用して音声データを取得
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        fetch(selectedOption.dataset.url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                // 音声データを取得
                const channelData = audioBuffer.getChannelData(0);
                audioDuration = audioBuffer.duration;
                
                // データをダウンサンプリング（パフォーマンス向上のため）
                const sampleRate = 1000; // 1秒あたり1000サンプル
                const downsampledData = [];
                const step = Math.floor(channelData.length / (audioDuration * sampleRate));
                
                for (let i = 0; i < channelData.length; i += step) {
                    downsampledData.push(channelData[i]);
                }
                
                audioData = downsampledData;
                
                // 波形を描画
                drawWaveform();
                
                // 初期再生位置を表示
                updateCurrentPlaybackPosition();
                
                console.log(`音声データ読み込み完了: ${audioDuration}秒, ${audioData.length}サンプル`);
            })
            .catch(error => {
                console.error('音声データ読み込みエラー:', error);
                // エラー時でも再生位置を表示できるようにする
                audioDuration = audioPlayer.duration || 0;
                updateCurrentPlaybackPosition();
            });
    }
    
    // アップロード成功時の処理
    if (typeof uploadSuccess !== 'undefined' && uploadSuccess) {
        // カスタムモーダル制御
        const uploadModal = document.getElementById('uploadModal');
        if (uploadModal) {
            uploadModal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
        setTimeout(function() {
            location.reload();
        }, 1000);
    }

    // カスタムモーダル制御機能
    function showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
            modal.classList.add('show');
            document.body.classList.add('modal-open');
            
            // バックドロップを作成
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop show';
            backdrop.id = modalId + 'Backdrop';
            document.body.appendChild(backdrop);
            
            // バックドロップクリックでモーダルを閉じる
            backdrop.addEventListener('click', function() {
                hideModal(modalId);
            });
        }
    }
    
    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
            document.body.classList.remove('modal-open');
            
            // バックドロップを削除
            const backdrop = document.getElementById(modalId + 'Backdrop');
            if (backdrop) {
                backdrop.remove();
            }
        }
    }
    
    // アップロードボタンのイベント
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
            showModal('uploadModal');
        });
    }
    
    // アップロードモーダルの閉じるボタン
    const uploadModalClose = document.getElementById('uploadModalClose');
    const uploadModalCloseBtn = document.getElementById('uploadModalCloseBtn');
    
    if (uploadModalClose) {
        uploadModalClose.addEventListener('click', function() {
            hideModal('uploadModal');
        });
    }
    
    if (uploadModalCloseBtn) {
        uploadModalCloseBtn.addEventListener('click', function() {
            hideModal('uploadModal');
        });
    }
    
    // 再生速度ボタンのイベント
    const speedBtn = document.getElementById('speedBtn');
    if (speedBtn) {
        speedBtn.addEventListener('click', function() {
            showModal('speedModal');
            // 現在の速度を設定
            const speedRange = document.getElementById('speed-range');
            const currentSpeedDisplay = document.getElementById('current-speed');
            if (speedRange && currentSpeedDisplay) {
                speedRange.value = currentSpeed;
                currentSpeedDisplay.textContent = currentSpeed.toFixed(2);
            }
        });
    }
    
    // 再生速度モーダルの閉じるボタン
    const speedModalClose = document.getElementById('speedModalClose');
    const speedModalCloseBtn = document.getElementById('speedModalCloseBtn');
    
    if (speedModalClose) {
        speedModalClose.addEventListener('click', function() {
            hideModal('speedModal');
        });
    }
    
    if (speedModalCloseBtn) {
        speedModalCloseBtn.addEventListener('click', function() {
            hideModal('speedModal');
        });
    }
    
    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal.show');
            openModals.forEach(modal => {
                hideModal(modal.id);
            });
        }
    });
}); 