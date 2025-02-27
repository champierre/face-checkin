// 顔認証チェックインシステム

// グローバル変数
let registrationVideo = null;
let checkinVideo = null;
let registrationCanvas = null;
let checkinCanvas = null;
let registrationStream = null;
let checkinStream = null;
let registeredUsers = [];
let isModelLoaded = false;
let recognitionInterval = null;
let isRecognizing = false;
let audioContext = null;
let fileHandle = null; // JSONファイルのハンドル

// DOMが読み込まれたら実行
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // DOM要素の取得
        registrationVideo = document.getElementById('registrationVideo');
        checkinVideo = document.getElementById('checkinVideo');
        registrationCanvas = document.getElementById('registrationCanvas');
        checkinCanvas = document.getElementById('checkinCanvas');
        const captureBtn = document.getElementById('captureBtn');
        const checkinBtn = document.getElementById('checkinBtn');
        const registrationStatus = document.getElementById('registrationStatus');
        const checkinStatus = document.getElementById('checkinStatus');
        const userList = document.getElementById('userList');
        
        // タブ切り替え機能の実装
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // アクティブなタブボタンを変更
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // アクティブなタブコンテンツを変更
                const tabId = button.getAttribute('data-tab');
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
                
                // タブ切り替え時にビデオストリームを最適化
                optimizeVideoStreams(tabId);
            });
        });
        
        // タブに応じてビデオストリームを最適化する関数
        function optimizeVideoStreams(activeTabId) {
            // 登録タブがアクティブな場合
            if (activeTabId === 'registration') {
                // チェックイン用のビデオを一時停止（リソース節約のため）
                if (checkinVideo && checkinVideo.srcObject) {
                    checkinVideo.srcObject.getTracks().forEach(track => track.enabled = false);
                }
                // 登録用のビデオを有効化
                if (registrationVideo && registrationVideo.srcObject) {
                    registrationVideo.srcObject.getTracks().forEach(track => track.enabled = true);
                }
            } 
            // チェックインタブがアクティブな場合
            else if (activeTabId === 'checkin') {
                // 登録用のビデオを一時停止
                if (registrationVideo && registrationVideo.srcObject) {
                    registrationVideo.srcObject.getTracks().forEach(track => track.enabled = false);
                }
                // チェックイン用のビデオを有効化
                if (checkinVideo && checkinVideo.srcObject) {
                    checkinVideo.srcObject.getTracks().forEach(track => track.enabled = true);
                }
            }
            // ユーザー一覧タブがアクティブな場合は両方のビデオを一時停止
            else if (activeTabId === 'userlist') {
                if (registrationVideo && registrationVideo.srcObject) {
                    registrationVideo.srcObject.getTracks().forEach(track => track.enabled = false);
                }
                if (checkinVideo && checkinVideo.srcObject) {
                    checkinVideo.srcObject.getTracks().forEach(track => track.enabled = false);
                }
            }
        }

        // ボタンを初期状態では無効化
        captureBtn.disabled = true;
        checkinBtn.disabled = true;

        // ステータスメッセージを表示
        registrationStatus.textContent = 'モデルを読み込み中...';
        checkinStatus.textContent = 'モデルを読み込み中...';

        // face-api.jsのモデルを読み込む
        await loadModels();
        
        // モデル読み込み完了
        isModelLoaded = true;
        registrationStatus.textContent = 'カメラを起動中...';
        checkinStatus.textContent = 'カメラを起動中...';

        // カメラを起動
        await startVideo(registrationVideo, 'registration');
        await startVideo(checkinVideo, 'checkin');

        // JSONファイルからユーザーデータを読み込む
        await loadUsersFromFile();
        
        // ユーザーリストを表示
        updateUserList();

        // 登録ボタンのイベントリスナー
        captureBtn.addEventListener('click', async () => {
            const userName = document.getElementById('userName').value.trim();
            
            if (!userName) {
                registrationStatus.textContent = '名前を入力してください';
                registrationStatus.className = 'error';
                return;
            }

            try {
                registrationStatus.textContent = '顔を検出中...';
                
                // 顔の検出と特徴抽出
                const detections = await detectFace(registrationVideo);
                
                if (detections.length === 0) {
                    registrationStatus.textContent = '顔が検出できませんでした。もう一度試してください。';
                    registrationStatus.className = 'error';
                    return;
                }
                
                if (detections.length > 1) {
                    registrationStatus.textContent = '複数の顔が検出されました。一人だけ映るようにしてください。';
                    registrationStatus.className = 'error';
                    return;
                }

                // 顔の特徴を抽出
                const descriptor = detections[0].descriptor;
                
                // 既存ユーザーの確認
                const existingUserIndex = registeredUsers.findIndex(user => user.name === userName);
                
                if (existingUserIndex !== -1) {
                    // 既存ユーザーの更新
                    registeredUsers[existingUserIndex].descriptor = Array.from(descriptor);
                    registrationStatus.textContent = `${userName}さんの顔情報を更新しました`;
                } else {
                    // 新規ユーザーの登録
                    registeredUsers.push({
                        name: userName,
                        descriptor: Array.from(descriptor),
                        lastCheckin: null
                    });
                    registrationStatus.textContent = `${userName}さんを登録しました`;
                }
                
                registrationStatus.className = 'success';
                
                // JSONファイルに保存
                await saveUsersToFile();
                
                // ユーザーリストを更新
                updateUserList();
                
                // 入力フィールドをクリア
                document.getElementById('userName').value = '';
                
            } catch (error) {
                console.error('登録エラー:', error);
                registrationStatus.textContent = 'エラーが発生しました: ' + error.message;
                registrationStatus.className = 'error';
            }
        });

        // チェックインボタンのイベントリスナー
        checkinBtn.addEventListener('click', async () => {
            try {
                checkinStatus.textContent = '顔を検出中...';
                
                // 顔の検出と特徴抽出
                const detections = await detectFace(checkinVideo);
                
                if (detections.length === 0) {
                    checkinStatus.textContent = '顔が検出できませんでした。もう一度試してください。';
                    checkinStatus.className = 'error';
                    return;
                }
                
                if (detections.length > 1) {
                    checkinStatus.textContent = '複数の顔が検出されました。一人だけ映るようにしてください。';
                    checkinStatus.className = 'error';
                    return;
                }

                // 顔の特徴を抽出
                const descriptor = detections[0].descriptor;
                
                // 登録ユーザーと照合
                const match = findBestMatch(descriptor);
                
                if (match) {
                    // チェックイン成功
                    const now = new Date();
                    match.user.lastCheckin = now.toISOString();
                    
                    // JSONファイルに保存
                    await saveUsersToFile();
                    
                    // ユーザーリストを更新
                    updateUserList();
                    
                    checkinStatus.textContent = `${match.user.name}さん、チェックインしました！ (${now.toLocaleTimeString()})`;
                    checkinStatus.className = 'success';
                    
                    // キャンバスに顔の枠を描画
                    drawDetection(checkinCanvas, detections[0].detection, match.user.name);
                    
                    // チェックイン成功音を再生
                    playCheckinSound();
                } else {
                    // チェックイン失敗
                    checkinStatus.textContent = '登録されていないユーザーです。先に登録してください。';
                    checkinStatus.className = 'error';
                    
                    // キャンバスに顔の枠を描画（未登録）
                    drawDetection(checkinCanvas, detections[0].detection, '未登録');
                }
                
            } catch (error) {
                console.error('チェックインエラー:', error);
                checkinStatus.textContent = 'エラーが発生しました: ' + error.message;
                checkinStatus.className = 'error';
            }
        });

    } catch (error) {
        console.error('初期化エラー:', error);
        alert('アプリケーションの初期化中にエラーが発生しました: ' + error.message);
    }
});

// face-api.jsのモデルを読み込む関数
async function loadModels() {
    try {
        // モデルのパスを設定
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        
        // モデルを読み込む
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        console.log('モデルの読み込みが完了しました');
    } catch (error) {
        console.error('モデル読み込みエラー:', error);
        throw new Error('顔認識モデルの読み込みに失敗しました');
    }
}

// カメラを起動する関数
async function startVideo(videoElement, type) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: 'user'
            }
        });
        
        videoElement.srcObject = stream;
        
        // ストリームを保存
        if (type === 'registration') {
            registrationStream = stream;
        } else {
            checkinStream = stream;
        }
        
        // ビデオの読み込み完了を待つ
        await new Promise(resolve => {
            videoElement.onloadedmetadata = () => {
                resolve();
            };
        });
        
        // ボタンを有効化
        if (type === 'registration') {
            document.getElementById('captureBtn').disabled = false;
            document.getElementById('registrationStatus').textContent = '名前を入力して「顔を登録」ボタンをクリックしてください';
        } else {
            document.getElementById('checkinBtn').disabled = false;
            document.getElementById('checkinStatus').textContent = '顔認識を行っています。チェックインするには「チェックイン」ボタンをクリックしてください';
            
            // チェックイン画面では常に顔認識を行う
            startContinuousRecognition();
        }
        
        console.log(`${type}用カメラの起動が完了しました`);
    } catch (error) {
        console.error('カメラ起動エラー:', error);
        const statusElement = type === 'registration' ? 
            document.getElementById('registrationStatus') : 
            document.getElementById('checkinStatus');
        
        statusElement.textContent = 'カメラへのアクセスに失敗しました: ' + error.message;
        statusElement.className = 'error';
    }
}

// 顔を検出して特徴を抽出する関数
async function detectFace(videoElement) {
    try {
        // 顔検出オプション
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
        
        // 顔を検出して特徴を抽出
        const detections = await faceapi
            .detectAllFaces(videoElement, options)
            .withFaceLandmarks()
            .withFaceDescriptors();
        
        return detections;
    } catch (error) {
        console.error('顔検出エラー:', error);
        throw new Error('顔の検出に失敗しました');
    }
}

// 最も類似度の高いユーザーを見つける関数
function findBestMatch(descriptor) {
    if (registeredUsers.length === 0) {
        return null;
    }
    
    // 登録ユーザーの特徴ベクトルをLabeledFaceDescriptorsに変換
    const labeledDescriptors = registeredUsers.map(user => {
        return new faceapi.LabeledFaceDescriptors(
            user.name, 
            [new Float32Array(user.descriptor)]
        );
    });
    
    // FaceMatcher作成
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    
    // 最も類似度の高いユーザーを見つける
    const match = faceMatcher.findBestMatch(descriptor);
    
    // 「unknown」の場合はnullを返す
    if (match.label === 'unknown') {
        return null;
    }
    
    // マッチしたユーザーを返す
    const user = registeredUsers.find(user => user.name === match.label);
    return { user, distance: match.distance };
}

// 検出結果をキャンバスに描画する関数
function drawDetection(canvas, detection, label) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 顔の枠を描画
    const box = detection.box;
    ctx.strokeStyle = label === '未登録' ? 'red' : 'green';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    
    // ラベルを描画
    ctx.font = '24px Arial';
    ctx.fillStyle = label === '未登録' ? 'red' : 'green';
    ctx.fillText(label, box.x, box.y - 5);
}

// ユーザーリストを更新する関数
function updateUserList() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    
    registeredUsers.forEach((user, index) => {
        const li = document.createElement('li');
        
        // ユーザー情報
        const userInfo = document.createElement('div');
        userInfo.textContent = user.name;
        
        // 最終チェックイン情報
        if (user.lastCheckin) {
            const lastCheckin = new Date(user.lastCheckin);
            const checkinInfo = document.createElement('small');
            checkinInfo.textContent = `最終チェックイン: ${lastCheckin.toLocaleString()}`;
            checkinInfo.style.marginLeft = '10px';
            checkinInfo.style.color = '#666';
            userInfo.appendChild(checkinInfo);
        }
        
        li.appendChild(userInfo);
        
        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.addEventListener('click', () => {
            deleteUser(index);
        });
        
        li.appendChild(deleteBtn);
        userList.appendChild(li);
    });
}

// ユーザーを削除する関数
async function deleteUser(index) {
    if (confirm(`${registeredUsers[index].name}さんを削除してもよろしいですか？`)) {
        registeredUsers.splice(index, 1);
        await saveUsersToFile();
        updateUserList();
    }
}

// JSONファイルにユーザーデータを保存する関数
async function saveUsersToFile() {
    try {
        if (!fileHandle) {
            // ファイルが選択されていない場合、新規作成
            fileHandle = await window.showSaveFilePicker({
                suggestedName: 'face-checkin-users.json',
                types: [{
                    description: 'JSON File',
                    accept: {'application/json': ['.json']},
                }],
            });
        }

        // ファイルに書き込むためのWritableStreamを取得
        const writable = await fileHandle.createWritable();
        // JSONデータを書き込む
        await writable.write(JSON.stringify(registeredUsers, null, 2));
        // ストリームを閉じる
        await writable.close();
        
        console.log('ユーザーデータをファイルに保存しました');
    } catch (error) {
        console.error('ファイル保存エラー:', error);
        alert('ユーザーデータの保存に失敗しました: ' + error.message);
    }
}

// JSONファイルからユーザーデータを読み込む関数
async function loadUsersFromFile() {
    try {
        // ファイル選択ダイアログを表示
        [fileHandle] = await window.showOpenFilePicker({
            types: [{
                description: 'JSON File',
                accept: {'application/json': ['.json']},
            }],
        });

        // ファイルの内容を読み込む
        const file = await fileHandle.getFile();
        const contents = await file.text();
        registeredUsers = JSON.parse(contents);
        
        // ユーザーリストを更新
        updateUserList();
        console.log('ユーザーデータをファイルから読み込みました');
    } catch (error) {
        console.error('ファイル読み込みエラー:', error);
        // 新規ユーザーの場合は空の配列で初期化
        if (!registeredUsers.length) {
            registeredUsers = [];
        }
    }
}

// 定期的に顔認識を行う関数
async function startContinuousRecognition() {
    // すでに実行中の場合は何もしない
    if (isRecognizing) return;
    
    isRecognizing = true;
    const checkinStatus = document.getElementById('checkinStatus');
    
    // 前回のインターバルがあれば停止
    if (recognitionInterval) {
        clearInterval(recognitionInterval);
    }
    
    // 1秒ごとに顔認識を実行
    recognitionInterval = setInterval(async () => {
        try {
            // 顔の検出と特徴抽出
            const detections = await detectFace(checkinVideo);
            
            if (detections.length === 0) {
                // 顔が検出されない場合はキャンバスをクリア
                const ctx = checkinCanvas.getContext('2d');
                ctx.clearRect(0, 0, checkinCanvas.width, checkinCanvas.height);
                return;
            }
            
            if (detections.length > 1) {
                // 複数の顔が検出された場合
                checkinStatus.textContent = '複数の顔が検出されました。一人だけ映るようにしてください。';
                checkinStatus.className = 'error';
                return;
            }
            
            // 顔の特徴を抽出
            const descriptor = detections[0].descriptor;
            
            // 登録ユーザーと照合
            const match = findBestMatch(descriptor);
            
            if (match) {
                // 登録ユーザーが見つかった場合
                checkinStatus.textContent = `${match.user.name}さんを認識しました`;
                checkinStatus.className = 'success';
                
                // キャンバスに顔の枠を描画
                drawDetection(checkinCanvas, detections[0].detection, match.user.name);
            } else {
                // 登録ユーザーが見つからない場合
                checkinStatus.textContent = '登録されていないユーザーです';
                checkinStatus.className = 'error';
                
                // キャンバスに顔の枠を描画（未登録）
                drawDetection(checkinCanvas, detections[0].detection, '未登録');
            }
        } catch (error) {
            console.error('連続認識エラー:', error);
            // エラーが発生した場合は処理を続行するため、ここではステータスを更新しない
        }
    }, 1000); // 1秒ごとに実行
}

// 連続認識を停止する関数
function stopContinuousRecognition() {
    if (recognitionInterval) {
        clearInterval(recognitionInterval);
        recognitionInterval = null;
    }
    isRecognizing = false;
}

// チェックイン成功時に音を鳴らす関数
function playCheckinSound() {
    try {
        // AudioContextが未初期化の場合は初期化
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // オシレーターを作成（音源）
        const oscillator = audioContext.createOscillator();
        
        // ゲインノードを作成（音量調整）
        const gainNode = audioContext.createGain();
        
        // オシレーターの設定
        oscillator.type = 'sine'; // サイン波
        
        // 「ズキューン」という音を作るための周波数変化
        // 最初は高い音から始まり、下降してから上昇する
        const now = audioContext.currentTime;
        oscillator.frequency.setValueAtTime(1800, now); // 開始周波数（高め）
        oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.15); // 下降
        oscillator.frequency.exponentialRampToValueAtTime(2000, now + 0.3); // 上昇
        
        // ゲインの設定（音量の減衰）
        gainNode.gain.setValueAtTime(0.3, now); // 初期音量
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4); // フェードアウト
        
        // 接続
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 再生開始
        oscillator.start();
        oscillator.stop(now + 0.4); // 0.4秒間再生
        
        console.log('「ズキューン」音を再生しました');
    } catch (error) {
        console.error('音声再生エラー:', error);
    }
}

// ページを離れる前にカメラと認識を停止
window.addEventListener('beforeunload', () => {
    // 連続認識を停止
    stopContinuousRecognition();
    
    // 登録用カメラの停止
    if (registrationStream) {
        registrationStream.getTracks().forEach(track => track.stop());
    }
    
    // チェックイン用カメラの停止
    if (checkinStream) {
        checkinStream.getTracks().forEach(track => track.stop());
    }
    
    // AudioContextを閉じる
    if (audioContext) {
        audioContext.close();
    }
});
