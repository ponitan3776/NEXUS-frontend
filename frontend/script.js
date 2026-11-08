// ===== 旧名称で保存されたデータの引き継ぎ(名前変更の移行用。1回だけ動く。数週間たったらこのブロックごと消してOK) =====
(function migrateLegacyStorage(){
  try{
    const OLD = 'candyblast-', NEW = 'nexus-';
    Object.keys(localStorage).filter(k=> k.startsWith(OLD)).forEach(k=>{
      const nk = NEW + k.slice(OLD.length);
      if(localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k));
      localStorage.removeItem(k);
    });
    const m = document.cookie.match(/(?:^|; )candyblast_auth=([^;]*)/);      // ログイン状態(Cookie)
    if(m && !/(?:^|; )nexus_auth=/.test(document.cookie)){
      document.cookie = `nexus_auth=${m[1]}; expires=${new Date(Date.now() + 30*24*60*60*1000).toUTCString()}; path=/; SameSite=Lax`;
    }
    if(m) document.cookie = 'candyblast_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
  }catch(e){}
})();

(function(){

// バックエンドのURLは config.js で設定する(GitHub Pagesでもここを触らずに済む)
const API_BASE_URL = String((window.NEXUS_CONFIG && window.NEXUS_CONFIG.API_BASE_URL) || 'https://pinkyburst.onrender.com').replace(/\/+$/, '');

// ★管理者アカウントのID(バックエンドの ADMIN_USER_ID と必ず合わせること)
const ADMIN_USER_ID = 'vortx';

// ===================== 🎵 音楽ライブラリ =====================
  // 曲を追加するときは、この配列に1行足すだけ！
  // ファイルは frontend/bgm/ の中に置く
  const MUSIC_LIBRARY = [
    { title:'月光 第1楽章', artist:'ベートーヴェン', file:'moonlight.mp3', category:'クラシック', emoji:'🌙' },
    { title:'月が綺麗ねと言われたい！', artist:'柿崎ユウタ', file:'beautifulmoon.mp3', category:'その他', emoji:'🌙' },
    { title:'マーシャル・マキシマイザー', artist:'柊マグネタイト', file:'marshallmaximizer.mp3', category:'その他', emoji:'🎰' },
    { title:'お前うんち俺もうんち', artist:'須和しわす', file:'poop.mp3', category:'クラシック', emoji:'💩' },
    { title:'我期待的不是', artist:'張妙格', file:'china.mp3', category:'その他', emoji:'❄️' },

    // 追加例:
    // { title:'〇〇', artist:'〇〇', file:'xxx.mp3', category:'ゲーム', emoji:'🎮' },
  ];
  const MUSIC_CATEGORIES = ['すべて', 'クラシック', 'ゲーム', '作業用', 'その他'];

  // ===================== 永続化ストレージ(localStorageベース) =====================
  // このアプリはRender上の通常のWebページとして動作するため、
  // (Claudeアーティファクト専用の window.storage ではなく)標準の localStorage を使う。
  // 呼び出し側のコードは変えずに済むよう、同じインターフェースのラッパーを用意する。
  const appStorage = {
    async get(key){
      try{
        const value = localStorage.getItem(key);
        if(value === null) return null;
        return { key, value, shared:false };
      }catch(err){ return null; }
    },
    async set(key, value){
      try{
        localStorage.setItem(key, value);
        return { key, value, shared:false };
      }catch(err){ return null; }
    },
    async delete(key){
      try{
        localStorage.removeItem(key);
        return { key, deleted:true, shared:false };
      }catch(err){ return null; }
    }
  };

  // ===================== Cookie操作(ログイン状態の保存に使用) =====================
  function setCookie(name, value, days){
    const expires = new Date(Date.now() + days*24*60*60*1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }
  function getCookie(name){
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  function deleteCookie(name){
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
  }

  // ===================== ズーム無効化 =====================
  document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
  document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
  document.addEventListener('gestureend', function(e) { e.preventDefault(); });

  // ===================== ダブルタップズーム・ピンチズーム完全防止(iOS Safari対策) =====================
  let _lastTouchEndTime = 0;
  document.addEventListener('touchend', function(e){
    const now = Date.now();
    if(now - _lastTouchEndTime <= 350){
      e.preventDefault();
    }
    _lastTouchEndTime = now;
  }, { passive: false });

  document.addEventListener('touchstart', function(e){
    if(e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e){
    if(e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  document.addEventListener('dblclick', function(e){
    e.preventDefault();
  }, { passive: false });

// ===================== 戻るボタン =====================
  document.getElementById('backButton').addEventListener('click', function(e) {
    e.preventDefault();
    showTitleScreen();
  });

  // ===================== ゲーム本体 =====================
  let SIZE = 8;
  const COLORS = [
    {bg:'linear-gradient(135deg,#FF8B8B,#FF6B6B)'},
    {bg:'linear-gradient(135deg,#5FE3B3,#3DDC97)'},
    {bg:'linear-gradient(135deg,#6FB0FF,#4D96FF)'},
    {bg:'linear-gradient(135deg,#C9A8FF,#B18CFF)'},
    {bg:'linear-gradient(135deg,#FF95C9,#FF6FB5)'},
    {bg:'linear-gradient(135deg,#E1F065,#C6E62D)'},
    {bg:'linear-gradient(135deg,#FFE270,#FFD93D)'}
  ];

  const MODES = {
    soft:    { label:'柔らかい', emoji:'🍮' },
    baked:   { label:'焼成',     emoji:'🍪' },
    hard:    { label:'硬い',     emoji:'🍬' },
    extreme: { label:'激硬',     emoji:'🧊' }
  };
  let currentMode = 'baked';

  const MODE_COIN_MULT = { soft:0.5, baked:1.0, hard:1.5, extreme:3.0 };
  function sizeCoinMult(size){ return 8 / size; }
  function coinMultiplier(mode, size){
    const m = mode || currentMode, s = (m==='extreme') ? 8 : (size || SIZE);
    return MODE_COIN_MULT[m] * sizeCoinMult(s);
  }

// ===================== 🤖 テトリス AI難易度 =====================
  const AI_DIFFICULTIES = {
    easy: {
      label: '😊 簡単',
      desc: 'AIがミスを連発。のんびり遊べます。',
      speed: 320,        // ★1アクション(回転/移動/落下)あたりの間隔(ms)
      randomChance: 0.7,
      weightScale: 0.5,
      noise: 2.5,      // 評価値(おおむね-10〜+1)に対するゆらぎ。大きいほど判断がブレる
      think: 650,        // 新しいピースを見てから動き出すまでの「考える時間」(ms)
      slip: 0.2,         // 操作ミス(ずれて落とす/迷って戻る)の確率
      holdUse: 0,        // ホールドを使う確率
      hardDrop: 0.45     // 最後にハードドロップする確率(残りはソフトドロップで落とす)
    },
    normal: {
      label: '🙂 普通',
      desc: 'AIがたまにミスをします。',
      speed: 190,
      randomChance: 0.35,
      weightScale: 0.8,
      noise: 1.0,
      think: 420, slip: 0.09, holdUse: 0.15, hardDrop: 0.7
    },
    hard: {
      label: '😤 難しい',
      desc: 'AIはほぼミスをしません。',
      speed: 110,
      randomChance: 0.1,
      weightScale: 1.0,
      noise: 0.35,
      think: 260, slip: 0.035, holdUse: 0.6, hardDrop: 0.9
    },
    modern: {
      label: '🔥 現代最強',
      desc: '高速・完璧な判断。人間には厳しい。',
      speed: 60,
      randomChance: 0,
      weightScale: 1.0,
      noise: 0,
      think: 110, slip: 0.01, holdUse: 1, hardDrop: 1
    },
    history: {
      label: '👑 史上最強',
      desc: '1手先読みで最強。もう勝てません。',
      speed: 0,
      randomChance: 0,
      weightScale: 1.0,
      noise: 0,
      think: 40, slip: 0, holdUse: 1, hardDrop: 1,
      lookahead: true   // 1手先読みを有効化
    }
  };

  // テトリス関連のモード設定
  let tetrisSubMode = 'solo';    // 'solo' | 'vs' | 'sprint'(40ライン) | 'ultra'(2分)
  let aiDifficulty = 'normal';   // AI_DIFFICULTIES のキー
  let tetrisVsMode = false;      // 実行時フラグ: VS AIモードかどうか

  // ===================== スキン =====================
  // ===================== 背景画像(お好みの写真を背景に設定) =====================
  const STORAGE_BG_IMAGE = 'nexus-bg-image-v1';
  let customBgDataUrl = null;

  function renderBgTab(){
    return `
      <div class="sub" style="margin-bottom:10px;">好きな写真を背景に設定できます。ブロックやパネルは前面にはっきり表示されるので、プレイに支障はありません。</div>
      <div style="width:100%; aspect-ratio:16/9; border-radius:14px; overflow:hidden; background:var(--panel);
        display:flex; align-items:center; justify-content:center; margin-bottom:12px; border:1px solid rgba(255,255,255,0.08);">
        ${customBgDataUrl
          ? `<img src="${customBgDataUrl}" style="width:100%; height:100%; object-fit:cover;">`
          : `<span class="sub">現在: デフォルト背景</span>`}
      </div>
      <input type="file" id="bgFileInput" accept="image/*" style="display:none;">
      <button class="primary-btn" id="bgPickBtn">🖼️ 画像を選択する</button>
      ${customBgDataUrl ? `<button class="ghost-btn" id="bgResetBtn">デフォルトに戻す</button>` : ''}
      <div class="sub" id="bgStatus" style="margin-top:8px;"></div>
    `;
  }

  function applyCustomBackground(dataUrl){
    if(dataUrl){
      document.body.style.backgroundImage =
        `linear-gradient(rgba(8,4,12,0.55), rgba(8,4,12,0.55)), url(${dataUrl})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundAttachment = '';
    }
  }

  function setCustomBackgroundFromFile(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image failed'));
        img.onload = () => {
          const maxW = 1000;
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          customBgDataUrl = dataUrl;
          applyCustomBackground(dataUrl);
          appStorage.set(STORAGE_BG_IMAGE, dataUrl, false).then(()=>resolve()).catch(reject);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function resetCustomBackground(){
    customBgDataUrl = null;
    applyCustomBackground(null);
    try{ await appStorage.delete(STORAGE_BG_IMAGE, false); }catch(err){}
  }

  async function loadCustomBackground(){
    try{
      const res = await appStorage.get(STORAGE_BG_IMAGE, false);
      if(res && res.value){
        customBgDataUrl = res.value;
        applyCustomBackground(customBgDataUrl);
      }
    }catch(err){}
  }

  const PATTERN_LAYERS = {
  stripe: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0 3px, transparent 3px 9px)',
  dot: 'radial-gradient(circle at 3px 3px, rgba(255,255,255,0.55) 1.6px, transparent 1.8px) 0 0/9px 9px',
  grid: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.26) 0 1.4px, transparent 1.4px 8px), repeating-linear-gradient(90deg, rgba(255,255,255,0.26) 0 1.4px, transparent 1.4px 8px)',
  wave: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.28) 0 2px, transparent 2px 10px)',
  zigzag: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
  diamond: 'repeating-linear-gradient(60deg, rgba(255,255,255,0.24) 0 2px, transparent 2px 9px), repeating-linear-gradient(-60deg, rgba(255,255,255,0.24) 0 2px, transparent 2px 9px)',

  // ===== 🌟 新柄パターン =====
  // チェッカー: conic-gradientの4象限で市松模様
  checker: 'conic-gradient(rgba(255,255,255,0.32) 90deg, transparent 90deg 180deg, rgba(255,255,255,0.32) 180deg 270deg, transparent 270deg) 0 0/12px 12px',
  // キラキラ: 大小2つの点を互い違いに配置
  sparkle: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0.9px, transparent 1.6px) 0 0/14px 14px, radial-gradient(circle at 50% 50%, rgba(255,255,255,0.55) 0.6px, transparent 1.3px) 7px 7px/14px 14px',
  // 迷彩: 不規則な楕円ブロブを4つ重ねる
  camo: 'radial-gradient(ellipse 7px 5px at 20% 30%, rgba(255,255,255,0.22) 50%, transparent 51%), radial-gradient(ellipse 5px 4px at 70% 65%, rgba(0,0,0,0.18) 50%, transparent 51%), radial-gradient(ellipse 4px 5px at 40% 80%, rgba(255,255,255,0.16) 50%, transparent 51%), radial-gradient(ellipse 5px 3px at 85% 20%, rgba(0,0,0,0.14) 50%, transparent 51%)',
  // 大理石: 斜めの走査線を多重化
  marble: 'repeating-linear-gradient(115deg, rgba(255,255,255,0.24) 0 1px, transparent 1px 4px, rgba(0,0,0,0.12) 4px 5px, transparent 5px 11px)',
  // 雨: 角度の違う細い縦線を2層重ねる
  rain: 'repeating-linear-gradient(95deg, rgba(255,255,255,0.38) 0 1px, transparent 1px 7px), repeating-linear-gradient(85deg, rgba(255,255,255,0.2) 0 1px, transparent 1px 11px)',
  // レンガ: 縦横の目地を入れる
  brick: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.24) 0 1px, transparent 1px 8px), repeating-linear-gradient(90deg, rgba(0,0,0,0.24) 0 1px, transparent 1px 14px)',
  // 泡: 大小の円を3つ散らす
  bubble: 'radial-gradient(circle at 25% 30%, rgba(255,255,255,0.55) 1.2px, transparent 2.2px), radial-gradient(circle at 75% 70%, rgba(255,255,255,0.4) 1px, transparent 2px), radial-gradient(circle at 55% 15%, rgba(255,255,255,0.3) 0.8px, transparent 1.8px)',
  // タータン: 縦横の太線+斜めの細線でチェック柄
  tartan: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.22) 0 3px, transparent 3px 12px), repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 3px, transparent 3px 12px), repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 6px)',
  // ハーフトーン: 網点印刷風のドット
  halftone: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.42) 1.6px, transparent 2.1px) 0 0/8px 8px',
  // ハニカム: 60度ずつの円錐グラデーションで蜂の巣風
  honeycomb: 'conic-gradient(from 30deg, transparent 0 60deg, rgba(255,255,255,0.26) 60deg 120deg, transparent 120deg 180deg, rgba(255,255,255,0.26) 180deg 240deg, transparent 240deg 300deg, rgba(255,255,255,0.26) 300deg 360deg) 0 0/10px 8px',
  // 竹: 節のような横線+細い縦線
  bamboo: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 14px), repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 2px, transparent 2px 16px)',
  // 鱗: 45度の斜め線+横線で魚の鱗風
  scale: 'repeating-linear-gradient(90deg, transparent 0 4px, rgba(255,255,255,0.2) 4px 6px, transparent 6px 12px), repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 1px, transparent 1px 8px)',
  // 十字: プラス記号を敷き詰める
  cross: 'linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.35)) 50% 50%/2px 10px no-repeat, linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.35)) 50% 50%/10px 2px no-repeat, radial-gradient(circle at 50% 50%, transparent 4px, transparent 5px) 0 0/12px 12px'
};
const PATTERN_LABELS = {
  stripe:'ストライプ', dot:'ドット', grid:'グリッド', wave:'ウェーブ', zigzag:'ジグザグ', diamond:'ダイヤ柄',
  checker:'チェッカー', sparkle:'キラキラ', camo:'迷彩', marble:'大理石', rain:'雨', brick:'レンガ',
  bubble:'泡', tartan:'タータン', halftone:'ハーフトーン', honeycomb:'ハニカム', bamboo:'竹',
  scale:'鱗', cross:'十字'
};

  const SKINS = [
    { id:'default', name:'ミッドナイトキャンディ', price:0, desc:'定番のパープル×ゴールドの夜空テーマ。',
      vars:{ '--bg-deep':'#1a1233','--bg-deep2':'#241a45','--panel':'#2c2054','--panel-light':'#382a68',
        '--gold':'#FFD93D','--coral':'#FF6B6B','--mint':'#3DDC97','--blue':'#4D96FF','--purple':'#B18CFF',
        '--pink':'#FF6FB5','--lime':'#C6E62D','--text':'#F5F3FF','--text-dim':'#B7ADDA' },
      titleGrad:'linear-gradient(90deg, #FFD93D, #FF6FB5)',
      colors:[
        {bg:'linear-gradient(135deg,#FF8B8B,#FF6B6B)'},{bg:'linear-gradient(135deg,#5FE3B3,#3DDC97)'},
        {bg:'linear-gradient(135deg,#6FB0FF,#4D96FF)'},{bg:'linear-gradient(135deg,#C9A8FF,#B18CFF)'},
        {bg:'linear-gradient(135deg,#FF95C9,#FF6FB5)'},{bg:'linear-gradient(135deg,#E1F065,#C6E62D)'},
        {bg:'linear-gradient(135deg,#FFE270,#FFD93D)'}
      ] },
    { id:'sunset', name:'サンセットソーダ', price:800, desc:'夕焼けとクリームソーダの暖色パレット。',
      vars:{ '--bg-deep':'#2b1024','--bg-deep2':'#4a1730','--panel':'#5c2038','--panel-light':'#742a44',
        '--gold':'#FFB74D','--coral':'#FF6B4A','--mint':'#FFD97D','--blue':'#FF8F6B','--purple':'#FF9AA8',
        '--pink':'#FF5E8E','--lime':'#FFDD6B','--text':'#FFF3E8','--text-dim':'#E3AFAF' },
      titleGrad:'linear-gradient(90deg,#FFB74D,#FF5E8E)',
      colors:[
        {bg:'linear-gradient(135deg,#FFB199,#FF7B54)'},{bg:'linear-gradient(135deg,#FFD97D,#FFB74D)'},
        {bg:'linear-gradient(135deg,#FF9AA8,#FF5E8E)'},{bg:'linear-gradient(135deg,#FFCF6B,#FF9A3C)'},
        {bg:'linear-gradient(135deg,#FF8AAE,#E8497A)'},{bg:'linear-gradient(135deg,#FFE29A,#FFC15E)'},
        {bg:'linear-gradient(135deg,#FF7E67,#E8503A)'}
      ] },
    { id:'ocean', name:'ディープオーシャン', price:1000, desc:'深海の静けさをまとったブルー×ティール。',
      vars:{ '--bg-deep':'#07161f','--bg-deep2':'#0c2733','--panel':'#123444','--panel-light':'#1a4557',
        '--gold':'#4DE0E0','--coral':'#FF8A65','--mint':'#3DDCC0','--blue':'#4DA6FF','--purple':'#6FA8DC',
        '--pink':'#5FC9E8','--lime':'#7FE0C6','--text':'#EAFBFF','--text-dim':'#8FC4D6' },
      titleGrad:'linear-gradient(90deg,#4DE0E0,#4DA6FF)',
      colors:[
        {bg:'linear-gradient(135deg,#6FE3D8,#3DDCC0)'},{bg:'linear-gradient(135deg,#6FB0FF,#3E7EDB)'},
        {bg:'linear-gradient(135deg,#7FE0C6,#39B893)'},{bg:'linear-gradient(135deg,#8FD3FF,#4DA6FF)'},
        {bg:'linear-gradient(135deg,#5FC9E8,#2E9BC2)'},{bg:'linear-gradient(135deg,#4DE0E0,#20B2B2)'},
        {bg:'linear-gradient(135deg,#A0F0E6,#5FD6C4)'}
      ] },
    { id:'neon', name:'ネオンナイト', price:1400, desc:'漆黒に浮かぶ蛍光カラーのサイバーテーマ。',
      vars:{ '--bg-deep':'#08060f','--bg-deep2':'#120a24','--panel':'#1c1030','--panel-light':'#28163f',
        '--gold':'#F5FF3D','--coral':'#FF3DBB','--mint':'#3DFFD5','--blue':'#3DAFFF','--purple':'#B93DFF',
        '--pink':'#FF3DBB','--lime':'#C6FF3D','--text':'#F2F0FF','--text-dim':'#9C8FCC' },
      titleGrad:'linear-gradient(90deg,#F5FF3D,#FF3DBB)',
      colors:[
        {bg:'linear-gradient(135deg,#FF6DD9,#FF3DBB)'},{bg:'linear-gradient(135deg,#5DFFE0,#3DFFD5)'},
        {bg:'linear-gradient(135deg,#6DC3FF,#3DAFFF)'},{bg:'linear-gradient(135deg,#CE7DFF,#B93DFF)'},
        {bg:'linear-gradient(135deg,#FF7DCF,#FF3DBB)'},{bg:'linear-gradient(135deg,#E0FF6D,#C6FF3D)'},
        {bg:'linear-gradient(135deg,#FBFF6D,#F5FF3D)'}
      ] },
    { id:'sakura', name:'さくらパステル', price:1200, desc:'春の花びらのようなやわらかいピンク×白。',
      vars:{ '--bg-deep':'#2a1a22','--bg-deep2':'#3d2530','--panel':'#4a2c3a','--panel-light':'#5c3849',
        '--gold':'#FFC1CC','--coral':'#FF9EB5','--mint':'#C8F0DD','--blue':'#B8D8F0','--purple':'#D9C1EA',
        '--pink':'#FFB3D1','--lime':'#E8F0B8','--text':'#FFF6F8','--text-dim':'#D9AFC0' },
      titleGrad:'linear-gradient(90deg,#FFC1CC,#D9C1EA)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD1DC,#FF9EB5)'},{bg:'linear-gradient(135deg,#D6F5E3,#C8F0DD)'},
        {bg:'linear-gradient(135deg,#D2E7FA,#B8D8F0)'},{bg:'linear-gradient(135deg,#E9D8F5,#D9C1EA)'},
        {bg:'linear-gradient(135deg,#FFC7E0,#FFB3D1)'},{bg:'linear-gradient(135deg,#F1F5C6,#E8F0B8)'},
        {bg:'linear-gradient(135deg,#FFE3EA,#FFC1CC)'}
      ] },
    { id:'goldlux', name:'ゴールドラグジュアリー', price:2500, desc:'漆黒とゴールドの高級ジュエリーテーマ。',
      vars:{ '--bg-deep':'#0a0a0a','--bg-deep2':'#161412','--panel':'#211c16','--panel-light':'#332b1f',
        '--gold':'#F5D57A','--coral':'#E8A33D','--mint':'#D4B26A','--blue':'#C9A24A','--purple':'#B8934A',
        '--pink':'#F0C97A','--lime':'#E0C05A','--text':'#FBF3E0','--text-dim':'#B8A582' },
      titleGrad:'linear-gradient(90deg,#F5D57A,#E8A33D)',
      colors:[
        {bg:'linear-gradient(135deg,#F5D57A,#D4A94A)'},{bg:'linear-gradient(135deg,#F0C060,#D89B2E)'},
        {bg:'linear-gradient(135deg,#E8B84A,#C79430)'},{bg:'linear-gradient(135deg,#F5E0A0,#E0BA5A)'},
        {bg:'linear-gradient(135deg,#D9A94E,#B8873A)'},{bg:'linear-gradient(135deg,#F0D890,#DDB758)'},
        {bg:'linear-gradient(135deg,#EFCB74,#C99A3E)'}
      ] },
    { id:'emerald', name:'エメラルドヴェール', price:1600, desc:'深緑のジャングルに宿る宝石の輝き。',
      vars:{ '--bg-deep':'#04140f','--bg-deep2':'#082018','--panel':'#0e3226','--panel-light':'#154436',
        '--gold':'#3DFFA8','--coral':'#5CFF7A','--mint':'#3DDCA0','--blue':'#4DFFC8','--purple':'#7DFFB0',
        '--pink':'#8CFFD1','--lime':'#B6FF6B','--text':'#E9FFF5','--text-dim':'#8FC7AE' },
      titleGrad:'linear-gradient(90deg,#3DFFA8,#B6FF6B)',
      colors:[
        {bg:'linear-gradient(135deg,#5CFFB0,#20D18A)'},{bg:'linear-gradient(135deg,#8CFFD1,#3DDCA0)'},
        {bg:'linear-gradient(135deg,#4DFFC8,#20B58F)'},{bg:'linear-gradient(135deg,#B6FF6B,#7CD936)'},
        {bg:'linear-gradient(135deg,#7DFFB0,#2FBE7C)'},{bg:'linear-gradient(135deg,#D0FFA0,#9EE85A)'},
        {bg:'linear-gradient(135deg,#3DFFA8,#0FAE72)'}
      ] },
    { id:'galaxy', name:'ギャラクシードリーム', price:1800, desc:'渦巻く銀河と星屑をまとった幻想パレット。',
      vars:{ '--bg-deep':'#05041a','--bg-deep2':'#0c0930','--panel':'#150f45','--panel-light':'#1e1660',
        '--gold':'#C8A2FF','--coral':'#FF6EC7','--mint':'#7FE7FF','--blue':'#6E8CFF','--purple':'#B36EFF',
        '--pink':'#FF6EC7','--lime':'#9E7FFF','--text':'#F1ECFF','--text-dim':'#9C8FD6' },
      titleGrad:'linear-gradient(90deg,#C8A2FF,#FF6EC7)',
      colors:[
        {bg:'linear-gradient(135deg,#FF9EE0,#FF6EC7)'},{bg:'linear-gradient(135deg,#9EE7FF,#7FE7FF)'},
        {bg:'linear-gradient(135deg,#9EB0FF,#6E8CFF)'},{bg:'linear-gradient(135deg,#DDB0FF,#B36EFF)'},
        {bg:'linear-gradient(135deg,#FF9EE0,#E86EDB)'},{bg:'linear-gradient(135deg,#C6B0FF,#9E7FFF)'},
        {bg:'linear-gradient(135deg,#E8CFFF,#C8A2FF)'}
      ] },
    { id:'volcano', name:'ヴォルケーノブレイズ', price:1300, desc:'噴火するマグマの熱と灰の黒を纏う。',
      vars:{ '--bg-deep':'#140503','--bg-deep2':'#240906','--panel':'#3a0f08','--panel-light':'#54160c',
        '--gold':'#FFB627','--coral':'#FF4500','--mint':'#FF7A3D','--blue':'#FF9040','--purple':'#FF5E2E',
        '--pink':'#FF7A3D','--lime':'#FFD23D','--text':'#FFF1E0','--text-dim':'#D69880' },
      titleGrad:'linear-gradient(90deg,#FFB627,#FF4500)',
      colors:[
        {bg:'linear-gradient(135deg,#FF7A3D,#FF4500)'},{bg:'linear-gradient(135deg,#FFD23D,#FFB627)'},
        {bg:'linear-gradient(135deg,#FF9040,#E8380A)'},{bg:'linear-gradient(135deg,#FF5E2E,#C22E0C)'},
        {bg:'linear-gradient(135deg,#FFC15E,#FF8A1E)'},{bg:'linear-gradient(135deg,#FF3D3D,#B31C1C)'},
        {bg:'linear-gradient(135deg,#FFA23D,#E86A0A)'}
      ] },
    { id:'frost', name:'アークティックフロスト', price:1500, desc:'極寒のオーロラと氷結晶の透明感。',
      vars:{ '--bg-deep':'#031420','--bg-deep2':'#062331','--panel':'#0b3548','--panel-light':'#124861',
        '--gold':'#B7F5FF','--coral':'#7DE8FF','--mint':'#9CFFF0','--blue':'#5AC8FF','--purple':'#A0E0FF',
        '--pink':'#C9F5FF','--lime':'#B6FFEA','--text':'#EEFCFF','--text-dim':'#88C0D6' },
      titleGrad:'linear-gradient(90deg,#B7F5FF,#5AC8FF)',
      colors:[
        {bg:'linear-gradient(135deg,#D6FBFF,#9CFFF0)'},{bg:'linear-gradient(135deg,#9CE0FF,#5AC8FF)'},
        {bg:'linear-gradient(135deg,#B6FFEA,#6FE8C8)'},{bg:'linear-gradient(135deg,#C9E8FF,#7DA8FF)'},
        {bg:'linear-gradient(135deg,#A0E0FF,#4FA9E8)'},{bg:'linear-gradient(135deg,#E0FBFF,#B7F5FF)'},
        {bg:'linear-gradient(135deg,#7DE8FF,#33B8DB)'}
      ] },
    { id:'royal', name:'ロイヤルアメジスト', price:2200, desc:'王家の紫水晶と銀細工の格式高いテーマ。',
      vars:{ '--bg-deep':'#100519','--bg-deep2':'#1c0a2c','--panel':'#2b1042','--panel-light':'#3c1858',
        '--gold':'#D8B4FE','--coral':'#E879F9','--mint':'#C4B5FD','--blue':'#A78BFA','--purple':'#9333EA',
        '--pink':'#E879F9','--lime':'#C4B5FD','--text':'#F5EEFF','--text-dim':'#B79CDB' },
      titleGrad:'linear-gradient(90deg,#D8B4FE,#E879F9)',
      colors:[
        {bg:'linear-gradient(135deg,#E4C8FF,#C084FC)'},{bg:'linear-gradient(135deg,#F0ABFC,#E879F9)'},
        {bg:'linear-gradient(135deg,#C4B5FD,#A78BFA)'},{bg:'linear-gradient(135deg,#D9C4FF,#9333EA)'},
        {bg:'linear-gradient(135deg,#EAD0FF,#B366F0)'},{bg:'linear-gradient(135deg,#F5D9FF,#D8B4FE)'},
        {bg:'linear-gradient(135deg,#BFA0F5,#8B4FE0)'}
      ] },
    { id:'candyland', name:'キャンディランド祭典', price:1000, desc:'遊園地の光と綿菓子のようなにぎやかなポップ配色。',
      vars:{ '--bg-deep':'#1a0e2e','--bg-deep2':'#2a1642','--panel':'#391d57','--panel-light':'#4a2670',
        '--gold':'#FFE156','--coral':'#FF5E7C','--mint':'#5CFFCB','--blue':'#5CB8FF','--purple':'#C25CFF',
        '--pink':'#FF5CC8','--lime':'#CBFF5C','--text':'#FFFAF0','--text-dim':'#C9A8E0' },
      titleGrad:'linear-gradient(90deg,#FFE156,#FF5CC8)',
      colors:[
        {bg:'linear-gradient(135deg,#FF8FA3,#FF5E7C)'},{bg:'linear-gradient(135deg,#7CFFDD,#5CFFCB)'},
        {bg:'linear-gradient(135deg,#8FCDFF,#5CB8FF)'},{bg:'linear-gradient(135deg,#DA8FFF,#C25CFF)'},
        {bg:'linear-gradient(135deg,#FF8FE0,#FF5CC8)'},{bg:'linear-gradient(135deg,#E3FF8F,#CBFF5C)'},
        {bg:'linear-gradient(135deg,#FFEC8F,#FFE156)'}
      ] },
    { id:'obsidian', name:'オブシディアンヴェノム', price:2000, desc:'黒曜石の闇に猛毒の緑が走る、上級者向けダークテーマ。',
      vars:{ '--bg-deep':'#020202','--bg-deep2':'#0a0a0a','--panel':'#131313','--panel-light':'#1e1e1e',
        '--gold':'#39FF14','--coral':'#FF073A','--mint':'#39FF14','--blue':'#00FFFF','--purple':'#8B00FF',
        '--pink':'#FF073A','--lime':'#CCFF00','--text':'#F0FFF0','--text-dim':'#6E8C6E' },
      titleGrad:'linear-gradient(90deg,#39FF14,#00FFFF)',
      colors:[
        {bg:'linear-gradient(135deg,#39FF14,#1EA80D)'},{bg:'linear-gradient(135deg,#CCFF00,#8FB800)'},
        {bg:'linear-gradient(135deg,#00FFFF,#00A8A8)'},{bg:'linear-gradient(135deg,#8B00FF,#5A00A8)'},
        {bg:'linear-gradient(135deg,#FF073A,#A80426)'},{bg:'linear-gradient(135deg,#39FF88,#0DB859)'},
        {bg:'linear-gradient(135deg,#CFFF39,#94D40D)'}
      ] },
    { id:'sakuraroyale', name:'桜皇家ゴールド', price:3000, desc:'金箔と桜吹雪をあしらった、極めて豪華な限定テーマ。',
      vars:{ '--bg-deep':'#170a10','--bg-deep2':'#26111a','--panel':'#391a27','--panel-light':'#4d2434',
        '--gold':'#FFD700','--coral':'#FF7FA6','--mint':'#FFE9B0','--blue':'#FFC94D','--purple':'#E0A9C4',
        '--pink':'#FF9EC4','--lime':'#FFE066','--text':'#FFF6E9','--text-dim':'#D9AFC0' },
      titleGrad:'linear-gradient(90deg,#FFD700,#FF9EC4)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE066,#FFD700)'},{bg:'linear-gradient(135deg,#FFC0DA,#FF9EC4)'},
        {bg:'linear-gradient(135deg,#FFE9B0,#FFC94D)'},{bg:'linear-gradient(135deg,#FFB8D6,#FF7FA6)'},
        {bg:'linear-gradient(135deg,#F5D6E4,#E0A9C4)'},{bg:'linear-gradient(135deg,#FFF0C6,#FFDD8A)'},
        {bg:'linear-gradient(135deg,#FFD9E8,#FFB0CE)'}
      ] },
    { id:'mintchoco', name:'ミントチョコレート', price:900, desc:'ミントの爽やかさとビターチョコの甘さの組み合わせ。',
      vars:{ '--bg-deep':'#1a120a','--bg-deep2':'#241a10','--panel':'#332415','--panel-light':'#453120',
        '--gold':'#C68642','--coral':'#A6673A','--mint':'#5FDDA8','--blue':'#7FC9A0','--purple':'#8B5A2B',
        '--pink':'#D9A679','--lime':'#8FE0B0','--text':'#FFF6EC','--text-dim':'#C9A88A' },
      titleGrad:'linear-gradient(90deg,#5FDDA8,#C68642)',
      colors:[
        {bg:'linear-gradient(135deg,#7FE8BC,#5FDDA8)'},{bg:'linear-gradient(135deg,#D9A679,#C68642)'},
        {bg:'linear-gradient(135deg,#8FE0B0,#4FC090)'},{bg:'linear-gradient(135deg,#B8845A,#8B5A2B)'},
        {bg:'linear-gradient(135deg,#9FE8C6,#6FCCA0)'},{bg:'linear-gradient(135deg,#E0B98A,#A6673A)'},
        {bg:'linear-gradient(135deg,#6FDDB0,#3FAE82)'}
      ] },
    { id:'lavender', name:'ラベンダーミルク', price:1100, desc:'ラベンダー畑とミルクのようなやさしい紫パステル。',
      vars:{ '--bg-deep':'#1c1526','--bg-deep2':'#2a1f3b','--panel':'#372a4d','--panel-light':'#473763',
        '--gold':'#D4B8FF','--coral':'#FFB8E0','--mint':'#C6D4FF','--blue':'#B0A8FF','--purple':'#9D7FE8',
        '--pink':'#E8B8FF','--lime':'#D0C6FF','--text':'#F5F0FF','--text-dim':'#B8A8D6' },
      titleGrad:'linear-gradient(90deg,#D4B8FF,#FFB8E0)',
      colors:[
        {bg:'linear-gradient(135deg,#E4D0FF,#D4B8FF)'},{bg:'linear-gradient(135deg,#FFD0EC,#FFB8E0)'},
        {bg:'linear-gradient(135deg,#D8E0FF,#C6D4FF)'},{bg:'linear-gradient(135deg,#C6BEFF,#B0A8FF)'},
        {bg:'linear-gradient(135deg,#B79DF0,#9D7FE8)'},{bg:'linear-gradient(135deg,#F0CCFF,#E8B8FF)'},
        {bg:'linear-gradient(135deg,#E0D8FF,#D0C6FF)'}
      ] },
    { id:'cherry', name:'チェリーソーダ', price:1300, desc:'ルビーのように濃いチェリーレッドの大人な一皿。',
      vars:{ '--bg-deep':'#1a0508','--bg-deep2':'#2c0810','--panel':'#3f0d18','--panel-light':'#571322',
        '--gold':'#FF4D6D','--coral':'#E8102E','--mint':'#FF7A94','--blue':'#FF3355','--purple':'#C4102C',
        '--pink':'#FF6B85','--lime':'#FF9EAE','--text':'#FFF0F2','--text-dim':'#D68A96' },
      titleGrad:'linear-gradient(90deg,#FF4D6D,#E8102E)',
      colors:[
        {bg:'linear-gradient(135deg,#FF7A94,#FF4D6D)'},{bg:'linear-gradient(135deg,#FF5070,#E8102E)'},
        {bg:'linear-gradient(135deg,#FF9EAE,#FF6B85)'},{bg:'linear-gradient(135deg,#FF4560,#C4102C)'},
        {bg:'linear-gradient(135deg,#FF849A,#F02E48)'},{bg:'linear-gradient(135deg,#FFB0BE,#FF7A94)'},
        {bg:'linear-gradient(135deg,#F03350,#A80D22)'}
      ] },
    { id:'citrus', name:'シトラスポップ', price:950, desc:'オレンジとレモンがはじけるビタミンカラー全開。',
      vars:{ '--bg-deep':'#1f1503','--bg-deep2':'#2e2005','--panel':'#412d08','--panel-light':'#553c0c',
        '--gold':'#FFC800','--coral':'#FF8C00','--mint':'#FFE066','--blue':'#FFA800','--purple':'#FFB627',
        '--pink':'#FFD23D','--lime':'#D4FF00','--text':'#FFFAE8','--text-dim':'#D6C088' },
      titleGrad:'linear-gradient(90deg,#FFC800,#FF8C00)',
      colors:[
        {bg:'linear-gradient(135deg,#FFDA4D,#FFC800)'},{bg:'linear-gradient(135deg,#FFAA4D,#FF8C00)'},
        {bg:'linear-gradient(135deg,#FFEB8A,#FFE066)'},{bg:'linear-gradient(135deg,#FFC15E,#FFA800)'},
        {bg:'linear-gradient(135deg,#FFCB5E,#FFB627)'},{bg:'linear-gradient(135deg,#FFE070,#FFD23D)'},
        {bg:'linear-gradient(135deg,#E8FF5E,#D4FF00)'}
      ] },
    { id:'monochrome', name:'モノクロームスタイル', price:1700, desc:'白と黒だけで魅せる、洗練されたミニマルテーマ。',
      vars:{ '--bg-deep':'#0a0a0a','--bg-deep2':'#161616','--panel':'#232323','--panel-light':'#333333',
        '--gold':'#E8E8E8','--coral':'#B0B0B0','--mint':'#D0D0D0','--blue':'#909090','--purple':'#C0C0C0',
        '--pink':'#A8A8A8','--lime':'#F0F0F0','--text':'#FFFFFF','--text-dim':'#999999' },
      titleGrad:'linear-gradient(90deg,#F0F0F0,#909090)',
      colors:[
        {bg:'linear-gradient(135deg,#F5F5F5,#D8D8D8)'},{bg:'linear-gradient(135deg,#C0C0C0,#9A9A9A)'},
        {bg:'linear-gradient(135deg,#D8D8D8,#B0B0B0)'},{bg:'linear-gradient(135deg,#A8A8A8,#787878)'},
        {bg:'linear-gradient(135deg,#CACACA,#A0A0A0)'},{bg:'linear-gradient(135deg,#E8E8E8,#C8C8C8)'},
        {bg:'linear-gradient(135deg,#909090,#606060)'}
      ] },
    { id:'aurora', name:'オーロラヴェール', price:2000, desc:'極北の夜空に揺らめくオーロラの神秘的な光。',
      vars:{ '--bg-deep':'#020f14','--bg-deep2':'#051e26','--panel':'#0a2e38','--panel-light':'#0f404d',
        '--gold':'#7FFFD4','--coral':'#FF7FE0','--mint':'#5CFFB8','--blue':'#5CC8FF','--purple':'#8A7FFF',
        '--pink':'#B87FFF','--lime':'#B0FF5C','--text':'#EAFFFC','--text-dim':'#7FC2C4' },
      titleGrad:'linear-gradient(90deg,#7FFFD4,#B87FFF)',
      colors:[
        {bg:'linear-gradient(135deg,#9EFFE0,#5CFFB8)'},{bg:'linear-gradient(135deg,#FFA8EC,#FF7FE0)'},
        {bg:'linear-gradient(135deg,#8ADCFF,#5CC8FF)'},{bg:'linear-gradient(135deg,#ADA3FF,#8A7FFF)'},
        {bg:'linear-gradient(135deg,#D0A8FF,#B87FFF)'},{bg:'linear-gradient(135deg,#CBFF8A,#B0FF5C)'},
        {bg:'linear-gradient(135deg,#A0FFE8,#7FFFD4)'}
      ] }
  ];

  // ===================== 🎰 ガチャ限定スキン(購入不可、ガチャでのみ入手可能。最も作り込んだスキン) =====================
  const GACHA_SKINS = [
    { id:'gacha_cosmicdragon', name:'🐉 コズミックドラゴン', price:0, gacha:true, gachaEffect:true,
      desc:'銀河の彼方より舞い降りし竜の鱗。虹色の輝きが盤面全体を包み込む、ガチャ限定の至宝。',
      vars:{ '--bg-deep':'#050318','--bg-deep2':'#0d0630','--panel':'#160b45','--panel-light':'#241259',
        '--gold':'#FFD700','--coral':'#FF3DBE','--mint':'#3DFFD0','--blue':'#3D8BFF','--purple':'#8A3DFF',
        '--pink':'#FF3DBE','--lime':'#B0FF3D','--text':'#F5F0FF','--text-dim':'#A995D9' },
      titleGrad:'linear-gradient(90deg,#FFD700,#FF3DBE,#3D8BFF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD700 0%,#FF9D3D 35%,#FF3DBE 70%,#8A3DFF 100%)'},
        {bg:'linear-gradient(135deg,#3DFFD0 0%,#3D8BFF 50%,#8A3DFF 100%)'},
        {bg:'linear-gradient(135deg,#FF3DBE 0%,#B03DFF 50%,#3D8BFF 100%)'},
        {bg:'linear-gradient(135deg,#3D8BFF 0%,#3DFFD0 50%,#B0FF3D 100%)'},
        {bg:'linear-gradient(135deg,#FFD700 0%,#FF3DBE 50%,#8A3DFF 100%)'},
        {bg:'linear-gradient(135deg,#B0FF3D 0%,#3DFFD0 50%,#3D8BFF 100%)'},
        {bg:'linear-gradient(135deg,#8A3DFF 0%,#FF3DBE 50%,#FFD700 100%)'}
      ] },
    { id:'gacha_celestialphoenix', name:'🔥 セレスティアルフェニックス', price:0, gacha:true, gachaEffect:true,
      desc:'天空を焦がして舞い上がる不死鳥の炎。触れれば燃え尽きるほどの熱を秘めた、ガチャ限定の伝説。',
      vars:{ '--bg-deep':'#1a0500','--bg-deep2':'#2e0a00','--panel':'#451400','--panel-light':'#5c1e00',
        '--gold':'#FFEC3D','--coral':'#FF4500','--mint':'#FFB03D','--blue':'#FF7A3D','--purple':'#FF2D55',
        '--pink':'#FF6B3D','--lime':'#FFD93D','--text':'#FFF6E9','--text-dim':'#D9A87F' },
      titleGrad:'linear-gradient(90deg,#FFEC3D,#FF4500,#FF2D55)',
      colors:[
        {bg:'linear-gradient(135deg,#FFEC3D 0%,#FFB03D 40%,#FF4500 80%,#FF2D55 100%)'},
        {bg:'linear-gradient(135deg,#FFD93D 0%,#FF7A3D 50%,#FF4500 100%)'},
        {bg:'linear-gradient(135deg,#FF4500 0%,#FF2D55 50%,#B0003D 100%)'},
        {bg:'linear-gradient(135deg,#FFEC3D 0%,#FF6B3D 50%,#FF2D55 100%)'},
        {bg:'linear-gradient(135deg,#FFB03D 0%,#FF4500 50%,#FF2D55 100%)'},
        {bg:'linear-gradient(135deg,#FFF6D0 0%,#FFEC3D 40%,#FF7A3D 100%)'},
        {bg:'linear-gradient(135deg,#FF2D55 0%,#FF4500 50%,#FFB03D 100%)'}
      ] },
    { id:'gacha_voidempress', name:'👑 ヴォイドエンプレス', price:0, gacha:true, gachaEffect:true,
      desc:'虚無を統べる女帝の威光。漆黒と紫銀の輝きが交差する、静謐にして絶対的な支配の証。',
      vars:{ '--bg-deep':'#020005','--bg-deep2':'#0a0512','--panel':'#150a26','--panel-light':'#221238',
        '--gold':'#E8D9FF','--coral':'#D63DFF','--mint':'#C9C9FF','--blue':'#7D3DFF','--purple':'#B03DFF',
        '--pink':'#FF3DDB','--lime':'#C9A8FF','--text':'#F5F0FF','--text-dim':'#9080B8' },
      titleGrad:'linear-gradient(90deg,#E8D9FF,#B03DFF,#D63DFF)',
      colors:[
        {bg:'linear-gradient(135deg,#E8D9FF 0%,#C9A8FF 40%,#B03DFF 80%,#3D0A5C 100%)'},
        {bg:'linear-gradient(135deg,#7D3DFF 0%,#3D0A5C 50%,#0A0018 100%)'},
        {bg:'linear-gradient(135deg,#D63DFF 0%,#B03DFF 50%,#5C0A8A 100%)'},
        {bg:'linear-gradient(135deg,#C9C9FF 0%,#7D3DFF 50%,#2E0050 100%)'},
        {bg:'linear-gradient(135deg,#FF3DDB 0%,#B03DFF 50%,#3D0A5C 100%)'},
        {bg:'linear-gradient(135deg,#E8D9FF 0%,#D63DFF 50%,#5C0A8A 100%)'},
        {bg:'linear-gradient(135deg,#3D0A5C 0%,#7D3DFF 50%,#E8D9FF 100%)'}
      ] },

{ id:'gacha_abyssleviathan', name:'🌊 アビス・リヴァイアサン', price:0, gacha:true, gachaEffect:true,
      desc:'深淵の底より姿を現す海の覇王。その身に宿す大海の力は、見る者の魂を呑み込む。',
      vars:{ '--bg-deep':'#020a14','--bg-deep2':'#041426','--panel':'#062240','--panel-light':'#09305c',
        '--gold':'#5CFFE0','--coral':'#00D4FF','--mint':'#3DFFE0','--blue':'#0099FF','--purple':'#5C6EFF',
        '--pink':'#3DDFFF','--lime':'#7FFFE0','--text':'#E0FBFF','--text-dim':'#7FA8C9' },
      titleGrad:'linear-gradient(90deg,#5CFFE0,#0099FF,#5C6EFF)',
      colors:[
        {bg:'linear-gradient(135deg,#00D4FF 0%,#0099FF 40%,#062240 100%)'},
        {bg:'linear-gradient(135deg,#5CFFE0 0%,#00D4FF 50%,#0099FF 100%)'},
        {bg:'linear-gradient(135deg,#3DDFFF 0%,#5C6EFF 50%,#062240 100%)'},
        {bg:'linear-gradient(135deg,#7FFFE0 0%,#3DFFE0 50%,#0099FF 100%)'},
        {bg:'linear-gradient(135deg,#0099FF 0%,#3DDFFF 50%,#5CFFE0 100%)'},
        {bg:'linear-gradient(135deg,#5C6EFF 0%,#0099FF 50%,#00D4FF 100%)'},
        {bg:'linear-gradient(135deg,#00D4FF 0%,#5CFFE0 50%,#3DDFFF 100%)'}
      ] },
    { id:'gacha_thunderlord', name:'⚡ サンダーロード', price:0, gacha:true, gachaEffect:true,
      desc:'天を裂き、地を焦がす雷霆の支配者。その一撃は神々さえも打ち倒す。',
      vars:{ '--bg-deep':'#0a0518','--bg-deep2':'#140a2e','--panel':'#1f1048','--panel-light':'#2e1a66',
        '--gold':'#FFE838','--coral':'#FFB800','--mint':'#FFEB66','--blue':'#B066FF','--purple':'#8833FF',
        '--pink':'#FFD93D','--lime':'#FFE838','--text':'#FFF8E0','--text-dim':'#B8A0D9' },
      titleGrad:'linear-gradient(90deg,#FFE838,#B066FF,#8833FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE838 0%,#FFB800 40%,#8833FF 100%)'},
        {bg:'linear-gradient(135deg,#FFF8E0 0%,#FFE838 50%,#B066FF 100%)'},
        {bg:'linear-gradient(135deg,#B066FF 0%,#8833FF 50%,#1f1048 100%)'},
        {bg:'linear-gradient(135deg,#FFD93D 0%,#FFB800 50%,#8833FF 100%)'},
        {bg:'linear-gradient(135deg,#FFEB66 0%,#FFE838 50%,#B066FF 100%)'},
        {bg:'linear-gradient(135deg,#8833FF 0%,#B066FF 50%,#FFE838 100%)'},
        {bg:'linear-gradient(135deg,#FFE838 0%,#FFB800 50%,#B066FF 100%)'}
      ] },
    { id:'gacha_celestialblossom', name:'🌸 セレスティアル・ブロッサム', price:0, gacha:true, gachaEffect:true,
      desc:'天界の庭園に咲き誇る聖なる花。その花びらに触れた者は、永遠の祝福を受けるという。',
      vars:{ '--bg-deep':'#1a0a18','--bg-deep2':'#2e1228','--panel':'#451c3a','--panel-light':'#5c2850',
        '--gold':'#FFD9A8','--coral':'#FFA8D9','--mint':'#FFE0F0','--blue':'#E0A8FF','--purple':'#C87FE8',
        '--pink':'#FFA8D9','--lime':'#FFEBE0','--text':'#FFF5F8','--text-dim':'#D9A8C8' },
      titleGrad:'linear-gradient(90deg,#FFD9A8,#FFA8D9,#E0A8FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE5F0 0%,#FFA8D9 40%,#E0A8FF 100%)'},
        {bg:'linear-gradient(135deg,#FFF5E0 0%,#FFD9A8 50%,#FFA8D9 100%)'},
        {bg:'linear-gradient(135deg,#FFA8D9 0%,#E0A8FF 50%,#C87FE8 100%)'},
        {bg:'linear-gradient(135deg,#FFEBE0 0%,#FFE5F0 50%,#E0A8FF 100%)'},
        {bg:'linear-gradient(135deg,#FFD9A8 0%,#FFA8D9 50%,#C87FE8 100%)'},
        {bg:'linear-gradient(135deg,#E0A8FF 0%,#C87FE8 50%,#FFD9A8 100%)'},
        {bg:'linear-gradient(135deg,#FFE5F0 0%,#E0A8FF 50%,#FFD9A8 100%)'}
      ] },

{ id:'gacha_eternalclockwork', name:'⚙️ エターナルクロックワーク', price:0, gacha:true, gachaEffect:true,
      desc:'時を統べる歯車の神。その機構は永遠の刻を刻み続ける、ガチャ限定の至高。',
      vars:{ '--bg-deep':'#0a0806','--bg-deep2':'#16120c','--panel':'#221c14','--panel-light':'#342b1f',
        '--gold':'#FFD060','--coral':'#C8803D','--mint':'#E8C060','--blue':'#A88850','--purple':'#C0A060',
        '--pink':'#E8B860','--lime':'#D8C060','--text':'#FFF0D0','--text-dim':'#B89860' },
      titleGrad:'linear-gradient(90deg,#FFD060,#C8803D,#8A6020)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE080 0%,#D8A040 40%,#8A6020 100%)'},
        {bg:'linear-gradient(135deg,#E8C060 0%,#B08030 50%,#604820 100%)'},
        {bg:'linear-gradient(135deg,#F0C870 0%,#C89040 50%,#8A6830 100%)'},
        {bg:'linear-gradient(135deg,#D8A850 0%,#A07830 50%,#504020 100%)'},
        {bg:'linear-gradient(135deg,#FFF0B0 0%,#FFD060 50%,#A87830 100%)'},
        {bg:'linear-gradient(135deg,#C0A060 0%,#8A6830 50%,#4A3820 100%)'},
        {bg:'linear-gradient(135deg,#FFE898 0%,#E8B050 50%,#B07830 100%)'}
      ] },
    { id:'gacha_prismaticqueen', name:'💎 プリズマティッククイーン', price:0, gacha:true, gachaEffect:true,
      desc:'プリズムのように七色に輝く女王の宝冠。見る角度で姿を変える、ガチャ限定の至宝。',
      vars:{ '--bg-deep':'#0a0518','--bg-deep2':'#160a28','--panel':'#221444','--panel-light':'#34205c',
        '--gold':'#FFD0FF','--coral':'#FF60D0','--mint':'#A0FFFF','--blue':'#80A0FF','--purple':'#D080FF',
        '--pink':'#FF80E0','--lime':'#D0FFA0','--text':'#FFF8FF','--text-dim':'#B8A0D8' },
      titleGrad:'linear-gradient(90deg,#FFD0FF,#A0FFFF,#D080FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD0FF 0%,#FF80D0 50%,#A060FF 100%)'},
        {bg:'linear-gradient(135deg,#A0FFFF 0%,#80C8FF 50%,#D080FF 100%)'},
        {bg:'linear-gradient(135deg,#D0FFA0 0%,#A0F0D0 50%,#80C8FF 100%)'},
        {bg:'linear-gradient(135deg,#FFB0E8 0%,#D080FF 50%,#8090FF 100%)'},
        {bg:'linear-gradient(135deg,#FFE0A0 0%,#FFA8C0 50%,#FF80E0 100%)'},
        {bg:'linear-gradient(135deg,#B0FFD8 0%,#A0E8F0 50%,#D080FF 100%)'},
        {bg:'linear-gradient(135deg,#F0B0FF 0%,#D090FF 50%,#A0A8FF 100%)'}
      ] }
  ];

  // ===================== 🆕 追加スキン（テーマ拡張15種） =====================
  SKINS.push(
    { id:'stardust', name:'スターダスト', price:900, desc:'夜空に瞬く無数の星屑を集めたような、きらめくダークブルー。',
      vars:{ '--bg-deep':'#07061a','--bg-deep2':'#0e0c30','--panel':'#181350','--panel-light':'#241d6e',
        '--gold':'#FFE066','--coral':'#FF8FA3','--mint':'#8FE3FF','--blue':'#6E8CFF','--purple':'#B18CFF',
        '--pink':'#FFA8D9','--lime':'#E1F065','--text':'#F5F3FF','--text-dim':'#A8A0D9' },
      titleGrad:'linear-gradient(90deg,#FFE066,#6E8CFF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE066,#FFC93D)'},{bg:'linear-gradient(135deg,#8FE3FF,#4DB6FF)'},
        {bg:'linear-gradient(135deg,#B18CFF,#7C5CFF)'},{bg:'linear-gradient(135deg,#FFA8D9,#FF6FB5)'},
        {bg:'linear-gradient(135deg,#8FFFCF,#3DDC97)'},{bg:'linear-gradient(135deg,#FFB88F,#FF7A3D)'},
        {bg:'linear-gradient(135deg,#E1F065,#A8D93D)'}
      ] },
    { id:'moonlight', name:'ムーンライトソナタ', price:1100, desc:'静かな夜に響く月光の調べ。銀色に煌めく幻想的なパレット。',
      vars:{ '--bg-deep':'#0a0e22','--bg-deep2':'#141a38','--panel':'#1e2652','--panel-light':'#2b3570',
        '--gold':'#E0E8FF','--coral':'#9BB0FF','--mint':'#C8D8FF','--blue':'#7A92F0','--purple':'#A8B8FF',
        '--pink':'#D8C8FF','--lime':'#B8D8FF','--text':'#F0F4FF','--text-dim':'#8A96C8' },
      titleGrad:'linear-gradient(90deg,#E0E8FF,#7A92F0)',
      colors:[
        {bg:'linear-gradient(135deg,#F0F4FF,#C8D8FF)'},{bg:'linear-gradient(135deg,#B8C8FF,#7A92F0)'},
        {bg:'linear-gradient(135deg,#D8C8FF,#A8A0E8)'},{bg:'linear-gradient(135deg,#A8E0FF,#6FB0E8)'},
        {bg:'linear-gradient(135deg,#E8E0FF,#A8B8FF)'},{bg:'linear-gradient(135deg,#C8F0FF,#7CC8E8)'},
        {bg:'linear-gradient(135deg,#D0D8FF,#8A96C8)'}
      ] },
    { id:'desert', name:'デザートミラージュ', price:1000, desc:'蜃気楼の向こうに広がる灼熱の砂漠と夕陽のオレンジ。',
      vars:{ '--bg-deep':'#2a1a0c','--bg-deep2':'#3e2712','--panel':'#55341a','--panel-light':'#704625',
        '--gold':'#FFB84D','--coral':'#FF7043','--mint':'#FFD9A0','--blue':'#FFAB6B','--purple':'#E88A4A',
        '--pink':'#FF9070','--lime':'#F0C060','--text':'#FFF4E0','--text-dim':'#C9A67F' },
      titleGrad:'linear-gradient(90deg,#FFB84D,#FF7043)',
      colors:[
        {bg:'linear-gradient(135deg,#FFC97A,#F09A3D)'},{bg:'linear-gradient(135deg,#FF9070,#E85A3D)'},
        {bg:'linear-gradient(135deg,#FFE0A0,#E8B860)'},{bg:'linear-gradient(135deg,#FFAB6B,#D98040)'},
        {bg:'linear-gradient(135deg,#E8A870,#B87040)'},{bg:'linear-gradient(135deg,#FFD060,#E8A030)'},
        {bg:'linear-gradient(135deg,#C08A50,#905A30)'}
      ] },
    { id:'forest', name:'フォレストブリーズ', price:950, desc:'木漏れ日が差し込む深い森の緑と、土の温もりを感じるナチュラルカラー。',
      vars:{ '--bg-deep':'#0c1a0c','--bg-deep2':'#152a15','--panel':'#1e3d1e','--panel-light':'#2a522a',
        '--gold':'#A8E060','--coral':'#D89050','--mint':'#6FD86F','--blue':'#7FD8A0','--purple':'#A8C870',
        '--pink':'#E0C888','--lime':'#C8E870','--text':'#F0FFE8','--text-dim':'#8AB88A' },
      titleGrad:'linear-gradient(90deg,#A8E060,#6FD86F)',
      colors:[
        {bg:'linear-gradient(135deg,#B8E88A,#7FC850)'},{bg:'linear-gradient(135deg,#70D870,#40A840)'},
        {bg:'linear-gradient(135deg,#A0D8A0,#60A860)'},{bg:'linear-gradient(135deg,#D8C080,#A89040)'},
        {bg:'linear-gradient(135deg,#88D8A8,#50A870)'},{bg:'linear-gradient(135deg,#C8E888,#90C850)'},
        {bg:'linear-gradient(135deg,#A8B870,#708040)'}
      ] },
    { id:'crystalcave', name:'クリスタルケイブ', price:1400, desc:'地底深くに輝く紫水晶と蒼い結晶が織りなす、神秘の洞窟。',
      vars:{ '--bg-deep':'#0a0520','--bg-deep2':'#160a36','--panel':'#221450','--panel-light':'#321e6e',
        '--gold':'#B0E0FF','--coral':'#E070FF','--mint':'#80E0FF','--blue':'#6FB8FF','--purple':'#A870FF',
        '--pink':'#D880FF','--lime':'#A0E8FF','--text':'#F5F0FF','--text-dim':'#9C8AC8' },
      titleGrad:'linear-gradient(90deg,#B0E0FF,#A870FF)',
      colors:[
        {bg:'linear-gradient(135deg,#C8E8FF,#80B8E8)'},{bg:'linear-gradient(135deg,#D8A8FF,#A870E8)'},
        {bg:'linear-gradient(135deg,#A0D8FF,#5090E0)'},{bg:'linear-gradient(135deg,#E0B8FF,#B080E8)'},
        {bg:'linear-gradient(135deg,#90D8E8,#4090B8)'},{bg:'linear-gradient(135deg,#C8B0FF,#9070E0)'},
        {bg:'linear-gradient(135deg,#B0E8D8,#60B8A8)'}
      ] },
    { id:'cybercity', name:'サイバーシティ2099', price:1700, desc:'ネオンが瞬く未来都市の夜景。電脳空間のサイバーパンク配色。',
      vars:{ '--bg-deep':'#05001a','--bg-deep2':'#0a0530','--panel':'#150a45','--panel-light':'#20125c',
        '--gold':'#00F0FF','--coral':'#FF00A8','--mint':'#00FFA8','--blue':'#00A8FF','--purple':'#A800FF',
        '--pink':'#FF00A8','--lime':'#A8FF00','--text':'#F0F8FF','--text-dim':'#7090B8' },
      titleGrad:'linear-gradient(90deg,#00F0FF,#FF00A8)',
      colors:[
        {bg:'linear-gradient(135deg,#00F0FF,#0088A8)'},{bg:'linear-gradient(135deg,#FF00A8,#A80060)'},
        {bg:'linear-gradient(135deg,#00FFA8,#00A870)'},{bg:'linear-gradient(135deg,#A800FF,#6000A8)'},
        {bg:'linear-gradient(135deg,#A8FF00,#70A800)'},{bg:'linear-gradient(135deg,#FF8000,#A85000)'},
        {bg:'linear-gradient(135deg,#00A8FF,#0068A8)'}
      ] },
    { id:'fireworks', name:'花火大会', price:1300, desc:'夏の夜空を彩る大輪の花火。暗闇に弾ける鮮やかな色彩。',
      vars:{ '--bg-deep':'#0a0a14','--bg-deep2':'#15152a','--panel':'#1f1f40','--panel-light':'#2e2e5c',
        '--gold':'#FFE060','--coral':'#FF5080','--mint':'#60FFC0','--blue':'#60A8FF','--purple':'#C060FF',
        '--pink':'#FF60C0','--lime':'#C0FF60','--text':'#FFFFFF','--text-dim':'#A8A8C8' },
      titleGrad:'linear-gradient(90deg,#FFE060,#FF5080)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE060,#FFA020)'},{bg:'linear-gradient(135deg,#FF5080,#D02060)'},
        {bg:'linear-gradient(135deg,#60FFC0,#20B080)'},{bg:'linear-gradient(135deg,#60A8FF,#2060C0)'},
        {bg:'linear-gradient(135deg,#C060FF,#8030C0)'},{bg:'linear-gradient(135deg,#FF60C0,#C02080)'},
        {bg:'linear-gradient(135deg,#C0FF60,#80C020)'}
      ] },
    { id:'pirate', name:'パイレーツコーブ', price:1200, desc:'海賊の隠れ家に眠る黄金と、深い海の青。冒険心をくすぐる配色。',
      vars:{ '--bg-deep':'#0a1418','--bg-deep2':'#141f28','--panel':'#1e2e3a','--panel-light':'#2c4250',
        '--gold':'#E8C060','--coral':'#C8804A','--mint':'#60C8B8','--blue':'#4A90B8','--purple':'#8A7050',
        '--pink':'#C89070','--lime':'#A8C060','--text':'#F0EDE0','--text-dim':'#9A9080' },
      titleGrad:'linear-gradient(90deg,#E8C060,#4A90B8)',
      colors:[
        {bg:'linear-gradient(135deg,#E8C060,#B89030)'},{bg:'linear-gradient(135deg,#60C8B8,#30A898)'},
        {bg:'linear-gradient(135deg,#4A90B8,#206890)'},{bg:'linear-gradient(135deg,#C8804A,#905020)'},
        {bg:'linear-gradient(135deg,#8A7050,#5A4830)'},{bg:'linear-gradient(135deg,#A8C060,#709030)'},
        {bg:'linear-gradient(135deg,#C89070,#906040)'}
      ] },
    { id:'ninja', name:'シノビシャドウ', price:1350, desc:'闇に溶け込む忍者の黒装束と、緋色の帯。静寂に満ちた和のダークテーマ。',
      vars:{ '--bg-deep':'#0a0606','--bg-deep2':'#150a0a','--panel':'#201010','--panel-light':'#301818',
        '--gold':'#C8A060','--coral':'#D83030','--mint':'#70A890','--blue':'#506890','--purple':'#705070',
        '--pink':'#C06080','--lime':'#A8A060','--text':'#F0E8E0','--text-dim':'#907878' },
      titleGrad:'linear-gradient(90deg,#D83030,#C8A060)',
      colors:[
        {bg:'linear-gradient(135deg,#D83030,#901818)'},{bg:'linear-gradient(135deg,#2a2a2a,#0a0a0a)'},
        {bg:'linear-gradient(135deg,#506890,#283850)'},{bg:'linear-gradient(135deg,#C8A060,#8A6030)'},
        {bg:'linear-gradient(135deg,#705070,#403040)'},{bg:'linear-gradient(135deg,#70A890,#387058)'},
        {bg:'linear-gradient(135deg,#A8A060,#707030)'}
      ] },
    { id:'hotspring', name:'湯けむり温泉', price:1000, desc:'湯気の立ち上る露天風呂と、夕暮れの空。心安らぐ和みの配色。',
      vars:{ '--bg-deep':'#2a1f18','--bg-deep2':'#3d2c22','--panel':'#503a2c','--panel-light':'#6a503c',
        '--gold':'#F0C890','--coral':'#E89070','--mint':'#D8C8B0','--blue':'#A8A8B8','--purple':'#C0A0A0',
        '--pink':'#E8A8A0','--lime':'#D0C080','--text':'#FFF4E8','--text-dim':'#C0A890' },
      titleGrad:'linear-gradient(90deg,#F0C890,#E89070)',
      colors:[
        {bg:'linear-gradient(135deg,#F0C890,#C89860)'},{bg:'linear-gradient(135deg,#E89070,#B86040)'},
        {bg:'linear-gradient(135deg,#A8A8B8,#788898)'},{bg:'linear-gradient(135deg,#C0A0A0,#907080)'},
        {bg:'linear-gradient(135deg,#D8C8B0,#A89880)'},{bg:'linear-gradient(135deg,#E8A8A0,#B87068)'},
        {bg:'linear-gradient(135deg,#D0C080,#908840)'}
      ] },
    { id:'retrogame', name:'レトロゲームボーイ', price:1100, desc:'8ビットの懐かしさ。モノクローム液晶のグリーン一色。',
      vars:{ '--bg-deep':'#0a1408','--bg-deep2':'#14240c','--panel':'#1e3a10','--panel-light':'#2e5518',
        '--gold':'#A8E060','--coral':'#70B830','--mint':'#B8E880','--blue':'#88C850','--purple':'#90D840',
        '--pink':'#A0E058','--lime':'#C8F088','--text':'#E8FFD8','--text-dim':'#88A870' },
      titleGrad:'linear-gradient(90deg,#A8E060,#70B830)',
      colors:[
        {bg:'linear-gradient(135deg,#C8F088,#90C850)'},{bg:'linear-gradient(135deg,#A8E060,#70B830)'},
        {bg:'linear-gradient(135deg,#B8E880,#80C048)'},{bg:'linear-gradient(135deg,#88C850,#509020)'},
        {bg:'linear-gradient(135deg,#A0E058,#689830)'},{bg:'linear-gradient(135deg,#90D840,#588810)'},
        {bg:'linear-gradient(135deg,#D8FFA0,#A8E060)'}
      ] },
    { id:'pasteldream', name:'パステルドリーム', price:1000, desc:'雲の上を歩くような、ふわふわで夢見心地のパステルカラー。',
      vars:{ '--bg-deep':'#2a1e30','--bg-deep2':'#3d2c44','--panel':'#503a58','--panel-light':'#6a506e',
        '--gold':'#FFD8E8','--coral':'#FFB0C8','--mint':'#C8E8FF','--blue':'#B0C8FF','--purple':'#D8B8F0',
        '--pink':'#FFB8D8','--lime':'#E0F0C0','--text':'#FFF8FF','--text-dim':'#C0A8C8' },
      titleGrad:'linear-gradient(90deg,#FFD8E8,#B0C8FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD8E8,#FFA8C8)'},{bg:'linear-gradient(135deg,#C8E8FF,#90C0F0)'},
        {bg:'linear-gradient(135deg,#D8B8F0,#B080E0)'},{bg:'linear-gradient(135deg,#C8F0E0,#90D0C0)'},
        {bg:'linear-gradient(135deg,#FFE8C8,#FFC890)'},{bg:'linear-gradient(135deg,#E0F0C0,#B0D080)'},
        {bg:'linear-gradient(135deg,#FFC8E0,#F090B8)'}
      ] },
    { id:'hologram', name:'ホログラムシフト', price:2000, desc:'光の角度で色が変わる、オーロラのような虹色の輝き。',
      vars:{ '--bg-deep':'#0a0a18','--bg-deep2':'#14142c','--panel':'#202040','--panel-light':'#2e2e60',
        '--gold':'#FFE0F0','--coral':'#FF80D0','--mint':'#A0F0FF','--blue':'#80B0FF','--purple':'#D080FF',
        '--pink':'#FF90E0','--lime':'#D0FFA0','--text':'#F8F0FF','--text-dim':'#A8A0C8' },
      titleGrad:'linear-gradient(90deg,#FFE0F0,#A0F0FF,#D080FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE0F0 0%,#FFA8D0 50%,#D080FF 100%)'},
        {bg:'linear-gradient(135deg,#A0F0FF 0%,#80C0FF 50%,#B080FF 100%)'},
        {bg:'linear-gradient(135deg,#D0FFA0 0%,#A0E8C8 50%,#80D0FF 100%)'},
        {bg:'linear-gradient(135deg,#FFB0E8 0%,#D080FF 50%,#8090FF 100%)'},
        {bg:'linear-gradient(135deg,#FFE080 0%,#FFA8A0 50%,#FF80D0 100%)'},
        {bg:'linear-gradient(135deg,#A0FFD8 0%,#80E0F0 50%,#B080FF 100%)'},
        {bg:'linear-gradient(135deg,#F0A8FF 0%,#C080F0 50%,#80A8FF 100%)'}
      ] },
    { id:'rainbowroad', name:'レインボーロード', price:2200, desc:'虹色に輝く夢の道。すべての色が主役のカラフルテーマ。',
      vars:{ '--bg-deep':'#0a0a14','--bg-deep2':'#14142a','--panel':'#1f1f40','--panel-light':'#2e2e5c',
        '--gold':'#FFD93D','--coral':'#FF4444','--mint':'#44FF88','--blue':'#4488FF','--purple':'#AA44FF',
        '--pink':'#FF44AA','--lime':'#AAFF44','--text':'#FFFFFF','--text-dim':'#B8B8D8' },
      titleGrad:'linear-gradient(90deg,#FF4444,#FFD93D,#44FF88,#4488FF,#AA44FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FF6B6B,#E83030)'},{bg:'linear-gradient(135deg,#FFD93D,#E8B020)'},
        {bg:'linear-gradient(135deg,#6BFF9C,#20C860)'},{bg:'linear-gradient(135deg,#6BB8FF,#2078E8)'},
        {bg:'linear-gradient(135deg,#C87BFF,#8030E8)'},{bg:'linear-gradient(135deg,#FF7BC8,#E830A0)'},
        {bg:'linear-gradient(135deg,#C8FF6B,#88C820)'}
      ] },
    { id:'snowfield', name:'スノーフィールド', price:1050, desc:'一面に広がる純白の雪原と、澄み切った冬空の青。',
      vars:{ '--bg-deep':'#1a2030','--bg-deep2':'#253044','--panel':'#324258','--panel-light':'#485a74',
        '--gold':'#E0F0FF','--coral':'#A8D0FF','--mint':'#FFFFFF','--blue':'#80B8E8','--purple':'#B8D0F0',
        '--pink':'#E0E8FF','--lime':'#D0E8FF','--text':'#FFFFFF','--text-dim':'#A8B8D0' },
      titleGrad:'linear-gradient(90deg,#E0F0FF,#80B8E8)',
      colors:[
        {bg:'linear-gradient(135deg,#FFFFFF,#D0E8FF)'},{bg:'linear-gradient(135deg,#B8D8F8,#80B0E8)'},
        {bg:'linear-gradient(135deg,#E0F0FF,#A8C8F0)'},{bg:'linear-gradient(135deg,#C8E0FF,#8FB8E8)'},
        {bg:'linear-gradient(135deg,#F0F8FF,#C0D8F0)'},{bg:'linear-gradient(135deg,#D8E8FF,#A0B8D8)'},
        {bg:'linear-gradient(135deg,#E8F4FF,#B0C8E8)'}
      ] }
  );

  // ===================== 🆕 アニメーションスキン(色や模様ではなく「動き」で新しい視点を持たせた特別枠) =====================
  // これまでのスキンは全て静止したグラデーションだったが、ここではブロック自体が
  // 常時アニメーションする(animType で描画方法が変わる)。単なる色替えでは出せない
  // 「生きている」ような質感を狙った、既存スキンとは全く違う切り口の追加。
  SKINS.push(
    { id:'chromaflow', name:'💫 クロマフロー', price:2400, animType:'pan',
      desc:'色が絶えず流れ続ける、生きているようなキャンディ。ブロックの中で虹色がゆらめき続ける。',
      vars:{ '--bg-deep':'#0a0518','--bg-deep2':'#160a2c','--panel':'#221446','--panel-light':'#32205e',
        '--gold':'#FFD166','--coral':'#FF6B9D','--mint':'#4DFFC8','--blue':'#4D9DFF','--purple':'#B166FF',
        '--pink':'#FF6BC8','--lime':'#C8FF4D','--text':'#F5F3FF','--text-dim':'#A89AD9' },
      titleGrad:'linear-gradient(90deg,#FFD166,#FF6BC8,#4D9DFF)',
      colors:[
        {bg:'linear-gradient(120deg,#FF6B9D 0%,#FFD166 25%,#4DFFC8 50%,#4D9DFF 75%,#B166FF 100%)'},
        {bg:'linear-gradient(120deg,#4DFFC8 0%,#4D9DFF 25%,#B166FF 50%,#FF6BC8 75%,#FFD166 100%)'},
        {bg:'linear-gradient(120deg,#B166FF 0%,#FF6BC8 25%,#FFD166 50%,#4DFFC8 75%,#4D9DFF 100%)'},
        {bg:'linear-gradient(120deg,#FFD166 0%,#4DFFC8 25%,#4D9DFF 50%,#B166FF 75%,#FF6B9D 100%)'},
        {bg:'linear-gradient(120deg,#4D9DFF 0%,#B166FF 25%,#FF6BC8 50%,#FFD166 75%,#4DFFC8 100%)'},
        {bg:'linear-gradient(120deg,#FF6BC8 0%,#4DFFC8 25%,#FFD166 50%,#FF6B9D 75%,#B166FF 100%)'},
        {bg:'linear-gradient(120deg,#C8FF4D 0%,#4D9DFF 25%,#FF6B9D 50%,#FFD166 75%,#4DFFC8 100%)'}
      ] },
    { id:'heartbeat', name:'💗 ハートビート・キャンディ', price:2000, animType:'pulse',
      desc:'鼓動のようにドクドクと明滅する、生命感あふれるスキン。じっと見ると少しドキドキする。',
      vars:{ '--bg-deep':'#1a050c','--bg-deep2':'#2c0a18','--panel':'#461428','--panel-light':'#5e2038',
        '--gold':'#FFC1D9','--coral':'#FF4D6D','--mint':'#FF8FA8','--blue':'#FF6B8F','--purple':'#FF3D5C',
        '--pink':'#FF6B9D','--lime':'#FFB8C8','--text':'#FFF0F4','--text-dim':'#D98AA0' },
      titleGrad:'linear-gradient(90deg,#FF4D6D,#FFC1D9)',
      colors:[
        {bg:'linear-gradient(135deg,#FF8FA8,#FF4D6D)'},{bg:'linear-gradient(135deg,#FF6B8F,#E8305A)'},
        {bg:'linear-gradient(135deg,#FFB8C8,#FF6B9D)'},{bg:'linear-gradient(135deg,#FF3D5C,#C81840)'},
        {bg:'linear-gradient(135deg,#FFC1D9,#FF8FB0)'},{bg:'linear-gradient(135deg,#FF4D6D,#D82048)'},
        {bg:'linear-gradient(135deg,#FF7090,#E83060)'}
      ] },
    { id:'prismspin', name:'🌀 プリズムスピン', price:2600, animType:'hue',
      desc:'虹色が渦を巻くように色相そのものが回転し続ける、めまぐるしいスキン。',
      vars:{ '--bg-deep':'#08081a','--bg-deep2':'#101030','--panel':'#1a1a48','--panel-light':'#26266a',
        '--gold':'#FFD966','--coral':'#FF6666','--mint':'#66FFCC','--blue':'#6699FF','--purple':'#B366FF',
        '--pink':'#FF66CC','--lime':'#CCFF66','--text':'#F5F5FF','--text-dim':'#9C9CD9' },
      titleGrad:'linear-gradient(90deg,#FF6666,#FFD966,#66FFCC,#6699FF,#B366FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FF6666,#FFD966)'},{bg:'linear-gradient(135deg,#FFD966,#66FFCC)'},
        {bg:'linear-gradient(135deg,#66FFCC,#6699FF)'},{bg:'linear-gradient(135deg,#6699FF,#B366FF)'},
        {bg:'linear-gradient(135deg,#B366FF,#FF66CC)'},{bg:'linear-gradient(135deg,#FF66CC,#FF6666)'},
        {bg:'linear-gradient(135deg,#CCFF66,#66FFCC)'}
      ] }
  );

  SKINS.push(...GACHA_SKINS);

  // ===================== 🎃 ハロウィン限定スキン(期間限定ガチャ/ロード/交換所でのみ入手。購入不可) =====================
  // ※スキンのデータ自体はずっと残る(入手済みのスキンはイベント終了後も使える)。入手経路だけがサーバーの期間設定で閉じる。
  const hwc = (pairs)=>pairs.map(([a,b])=>({bg:`linear-gradient(135deg,${a},${b})`}));
  const HALLOWEEN_SKINS = [
    { id:'hween_pumpkinking', name:'🎃 パンプキンキング', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'畑を支配するカボチャの王。燃えるようなオレンジと王冠の金色が盤面を照らす、ハロウィンガチャ最上級のスキン。',
      vars:{ '--bg-deep':'#120600','--bg-deep2':'#2a0e00','--panel':'#3d1704','--panel-light':'#561f06',
        '--gold':'#FFC02E','--coral':'#FF6A00','--mint':'#FFD98A','--blue':'#FF9A3D','--purple':'#C25BFF',
        '--pink':'#FF7A3D','--lime':'#F2E34A','--text':'#FFF4E4','--text-dim':'#D9A878' },
      titleGrad:'linear-gradient(90deg,#FFC02E,#FF6A00,#C25BFF)',
      colors:hwc([['#FFC02E','#FF6A00'],['#FF8A3D','#E04A00'],['#FFD98A','#FFA43D'],['#C25BFF','#7A2BD9'],['#FF6A00','#B83A00'],['#F2E34A','#FFB020'],['#FF9A3D','#FF4A00']]) },
    { id:'hween_vampire', name:'🧛 ヴァンパイアロード', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'深紅の夜に君臨する吸血鬼の貴族。黒いビロードと血のようなルビーが織りなす、気高く危険な配色。',
      vars:{ '--bg-deep':'#0b0207','--bg-deep2':'#1e040f','--panel':'#2f0818','--panel-light':'#45102a',
        '--gold':'#E8C27A','--coral':'#D01A45','--mint':'#FF6B8B','--blue':'#9A3B70','--purple':'#7B2CBF',
        '--pink':'#E0457B','--lime':'#E8C27A','--text':'#FFEFF2','--text-dim':'#C99AAA' },
      titleGrad:'linear-gradient(90deg,#E8C27A,#D01A45,#7B2CBF)',
      colors:hwc([['#D01A45','#7A0A26'],['#E8C27A','#B8893A'],['#FF6B8B','#D01A45'],['#7B2CBF','#4A1280'],['#E0457B','#A01A55'],['#9A3B70','#5A1A45'],['#FF8FA6','#E0457B']]) },
    { id:'hween_ghostparade', name:'👻 ゴーストパレード', price:0, gacha:true, event:'halloween', animType:'pulse',
      desc:'月夜にふわふわ漂うおばけの行列。ブロックがほんのり明滅し続ける、幻想的なアニメーションスキン。',
      vars:{ '--bg-deep':'#070f16','--bg-deep2':'#0e1f2c','--panel':'#16303f','--panel-light':'#1f4358',
        '--gold':'#BFF5FF','--coral':'#A78BFA','--mint':'#7FFFD4','--blue':'#7FB8FF','--purple':'#B8A4FF',
        '--pink':'#E0B8FF','--lime':'#C8FFE6','--text':'#F0FBFF','--text-dim':'#8FB8C8' },
      titleGrad:'linear-gradient(90deg,#BFF5FF,#B8A4FF,#7FFFD4)',
      colors:hwc([['#E6F9FF','#9FDDF2'],['#D9CCFF','#A78BFA'],['#BFFFEA','#7FFFD4'],['#CFE5FF','#7FB8FF'],['#F3DDFF','#C98CFF'],['#FFFFFF','#BFE8F5'],['#C8FFE6','#8FF0C8']]) },
    { id:'hween_witchbrew', name:'🔮 ウィッチブリュー', price:0, gacha:true, event:'halloween',
      desc:'魔女の大鍋でぐつぐつ煮えるポーション。毒々しいライムグリーンと妖しい紫が渦を巻く。',
      vars:{ '--bg-deep':'#0d0620','--bg-deep2':'#1b0b3a','--panel':'#2a1255','--panel-light':'#3b1a73',
        '--gold':'#B8FF3D','--coral':'#FF4FD8','--mint':'#3DFFA8','--blue':'#7A5CFF','--purple':'#B14DFF',
        '--pink':'#FF4FD8','--lime':'#B8FF3D','--text':'#F6EEFF','--text-dim':'#AE95D9' },
      titleGrad:'linear-gradient(90deg,#B8FF3D,#B14DFF,#FF4FD8)',
      colors:hwc([['#B8FF3D','#6FD000'],['#B14DFF','#6A1FC2'],['#FF4FD8','#B82A9A'],['#3DFFA8','#12B878'],['#7A5CFF','#4A2FC2'],['#D6FF7A','#9AE000'],['#E08CFF','#A83DE0']]) },
    { id:'hween_blackcat', name:'🐈‍⬛ ブラックキャットムーン', price:0, gacha:true, event:'halloween',
      desc:'満月を見上げる黒猫の瞳。漆黒の闇に、金色の月明かりと小さな星々が浮かぶ。',
      vars:{ '--bg-deep':'#050507','--bg-deep2':'#0d0d18','--panel':'#171729','--panel-light':'#222240',
        '--gold':'#FFE066','--coral':'#FF8A00','--mint':'#FFF3B0','--blue':'#6C7BFF','--purple':'#8A6CFF',
        '--pink':'#FFB36C','--lime':'#FFE066','--text':'#FFFBEA','--text-dim':'#A9A7C9' },
      titleGrad:'linear-gradient(90deg,#FFE066,#FF8A00,#8A6CFF)',
      colors:hwc([['#FFE066','#E0A800'],['#FF8A00','#C25A00'],['#FFF3B0','#FFD84D'],['#6C7BFF','#3A45C2'],['#8A6CFF','#5638C2'],['#FFB36C','#E07A1A'],['#3A3A5A','#1A1A30']]) },
    { id:'hween_candycorn', name:'🍬 キャンディコーン', price:0, gacha:true, event:'halloween',
      desc:'ハロウィン定番のお菓子。黄・橙・白の三色ストライプがポップに映える。',
      vars:{ '--bg-deep':'#1a0c05','--bg-deep2':'#2e1608','--panel':'#4a230d','--panel-light':'#65310f',
        '--gold':'#FFE14D','--coral':'#FF8A1F','--mint':'#FFF4C2','--blue':'#FFB347','--purple':'#E08A5C',
        '--pink':'#FF9F5C','--lime':'#FFE14D','--text':'#FFF8E8','--text-dim':'#D9B58A' },
      titleGrad:'linear-gradient(90deg,#FFE14D,#FF8A1F,#FFF4C2)',
      colors:hwc([['#FFE14D','#F2B800'],['#FF8A1F','#D95F00'],['#FFF4C2','#FFD98A'],['#FFB347','#E08A1F'],['#FFFFFF','#FFE9B0'],['#FF9F5C','#E0702A'],['#F2CC30','#D9A000']]) },
    { id:'hween_moonlight', name:'🌕 ムーンライト・マナー', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'月明かりに浮かぶ古い洋館。深い藍色と銀の光に包まれる、ハロウィンロード20段目の報酬。',
      vars:{ '--bg-deep':'#050a1a','--bg-deep2':'#0b1536','--panel':'#14224f','--panel-light':'#1d3070',
        '--gold':'#E6ECFF','--coral':'#8FA8FF','--mint':'#9FE8FF','--blue':'#5C7CFF','--purple':'#9C8CFF',
        '--pink':'#C0B0FF','--lime':'#CFE8FF','--text':'#F2F5FF','--text-dim':'#8F9CCF' },
      titleGrad:'linear-gradient(90deg,#E6ECFF,#8FA8FF,#9C8CFF)',
      colors:hwc([['#E6ECFF','#A8B8F0'],['#8FA8FF','#4A62D9'],['#9FE8FF','#5CB8E0'],['#5C7CFF','#2A3FB8'],['#9C8CFF','#5C48D9'],['#C0B0FF','#8A78E0'],['#CFE8FF','#8FB8E0']]) },
    { id:'hween_eternalnight', name:'🕯 エターナルナイト', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'終わらない夜に灯るろうそくの炎。紫黒と金の最高級スキン。ハロウィンロード40段目(完走)の記念報酬。',
      vars:{ '--bg-deep':'#07030f','--bg-deep2':'#14082a','--panel':'#221044','--panel-light':'#321764',
        '--gold':'#FFD36B','--coral':'#FF7A3D','--mint':'#FFB86B','--blue':'#8A5CFF','--purple':'#B14DFF',
        '--pink':'#FF5CA8','--lime':'#FFD36B','--text':'#FFF4E4','--text-dim':'#B8A0D9' },
      titleGrad:'linear-gradient(90deg,#FFD36B,#FF7A3D,#B14DFF)',
      colors:hwc([['#FFD36B','#E0A020'],['#FF7A3D','#C24A00'],['#B14DFF','#6A1FC2'],['#FF5CA8','#C22A70'],['#8A5CFF','#4A2FC2'],['#FFB86B','#E07A1A'],['#E0A0FF','#9A4DE0']]) },
    { id:'hween_spiderweb', name:'🕸 スパイダーウェブ', price:0, gacha:true, event:'halloween',
      desc:'銀の蜘蛛の巣が張る古い屋根裏。モノクロームに紫のアクセントが効いた、交換所限定スキン。',
      vars:{ '--bg-deep':'#09090d','--bg-deep2':'#14141c','--panel':'#22222e','--panel-light':'#30303f',
        '--gold':'#D8D8E8','--coral':'#B08CFF','--mint':'#C8C8D8','--blue':'#8A8AA8','--purple':'#9A6CFF',
        '--pink':'#C8A8FF','--lime':'#E8E8F4','--text':'#F4F4FA','--text-dim':'#9A9AB0' },
      titleGrad:'linear-gradient(90deg,#E8E8F4,#9A6CFF,#8A8AA8)',
      colors:hwc([['#E8E8F4','#B0B0C8'],['#B08CFF','#6A44C2'],['#C8C8D8','#8A8AA8'],['#9A6CFF','#5A38C2'],['#D8D8E8','#9A9AB8'],['#C8A8FF','#8A64E0'],['#F4F4FA','#C0C0D8']]) },
    { id:'hween_batswarm', name:'🦇 バットスウォーム', price:0, gacha:true, event:'halloween', animType:'pan',
      desc:'夜空を埋め尽くすコウモリの群れ。紫と赤のグラデーションが流れ続ける、交換所限定のアニメーションスキン。',
      vars:{ '--bg-deep':'#08030f','--bg-deep2':'#150822','--panel':'#24103c','--panel-light':'#341856',
        '--gold':'#FF9A6B','--coral':'#E0245A','--mint':'#C25BFF','--blue':'#6A4CFF','--purple':'#9A3DFF',
        '--pink':'#FF3D8A','--lime':'#FFB86B','--text':'#F8EEFF','--text-dim':'#AC90D0' },
      titleGrad:'linear-gradient(90deg,#FF9A6B,#E0245A,#9A3DFF)',
      colors:hwc([['#E0245A','#7A0F30'],['#9A3DFF','#4A1580'],['#FF3D8A','#A01A55'],['#6A4CFF','#2F1FA0'],['#FF9A6B','#D0502A'],['#C25BFF','#7A2BD9'],['#2A1A3E','#12081E']]) },
    { id:'hween_jackolantern', name:'🎃 ジャック・オ・ランタン', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'くり抜かれたかぼちゃの中でゆれる、あたたかいろうそくの炎。ハロウィンガチャの新スキン。',
      vars:{ '--bg-deep':'#140700','--bg-deep2':'#2c1000','--panel':'#451a04','--panel-light':'#5e250a','--gold':'#FFB02E','--coral':'#FF5A00','--mint':'#FFD27A','--blue':'#FF8A3D','--purple':'#D9702B','--pink':'#FF7A1F','--lime':'#FFE066','--text':'#FFF1DC','--text-dim':'#D9A878' },
      titleGrad:'linear-gradient(90deg,#FFB02E,#FF5A00,#FFE066)',
      colors:hwc([['#FFB02E','#E06A00'],['#FF5A00','#B03A00'],['#FFE066','#FFB020'],['#FF8A3D','#D04A00'],['#D9702B','#8A3A10'],['#FFD27A','#FFA43D'],['#FF7A1F','#C04000']]) },
    { id:'hween_mummy', name:'🩹 ミイラの包帯', price:0, gacha:true, event:'halloween',
      desc:'古い遺跡で眠るミイラの包帯。くすんだベージュに、ほんのり赤いしみ。ハロウィンガチャの新スキン。',
      vars:{ '--bg-deep':'#14110a','--bg-deep2':'#241e12','--panel':'#3a3120','--panel-light':'#4d412a','--gold':'#F0E0B0','--coral':'#C86A4A','--mint':'#E8D8A8','--blue':'#A89870','--purple':'#B8A078','--pink':'#D8B890','--lime':'#F4EAC8','--text':'#FBF5E0','--text-dim':'#B8AA84' },
      titleGrad:'linear-gradient(90deg,#F0E0B0,#C86A4A,#E8D8A8)',
      colors:hwc([['#F0E0B0','#C8B078'],['#E8D8A8','#B8A070'],['#C86A4A','#8A3A22'],['#F4EAC8','#D8C890'],['#A89870','#6A5A3A'],['#D8B890','#A08858'],['#FBF5E0','#E0D0A0']]) },
    { id:'hween_frankenstein', name:'🧪 フランケンラボ', price:0, gacha:true, event:'halloween',
      desc:'雷が落ちる実験室。ビリビリ光る電気の緑と、金属のグレー。交換所限定スキン。',
      vars:{ '--bg-deep':'#060d0a','--bg-deep2':'#0d1c15','--panel':'#15302a','--panel-light':'#1f4439','--gold':'#B8FF5C','--coral':'#3DFFC8','--mint':'#7AFFD8','--blue':'#4AC8FF','--purple':'#8A7AFF','--pink':'#FFE14D','--lime':'#B8FF5C','--text':'#EFFFF6','--text-dim':'#8AB8A4' },
      titleGrad:'linear-gradient(90deg,#B8FF5C,#3DFFC8,#FFE14D)',
      colors:hwc([['#B8FF5C','#5CC800'],['#3DFFC8','#12B890'],['#FFE14D','#D8A800'],['#4AC8FF','#1A78B8'],['#8A7AFF','#4A3AC2'],['#7AFFD8','#3AC8A0'],['#6A8A7A','#2A4A3A']]) },
    { id:'hween_skeletondance', name:'💀 スケルトンダンス', price:0, gacha:true, event:'halloween', animType:'pan',
      desc:'骨がカタカタ踊る真夜中のダンスホール。骨の白と深い青緑が流れ続ける、交換所限定のアニメーションスキン。',
      vars:{ '--bg-deep':'#05090c','--bg-deep2':'#0b161c','--panel':'#14262e','--panel-light':'#1d3744','--gold':'#F2F6F0','--coral':'#3DD8C8','--mint':'#BFFFF4','--blue':'#5C9DFF','--purple':'#9A8CFF','--pink':'#FF8FB8','--lime':'#E8FFE0','--text':'#F4FAF8','--text-dim':'#8AA8B0' },
      titleGrad:'linear-gradient(90deg,#F2F6F0,#3DD8C8,#9A8CFF)',
      colors:hwc([['#F2F6F0','#B8C8C0'],['#3DD8C8','#128A80'],['#BFFFF4','#7AD8CC'],['#5C9DFF','#2A5CB8'],['#9A8CFF','#5A48C2'],['#FF8FB8','#C84A7A'],['#E8FFE0','#A8D8A0']]) },
    { id:'hween_trickortreat', name:'🍭 トリック・オア・トリート', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'お菓子をくれなきゃいたずらするぞ！ピンクとオレンジのポップな配色。スタンプラリー完走の記念スキン。',
      vars:{ '--bg-deep':'#1a0714','--bg-deep2':'#2e0b22','--panel':'#4a1236','--panel-light':'#651a4a','--gold':'#FFD23D','--coral':'#FF4FA8','--mint':'#FFB8E0','--blue':'#FF8A3D','--purple':'#C25BFF','--pink':'#FF4FA8','--lime':'#B8FF3D','--text':'#FFF0F8','--text-dim':'#D9A0C0' },
      titleGrad:'linear-gradient(90deg,#FFD23D,#FF4FA8,#FF8A3D)',
      colors:hwc([['#FF4FA8','#B82A78'],['#FF8A3D','#D04A00'],['#FFD23D','#E0A000'],['#C25BFF','#7A2BD9'],['#B8FF3D','#6FD000'],['#FFB8E0','#E070B0'],['#FFFFFF','#FFD0E8']]) },
    { id:'hween_graveyardfog', name:'⚰ グレイブヤード・フォグ', price:0, gacha:true, event:'halloween', animType:'pulse', gachaEffect:true,
      desc:'霧がたちこめる夜の墓地。青白い月明かりと、湿った紫の影。図鑑コンプリート記念スキン。',
      vars:{ '--bg-deep':'#06070c','--bg-deep2':'#0e1018','--panel':'#1a1d2c','--panel-light':'#262a40','--gold':'#C8D4F0','--coral':'#7A8CE0','--mint':'#A8E0E8','--blue':'#5C7CC8','--purple':'#8A6CD8','--pink':'#B8A0E8','--lime':'#DCE8FF','--text':'#F0F4FF','--text-dim':'#8E96B8' },
      titleGrad:'linear-gradient(90deg,#C8D4F0,#7A8CE0,#8A6CD8)',
      colors:hwc([['#C8D4F0','#8A98C0'],['#7A8CE0','#3A48A0'],['#A8E0E8','#5CA0B0'],['#5C7CC8','#2A3C88'],['#8A6CD8','#4A38A0'],['#B8A0E8','#7860B8'],['#DCE8FF','#A0B0D8']]) },
    { id:'hween_crimsonmoon', name:'🌙 クリムゾンムーン', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'血のように赤い月が昇る夜。深紅と黒、金の縁取り。ハロウィンロード50段目の報酬。',
      vars:{ '--bg-deep':'#0c0204','--bg-deep2':'#1e0408','--panel':'#34080f','--panel-light':'#4c0e18','--gold':'#FFC85C','--coral':'#E0143C','--mint':'#FF7A8A','--blue':'#B8284A','--purple':'#9A2C8A','--pink':'#FF4A6A','--lime':'#FFC85C','--text':'#FFF0F0','--text-dim':'#C89098' },
      titleGrad:'linear-gradient(90deg,#FFC85C,#E0143C,#9A2C8A)',
      colors:hwc([['#E0143C','#7A0A22'],['#FFC85C','#C8901A'],['#FF7A8A','#D0344A'],['#B8284A','#6A0F26'],['#9A2C8A','#5A1050'],['#FF4A6A','#B0203C'],['#2A0A12','#10040A']]) },
    { id:'hween_grandcrown', name:'👑 ハロウィン・グランドクラウン', price:0, gacha:true, event:'halloween', gachaEffect:true, animType:'pan',
      desc:'ハロウィンを制した者だけがかぶれる、黄金と紫の王冠。ロード60段(完全制覇)の記念スキン。',
      vars:{ '--bg-deep':'#0b0518','--bg-deep2':'#1a0a34','--panel':'#2c1458','--panel-light':'#40207e','--gold':'#FFE066','--coral':'#FF8A1F','--mint':'#FFD98A','--blue':'#B14DFF','--purple':'#D68CFF','--pink':'#FF5CA8','--lime':'#FFE066','--text':'#FFF8E8','--text-dim':'#C0A8E0' },
      titleGrad:'linear-gradient(90deg,#FFE066,#FF8A1F,#B14DFF)',
      colors:hwc([['#FFE066','#E0A800'],['#FF8A1F','#C25A00'],['#B14DFF','#6A1FC2'],['#FF5CA8','#C22A70'],['#FFD98A','#E0A040'],['#D68CFF','#9A4DE0'],['#FFF8E8','#E0C890']]) }
  ];
  const HALLOWEEN_SKIN_IDS = HALLOWEEN_SKINS.map(x=>x.id);
  // ハロウィン開催中、標準スキンを装備している人に自動で適用される配色(黒紫 × 金 × カボチャ色)
  const HW_DEFAULT_VARS = { '--bg-deep':'#0a0613','--bg-deep2':'#170b2b','--panel':'#231238','--panel-light':'#34194f',
    '--gold':'#F4C95D','--coral':'#FF7A2F','--mint':'#8BE9B0','--blue':'#7BA9FF','--purple':'#B58CFF',
    '--pink':'#FF7AB6','--lime':'#C8E34A','--text':'#FBF3E8','--text-dim':'#B9A6D6' };
  const HW_TITLE_GRAD = 'linear-gradient(90deg,#F4C95D,#FF7A2F,#B58CFF)';
  SKINS.push(...HALLOWEEN_SKINS);

  // ===================== ❄ ウィンターパス限定スキン(v4.3。バトルパスの報酬でのみ入手。購入不可) =====================
  // ※「クリスマス」ではなく「冬」。雪・氷・オーロラ・極夜がテーマ。入手済みのスキンは、シーズンが終わってもずっと使える
  const wtc = (pairs)=>pairs.map(([a,b])=>({bg:`linear-gradient(135deg,${a},${b})`}));
  const WINTER_SKINS = [
    { id:'winter_powder', name:'❄ 粉雪', price:0, gacha:true, event:'winter', desc:'音もなく降り積もる粉雪。白と淡い水色のやさしい配色。ウィンターパスLv.20の報酬。',
      vars:{ '--bg-deep':'#0a1420','--bg-deep2':'#132235','--panel':'#1b3148','--panel-light':'#264462','--gold':'#E6F4FF','--coral':'#7FB8E8','--mint':'#BDEBFF','--blue':'#8EC5FF','--purple':'#B4C7FF','--pink':'#D8E6FF','--lime':'#CFF3FF','--text':'#F2F9FF','--text-dim':'#8FAAC4' },
      titleGrad:'linear-gradient(90deg,#E6F4FF,#7FB8E8,#BDEBFF)',
      colors:wtc([['#F2F9FF','#BFD9F0'],['#BDEBFF','#7FC4E8'],['#D8E6FF','#9DB6E0'],['#8EC5FF','#5A93D0'],['#CFF3FF','#8FD3EE'],['#B4C7FF','#7F95E0'],['#FFFFFF','#D0E4F6']]) },
    { id:'winter_icecrystal', name:'🧊 氷晶', price:0, gacha:true, event:'winter', desc:'透きとおる氷の結晶。シアンと群青がきらりと光る。ウィンターパスLv.50の報酬。',
      vars:{ '--bg-deep':'#04121c','--bg-deep2':'#08243a','--panel':'#0e3550','--panel-light':'#154a6e','--gold':'#7FF0FF','--coral':'#3DB8F0','--mint':'#A8FFF4','--blue':'#4DA8FF','--purple':'#7A8CFF','--pink':'#9AD8FF','--lime':'#B8FFF0','--text':'#EFFFFF','--text-dim':'#7FB2C8' },
      titleGrad:'linear-gradient(90deg,#7FF0FF,#3DB8F0,#7A8CFF)',
      colors:wtc([['#7FF0FF','#1FA8D0'],['#3DB8F0','#1070B0'],['#A8FFF4','#40C8C0'],['#4DA8FF','#1860C0'],['#7A8CFF','#4050C8'],['#C8F8FF','#70C8E0'],['#2090C8','#0A5080']]) },
    { id:'winter_blizzard', name:'🌨 吹雪', price:0, gacha:true, event:'winter', animType:'pulse', desc:'吹きすさぶ雪の中で、ブロックがゆらゆらと明滅する。ウィンターパスLv.80の報酬。',
      vars:{ '--bg-deep':'#0c1118','--bg-deep2':'#18212e','--panel':'#243244','--panel-light':'#31445c','--gold':'#DCE8F5','--coral':'#8AA8C8','--mint':'#C0D8EE','--blue':'#7CA0D0','--purple':'#9CA8D8','--pink':'#C4D0E8','--lime':'#D8E6F4','--text':'#F4F8FC','--text-dim':'#8A9CB2' },
      titleGrad:'linear-gradient(90deg,#DCE8F5,#8AA8C8,#9CA8D8)',
      colors:wtc([['#F0F6FC','#B8CCE0'],['#C0D8EE','#7C9CC0'],['#DCE8F5','#98B0CC'],['#8AA8C8','#506C90'],['#9CA8D8','#6070A8'],['#E4ECF6','#A8BCD4'],['#7CA0D0','#40608C']]) },
    { id:'winter_frostglass', name:'🪟 霜ガラス', price:0, gacha:true, event:'winter', desc:'冷えた窓ガラスに咲く霜の花。淡いミントとラベンダー。ウィンターパスLv.120の報酬。',
      vars:{ '--bg-deep':'#0a161a','--bg-deep2':'#12292f','--panel':'#1b3d45','--panel-light':'#26565f','--gold':'#C8FFF4','--coral':'#6FD0C8','--mint':'#A8F0E4','--blue':'#7CC8E8','--purple':'#B0B8F0','--pink':'#D0E8F8','--lime':'#D8FFF0','--text':'#F0FFFC','--text-dim':'#84AEB4' },
      titleGrad:'linear-gradient(90deg,#C8FFF4,#6FD0C8,#B0B8F0)',
      colors:wtc([['#C8FFF4','#6CC8BC'],['#A8F0E4','#48B0A4'],['#7CC8E8','#3C88B0'],['#B0B8F0','#7080C0'],['#D0E8F8','#90B8D8'],['#6FD0C8','#2C9088'],['#E8FFFA','#A0D8D0']]) },
    { id:'winter_aurora', name:'🌌 オーロラ', price:0, gacha:true, event:'winter', animType:'pan', gachaEffect:true, desc:'極北の空に揺れる緑と紫の光のカーテン。ウィンターパスLv.180の報酬。',
      vars:{ '--bg-deep':'#030b14','--bg-deep2':'#071c2a','--panel':'#0c2e3c','--panel-light':'#124456','--gold':'#7CFFC8','--coral':'#B06CFF','--mint':'#5CFFA8','--blue':'#4CC0FF','--purple':'#A070FF','--pink':'#E080FF','--lime':'#9CFF7C','--text':'#EFFFF8','--text-dim':'#78B0B0' },
      titleGrad:'linear-gradient(90deg,#7CFFC8,#4CC0FF,#B06CFF)',
      colors:wtc([['#5CFFA8','#10B070'],['#4CC0FF','#1070C0'],['#A070FF','#5028C0'],['#7CFFC8','#20B890'],['#E080FF','#A030C0'],['#9CFF7C','#40B020'],['#2C90D0','#0C4880']]) },
    { id:'winter_glacier', name:'🏔 氷河', price:0, gacha:true, event:'winter', desc:'ゆっくりと流れる巨大な氷河。深い青と純白。ウィンターパスLv.250の報酬。',
      vars:{ '--bg-deep':'#030d1a','--bg-deep2':'#062040','--panel':'#0a3260','--panel-light':'#10488a','--gold':'#CFEAFF','--coral':'#3C8CE8','--mint':'#9CD4FF','--blue':'#2C78E0','--purple':'#6C8CF0','--pink':'#A8C8FF','--lime':'#C0E4FF','--text':'#F0F8FF','--text-dim':'#7C9CC8' },
      titleGrad:'linear-gradient(90deg,#CFEAFF,#3C8CE8,#6C8CF0)',
      colors:wtc([['#CFEAFF','#80B8F0'],['#3C8CE8','#1450B0'],['#9CD4FF','#4C98E0'],['#2C78E0','#0C3C98'],['#6C8CF0','#3050C0'],['#F0F8FF','#B0D0F0'],['#1C60C0','#082C70']]) },
    { id:'winter_snowowl', name:'🦉 雪原のフクロウ', price:0, gacha:true, event:'winter', animType:'pulse', desc:'静かな雪原で獲物を待つシロフクロウ。白と灰、琥珀色の瞳。ウィンターパスLv.350の報酬。',
      vars:{ '--bg-deep':'#0c0e12','--bg-deep2':'#181c24','--panel':'#262c38','--panel-light':'#363e4e','--gold':'#FFC85C','--coral':'#D8A050','--mint':'#F2F2F2','--blue':'#9CA8B8','--purple':'#B0A8C0','--pink':'#E0D8D0','--lime':'#FFE090','--text':'#F8F8F8','--text-dim':'#9098A4' },
      titleGrad:'linear-gradient(90deg,#F2F2F2,#FFC85C,#9CA8B8)',
      colors:wtc([['#FAFAFA','#C8CCD4'],['#FFC85C','#D89018'],['#E0D8D0','#A8A098'],['#9CA8B8','#606C80'],['#F2F2F2','#B0B4BC'],['#D8A050','#A06C20'],['#3A4254','#1C2230']]) },
    { id:'winter_northstar', name:'⭐ 北極星', price:0, gacha:true, event:'winter', gachaEffect:true, desc:'凍てつく夜空で動かない、ただひとつの星。深い藍と金の輝き。ウィンターパスLv.450の報酬。',
      vars:{ '--bg-deep':'#02040e','--bg-deep2':'#060c26','--panel':'#0c1640','--panel-light':'#142260','--gold':'#FFE890','--coral':'#6C80FF','--mint':'#C8D4FF','--blue':'#4C64F0','--purple':'#8C7CFF','--pink':'#B8C0FF','--lime':'#FFF4C0','--text':'#F4F6FF','--text-dim':'#808CC0' },
      titleGrad:'linear-gradient(90deg,#FFE890,#6C80FF,#8C7CFF)',
      colors:wtc([['#FFE890','#D0A820'],['#6C80FF','#3040C8'],['#C8D4FF','#8090D8'],['#4C64F0','#1C30B0'],['#8C7CFF','#5040C8'],['#FFF4C0','#E0C870'],['#2C3CA8','#101A60']]) },
    { id:'winter_diamonddust', name:'💎 ダイヤモンドダスト', price:0, gacha:true, event:'winter', animType:'pan', gachaEffect:true, desc:'極寒の朝にだけ見られる、空気中の氷がきらめく現象。虹色の光がゆっくり流れる。ウィンターパスLv.600の報酬。',
      vars:{ '--bg-deep':'#070b16','--bg-deep2':'#101a30','--panel':'#1a2a4a','--panel-light':'#264070','--gold':'#FFFFFF','--coral':'#FF9CE8','--mint':'#9CFFF0','--blue':'#7CB8FF','--purple':'#C09CFF','--pink':'#FFB8F0','--lime':'#D8FFB8','--text':'#FFFFFF','--text-dim':'#98A8D0' },
      titleGrad:'linear-gradient(90deg,#9CFFF0,#FFFFFF,#FF9CE8,#C09CFF)',
      colors:wtc([['#FFFFFF','#B8D0F0'],['#FF9CE8','#C050B0'],['#9CFFF0','#40C0B0'],['#7CB8FF','#3070C8'],['#C09CFF','#7040C8'],['#FFF0B8','#E0B850'],['#D8FFB8','#80C050']]) },
    { id:'winter_polarnight', name:'🌃 極夜', price:0, gacha:true, event:'winter', desc:'太陽が昇らない、青黒い冬の夜。街の灯りだけが遠くに瞬く。ウィンターパスLv.750の報酬。',
      vars:{ '--bg-deep':'#02050a','--bg-deep2':'#050e1a','--panel':'#0a1a2c','--panel-light':'#102842','--gold':'#FFD27C','--coral':'#3C78C8','--mint':'#7CC8F0','--blue':'#2C5CB0','--purple':'#5C6CC8','--pink':'#8CA0D8','--lime':'#FFE8A8','--text':'#E8F0FA','--text-dim':'#6C84A4' },
      titleGrad:'linear-gradient(90deg,#FFD27C,#3C78C8,#5C6CC8)',
      colors:wtc([['#3C78C8','#143C78'],['#FFD27C','#C88C20'],['#7CC8F0','#3C88B8'],['#2C5CB0','#0C2C70'],['#5C6CC8','#2C3C88'],['#8CA0D8','#4C60A0'],['#142C50','#060E20']]) },
    { id:'winter_frozenthrone', name:'👑 氷の玉座', price:0, gacha:true, event:'winter', animType:'pan', gachaEffect:true, desc:'氷でできた王の席。白銀と蒼の冠が、盤面をゆっくり照らす。ウィンターパスLv.900の報酬。',
      vars:{ '--bg-deep':'#040a16','--bg-deep2':'#0a1a34','--panel':'#122c54','--panel-light':'#1c4280','--gold':'#E8F4FF','--coral':'#5CB0FF','--mint':'#B8E4FF','--blue':'#3C90F0','--purple':'#8CA8FF','--pink':'#C8DCFF','--lime':'#DCF0FF','--text':'#F8FCFF','--text-dim':'#84A4D0' },
      titleGrad:'linear-gradient(90deg,#E8F4FF,#5CB0FF,#8CA8FF)',
      colors:wtc([['#E8F4FF','#A0C8F0'],['#5CB0FF','#1C68C8'],['#B8E4FF','#68B4F0'],['#3C90F0','#1048B0'],['#8CA8FF','#4860D0'],['#FFFFFF','#C8DCF4'],['#1C3C78','#0A1C44']]) },
    { id:'winter_absolutezero', name:'🥶 絶対零度', price:0, gacha:true, event:'winter', animType:'pan', gachaEffect:true, desc:'すべてが止まる、世界でいちばん冷たい色。★ウィンターパスLv.1000限定★ 1000レベルまでしか手に入らない特別なスキン。',
      vars:{ '--bg-deep':'#00060f','--bg-deep2':'#021428','--panel':'#05243f','--panel-light':'#0a3a62','--gold':'#CFF8FF','--coral':'#00E0FF','--mint':'#7CFFFF','--blue':'#00B4FF','--purple':'#6C9CFF','--pink':'#A8F0FF','--lime':'#E8FFFF','--text':'#FFFFFF','--text-dim':'#6CB8D0' },
      titleGrad:'linear-gradient(90deg,#FFFFFF,#00E0FF,#6C9CFF,#FFFFFF)',
      colors:wtc([['#FFFFFF','#9CE8FF'],['#00E0FF','#0088B8'],['#7CFFFF','#20B8C8'],['#00B4FF','#0060B0'],['#6C9CFF','#2C50C0'],['#CFF8FF','#70C8E0'],['#00A0D8','#004878']]) }
  ];
  SKINS.push(...WINTER_SKINS);

  // ===================== 模様入りスキンを自動生成（既存パレット×パターンの組み合わせ）=====================
  // 通常スキンより高価に設定し、ボードの各ブロックに柄（ストライプ・ドットなど）を重ねて描画する
  (function generatePatternedSkins(){
    // アニメーションスキンは「動き」自体が個性なので、柄バリエーションの自動生成対象からは除外する
    const plainSkins = SKINS.filter(s=>!s.gacha && !s.animType);
    const patternKeys = Object.keys(PATTERN_LAYERS);
    const N = patternKeys.length;

    plainSkins.forEach((base, i)=>{
      // 各スキンに2種の柄バリエーションを付与（プライマリ + セカンダリ）
      const primaryIdx = i % N;
      const secondaryIdx = (i * 3 + 7) % N;   // 別の柄が当たるよう黄金角風のずらし
      const seen = new Set();

      [primaryIdx, secondaryIdx].forEach((idx)=>{
        const patternKey = patternKeys[idx];
        if(seen.has(patternKey)) return;
        seen.add(patternKey);

        SKINS.push({
          id: `${base.id}-${patternKey}`,
          name: `${base.name}（${PATTERN_LABELS[patternKey]}柄）`,
          price: Math.round(base.price * 2.3 + 600),
          desc: `${base.desc} ブロックに${PATTERN_LABELS[patternKey]}模様をあしらった特別バージョン。`,
          vars: base.vars,
          titleGrad: base.titleGrad,
          colors: base.colors,
          pattern: patternKey
        });
      });
    });
  })();
  let ownedSkins = ['default'];
  let equippedSkin = 'default';

  const SHAPES = [
    [[0,0]],[[0,0]],
    [[0,0],[0,1]],[[0,0],[0,1]],
    [[0,0],[1,0]],[[0,0],[1,0]],
    [[0,0],[0,1],[0,2]],[[0,0],[1,0],[2,0]],
    [[0,0],[1,0],[1,1]],[[0,0],[0,1],[1,0]],[[0,0],[0,1],[1,1]],[[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[0,3]],[[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,1]],[[1,0],[1,1],[1,2],[0,1]],
    [[0,0],[1,0],[2,0],[1,1]],[[0,1],[1,1],[2,1],[1,0]],
    [[0,0],[1,0],[2,0],[2,1]],[[0,1],[1,1],[2,1],[2,0]],
    [[0,1],[0,2],[1,0],[1,1]],[[0,0],[0,1],[1,1],[1,2]],
    [[0,1],[1,0],[1,1],[1,2],[2,1]],
    [[0,0],[0,1],[0,2],[0,3],[0,4]],[[0,0],[1,0],[2,0],[3,0],[4,0]],
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]
  ];

  const boardEl = document.getElementById('board');
  const boardWrapEl = document.getElementById('board-wrap');
  const trayEl = document.getElementById('tray');
  const tetrisWrapEl = document.getElementById('tetris-wrap');
  const tetrisBoardEl = document.getElementById('tetrisBoard');
  const tetrisNextEl = document.getElementById('tetrisNext');
  const tetrisLevelEl = document.getElementById('tetrisLevel');
  const tetrisLinesEl = document.getElementById('tetrisLines');
  const tetrisComboTextEl = document.getElementById('tetrisComboText');
  const tBtnLeftEl = document.getElementById('tBtnLeft');
  const tBtnRightEl = document.getElementById('tBtnRight');
  const tBtnRotateEl = document.getElementById('tBtnRotate');
  const tBtnSoftEl = document.getElementById('tBtnSoft');
  const tBtnHardEl = document.getElementById('tBtnHard');
  const tBtnHoldEl = document.getElementById('tBtnHold');
  const tetrisHoldBoxEl = document.getElementById('tetrisHoldBox');
  const tetrisHelpBtnEl = document.getElementById('tetrisHelpBtn');
  const tetrisHelpPanelEl = document.getElementById('tetrisHelpPanel');
  const ghostEl = document.getElementById('ghost');
  const scoreValEl = document.getElementById('scoreVal');
  const bestValEl = document.getElementById('bestVal');
  const coinValEl = document.getElementById('coinVal');
  const timeAttackCardEl = document.getElementById('timeAttackCard');
  const timeAttackValEl = document.getElementById('timeAttackVal');
  const comboTextEl = document.getElementById('comboText');
  const overlayEl = document.getElementById('overlay');
  const finalScoreEl = document.getElementById('finalScore');
  const newBestNoteEl = document.getElementById('newBestNote');
  const coinEarnedNoteEl = document.getElementById('coinEarnedNote');
  const duelResultNoteEl = document.getElementById('duelResultNote');
  const restartBtn = document.getElementById('restartBtn');
  const soundBtn = document.getElementById('soundBtn');
  const questBtn = document.getElementById('questBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const modeBadgeEl = document.getElementById('modeBadge');
  const accountBtn = document.getElementById('accountBtn');
  const rankingBtn = document.getElementById('rankingBtn');
  const adminPanelBtn = document.getElementById('adminPanelBtn');
  const chatBtn = document.getElementById('chatBtn');
  const friendsBtn = document.getElementById('friendsBtn');
  const friendsDot = document.getElementById('friendsDot');
  const friendsMentionBadge = document.getElementById('friendsMentionBadge');
  const chatDot = document.getElementById('chatDot');
  const chatMentionBadge = document.getElementById('chatMentionBadge');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const modalClose = document.getElementById('modalClose');

  let board = [], cellEls = [], tray = [];
  let score = 0, best = 0, coins = 0, streak = 0, noClearStreak = 0;
  let soundOn = true;
  let soundVolume = 1;
  let darkMode = true;
  const STORAGE_APPSETTINGS = 'nexus-appsettings-v1';
  async function loadAppSettings(){
    try{
      const res = await appStorage.get(STORAGE_APPSETTINGS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        if(typeof parsed.soundVolume === 'number') soundVolume = parsed.soundVolume;
        if(typeof parsed.darkMode === 'boolean') darkMode = parsed.darkMode;
        if(typeof parsed.soundOn === 'boolean') soundOn = parsed.soundOn;
      }
    }catch(err){}
    applyDarkMode();
  }
  async function saveAppSettings(){
    try{ await appStorage.set(STORAGE_APPSETTINGS, JSON.stringify({soundVolume, darkMode, soundOn}), false); }catch(err){}
  }
  function applyDarkMode(){
    if(darkMode){
      document.documentElement.style.removeProperty('--bg-deep');
      document.documentElement.style.removeProperty('--bg-deep2');
      document.documentElement.style.removeProperty('--panel');
      document.documentElement.style.removeProperty('--panel-light');
      document.documentElement.style.removeProperty('--text');
      document.documentElement.style.removeProperty('--text-dim');
      applySkin(equippedSkin || 'default');
    } else {
      // ライトモード: 明るい配色に切り替え(ブロックの色自体はスキンのまま)
      document.documentElement.style.setProperty('--bg-deep', '#EDE7F6');
      document.documentElement.style.setProperty('--bg-deep2', '#F5F1FA');
      document.documentElement.style.setProperty('--panel', '#FFFFFF');
      document.documentElement.style.setProperty('--panel-light', '#F1EDF9');
      document.documentElement.style.setProperty('--text', '#2A1E38');
      document.documentElement.style.setProperty('--text-dim', '#8A7B9C');
    }
  }
  let dragState = null;

  let adminDisabledBlocks = [];
  let adminSafetyMode = false;

  const DAILY_STATS_DEFAULT = { linesCleared:0, piecesPlaced:0, combos:0, gamesPlayed:0, scoreEarned:0,
    bestSingleGameScore:0, tripleClearCount:0, maxComboStreak:0, hardModeGamesPlayed:0, maxNoClearStreak:0, bigPiecesPlaced:0 };
  let dailyStats = { ...DAILY_STATS_DEFAULT };
  let activeQuests = [];
  let questsCompletedCount = 0;

  let pendingMode = currentMode, pendingSize = SIZE;
  let authToken = null;
  const COOKIE_AUTH = 'nexus_auth';              // 旧方式(Cookie)。いまは引っ越し用に読むだけ
  // ===================== 🔑 ログインの保存(v3.9): Cookie → 端末ID(HWID) =====================
  // ・ログインのあと、この端末の「端末ID」を作ってサーバーに登録し、秘密のキーをもらう(端末IDはブラウザが乱数で作る)
  // ・トークンが切れても、Cookieが消えても、この端末ならID+キーで自動ログインできる(サーバーにはキーのハッシュだけ)
  // ・ログアウトすると、この端末の自動ログインも消える
  // ・v4.1: 1つの端末(HWID)に紐づくアカウントは1つだけ。ログイン/新規登録で紐づき、ログアウトで外れる
  const SESSION_KEY = 'nexus_session', HWID_KEY = 'nexus_hwid';
  const lsGet = (k)=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const lsSet = (k, v)=>{ try{ localStorage.setItem(k, v); }catch(e){} };
  const lsDel = (k)=>{ try{ localStorage.removeItem(k); }catch(e){} };
  function idbOpen(){ return new Promise(res=>{ try{ const r = indexedDB.open('nexus-device', 1); r.onupgradeneeded = ()=> r.result.createObjectStore('kv'); r.onsuccess = ()=> res(r.result); r.onerror = ()=> res(null); }catch(e){ res(null); } }); }
  async function idbGet(k){ const db = await idbOpen(); if(!db) return null; return new Promise(res=>{ try{ const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = ()=> res(q.result || null); q.onerror = ()=> res(null); }catch(e){ res(null); } }); }
  async function idbSet(k, v){ const db = await idbOpen(); if(!db) return; return new Promise(res=>{ try{ const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = ()=> res(); tx.onerror = ()=> res(); }catch(e){ res(); } }); }
  const toHex = (buf)=> Array.from(new Uint8Array(buf)).map(b=> b.toString(16).padStart(2, '0')).join('');
  async function makeFingerprint(){                       // 端末の特徴をまとめたハッシュ(参考情報。これだけではログインできない)
    try{
      const raw = [navigator.userAgent, navigator.platform, navigator.language, `${screen.width}x${screen.height}x${screen.colorDepth}`,
        Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency || '', navigator.deviceMemory || ''].join('|');
      return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))).slice(0, 32);
    }catch(e){ return ''; }
  }
  async function getHwid(create){
    let h = null;
    try{ h = JSON.parse(lsGet(HWID_KEY) || 'null'); }catch(e){}
    if(!h || !h.deviceId) h = await idbGet(HWID_KEY);       // localStorage だけ消えても、控えから戻す
    if((!h || !h.deviceId) && create){ const a = new Uint8Array(16); crypto.getRandomValues(a); h = { deviceId: toHex(a), deviceKey: '' }; }
    if(h && h.deviceId){ lsSet(HWID_KEY, JSON.stringify(h)); idbSet(HWID_KEY, h); return h; }
    return null;
  }
  async function saveHwid(h){ lsSet(HWID_KEY, JSON.stringify(h)); await idbSet(HWID_KEY, h); }
  async function registerDevice(){                         // ログイン直後に、この端末を登録してキーをもらう
    if(!authToken) return;
    try{
      const h = await getHwid(true);
      const r = await fetch(`${API_BASE_URL}/api/device/register`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ deviceId: h.deviceId, fp: await makeFingerprint() }) });
      const d = await r.json().catch(()=>({}));
      if(r.ok && d.deviceKey){ h.deviceKey = d.deviceKey; await saveHwid(h); }
    }catch(e){ /* あとで次のログインのときに登録される */ }
  }
  // この端末のHWIDで、ログインを試す。結果は3種類:
  //   { status:'ok', data:{token,id,...} } … HWIDに紐づいたアカウントがあった → そのアカウントでログイン
  //   { status:'none' }                    … 未登録(または無効) → ゲスト
  //   { status:'error' }                   … サーバーに届かない/不調 → 判断できない(今のログインは保つ)
  async function deviceLogin(){
    const h = await getHwid(false);
    if(!h || !h.deviceKey) return { status:'none' };
    try{
      const r = await fetch(`${API_BASE_URL}/api/device/login`, { method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ deviceId: h.deviceId, deviceKey: h.deviceKey }) });
      if(r.status === 401 || r.status === 403){ h.deviceKey = ''; await saveHwid(h); return { status:'none' }; }     // 紐付けが無い/無効 → キーを捨てる
      if(!r.ok) return { status:'error' };
      const data = await r.json();
      return data && data.token ? { status:'ok', data } : { status:'error' };
    }catch(e){ return { status:'error' }; }
  }
  async function saveAuthSession(token, id){
    lsSet(SESSION_KEY, JSON.stringify({ token, id }));
    registerDevice();                                        // 待たなくてよい
  }
  async function clearAuthSession(tok){
    lsDel(SESSION_KEY);
    try{ deleteCookie(COOKIE_AUTH); }catch(err){}
    const h = await getHwid(false);
    if(h){
      if(tok){ try{ await fetch(`${API_BASE_URL}/api/device/logout`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${tok}` }, body: JSON.stringify({ deviceId: h.deviceId }) }); }catch(e){} }
      h.deviceKey = ''; await saveHwid(h);                   // 端末IDは残し、自動ログインのキーだけ消す
    }
  }
  // ページを開くたびに、まずHWIDを確認する(v4.1):
  //   ① HWIDに紐づいたアカウントがある → そのアカウントでログイン
  //   ② 紐づいていない(未登録) → ゲスト
  //   ③ サーバーに届かないときだけ、前回のログイン情報をそのまま使う(通信エラーで勝手にログアウトしないため)
  // ※ 旧バージョン(HWID導入前)でログイン中だった人は、最初の1回だけそのまま引き継ぎ、この端末に紐づけます
  const HW2_FLAG = 'nexus_hw_v41';
  function readSavedSession(){
    try{ const raw = lsGet(SESSION_KEY); if(raw){ const p = JSON.parse(raw); if(p && p.token) return p; } }catch(err){}
    try{
      const raw = getCookie(COOKIE_AUTH);
      if(raw){ const p = JSON.parse(raw); if(p && p.token){ lsSet(SESSION_KEY, JSON.stringify(p)); deleteCookie(COOKIE_AUTH); return p; } }
    }catch(err){}
    return null;
  }
  async function loadAuthSession(){
    const saved = readSavedSession();
    const r = await deviceLogin();
    if(r.status === 'ok'){
      const p = { token: r.data.token, id: r.data.id };
      lsSet(SESSION_KEY, JSON.stringify(p)); lsSet(HW2_FLAG, '1');
      return p;
    }
    if(r.status === 'error') return saved;                    // サーバーに届かない: 判断できないので、今の状態を保つ
    if(!lsGet(HW2_FLAG)){ lsSet(HW2_FLAG, '1'); return saved; }   // 旧バージョンからの引っ越し(1回だけ)
    lsDel(SESSION_KEY);                                       // 未登録 → ゲスト
    return null;
  }
  // リロード後も安全にログイン状態を復元する。
  // トークンをローカルに保存し、起動時にサーバーへ検証リクエストを送って
  // 有効な場合のみ復元(無効/期限切れなら破棄してゲスト状態に戻す)。
  async function restoreSession(){
    const saved = await loadAuthSession();
    if(!saved) return false;
    // 先にログイン状態にする(サーバーが寝ていても、ここで待たせない)。確認はそのあとで行う
    authToken = saved.token;
    currentUserId = saved.id;
    updateAccountButton();
    startPlayTimeTracking();
    startUserSync();
    try{
      const ctrl = new AbortController();
      const to = setTimeout(()=>ctrl.abort(), 60000);
      const r = await fetch(`${API_BASE_URL}/api/sync`, { headers:{ 'Authorization':`Bearer ${authToken}` }, signal: ctrl.signal });
      clearTimeout(to);
      if(r.status === 401 || r.status === 404){
        // トークンの期限切れなら、この端末のID(HWID)で自動ログインし直す
        const dlr = await deviceLogin();
        const dl = dlr.status === 'ok' ? dlr.data : null;
        if(dl && dl.token){
          authToken = dl.token; currentUserId = dl.id;
          lsSet(SESSION_KEY, JSON.stringify({ token: dl.token, id: dl.id }));
          try{
            const r2 = await fetch(`${API_BASE_URL}/api/sync`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
            if(r2.ok){ applySyncData(await r2.json()); updateAccountButton(); return true; }
          }catch(e){ return true; }
        }
        // 本当に無効(アカウント削除・BANなど)なときだけログアウトする
        const oldTok = authToken;
        stopUserSync(); stopPlayTimeTracking();
        authToken = null; currentUserId = null; currentDisplayName = ''; currentIcon = ''; currentLv = null;
        await clearAuthSession(oldTok);
        updateAccountButton();
        return false;
      }
      if(!r.ok) return true;                       // サーバーの一時的な不調ではログアウトしない
      { const h = await getHwid(false); if(!h || !h.deviceKey) registerDevice(); }      // 旧Cookieから引っ越した人は、ここで端末を登録
      applySyncData(await r.json());
      updateAccountButton();
      return true;
    }catch(err){
      return true;                                 // 通信できなかっただけ。ログイン状態は保つ(以前はここで勝手にログアウトしていた)
    }
  }
  let currentUserId = null;
  let currentDisplayName = '';                       // 表示名(未設定なら空 → 画面にはIDが出る)
  const nameCache = {};                              // {ID: 表示名} フレンド・対決・チャットで見かけた人
  const nameOf = (name, id)=> escapeHtml(name || id || '');          // 表示名(なければID)。HTMLに安全に埋め込める
  const myName = ()=> currentDisplayName || currentUserId || 'ゲスト';
  const cardCache = {};                              // {ID: {name, icon, lv}} アイコンとLvも覚えておく(対決・DMなど、名前しか届かない画面でも同じ見た目にするため)
  const rememberNames = (list)=>{ (list || []).forEach(x=>{ if(x && x.id){ nameCache[x.id] = x.name || x.id; if('icon' in x || 'lv' in x) cardCache[x.id] = { icon: x.icon || '', lv: x.lv || null }; } }); };
  const cardOf = (id)=> { const c = cardCache[id] || {}; return { id, name: nameCache[id] || id, icon: c.icon || '', lv: c.lv || null }; };
  const whoById = (id, size)=> whoHtml(cardOf(id), 'id', size);          // IDだけ分かっているとき用(アイコン+名前+Lv)
  const cachedName = (id)=> escapeHtml(nameCache[id] || id || '');
  let currentIcon = '', currentLv = null;            // 自分のアイコン('e:🎃:3' / 'i:画像ID' / '')とバトルパスLv

  // ----- 🖼 アイコン(アバター)・バトルパスLvの表示部品 -----
  const AV_GRAD = ['#ff8a1f,#ff4d6d', '#b14dff,#5c9dff', '#3ddc84,#2bb3a0', '#ffd23d,#ff8a1f', '#ff4fa8,#b14dff', '#5c9dff,#3dd8c8', '#9a8cff,#ff8fb8', '#8a98c0,#3a48a0'];
  const hashStr = (str)=>{ let h = 0; for(const c of String(str || '')) h = (h*31 + c.codePointAt(0)) >>> 0; return h; };
  function avatarHtml(icon, name, id, size, zoom){
    const sty = `--s:${size || 28}px`, e = /^e:(.+):([0-7])$/.exec(icon || ''), im = /^i:([0-9a-f]{16})$/.exec(icon || '');
    const zc = zoom ? ' av-zoom' : '', za = zoom ? ` data-zi="${escapeHtml(icon || '')}" data-zn="${escapeHtml(name || '')}" data-zid="${escapeHtml(id || '')}"` : '';   // zoom=true のアイコンは、押すと大きく見られる
    if(e) return `<span class="av${zc}" style="${sty};background:linear-gradient(135deg,${AV_GRAD[+e[2]]})"${za}>${escapeHtml(e[1])}</span>`;
    const letter = escapeHtml(Array.from(name || id || '?')[0].toUpperCase());       // 設定がなければ、名前の頭文字(色はIDから自動)
    const fb = `<span class="av${zc}" style="${sty};background:linear-gradient(135deg,${AV_GRAD[hashStr(id || name) % 8]})"${za}>${letter}</span>`;
    if(im) return `<img class="av av-img${zc}" style="${sty}" src="${API_BASE_URL}/api/img/${im[1]}${(size || 28) <= 80 ? '?s=t' : ''}" alt="" loading="lazy" decoding="async" data-fb="${encodeURIComponent(fb)}"${za}>`;
    return fb;
  }
  const lvTag = (lv)=> lv ? `<span class="bplv" title="バトルパスのレベル">Lv.${lv}</span>` : '';
  // アイコン + 表示名 + Lv をまとめて(o は { id, name, icon, lv } を持つオブジェクト。IDの項目名が違うときは idKey)
  const whoHtml = (o, idKey, size, zoom)=> { const id = o[idKey || 'id']; return `${avatarHtml(o.icon, o.name, id, size, zoom)}<span class="who-name">${nameOf(o.name, id)}</span>${lvTag(o.lv)}`; };
  document.addEventListener('error', (e)=>{                  // 画像が読めなかったら、頭文字のアイコンに差し替える / チャット画像は「期限切れ」の表示に
    const t = e.target;
    if(!t || !t.classList) return;
    // 🖼 imgBB に直接つながらない端末(iPad・フィルター・ブロッカーなど)対策: 読み込みに失敗したら、1回だけサーバー経由でやり直す
    if(t.tagName === 'IMG' && !t.dataset.px && /\/api\/img\/[0-9a-f]{16}/.test(t.src || '')){
      t.dataset.px = '1'; t.src = t.src + (t.src.includes('?') ? '&' : '?') + 'px=1'; return;
    }
    if(t.classList.contains('av-img')){ const d = document.createElement('span'); d.innerHTML = decodeURIComponent(t.dataset.fb || ''); if(d.firstChild) t.replaceWith(d.firstChild); }
    else if(t.classList.contains('chat-img')){ const d = document.createElement('div'); d.className = 'chat-img-gone'; d.textContent = '🕒 画像の保存期限が切れました'; t.replaceWith(d); }
  }, true);

  // ===================== 🖼 画像のアップロード(v4.1) =====================
  // 画像を選んだあとの流れ(2パターン):
  //   ①接続確認: サーバーに「imgBB につながる?」と聞く
  //   ②-A つながった → 圧縮せず「オリジナルの画質のまま」imgBB へ送る → そのURLの画像を、アイコン/チャットで呼び出す
  //   ②-B つながらない(または途中で失敗) → 小さく圧縮して、サーバーに保存 → アイコン/チャットで使う
  const sleepMs = (ms)=> new Promise(res=> setTimeout(res, ms));

  // 📤 画像1枚をサーバーへ送る。mode='original'(オリジナルのまま・imgBBへ) / 'compressed'(圧縮版・サーバー保存)
  //    Renderの無料サーバーは眠っていることがあるので、つながらない・502/503/504 のときは、少し待って最大3回までやり直す。
  //    失敗したとき、error.fallback が true なら「圧縮版でやり直してよい」という意味
  async function uploadImageBlob(kind, blob, onStatus, mode){
    const url = `${API_BASE_URL}/api/img/upload?kind=${kind}&mode=${mode === 'original' ? 'original' : 'compressed'}`;
    let lastErr = null;
    for(let attempt = 0; attempt < 3; attempt++){
      try{
        const r = await fetch(url, { method:'POST', headers:{ 'Content-Type': blob.type || 'image/jpeg', 'Authorization':`Bearer ${authToken}` }, body: blob });
        const d = await r.json().catch(()=>({}));
        if(r.ok && d.ok !== false) return d;
        if(!r.ok && d && d.fallback) throw Object.assign(new Error(d.error || 'imgBB に送れませんでした'), { final:true, fallback:true });
        if([502, 503, 504].includes(r.status)){ lastErr = new Error('サーバーを起こしています…'); }
        else throw Object.assign(new Error(d.error || `アップロードに失敗しました(${r.status})`), { final:true, fallback:false });
      }catch(err){
        if(err && err.final) throw err;
        lastErr = (err && err.name === 'TypeError') ? new Error('サーバーにつながりません。ネットワークを確認してください') : err;
      }
      if(attempt < 2){ if(onStatus) onStatus('サーバーを起こしています…もう一度送ります'); await sleepMs(2500 + attempt * 2500); }
    }
    throw lastErr || new Error('アップロードに失敗しました');
  }

  // ①接続確認: imgBB に「つながる」なら true
  async function imgbbReady(){
    for(let attempt = 0; attempt < 2; attempt++){
      try{
        const ctrl = new AbortController(), to = setTimeout(()=> ctrl.abort(), 20000);
        const r = await fetch(`${API_BASE_URL}/api/img/status`, { headers:{ 'Authorization':`Bearer ${authToken}` }, signal: ctrl.signal });
        clearTimeout(to);
        if(r.ok){ const d = await r.json().catch(()=>({})); return { ok: !!d.imgbb, max: d.originalMax || 16000000, reason: d.reason || '' }; }
        if(![502, 503, 504].includes(r.status)) break;
      }catch(e){ /* もう一度 */ }
      await sleepMs(2000);
    }
    return { ok:false, max:0, reason:'' };
  }

  // JPEGの「撮影場所(GPS)・カメラ情報」などのメタ情報だけを取り除く(画像そのものは1ピクセルも変えない=画質は同じ)。
  // 写真の向き(縦/横)の情報だけは残す(消すと、縦の写真が横向きになってしまうため)。JPEG以外はそのまま返す
  async function stripJpegMeta(file){
    try{
      const buf = new Uint8Array(await file.arrayBuffer());
      if(buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return file;
      const kept = []; let i = 2, orient = 1;
      while(i + 4 <= buf.length && buf[i] === 0xFF){
        const m = buf[i + 1];
        if(m === 0xFF){ i++; continue; }
        if(m === 0xD9 || m === 0xDA) break;                                  // ここから先は画像データ本体
        if(m === 0x01 || (m >= 0xD0 && m <= 0xD7)){ kept.push(buf.subarray(i, i + 2)); i += 2; continue; }
        const len = (buf[i + 2] << 8) | buf[i + 3], end = i + 2 + len;
        if(len < 2 || end > buf.length) return file;                          // 形がおかしい → 触らない
        if(m === 0xE2 && buf[i + 4] === 0x4D && buf[i + 5] === 0x50 && buf[i + 6] === 0x46 && buf[i + 7] === 0){
          /* 'MPF': 複数画像の位置情報。バイト位置がずれると壊れるので外す(色のプロファイルなど他のAPP2は残す) */
        }else if(m === 0xE1 || m === 0xED || m === 0xFE){                           // APP1(Exif/XMP)・APP13・コメント → 外す
          if(m === 0xE1 && buf[i + 4] === 0x45 && buf[i + 5] === 0x78 && buf[i + 6] === 0x69 && buf[i + 7] === 0x66){   // 'Exif'
            const t = i + 10, le = buf[t] === 0x49, dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
            try{
              const ifd = t + dv.getUint32(t + 4, le), n = dv.getUint16(ifd, le);
              for(let k = 0; k < n; k++){ const e = ifd + 2 + k * 12; if(dv.getUint16(e, le) === 0x0112){ orient = dv.getUint16(e + 8, le) || 1; break; } }
            }catch(e){ orient = 1; }
          }
        }else kept.push(buf.subarray(i, end));
        i = end;
      }
      const parts = [buf.subarray(0, 2)];
      if(kept.length && kept[0][1] === 0xE0) parts.push(kept.shift());                // JFIF(APP0)は、いちばん前に置く決まり
      if(orient > 1 && orient <= 8){
        parts.push(new Uint8Array([0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0,  0x4D, 0x4D, 0, 0x2A, 0, 0, 0, 8,  0, 1,  0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orient, 0, 0,  0, 0, 0, 0]));
      }
      kept.forEach(k=> parts.push(k)); parts.push(buf.subarray(i));
      return new Blob(parts, { type: 'image/jpeg' });
    }catch(e){ return file; }
  }

  // 画像を選んだあとの全部(①接続確認 → ②-A オリジナルをimgBBへ / ②-B 圧縮してサーバーへ)。onStatus(文章) で進み具合を知らせる
  async function uploadImageSmart(kind, file, onStatus, compressOpt){
    if(!file || !/^image\//.test(file.type || '')) throw new Error('画像ファイルを選んでください');
    const say = (t)=>{ if(onStatus) onStatus(t); };
    say('imgBB との接続を確認しています…');
    const st = await imgbbReady();
    if(st.ok && file.size <= st.max){
      try{
        say('オリジナルの画質のまま送っています…');
        return await uploadImageBlob(kind, file.type === 'image/jpeg' ? await stripJpegMeta(file) : file, say, 'original');
      }catch(err){
        if(!err || !err.fallback) throw err;                                // 圧縮でやり直しても同じ失敗(ログイン切れなど)のときは、そのまま知らせる
        say('imgBB に送れなかったので、圧縮して送ります…');
      }
    }else{
      say(st.ok ? '画像が大きいので、圧縮して送ります…' : 'imgBB につながらないので、圧縮して送ります…');
    }
    const blob = await compressImage(file, compressOpt);
    return await uploadImageBlob(kind, blob, say, 'compressed');
  }

  // ----- 📷 画像を小さく圧縮(送る前に。容量を使いすぎないための工夫) -----
  function loadBitmap(file){
    const viaImg = ()=> new Promise((res, rej)=>{ const url = URL.createObjectURL(file), im = new Image(); im.onload = ()=>{ URL.revokeObjectURL(url); res(im); }; im.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('画像を読み込めませんでした')); }; im.src = url; });
    return window.createImageBitmap ? createImageBitmap(file).catch(viaImg) : viaImg();
  }
  const toBlob = (cv, type, q)=> new Promise(r=> cv.toBlob(b=> r(b), type, q));
  async function compressImage(file, opt){
    const o = Object.assign({ maxEdge:800, maxBytes:70000, square:false }, opt || {});
    if(!file || !/^image\//.test(file.type || '')) throw new Error('画像ファイルを選んでください');
    const src = await loadBitmap(file);
    let w = src.width, h = src.height, sx = 0, sy = 0, sw = w, sh = h;
    if(o.square){ const m = Math.min(w, h); sx = (w - m)/2; sy = (h - m)/2; sw = sh = w = h = m; }
    const scale = Math.min(1, o.maxEdge / Math.max(w, h));
    let cw = Math.max(1, Math.round(w*scale)), ch = Math.max(1, Math.round(h*scale));
    for(let attempt = 0; attempt < 8; attempt++){
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);      // 透明な部分は白に(JPEGでも黒くならないように)
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
      for(const q of [0.82, 0.7, 0.58, 0.46, 0.36]){
        let blob = await toBlob(cv, 'image/webp', q);
        if(!blob || blob.type !== 'image/webp') blob = await toBlob(cv, 'image/jpeg', q);       // WebPが作れない端末(Safariなど)はJPEG
        if(blob && blob.size <= o.maxBytes) return blob;
      }
      cw = Math.max(1, Math.round(cw*0.8)); ch = Math.max(1, Math.round(ch*0.8));
    }
    throw new Error('画像を小さくできませんでした。別の画像でお試しください');
  }
  // 画像を大きく見る(タップで開く・もう一度タップで閉じる)
  function openLightbox(src){
    const el = document.createElement('div'); el.className = 'lightbox'; el.innerHTML = `<img src="${escapeHtml(src)}" alt=""><button type="button" aria-label="とじる">✕</button>`;
    el.addEventListener('click', ()=> el.remove()); document.body.appendChild(el);
  }
  // 🔍 アイコンを大きく見る(チャットの画像と同じ見かた:タップで開く・もう一度タップで閉じる)
  function openIconZoom(icon, name, id){
    const im = /^i:([0-9a-f]{16})$/.exec(icon || '');
    const big = Math.max(160, Math.min(360, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.78)));
    const el = document.createElement('div'); el.className = 'lightbox';
    el.innerHTML = `${im ? `<img class="lb-icon" src="${API_BASE_URL}/api/img/${im[1]}" alt="" style="width:${big}px;height:${big}px">` : `<div class="lb-av">${avatarHtml(icon, name, id, big)}</div>`}<div class="lb-cap">${nameOf(name, id)}</div><button type="button" aria-label="とじる">✕</button>`;
    el.addEventListener('click', ()=> el.remove()); document.body.appendChild(el);
  }
  document.addEventListener('click', (e)=>{
    const a = e.target.closest && e.target.closest('.av-zoom');
    if(!a) return;
    e.preventDefault(); e.stopPropagation();
    openIconZoom(a.dataset.zi, a.dataset.zn, a.dataset.zid);
  }, true);
  let playTime = 0;
  let playTimeInterval = null;

  // モード別ベストスコア
  let bestScores = { soft:0, baked:0, hard:0, extreme:0 };

  const STORAGE_BEST = 'nexus-highscore';
  const STORAGE_BEST_SCORES = 'nexus-bestScores-v1';
  const STORAGE_COINS = 'nexus-coins';
  const STORAGE_QUESTS = 'nexus-quests-v2';
  const STORAGE_SETTINGS = 'nexus-settings-v1';
  const STORAGE_SKINS = 'nexus-skins-v1';

  // ===================== ランキング用 =====================
  const RANKING_MODES = ['soft', 'baked', 'hard', 'extreme', 'tetris', 'timeattack'];
  const RANKING_MODE_LABELS = {
    soft: '🍮 柔らかい',
    baked: '🍪 焼成',
    hard: '🍬 硬い',
    extreme: '🧊 激硬',
    tetris: '🧱 テトリス',
    timeattack: '⏱ タイムアタック'
  };
  let currentRankingMode = 'soft';
  const rankingCache = {};   // 前回のランキング(開いた瞬間に表示するため)

  const RANKING_TYPES = ['score', 'coins', 'playtime'];
  const RANKING_TYPE_LABELS = {
    score: '🏆 スコア',
    coins: '🪙 コイン',
    playtime: '⏱️ プレイ時間'
  };
  let currentRankingType = 'score';
  let rankingPollInterval = null;
  let userSyncInterval = null;

  // ===================== ログイン中のユーザーデータをリアルタイム同期 =====================
  // 管理者コマンドでコインやスコアを変更されたときも、
  // 再ログインしなくても画面に反映されるように定期的にサーバーから取得する
  function startUserSync() {
    if (userSyncInterval) return;
    userSyncInterval = setInterval(() => { if(!document.hidden) syncFromServer(); }, 8000);   // 画面を見ていないときは問い合わせない
  }
  function stopUserSync() {
    if (userSyncInterval) { clearInterval(userSyncInterval); userSyncInterval = null; }
  }

  function boardIndex(r,c){ return r*SIZE+c; }
  function todayKey(){ return new Date().toISOString().slice(0,10); }

  // ===================== プレイ時間計測 =====================
  function startPlayTimeTracking() {
    if (playTimeInterval) return;
    playTimeInterval = setInterval(() => { playTime++; }, 1000);
  }
  function stopPlayTimeTracking() {
    if (playTimeInterval) { clearInterval(playTimeInterval); playTimeInterval = null; }
  }
  function syncPlayTime() {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
      body: JSON.stringify({ playTime })
    }).catch(() => {});
  }

  // ===================== ボード初期化 =====================
  function initBoard(){
    boardEl.innerHTML = ''; board = []; cellEls = [];
    const gap = SIZE<=8 ? 4 : (SIZE<=12 ? 3 : 2);
    const radius = SIZE<=8 ? 7 : (SIZE<=12 ? 5 : 3);
    boardEl.style.gridTemplateColumns = `repeat(${SIZE},1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${SIZE},1fr)`;
    boardEl.style.gap = gap+'px';
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.borderRadius = radius+'px';
        boardEl.appendChild(cell);
        cellEls.push(cell);
        board.push({filled:false, colorIdx:-1});
      }
    }
  }

  function updateModeBadge(){
    if(currentMode==='tetris'){
      modeBadgeEl.textContent = ({ vs:'⚔️ テトリス VS AI', sprint:'🏁 テトリス スプリント', ultra:'⏳ テトリス ウルトラ', solo:'🧱 テトリス ソロ' })[tetrisRunMode] || '🧱 テトリス';
      return;
    }
    if(currentMode==='timeattack'){ modeBadgeEl.textContent = '⏱ タイムアタック'; return; }
    const m = MODES[currentMode];
    if(m) modeBadgeEl.textContent = `${m.emoji} ${m.label} · ${SIZE}×${SIZE}`;
  }

  // ===================== タイムアタックモード =====================
  const TIME_ATTACK_DURATION = 60; // 秒
  let timeAttackTimeLeft = 0;
  let timeAttackInterval = null;

  function updateTimeAttackDisplay(){
    const m = Math.floor(Math.max(0,timeAttackTimeLeft)/60);
    const s = Math.max(0,timeAttackTimeLeft) % 60;
    timeAttackValEl.textContent = `${m}:${String(s).padStart(2,'0')}`;
    timeAttackCardEl.classList.toggle('urgent', timeAttackTimeLeft<=10);
  }

  function stopTimeAttackTimer(){
    if(timeAttackInterval){ clearInterval(timeAttackInterval); timeAttackInterval = null; }
    timeAttackCardEl.style.display = 'none';
  }

  function startTimeAttackTimer(){
    stopTimeAttackTimer();
    timeAttackTimeLeft = TIME_ATTACK_DURATION;
    timeAttackCardEl.style.display = 'flex';
    updateTimeAttackDisplay();
    timeAttackInterval = setInterval(()=>{
      timeAttackTimeLeft--;
      updateTimeAttackDisplay();
      if(timeAttackTimeLeft<=5 && timeAttackTimeLeft>0) playSound('timer');
      if(timeAttackTimeLeft<=0){
        stopTimeAttackTimer();
        endGame();
      }
    }, 1000);
  }

  function startTimeAttackMode(){
    if(currentMode==='tetris') exitTetrisMode();
    currentMode = 'timeattack';
    SIZE = 8;
    saveSettings();
    updateModeBadge();
    overlayEl.classList.remove('show');
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    initBoard();
    fillTray();
    startTimeAttackTimer();
  }

  // ===================== 🆕 週替わりチャレンジ(ランダムな難易度・盤面サイズ、週1回) =====================
  async function fetchWeeklyChallenge(){
    try{
      const headers = {};
      if(authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const r = await fetch(`${API_BASE_URL}/api/weekly-challenge`, { headers });
      return await r.json();
    }catch(err){ return null; }
  }

  async function openWeeklyChallengeModal(){
    modalContent.dataset.mode = 'weeklychallenge';
    modalContent.innerHTML = `<h2 style="color:var(--gold);">🎲 週替わりチャレンジ</h2><div class="empty-hint">読み込み中...</div>`;
    modalOverlay.classList.add('show');
    const data = await fetchWeeklyChallenge();
    if(!modalOverlay.classList.contains('show') || modalContent.dataset.mode!=='weeklychallenge') return;
    if(!data || !data.challenge){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎲 週替わりチャレンジ</h2><div class="empty-hint">現在準備中です。しばらくお待ちください。</div>`;
      return;
    }
    const c = data.challenge;
    const modeLabel = (MODES[c.mode] && MODES[c.mode].label) || c.mode;
    let html = `<h2 style="color:var(--gold);">🎲 週替わりチャレンジ</h2>
      <div class="sub" style="margin-bottom:8px;">今週のお題: <b style="color:var(--mint);">${modeLabel} ${c.size}×${c.size}</b></div>
      <div class="sub">1人1回だけ挑戦できます。1位には🪙${formatNumber(c.reward)}コイン！</div>
      <div class="sub" style="color:var(--coral); font-weight:800; margin:6px 0 12px;">リセットまで: ${formatHMS(c.secondsUntilReset)}</div>`;
    if(!authToken){
      html += `<div class="empty-hint">挑戦するにはログインが必要です。</div>`;
    } else if(data.hasPlayed){
      html += `<div class="quest-item"><div class="qtitle">✅ 挑戦済み！ あなたのスコア: ${data.myScore}</div></div>`;
    } else {
      html += `<button class="primary-btn" id="weeklyChallengeStartBtn">🎲 挑戦する</button>`;
    }
    html += `<h3 style="color:var(--mint); margin:14px 0 8px;">🏆 ランキング TOP10</h3>`;
    if(!data.ranking || data.ranking.length===0){
      html += `<div class="empty-hint">まだ挑戦者がいません。一番乗りを目指そう！</div>`;
    } else {
      data.ranking.forEach((r,i)=>{
        html += `<div class="friend-item"><span class="fname">${i+1}. ${whoHtml(r)}</span><span class="fsub">${r.score}点</span></div>`;
      });
    }
    modalContent.innerHTML = html;
    const startBtn = document.getElementById('weeklyChallengeStartBtn');
    if(startBtn) startBtn.addEventListener('click', ()=>{
      closeModal();
      startWeeklyChallenge(c);
    });
  }

  function startWeeklyChallenge(challenge){
    if(currentMode==='tetris') exitTetrisMode();
    if(currentMode==='timeattack') stopTimeAttackTimer();
    weeklyChallengeActive = true;
    weeklyChallengeInfo = challenge;
    currentMode = challenge.mode;
    SIZE = challenge.size;
    const modeLabel = (MODES[challenge.mode] && MODES[challenge.mode].label) || challenge.mode;
    modeBadgeEl.textContent = `🎲 週替わり: ${modeLabel} ${SIZE}×${SIZE}`;
    overlayEl.classList.remove('show');
    score = 0; streak = 0; noClearStreak = 0;
    scoreValEl.textContent = '0';
    initBoard();
    fillTray();
  }

  // ===================== 🎰 ガチャ(限定スキン、天井あり) =====================
  async function fetchGachaState(){
    if(!authToken) return null;
    try{
      const r = await fetch(`${API_BASE_URL}/api/gacha/state`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      if(!r.ok) return null;
      const d = await r.json();
      gachaStateCache = d;
      return d;
    }catch(err){ return null; }
  }
  let gachaStateCache = null;   // 前回のガチャ状態(開いた瞬間に表示するため)

  async function openGachaModal(){
    modalContent.dataset.mode = 'gacha';
    if(!authToken){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎰 ガチャ</h2><div class="empty-hint">ログインするとガチャに挑戦できます。</div>`;
      modalOverlay.classList.add('show');
      return;
    }
    modalOverlay.classList.add('show');
    const hadCache = !!gachaStateCache;
    if(hadCache) renderGachaModal(gachaStateCache);      // 前回の内容をすぐ表示し、最新は裏で取る
    else modalContent.innerHTML = `<h2 style="color:var(--gold);">🎰 ガチャ</h2><div class="empty-hint">読み込み中...</div>`;
    const before = hadCache ? JSON.stringify(gachaStateCache) : null;
    const state = await fetchGachaState();
    if(!modalOverlay.classList.contains('show') || modalContent.dataset.mode!=='gacha') return;
    if(!state && hadCache) return;
    if(!hadCache || JSON.stringify(state) !== before) renderGachaModal(state);
  }

  let gachaRateInfo = { ratePerSkin:0.0003, rateTotal:0.0024 };   // サーバーの排出率(表示用)。再描画でも保持する
  function renderGachaModal(state){
    if(state && state.rateTotal != null) gachaRateInfo = { ratePerSkin: state.ratePerSkin, rateTotal: state.rateTotal };
    if(!state){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎰 ガチャ</h2><div class="empty-hint">読み込みに失敗しました。</div>`;
      return;
    }
    const pityPct = Math.min(100, Math.round((state.pityCounter / state.pityThreshold) * 100));
    const tickets = state.freeTickets || 0;
    const canOne = state.coins >= state.cost || tickets > 0;
    const ticketsFor10 = Math.min(tickets, 10);
    const coinsFor10 = (10 - ticketsFor10) * state.cost;
    const canTen = state.coins >= coinsFor10;
    const gachaSkinCards = GACHA_SKINS.map(s=>`
      <div class="skin-swatches" style="margin-bottom:2px;">${buildPatternedColors(s.colors).slice(0,4).map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>
    `).join('');
    let html = `
      <h2 style="color:var(--gold);">🎰 ガチャ</h2>
      <div class="sub" style="margin-bottom:8px;">1回 🪙${formatNumber(state.cost)}。ガチャ限定スキンが手に入ります(被った場合は🪙${formatNumber(500)}に還元)。</div>
      <div class="sub" style="margin-bottom:8px;">📊 排出率: 1スキンあたり ${(gachaRateInfo.ratePerSkin*100).toFixed(2).replace(/\.?0+$/,'')}% ／ 合計 ${(gachaRateInfo.rateTotal*100).toFixed(2).replace(/\.?0+$/,'')}%</div>
      <div class="quest-item" style="text-align:center;">
        <div class="qtitle">🐉🔥👑 ガチャ限定スキン</div>
        ${gachaSkinCards}
        <div class="sub" style="margin-top:6px;">天井: ${state.pityThreshold}回以内に必ず1つ獲得できます</div>
        <div class="quest-bar-bg" style="margin-top:8px;"><div class="quest-bar-fill" style="width:${pityPct}%"></div></div>
        <div class="sub" style="margin-top:4px;">天井まで: ${state.pityCounter} / ${state.pityThreshold}回</div>
      </div>
      <div class="sub" style="margin:8px 0; text-align:center;">🪙 所持: ${formatNumber(state.coins)}${state.freeTickets>0 ? ` ／ 🎫 無料チケット: ${state.freeTickets}枚` : ''}</div>
      <div style="display:flex; gap:8px;">
        <button class="primary-btn" data-gachacount="1" style="flex:1;" ${canOne?'':'disabled'}>
          ${tickets>0 ? '🎫 チケットで1回' : `🎰 1回 (🪙${formatNumber(state.cost)})`}
        </button>
        <button class="primary-btn" data-gachacount="10" style="flex:1;" ${canTen?'':'disabled'}>
          🎰 10連 (🪙${formatNumber(coinsFor10)}${ticketsFor10>0?` ＋🎫×${ticketsFor10}`:''})
        </button>
      </div>
      <div id="gachaResultArea" style="margin-top:10px;"></div>
    `;
    modalContent.innerHTML = html;
    modalContent.querySelectorAll('[data-gachacount]').forEach(b=>{
      b.addEventListener('click', ()=>performGachaPull(parseInt(b.dataset.gachacount)));
    });
  }

  function gachaSkinName(id){ return (SKINS.find(s=>s.id===id) || {}).name || id; }

  function gachaSingleResultHtml(r){
    if(r.resultType === 'win'){
      const skin = GACHA_SKINS.find(s=>s.id===r.skinId);
      return `
        <div class="quest-item" style="text-align:center; border:2px solid var(--gold);">
          <div class="qtitle" style="font-size:16px;">${r.pityTriggered?'🎯 天井達成！':'🎉 大当たり！'}</div>
          <div class="skin-swatches" style="justify-content:center; margin:8px 0;">${buildPatternedColors(skin.colors).map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>
          <div style="font-weight:800;">${skin.name} を獲得しました！</div>
        </div>`;
    }
    if(r.resultType === 'duplicate'){
      return `<div class="quest-item" style="text-align:center;">
        <div class="qtitle">${gachaSkinName(r.skinId)} が被りました…</div>
        <div class="sub">代わりに 🪙${formatNumber(r.coinsGained)} を獲得しました。</div>
      </div>`;
    }
    return `<div class="quest-item" style="text-align:center;">
      <div class="qtitle">残念、ハズレ…</div>
      <div class="sub">🪙${formatNumber(r.coinsGained)} を獲得しました。</div>
    </div>`;
  }

  function gachaMultiResultHtml(results){
    const wins = results.filter(r=>r.resultType==='win');
    const dups = results.filter(r=>r.resultType==='duplicate');
    const misses = results.filter(r=>r.resultType==='miss');
    const refund = results.reduce((sum,r)=>sum+(r.coinsGained||0), 0);
    const rows = results.map((r,i)=>{
      let label, style = '';
      if(r.resultType==='win'){
        label = `${r.pityTriggered?'🎯':'🎉'} ${gachaSkinName(r.skinId)} 獲得！`;
        style = 'color:var(--gold); font-weight:800;';
      } else if(r.resultType==='duplicate'){
        label = `🔁 ${gachaSkinName(r.skinId)} 被り (+🪙${formatNumber(r.coinsGained)})`;
      } else {
        label = `ハズレ (+🪙${formatNumber(r.coinsGained)})`;
        style = 'opacity:.7;';
      }
      return `<div class="sub" style="${style} text-align:left; margin:2px 0;">${i+1}. ${label}</div>`;
    }).join('');
    return `<div class="quest-item" style="text-align:center; ${wins.length?'border:2px solid var(--gold);':''}">
      <div class="qtitle" style="font-size:16px;">${wins.length?'🎉 ':''}10連結果</div>
      <div class="sub" style="margin:4px 0 8px;">大当たり ${wins.length} ／ 被り ${dups.length} ／ ハズレ ${misses.length} ／ 還元 🪙${formatNumber(refund)}</div>
      ${rows}
    </div>`;
  }

  // ガチャ演出(gachafx.js)に渡す表示用データ
  const fxSwatches = (skin, n)=> skin ? buildPatternedColors(skin.colors, skin.pattern).slice(0, n || 7).map(c=>c.bg) : [];
  function gachaFxItem(r){
    const skin = r.skinId ? SKINS.find(x=>x.id === r.skinId) : null;
    return { type:r.resultType, name: skin ? skin.name : 'ハズレ', sw: fxSwatches(skin), pity: !!r.pityTriggered,
      extra: r.resultType === 'duplicate' ? `代わりに 🪙${formatNumber(r.coinsGained)} を獲得` : (r.resultType === 'miss' ? `🪙${formatNumber(r.coinsGained)} を獲得` : '') };
  }
  async function performGachaPull(count){
    count = (count === 10) ? 10 : 1;
    const resultArea = document.getElementById('gachaResultArea');
    const btns = modalContent.querySelectorAll('[data-gachacount]');
    btns.forEach(b=>b.disabled = true);
    resultArea.innerHTML = `<div class="empty-hint">🎰 抽選中...</div>`;
    // 🎁 購入した瞬間に宝箱が降りてくる(結果は通信が終わってから開ける)
    const fx = window.GachaFx ? window.GachaFx.begin({ kind:'normal', count, pool: GACHA_SKINS.map(x=>({ name:x.name, sw:fxSwatches(x, 4) })) }) : null;
    try{
      const res = await fetch(`${API_BASE_URL}/api/gacha/pull`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ count })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || '抽選に失敗しました');

      const results = (Array.isArray(data.results) && data.results.length) ? data.results : [data];
      ownedSkins = data.ownedSkins;
      saveSkinsData();
      const resultHtml = (count === 1) ? gachaSingleResultHtml(results[0]) : gachaMultiResultHtml(results);

      coins = data.coins;
      updateCoinUI();
      let again = false;
      if(fx){ again = (await fx.reveal(results.map(gachaFxItem))) === 'again'; }       // 宝箱 → ルーレット → 結果
      else if(results.some(r=>r.resultType==='win' || r.resultType==='duplicate')) playSound('coin');
      renderGachaModal({
        coins: data.coins, totalPulls: data.totalPulls, pityCounter: data.pityCounter,
        pityThreshold: data.pityThreshold, cost: GACHA_COST_CLIENT, freeTickets: data.freeTickets, ownedSkins: data.ownedSkins
      });
      // 結果表示だけは再描画後も残したいので差し込み直す
      document.getElementById('gachaResultArea').innerHTML = resultHtml;
      if(again) performGachaPull(count);
    }catch(err){
      if(fx) fx.abort();
      resultArea.innerHTML = `<div class="empty-hint">${err.message}</div>`;
      btns.forEach(b=>b.disabled = false);
    }
  }
  const GACHA_COST_CLIENT = 2000; // サーバー側のGACHA_COSTと合わせておくための表示用フォールバック

  // ===================== 🎫 バトルパス(経験値でレベルアップ、報酬はループ、レベル上限なし) =====================
  async function fetchBattlePassState(){
    if(!authToken) return null;
    try{
      const r = await fetch(`${API_BASE_URL}/api/battlepass/state`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      if(!r.ok) return null;
      const d = await r.json();
      bpStateCache = d;
      return d;
    }catch(err){ return null; }
  }
  let bpStateCache = null;   // 前回のバトルパス(開いた瞬間に表示するため)

  async function openBattlePassModal(){
    modalContent.dataset.mode = 'battlepass';
    if(!authToken){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎫 バトルパス</h2><div class="empty-hint">ログインするとバトルパスに参加できます。</div>`;
      modalOverlay.classList.add('show');
      return;
    }
    modalOverlay.classList.add('show');
    // 前回の内容があればすぐ表示して、最新は裏で取りに行く(待ち時間を感じさせない)
    const hadCache = !!bpStateCache;
    if(hadCache) renderBattlePassModal(bpStateCache);
    else modalContent.innerHTML = `<h2 style="color:var(--gold);">🎫 バトルパス</h2><div class="empty-hint">読み込み中...</div>`;
    const before = hadCache ? JSON.stringify(bpStateCache) : null;
    const state = await fetchBattlePassState();
    if(!modalOverlay.classList.contains('show') || modalContent.dataset.mode!=='battlepass') return;
    if(!state && hadCache) return;                       // 取れなかったときは前回の表示のまま
    if(!hadCache || JSON.stringify(state) !== before) renderBattlePassModal(state);
  }

  function battlePassRewardLabel(reward){
    if(reward.type==='coins') return `🪙 ${formatNumber(reward.amount)}コイン`;
    if(reward.type==='gacha_ticket') return `🎫 ガチャ無料チケット×${reward.amount}`;
    return '???';
  }

  function renderBattlePassModal(state, noticeHtml){
    if(!state){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎫 バトルパス</h2><div class="empty-hint">読み込みに失敗しました。</div>`;
      return;
    }
    const pct = Math.round((state.xpIntoLevel / state.xpPerLevel) * 100);
    // 未受取の件数・合計はサーバーの集計値を使う(レベルが巨大でも重くならない)。古いサーバー応答なら一覧から計算
    const hasSummary = typeof state.pendingCount === 'number';
    const unclaimedList = hasSummary ? null : state.rewards.filter(r=>!r.claimed);
    const pendingCount = hasSummary ? state.pendingCount : unclaimedList.length;
    const totCoins = hasSummary ? state.pendingCoins : unclaimedList.filter(r=>r.type==='coins').reduce((sum,r)=>sum+r.amount, 0);
    const totTickets = hasSummary ? state.pendingTickets : unclaimedList.filter(r=>r.type==='gacha_ticket').reduce((sum,r)=>sum+r.amount, 0);
    const shownFrom = state.rewards.length ? state.rewards[0].level : 1;
    let html = `
      <h2 style="color:var(--gold);">🎫 バトルパス</h2>
      <div class="sub" style="margin-bottom:8px;">ゲームをプレイして経験値を貯めよう。レベル上限はなく、報酬は10レベルごとにループします。</div>
      <div class="quest-item" style="text-align:center;">
        <div class="qtitle" style="font-size:20px;">Lv. ${formatNumber(state.level)}</div>
        <div class="quest-bar-bg" style="margin-top:8px;"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="sub" style="margin-top:4px;">${formatNumber(state.xpIntoLevel)} / ${formatNumber(state.xpPerLevel)} XP</div>
      </div>
      ${noticeHtml || ''}
      <button class="primary-btn" id="bpClaimAllBtn" style="margin-top:10px;" ${pendingCount?'':'disabled'}>
        ${pendingCount
          ? `🎁 まとめて受け取る (${formatNumber(pendingCount)}件: 🪙${formatNumber(totCoins)}${totTickets?` ＋🎫×${formatNumber(totTickets)}`:''})`
          : '🎁 受け取れる報酬はありません'}
      </button>
      <h3 style="color:var(--mint); margin:14px 0 8px;">🎁 報酬一覧</h3>
      ${shownFrom > 1 ? `<div class="sub" style="margin-bottom:8px;">最新の${state.rewards.length}レベルぶんを表示しています。それより前の未受取も「まとめて受け取る」でまとめて受け取れます。</div>` : ''}
    `;
    // 一覧は最新レベルから順に(サーバーは最大30件しか返さない)
    state.rewards.slice().reverse().forEach(r=>{
      html += `
        <div class="quest-item">
          <div class="quest-foot">
            <span>Lv.${formatNumber(r.level)} — ${battlePassRewardLabel(r)}</span>
            <button class="claim-btn" data-bplevel="${r.level}" ${r.claimed?'disabled':''}>${r.claimed?'受取済み':'受け取る'}</button>
          </div>
        </div>`;
    });
    modalContent.innerHTML = html;
    modalContent.querySelectorAll('[data-bplevel]').forEach(btn=>{
      btn.addEventListener('click', ()=>claimBattlePassLevel(parseInt(btn.dataset.bplevel)));
    });
    const claimAllBtn = document.getElementById('bpClaimAllBtn');
    if(claimAllBtn) claimAllBtn.addEventListener('click', claimAllBattlePass);
  }

  async function claimAllBattlePass(){
    const btn = document.getElementById('bpClaimAllBtn');
    if(btn) btn.disabled = true;
    try{
      const res = await fetch(`${API_BASE_URL}/api/battlepass/claim-all`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` }
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error);
      coins = data.coins;
      updateCoinUI();
      playSound('coin');
      const state = await fetchBattlePassState();
      const notice = `<div class="quest-item" style="text-align:center; border:2px solid var(--gold); margin-top:10px;">
        <div class="qtitle">🎁 ${formatNumber(data.claimedCount)}件まとめて受け取りました！</div>
        <div class="sub">🪙${formatNumber(data.totalCoins)}${data.totalTickets?` ／ 🎫 ガチャ無料チケット×${formatNumber(data.totalTickets)}`:''}</div>
      </div>`;
      renderBattlePassModal(state, notice);
    }catch(err){
      alert(err.message);
      if(btn) btn.disabled = false;
    }
  }

  async function claimBattlePassLevel(level){
    try{
      const res = await fetch(`${API_BASE_URL}/api/battlepass/claim`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ level })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error);
      coins = data.coins;
      updateCoinUI();
      playSound('coin');
      const state = await fetchBattlePassState();
      renderBattlePassModal(state);
    }catch(err){
      alert(err.message);
    }
  }

  // ゲームプレイに応じてバトルパスの経験値を加算する(スコア10点=1XP換算、サーバー側でも上限チェックあり)
  function grantBattlePassXp(scoreGained){
    if(!authToken || scoreGained<=0) return;
    const xp = Math.floor(scoreGained / 10);
    if(xp<=0) return;
    fetch(`${API_BASE_URL}/api/battlepass/addxp`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
      body: JSON.stringify({ amount: xp })
    }).catch(()=>{});
  }

  function applyMode(mode, size){
    if(mode==='tetris'){
      enterTetrisMode();
      return;
    }
    if(mode==='timeattack'){
      startTimeAttackMode();
      return;
    }
    if(currentMode==='tetris') exitTetrisMode();
    if(currentMode==='timeattack') stopTimeAttackTimer();
    currentMode = MODES[mode] ? mode : 'baked';
    SIZE = (currentMode==='extreme') ? 8 : Math.min(18, Math.max(5, size||8));
    saveSettings();
    updateModeBadge();
    overlayEl.classList.remove('show');
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    initBoard();
    fillTray();
  }

  function randomShapeColor(shape){
    return { shape, colorIdx: Math.floor(Math.random()*COLORS.length), used:false };
  }

  function boardFullnessRatio(){
    let filled = 0;
    for(let i=0;i<board.length;i++) if(board[i].filled) filled++;
    return filled / board.length;
  }

  function countValidPlacements(shape, pool){
    const shapes = pool || SHAPES;
    let count = 0;
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        if(canPlaceAt(shape, r, c)) count++;
      }
    }
    return count;
  }

  function pickAdaptiveShape(aggressive, pool){
    const shapes = pool || SHAPES;
    const fullness = boardFullnessRatio();
    const threshold = aggressive ? 0.12 : 0.4;
    const maxBias = aggressive ? 6.0 : 3.2;
    const biasPower = fullness < threshold ? (aggressive ? 1.4 : 0) : ((fullness - threshold) / (1 - threshold)) * maxBias;
    if(biasPower <= 0) return shapes[Math.floor(Math.random()*shapes.length)];
    let totalWeight = 0;
    const weights = shapes.map(shape=>{
      const validCount = countValidPlacements(shape, shapes);
      const sizeBonus = 1 / shape.length;
      const weight = Math.pow(validCount + 0.05, biasPower) * (1 + sizeBonus);
      totalWeight += weight;
      return weight;
    });
    let r = Math.random() * totalWeight;
    for(let i=0;i<shapes.length;i++){
      r -= weights[i];
      if(r <= 0) return shapes[i];
    }
    return shapes[shapes.length-1];
  }

  function pickWeightedBigShape(pool){
    const shapes = pool || SHAPES;
    let totalWeight = 0;
    const weights = shapes.map(shape=>{
      const w = Math.pow(shape.length, 2.2);
      totalWeight += w;
      return w;
    });
    let r = Math.random() * totalWeight;
    for(let i=0;i<shapes.length;i++){
      r -= weights[i];
      if(r <= 0) return shapes[i];
    }
    return shapes[shapes.length-1];
  }

  function pickShapeForMode(pool){
    const shapes = pool || SHAPES;
    if(currentMode==='soft') return pickAdaptiveShape(true, shapes);
    if(currentMode==='hard') return shapes[Math.floor(Math.random()*shapes.length)];
    if(currentMode==='extreme') return pickWeightedBigShape(shapes);
    return pickAdaptiveShape(false, shapes);
  }

function ensurePlayable(){
    // 全モードで「置けなくなったらゲームオーバー」に統一
    return;
}

  function fillTray(){
    let availableShapes = SHAPES;
    if (currentUserId === ADMIN_USER_ID && adminDisabledBlocks.length > 0) {
      availableShapes = SHAPES.filter((_, idx) => !adminDisabledBlocks.includes(idx));
      if (availableShapes.length === 0) availableShapes = SHAPES;
    }
    tray = [
      randomShapeColor(pickShapeForMode(availableShapes)),
      randomShapeColor(pickShapeForMode(availableShapes)),
      randomShapeColor(pickShapeForMode(availableShapes))
    ];
    ensurePlayable();
    renderTray();
    setTimeout(checkGameOver, 50);
  }

  function shapeBounds(shape){
    let maxR=0, maxC=0;
    shape.forEach(([r,c])=>{ maxR=Math.max(maxR,r); maxC=Math.max(maxC,c); });
    return {rows:maxR+1, cols:maxC+1};
  }

  function renderTray(){
    trayEl.innerHTML = '';
    tray.forEach((piece, idx)=>{
      const slot = document.createElement('div');
      slot.className = 'tray-slot';
      slot.dataset.idx = idx;
      if(!piece.used){
        const {rows, cols} = shapeBounds(piece.shape);
        const cellPx = Math.max(14, Math.min(24, Math.floor(68/Math.max(rows,cols))));
        const grid = document.createElement('div');
        grid.className = 'piece-grid';
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
        grid.style.gridTemplateRows = `repeat(${rows}, ${cellPx}px)`;
        for(let r=0;r<rows;r++){
          for(let c=0;c<cols;c++){
            const filled = piece.shape.some(([sr,sc])=>sr===r&&sc===c);
            const cd = document.createElement('div');
            cd.className = 'piece-cell' + (filled?'':' empty');
            if(filled) cd.style.background = COLORS[piece.colorIdx].bg;
            grid.appendChild(cd);
          }
        }
        slot.appendChild(grid);
        slot.addEventListener('pointerdown', (e)=>startDrag(e, idx));
      }
      trayEl.appendChild(slot);
    });
  }

  function canPlaceAt(shape, baseR, baseC){
    for(const [dr,dc] of shape){
      const r = baseR+dr, c = baseC+dc;
      if(r<0||r>=SIZE||c<0||c>=SIZE) return false;
      if(board[boardIndex(r,c)].filled) return false;
    }
    return true;
  }
  function anyValidPlacement(shape){
    if(!Array.isArray(shape) || shape.length===0) return false; // 空/不正な形状は「置ける場所なし」として扱う(以前はtrueになりゲームオーバーを妨げていた)
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(canPlaceAt(shape,r,c)) return true;
    return false;
  }
  function checkGameOver(){
    try{
      if (currentUserId === ADMIN_USER_ID && adminSafetyMode) {
        if (tray.every(p => p.used)) fillTray();
        return;
      }
      const remaining = tray.filter(p=>!p.used);
      const stillPossible = remaining.some(p=>anyValidPlacement(p.shape));
      if(!stillPossible && remaining.length>0) endGame();
    }catch(err){
      // ここで例外が起きて握りつぶされると「盤面が埋まっているのにゲームオーバーにならない」
      // という不具合になるため、必ずログを残しつつ、安全側(ゲームオーバー扱い)に倒す
      console.error('checkGameOverでエラーが発生しました:', err);
      const remaining = (tray||[]).filter(p=>p && !p.used);
      if(remaining.length>0) endGame();
    }
  }

  // ===================== ドラッグ操作 =====================
  function startDrag(e, trayIdx){
    e.preventDefault();
    unlockAudio();
    const piece = tray[trayIdx];
    if(!piece || piece.used) return;
    const boardRect = boardEl.getBoundingClientRect();
    const cellSize = (boardRect.width - 16) / SIZE;
    const {rows, cols} = shapeBounds(piece.shape);
    dragState = { trayIdx, piece, cellSize, boardRect, grabDX: cellSize*0.5, grabDY: cellSize*0.5 + 46, lastValid:false, lastR:-1, lastC:-1 };
    const slot = trayEl.querySelector(`.tray-slot[data-idx="${trayIdx}"]`);
    if(slot) slot.classList.add('dragging-source');
    ghostEl.innerHTML = '';
    ghostEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    ghostEl.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const filled = piece.shape.some(([sr,sc])=>sr===r&&sc===c);
        const gd = document.createElement('div');
        gd.className = 'ghost-cell' + (filled?'':' empty');
        if(filled) gd.style.background = COLORS[piece.colorIdx].bg;
        ghostEl.appendChild(gd);
      }
    }
    ghostEl.style.display = 'grid';
    updateGhostPosition(e.clientX, e.clientY);
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  }

  function updateGhostPosition(x,y){
    ghostEl.style.left = (x - dragState.grabDX) + 'px';
    ghostEl.style.top = (y - dragState.grabDY) + 'px';
  }

  function onDragMove(e){
    if(!dragState) return;
    updateGhostPosition(e.clientX, e.clientY);
    const rect = dragState.boardRect, cs = dragState.cellSize;
    const relX = (e.clientX - dragState.grabDX) - (rect.left+8);
    const relY = (e.clientY - dragState.grabDY) - (rect.top+8);
    const baseC = Math.round(relX / cs), baseR = Math.round(relY / cs);
    const valid = canPlaceAt(dragState.piece.shape, baseR, baseC);
    clearPreview();
    dragState.piece.shape.forEach(([dr,dc])=>{
      const r=baseR+dr, c=baseC+dc;
      if(r>=0&&r<SIZE&&c>=0&&c<SIZE) cellEls[boardIndex(r,c)].classList.add(valid?'preview-ok':'preview-bad');
    });
    dragState.lastValid = valid; dragState.lastR = baseR; dragState.lastC = baseC;
  }
  function clearPreview(){ cellEls.forEach(cell=>cell.classList.remove('preview-ok','preview-bad')); }

  function onDragEnd(e){
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    if(!dragState) return;
    const {piece, trayIdx, lastValid, lastR, lastC} = dragState;
    clearPreview();
    ghostEl.style.display = 'none';
    const slot = trayEl.querySelector(`.tray-slot[data-idx="${trayIdx}"]`);
    if(slot) slot.classList.remove('dragging-source');
    if(lastValid) commitPlacement(piece, lastR, lastC, trayIdx);
    dragState = null;
  }

  function commitPlacement(piece, baseR, baseC, trayIdx){
    piece.shape.forEach(([dr,dc])=>{
      const r=baseR+dr, c=baseC+dc, idx = boardIndex(r,c);
      board[idx] = {filled:true, colorIdx:piece.colorIdx};
      const cellEl = cellEls[idx];
      cellEl.className = 'cell filled just-placed';
      cellEl.style.background = COLORS[piece.colorIdx].bg;
    });
    playSound('place');
    addScore(piece.shape.length * 10);
    dailyStats.piecesPlaced += 1;
    if(piece.shape.length >= 5) dailyStats.bigPiecesPlaced = (dailyStats.bigPiecesPlaced||0) + 1;
    tray[trayIdx].used = true;
    renderTray();
    setTimeout(()=>{ resolveLines(); }, 80);
  }

  function resolveLines(){
    const fullRows = [], fullCols = [];
    for(let r=0;r<SIZE;r++){ let full=true; for(let c=0;c<SIZE;c++) if(!board[boardIndex(r,c)].filled){ full=false; break; } if(full) fullRows.push(r); }
    for(let c=0;c<SIZE;c++){ let full=true; for(let r=0;r<SIZE;r++) if(!board[boardIndex(r,c)].filled){ full=false; break; } if(full) fullCols.push(c); }
    const linesCleared = fullRows.length + fullCols.length;
    if(linesCleared>0){
      streak++;
      noClearStreak = 0;
      dailyStats.linesCleared += linesCleared;
      dailyStats.maxComboStreak = Math.max(dailyStats.maxComboStreak||0, streak);
      if(linesCleared>=2) dailyStats.combos += 1;
      if(linesCleared>=3) dailyStats.tripleClearCount = (dailyStats.tripleClearCount||0) + 1;
      const cellsToClear = new Set();
      fullRows.forEach(r=>{ for(let c=0;c<SIZE;c++) cellsToClear.add(boardIndex(r,c)); });
      fullCols.forEach(c=>{ for(let r=0;r<SIZE;r++) cellsToClear.add(boardIndex(r,c)); });
      cellsToClear.forEach(idx=>{ cellEls[idx].classList.add('clearing'); spawnConfetti(cellEls[idx], linesCleared); });
      playSound('clear', linesCleared);
      // ===== コンボ倍率(連続でライン消去するほどスコア倍率が上がる。効果はスコア倍率のみ) =====
      const lineScore = linesCleared*100*linesCleared;
      const comboMultiplier = Math.min(4, 1 + (streak-1)*0.25);
      const totalLineScore = Math.round(lineScore * comboMultiplier);
      addScore(totalLineScore);
      showCombo(linesCleared, streak, comboMultiplier);
      updateQuestProgress();

      // 派手な演出: 大きめコンボでは画面シェイク＋衝撃波リング
      if(linesCleared>=2 || streak>=3){
        boardWrapEl.classList.remove('shake'); void boardWrapEl.offsetWidth; boardWrapEl.classList.add('shake');
        spawnShockRing();
      }

      const totalFilled = board.reduce((sum, cell) => sum + (cell.filled ? 1 : 0), 0);
      if (totalFilled === 0 && linesCleared > 0) {
        const bonus = linesCleared * 800 + 1500 + streak * 200;
        addScore(bonus);
        showComboText(`✨ 全消しボーナス +${bonus}点!`);
        spawnAllClearCelebration();
      }

      setTimeout(()=>{
        cellsToClear.forEach(idx=>{ board[idx] = {filled:false, colorIdx:-1}; cellEls[idx].className='cell'; cellEls[idx].style.background=''; });
        if(tray.every(p=>p.used)) fillTray(); else checkGameOver();
      }, 360);
    } else {
      streak = 0;
      noClearStreak++;
      dailyStats.maxNoClearStreak = Math.max(dailyStats.maxNoClearStreak||0, noClearStreak);
      if(tray.every(p=>p.used)) fillTray(); else checkGameOver();
    }
  }

  function showCombo(linesCleared, streakVal, multiplier){
    if(linesCleared<2 && streakVal<2) return;
    let msg = '';
    if(linesCleared>=2) msg = `COMBO x${linesCleared}!`;
    if(streakVal>=2) msg += (msg?'  ':'') + `🔥x${streakVal}`;
    if(multiplier && multiplier>1) msg += (msg?'  ':'') + `倍率×${multiplier.toFixed(2)}`;
    comboTextEl.textContent = msg;
    // 大きいコンボほど文字を派手に大きく・強調
    const bigness = Math.min(1.6, 1 + (Math.max(linesCleared,streakVal)-1)*0.12);
    comboTextEl.style.setProperty('--combo-scale', bigness);
    comboTextEl.className = 'combo-text show' + (Math.max(linesCleared,streakVal)>=4 ? ' mega' : '');
    setTimeout(() => { comboTextEl.className = 'combo-text'; }, 900);
  }

  function showComboText(msg){
    comboTextEl.textContent = msg;
    comboTextEl.className = 'combo-text bonus show mega';
    setTimeout(() => { comboTextEl.className = 'combo-text'; }, 900);
  }

  function spawnConfetti(cellEl, intensity){
    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
    const count = 5 + Math.min(10, (intensity||1)*3);
    for(let i=0;i<count;i++){
      const p = document.createElement('div');
      p.className='confetti';
      p.style.background = COLORS[Math.floor(Math.random()*COLORS.length)].bg;
      p.style.left=cx+'px'; p.style.top=cy+'px';
      const size = 6 + Math.random()*6;
      p.style.width = size+'px'; p.style.height = size+'px';
      const angle=Math.random()*Math.PI*2, dist=40+Math.random()*(70+((intensity||1)*8));
      p.style.setProperty('--dx', Math.cos(angle)*dist+'px');
      p.style.setProperty('--dy', Math.sin(angle)*dist+'px');
      p.style.setProperty('--rot', (Math.random()*720-360)+'deg');
      p.style.animation=`confettiBurst ${0.5+Math.random()*0.3}s ease-out forwards`;
      document.body.appendChild(p);
      setTimeout(()=>p.remove(),900);
    }
  }

  function spawnShockRing(){
    if(!boardWrapEl) return;
    const ring = document.createElement('div');
    ring.className = 'shock-ring';
    boardWrapEl.appendChild(ring);
    setTimeout(()=>ring.remove(), 650);
  }

  // ===================== 全消し演出（画面フラッシュ＋大量紙吹雪＋星） =====================
  function spawnAllClearCelebration(){
    playSound('clear');
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    setTimeout(()=>flash.remove(), 600);

    const rect = boardWrapEl ? boardWrapEl.getBoundingClientRect() : {left:innerWidth/2, top:innerHeight/2, width:0, height:0};
    const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
    const stars = ['✨','⭐','🍬','🎉','💫'];
    for(let i=0;i<28;i++){
      const s = document.createElement('div');
      s.className = 'star-particle';
      s.textContent = stars[Math.floor(Math.random()*stars.length)];
      const angle = Math.random()*Math.PI*2, dist = 60+Math.random()*220;
      s.style.setProperty('--sx0', '0px'); s.style.setProperty('--sy0','0px');
      s.style.setProperty('--sx1', Math.cos(angle)*dist+'px');
      s.style.setProperty('--sy1', Math.sin(angle)*dist+'px');
      s.style.left = cx+'px'; s.style.top = cy+'px';
      s.style.animationDelay = (Math.random()*0.15)+'s';
      document.body.appendChild(s);
      setTimeout(()=>s.remove(), 1000);
    }
    for(let i=0;i<3;i++){
      setTimeout(()=>spawnShockRing(), i*120);
    }
    if(boardWrapEl){
      boardWrapEl.classList.remove('shake'); void boardWrapEl.offsetWidth; boardWrapEl.classList.add('shake');
    }
  }

  function floatCoin(amount){
    const rect = boardEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className='coin-float';
    el.textContent = `+${amount}🪙`;
    el.style.left = (rect.left+rect.width/2-20)+'px';
    el.style.top = (rect.top+rect.height/2)+'px';
    el.style.animation='coinFloat 0.9s ease-out forwards';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),950);
  }

  // ===================== スコア周り（リアルタイム同期対応） =====================
  let lastSyncTime = 0;
  let weeklyChallengeActive = false;
  let weeklyChallengeInfo = null;

  function syncBestScore() {
    if (!authToken || weeklyChallengeActive) return; // 週替わりチャレンジは通常のベストスコアを汚さない
    // 現在のモードのベストを更新
    const currentBest = bestScores[currentMode] || 0;
    if (score > currentBest) {
      bestScores[currentMode] = score;
      if (isRegularMode(currentMode)) {
        // 全体ベストも更新（表示用）
        best = Math.max(best, score);
        bestValEl.textContent = best;
      } else {
        animateNumberTo(bestValEl, score);
      }
      saveBestScores();
      // サーバーへ送信（スロットリング: 2秒に1回まで）
      const now = Date.now();
      if (now - lastSyncTime > 2000) {
        lastSyncTime = now;
        syncToServer();
      }
    }
  }

  let sessionScoreForXp = 0;
  function addScore(amount){
    score += amount;
    sessionScoreForXp += amount;
    dailyStats.scoreEarned += amount;
    dailyStats.bestSingleGameScore = Math.max(dailyStats.bestSingleGameScore||0, score);
    updateScoreUI();
    // リアルタイムでベストスコアを同期（必要に応じて）
    syncBestScore();
  }

  function isRegularMode(m){ return m==='soft' || m==='baked' || m==='hard' || m==='extreme'; }

  function updateScoreUI(){
    const curScore = parseInt(scoreValEl.textContent,10) || 0;
    if(score < curScore){ scoreValEl.textContent = score; } else { animateNumberTo(scoreValEl, score); }
    if(weeklyChallengeActive) return; // 週替わりチャレンジ中は通常のベスト表示を更新しない
    const curBest = parseInt(bestValEl.textContent,10) || 0;
    if(isRegularMode(currentMode)){
      const maxBest = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
      if (maxBest > best) {
        best = maxBest;
        saveBestScores();
      }
      if(best < curBest){ bestValEl.textContent = best; } else { animateNumberTo(bestValEl, best); }
    } else {
      const modeBest = bestScores[currentMode] || 0;
      if(modeBest < curBest){ bestValEl.textContent = modeBest; } else { animateNumberTo(bestValEl, modeBest); }
    }
  }
  // コインなどの大きな数値を K/M/B/T 表記で見やすく表示する(内部の値自体は正確な数値のまま保持)
  // 大きな数を短く表示(K, M, B, T, Q… と続け、1e36以上は指数表記)。
  // ※JavaScriptのNumberは約9×10^15(9,007,199,254,740,991)を超えると下の桁が不正確になる
  const NUMBER_UNITS = [
    {v:1e33,s:'Dc'},{v:1e30,s:'No'},{v:1e27,s:'Oc'},{v:1e24,s:'Sp'},{v:1e21,s:'Sx'},{v:1e18,s:'Qi'},
    {v:1e15,s:'Q'},{v:1e12,s:'T'},{v:1e9,s:'B'},{v:1e6,s:'M'},{v:1e3,s:'K'}
  ];
  function formatNumber(n){
    if(window.NXBig){ const cx = window.NXBig.compact(n); if(cx) return cx; }     // v4.3: 15桁を超える数は、正確な桁から短く表記
    n = Number(n) || 0;
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if(!isFinite(abs)) return sign + '∞';
    if(abs >= 1e36) return sign + abs.toExponential(2).replace('+','');
    for(const u of NUMBER_UNITS){
      if(abs >= u.v){
        const val = abs / u.v;
        const formatted = val >= 100 ? Math.floor(val) : (Math.round(val*10)/10);
        return sign + formatted + u.s;
      }
    }
    return sign + Math.floor(abs);
  }
  let coinShown = null, coinRaf = 0;
  function updateCoinUI(){
    saveCoins(coins);
    const target = Number(coins) || 0;
    if(coinShown === null || Math.abs(target - coinShown) < 1 || document.body.classList.contains('reduce-motion')){
      coinShown = target; coinValEl.textContent = formatNumber(target); return;
    }
    cancelAnimationFrame(coinRaf);
    const from = coinShown, t0 = performance.now(), dur = 520;
    const step = (t)=>{
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      coinShown = from + (target - from) * e;
      coinValEl.textContent = formatNumber(Math.round(coinShown));
      if(k < 1) coinRaf = requestAnimationFrame(step); else coinShown = target;
    };
    coinRaf = requestAnimationFrame(step);
  }

  function awardGameEndCoins(){
    const earned = Math.floor((score/500) * coinMultiplier());
    if(earned>0){ coins += earned; updateCoinUI(); floatCoin(earned); }
    return earned;
  }

  // ===================== ベストスコア永続化 =====================
  async function loadBestScores(){
    try{
      const res = await appStorage.get(STORAGE_BEST_SCORES, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        if(parsed.soft !== undefined) bestScores = parsed;
      }
    }catch(err){}
    // 全体ベストは最大値
    best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
    bestValEl.textContent = best;
    tetrisBest = bestScores.tetris || 0;
  }
  async function saveBestScores(){
    try{ await appStorage.set(STORAGE_BEST_SCORES, JSON.stringify(bestScores), false); }catch(err){}
    // 全体ベストも保存（互換性のため）
    const overall = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
    await saveBest(overall);
  }
  async function loadBest(){
    try{ const res = await appStorage.get(STORAGE_BEST, false); if(res && res.value) best = parseInt(res.value,10)||0; }catch(err){ best=0; }
    bestValEl.textContent = best;
  }
  async function saveBest(val){ try{ await appStorage.set(STORAGE_BEST, String(val), false); }catch(err){} }
  async function loadCoins(){
    try{ const res = await appStorage.get(STORAGE_COINS, false); if(res && res.value) coins = parseInt(res.value,10)||0; }catch(err){ coins=0; }
    coinValEl.textContent = formatNumber(coins);
  }
  async function saveCoins(val){ try{ await appStorage.set(STORAGE_COINS, String(val), false); }catch(err){} }

  // ===================== クエスト =====================
  // desc を「目標値 n を受け取って説明文を返す関数」にすることで、
  // スケーリング後の実際の目標値が説明文に自動で反映される。
  const QUEST_POOL = [
    { id:'singleScore400', desc:(n)=>`1回のプレイでスコア${n}点以上を叩き出す`, statKey:'bestSingleGameScore', target:4000, reward:50 },
    { id:'tripleClear', desc:(n)=>`3ライン以上同時に消す(トリプルクリア)を${n}回成功させる`, statKey:'tripleClearCount', target:1, reward:70 },
    { id:'comboStreak4', desc:(n)=>`1回のプレイでコンボストリークを${n}連続つなげる`, statKey:'maxComboStreak', target:4, reward:65 },
    { id:'lines25', desc:(n)=>`ラインを合計${n}本消す`, statKey:'linesCleared', target:25, reward:55 },
    { id:'hardMode1', desc:(n)=>`「硬い」以上の難易度でゲームを${n}回プレイし切る`, statKey:'hardModeGamesPlayed', target:1, reward:45 },
    { id:'pieces60', desc:(n)=>`ピースを合計${n}個配置する`, statKey:'piecesPlaced', target:60, reward:40 },
    { id:'score600total', desc:(n)=>`合計スコアを${n}点稼ぐ`, statKey:'scoreEarned', target:6000, reward:50 },
    { id:'noClearStreak10', desc:(n)=>`ラインを消さずにピースを${n}個連続で置く我慢比べ`, statKey:'maxNoClearStreak', target:10, reward:60 },
    { id:'bigPiece5', desc:(n)=>`5マス以上の大きいブロックを${n}個配置する`, statKey:'bigPiecesPlaced', target:5, reward:55 },
    { id:'play3', desc:(n)=>`ゲームを${n}回プレイする`, statKey:'gamesPlayed', target:3, reward:30 }
  ];

  function pickDailyQuests(){
    const pool = [...QUEST_POOL];
    const picked = [];
    for(let i=0;i<3 && pool.length>0;i++){
      const idx = Math.floor(Math.random()*pool.length);
      const q = pool.splice(idx,1)[0];
      picked.push({ ...q, progress:0, claimed:false });
    }
    return picked;
  }

  // ===================== 無限クエスト(エンドレス) =====================
  // クリアするたびにすぐ次のクエストが補充され、達成数が増えるほど目標値と報酬がじわじわ大きくなる
  function scaledTarget(base){
    return Math.max(1, Math.round(base * (1 + questsCompletedCount * 0.12)));
  }
  function scaledReward(base){
    return Math.round(base * (1 + questsCompletedCount * 0.15));
  }

function issueNewQuest(excludePoolIds){
    const pool = QUEST_POOL.filter(q=>!excludePoolIds.includes(q.id));
    const poolItem = (pool.length ? pool : QUEST_POOL)[Math.floor(Math.random()*(pool.length ? pool.length : QUEST_POOL.length))];
    const targetVal = scaledTarget(poolItem.target);
    return {
      poolId: poolItem.id,
      // 説明文を「実際の目標値 targetVal」で生成する（表示と目標のズレをなくす）
      desc: (typeof poolItem.desc === 'function') ? poolItem.desc(targetVal) : poolItem.desc,
      statKey: poolItem.statKey,
      baseline: dailyStats[poolItem.statKey] || 0,
      target: targetVal,
      reward: scaledReward(poolItem.reward),
      claimed: false
    };
  }

  function ensureActiveQuests(){
    while(activeQuests.length < 3){
      const excludeIds = activeQuests.map(q=>q.poolId);
      activeQuests.push(issueNewQuest(excludeIds));
    }
  }
  function questProgressOf(q){
    return Math.max(0, (dailyStats[q.statKey] || 0) - q.baseline);
  }

  async function loadDailyQuests(){
    try{
      const res = await appStorage.get(STORAGE_QUESTS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        dailyStats = { ...DAILY_STATS_DEFAULT, ...parsed.stats };
        questsCompletedCount = parsed.completedCount || 0;
        activeQuests = Array.isArray(parsed.active) ? parsed.active : [];
      }
    }catch(err){}
    // 保存済みのクエストの説明文を、実際の目標値で再生成する
    // (古いバージョンで保存された「3回プレイする」等の表示と実際の target がズレているのを直す)
    activeQuests = activeQuests.map(q => {
      const poolItem = QUEST_POOL.find(p => p.id === q.poolId);
      if (poolItem && typeof poolItem.desc === 'function') {
        return { ...q, desc: poolItem.desc(q.target) };
      }
      return q;
    });
    ensureActiveQuests();
    await saveDailyQuests();
  }

  async function saveDailyQuests(){
    try{ await appStorage.set(STORAGE_QUESTS, JSON.stringify({stats:dailyStats, active:activeQuests, completedCount:questsCompletedCount}), false); }catch(err){}
  }

  function updateQuestProgress(){
    saveDailyQuests();
    if(modalOverlay.classList.contains('show') && modalContent.dataset.mode==='quests') renderQuestModal();
  }

  function claimQuest(poolId){
    const idx = activeQuests.findIndex(q=>q.poolId===poolId);
    if(idx===-1) return;
    const q = activeQuests[idx];
    if(q.claimed || questProgressOf(q) < q.target) return;
    coins += q.reward;
    updateCoinUI();
    questsCompletedCount += 1;
    activeQuests.splice(idx,1);
    ensureActiveQuests();
    saveDailyQuests();
    renderQuestModal();
    syncToServer();
  }

  function renderQuestModal(){
    modalContent.dataset.mode = 'quests';
    let html = `<h2 style="color:var(--mint);">📋 エンドレスクエスト</h2>
      <div class="sub">達成するとすぐ次のクエストが補充される、無限に挑戦し続けられるクエストです。通算<b style="color:var(--gold);">${questsCompletedCount}</b>個クリア中！</div>`;
    activeQuests.forEach(q=>{
      const progress = questProgressOf(q);
      const pct = Math.min(100, Math.floor((progress/q.target)*100));
      const done = progress >= q.target;
      html += `
        <div class="quest-item">
          <div class="qtitle">${q.desc}</div>
          <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
          <div class="quest-foot">
            <span>${Math.min(progress,q.target)} / ${q.target}</span>
            <button class="claim-btn" data-qid="${q.poolId}" ${(!done||q.claimed)?'disabled':''}>
              ${q.claimed ? '受取済み' : `🪙${q.reward} 受け取る`}
            </button>
          </div>
        </div>`;
    });
    modalContent.innerHTML = html;
    modalContent.querySelectorAll('.claim-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>claimQuest(btn.dataset.qid));
    });
  }

  // ===================== 記録・実績 =====================
  function buildAchievements(){
    return [
      { label:'はじめの一歩', done: (dailyStats.gamesPlayed||0)>=1, desc:'ゲームを1回プレイする' },
      { label:'ライン職人', done: (dailyStats.linesCleared||0)>=100, desc:'ラインを合計100本消す' },
      { label:'コンボマスター', done: (dailyStats.maxComboStreak||0)>=8, desc:'コンボを8連続つなげる' },
      { label:'トリプルクリア', done: (dailyStats.tripleClearCount||0)>=1, desc:'3ライン以上同時に消す' },
      { label:'硬派プレイヤー', done: (dailyStats.hardModeGamesPlayed||0)>=5, desc:'「硬い」以上の難易度を5回プレイ' },
      { label:'テトリスマスター', done: (tetrisBest||0)>=5000, desc:'テトリスモードで5000点以上を出す' },
      { label:'タイムアタック挑戦者', done: (bestScores.timeattack||0)>=1000, desc:'タイムアタックで1000点以上を出す' },
      { label:'クエストマニア', done: (questsCompletedCount||0)>=10, desc:'エンドレスクエストを10個クリアする' },
      { label:'コレクター', done: (ownedSkins||[]).length>=5, desc:'スキンを5個以上入手する' }
    ];
  }

  function renderRecordsModal(){
    modalContent.dataset.mode = 'records';
    const achievements = buildAchievements();
    const doneCount = achievements.filter(a=>a.done).length;
    let html = `
      <h2 style="color:var(--gold);">🏆 記録・実績</h2>
      <div class="sub" style="margin-bottom:10px;">これまでのプレイ記録と実績の達成状況です。</div>
      <div class="records-grid">
        <div class="record-box"><div class="rlabel">🏆 通常モード最高</div><div class="rval">${best}</div></div>
        <div class="record-box"><div class="rlabel">⏱ タイムアタック最高</div><div class="rval">${bestScores.timeattack||0}</div></div>
        <div class="record-box"><div class="rlabel">🧱 テトリス最高</div><div class="rval">${tetrisBest||0}</div></div>
        <div class="record-box"><div class="rlabel">🔥 最大コンボ</div><div class="rval">${dailyStats.maxComboStreak||0}</div></div>
        <div class="record-box"><div class="rlabel">💥 累計消去ライン</div><div class="rval">${dailyStats.linesCleared||0}</div></div>
        <div class="record-box"><div class="rlabel">🎮 総プレイ回数</div><div class="rval">${dailyStats.gamesPlayed||0}</div></div>
        <div class="record-box"><div class="rlabel">📊 総スコア</div><div class="rval">${dailyStats.scoreEarned||0}</div></div>
        <div class="record-box"><div class="rlabel">🧩 設置ピース数</div><div class="rval">${dailyStats.piecesPlaced||0}</div></div>
      </div>
      <h3 style="color:var(--mint); margin:14px 0 8px;">🎯 実績（${doneCount}/${achievements.length}）</h3>
      ${achievements.map(a=>`
        <div class="achievement-item ${a.done?'done':''}">
          <span class="ach-icon">${a.done?'✅':'🔒'}</span>
          <div><div class="ach-label">${a.label}</div><div class="ach-desc">${a.desc}</div></div>
        </div>`).join('')}
    `;
    modalContent.innerHTML = html;
  }

  // ===================== 設定(アプリ全体) =====================
  // ===================== 📮 ご要望・不具合報告(Discordへ転送) =====================
  let feedbackImageDataUrl = null;

  function renderFeedbackModal(tab){
    modalContent.dataset.mode = 'feedback';
    feedbackImageDataUrl = null;
    let html = `
      <h2 style="color:var(--gold);">📮 ご要望・不具合報告</h2>
      ${authToken ? `<button class="ghost-btn support-open-btn" id="supportOpenBtn" type="button">💬 運営とのやりとり<span class="lt-badge" id="supportOpenBadge"></span></button>` : `<div class="sub" style="margin-bottom:8px;">💡 ログインして送ると、運営からの返信を「専用チャット」で受け取れます。</div>`}
      <div class="tab-row" style="margin-bottom:10px;">
        <button class="tab-btn ${tab==='request'?'active':''}" data-fbtab="request">💡 ご要望</button>
        <button class="tab-btn ${tab==='report'?'active':''}" data-fbtab="report">🐞 不具合報告</button>
      </div>
    `;
    if(tab === 'request'){
      html += `
        <div class="sub" style="margin-bottom:8px;">「こんな機能が欲しい」「こんなアップデートをしてほしい」など、次のアップデートに入れてほしい内容を考えて自由に書いてください。</div>
        <textarea id="feedbackText" placeholder="例: ○○モードに△△機能を追加してほしい、□□の見た目をもっとこうしてほしい、など" style="width:100%; min-height:140px; padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif; resize:vertical; box-sizing:border-box;"></textarea>
        <button class="primary-btn" id="feedbackSendBtn">💡 要望を送信する</button>
        <div class="sub" id="feedbackStatus" style="margin-top:8px;"></div>
      `;
    } else {
      html += `
        <div class="sub" style="margin-bottom:4px; color:var(--coral); font-weight:700;">⚠️ 「スコアがランキングに反映されない」など再現の証拠が必要な不具合は、スクリーンショットが無いと対応できない場合があります。できるだけ画像を添付してください。</div>
        <textarea id="feedbackText" placeholder="例: ○○モードでスコアが加算されない、△△のボタンを押しても反応しない、など具体的に書いてください" style="width:100%; min-height:120px; padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif; resize:vertical; box-sizing:border-box; margin-top:8px;"></textarea>
        <input type="file" id="feedbackImageInput" accept="image/*" style="display:none;">
        <button class="ghost-btn" id="feedbackImageBtn" style="width:100%; margin-top:8px;">🖼️ 画像を添付する(任意)</button>
        <div id="feedbackImagePreviewWrap" style="display:none; margin-top:8px;">
          <img id="feedbackImagePreview" style="max-width:100%; border-radius:12px; display:block;">
          <button class="ghost-btn" id="feedbackImageRemoveBtn" style="width:100%; margin-top:6px;">画像を削除</button>
        </div>
        <button class="primary-btn" id="feedbackSendBtn">🐞 報告を送信する</button>
        <div class="sub" id="feedbackStatus" style="margin-top:8px;"></div>
      `;
    }
    modalContent.innerHTML = html;

    const sob = document.getElementById('supportOpenBtn');
    if(sob){ sob.addEventListener('click', ()=>{ if(window.CBSupport) window.CBSupport.open(); });
      if(window.CBSupport){ const n = window.CBSupport.badgeCount(); const b = document.getElementById('supportOpenBadge'); if(b && n > 0){ b.textContent = n; b.classList.add('show'); } } }
    modalContent.querySelectorAll('.tab-btn[data-fbtab]').forEach(btn=>{
      btn.addEventListener('click', ()=> renderFeedbackModal(btn.dataset.fbtab));
    });

    if(tab === 'report'){
      const imgBtn = document.getElementById('feedbackImageBtn');
      const imgInput = document.getElementById('feedbackImageInput');
      const previewWrap = document.getElementById('feedbackImagePreviewWrap');
      const previewImg = document.getElementById('feedbackImagePreview');
      imgBtn.addEventListener('click', ()=> imgInput.click());
      imgInput.addEventListener('change', (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          feedbackImageDataUrl = reader.result;
          previewImg.src = feedbackImageDataUrl;
          previewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
      });
      document.getElementById('feedbackImageRemoveBtn').addEventListener('click', ()=>{
        feedbackImageDataUrl = null;
        imgInput.value = '';
        previewWrap.style.display = 'none';
      });
    }

    document.getElementById('feedbackSendBtn').addEventListener('click', async ()=>{
      const textEl = document.getElementById('feedbackText');
      const statusEl = document.getElementById('feedbackStatus');
      const message = textEl.value.trim();
      if(!message){ statusEl.textContent = '内容を入力してください。'; statusEl.style.color = 'var(--coral)'; return; }
      const sendBtn = document.getElementById('feedbackSendBtn');
      sendBtn.disabled = true;
      statusEl.textContent = '送信中...';
      statusEl.style.color = 'var(--text-dim)';
      try{
        const endpoint = tab === 'request' ? '/api/feedback/request' : '/api/feedback/report';
        const body = tab === 'request' ? { message } : { message, imageBase64: feedbackImageDataUrl };
        const headers = { 'Content-Type': 'application/json' };
        if(authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(`${API_BASE_URL}${endpoint}`, { method:'POST', headers, body: JSON.stringify(body) });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || '送信に失敗しました');
        statusEl.textContent = '✅ 送信しました。ありがとうございます！';
        statusEl.style.color = 'var(--mint)';
        if(data.threadId && window.CBSupport){      // ログイン中なら、運営との専用チャットが開く
          statusEl.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;"><button class="primary-btn" id="openThreadBtn" type="button">💬 専用チャットを開く(運営が返信します)</button></div>`);
          document.getElementById('openThreadBtn').addEventListener('click', ()=> window.CBSupport.openThread(data.threadId));
          window.CBSupport.refresh();
        }
        textEl.value = '';
        feedbackImageDataUrl = null;
        const previewWrap = document.getElementById('feedbackImagePreviewWrap');
        if(previewWrap) previewWrap.style.display = 'none';
      }catch(err){
        statusEl.textContent = `送信に失敗しました: ${err.message}`;
        statusEl.style.color = 'var(--coral)';
      }finally{
        sendBtn.disabled = false;
      }
    });
  }

  function renderAppSettingsModal(){
    modalContent.dataset.mode = 'appsettings';
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">⚙ 設定</h2>
<div class="settings-row">
        <span>🔊 音量 <b id="volumeValueLabel" style="color:var(--gold);">${Math.round(soundVolume*100)}%</b></span>
        <input type="range" id="volumeSlider" min="0" max="200" value="${Math.round(soundVolume*100)}">
      </div>
      <div class="settings-row">
        <span>🌙 ダークモード</span>
        <label class="switch"><input type="checkbox" id="darkModeToggle" ${darkMode?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row">
        <span>🎃 ハロウィンUI <span class="sub">(開催中のみ)</span></span>
        <label class="switch"><input type="checkbox" id="hwThemeToggle" ${uiPrefs.hwTheme?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row">
        <span>✨ 動きを減らす <span class="sub">(背景の演出など)</span></span>
        <label class="switch"><input type="checkbox" id="reduceMotionToggle" ${uiPrefs.reduceMotion?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row">
        <span>📳 振動 <span class="sub">(ライン消去など・対応端末)</span></span>
        <label class="switch"><input type="checkbox" id="vibrateToggle" ${uiPrefs.vibrate?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row" id="settingsAccountRow" style="cursor:pointer;">
        <span>👤 アカウント</span><span class="sub">${currentUserId ? escapeHtml(myName()) : 'ゲスト'} ›</span>
      </div>
      <div class="settings-row" id="settingsFeedbackRow" style="cursor:pointer;">
        <span>📮 ご要望・不具合報告</span><span class="sub">›</span>
      </div>
      <button class="ghost-btn danger" id="dataResetBtn" style="width:100%; margin-top:8px;">🗑 データリセット</button>
    `;
    document.getElementById('settingsFeedbackRow').addEventListener('click', ()=>{
      renderFeedbackModal('request');
    });
    document.getElementById('volumeSlider').addEventListener('input', (e)=>{
      const pct = parseInt(e.target.value, 10);
      soundVolume = pct / 100;
      bgmVolume = pct / 100;
      const label = document.getElementById('volumeValueLabel');
      if(label) label.textContent = pct + '%';
      saveAppSettings();
      saveBgmSettings();
      applyBgmVolume();
    });
    document.getElementById('volumeSlider').addEventListener('change', ()=> playSound('coin'));
    document.getElementById('darkModeToggle').addEventListener('change', (e)=>{
      darkMode = e.target.checked;
      applyDarkMode();
      saveAppSettings();
    });
    const bindPref = (id, key, after)=> document.getElementById(id).addEventListener('change', (e)=>{
      uiPrefs[key] = e.target.checked; saveUiPrefs(); if(after) after();
    });
    bindPref('hwThemeToggle', 'hwTheme', refreshEventTheme);
    bindPref('reduceMotionToggle', 'reduceMotion', refreshEventTheme);
    bindPref('vibrateToggle', 'vibrate', ()=>{ if(uiPrefs.vibrate) vibrate(40); });
    document.getElementById('settingsAccountRow').addEventListener('click', ()=>{
      closeModal();
      accountBtn.click();
    });
    document.getElementById('dataResetBtn').addEventListener('click', confirmDataReset);
  }

  function confirmDataReset(){
    const name = currentUserId || 'ゲスト';
    const typed = prompt(`⚠️「${name}」のデータを削除します。\nこの操作は取り消せません。よろしければ、確認のためアカウント名「${name}」を正確に入力してください。`);
    if(typed === null) return;
    if(typed !== name){ alert('入力内容が一致しなかったため、キャンセルしました。'); return; }
    performDataReset();
  }

  async function performDataReset(){
    bestScores = { soft:0, baked:0, hard:0, extreme:0, tetris:0, timeattack:0 };
    best = 0; tetrisBest = 0;
    dailyStats = { ...DAILY_STATS_DEFAULT };
    questsCompletedCount = 0; activeQuests = [];
    ensureActiveQuests();
    coins = 0;
    ownedSkins = ['default']; equippedSkin = 'default';
    saveBestScores(); saveDailyQuests(); saveCoins(0); saveSkinsData();
    applySkin('default');
    updateScoreUI(); updateCoinUI();
    if(authToken) await syncToServer();
    alert('データをリセットしました。');
    renderAppSettingsModal();
  }

  // ===================== スキン =====================
  function buildPatternedColors(baseColors, patternKey){
    if(!patternKey || !PATTERN_LAYERS[patternKey]) return baseColors;
    const layer = PATTERN_LAYERS[patternKey];
    return baseColors.map(c=>({ bg: `${layer}, ${c.bg}` }));
  }

  // ★バグ修正: ショップ一覧の小さいスワッチだと柄の不透明度が薄すぎて、
  // 無地スキンとその柄違いバリエーション(同じ色・同じ価格で1文字違いの名前)が
  // ほぼ同じ見た目になり「同じスキンが被って並んでいる」ように見えてしまっていた。
  // ゲーム盤面(buildPatternedColors)はそのままに、一覧プレビューだけ柄を強調して見分けやすくする。
  function buildPatternedColorsForPreview(baseColors, patternKey){
    if(!patternKey || !PATTERN_LAYERS[patternKey]) return baseColors;
    const boosted = PATTERN_LAYERS[patternKey].replace(
      /rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\)/g,
      (m, r, g, b, a) => `rgba(${r},${g},${b},${Math.min(1, parseFloat(a) * 2.2).toFixed(2)})`
    );
    return baseColors.map(c=>({ bg: `${boosted}, ${c.bg}` }));
  }

  function applySkin(id){
    const skin = SKINS.find(s=>s.id===id) || SKINS[0];
    equippedSkin = skin.id;
    const hwDefault = (skin.id==='default' && document.body.classList.contains('hw'));   // 🎃 開催中は標準スキンもハロウィン配色
    Object.entries(hwDefault ? HW_DEFAULT_VARS : skin.vars).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
const titleEl = document.querySelector('.title');
    if(titleEl) titleEl.style.backgroundImage = hwDefault ? HW_TITLE_GRAD : skin.titleGrad;  // background → backgroundImage
    COLORS.length = 0;
    buildPatternedColors(skin.colors, skin.pattern).forEach(c=>COLORS.push(c));
    if(cellEls.length){
      board.forEach((cellData, idx)=>{
        if(cellData.filled && COLORS[cellData.colorIdx]) cellEls[idx].style.background = COLORS[cellData.colorIdx].bg;
      });
    }
    document.body.classList.toggle('gacha-shimmer-active', !!skin.gachaEffect);
    // ★アニメーションスキン: ブロック自体が常時動き続ける新しい種類のスキン
    if(skin.animType){ document.body.setAttribute('data-living-anim', skin.animType); }
    else { document.body.removeAttribute('data-living-anim'); }
    renderTray();
  }

  function buySkin(id){
    const skin = SKINS.find(s=>s.id===id);
    if(!skin || skin.gacha || ownedSkins.includes(id) || coins < skin.price) return;
    coins -= skin.price;
    ownedSkins.push(id);
    updateCoinUI();
    saveSkinsData();
    syncToServer();
    renderSettingsModal('skin');
  }

  function equipSkin(id){
    if(!ownedSkins.includes(id)) return;
    applySkin(id);
    saveSkinsData();
    syncToServer(); // ★これが無いとサーバー側のequippedSkinが更新されず、数秒後の定期同期で元のスキンに戻ってしまう
    renderSettingsModal('skin');
  }

  async function loadSkinsData(){
    try{
      const res = await appStorage.get(STORAGE_SKINS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        ownedSkins = (parsed.owned && parsed.owned.length) ? parsed.owned : ['default'];
        equippedSkin = parsed.equipped || 'default';
      }
    }catch(err){ ownedSkins = ['default']; equippedSkin = 'default'; }
    applySkin(equippedSkin);
  }

  async function saveSkinsData(){
    try{ await appStorage.set(STORAGE_SKINS, JSON.stringify({owned:ownedSkins, equipped:equippedSkin}), false); }catch(err){}
  }

  // ===================== 設定 =====================
  async function loadSettings(){
    let isFirstTime = true;
    try{
      const res = await appStorage.get(STORAGE_SETTINGS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        currentMode = (MODES[parsed.mode] || parsed.mode==='tetris') ? parsed.mode : 'baked';
        SIZE = (currentMode==='extreme') ? 8 : Math.min(18, Math.max(5, parsed.size||8));
        // ★テトリスのサブモードとAI難易度を復元
        if(['solo','vs','sprint','ultra'].includes(parsed.tetrisSubMode)){
          tetrisSubMode = parsed.tetrisSubMode;
        }
        if(parsed.aiDifficulty && AI_DIFFICULTIES[parsed.aiDifficulty]){
          aiDifficulty = parsed.aiDifficulty;
        }
        isFirstTime = false;
      }
    }catch(err){}
    return isFirstTime;
  }
  async function saveSettings(){
    try{
      await appStorage.set(STORAGE_SETTINGS, JSON.stringify({
        mode: currentMode,
        size: SIZE,
        tetrisSubMode: tetrisSubMode,
        aiDifficulty: aiDifficulty
      }), false);
    }catch(err){}
  }

  function renderModeTab(){
    let html = `<div class="sub" style="margin-bottom:10px;">モードと盤面サイズを選んで「この設定でスタート」を押してください。</div>`;
    Object.entries(MODES).forEach(([key, m])=>{
      const selected = pendingMode === key;
      html += `
        <div class="mode-card ${selected?'selected':''}" data-mode="${key}">
          <div class="mode-card-head"><span class="mode-emoji">${m.emoji}</span><span>${m.label}</span>
            <span class="coin-tag">🪙×${MODE_COIN_MULT[key]}</span></div>
        </div>`;
    });
    const tetrisSelected = pendingMode === 'tetris';
    html += `
      <div class="mode-card ${tetrisSelected?'selected':''}" data-mode="tetris">
        <div class="mode-card-head"><span class="mode-emoji">🧱</span><span>テトリス</span>
          <span class="coin-tag">NEW</span></div>
      </div>`;
    const taSelected = pendingMode === 'timeattack';
    html += `
      <div class="mode-card ${taSelected?'selected':''}" data-mode="timeattack">
        <div class="mode-card-head"><span class="mode-emoji">⏱</span><span>タイムアタック</span>
          <span class="coin-tag">NEW</span></div>
      </div>`;

    if(pendingMode === 'tetris'){
      // 🎮 遊び方を選択（ソロ or VS AI）
      html += `<div class="sub" style="margin:12px 0 8px; font-weight:800; color:var(--gold);">🎮 遊び方を選択</div>`;
      html += `
        <div class="mode-card ${tetrisSubMode==='solo'?'selected':''}" data-tetris-sub="solo">
          <div class="mode-card-head"><span class="mode-emoji">🧱</span><span>ソロモード</span>
            <span class="coin-tag">練習・記録更新</span></div>
        </div>
        <div class="mode-card ${tetrisSubMode==='vs'?'selected':''}" data-tetris-sub="vs">
          <div class="mode-card-head"><span class="mode-emoji">⚔️</span><span>VS AI</span>
            <span class="coin-tag">AIと勝負</span></div>
        </div>
        <div class="mode-card ${tetrisSubMode==='sprint'?'selected':''}" data-tetris-sub="sprint">
          <div class="mode-card-head"><span class="mode-emoji">🏁</span><span>スプリント(40ライン)</span>
            <span class="coin-tag">NEW</span></div>
          <div class="sub" style="margin-top:4px; font-size:11px;">40ライン消すまでのタイムを競う。自己ベストを記録します。</div>
        </div>
        <div class="mode-card ${tetrisSubMode==='ultra'?'selected':''}" data-tetris-sub="ultra">
          <div class="mode-card-head"><span class="mode-emoji">⏳</span><span>ウルトラ(2分)</span>
            <span class="coin-tag">NEW</span></div>
          <div class="sub" style="margin-top:4px; font-size:11px;">2分間でどれだけスコアを稼げるか。フレンド対決もこのルールです。</div>
        </div>
      `;

      // VS AIの時は難易度選択を表示
      if(tetrisSubMode === 'vs'){
        html += `<div class="sub" style="margin:14px 0 8px; font-weight:800; color:var(--gold);">🤖 AIの強さを選択</div>`;
        Object.entries(AI_DIFFICULTIES).forEach(([key, diff]) => {
          html += `
            <div class="mode-card ${aiDifficulty===key?'selected':''}" data-ai-diff="${key}">
              <div class="mode-card-head">
                <span style="font-size:16px;">${diff.label}</span>
              </div>
              <div class="sub" style="margin-top:4px; font-size:11px;">${diff.desc}</div>
            </div>`;
        });
      }

      const startLabel = tetrisSubMode==='solo' ? '🧱 ソロモードを始める'
        : tetrisSubMode==='sprint' ? '🏁 スプリントを始める'
        : tetrisSubMode==='ultra' ? '⏳ ウルトラを始める'
        : `⚔️ ${AI_DIFFICULTIES[aiDifficulty].label} と対戦`;
      html += `<button class="primary-btn" id="applyModeBtn" style="margin-top:12px;">${startLabel}</button>`;
      return html;
    }
    if(pendingMode === 'timeattack'){
      html += `
        <div class="sub" style="margin:8px 0;">制限時間${TIME_ATTACK_DURATION}秒でどれだけ高得点を出せるか挑戦！してね。うん。</div>
        <button class="primary-btn" id="applyModeBtn">タイムアタックを始める</button>`;
      return html;
    }

    const sizeNow = pendingMode==='extreme' ? 8 : pendingSize;
    const totalMult = (MODE_COIN_MULT[pendingMode] * sizeCoinMult(sizeNow)).toFixed(2);
    html += `
      <div class="size-row">
        <div class="qtitle" style="margin-bottom:2px;">盤面サイズ: <span id="sizeVal">${sizeNow}</span> × ${sizeNow}</div>
        <input type="range" id="sizeSlider" min="5" max="18" step="1" value="${sizeNow}" ${pendingMode==='extreme'?'disabled':''}>
        <div class="sub" style="margin-top:4px;">${pendingMode==='extreme' ? '激硬モードは8×8で固定です。' : '盤面が小さいほどコイン倍率が上がります。'}</div>
        <div class="sub" style="margin-top:8px; color:var(--gold); font-weight:800;">獲得コイン倍率: ×<span id="totalMultVal">${totalMult}</span>(焼成8×8が基準の×1.00)</div>
      </div>
      <button class="primary-btn" id="applyModeBtn">この設定でスタート</button>`;
    return html;
  }

  let skinFilter = 'all';
  function renderSkinTab(){
    let html = `<div class="sub" style="margin-bottom:8px;">🪙 ${formatNumber(coins)} 所持中。ゲームで貯めたコインで見た目を変えられます。</div>`;
    html += `<div class="tab-row" style="margin-bottom:10px; flex-wrap:wrap;">
      <button class="tab-btn sfilter-btn ${skinFilter==='all'?'active':''}" data-sfilter="all">すべて</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='plain'?'active':''}" data-sfilter="plain">無地</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='pattern'?'active':''}" data-sfilter="pattern">🎨 柄物</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='gacha'?'active':''}" data-sfilter="gacha">🎰 ガチャ限定</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='event'?'active':''}" data-sfilter="event">🎃❄ イベント・パス限定</button>
    </div>`;
    // ガチャ限定スキンは通常ショップの「すべて/無地/柄物」には出さず、専用フィルタでのみ表示する(コインでの購入は不可)
    const list = SKINS.filter(s => {
      if(skinFilter==='event') return !!s.event;
      if(skinFilter==='gacha') return !!s.gacha && !s.event;
      if(s.gacha) return false;
      return skinFilter==='all' ? true : skinFilter==='pattern' ? !!s.pattern : !s.pattern;
    }).slice().sort((a,b)=>a.price-b.price); // 値段の安い順に並べる
    if(skinFilter==='gacha' && list.every(s=>!ownedSkins.includes(s.id))){
      html += `<div class="empty-hint">まだガチャ限定スキンを持っていません。🎰ガチャで手に入れよう！</div>`;
    }
    if(skinFilter==='event' && list.every(s=>!ownedSkins.includes(s.id))){
      html += `<div class="empty-hint">まだイベント・パス限定スキンを持っていません。🎃イベントや❄ウィンターパスで手に入れよう！</div>`;
    }
    list.forEach(skin=>{
      const owned = ownedSkins.includes(skin.id);
      const equipped = equippedSkin === skin.id;
      const canBuy = !owned && !skin.gacha && coins >= skin.price;
      let btnLabel = equipped ? '装備中' : owned ? '装備する' : (skin.gacha ? (skin.event==='winter' ? '❄パス限定' : skin.event ? '🎃イベント限定' : '🎰ガチャ限定') : (skin.price===0 ? '入手する' : (canBuy ? '購入する' : 'コインが足りません')));
      let btnAction = equipped ? '' : owned ? 'equip' : (skin.gacha ? '' : 'buy');
      const swatchColors = buildPatternedColorsForPreview(skin.colors, skin.pattern);
      if(skin.gacha && !owned) return; // 未入手のガチャ限定スキンはカードごと非表示(ガチャフィルタでは「持っていない」ことが分かればよい)
      html += `
        <div class="quest-item">
          <div class="qtitle">${skin.name}${equipped?' ✅':''}${skin.pattern?' <span class="coin-tag">柄物</span>':''}${skin.event==='winter'?' <span class="coin-tag">❄ウィンターパス限定</span>':skin.event?' <span class="coin-tag">🎃イベント限定</span>':(skin.gacha?' <span class="coin-tag">🎰限定</span>':'')}${skin.animType?' <span class="coin-tag">✨アニメーション</span>':''}</div>
          <div class="sub" style="margin:2px 0 8px;">${skin.desc}</div>
          <div class="skin-swatches">${swatchColors.map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>
          <div class="quest-foot" style="margin-top:8px;">
            <span>${skin.event==='winter' ? '❄ウィンターパス限定' : skin.event ? '🎃イベント限定' : skin.gacha ? '🎰ガチャ限定' : (skin.price===0 ? '無料' : `🪙${formatNumber(skin.price)}`)}</span>
            <button class="claim-btn" data-skin="${skin.id}" data-action="${btnAction}" ${(equipped || (!owned && (!canBuy && !skin.gacha)) || (skin.gacha && !owned))?'disabled':''}>${btnLabel}</button>
          </div>
        </div>`;
    });
    return html;
  }

  function renderSettingsModal(tab){
    modalContent.dataset.mode = 'settings';
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">⚙️ 設定</h2>
      <div class="tab-row">
        <button class="tab-btn ${tab==='mode'?'active':''}" data-stab="mode">ゲームモード</button>
        <button class="tab-btn ${tab==='skin'?'active':''}" data-stab="skin">🎨 スキン</button>
        <button class="tab-btn ${tab==='bg'?'active':''}" data-stab="bg">🖼️ 背景</button>
      </div>
      <div id="settingsTabBody">${tab==='skin' ? renderSkinTab() : tab==='bg' ? renderBgTab() : renderModeTab()}</div>
    `;
    modalContent.querySelectorAll('.tab-btn[data-stab]').forEach(btn=>{
      btn.addEventListener('click', ()=>renderSettingsModal(btn.dataset.stab));
    });
    if(tab==='skin'){
      modalContent.querySelectorAll('.sfilter-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          skinFilter = btn.dataset.sfilter;
          renderSettingsModal('skin');
        });
      });
      modalContent.querySelectorAll('.claim-btn[data-skin]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = btn.dataset.skin, action = btn.dataset.action;
          if(action==='buy') buySkin(id);
          else if(action==='equip') equipSkin(id);
        });
      });
    } else if(tab==='bg'){
      const fileInput = document.getElementById('bgFileInput');
      const pickBtn = document.getElementById('bgPickBtn');
      const resetBtn = document.getElementById('bgResetBtn');
      if(pickBtn) pickBtn.addEventListener('click', ()=> fileInput.click());
      if(fileInput) fileInput.addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        const statusEl = document.getElementById('bgStatus');
        if(statusEl) statusEl.textContent = '画像を処理中...';
        try{
          await setCustomBackgroundFromFile(file);
          renderSettingsModal('bg');
        }catch(err){
          if(statusEl) statusEl.textContent = '画像の読み込みに失敗しました。別の画像でお試しください。';
        }
      });
      if(resetBtn) resetBtn.addEventListener('click', async ()=>{
        await resetCustomBackground();
        renderSettingsModal('bg');
      });
    } else {
      modalContent.querySelectorAll('.mode-card[data-mode]').forEach(card=>{
        card.addEventListener('click', ()=>{
          pendingMode = card.dataset.mode;
          if(pendingMode==='extreme') pendingSize = 8;
          renderSettingsModal('mode');
        });
      });
      // テトリス：ソロ/VS AI 切り替え
      modalContent.querySelectorAll('.mode-card[data-tetris-sub]').forEach(card=>{
        card.addEventListener('click', ()=>{
          tetrisSubMode = card.dataset.tetrisSub;
          renderSettingsModal('mode');
        });
      });
      // テトリス：AI難易度切り替え
      modalContent.querySelectorAll('.mode-card[data-ai-diff]').forEach(card=>{
        card.addEventListener('click', ()=>{
          aiDifficulty = card.dataset.aiDiff;
          renderSettingsModal('mode');
        });
      });
      const slider = document.getElementById('sizeSlider');
      if(slider){
        slider.addEventListener('input', (e)=>{
          pendingSize = parseInt(e.target.value,10);
          const label = document.getElementById('sizeVal');
          if(label) label.textContent = pendingSize;
          const multLabel = document.getElementById('totalMultVal');
          if(multLabel) multLabel.textContent = (MODE_COIN_MULT[pendingMode] * sizeCoinMult(pendingSize)).toFixed(2);
        });
      }
      const applyBtn = document.getElementById('applyModeBtn');
      if(applyBtn) applyBtn.addEventListener('click', ()=>{ applyMode(pendingMode, pendingSize); closeModal(); });
    }
  }

  settingsBtn.addEventListener('click', ()=>{
    pendingMode = currentMode; pendingSize = SIZE;
    renderSettingsModal('mode');
    modalOverlay.classList.add('show');
  });

// ===================== 🎵 BGMプレイヤー =====================
  const STORAGE_BGM = 'nexus-bgm-v1';
  let bgmAudio = null;
  let bgmEnabled = true;
  let bgmVolume = 0.4;
  let bgmCurrentFile = null;
let bgmStarted = false;
  // ★200%音量対応: BGMをWeb Audio経由で増幅するためのノード
  let bgmGainNode = null;
  let bgmSourceNode = null;

  async function loadBgmSettings(){
    try{
      const res = await appStorage.get(STORAGE_BGM, false);
      if(res && res.value){
        const p = JSON.parse(res.value);
        if(typeof p.enabled === 'boolean') bgmEnabled = p.enabled;
        if(typeof p.volume === 'number') bgmVolume = p.volume;
        if(typeof p.currentFile === 'string') bgmCurrentFile = p.currentFile;
      }
    }catch(err){}
    updateMusicButton();
  }
  async function saveBgmSettings(){
    try{
      await appStorage.set(STORAGE_BGM, JSON.stringify({
        enabled:bgmEnabled, volume:bgmVolume, currentFile:bgmCurrentFile
      }), false);
    }catch(err){}
  }

  function updateMusicButton(){
    const btn = document.getElementById('musicBtn');
    if(!btn) return;
    btn.textContent = (bgmEnabled && bgmCurrentFile) ? '🎵' : '🔇';
    btn.title = (bgmEnabled && bgmCurrentFile) ? 'BGM: 再生中' : 'BGM: 停止中';
  }

function ensureBgmGainNode(){
    // audioCtxがまだ無ければ作らない(初回ユーザー操作で unlockAudio される)
    if(!audioCtx) return null;
    if(!bgmGainNode){
      bgmGainNode = audioCtx.createGain();
      bgmGainNode.connect(audioCtx.destination);
    }
    return bgmGainNode;
  }

  function playBgmTrack(file){
    if(menuDucking){ stopBgm(); if(file) bgmCurrentFile = file; return; }      // メニュー動画の音が出ている間は、BGMは待つ
    stopBgm();
    if(!file) return;
    bgmCurrentFile = file;
    const thisAudio = new Audio('bgm/' + file);
    bgmAudio = thisAudio;
    thisAudio.loop = true;

    unlockAudio();
    const gainNode = ensureBgmGainNode();
    if(gainNode){
      try{
        const source = audioCtx.createMediaElementSource(thisAudio);
        source.connect(gainNode);
        gainNode.gain.value = bgmVolume;
        bgmSourceNode = source;
      }catch(err){
        thisAudio.volume = Math.min(1, bgmVolume);
      }
    } else {
      thisAudio.volume = Math.min(1, bgmVolume);
    }

    thisAudio.addEventListener('error', ()=>{
      console.warn('BGM読み込み失敗:', file);
      if(bgmAudio === thisAudio) bgmAudio = null;
      updateMusicButton();
    });
    thisAudio.play().then(()=>{
      bgmStarted = true;
      updateMusicButton();
    }).catch(()=>{
      if(bgmAudio === thisAudio) bgmAudio = null;
      updateMusicButton();
    });
    saveBgmSettings();
  }

  function stopBgm(){
    if(bgmSourceNode){
      try{ bgmSourceNode.disconnect(); }catch(err){}
      bgmSourceNode = null;
    }
    if(bgmAudio){
      try{ bgmAudio.pause(); }catch(err){}
      bgmAudio = null;
    }
  }

  function toggleBgm(){
    bgmEnabled = !bgmEnabled;
    if(bgmEnabled && bgmCurrentFile){
      playBgmTrack(bgmCurrentFile);
    } else {
      stopBgm();
    }
    updateMusicButton();
    saveBgmSettings();
  }

  function applyBgmVolume(){
    if(bgmGainNode){
      bgmGainNode.gain.value = bgmVolume;
    } else if(bgmAudio){
      bgmAudio.volume = Math.min(1, bgmVolume);
    }
    if(window.CBMenuAudio && window.CBMenuAudio.changed) window.CBMenuAudio.changed();      // メニュー動画の音量もBGMのスライダーに合わせる
  }

  // 🎞 メニュー動画(menumedia.js)に音があるとき、BGMとかぶらないようにする。動画の音が出ている間だけ BGM を止め、止まったら続きから再開
  let menuDucking = false;
  function menuVideoDuck(on){
    menuDucking = !!on;
    if(on){ if(bgmAudio){ try{ bgmAudio.pause(); }catch(err){} } return; }
    if(!bgmEnabled) return;
    if(bgmAudio && bgmAudio.paused){ bgmAudio.play().catch(()=>{}); return; }
    if(!bgmAudio){
      if(!bgmCurrentFile && MUSIC_LIBRARY.length > 0) bgmCurrentFile = MUSIC_LIBRARY[0].file;
      if(bgmCurrentFile) playBgmTrack(bgmCurrentFile);
    }
  }
  window.CBMenuAudio = { duck: menuVideoDuck, enabled: ()=> bgmEnabled, volume: ()=> Math.min(1, Math.max(0.05, bgmVolume * 1.5)), changed: null };

  // ===================== サウンド =====================
  let audioCtx = null;
  function unlockAudio(){
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state === 'suspended') audioCtx.resume();
    }catch(err){}
  }
  // より満足感のあるサウンド(単純な音量アップではなく、和音・アルペジオで表現)
  function playSound(type, intensity){
    if(!soundOn || soundVolume<=0) return;
    try{
      unlockAudio();
      if(!audioCtx) return;
      const t0 = audioCtx.currentTime;
      const master = audioCtx.createGain();
      master.gain.value = soundVolume;
      master.connect(audioCtx.destination);
      if(type==='place'){
        const o1 = audioCtx.createOscillator(), g1 = audioCtx.createGain();
        o1.type='sine'; o1.frequency.setValueAtTime(520, t0); o1.frequency.exponentialRampToValueAtTime(300, t0+0.08);
        g1.gain.setValueAtTime(0.10, t0); g1.gain.exponentialRampToValueAtTime(0.001, t0+0.09);
        o1.connect(g1); g1.connect(master); o1.start(t0); o1.stop(t0+0.1);
        const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
        o2.type='triangle'; o2.frequency.setValueAtTime(780, t0);
        g2.gain.setValueAtTime(0.045, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0+0.05);
        o2.connect(g2); g2.connect(master); o2.start(t0); o2.stop(t0+0.06);
      } else if(type==='clear'){
        const lvl = intensity||1;
        const notes = lvl>=4 ? [523.25,659.25,783.99,1046.5] : lvl>=2 ? [523.25,659.25,783.99] : [523.25,659.25];
        notes.forEach((freq,i)=>{
          const start = t0 + i*0.055;
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type='triangle'; o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0.001, start);
          g.gain.linearRampToValueAtTime(0.13, start+0.015);
          g.gain.exponentialRampToValueAtTime(0.001, start+0.22);
          o.connect(g); g.connect(master);
          o.start(start); o.stop(start+0.23);
        });
      } else if(type==='coin'){
        [1046.5, 1568].forEach((freq,i)=>{
          const start = t0 + i*0.045;
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type='sine'; o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0.001, start);
          g.gain.linearRampToValueAtTime(0.12, start+0.01);
          g.gain.exponentialRampToValueAtTime(0.001, start+0.18);
          o.connect(g); g.connect(master);
          o.start(start); o.stop(start+0.19);
        });
      } else if(type==='gameover'){
        [392,329.63,261.63].forEach((freq,i)=>{
          const start = t0 + i*0.12;
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type='sine'; o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0.11, start);
          g.gain.exponentialRampToValueAtTime(0.001, start+0.35);
          o.connect(g); g.connect(master);
          o.start(start); o.stop(start+0.36);
        });
      } else if(type==='timer'){
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type='square'; o.frequency.setValueAtTime(880, t0);
        g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0+0.08);
        o.connect(g); g.connect(master); o.start(t0); o.stop(t0+0.09);
      } else {
        // ===== v3.6 ミニゲーム用の効果音(ヘビ=Googleのヘビゲーム風 / 恐竜ラン / シモンなど) =====
        const tone = (wave, f0, f1, start, dur, vol)=>{
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type = wave; o.frequency.setValueAtTime(f0, t0+start);
          if(f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0+start+dur);
          g.gain.setValueAtTime(0.0001, t0+start); g.gain.linearRampToValueAtTime(vol, t0+start+0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t0+start+dur);
          o.connect(g); g.connect(master); o.start(t0+start); o.stop(t0+start+dur+0.02);
        };
        const noise = (start, dur, vol, freq)=>{
          const len = Math.max(1, Math.floor(audioCtx.sampleRate*dur));
          const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate), d = buf.getChannelData(0);
          for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1 - i/len);
          const src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
          src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = 0.9;
          g.gain.setValueAtTime(vol, t0+start); g.gain.exponentialRampToValueAtTime(0.0001, t0+start+dur);
          src.connect(f); f.connect(g); g.connect(master); src.start(t0+start);
        };
        if(type==='snakeEat'){ noise(0, 0.07, 0.22, 2200); tone('square', 420, 700, 0.005, 0.09, 0.07); tone('triangle', 880, 1180, 0.07, 0.07, 0.05); }
        else if(type==='snakeTurn'){ tone('sine', 310, 250, 0, 0.035, 0.05); }
        else if(type==='snakeDie'){ tone('sawtooth', 240, 52, 0, 0.55, 0.12); noise(0, 0.18, 0.2, 500); tone('square', 120, 60, 0.12, 0.3, 0.06); }
        else if(type==='snakeStart'){ [392, 523.25, 659.25].forEach((f,i)=> tone('triangle', f, 0, i*0.07, 0.12, 0.1)); }
        else if(type==='jump'){ tone('square', 380, 820, 0, 0.11, 0.07); }
        else if(type==='point'){ tone('square', 880, 0, 0, 0.07, 0.06); tone('square', 1320, 0, 0.1, 0.09, 0.06); }
        else if(type==='hit'){ tone('sawtooth', 330, 70, 0, 0.28, 0.11); noise(0, 0.12, 0.18, 800); }
        else if(type==='note'){ tone('triangle', intensity || 440, 0, 0, 0.28, 0.14); tone('sine', (intensity || 440)*2, 0, 0, 0.2, 0.04); }
        else if(type==='tick'){ tone('square', 1500, 1200, 0, 0.02, 0.04); }
        else if(type==='pop'){ tone('sine', 300, 900, 0, 0.07, 0.1); }
        else if(type==='whoosh'){ noise(0, 0.14, 0.12, 1200); }
        else if(type==='win'){ [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f,i)=> tone('triangle', f, 0, i*0.07, 0.2, 0.11)); }
        else if(type==='bad'){ tone('square', 200, 110, 0, 0.18, 0.08); }
      }
    }catch(err){}
  }
  soundBtn.addEventListener('click', ()=>{
    unlockAudio();
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
  });

// 🎵 音楽ボタン: 一覧モーダルを開く
  document.getElementById('musicBtn').addEventListener('click', ()=>{
    unlockAudio();
    renderMusicModal();
    modalOverlay.classList.add('show');
  });

// 最初の1タップでBGM自動開始(ブラウザの自動再生制限対策)
  function autoStartBgmOnFirstInteraction(){
    if(menuDucking) return;           // メニュー動画の音が出ている間は、まだ始めない(止まったら menuVideoDuck(false) が始める)
    if(bgmStarted) return;
    if(!bgmEnabled) return;
    // まだ曲が選ばれていなければ、ライブラリの先頭を自動選択
    if(!bgmCurrentFile && MUSIC_LIBRARY.length > 0){
      bgmCurrentFile = MUSIC_LIBRARY[0].file;
    }
    if(bgmCurrentFile) playBgmTrack(bgmCurrentFile);
    document.removeEventListener('pointerdown', autoStartBgmOnFirstInteraction);
    document.removeEventListener('click', autoStartBgmOnFirstInteraction);
  }
  document.addEventListener('pointerdown', autoStartBgmOnFirstInteraction);
  document.addEventListener('click', autoStartBgmOnFirstInteraction);
  document.body.addEventListener('pointerdown', unlockAudio, { once:true });

  // ===================== ゲームオーバー =====================
  function endGame(){
    playSound('gameover');
    stopTimeAttackTimer();
    dailyStats.gamesPlayed += 1;
    if(currentMode==='hard' || currentMode==='extreme') dailyStats.hardModeGamesPlayed = (dailyStats.hardModeGamesPlayed||0) + 1;
    saveDailyQuests();
    updateQuestProgress();
    grantBattlePassXp(sessionScoreForXp);
    sessionScoreForXp = 0;
    reportEventGame({ mode: currentMode, score: score, duel: !!currentDuelId });
    try{ if(window.CBV43) window.CBV43.onMainEnd({ mode: currentMode, score: score }); }catch(e){}

    if(weeklyChallengeActive){
      weeklyChallengeActive = false;
      finalScoreEl.textContent = score;
      newBestNoteEl.textContent = '🎲 週替わりチャレンジ結果';
      coinEarnedNoteEl.textContent = '';
      duelResultNoteEl.textContent = '送信中...';
      overlayEl.classList.add('show');
      submitWeeklyChallengeScore(score);
      syncPlayTime();
      return;
    }

    const earned = awardGameEndCoins();
    if(earned>0) playSound('coin');
    finalScoreEl.textContent = score;
    const refBest = isRegularMode(currentMode) ? best : (bestScores[currentMode]||0);
    newBestNoteEl.textContent = (score>=refBest && score>0) ? '🎉 ハイスコア更新！' : 'お疲れさまでした！';
    coinEarnedNoteEl.textContent = earned>0 ? `🪙 +${earned} コイン獲得！` : '';
    duelResultNoteEl.textContent = '';
    if(currentDuelId){
      const duelId = currentDuelId;
      currentDuelId = null;
      duelResultNoteEl.textContent = '対決の結果を送信中...';
      submitDuelScore(duelId, score).then(duel=>{
        if(duel){
          duelResultNoteEl.textContent = duelResultText(duel);
          if(duel.status==='completed') syncFromServer(); // 対決報酬のコインをすぐ画面に反映
        }
        else duelResultNoteEl.textContent = '対決結果の送信に失敗しました。';
      });
    }

overlayEl.classList.add('show');
    // ゲーム終了時にサーバーへ送信（今のゲームの実際のスコアを送る）
    if (authToken) syncToServer(score);
    syncPlayTime();
  }

  async function submitWeeklyChallengeScore(finalScore){
    try{
      const res = await fetch(`${API_BASE_URL}/api/weekly-challenge/submit`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ score: finalScore })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || '送信に失敗しました');
      duelResultNoteEl.textContent = `✅ スコア${finalScore}を送信しました！結果はランキングで確認できます。`;
    }catch(err){
      duelResultNoteEl.textContent = `送信に失敗しました: ${err.message}`;
    }
  }

restartBtn.addEventListener('click', ()=>{
    overlayEl.classList.remove('show');
    if(currentMode==='tetris'){ restartTetris(); return; }
    if(currentMode==='timeattack'){ startTimeAttackMode(); return; }   // ★追加
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    initBoard();
    fillTray();
  });

  // ===================== モーダル共通 =====================
  let modalCloseTimer = null;
  function closeModal(){
    if(modalOverlay.classList.contains('show') && !motionOff()){
      modalOverlay.classList.add('closing');
      clearTimeout(modalCloseTimer);
      modalCloseTimer = setTimeout(()=>{
        modalOverlay.classList.remove('closing');
        // 閉じている間に別のウィンドウが開かれていたら(modeが入っていたら)閉じない
        if(!modalContent.dataset.mode) modalOverlay.classList.remove('show');
      }, 200);
    } else {
      modalOverlay.classList.remove('show');
    }
    modalContent.dataset.mode = '';
    if (chatPollingInterval) {
      clearInterval(chatPollingInterval);
      chatPollingInterval = null;
    }
    if (rankingPollInterval) {
      clearInterval(rankingPollInterval);
      rankingPollInterval = null;
    }
  }
  modalClose.addEventListener('click', closeModal);
  // 💬 チャット系の画面(グローバルチャット・DM・運営チャット)は、画面いっぱいに開く
  const FULL_MODES = new Set(['chat', 'dmthread', 'support']);
  let fullTimer = null;
  function fitFullChat(){                                      // キーボードが出ても、入力欄が隠れないように高さを合わせる
    const box = document.getElementById('modalBox'); if(!box) return;
    const vv = window.visualViewport;
    if(vv && modalOverlay.classList.contains('fullchat')){ box.style.height = vv.height + 'px'; box.style.top = vv.offsetTop + 'px'; }
    else { box.style.height = ''; box.style.top = ''; }
  }
  function syncFullChat(){
    clearTimeout(fullTimer);
    if(FULL_MODES.has(modalContent.dataset.mode)){ modalOverlay.classList.add('fullchat'); fitFullChat(); }
    else fullTimer = setTimeout(()=>{ if(!FULL_MODES.has(modalContent.dataset.mode)){ modalOverlay.classList.remove('fullchat'); fitFullChat(); } }, 260);
  }
  new MutationObserver(syncFullChat).observe(modalContent, { attributes:true, attributeFilter:['data-mode'] });
  if(window.visualViewport){ window.visualViewport.addEventListener('resize', fitFullChat); window.visualViewport.addEventListener('scroll', fitFullChat); }
  modalOverlay.addEventListener('click', (e)=>{ if(e.target===modalOverlay) closeModal(); });

  questBtn.addEventListener('click', ()=>{
    renderQuestModal();
    modalOverlay.classList.add('show');
  });

  // ===================== アカウント（修正：ログアウト時に完全リセット） =====================
  function resetToGuest() {
    // ゲスト状態にリセット
    const oldToken = authToken;
    authToken = null;
    currentUserId = null;
    currentDisplayName = ''; currentIcon = ''; currentLv = null;
    clearAuthSession(oldToken);
    // データ初期化
    bestScores = { soft:0, baked:0, hard:0, extreme:0 };
    best = 0;
    coins = 0;
    ownedSkins = ['default'];
    equippedSkin = 'default';
    // クエストもリセット(統計を初期化し、新規クエストをやり直す)
    dailyStats = { ...DAILY_STATS_DEFAULT };
    questsCompletedCount = 0;
    activeQuests = [];
    ensureActiveQuests();
    // プレイ時間リセット
    stopPlayTimeTracking();
    // リアルタイム同期も停止
    stopUserSync();
    playTime = 0;
    // UI更新
    bestValEl.textContent = '0';
    coinValEl.textContent = '0';
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    // スキン適用
    applySkin('default');
    // 盤面を新しくする
    initBoard();
    fillTray();
    // 保存（ゲスト用）
    saveBestScores();
    saveCoins(0);
    saveSkinsData();
    saveDailyQuests();
    // アカウントボタン更新
    updateAccountButton();
    // 管理者パネル非表示
    adminPanelBtn.style.display = 'none';
    // ランキングポーリング停止
    if (rankingPollInterval) {
      clearInterval(rankingPollInterval);
      rankingPollInterval = null;
    }
    // フレンド／チャット未読バッジのポーリング停止＆バッジ非表示
    stopBackgroundPolling();
    friendsList = []; incomingRequests = []; outgoingRequests = [];
    dmUnreadTotal = 0; dmMentionCount = 0; dmPerFriendUnread = {};
    chatUnreadCount = 0; chatMentionCount = 0; chatLastSeenId = 0;
    updateFriendsBadge();
    updateChatBadge();
  }

  function updateAccountButton(){
    accountBtn.textContent = currentUserId ? '👤' : '👤';
    accountBtn.title = currentUserId ? `ログイン中: ${myName()}` : '未ログイン';
    if (currentUserId === ADMIN_USER_ID) {
      adminPanelBtn.style.display = 'flex';
      loadAdminSettings();
      grantAllSkinsIfAdmin();
    } else {
      adminPanelBtn.style.display = 'none';
    }
    if (currentUserId) {
      startBackgroundPolling();
    } else {
      stopBackgroundPolling();
    }
  }

  async function deleteAccount() {
    if (!authToken) return;
    if (!confirm('⚠️ 本当にアカウントを削除しますか？\nこの操作は元に戻せません！')) return;
    if (!confirm('本当に削除しますか？（最終確認）')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/delete`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error('削除に失敗しました');
      alert('アカウントを削除しました。');
      resetToGuest();
      renderAuthModal();
    } catch(err) {
      alert(err.message);
    }
  }

  async function postJson(path, body){
    const r = await fetch(`${API_BASE_URL}${path}`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` }, body: JSON.stringify(body) });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || '失敗しました');
    return d;
  }
  // ---------- 🏷 表示名 / 🪪 ID変更(アカウント画面) ----------
  const fmtWait = (sec)=>{ sec = Math.max(0, Math.floor(sec)); const d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), m = Math.floor((sec%3600)/60); return d ? `${d}日${h}時間` : (h ? `${h}時間${m}分` : `${Math.max(1, m)}分`); };
  async function setupAccountSettings(){
    const hint = document.getElementById('idHint'), idBtn = document.getElementById('idSave'), idNew = document.getElementById('idNew'), idPw = document.getElementById('idPw');
    const dnBtn = document.getElementById('dnSave'), dnInput = document.getElementById('dnInput'), dnMsg = document.getElementById('dnMsg'), idMsg = document.getElementById('idMsg');
    if(!hint) return;
    const setMsg = (el, text, ok)=>{ el.textContent = text; el.className = 'auth-msg ' + (ok ? 'ok' : 'error'); };
    const lockId = (text)=>{ hint.textContent = text; idBtn.disabled = true; idNew.disabled = true; idPw.disabled = true; };
    try{
      const r = await fetch(`${API_BASE_URL}/api/account/info`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      const info = await r.json();
      if(!r.ok) throw new Error(info.error || '');
      if(info.isAdmin) lockId('管理者アカウントのIDは変更できません。');
      else if(!info.canChangeId) lockId(`IDは${info.idChangeDays}日に1回だけ変更できます。あと ${fmtWait(info.waitSec)} で変更できます。`);
      else hint.textContent = `IDはログインに使う名前です。${info.idChangeDays}日に1回だけ変更できます(変更すると運営に通知されます)。他の端末では、新しいIDでログインし直しが必要です。`;
      setupIconPicker(info);
    }catch(err){ hint.textContent = 'IDの情報を取得できませんでした。通信を確認してください。'; }
    function setupIconPicker(info){
      const grid = document.getElementById('iconGrid'), colors = document.getElementById('iconColors'), msg = document.getElementById('iconMsg'), av = document.getElementById('acctAv');
      if(!grid) return;
      const m = /^e:(.+):([0-7])$/.exec(currentIcon || '');
      let pickEmoji = m ? m[1] : null, pickColor = m ? +m[2] : 0;
      const show = (text, ok)=>{ msg.textContent = text; msg.className = 'auth-msg ' + (ok ? 'ok' : 'error'); };
      const applied = (icon)=>{ currentIcon = icon || ''; av.innerHTML = avatarHtml(currentIcon, myName(), currentUserId, 72); updateAccountButton(); };
      const paint = ()=>{
        colors.innerHTML = Array.from({ length: info.iconColors }, (_, i)=> `<button type="button" class="icon-color ${i === pickColor ? 'on' : ''}" data-c="${i}" style="background:linear-gradient(135deg,${AV_GRAD[i]})" aria-label="色${i+1}"></button>`).join('');
        grid.innerHTML = info.iconEmojis.map(e=> `<button type="button" class="icon-pick ${e === pickEmoji ? 'on' : ''}" data-e="${escapeHtml(e)}">${escapeHtml(e)}</button>`).join('');
        colors.querySelectorAll('.icon-color').forEach(b=> b.addEventListener('click', ()=>{ pickColor = +b.dataset.c; paint(); if(pickEmoji) save(); }));
        grid.querySelectorAll('.icon-pick').forEach(b=> b.addEventListener('click', ()=>{ pickEmoji = b.dataset.e; paint(); save(); }));
      };
      const save = async ()=>{
        try{ const d = await postJson('/api/account/icon', { icon: pickEmoji ? `e:${pickEmoji}:${pickColor}` : '' }); applied(d.icon); show('アイコンを変更しました！', true); }
        catch(err){ show(err.message, false); }
      };
      paint();
      document.getElementById('iconResetBtn').addEventListener('click', async ()=>{ pickEmoji = null; paint(); await save(); });
      const file = document.getElementById('iconFile');
      document.getElementById('iconUploadBtn').addEventListener('click', ()=> file.click());
      file.addEventListener('change', async ()=>{
        const f = file.files[0]; if(!f) return;
        show('準備しています…', true);
        try{
          const d = await uploadImageSmart('icon', f, (t)=> show(t, true), { maxEdge:128, maxBytes:12000, square:true });
          pickEmoji = null; paint(); applied(d.icon);
          show(d.host === 'imgbb' ? 'アイコンを設定しました(オリジナルの画質)' : `アイコンを設定しました(圧縮版 ${Math.ceil(d.size/1000)}KB)`, true);
        }catch(err){ show(err.message, false); }
        file.value = '';
      });
    }
    dnBtn.addEventListener('click', async ()=>{
      dnBtn.disabled = true; setMsg(dnMsg, '保存中...', true);
      try{
        const r = await fetch(`${API_BASE_URL}/api/account/display-name`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` }, body: JSON.stringify({ name: dnInput.value }) });
        const d = await r.json();
        if(!r.ok) throw new Error(d.error || '保存に失敗しました');
        currentDisplayName = d.displayName || ''; nameCache[currentUserId] = d.name;
        updateAccountButton(); setMsg(dnMsg, `表示名を「${d.name}」にしました！`, true);
        const card = modalContent.querySelector('.acct-name'); if(card) card.textContent = myName();
      }catch(err){ setMsg(dnMsg, err.message, false); }
      dnBtn.disabled = false;
    });
    idBtn.addEventListener('click', async ()=>{
      const newId = idNew.value.trim(), password = idPw.value;
      if(!newId || !password){ setMsg(idMsg, '新しいIDとパスワードを入力してください', false); return; }
      if(!confirm(`IDを「${currentUserId}」から「${newId}」に変更します。\n\n・${7}日間は、もう一度変更できません\n・他の端末では、新しいIDでログインし直しが必要です\n・フレンドなどはそのまま引き継がれます\n\nよろしいですか？`)) return;
      idBtn.disabled = true; setMsg(idMsg, '変更中...', true);
      try{
        const r = await fetch(`${API_BASE_URL}/api/account/change-id`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` }, body: JSON.stringify({ newId, password }) });
        const d = await r.json();
        if(!r.ok) throw new Error(d.error || '変更に失敗しました');
        authToken = d.token; currentUserId = d.id;
        await saveAuthSession(authToken, currentUserId);
        updateAccountButton(); renderAuthModal();
        const m2 = document.getElementById('idMsg'); if(m2){ m2.textContent = `IDを「${d.id}」に変更しました！`; m2.className = 'auth-msg ok'; }
      }catch(err){ setMsg(idMsg, err.message, false); idBtn.disabled = false; }
    });
  }

  function renderAuthModal(){
    modalContent.dataset.mode = 'auth';
    if(currentUserId){
      modalContent.innerHTML = `
        <h2 style="color:var(--gold);">👤 アカウント</h2>
        <div class="acct-card"><div id="acctAv">${avatarHtml(currentIcon, myName(), currentUserId, 72)}</div><div class="acct-name">${escapeHtml(myName())} ${lvTag(currentLv)}</div><div class="sub">ID: <b>${escapeHtml(currentUserId)}</b></div></div>
        <div class="acct-sec">
          <div class="acct-h">🖼 アイコン</div>
          <div class="sub">好きな絵と色を選ぶか、手持ちの画像をアップロードできます(アップロードした画像は自動で小さくします)。</div>
          <div class="icon-colors" id="iconColors"></div>
          <div class="icon-grid" id="iconGrid"></div>
          <div class="acct-row2"><button class="ghost-btn" id="iconUploadBtn" type="button">📷 画像をアップロード</button><button class="ghost-btn" id="iconResetBtn" type="button">初期に戻す</button></div>
          <input type="file" id="iconFile" accept="image/*" hidden>
          <div class="auth-msg" id="iconMsg"></div>
        </div>
        <div class="acct-sec">
          <div class="acct-h">🏷 表示名</div>
          <div class="sub">ランキング・チャット・フレンドに表示される名前です。日本語OK・16文字まで・何度でも変えられます。空にするとIDが表示されます。</div>
          <div class="acct-row"><input type="text" id="dnInput" maxlength="16" placeholder="${escapeHtml(currentUserId)}" value="${escapeHtml(currentDisplayName)}" /><button class="primary-btn" id="dnSave" type="button">保存</button></div>
          <div class="auth-msg" id="dnMsg"></div>
        </div>
        <div class="acct-sec">
          <div class="acct-h">🪪 IDの変更</div>
          <div class="sub" id="idHint">確認中...</div>
          <input type="text" id="idNew" placeholder="新しいID(半角英数字とアンダースコア3〜20文字)" autocomplete="off" autocapitalize="off" />
          <input type="password" id="idPw" placeholder="パスワード(確認用)" autocomplete="current-password" />
          <button class="primary-btn" id="idSave" type="button">IDを変更する</button>
          <div class="auth-msg" id="idMsg"></div>
        </div>
        <div class="sub">スコア・コインはサーバーと同期されています。</div>
        <button class="primary-btn" id="syncNowBtn">今すぐ同期する</button>
        <button class="ghost-btn" id="logoutBtn">ログアウト</button>
        <button class="ghost-btn" id="deleteAccountBtn" style="color:var(--coral);border-color:var(--coral);">🗑️ アカウント削除</button>
      `;
      document.getElementById('logoutBtn').addEventListener('click', ()=>{
        resetToGuest();  // 完全リセット
        closeModal();
      });
      document.getElementById('syncNowBtn').addEventListener('click', async ()=>{
        await syncToServer();
        await syncFromServer();
      });
      document.getElementById('deleteAccountBtn').addEventListener('click', deleteAccount);
      setupAccountSettings();
      return;
    }
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">👤 アカウント</h2>
      <div class="tab-row">
        <button class="tab-btn active" data-tab="login">ログイン</button>
        <button class="tab-btn" data-tab="register">新規登録</button>
        <button class="tab-btn" data-tab="recover">復元</button>
      </div>
      <form class="auth-form active" id="loginForm">
        <label>ID</label><input type="text" id="loginId" autocomplete="username" />
        <label>パスワード</label><input type="password" id="loginPw" autocomplete="current-password" />
        <button type="submit" class="primary-btn">ログイン</button>
        <div class="auth-msg" id="loginMsg"></div>
      </form>
      <form class="auth-form" id="registerForm">
        <label>ID (半角英数字3〜20文字)</label><input type="text" id="regId" autocomplete="username" />
        <label>パスワード (6文字以上)</label><input type="password" id="regPw" autocomplete="new-password" />
        <label>表示名(省略OK・日本語OK・16文字まで・あとから変えられます)</label><input type="text" id="regName" maxlength="16" autocomplete="nickname" placeholder="例: たろう" />
        <button type="submit" class="primary-btn">新規登録</button>
        <div class="auth-msg" id="regMsg"></div>
      </form>
      <form class="auth-form" id="recoverForm">
        <label>ID</label><input type="text" id="recId" />
        <label>復元コード(管理者から受け取ったもの)</label><input type="text" id="recCode" placeholder="XXXX-XXXX-XXXX-XXXX" />
        <label>新しいパスワード</label><input type="password" id="recPw" autocomplete="new-password" />
        <button type="submit" class="primary-btn">パスワードを再設定</button>
        <div class="auth-msg" id="recMsg"></div>
      </form>
    `;
    if(window.CBEngage) window.CBEngage.decorateAccount(modalContent);
    modalContent.querySelectorAll('.tab-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        modalContent.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        modalContent.querySelectorAll('.auth-form').forEach(f=>f.classList.remove('active'));
        btn.classList.add('active');
        modalContent.querySelector(`#${btn.dataset.tab}Form`).classList.add('active');
      });
    });
    document.getElementById('loginForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const id = document.getElementById('loginId').value.trim();
      const password = document.getElementById('loginPw').value;
      const msgEl = document.getElementById('loginMsg');
      msgEl.textContent = '処理中...'; msgEl.className='auth-msg';
      try{
        const r = await fetch(`${API_BASE_URL}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,password}) });
        const data = await r.json();
        if(!r.ok) throw new Error(data.error || 'ログインに失敗しました。');
        authToken = data.token;
        currentUserId = data.id;
        currentDisplayName = data.displayName || ''; currentIcon = data.icon || ''; currentLv = data.lv || null;
        await saveAuthSession(authToken, currentUserId);
        // ログイン後、サーバーからデータ取得
        await syncFromServer();
        // ローカルに反映（syncFromServerでbestScores, coins, skinsなどが更新される）
        updateAccountButton();
        // プレイ時間追跡開始
        startPlayTimeTracking();
        // ログイン中はサーバーの変更をリアルタイムで反映
        startUserSync();
        msgEl.textContent = 'ログインしました！'; msgEl.className='auth-msg ok';
        // UI更新
        updateScoreUI();
        updateCoinUI();
        applySkin(equippedSkin);
        // モーダル閉じる
        setTimeout(()=>{ closeModal(); }, 500);
      }catch(err){
        msgEl.textContent = err.message + '(サーバーに接続できているか確認してください)';
        msgEl.className='auth-msg error';
      }
    });
    document.getElementById('registerForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const id = document.getElementById('regId').value.trim();
      const password = document.getElementById('regPw').value;
      const displayName = document.getElementById('regName').value.trim();
      const msgEl = document.getElementById('regMsg');
      msgEl.textContent = '処理中...'; msgEl.className='auth-msg';
      try{
        const r = await fetch(`${API_BASE_URL}/api/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,password,displayName}) });
        const data = await r.json();
        if(!r.ok) throw new Error(data.error || '登録に失敗しました。');
        authToken = data.token; currentUserId = data.id; currentDisplayName = data.displayName || ''; currentIcon = data.icon || ''; currentLv = data.lv || null;
        await saveAuthSession(authToken, currentUserId);
        // 新規登録時はデフォルトデータ
        bestScores = { soft:0, baked:0, hard:0, extreme:0 };
        coins = 0;
        ownedSkins = ['default'];
        equippedSkin = 'default';
        playTime = 0;
        saveBestScores();
        saveCoins(0);
        saveSkinsData();
        // クエストは新しく生成
        // クエストは新しく生成
        dailyStats = { ...DAILY_STATS_DEFAULT };
        questsCompletedCount = 0;
        activeQuests = [];
        ensureActiveQuests();
        saveDailyQuests();
        updateScoreUI();
        updateCoinUI();
        applySkin('default');
        startPlayTimeTracking();
        startUserSync();
        updateAccountButton();
        try{ window.dispatchEvent(new CustomEvent('cb:registered')); }catch(e){}
        msgEl.textContent = '登録が完了しました！復元コードは管理者のDiscordに通知されました。';
        msgEl.className='auth-msg ok';
        await syncToServer();
        setTimeout(()=>{ closeModal(); }, 800);
      }catch(err){
        msgEl.textContent = err.message;
        msgEl.className='auth-msg error';
      }
    });
    document.getElementById('recoverForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const id = document.getElementById('recId').value.trim();
      const recoveryCode = document.getElementById('recCode').value.trim();
      const newPassword = document.getElementById('recPw').value;
      const msgEl = document.getElementById('recMsg');
      msgEl.textContent = '処理中...'; msgEl.className='auth-msg';
      try{
        const r = await fetch(`${API_BASE_URL}/api/recover`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,recoveryCode,newPassword}) });
        const data = await r.json();
        if(!r.ok) throw new Error(data.error || '復元に失敗しました。');
        msgEl.textContent = 'パスワードを再設定しました。ログインしてください。';
        msgEl.className='auth-msg ok';
      }catch(err){
        msgEl.textContent = err.message;
        msgEl.className='auth-msg error';
      }
    });
  }

  accountBtn.addEventListener('click', ()=>{ renderAuthModal(); modalOverlay.classList.add('show'); });

  // ===================== サーバー同期（修正：ベストスコアをモード別に送信） =====================

// playedScore … 「今のゲームで実際に出した点」。
  //   渡されたときだけ fromPlay を付けて、管理者コマンドの仮スコアを上書きできるようにする。
  async function syncToServer(playedScore){
    if(!authToken) return;
    try{
      const payload = {
        bestScore: (typeof playedScore === 'number') ? playedScore : (bestScores[currentMode] || 0),
        coins,
        skins: ownedSkins,
        equippedSkin,
        quests: activeQuests,
        mode: currentMode,
        size: SIZE,
        playTime
      };
      if(typeof playedScore === 'number') payload.fromPlay = true;
      const r = await fetch(`${API_BASE_URL}/api/sync`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify(payload)
      });
      if(r.ok){
        const data = await r.json();
        // サーバー側の確定値でローカルを上書きする(管理者コマンド等で
        // サーバー側の値が変わっていた場合に、古いローカル表示のまま
        // ズレ続けてしまうのを防ぐ)
        if(data.bestScores && typeof data.bestScores === 'object'){
          bestScores = { ...bestScores, ...data.bestScores };
          tetrisBest = bestScores.tetris || 0;
          saveBestScores();
          if(isRegularMode(currentMode)){
            best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
          }
        }
        if(data.coins !== undefined){
          coins = data.coins;
          updateCoinUI();
        }
      }
    }catch(err){ console.warn('サーバー同期に失敗しました:', err.message); }
  }

  async function syncFromServer(){
    if(!authToken) return;
    try{
      const r = await fetch(`${API_BASE_URL}/api/sync`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      if(!r.ok) return;
      const data = await r.json();
      applySyncData(data);
    }catch(err){ console.warn('サーバーからの取得に失敗しました:', err.message); }
  }

  function applySyncData(data){
    if (typeof data.displayName === 'string') currentDisplayName = data.displayName;
    if (typeof data.icon === 'string') currentIcon = data.icon;
    if (data.lv) currentLv = data.lv;
    // ベストスコア（モード別がある場合はそちらを優先）
    if (data.bestScores && typeof data.bestScores === 'object') {
      bestScores = { ...bestScores, ...data.bestScores };
    } else if (data.bestScore !== undefined) {
      // 互換性: 全体ベストのみの場合、現在のモードに設定（他のモードはそのまま）
      bestScores[currentMode] = Math.max(bestScores[currentMode] || 0, data.bestScore);
    }
    tetrisBest = bestScores.tetris || 0;
    if (currentMode === 'tetris') {
      bestValEl.textContent = tetrisBest;
    } else {
      best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
      bestValEl.textContent = best;
    }
    saveBestScores();

    if (data.coins !== undefined) {
      coins = data.coins;
      coinValEl.textContent = formatNumber(coins);
      saveCoins(coins);
    }
    if (data.skins) {
      ownedSkins = data.skins;
      saveSkinsData();
    }
    if (data.equippedSkin) {
      equippedSkin = data.equippedSkin;
      applySkin(equippedSkin);
      saveSkinsData();
    }
    if (data.playTime !== undefined) {
      playTime = data.playTime;
    }
    // クエストはサーバーにあれば反映（他端末での進捗を引き継ぐ）
    if (data.quests && data.quests.length && data.quests[0].poolId) {
      activeQuests = data.quests;
      ensureActiveQuests();
      saveDailyQuests();
    }
  }

  // ===================== 管理者設定 =====================
  async function loadAdminSettings() {
    if (!authToken || currentUserId !== ADMIN_USER_ID) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/block-settings`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        adminDisabledBlocks = data.disabledBlocks || [];
        adminSafetyMode = data.safetyMode || false;
      }
    } catch(e) {}
  }

  // ★管理者アカウントには全スキンを無料で贈呈する。
  // 通常のショップ購入/ガチャを一切介さず、専用API(/api/admin/grant-all-skins)へ
  // 「今このフロントエンドが把握している全スキンID」を送って、まとめて所持済みにする。
  async function grantAllSkinsIfAdmin() {
    if (!authToken || currentUserId !== ADMIN_USER_ID) return;
    try {
      const allSkinIds = SKINS.map(s => s.id);
      const missing = allSkinIds.filter(id => !ownedSkins.includes(id));
      if (missing.length === 0) return; // すでに全部持っている
      const res = await fetch(`${API_BASE_URL}/api/admin/grant-all-skins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ skinIds: allSkinIds })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.skins) {
          ownedSkins = data.skins;
          saveSkinsData();
        }
      }
    } catch (e) {}
  }

  async function executeAdminCommand(cmd) {
    if (!authToken || currentUserId !== ADMIN_USER_ID) return '❌ 管理者権限がありません';
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/command`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'コマンド実行に失敗しました');
      if (cmd.startsWith('/setcoins')) {
        // /setcoins <ユーザーID> <amount> — 自分自身が対象の場合のみローカル表示を更新
        const parts = cmd.trim().split(/\s+/);
        const targetId = parts[1];
        const newCoins = parseInt(parts[2]);
        if (targetId === currentUserId && !isNaN(newCoins) && newCoins >= 0) {
          coins = newCoins; updateCoinUI(); saveCoins(coins); syncToServer();
        }
      }
      if (cmd.startsWith('/addcoins')) {
        // /addcoins <ユーザーID> <amount> — 自分自身が対象の場合のみローカル表示を更新
        const parts = cmd.trim().split(/\s+/);
        const targetId = parts[1];
        const addAmount = parseInt(parts[2]);
        if (targetId === currentUserId && !isNaN(addAmount)) {
          coins = Math.max(0, coins + addAmount); updateCoinUI(); saveCoins(coins); syncToServer();
        }
      }
      if (cmd.startsWith('/setscore')) {
        // /setscore <ユーザーID> <mode> <score> — 自分自身が対象の場合のみローカル表示を更新
        const parts = cmd.trim().split(/\s+/);
        const targetId = parts[1];
        const mode = parts[2];
        const scoreVal = parseInt(parts[3]);
        if (targetId === currentUserId && RANKING_MODES.includes(mode) && !isNaN(scoreVal) && scoreVal >= 0) {
          bestScores[mode] = scoreVal;
          if (mode === 'tetris') tetrisBest = scoreVal;
          if (isRegularMode(mode)) {
            best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
            bestValEl.textContent = best;
          } else if (currentMode === mode) {
            animateNumberTo(bestValEl, scoreVal);
          }
          saveBestScores();
          syncToServer();
        }
      }
      return data.result || '✅ コマンドを実行しました';
    } catch(e) {
      return '❌ ' + e.message;
    }
  }

  async function renderAdminPanel() {
    modalContent.dataset.mode = 'admin';
    let html = `
      <button class="ghost-btn" id="adminBackBtn" type="button" style="margin-bottom:8px;">‹ コマンド一覧に戻る</button>
      <h2 style="color:var(--gold);">🧩 ブロック出現設定</h2>
      <div class="admin-setting-item">
        <div class="label-row"><span>🧩 ブロック出現設定（オフにすると出現しなくなります）</span></div>
        <div style="max-height:200px; overflow-y:auto;">
    `;
    SHAPES.forEach((shape, idx) => {
      const isOff = adminDisabledBlocks.includes(idx);
      const {rows, cols} = shapeBounds(shape);
      const size = 24;
      html += `
        <div style="display:flex; align-items:center; gap:10px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
          <div class="block-grid-preview" style="grid-template-columns:repeat(${cols}, ${size}px); grid-template-rows:repeat(${rows}, ${size}px);">
            ${Array.from({length: rows*cols}, (_, i) => {
              const r = Math.floor(i/cols), c = i%cols;
              const filled = shape.some(([sr,sc])=>sr===r&&sc===c);
              return `<div class="block-cell ${filled?'':'empty'}"></div>`;
            }).join('')}
          </div>
          <span style="font-size:12px; color:var(--text-dim);">#${idx}</span>
          <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; color:${isOff ? 'var(--coral)' : 'var(--mint)'};">${isOff ? 'OFF' : 'ON'}</span>
            <div class="toggle-switch ${isOff ? '' : 'active'}" data-block-index="${idx}" style="cursor:pointer;">
              <div class="knob"></div>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
    modalContent.innerHTML = html;

    document.getElementById('adminBackBtn').addEventListener('click', () => { if (window.AdminUI) window.AdminUI.open(); });

    document.querySelectorAll('.toggle-switch[data-block-index]').forEach(el => {
      el.addEventListener('click', async function() {
        const idx = parseInt(this.dataset.blockIndex, 10);
        const currentOff = adminDisabledBlocks.includes(idx);
        const enabled = currentOff;
        try {
          const res = await fetch(`${API_BASE_URL}/api/admin/block-toggle`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
            body: JSON.stringify({ blockIndex: idx, enabled })
          });
          if (res.ok) {
            const data = await res.json();
            adminDisabledBlocks = data.settings.disabledBlocks || [];
            // パネル全体を再描画せず、このスイッチだけを更新することでスクロール位置を保持する
            const isOff = adminDisabledBlocks.includes(idx);
            this.classList.toggle('active', !isOff);
            const labelSpan = this.parentElement.querySelector('span');
            if (labelSpan) {
              labelSpan.textContent = isOff ? 'OFF' : 'ON';
              labelSpan.style.color = isOff ? 'var(--coral)' : 'var(--mint)';
            }
          }
        } catch(e) {}
      });
    });
  }

  adminPanelBtn.addEventListener('click', () => {
    if (currentUserId !== ADMIN_USER_ID) return;
    if (window.AdminUI) window.AdminUI.open();                 // 🔧 新しいコマンド選択UI(admin.js)
    else { renderAdminPanel(); modalOverlay.classList.add('show'); }
  });

  // ===================== ランキング =====================
  async function renderRankingModal() {
    modalContent.dataset.mode = 'ranking';
    let html = `
      <h2 style="color:var(--gold);">🏆 ランキング</h2>
      <div class="sub">8×8サイズのスコアのみランキング対象です。</div>
      <div class="tab-row" style="margin-bottom:6px;">
        ${RANKING_TYPES.map(t => `
          <button class="tab-btn ${currentRankingType === t ? 'active' : ''}" data-rtype="${t}">${RANKING_TYPE_LABELS[t]}</button>
        `).join('')}
      </div>
      <div class="tab-row" id="modeTabs" style="margin-bottom:10px; ${currentRankingType === 'score' ? '' : 'display:none;'}">
        ${RANKING_MODES.map(m => `
          <button class="tab-btn ${currentRankingMode === m ? 'active' : ''}" data-rmode="${m}">${RANKING_MODE_LABELS[m]}</button>
        `).join('')}
      </div>
      <div id="rankingContent">
        <div class="sub">🔄 読み込み中...</div>
      </div>
    `;
    modalContent.innerHTML = html;

    modalContent.querySelectorAll('.tab-btn[data-rtype]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentRankingType = btn.dataset.rtype;
        renderRankingModal();
      });
    });
    modalContent.querySelectorAll('.tab-btn[data-rmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentRankingMode = btn.dataset.rmode;
        renderRankingModal();
      });
    });

    // 読み込み関数
    // ⚡ 速くした点: ①前回の結果をすぐ表示してから裏で更新 ②自分の値はサーバーが一緒に返す(以前は /api/sync を続けてもう1回呼んでいた)
    //                 ③モーダルが閉じられたら定期更新を止める
    const rankKey = `${currentRankingType}:${currentRankingMode}`;
    function drawRanking(data) {
      let content = `<div style="text-align:left; max-height:380px; overflow-y:auto;">`;
      if (data.top && data.top.length > 0) {
        data.top.forEach((user, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index+1}.`;
          const isMe = user.id === currentUserId;
          const valueLabel = currentRankingType === 'coins' ? `${user.value}コイン` :
                            currentRankingType === 'playtime' ? `${user.value}秒` :
                            `${user.value}点`;
          content += `
            <div style="display:flex; justify-content:space-between; gap:8px; padding:8px 4px; border-bottom:1px solid rgba(255,255,255,0.05); ${isMe ? 'background:rgba(255,217,61,0.15); border-radius:8px;' : ''}">
              <span style="font-weight:700; min-width:0; ${isMe ? 'color:var(--gold);' : ''}">${medal} ${whoHtml(user)} ${isMe ? '👈' : ''}${titleTag(user.title)}</span>
              <span style="color:var(--gold); font-weight:800; flex-shrink:0;">${valueLabel}</span>
            </div>
          `;
        });
      } else {
        const msg = currentRankingType === 'score' ? 'このモードのランキングデータがまだありません。' :
                   currentRankingType === 'coins' ? 'まだコインデータがありません。' :
                   'プレイ時間データがまだありません。';
        content += `<div class="sub">${msg}</div>`;
      }
      content += `</div>`;

      if (authToken && currentUserId) {
        const myValue = Number(data.me || 0);
        if (myValue > 0) {
          const higherCount = data.top ? data.top.filter(u => u.value > myValue).length : 0;
          const myInTop = data.top ? data.top.some(u => u.id === currentUserId) : false;
          let rankDisplay = myInTop ? `${data.top.findIndex(u => u.id === currentUserId) + 1}位` :
                           (data.top && data.top.length > 0 ? `${higherCount + 1}位以上` : '-');
          const valueLabel = currentRankingType === 'coins' ? `${myValue}コイン` :
                            currentRankingType === 'playtime' ? `${myValue}秒` :
                            `${myValue}点`;
          content += `
            <div style="margin-top:16px; padding:14px 16px; background:linear-gradient(135deg,var(--panel-light),var(--panel)); border-radius:14px; border:2px solid var(--gold); display:flex; justify-content:space-between; align-items:center; position:sticky; bottom:0; backdrop-filter:blur(8px);">
              <span style="font-weight:700; color:var(--gold);">👤 ${escapeHtml(myName())} の順位</span>
              <span style="font-weight:800; font-size:20px; color:var(--gold);">
                ${rankDisplay}
                <span style="font-size:14px; color:var(--text-dim); font-weight:400; margin-left:8px;">${valueLabel}</span>
              </span>
            </div>
          `;
        } else {
          const msg = currentRankingType === 'score' ? 'まだこのモードのスコアがありません。' :
                     currentRankingType === 'coins' ? 'まだコインがありません。' :
                     'プレイ時間が記録されていません。';
          content += `
            <div style="margin-top:16px; padding:14px 16px; background:var(--panel-light); border-radius:14px; text-align:center; color:var(--text-dim);">
              📊 ${msg}
            </div>
          `;
        }
      } else {
        content += `
          <div style="margin-top:16px; padding:14px 16px; background:var(--panel-light); border-radius:14px; text-align:center; color:var(--text-dim);">
            🔐 ログインすると自分の順位が表示されます
          </div>
        `;
      }
      const box = document.getElementById('rankingContent');
      if (!box) return;
      const list = box.firstElementChild, keep = list ? list.scrollTop : 0;   // 更新しても、見ていた位置を動かさない
      box.innerHTML = content;
      if (keep && box.firstElementChild) box.firstElementChild.scrollTop = keep;
    }
    async function loadRanking(first) {
      // 別の画面に移っていたら更新しない(止め忘れによる無駄な通信を防ぐ)。最初の1回は、画面がこれから出るので判定しない
      if (!first && (!modalOverlay.classList.contains('show') || modalContent.dataset.mode !== 'ranking')) {
        if (rankingPollInterval) { clearInterval(rankingPollInterval); rankingPollInterval = null; }
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/api/ranking?mode=${currentRankingMode}&type=${currentRankingType}`,
          { headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {} });
        if (!res.ok) throw new Error('ranking');
        const data = await res.json();
        rankingCache[rankKey] = data;
        if (document.getElementById('rankingContent') && modalContent.dataset.mode === 'ranking'
            && rankKey === `${currentRankingType}:${currentRankingMode}`) drawRanking(data);
      } catch(err) {
        if (!rankingCache[rankKey]) {
          const box = document.getElementById('rankingContent');
          if (box) box.innerHTML = `<div class="sub" style="color:var(--coral);">❌ ランキングの読み込みに失敗しました</div>`;
        }
      }
    }

    if (rankingCache[rankKey]) drawRanking(rankingCache[rankKey]);   // 前回の結果をまず表示
    loadRanking(true);   // await しない: 画面は先に出ていて、結果が来たら差し替わる

    // ポーリング開始（既存のものをクリア）。画面を見ていないときは問い合わせない
    if (rankingPollInterval) clearInterval(rankingPollInterval);
    rankingPollInterval = setInterval(() => { if (!document.hidden) loadRanking(); }, 8000);
  }

  rankingBtn.addEventListener('click', () => {
    renderRankingModal();
    modalOverlay.classList.add('show');
  });

  // ===================== チャット =====================
  let chatMessages = [];
  let chatPollingInterval = null;
  let chatLastSeenId = 0;
  let chatUnreadCount = 0;
  let chatMentionCount = 0;
  let myTitle = null;   // 自分が付けている称号(titles.js が更新する)

  // 🏷 名前の横に出す称号(サーバーが {n:名前, r:レアリティ} で返す)
  function titleTag(t) {
    return t && t.n ? ` <span class="ttl r-${String(t.r).replace(/[^a-z]/g,'')}">${escapeHtml(t.n)}</span>` : '';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeRegExp(str){
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightMentions(text){
    const esc = escapeHtml(text);
    if(!currentUserId) return esc;
    const re = new RegExp('@' + escapeRegExp(currentUserId) + '(?!\\w)', 'gi');
    return esc.replace(re, m => `<span class="mention-tag">${m}</span>`);
  }

  function updateChatBadge(){
    if(chatMentionCount > 0){
      chatMentionBadge.textContent = chatMentionCount > 99 ? '99+' : chatMentionCount;
      chatMentionBadge.classList.add('show');
      chatDot.classList.remove('show');
    } else if(chatUnreadCount > 0){
      chatMentionBadge.classList.remove('show');
      chatDot.classList.add('show');
    } else {
      chatMentionBadge.classList.remove('show');
      chatDot.classList.remove('show');
    }
  }

  // モーダルを開かず裏側で新着とメンションだけチェックする軽量ポーリング
  async function pollChatUnread(){
    if (document.hidden) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/messages`);
      if(!res.ok) return;
      const data = await res.json();
      if(!data.length) return;
      const maxId = Math.max(...data.map(m => m.id));
      if(chatLastSeenId === 0){ chatLastSeenId = maxId; return; } // 初回は既読扱い
      const isOpen = modalOverlay.classList.contains('show') && modalContent.dataset.mode === 'chat';
      if(isOpen){ chatLastSeenId = maxId; return; } // 開いている間は既読扱い
      const newOnes = data.filter(m => m.id > chatLastSeenId && m.user_id !== currentUserId);
      if(newOnes.length){
        chatUnreadCount += newOnes.length;
        if(currentUserId){
          const re = new RegExp('@' + escapeRegExp(currentUserId) + '(?!\\w)', 'i');
          chatMentionCount += newOnes.filter(m => re.test(m.message)).length;
        }
        updateChatBadge();
      }
      chatLastSeenId = maxId;
    } catch(err) { /* 無視 */ }
  }

  // 中身が変わっていないときは再描画しない(3秒ごとの無駄な描画を省く)
  function chatSig(list){ return list.map(m => `${m.id}${m.edited?'e':''}${m.deleted?'d':''}${m.title?m.title.id:''}${m.name||''}${m.icon||''}${m.lv||''}${m.image_id||''}`).join(','); }
  async function fetchChatMessages() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/messages`);
      if (!res.ok) return;
      const data = await res.json();
      if(!Array.isArray(data)) return;
      const changed = chatSig(data) !== chatSig(chatMessages) || data.some((m,i)=> chatMessages[i] && chatMessages[i].message !== m.message);
      chatMessages = data; rememberNames(data.map(m=>({ id:m.user_id, name:m.name, icon:m.icon, lv:m.lv })));
      if(data.length) chatLastSeenId = Math.max(...data.map(m => m.id));
      if (changed || !document.querySelector('#chatMessages .chat-item')) renderChatMessages();
    } catch (err) {
      console.warn('チャット取得失敗:', err);
    }
  }

  async function sendChatMessage(message, imageId) {
    if (!authToken) {
      alert('ログインが必要です');
      return false;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ message, imageId: imageId || undefined })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '送信失敗');
      }
      // 送ったメッセージはサーバーの返事をそのまま画面に足す(全件の取り直しを待たない)。みんなの分は裏で更新
      const sent = await res.json();
      if (sent && sent.id && !chatMessages.some(m => m.id === sent.id)) {
        chatMessages = [...chatMessages, { ...sent, edited:false, deleted:false, title: myTitle || null }].slice(-50);
        chatLastSeenId = Math.max(chatLastSeenId, sent.id);
        const box = document.getElementById('chatMessages'); if (box) stickyScroll(box).on = true;      // 自分が送ったら、いちばん下へ
        renderChatMessages();
      }
      fetchChatMessages();
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  async function showProfile(userId) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/profile/${userId}`);
      if (!res.ok) throw new Error('ユーザーが見つかりません');
      const data = await res.json();
      modalContent.dataset.mode = 'profile';
      const isFriend = friendsList.some(f => f.id === data.userId);
      const isSelf = data.userId === currentUserId;
      modalContent.innerHTML = `
        <div style="text-align:center;">${avatarHtml(data.icon, data.name, data.userId, 72, true)}</div>
        <h2 style="color:var(--gold); margin-top:6px;">${nameOf(data.name, data.userId)} ${lvTag(data.lv)}</h2>
        ${data.name && data.name !== data.userId ? `<div class="sub" style="text-align:center; margin:-6px 0 6px;">ID: ${escapeHtml(data.userId)}</div>` : ''}
        ${data.title ? `<div style="text-align:center; margin:-4px 0 6px;">${titleTag(data.title)}</div>` : ''}
        <div style="text-align:left; padding:8px 0;">
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="color:var(--text-dim);">🏆 ベストスコア</span>
            <span style="color:var(--gold); font-weight:800;">${data.bestScore}点</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="color:var(--text-dim);">🪙 コイン</span>
            <span style="color:var(--gold); font-weight:800;">${data.coins}コイン</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="color:var(--text-dim);">⏱️ プレイ時間</span>
            <span style="color:var(--gold); font-weight:800;">${data.playTime}秒</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 0;">
            <span style="color:var(--text-dim);">📅 登録日</span>
            <span style="color:var(--text-dim);">${new Date(data.joinedAt).toLocaleDateString('ja-JP')}</span>
          </div>
        </div>
        ${!isSelf && authToken ? (isFriend
          ? `<button class="primary-btn" id="profileDmBtn">💬 DMを送る</button>`
          : `<button class="primary-btn" id="profileAddFriendBtn">➕ フレンド申請</button>`) : ''}
        <button class="ghost-btn" onclick="closeModal()">閉じる</button>
      `;
      modalOverlay.classList.add('show');
      const dmBtn = document.getElementById('profileDmBtn');
      if(dmBtn) dmBtn.addEventListener('click', () => openDMThread(data.userId));
      const addBtn = document.getElementById('profileAddFriendBtn');
      if(addBtn) addBtn.addEventListener('click', () => sendFriendRequest(data.userId));
    } catch (err) {
      alert(err.message);
    }
  }

  // ---------- ✏️ メッセージの編集・送信取り消し(サーバーチャット / DM 共通の部品) ----------
  async function authPost(path, body){
    const res = await fetch(`${API_BASE_URL}${path}`, { method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` }, body: JSON.stringify(body) });
    const d = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(d.error || '失敗しました');
    return d;
  }
  // ---------- 📜 チャット共通の部品 ----------
  // 一覧を「変わったところだけ」差し替える(全部作り直さない → 画像が読み直されない・ちらつかない・スクロールが動かない)
  function patchList(container, items, keyFn, sigFn, htmlFn){
    const old = new Map();
    Array.from(container.children).forEach(ch=>{ if(ch.dataset && ch.dataset.k !== undefined) old.set(ch.dataset.k, ch); else ch.remove(); });
    let prev = null;
    items.forEach(it=>{
      const k = String(keyFn(it)), sig = sigFn(it);
      let el = old.get(k);
      if(el && el.dataset.sig === sig){ old.delete(k); }
      else {
        const t = document.createElement('div'); t.innerHTML = htmlFn(it).trim();
        const n = t.firstElementChild; n.dataset.k = k; n.dataset.sig = sig;
        if(el){ old.delete(k); el.replaceWith(n); }
        el = n;
      }
      const want = prev ? prev.nextSibling : container.firstChild;
      if(el !== want) container.insertBefore(el, want);
      prev = el;
    });
    old.forEach(el=> el.remove());
  }
  // 「いちばん下を見ているか」を覚えておく。下を見ているときだけ、新着や画像の読み込みのあとも下に留まる(上を読んでいるときは動かさない)
  function stickyScroll(container){
    if(container._stick) return container._stick;
    const st = { on:true, bottom(){ container.scrollTop = container.scrollHeight; } };
    container.addEventListener('scroll', ()=>{ st.on = container.scrollHeight - container.scrollTop - container.clientHeight < 80; }, { passive:true });
    container.addEventListener('load', ()=>{ if(st.on) st.bottom(); }, true);
    container._stick = st; return st;
  }
  function afterPatch(container, wasOn){ if(!wasOn) return; const st = stickyScroll(container); st.bottom(); requestAnimationFrame(st.bottom); }
  // 古い部品(他で使っていなければ使われません)
  function keepScroll(container, render){
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    const prev = container.scrollTop;
    render();
    container.scrollTop = nearBottom ? container.scrollHeight : prev;
  }
  const chatImageHtml = (m)=> (m.image_id && !m.deleted) ? `<div class="chat-img-wrap"><img class="chat-img" data-imgid="${escapeHtml(m.image_id)}" src="${API_BASE_URL}/api/img/${escapeHtml(m.image_id)}" alt="送られた画像" loading="lazy" decoding="async"></div>` : '';
  const msgText = (m)=> m.deleted
    ? `<span class="msg-retracted">🚫 メッセージが取り消されました</span>`
    : `${highlightMentions(m.message)}${m.edited ? '<span class="msg-edited">(編集済み)</span>' : ''}`;
  const msgActions = (kind, id)=> `<div class="msg-actions"><button type="button" data-${kind}act="edit" data-mid="${id}">✏️ 編集</button><button type="button" data-${kind}act="retract" data-mid="${id}">↩ 送信取り消し</button></div>`;

  let chatSelectedId = null, chatEditId = null;
  const chatItemSig = (msg)=> `${msg.id}|${msg.message}|${msg.edited?1:0}|${msg.deleted?1:0}|${msg.name||''}|${msg.icon||''}|${msg.lv||''}|${msg.title?msg.title.id:''}|${msg.image_id||''}|${currentUserId === msg.user_id && chatSelectedId === msg.id ? 1 : 0}|${currentUserId||''}`;
  function chatItemHtml(msg){
    const canAct = msg.user_id === currentUserId && !msg.deleted;
    const sel = canAct && chatSelectedId === msg.id;
    const time = new Date(msg.timestamp).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
    return `
    <div class="chat-item ${canAct ? 'mine' : ''} ${sel ? 'sel' : ''}">
      <div class="chat-line" data-mid="${msg.id}">
        ${avatarHtml(msg.icon, msg.name, msg.user_id, 40, true)}
        <div class="chat-body">
          <div class="chat-meta"><span class="chat-who" data-uid="${escapeHtml(msg.user_id)}">${nameOf(msg.name, msg.user_id)}</span>${lvTag(msg.lv)}${titleTag(msg.title)}<span class="chat-time">${time}</span></div>
          <div class="chat-text">${msgText(msg)}${chatImageHtml(msg)}</div>
        </div>
      </div>
      ${sel ? msgActions('chat', msg.id) : ''}
    </div>`;
  }
  function renderChatMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (chatMessages.length === 0) {
      container.innerHTML = `<div class="chat-empty">まだメッセージがありません。</div>`;
      return;
    }
    const sc = stickyScroll(container), wasOn = sc.on;
    patchList(container, chatMessages, m=>m.id, chatItemSig, chatItemHtml);
    afterPatch(container, wasOn);
  }
  // クリック類は、まとめて1か所で受ける(差し替えで作り直された要素でも動く)
  function bindChatClicks(container){
    container.addEventListener('click', async (e)=>{
      const t = e.target;
      const act = t.closest('[data-chatact]');
      if(act){
        e.stopPropagation();
        const id = parseInt(act.dataset.mid), m = chatMessages.find(x=>x.id === id);
        if(act.dataset.chatact === 'edit'){ startChatEdit(m); return; }
        if(!confirm('このメッセージの送信を取り消しますか？(全員の画面から消えます)')) return;
        try{ await authPost('/api/chat/retract', { id }); chatSelectedId = null; if(chatEditId === id) cancelChatEdit(); await fetchChatMessages(); }
        catch(err){ alert(err.message); }
        return;
      }
      const img = t.closest('img.chat-img');
      if(img){ e.stopPropagation(); openLightbox(img.src); return; }
      if(t.closest('.av-zoom')) return;                                 // アイコンの拡大は別の処理
      const who = t.closest('.chat-who');
      if(who){ showProfile(who.dataset.uid); return; }
      const line = t.closest('.chat-item.mine .chat-line');
      if(line){ const id = parseInt(line.dataset.mid); chatSelectedId = (chatSelectedId === id) ? null : id; renderChatMessages(); }
    });
  }
  function startChatEdit(m){
    if(!m) return;
    chatEditId = m.id; chatSelectedId = null;
    const input = document.getElementById('chatInput'), bar = document.getElementById('chatEditBar'), btn = document.getElementById('chatSendBtn');
    if(input){ input.value = m.message; input.focus(); }
    if(bar) bar.style.display = 'flex';
    if(btn) btn.textContent = '保存';
    renderChatMessages();
  }
  function cancelChatEdit(){
    chatEditId = null;
    const input = document.getElementById('chatInput'), bar = document.getElementById('chatEditBar'), btn = document.getElementById('chatSendBtn');
    if(input) input.value = '';
    if(bar) bar.style.display = 'none';
    if(btn) btn.textContent = '送信';
  }

  function renderChatModal() {
    modalContent.dataset.mode = 'chat';
    modalContent.innerHTML = `
      <h2 class="chat-title">💬 グローバルチャット</h2>
      <div class="chat-sub">全ユーザーと会話できます。「@ユーザーID」でメンション ・ 最新50件</div>
      <div id="chatMessages" class="chat-scroll"><div class="chat-empty">読み込み中...</div></div>
      <div id="chatEditBar" class="edit-bar" style="display:none;"><span>✏️ メッセージを編集中</span><button type="button" id="chatEditCancel">キャンセル</button></div>
      <div id="chatImgPreview" class="chat-img-preview" style="display:none;"><img alt=""><span></span><button type="button" id="chatImgRemove" aria-label="画像を外す">✕</button></div>
      <div class="chat-inputrow">
        <button type="button" class="chat-attach" id="chatImgBtn" aria-label="画像を添付" title="画像を添付">📷</button>
        <input type="file" id="chatImgFile" accept="image/*" hidden>
        <input type="text" id="chatInput" class="chat-input" placeholder="メッセージを入力...(@IDでメンション)" enterkeyhint="send" autocomplete="off">
        <button class="primary-btn chat-send" id="chatSendBtn" type="button">送信</button>
      </div>
    `;
    modalOverlay.classList.add('show');

    // 開いたので未読・メンションバッジをリセット
    chatUnreadCount = 0; chatMentionCount = 0; updateChatBadge();

    bindChatClicks(document.getElementById('chatMessages'));
    fetchChatMessages();

    chatEditId = null; chatSelectedId = null;
    document.getElementById('chatEditCancel').addEventListener('click', cancelChatEdit);
    // 📷 画像の添付(選んだ画像は、ここで小さく圧縮してから送る)
    let chatImgBlob = null;
    const prevBox = document.getElementById('chatImgPreview');
    const clearChatImg = ()=>{ chatImgBlob = null; prevBox.style.display = 'none'; const im = prevBox.querySelector('img'); if(im.src.startsWith('blob:')) URL.revokeObjectURL(im.src); im.removeAttribute('src'); document.getElementById('chatImgFile').value = ''; };
    document.getElementById('chatImgBtn').addEventListener('click', ()=>{ if(!authToken){ alert('ログインが必要です'); return; } document.getElementById('chatImgFile').click(); });
    document.getElementById('chatImgRemove').addEventListener('click', clearChatImg);
    document.getElementById('chatImgFile').addEventListener('change', async (e)=>{
      const f = e.target.files[0]; if(!f) return;
      if(!/^image\//.test(f.type || '')){ alert('画像ファイルを選んでください'); clearChatImg(); return; }
      chatImgBlob = f;                                     // 圧縮は、送るときに「imgBB につながらなかった場合だけ」行う
      prevBox.style.display = 'flex';
      const im = prevBox.querySelector('img'); im.src = URL.createObjectURL(f);
      prevBox.querySelector('span').textContent = `${f.size >= 1e6 ? (f.size / 1e6).toFixed(1) + 'MB' : Math.ceil(f.size / 1000) + 'KB'} の画像(送信すると3日間だけ保存されます)`;
    });
    document.getElementById('chatSendBtn').addEventListener('click', async () => {
      const input = document.getElementById('chatInput');
      const msg = input.value.trim();
      if (!msg && !chatImgBlob) return;
      if (chatImgBlob && !chatEditId) {                    // 画像つき: 先にアップロードしてから、そのIDでメッセージを送る
        const btn = document.getElementById('chatSendBtn'); btn.disabled = true;
        try{
          const ud = await uploadImageSmart('chat', chatImgBlob, (t)=>{ prevBox.querySelector('span').textContent = t; }, { maxEdge:800, maxBytes:70000 });
          input.value = '';
          const ok = await sendChatMessage(msg, ud.id);
          if(ok) clearChatImg(); else if(!input.value) input.value = msg;
        }catch(err){ alert(err.message); }
        btn.disabled = false; return;
      }
      if (chatEditId) {                                     // ✏️ 編集の保存
        try { await authPost('/api/chat/edit', { id: chatEditId, message: msg }); cancelChatEdit(); await fetchChatMessages(); }
        catch (err) { alert(err.message); }
        return;
      }
      input.value = '';                       // 先に入力欄を空に(送信の返事を待たずに次を打てる)
      const sentOk = await sendChatMessage(msg);
      if (!sentOk && !input.value) input.value = msg;
    });

    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        document.getElementById('chatSendBtn').click();
      }
    });

    if (chatPollingInterval) clearInterval(chatPollingInterval);
    chatPollingInterval = setInterval(() => { if (!document.hidden) fetchChatMessages(); }, 3000);
  }

  chatBtn.addEventListener('click', () => {
    renderChatModal();
    // モーダルが閉じられたらポーリング停止
    const observer = new MutationObserver(() => {
      if (!modalOverlay.classList.contains('show')) {
        if (chatPollingInterval) {
          clearInterval(chatPollingInterval);
          chatPollingInterval = null;
        }
      }
    });
    observer.observe(modalOverlay, { attributes: true, attributeFilter: ['class'] });
  });

  // ===================== 🆕 フレンド・DM =====================
  let friendsList = [];
  let incomingRequests = [];
  let outgoingRequests = [];
  let dmThreadWith = null;
  let dmPollingInterval = null;
  let dmUnreadTotal = 0;
  let dmMentionCount = 0;
  let dmPerFriendUnread = {};
  let friendsBgPollInterval = null;
  let chatBgPollInterval = null;
  let duelsList = [];
  let currentDuelId = null;

  function startBackgroundPolling(){
    stopBackgroundPolling();
    fetchSocialSummary();
    friendsBgPollInterval = setInterval(() => { if (!document.hidden) fetchSocialSummary(); }, 12000);
    chatBgPollInterval = setInterval(pollChatUnread, 10000);
  }

  function stopBackgroundPolling(){
    if (friendsBgPollInterval) { clearInterval(friendsBgPollInterval); friendsBgPollInterval = null; }
    if (chatBgPollInterval) { clearInterval(chatBgPollInterval); chatBgPollInterval = null; }
  }

  function updateFriendsBadge(){
    if (dmMentionCount > 0) {
      friendsMentionBadge.textContent = dmMentionCount > 99 ? '99+' : dmMentionCount;
      friendsMentionBadge.classList.add('show');
      friendsDot.classList.remove('show');
    } else if (dmUnreadTotal > 0 || incomingRequests.length > 0) {
      friendsMentionBadge.classList.remove('show');
      friendsDot.classList.add('show');
    } else {
      friendsMentionBadge.classList.remove('show');
      friendsDot.classList.remove('show');
    }
  }

  // フレンド一覧・リクエスト・DM未読を、1回の通信でまとめて取る(以前は2回に分けていた)
  let socialLoaded = false;
  async function fetchSocialSummary(){
    if (!authToken) return false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/summary`, { headers: { 'Authorization': `Bearer ${authToken}` } });
      if (!res.ok) return false;
      const data = await res.json();
      friendsList = data.friends || [];
      incomingRequests = data.incoming || [];
      outgoingRequests = data.outgoing || [];
      rememberNames(friendsList); rememberNames(incomingRequests); rememberNames(outgoingRequests);
      const dm = data.dm || {};
      dmUnreadTotal = dm.total || 0; dmMentionCount = dm.mentions || 0; dmPerFriendUnread = dm.perFriend || {};
      socialLoaded = true;
      updateFriendsBadge();
      return true;
    } catch (err) { return false; }
  }

  async function fetchFriendsData(){
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/list`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      friendsList = data.friends || [];
      incomingRequests = data.incoming || [];
      outgoingRequests = data.outgoing || [];
      rememberNames(friendsList); rememberNames(incomingRequests); rememberNames(outgoingRequests);
      updateFriendsBadge();
    } catch (err) { /* 無視 */ }
  }

  async function fetchDMUnreadSummary(){
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dm/unread-summary`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      dmUnreadTotal = data.total || 0;
      dmMentionCount = data.mentions || 0;
      dmPerFriendUnread = data.perFriend || {};
      updateFriendsBadge();
    } catch (err) { /* 無視 */ }
  }

  // ===================== 🔍 フレンドをさがす(v3.9) =====================
  // ID でも表示名でも探せる。同じ表示名の人は全員出す。ID が完全一致した人は、いちばん上。入力なしなら、最近ログインした順の一覧
  function bindFriendFinder(){
    const input = document.getElementById('friendAddInput'), list = document.getElementById('friendSearchList');
    if(!input || !list) return;
    let seq = 0, timer = null, offset = 0, q = '';
    const rowHtml = (u)=>{
      const act = u.friend ? `<span class="fs-state">✔ フレンド</span>`
        : u.requested ? `<span class="fs-state">申請ずみ</span>`
        : u.incoming ? `<button class="fbtn ok" data-fsaccept="${escapeHtml(u.id)}" type="button">承認</button>`
        : `<button class="fbtn ok" data-fsreq="${escapeHtml(u.id)}" type="button">申請</button>`;
      return `<div class="fs-row"><span class="fs-who" data-showprofile="${escapeHtml(u.id)}">${whoHtml(u, 'id', 30)}<small class="fid">@${escapeHtml(u.id)}</small></span>${act}</div>`;
    };
    async function load(reset){
      const my = ++seq;
      if(reset){ offset = 0; list.innerHTML = '<div class="empty-hint">読み込み中...</div>'; }
      list.hidden = false;
      try{
        const r = await fetch(`${API_BASE_URL}/api/users/search?q=${encodeURIComponent(q)}&offset=${offset}`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
        const d = await r.json();
        if(my !== seq) return;
        if(!r.ok) throw new Error(d.error || '読み込みに失敗しました');
        rememberNames(d.users);
        if(reset) list.innerHTML = '';
        list.querySelectorAll('.fs-more').forEach(e=> e.remove());
        if(!d.users.length && reset){ list.innerHTML = '<div class="empty-hint">該当するユーザーがいません</div>'; return; }
        if(reset) list.insertAdjacentHTML('beforeend', `<div class="fs-head">${q ? `「${escapeHtml(q)}」の検索結果` : 'ユーザー一覧(最近ログインした順)'}</div>`);
        list.insertAdjacentHTML('beforeend', d.users.map(rowHtml).join(''));
        offset += d.users.length;
        if(d.more) list.insertAdjacentHTML('beforeend', '<button class="fs-more fbtn" type="button">もっと見る</button>');
      }catch(err){ if(my === seq) list.innerHTML = `<div class="empty-hint">${escapeHtml(err.message)}</div>`; }
    }
    input.addEventListener('focus', ()=>{ if(list.hidden) load(true); });
    input.addEventListener('input', ()=>{ clearTimeout(timer); timer = setTimeout(()=>{ q = input.value.trim(); load(true); }, 250); });
    list.addEventListener('click', async (e)=>{
      const more = e.target.closest('.fs-more'); if(more){ load(false); return; }
      const req = e.target.closest('[data-fsreq]');
      if(req){
        req.disabled = true; req.textContent = '...';
        try{
          const r = await fetch(`${API_BASE_URL}/api/friends/request`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` }, body: JSON.stringify({ toId: req.dataset.fsreq }) });
          const d = await r.json(); if(!r.ok) throw new Error(d.error || '申請に失敗しました');
          req.outerHTML = `<span class="fs-state">${d.autoAccepted ? '✔ フレンドになりました！' : '申請しました'}</span>`;
          fetchFriendsData();
        }catch(err){ alert(err.message); req.disabled = false; req.textContent = '申請'; }
        return;
      }
      const acc = e.target.closest('[data-fsaccept]');
      if(acc){ await respondFriendRequest(acc.dataset.fsaccept, 'accept'); }
    });
  }

  // ===================== 🎁 フレンドにギフト(v3.9) =====================
  function openPlayerGift(friendId){
    if(!authToken){ alert('ログインが必要です'); return; }
    const c = cardOf(friendId);
    const ov = document.createElement('div'); ov.className = 'pg-overlay';
    ov.innerHTML = `<div class="pg-card" role="dialog" aria-modal="true">
      <div class="pg-title">🎁 ${whoHtml(c, 'id', 28)} にギフト</div>
      <div class="pg-sub">コインを贈れます(あなたのコインから引かれます)。<br>1回 最大 10,000 ／ 24時間で 10回・合計 30,000 まで。</div>
      <div class="pg-quick">${[100, 500, 1000, 5000].map(n=>`<button type="button" class="fbtn" data-q="${n}">${n.toLocaleString()}</button>`).join('')}</div>
      <input type="number" id="pgCoins" class="fs-input" min="1" max="10000" inputmode="numeric" placeholder="コインの数" value="500">
      <input type="text" id="pgMsg" class="fs-input" maxlength="100" placeholder="メッセージ(任意)">
      <div class="pg-err" id="pgErr" hidden></div>
      <div class="pg-btns"><button type="button" class="fbtn" id="pgCancel">キャンセル</button><button type="button" class="primary-btn" id="pgSend">贈る</button></div></div>`;
    document.body.appendChild(ov);
    const q = (id)=> ov.querySelector(id);
    const close = ()=> ov.remove();
    ov.addEventListener('click', (e)=>{ if(e.target === ov) close(); });
    q('#pgCancel').addEventListener('click', close);
    ov.querySelectorAll('[data-q]').forEach(b=> b.addEventListener('click', ()=>{ q('#pgCoins').value = b.dataset.q; }));
    q('#pgSend').addEventListener('click', async ()=>{
      const n = parseInt(q('#pgCoins').value, 10), err = q('#pgErr');
      if(!(n >= 1)){ err.textContent = 'コインの数を入れてください'; err.hidden = false; return; }
      if(!confirm(`${c.name || friendId} さんに 🪙${n.toLocaleString()} を贈ります。よろしいですか？`)) return;
      const btn = q('#pgSend'); btn.disabled = true; btn.textContent = '送信中...'; err.hidden = true;
      try{
        const d = await authPost('/api/gifts/send', { to: friendId, coins: n, message: q('#pgMsg').value.trim() });
        if(d.coins != null){ coins = d.coins; updateCoinUI(); }
        close(); showEventToast(`🎁 ${c.name || friendId} さんに 🪙${n.toLocaleString()} を贈りました！`);
      }catch(e){ err.textContent = e.message || '贈れませんでした'; err.hidden = false; btn.disabled = false; btn.textContent = '贈る'; }
    });
  }

  async function sendFriendRequest(toId){
    if (!authToken) { alert('ログインが必要です'); return; }
    if (!toId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ toId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '申請に失敗しました');
      await fetchFriendsData();
      if (modalContent.dataset.mode === 'friends') renderFriendsModal('requests');
      else if (modalContent.dataset.mode === 'profile') alert('フレンド申請を送りました！');
    } catch (err) { alert(err.message); }
  }

  async function respondFriendRequest(fromId, action){
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ fromId, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '処理に失敗しました');
      await fetchFriendsData();
      renderFriendsModal('requests');
    } catch (err) { alert(err.message); }
  }

  async function cancelFriendRequest(toId){
    try {
      await fetch(`${API_BASE_URL}/api/friends/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ toId })
      });
      await fetchFriendsData();
      renderFriendsModal('requests');
    } catch (err) { /* 無視 */ }
  }

  // ===================== 🆕 フレンド対決(タイムアタックで勝負) =====================
  async function fetchDuelsList(){
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/list`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      duelsList = data.duels || [];
      Object.assign(nameCache, data.names || {});
      rememberNames(Object.entries(data.cards || {}).map(([id, c])=>({ id, name:c.name, icon:c.icon, lv:c.lv })));
    } catch (err) { /* 無視 */ }
  }

  async function challengeFriend(opponentId, game){
    if (!authToken) { alert('ログインが必要です'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ opponentId, game: game || 'candy' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '対決の申し込みに失敗しました');
      await fetchDuelsList();
      renderFriendsModal('duels');
    } catch (err) { alert(err.message); }
  }

  async function respondDuel(duelId, accept){
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/${duelId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ accept })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '処理に失敗しました');
      await fetchDuelsList();
      renderFriendsModal('duels');
    } catch (err) { alert(err.message); }
  }

  function playDuel(duel){
    currentDuelId = duel.id;
    closeModal();
    if(duel.game === 'tetris'){
      // テトリス対決: 2分間のウルトラ。スコアが高い方が勝ち
      if(currentMode==='timeattack') stopTimeAttackTimer();
      hideTitleScreen();
      tetrisDuelPending = true;
      if(currentMode==='tetris') exitTetrisMode();
      enterTetrisMode();
      return;
    }
    startTimeAttackMode();
  }

  async function submitDuelScore(duelId, finalScore){
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/${duelId}/submit-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ score: finalScore })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.duel;
    } catch (err) { return null; }
  }

  function duelResultText(duel, asHtml){
    const isChallenger = duel.challenger_id === currentUserId;
    const myScore = isChallenger ? duel.challenger_score : duel.opponent_score;
    const oppScore = isChallenger ? duel.opponent_score : duel.challenger_score;
    const oppKey = isChallenger ? duel.opponent_id : duel.challenger_id;
    const oppId = asHtml ? whoById(oppKey, 22) : (nameCache[oppKey] || oppKey || '');
    if (duel.status !== 'completed') return `対 ${oppId}：相手の結果を待っています…`;
    if (myScore > oppScore) return `🏆 対 ${oppId} に勝利！（自分 ${myScore} - 相手 ${oppScore}）🪙+200コイン獲得！`;
    if (myScore < oppScore) return `😢 対 ${oppId} に敗北…（自分 ${myScore} - 相手 ${oppScore}）`;
    return `🤝 対 ${oppId} と引き分け（${myScore} - ${oppScore}）🪙+50コイン獲得！`;
  }

  async function removeFriendFn(friendId){
    if (!confirm(`${nameCache[friendId] || friendId} をフレンドから削除しますか？\nDMの履歴は残りますが、再度フレンドになるまで送信できません。`)) return;
    try {
      await fetch(`${API_BASE_URL}/api/friends/remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ friendId })
      });
      await fetchFriendsData();
      renderFriendsModal('friends');
    } catch (err) { /* 無視 */ }
  }

  async function fetchDMMessages(friendId){
    try {
      const res = await fetch(`${API_BASE_URL}/api/dm/messages/${friendId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error((await res.json()).error || '取得に失敗しました');
      return await res.json();
    } catch (err) { return null; }      // 通信に失敗したときは null(今の表示を消さないため)
  }

  async function sendDM(toId, message){
    try {
      const res = await fetch(`${API_BASE_URL}/api/dm/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ toId, message })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '送信に失敗しました');
      return true;
    } catch (err) { alert(err.message); return false; }
  }

  function renderFriendsModal(tab){
    tab = tab || 'friends';
    modalContent.dataset.mode = 'friends';
    let html = `
      <h2 style="color:var(--gold);">👥 フレンド・DM</h2>
      <div class="tab-row">
        <button class="tab-btn ${tab==='friends'?'active':''}" data-ftab="friends">フレンド</button>
        <button class="tab-btn ${tab==='requests'?'active':''}" data-ftab="requests">リクエスト${incomingRequests.length?` (${incomingRequests.length})`:''}</button>
        <button class="tab-btn ${tab==='dm'?'active':''}" data-ftab="dm">DM</button>
        <button class="tab-btn ${tab==='duels'?'active':''}" data-ftab="duels">⚔️ 対決</button>
      </div>
      <div id="friendsTabBody">`;

    if (tab === 'friends') {
      html += `
        <div class="fs-box">
          <input type="search" id="friendAddInput" class="fs-input" placeholder="🔍 ID・表示名でさがして、フレンド申請" autocomplete="off" enterkeyhint="search">
          <div id="friendSearchList" class="fs-list" hidden></div>
        </div>`;
      if (friendsList.length === 0) {
        html += `<div class="empty-hint">まだフレンドがいません。上の欄をタップすると、ユーザー一覧が出ます。IDでも表示名でも探せます。</div>`;
      } else {
        friendsList.forEach(f => {
          const unread = dmPerFriendUnread[f.id] || 0;
          html += `
            <div class="friend-item">
              <span class="fname" data-showprofile="${f.id}">
                <span class="online-dot ${f.online ? 'on' : 'off'}"></span>${whoHtml(f)}${f.name && f.name !== f.id ? `<small class="fid">@${escapeHtml(f.id)}</small>` : ''}${titleTag(f.title)}${unread ? `<span class="funread">${unread}</span>` : ''}
              </span>
              <span class="fsub">${f.online ? '🟢 オンライン' : 'オフライン'}</span>
              <button class="fbtn" data-challenge="${f.id}" data-game="candy">🍬 対決</button>
              <button class="fbtn" data-challenge="${f.id}" data-game="tetris">🧱 対決</button>
              <button class="fbtn gift" data-giftfriend="${f.id}">🎁 ギフト</button>
              <button class="fbtn remove" data-removefriend="${f.id}">削除</button>
            </div>`;
        });
      }
    } else if (tab === 'duels') {
      const pendingIncoming = duelsList.filter(d => d.status==='pending' && d.opponent_id===currentUserId);
      const pendingOutgoing = duelsList.filter(d => d.status==='pending' && d.challenger_id===currentUserId);
      const playable = duelsList.filter(d => d.status==='accepted' &&
        ((d.challenger_id===currentUserId && d.challenger_score===null) || (d.opponent_id===currentUserId && d.opponent_score===null)));
      const waiting = duelsList.filter(d => d.status==='accepted' &&
        ((d.challenger_id===currentUserId && d.challenger_score!==null) || (d.opponent_id===currentUserId && d.opponent_score!==null)));
      const completed = duelsList.filter(d => d.status==='completed');
      html += `<div class="sub" style="margin-bottom:8px;">🍬 キャンディ対決=タイムアタック(${TIME_ATTACK_DURATION}秒)、🧱 テトリス対決=ウルトラ(${TETRIS_ULTRA_SECONDS}秒)。スコアが高い方の勝ち！フレンド一覧の「対決」ボタンから挑戦できます。</div>`;
      html += `<div class="qtitle" style="margin:10px 0 6px;">📥 届いている挑戦</div>`;
      html += pendingIncoming.length===0 ? `<div class="empty-hint">届いている挑戦はありません。</div>` :
        pendingIncoming.map(d=>`
          <div class="friend-item pending">
            <span class="fname">${d.game==='tetris'?'🧱':'🍬'} ${whoById(d.challenger_id)}</span>
            <button class="fbtn accept" data-duelaccept="${d.id}">受ける</button>
            <button class="fbtn decline" data-dueldecline="${d.id}">断る</button>
          </div>`).join('');
      html += `<div class="qtitle" style="margin:14px 0 6px;">🎮 プレイ可能な対決</div>`;
      html += playable.length===0 ? `<div class="empty-hint">プレイ可能な対決はありません。</div>` :
        playable.map(d=>{
          const opp = d.challenger_id===currentUserId ? d.opponent_id : d.challenger_id;
          return `
          <div class="friend-item chat">
            <span class="fname">${d.game==='tetris'?'🧱':'🍬'} 対 ${whoById(opp)}</span>
            <button class="fbtn" data-duelplay="${d.id}">プレイする</button>
          </div>`;
        }).join('');
      html += `<div class="qtitle" style="margin:14px 0 6px;">⏳ 結果待ち・送信済みの挑戦</div>`;
      const pendingAndWaiting = [...pendingOutgoing, ...waiting];
      html += pendingAndWaiting.length===0 ? `<div class="empty-hint">ありません。</div>` :
        pendingAndWaiting.map(d=>{
          const opp = d.challenger_id===currentUserId ? d.opponent_id : d.challenger_id;
          return `<div class="friend-item pending"><span class="fname">⚔️ 対 ${whoById(opp)}</span><span class="fsub">結果待ち…</span></div>`;
        }).join('');
      html += `<div class="qtitle" style="margin:14px 0 6px;">🏁 完了した対決</div>`;
      html += completed.length===0 ? `<div class="empty-hint">まだありません。</div>` :
        completed.slice(0,10).map(d=>`<div class="friend-item"><span class="fname" style="flex:1;">${duelResultText(d, true)}</span></div>`).join('');
    } else if (tab === 'requests') {
      html += `<div class="qtitle" style="margin-bottom:6px;">📥 届いている申請</div>`;
      if (incomingRequests.length === 0) {
        html += `<div class="empty-hint">届いている申請はありません。</div>`;
      } else {
        incomingRequests.forEach(r => {
          html += `
            <div class="friend-item pending">
              <span class="fname" data-showprofile="${r.id}">🔔 ${whoHtml(r)}${r.name && r.name !== r.id ? `<small class="fid">@${escapeHtml(r.id)}</small>` : ''}</span>
              <button class="fbtn accept" data-accept="${r.id}">承認</button>
              <button class="fbtn decline" data-decline="${r.id}">拒否</button>
            </div>`;
        });
      }
      html += `<div class="qtitle" style="margin:14px 0 6px;">📤 送信した申請</div>`;
      if (outgoingRequests.length === 0) {
        html += `<div class="empty-hint">送信中の申請はありません。</div>`;
      } else {
        outgoingRequests.forEach(r => {
          html += `
            <div class="friend-item pending">
              <span class="fname">📤 ${whoHtml(r)}${r.name && r.name !== r.id ? `<small class="fid">@${escapeHtml(r.id)}</small>` : ''}</span>
              <span class="fsub">承認待ち</span>
              <button class="fbtn decline" data-cancel="${r.id}">取消</button>
            </div>`;
        });
      }
    } else if (tab === 'dm') {
      if (friendsList.length === 0) {
        html += `<div class="empty-hint">DMはフレンドとのみ可能です。まずはフレンドになりましょう。</div>`;
      } else {
        friendsList.forEach(f => {
          const unread = dmPerFriendUnread[f.id] || 0;
          html += `
            <div class="friend-item chat" data-openthread="${f.id}" style="cursor:pointer;">
              <span class="fname">💬 ${whoHtml(f)}${titleTag(f.title)}${unread ? `<span class="funread">${unread}</span>` : ''}</span>
              <span class="fsub">タップして会話を開く →</span>
            </div>`;
        });
      }
    }
    html += `</div>`;
    modalContent.innerHTML = html;

    modalContent.querySelectorAll('.tab-btn[data-ftab]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.ftab === 'duels') await fetchDuelsList();
        renderFriendsModal(btn.dataset.ftab);
      });
    });
    bindFriendFinder();
    modalContent.querySelectorAll('[data-giftfriend]').forEach(el => {
      el.addEventListener('click', () => openPlayerGift(el.dataset.giftfriend));
    });
    modalContent.querySelectorAll('[data-showprofile]').forEach(el => {
      el.addEventListener('click', () => showProfile(el.dataset.showprofile));
    });
    modalContent.querySelectorAll('[data-dm]').forEach(el => {
      el.addEventListener('click', () => openDMThread(el.dataset.dm));
    });
    modalContent.querySelectorAll('[data-removefriend]').forEach(el => {
      el.addEventListener('click', () => removeFriendFn(el.dataset.removefriend));
    });
    modalContent.querySelectorAll('[data-accept]').forEach(el => {
      el.addEventListener('click', () => respondFriendRequest(el.dataset.accept, 'accept'));
    });
    modalContent.querySelectorAll('[data-decline]').forEach(el => {
      el.addEventListener('click', () => respondFriendRequest(el.dataset.decline, 'decline'));
    });
    modalContent.querySelectorAll('[data-cancel]').forEach(el => {
      el.addEventListener('click', () => cancelFriendRequest(el.dataset.cancel));
    });
    modalContent.querySelectorAll('[data-openthread]').forEach(el => {
      el.addEventListener('click', () => openDMThread(el.dataset.openthread));
    });
    modalContent.querySelectorAll('[data-challenge]').forEach(el => {
      el.addEventListener('click', () => challengeFriend(el.dataset.challenge, el.dataset.game));
    });
    modalContent.querySelectorAll('[data-duelaccept]').forEach(el => {
      el.addEventListener('click', () => respondDuel(el.dataset.duelaccept, true));
    });
    modalContent.querySelectorAll('[data-dueldecline]').forEach(el => {
      el.addEventListener('click', () => respondDuel(el.dataset.dueldecline, false));
    });
    modalContent.querySelectorAll('[data-duelplay]').forEach(el => {
      el.addEventListener('click', () => {
        const duel = duelsList.find(d => String(d.id)===el.dataset.duelplay);
        if (duel) playDuel(duel);
      });
    });
  }

  async function openDMThread(friendId){
    dmThreadWith = friendId;
    modalContent.dataset.mode = 'dmthread';
    const dmCard = cardOf(friendId);
    modalContent.innerHTML = `
      <div class="dm-thread-header">
        <button class="dm-thread-back" id="dmBackBtn">←</button>
        ${avatarHtml(dmCard.icon, dmCard.name, friendId, 40, true)}
        <div class="dm-thread-title"><b>${nameOf(dmCard.name, friendId)}${lvTag(dmCard.lv)}</b><span>💬 ダイレクトメッセージ</span></div>
      </div>
      <div id="dmMessages" class="chat-scroll"><div class="chat-empty">読み込み中...</div></div>
      <div id="dmEditBar" class="edit-bar" style="display:none;"><span>✏️ メッセージを編集中</span><button type="button" id="dmEditCancel">キャンセル</button></div>
      <div class="chat-inputrow">
        <input type="text" id="dmInput" class="chat-input" placeholder="メッセージを入力...(@IDでメンション)" enterkeyhint="send" autocomplete="off">
        <button class="primary-btn chat-send" id="dmSendBtn" type="button">送信</button>
      </div>
    `;

    let dmMsgs = [], dmSelectedId = null, dmEditId = null;
    function cancelDmEdit(){
      dmEditId = null; const input = document.getElementById('dmInput'); if(input) input.value = '';
      const bar = document.getElementById('dmEditBar'); if(bar) bar.style.display = 'none';
      const btn = document.getElementById('dmSendBtn'); if(btn) btn.textContent = '送信';
    }
    async function loadThread(){
      const msgs = await fetchDMMessages(friendId);
      const container = document.getElementById('dmMessages');
      if (!container || msgs === null) return;                 // 通信に失敗したときは、今の表示をそのまま(空にしない)
      dmMsgs = msgs;
      if (msgs.length === 0) {
        container.innerHTML = `<div class="chat-empty">まだメッセージがありません。話しかけてみましょう！</div>`;
      } else {
        const sc = stickyScroll(container), wasOn = sc.on;
        patchList(container, msgs, m=>m.id,
          m=> `${m.id}|${m.message}|${m.edited?1:0}|${m.deleted?1:0}|${m.from_id === currentUserId && dmSelectedId === m.id ? 1 : 0}`,
          m=> {
            const mine = m.from_id === currentUserId, canAct = mine && !m.deleted, sel = canAct && dmSelectedId === m.id;
            return `
            <div class="dm-bubble-row ${mine ? 'mine' : ''}">
              <div class="dm-bubble-col">
                <div class="dm-bubble ${canAct ? 'actable' : ''} ${m.deleted ? 'retracted' : ''} ${sel ? 'sel' : ''}" data-mid="${m.id}">${msgText(m)}</div>
                ${sel ? msgActions('dm', m.id) : ''}
                <div class="dm-time" style="text-align:${mine ? 'right' : 'left'};">${new Date(m.timestamp).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}</div>
              </div>
            </div>`;
          });
        afterPatch(container, wasOn);
      }
      fetchDMUnreadSummary(); // 既読になったのでバッジを更新
    }
    document.getElementById('dmMessages').addEventListener('click', async (e)=>{      // クリックは、まとめて1か所で受ける
      const btn = e.target.closest('[data-dmact]');
      if(btn){
        e.stopPropagation();
        const id = parseInt(btn.dataset.mid), m = dmMsgs.find(x=>x.id === id);
        if(btn.dataset.dmact === 'edit'){
          dmEditId = id; dmSelectedId = null;
          const input = document.getElementById('dmInput'); input.value = m.message; input.focus();
          document.getElementById('dmEditBar').style.display = 'flex'; document.getElementById('dmSendBtn').textContent = '保存';
          loadThread(); return;
        }
        if(!confirm('このメッセージの送信を取り消しますか？(相手の画面からも消えます)')) return;
        try{ await authPost('/api/dm/retract', { id }); dmSelectedId = null; if(dmEditId === id) cancelDmEdit(); await loadThread(); }
        catch(err){ alert(err.message); }
        return;
      }
      const b = e.target.closest('.dm-bubble.actable');
      if(b){ const id = parseInt(b.dataset.mid); dmSelectedId = (dmSelectedId === id) ? null : id; loadThread(); }
    });
    await loadThread();

    document.getElementById('dmSendBtn').addEventListener('click', async () => {
      const input = document.getElementById('dmInput');
      const msg = input.value.trim();
      if (!msg) return;
      if (dmEditId) {                                       // ✏️ 編集の保存
        try { await authPost('/api/dm/edit', { id: dmEditId, message: msg }); cancelDmEdit(); await loadThread(); }
        catch (err) { alert(err.message); }
        return;
      }
      const ok = await sendDM(friendId, msg);
      if (ok) { input.value = ''; stickyScroll(document.getElementById('dmMessages')).on = true; await loadThread(); }
    });
    document.getElementById('dmEditCancel').addEventListener('click', cancelDmEdit);
    document.getElementById('dmInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) document.getElementById('dmSendBtn').click();
    });
    document.getElementById('dmBackBtn').addEventListener('click', () => {
      dmThreadWith = null;
      renderFriendsModal('dm');
    });

    if (dmPollingInterval) clearInterval(dmPollingInterval);
    dmPollingInterval = setInterval(loadThread, 3000);
  }

  friendsBtn.addEventListener('click', async () => {
    if (!authToken) { alert('ログインするとフレンド・DM機能が使えます'); return; }
    // 先にモーダルを開いて「読み込み中」を見せ、通信が終わってから中身を差し替える
    // (以前は通信完了までモーダル自体が開かず、待ち時間があるように感じられていた)
    modalContent.dataset.mode = 'friends';
    modalOverlay.classList.add('show');
    // 裏の定期チェックで取得済みなら、すぐ表示する(取り直しは裏で)。まだなら「読み込み中」
    if (socialLoaded) renderFriendsModal(incomingRequests.length ? 'requests' : 'friends');
    else modalContent.innerHTML = `<h2 style="color:var(--gold);">👥 フレンド・DM</h2><div class="empty-hint">読み込み中...</div>`;
    const observer = new MutationObserver(() => {
      if (!modalOverlay.classList.contains('show')) {
        if (dmPollingInterval) { clearInterval(dmPollingInterval); dmPollingInterval = null; }
        dmThreadWith = null;
      }
    });
    observer.observe(modalOverlay, { attributes: true, attributeFilter: ['class'] });
    const sigOf = () => JSON.stringify([friendsList.map(f=>[f.id,f.name,f.online,f.title&&f.title.id]), incomingRequests.length, outgoingRequests.length, dmPerFriendUnread]);
    const before = socialLoaded ? sigOf() : null;
    await fetchSocialSummary();
    const stillHere = modalOverlay.classList.contains('show') && modalContent.dataset.mode === 'friends';
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (stillHere && (before === null || (before !== sigOf() && !typing))) {
      renderFriendsModal(incomingRequests.length ? 'requests' : 'friends');
    }
  });

  // ===================== テトリスモード =====================
  const TETRIS_COLS = 10, TETRIS_ROWS = 20;
  const TETROMINOES = {
    I: { matrix:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color:2 },
    O: { matrix:[[1,1],[1,1]], color:6 },
    T: { matrix:[[0,1,0],[1,1,1],[0,0,0]], color:3 },
    S: { matrix:[[0,1,1],[1,1,0],[0,0,0]], color:1 },
    Z: { matrix:[[1,1,0],[0,1,1],[0,0,0]], color:0 },
    J: { matrix:[[1,0,0],[1,1,1],[0,0,0]], color:4 },
    L: { matrix:[[0,0,1],[1,1,1],[0,0,0]], color:5 }
  };
  const TETROMINO_KEYS = Object.keys(TETROMINOES);
  const TETRIS_LINE_LABELS = { 1:'シングル!', 2:'ダブル!', 3:'トリプル!', 4:'テトリス!!' };
  const TETRIS_LINE_POINTS = { 1:100, 2:300, 3:500, 4:800 };

  // <SRS-PURE-BEGIN>
  // ===== SRS(スーパーローテーションシステム)のウォールキック表(時計回り) =====
  // [x(右が+), y(上が+)] のオフセット。盤面は行が下向きなので、使うときに row -= y する。
  // 回転状態 rot: 0=スポーン, 1=右(R), 2=反転, 3=左(L)。配列のindexは「今の回転状態からの時計回り」。
  const SRS_KICKS_JLSTZ = [
    [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],   // 0→R
    [[0,0],[1,0],[1,-1],[0,2],[1,2]],       // R→2
    [[0,0],[1,0],[1,1],[0,-2],[1,-2]],      // 2→L
    [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]]     // L→0
  ];
  const SRS_KICKS_I = [
    [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    [[0,0],[1,0],[-2,0],[1,-2],[-2,1]]
  ];
  // ===== Tスピン判定(3コーナールール) =====
  // Tの中心の斜め4マス(壁・床も「埋まっている」扱い)のうち3つ以上が埋まっていて、
  // 最後の操作が回転ならTスピン。向いている側の2マス(front)が両方埋まっていれば本物、
  // frontが片方だけならミニ。ただし最後の回転が5番目のキック(1×2マス動く)ならミニでも本物扱い。
  // 座標は T の3×3の箱の中の [row, col]
  const T_FRONT_CORNERS = [ [[0,0],[0,2]], [[0,2],[2,2]], [[2,0],[2,2]], [[0,0],[2,0]] ];
  const T_BACK_CORNERS  = [ [[2,0],[2,2]], [[0,0],[2,0]], [[0,0],[0,2]], [[0,2],[2,2]] ];
  function detectTSpin(isOccupied, row, col, rot, lastRotated, lastKickIndex){
    if(!lastRotated) return null;
    const count = (list) => list.reduce((n,[dr,dc]) => n + (isOccupied(row+dr, col+dc) ? 1 : 0), 0);
    const front = count(T_FRONT_CORNERS[rot]);
    const back = count(T_BACK_CORNERS[rot]);
    if(front + back < 3) return null;
    if(front === 2 || lastKickIndex === 4) return 'tspin';
    return 'mini';
  }
  // ===== 得点(すべて × レベル) =====
  const TSPIN_POINTS = {
    tspin: { 0:400, 1:800, 2:1200, 3:1600 },
    mini:  { 0:100, 1:200, 2:400,  3:1600 }
  };
  const PERFECT_CLEAR_POINTS = { 1:800, 2:1200, 3:1800, 4:2000 };
  const PERFECT_CLEAR_B2B_TETRIS = 3200;
  function perfectClearBonus(lines, b2bTetris, level){
    if(lines === 4 && b2bTetris) return PERFECT_CLEAR_B2B_TETRIS * level;
    return (PERFECT_CLEAR_POINTS[lines] || 0) * level;
  }
  // <SRS-PURE-END>
  const TSPIN_LINE_NAMES = { 1:'シングル', 2:'ダブル', 3:'トリプル' };

  let tetrisActive = false, tetrisGameOver = false;
  let tetrisGrid = null, tetrisPiece = null, tetrisNextType = null, tetrisBag = [];
  let tetrisScore = 0, tetrisLevel = 1, tetrisLines = 0, tetrisCombo = 0, tetrisBackToBack = false;
  let tetrisTimer = null, tetrisCellEls = [];
  let tetrisBest = 0;
  let tetrisHoldType = null, tetrisHoldUsed = false;
  let tetrisRunMode = 'solo';       // 今プレイ中のテトリスの種類: 'solo'|'vs'|'sprint'|'ultra'(フレンド対決は常にultra)
  let tetrisDuelPending = false;    // フレンド対決(テトリス)として開始するか
  const TETRIS_SPRINT_LINES = 40, TETRIS_ULTRA_SECONDS = 120;
  let tetrisClockStart = 0, tetrisClockTimer = null;
  let tetrisStats = { tspins:0, pcs:0, startLines:0 };       // イベント報告用(Tスピン回数・パーフェクトクリア回数)
  const TETRIS_REC_KEY = 'nexus-tetris-records-v1';
  let tetrisRecords = { sprintMs:null, ultraScore:0 };
  try{ Object.assign(tetrisRecords, JSON.parse(localStorage.getItem(TETRIS_REC_KEY) || '{}')); }catch(e){}
  function saveTetrisRecords(){ try{ localStorage.setItem(TETRIS_REC_KEY, JSON.stringify(tetrisRecords)); }catch(e){} }
  function fmtClock(ms){ const t = Math.max(0, ms), m = Math.floor(t/60000), sec = Math.floor(t%60000/1000), cs = Math.floor(t%1000/10); return `${m}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`; }
  function tetrisIsTimed(){ return tetrisRunMode==='sprint' || tetrisRunMode==='ultra'; }
  function vibrate(ms){ if(uiPrefs.vibrate && navigator.vibrate){ try{ navigator.vibrate(ms); }catch(e){} } }

  function stopTetrisClock(){ if(tetrisClockTimer){ clearInterval(tetrisClockTimer); tetrisClockTimer = null; } }
  function startTetrisClock(){
    stopTetrisClock();
    tetrisClockStart = performance.now();
    timeAttackCardEl.style.display = tetrisIsTimed() ? 'flex' : 'none';
    timeAttackCardEl.classList.remove('urgent');
    if(!tetrisIsTimed()) return;
    const tick = ()=>{
      const el = performance.now() - tetrisClockStart;
      if(tetrisRunMode==='ultra'){
        const left = TETRIS_ULTRA_SECONDS*1000 - el;
        timeAttackValEl.textContent = fmtClock(left);
        timeAttackCardEl.classList.toggle('urgent', left <= 10000);
        if(left <= 0) tetrisEndTimed('ultra');
      } else {
        timeAttackValEl.textContent = fmtClock(el);
      }
    };
    tick();
    tetrisClockTimer = setInterval(tick, 50);
  }
  let tetrisLastRotate = false, tetrisLastKick = 0; // Tスピン判定用: 最後の操作が回転か / 何番目のキックか

// ===================== 🤖 AI対戦用の状態 =====================
  let aiGrid = null, aiPiece = null, aiNextType = null, aiBag = [];
  let aiScore = 0, aiLevel = 1, aiLines = 0, aiCombo = 0, aiBackToBack = false;
  let aiActive = false, aiGameOver = false;
  let aiTimer = null, aiCellEls = [];
  let aiGravityTimer = null; // ★プレイヤーと同じ「重力落下」タイマー(難易度の思考速度とは別に動く)

  const tetrisPlayerScoreEl = document.getElementById('tetrisPlayerScore');
  const tetrisAiScoreEl = document.getElementById('tetrisAiScore');

  function rotateMatrixCW(m){
    const n = m.length;
    const res = Array.from({length:n}, ()=>Array(n).fill(0));
    for(let r=0;r<n;r++) for(let c=0;c<n;c++) res[c][n-1-r] = m[r][c];
    return res;
  }

  function pad4x4(matrix){
    const n = matrix.length;
    const res = Array.from({length:4}, ()=>Array(4).fill(0));
    const offset = Math.floor((4-n)/2);
    for(let r=0;r<n;r++) for(let c=0;c<n;c++) res[r+offset][c+offset] = matrix[r][c];
    return res;
  }

  function tetrisRandomType(){
    if(!tetrisBag || tetrisBag.length===0){
      tetrisBag = [...TETROMINO_KEYS];
      for(let i=tetrisBag.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [tetrisBag[i], tetrisBag[j]] = [tetrisBag[j], tetrisBag[i]];
      }
    }
    return tetrisBag.pop();
  }

  function tetrisCollides(matrix, row, col){
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gc<0 || gc>=TETRIS_COLS || gr>=TETRIS_ROWS) return true;
        if(gr>=0 && tetrisGrid[gr][gc] !== -1) return true;
      }
    }
    return false;
  }

  function initTetrisBoard(){
    tetrisBoardEl.innerHTML = '';
    tetrisCellEls = [];
    for(let i=0;i<TETRIS_ROWS*TETRIS_COLS;i++){
      const cell = document.createElement('div');
      cell.className = 'tetris-cell';
      tetrisBoardEl.appendChild(cell);
      tetrisCellEls.push(cell);
    }
  }

  function paintTetrisPiece(matrix, row, col, colorIdx, isGhost){
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr<0 || gr>=TETRIS_ROWS || gc<0 || gc>=TETRIS_COLS) continue;
        const cell = tetrisCellEls[gr*TETRIS_COLS+gc];
        if(isGhost){
          if(!cell.classList.contains('filled')) cell.classList.add('ghost');
        } else {
          cell.classList.add('filled');
          cell.classList.remove('ghost');
          cell.style.background = COLORS[colorIdx].bg;
        }
      }
    }
  }

  function renderTetrisNext(){
    tetrisNextEl.innerHTML = '';
    if(!tetrisNextType) return;
    const def = TETROMINOES[tetrisNextType];
    const m = pad4x4(def.matrix);
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        const cell = document.createElement('div');
        cell.className = 'tetris-next-cell';
        if(m[r][c]) cell.style.background = COLORS[def.color].bg;
        else cell.classList.add('empty');
        tetrisNextEl.appendChild(cell);
      }
    }
  }

  function renderTetrisHold(){
    tetrisHoldBoxEl.innerHTML = '';
    tetrisHoldBoxEl.classList.toggle('used', tetrisHoldUsed);
    if(!tetrisHoldType) return;
    const def = TETROMINOES[tetrisHoldType];
    const m = pad4x4(def.matrix);
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        const cell = document.createElement('div');
        cell.className = 'tetris-next-cell';
        if(m[r][c]) cell.style.background = COLORS[def.color].bg;
        else cell.classList.add('empty');
        tetrisHoldBoxEl.appendChild(cell);
      }
    }
  }

  function renderTetris(){
    for(let r=0;r<TETRIS_ROWS;r++){
      for(let c=0;c<TETRIS_COLS;c++){
        const idx = r*TETRIS_COLS+c;
        const cell = tetrisCellEls[idx];
        const val = tetrisGrid[r][c];
        cell.className = 'tetris-cell';
        cell.style.background = (val!==-1) ? COLORS[val].bg : '';
        if(val!==-1) cell.classList.add('filled');
      }
    }
    if(tetrisPiece){
      let ghostRow = tetrisPiece.row;
      while(!tetrisCollides(tetrisPiece.matrix, ghostRow+1, tetrisPiece.col)) ghostRow++;
      paintTetrisPiece(tetrisPiece.matrix, ghostRow, tetrisPiece.col, null, true);
      paintTetrisPiece(tetrisPiece.matrix, tetrisPiece.row, tetrisPiece.col, tetrisPiece.color, false);
    }
    renderTetrisNext();
    renderTetrisHold();
    tetrisLevelEl.textContent = tetrisLevel;
    tetrisLinesEl.textContent = tetrisLines;
  }

  // ★プレイヤー・AI共通の「レベルに応じた自然落下スピード」計算(以前はAI専用の別ロジックだったのを統一)
  function dropIntervalForLevel(level){
    return Math.max(90, 1000 - (level-1)*70);
  }
  function tetrisDropIntervalMs(){
    return dropIntervalForLevel(tetrisLevel);
  }
  function tetrisStopLoop(){
    if(tetrisTimer){ clearInterval(tetrisTimer); tetrisTimer = null; }
  }
  function tetrisStartLoop(){
    tetrisStopLoop();
    tetrisTimer = setInterval(tetrisTick, tetrisDropIntervalMs());
  }
  function tetrisTick(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    if(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row+1, tetrisPiece.col)){
      tetrisPiece.row++;
      tetrisLastRotate = false;
      renderTetris();
    } else {
      tetrisLockPiece();
    }
  }

  function tetrisSpawnPiece(){
    const type = tetrisNextType || tetrisRandomType();
    tetrisNextType = tetrisRandomType();
    const def = TETROMINOES[type];
    const matrix = def.matrix.map(row=>row.slice());
    const col = Math.floor((TETRIS_COLS - matrix.length)/2);
    const row = -1;
    tetrisPiece = { type, matrix, color: def.color, row, col, rot: 0 };
    tetrisLastRotate = false;
    if(tetrisCollides(matrix, row, col)){
      tetrisTriggerGameOver();
      return;
    }
    renderTetris();
    tetrisStartLoop();
  }

  function tetrisMove(dx){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    const nc = tetrisPiece.col+dx;
    if(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row, nc)){
      tetrisPiece.col = nc;
      tetrisLastRotate = false;
      renderTetris();
    }
  }

  function tetrisRotate(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece || tetrisPiece.type==='O') return;
    const p = tetrisPiece;
    const rotated = rotateMatrixCW(p.matrix);
    const table = (p.type === 'I') ? SRS_KICKS_I : SRS_KICKS_JLSTZ;
    const kicks = table[p.rot];
    for(let i=0;i<kicks.length;i++){
      const [dx, dy] = kicks[i];
      const nr = p.row - dy, nc = p.col + dx;
      if(!tetrisCollides(rotated, nr, nc)){
        p.matrix = rotated;
        p.row = nr;
        p.col = nc;
        p.rot = (p.rot + 1) % 4;
        tetrisLastRotate = true;
        tetrisLastKick = i;
        renderTetris();
        return;
      }
    }
  }

  function tetrisSoftDrop(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    if(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row+1, tetrisPiece.col)){
      tetrisPiece.row++;
      tetrisLastRotate = false;
      tetrisScore += 1;
      scoreValEl.textContent = tetrisScore;
      renderTetris();
    } else {
      tetrisLockPiece();
    }
  }

  function tetrisHardDrop(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    let dist = 0;
    while(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row+1, tetrisPiece.col)){
      tetrisPiece.row++;
      dist++;
    }
    if(dist>0){
      tetrisLastRotate = false;
      tetrisScore += dist*2;
      scoreValEl.textContent = tetrisScore;
      const tb = document.getElementById('tetrisBoard');
      if(tb){ tb.classList.remove('hd-shake'); void tb.offsetWidth; tb.classList.add('hd-shake'); }
    }
    tetrisLockPiece();
  }

  // ===================== ホールド(テトリス99のように現在のピースを保持/交換) =====================
  function tetrisHoldSwap(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece || tetrisHoldUsed) return;
    const currentType = tetrisPiece.type;
    tetrisHoldUsed = true;
    if(tetrisHoldType === null){
      tetrisHoldType = currentType;
      tetrisSpawnPiece(); // ネクストから補充(ホールドが空の場合)
    } else {
      const swapType = tetrisHoldType;
      tetrisHoldType = currentType;
      const def = TETROMINOES[swapType];
      const matrix = def.matrix.map(row=>row.slice());
      const col = Math.floor((TETRIS_COLS - matrix.length)/2);
      if(tetrisCollides(matrix, -1, col)){ tetrisTriggerGameOver(); return; }
      tetrisPiece = { type:swapType, matrix, color:def.color, row:-1, col, rot:0 };
      tetrisLastRotate = false;
      renderTetris();
      tetrisStartLoop();
    }
    renderTetrisHold();
  }

  function showTetrisCombo(msg, cls){
    tetrisComboTextEl.textContent = msg;
    tetrisComboTextEl.className = 'combo-text show' + (cls ? (' '+cls) : '');
    setTimeout(()=>{ tetrisComboTextEl.className = 'combo-text'; }, 900);
  }

  function tetrisFloatCoin(amount){
    const rect = tetrisBoardEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'coin-float';
    el.textContent = `+${amount}🪙`;
    el.style.left = (rect.left+rect.width/2-20)+'px';
    el.style.top = (rect.top+rect.height/2)+'px';
    el.style.animation = 'coinFloat 0.9s ease-out forwards';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 950);
  }

  function tetrisClearRowsAnimated(rows, cb){
    rows.forEach(r=>{
      for(let c=0;c<TETRIS_COLS;c++){
        const cell = tetrisCellEls[r*TETRIS_COLS+c];
        if(cell) cell.classList.add('clearing');
      }
    });
    setTimeout(cb, 320);
  }

  function tetrisCollapseRows(rows){
    rows.slice().sort((a,b)=>a-b).forEach(r=>{
      tetrisGrid.splice(r,1);
      tetrisGrid.unshift(new Array(TETRIS_COLS).fill(-1));
    });
  }

  function tetrisRefreshScore(){
    animateNumberTo(scoreValEl, tetrisScore);
    tetrisPlayerScoreEl.textContent = tetrisScore;
    if(tetrisScore > tetrisBest){
      tetrisBest = tetrisScore;
      bestScores.tetris = tetrisBest;
      saveBestScores();
      animateNumberTo(bestValEl, tetrisBest);
    }
  }

  function tetrisLockPiece(){
    if(!tetrisPiece) return; // ★ロック済み(ライン消去アニメ中など)の二重ロックを防ぐ
    tetrisStopLoop();
    tetrisHoldUsed = false; // 新しいピースになったのでホールドをまた使えるようにする
    const { matrix, row, col, color, type, rot } = tetrisPiece;

    // Tスピン判定(盤面にピースを書き込む前に、斜め4マスの埋まり具合を見る)
    const spin = (type === 'T')
      ? detectTSpin((r,c)=>{
          if(c<0 || c>=TETRIS_COLS || r>=TETRIS_ROWS) return true; // 壁・床は埋まっている扱い
          if(r<0) return false;
          return tetrisGrid[r][c] !== -1;
        }, row, col, rot, tetrisLastRotate, tetrisLastKick)
      : null;

    let offBoard = false;
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr<0){ offBoard = true; continue; }
        tetrisGrid[gr][gc] = color;
      }
    }
    // ★盤面に確定した時点で「操作中のピース」をなくす。
    //   以前はライン消去アニメ(約0.3秒)の間も操作できてしまい、▼長押しなどで同じピースが何度もロックされ、
    //   消去・行の削除・ピース生成が重複して、ブロックが一気に消えていた。
    tetrisPiece = null;
    if(offBoard){ tetrisTriggerGameOver(); return; }

    const cleared = [];
    for(let r=0;r<TETRIS_ROWS;r++){
      if(tetrisGrid[r].every(v=>v!==-1)) cleared.push(r);
    }

    if(cleared.length>0){
      tetrisCombo++;
      const n = cleared.length;
      const isTetris4 = n===4;
      const isDifficult = isTetris4 || !!spin; // テトリス、またはラインを消したTスピンは「難しい消し方」(B2B対象)
      const linePts = spin ? (TSPIN_POINTS[spin][n] || TSPIN_POINTS.tspin[n]) : TETRIS_LINE_POINTS[n];
      let gained = linePts * tetrisLevel;
      const comboBonus = tetrisCombo>1 ? Math.round(50 * tetrisCombo * tetrisLevel) : 0;
      const btbMult = (isDifficult && tetrisBackToBack) ? 1.5 : 1;
      const b2bTetris = isTetris4 && tetrisBackToBack;
      tetrisBackToBack = isDifficult;
      gained = Math.round(gained*btbMult) + comboBonus;

      // パーフェクトクリア: 消えるラインを除いて盤面が空なら、ボーナスを上乗せ
      const perfect = !tetrisGrid.some((rowArr, r)=> !cleared.includes(r) && rowArr.some(v=>v!==-1));
      if(perfect) gained += perfectClearBonus(n, b2bTetris, tetrisLevel);

      tetrisScore += gained;
      tetrisLines += n;
      tetrisLevel = Math.floor(tetrisLines/10)+1;
      if(spin) tetrisStats.tspins++;
      if(perfect) tetrisStats.pcs++;
      vibrate(perfect ? [30,40,30,40,60] : (isDifficult ? [25,30,40] : 15));
      tetrisRefreshScore();

      let msg = spin
        ? `${spin==='mini'?'ミニ':''}Tスピン ${TSPIN_LINE_NAMES[n] || n+'ライン'}!`
        : (TETRIS_LINE_LABELS[n] || `${n}ライン!`);
      if(btbMult>1) msg += ' B2B!';
      if(tetrisCombo>1) msg += ` ${tetrisCombo}コンボ!`;
      if(perfect) msg = `✨パーフェクトクリア!! ✨ ${msg}`;
      msg += ` +${gained}`;
      showTetrisCombo(msg, (isDifficult || perfect) ? 'mega' : (tetrisCombo>1 ? 'bonus' : ''));
      playSound('clear', (isDifficult) ? 4 : n);
      if(tetrisCombo>=3 || perfect) playSound('coin');

      // スプリント: 目標ライン数に達したら、アニメを待たずにクリア
      if(tetrisRunMode==='sprint' && tetrisLines >= TETRIS_SPRINT_LINES){
        tetrisClearRowsAnimated(cleared, ()=>{});
        tetrisEndTimed('sprint');
        return;
      }
      tetrisClearRowsAnimated(cleared, ()=>{
        tetrisCollapseRows(cleared);
        tetrisSpawnPiece();
      });
      return;
    }

    tetrisCombo = 0;
    if(spin){
      // ラインを消さないTスピンも得点(ただしB2Bには影響しない)
      const pts = TSPIN_POINTS[spin][0] * tetrisLevel;
      tetrisStats.tspins++;
      vibrate(20);
      tetrisScore += pts;
      tetrisRefreshScore();
      showTetrisCombo(`${spin==='mini'?'ミニ':''}Tスピン! +${pts}`, 'bonus');
      playSound('coin');
    } else {
      playSound('place');
    }
    tetrisSpawnPiece();
  }

function tetrisTriggerGameOver(){
    if(tetrisGameOver) return;
    tetrisGameOver = true;
    tetrisActive = false;
    tetrisStopLoop();
    stopTetrisClock();
    playSound('gameover');
    grantBattlePassXp(tetrisScore);
    try{ if(window.CBV43) window.CBV43.onMainEnd({ mode: 'tetris-' + tetrisRunMode, score: tetrisScore }); }catch(e){}
    // スプリントは「クリアしたとき」だけコイン報酬(失敗時は無し)
    const earned = (tetrisRunMode==='sprint') ? 0 : Math.max(0, Math.floor(tetrisScore/40));
    if(earned>0){
      coins += earned;
      updateCoinUI();
      tetrisFloatCoin(earned);
      playSound('coin');
    }
    tetrisPlayerScoreEl.textContent = tetrisScore;
    // ★VS AI ならAIと勝負、それ以外は通常の結果表示
    if(tetrisVsMode){
      endTetrisVsMatch('player');
    } else {
      endTetrisSolo(earned, tetrisRunMode==='sprint' ? 'sprint-fail' : (tetrisRunMode==='ultra' ? 'ultra-topout' : 'topout'));
    }
  }

  // 時間系モードの正常終了(sprint: 40ライン到達 / ultra: 2分経過)
  function tetrisEndTimed(kind){
    if(tetrisGameOver) return;
    tetrisGameOver = true;
    tetrisActive = false;
    tetrisStopLoop();
    stopTetrisClock();
    grantBattlePassXp(tetrisScore);
    try{ if(window.CBV43) window.CBV43.onMainEnd({ mode: 'tetris-' + tetrisRunMode, score: tetrisScore }); }catch(e){}
    let earned;
    if(kind==='sprint'){
      const ms = performance.now() - tetrisClockStart;
      // 速いほど多い: 基本300 + 60秒より速い分は1秒あたり+10(最大+500)
      earned = 300 + Math.max(0, Math.min(500, Math.round((60000 - ms)/1000) * 10));
    } else {
      earned = Math.max(0, Math.floor(tetrisScore/40));
    }
    if(earned>0){ coins += earned; updateCoinUI(); tetrisFloatCoin(earned); }
    playSound('coin');
    tetrisPlayerScoreEl.textContent = tetrisScore;
    endTetrisSolo(earned, kind==='sprint' ? 'sprint-clear' : 'ultra-end');
  }

  // ソロ系(ソロ/スプリント/ウルトラ/フレンド対決)の結果表示
  function endTetrisSolo(earned, outcome){
    tetrisStopLoop();
    stopTetrisClock();
    tetrisActive = false;
    outcome = outcome || 'topout';
    const elapsed = performance.now() - tetrisClockStart;
    let note = 'お疲れさまでした！';
    finalScoreEl.innerHTML = '';
    if(outcome==='sprint-clear'){
      const prev = tetrisRecords.sprintMs;
      const isBest = prev == null || elapsed < prev;
      if(isBest){ tetrisRecords.sprintMs = Math.round(elapsed); saveTetrisRecords(); }
      finalScoreEl.innerHTML = `<div style="font-size:15px; color:var(--gold);">🏁 40ライン クリア！</div><div>${fmtClock(elapsed)}</div>`;
      note = isBest ? '🎉 自己ベスト更新！' : `自己ベスト ${fmtClock(prev)}`;
    } else if(outcome==='sprint-fail'){
      finalScoreEl.innerHTML = `<div style="font-size:15px; color:var(--coral);">💥 ゲームオーバー</div><div>${tetrisLines} / ${TETRIS_SPRINT_LINES} ライン</div>`;
      note = tetrisRecords.sprintMs ? `自己ベスト ${fmtClock(tetrisRecords.sprintMs)}` : 'もう一度チャレンジ！';
    } else {
      const isNewBest = tetrisScore >= tetrisBest && tetrisScore > 0;
      finalScoreEl.textContent = tetrisScore;
      if(tetrisRunMode==='ultra'){
        const ub = tetrisScore > (tetrisRecords.ultraScore||0);
        if(ub){ tetrisRecords.ultraScore = tetrisScore; saveTetrisRecords(); }
        note = (outcome==='ultra-end' ? '⏳ タイムアップ！ ' : '') + (ub && tetrisScore>0 ? '🎉 ウルトラ自己ベスト更新！' : `ウルトラ自己ベスト ${tetrisRecords.ultraScore||0}`);
      } else {
        note = isNewBest ? '🎉 ハイスコア更新！' : 'お疲れさまでした！';
      }
    }
    newBestNoteEl.textContent = note;
    coinEarnedNoteEl.textContent = earned>0 ? `🪙 +${earned} コイン獲得！` : '';
    duelResultNoteEl.textContent = '';
    overlayEl.classList.add('show');

    // 🎃 イベント(キャンディ・ミッション)への報告
    const wasDuel = !!currentDuelId;
    reportEventGame({ mode:'tetris-'+tetrisRunMode, tetris:true, score: tetrisScore, lines: Math.max(0, tetrisLines - tetrisStats.startLines),
      tspins: tetrisStats.tspins, pcs: tetrisStats.pcs, duel: wasDuel });

    // フレンド対決: ウルトラのスコアを送信
    if(currentDuelId){
      const duelId = currentDuelId;
      currentDuelId = null;
      duelResultNoteEl.textContent = '対決の結果を送信中...';
      submitDuelScore(duelId, tetrisScore).then(duel=>{
        if(duel){
          duelResultNoteEl.textContent = duelResultText(duel);
          if(duel.status==='completed') syncFromServer();
        } else duelResultNoteEl.textContent = '対決結果の送信に失敗しました。';
      });
    }
    if(authToken && tetrisRunMode!=='sprint') syncToServer(tetrisScore);
    syncPlayTime();
  }

// VS対戦の結果表示（loser は 'player' or 'ai'）
  function endTetrisVsMatch(loser){
    // AIを止める
    stopAi();
    // プレイヤー側のループも止める
    tetrisStopLoop();
    tetrisActive = false;

    const playerScore = tetrisScore;
    const aiScoreVal = aiScore;
    let resultTitle = '';
    let resultColor = 'var(--gold)';
    // 先に積み上がって詰まった側が負け(以前はスコア比較だったため、AIが詰まったのに「敗北」と出ることがあった)
    if(loser === 'ai'){
      resultTitle = '🏆 あなたの勝利！';
      resultColor = 'var(--mint)';
    } else {
      resultTitle = '😢 あなたの敗北…';
      resultColor = 'var(--coral)';
    }

    // オーバーレイに表示
    finalScoreEl.innerHTML = `
      <div style="font-size:20px; margin-bottom:6px; color:${resultColor}; font-family:'Baloo 2', sans-serif;">
        ${resultTitle}
      </div>
      <div style="font-size:16px; color:var(--text);">
        👤 ${playerScore} 点 ／ 🤖 ${aiScoreVal} 点
      </div>
    `;
    newBestNoteEl.textContent = loser === 'player' ? 'あなたが先に詰まりました' : 'AIが先に詰まりました';
    coinEarnedNoteEl.textContent = '';
    duelResultNoteEl.textContent = '';
    overlayEl.classList.add('show');

    reportEventGame({ mode:'tetris-vs', tetris:true, vs:true, score: playerScore, lines: tetrisLines, tspins: tetrisStats.tspins, pcs: tetrisStats.pcs });
    // サーバーにスコアを送信（プレイヤーのみ）
    if(authToken){
      syncToServer(playerScore);
    }
    syncPlayTime();
  }

  function restartTetris(){
    tetrisStopLoop();
    tetrisGrid = Array.from({length:TETRIS_ROWS}, ()=>new Array(TETRIS_COLS).fill(-1));
    tetrisScore = 0; tetrisLevel = 1; tetrisLines = 0; tetrisCombo = 0; tetrisBackToBack = false;
    tetrisGameOver = false; tetrisActive = true; tetrisBag = [];
    tetrisHoldType = null; tetrisHoldUsed = false;
    tetrisStats = { tspins:0, pcs:0, startLines:0 };
    tetrisNextType = tetrisRandomType();
    initTetrisBoard();
    scoreValEl.textContent = '0';
    bestValEl.textContent = tetrisBest;
    tetrisPlayerScoreEl.textContent = '0';
    renderTetrisHold();
    tetrisSpawnPiece();
    startTetrisClock();
    // ★VS AIモードのときだけAIを起動する
    if(tetrisVsMode){
      startAi();
    } else {
      stopAi();
    }
  }

// ===================== 🤖 AI対戦ロジック =====================

  function initAiTetrisBoard(){
    const aiBoardEl = document.getElementById('tetrisAiBoard');
    aiBoardEl.innerHTML = '';
    aiCellEls = [];
    for(let i=0;i<TETRIS_ROWS*TETRIS_COLS;i++){
      const cell = document.createElement('div');
      cell.className = 'tetris-cell';
      aiBoardEl.appendChild(cell);
      aiCellEls.push(cell);
    }
  }

  function aiCollides(matrix, row, col, grid){
    const g = grid || aiGrid;
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gc<0 || gc>=TETRIS_COLS || gr>=TETRIS_ROWS) return true;
        if(gr>=0 && g[gr][gc] !== -1) return true;
      }
    }
    return false;
  }

  function rotateMatrixCW_ai(m){ return rotateMatrixCW(m); }

  function getRotations(matrix){
    // 重複する回転を除外して、ユニークな回転行列だけ返す
    const rotations = [];
    let current = matrix.map(r => r.slice());
    for(let i=0;i<4;i++){
      const key = JSON.stringify(current);
      if(!rotations.some(r => JSON.stringify(r) === key)){
        rotations.push(current);
      }
      current = rotateMatrixCW_ai(current);
    }
    return rotations;
  }

  function renderAiBoard(){
    for(let r=0;r<TETRIS_ROWS;r++){
      for(let c=0;c<TETRIS_COLS;c++){
        const idx = r*TETRIS_COLS+c;
        const cell = aiCellEls[idx];
        const val = aiGrid[r][c];
        cell.className = 'tetris-cell';
        cell.style.background = (val!==-1) ? COLORS[val].bg : '';
        if(val!==-1) cell.classList.add('filled');
      }
    }
    // 現在落下中のピースも描画
    if(aiPiece){
      for(let r=0;r<aiPiece.matrix.length;r++){
        for(let c=0;c<aiPiece.matrix[r].length;c++){
          if(!aiPiece.matrix[r][c]) continue;
          const gr = aiPiece.row+r, gc = aiPiece.col+c;
          if(gr<0 || gr>=TETRIS_ROWS || gc<0 || gc>=TETRIS_COLS) continue;
          const cell = aiCellEls[gr*TETRIS_COLS+gc];
          cell.classList.add('filled');
          cell.style.background = COLORS[aiPiece.color].bg;
        }
      }
    }
  }

  function aiSpawnPiece(forceType){
    const type = forceType || aiNextType || tetrisRandomType();
    if(!forceType) aiNextType = tetrisRandomType();
    const def = TETROMINOES[type];
    const matrix = def.matrix.map(row=>row.slice());
    const col = Math.floor((TETRIS_COLS - matrix.length)/2);
    const row = -1;
    aiPiece = { type, matrix, color: def.color, row, col, rot: 0 };
    if(aiCollides(matrix, row, col)){
      aiTriggerGameOver();
      return false;
    }
    renderAiBoard();
    return true;
  }

  // 盤面評価関数: 高いほど良い配置
  function evaluateAiBoard(grid, matrix, row, col, color){
    // 仮の盤面を作る
    const temp = grid.map(r => r.slice());
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr>=0 && gr<TETRIS_ROWS && gc>=0 && gc<TETRIS_COLS){
          temp[gr][gc] = color;
        }
      }
    }
    // 揃った行を消して数える
    let linesCleared = 0;
    for(let r=TETRIS_ROWS-1;r>=0;r--){
      if(temp[r].every(v => v !== -1)){
        temp.splice(r, 1);
        temp.unshift(new Array(TETRIS_COLS).fill(-1));
        linesCleared++;
        r++;
      }
    }
    // 各列の高さ・穴・凸凹を計算
    let aggregateHeight = 0, holes = 0, bumpiness = 0, maxHeight = 0;
    const heights = [];
    for(let c=0;c<TETRIS_COLS;c++){
      let h = 0, foundBlock = false, holeCount = 0;
      for(let r=0;r<TETRIS_ROWS;r++){
        if(temp[r][c] !== -1){
          if(!foundBlock){ h = TETRIS_ROWS - r; foundBlock = true; }
        } else if(foundBlock){ holeCount++; }
      }
      heights.push(h);
      aggregateHeight += h;
      holes += holeCount;
      maxHeight = Math.max(maxHeight, h);
    }
    for(let c=0;c<TETRIS_COLS-1;c++){
      bumpiness += Math.abs(heights[c] - heights[c+1]);
    }
    // 重み付け評価（よく使われるTetris AIの定番パラメータ）
    return -0.51 * aggregateHeight
         - 0.76 * holes
         - 0.18 * bumpiness
         + 0.76 * linesCleared
         - 0.08 * maxHeight;
  }

  // AIの最善手を計算
  // 現在の難易度設定を取得
  function getAiDiff(){
    return AI_DIFFICULTIES[aiDifficulty] || AI_DIFFICULTIES.normal;
  }

  // 全候補手を列挙（回転×列）
  function getAllAiCandidates(){
    const rotations = getRotations(aiPiece.matrix);
    const candidates = [];
    for(const matrix of rotations){
      for(let col = -matrix.length; col < TETRIS_COLS; col++){
        let row = -1;
        while(!aiCollides(matrix, row + 1, col)) row++;
        if(row < 0) continue;
        candidates.push({ matrix, row, col });
      }
    }
    return candidates;
  }

  // 仮盤面を作って、ライン消去後のグリッドを返す
  function simulatePlacement(grid, matrix, row, col, color){
    const temp = grid.map(r => r.slice());
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr>=0 && gr<TETRIS_ROWS && gc>=0 && gc<TETRIS_COLS){
          temp[gr][gc] = color;
        }
      }
    }
    // 揃った行を消す
    for(let r=TETRIS_ROWS-1;r>=0;r--){
      if(temp[r].every(v => v !== -1)){
        temp.splice(r, 1);
        temp.unshift(new Array(TETRIS_COLS).fill(-1));
        r++;
      }
    }
    return temp;
  }

  // 盤面そのものを評価（仮置き後の状態を渡す）
  function evaluateGridOnly(grid){
    let aggregateHeight = 0, holes = 0, bumpiness = 0, maxHeight = 0;
    const heights = [];
    for(let c=0;c<TETRIS_COLS;c++){
      let h = 0, foundBlock = false, holeCount = 0;
      for(let r=0;r<TETRIS_ROWS;r++){
        if(grid[r][c] !== -1){
          if(!foundBlock){ h = TETRIS_ROWS - r; foundBlock = true; }
        } else if(foundBlock){ holeCount++; }
      }
      heights.push(h);
      aggregateHeight += h;
      holes += holeCount;
      maxHeight = Math.max(maxHeight, h);
    }
    for(let c=0;c<TETRIS_COLS-1;c++){
      bumpiness += Math.abs(heights[c] - heights[c+1]);
    }
    return -0.51 * aggregateHeight - 0.76 * holes - 0.18 * bumpiness - 0.08 * maxHeight;
  }

  // 難易度別の最善手を計算
  function findBestAiMove(){
    if(!aiPiece) return null;
    const diff = getAiDiff();
    const candidates = getAllAiCandidates();
    if(candidates.length === 0) return null;

    // ★難易度「史上最強」だけ1手先読みする
    if(diff.lookahead){
      const nextType = aiNextType || 'T';
      const nextDef = TETROMINOES[nextType];
      const nextMatrix = nextDef.matrix.map(r => r.slice());
      const nextColor = nextDef.color;
      const nextRots = getRotations(nextMatrix);

      let bestScore = -Infinity;
      let bestMove = null;
      for(const mv of candidates){
        // 1手目を仮置き
        const midGrid = simulatePlacement(aiGrid, mv.matrix, mv.row, mv.col, aiPiece.color);
        // 2手目のベスト評価を探す
        let bestNext = -Infinity;
        let anyNext = false;
        for(const nm of nextRots){
          for(let ncol = -nm.length; ncol < TETRIS_COLS; ncol++){
            let nrow = -1;
            while(!aiCollides(nm, nrow + 1, ncol, midGrid)) nrow++;
            if(nrow < 0) continue;
            const nGrid = simulatePlacement(midGrid, nm, nrow, ncol, nextColor);
            const s = evaluateGridOnly(nGrid);
            if(s > bestNext){ bestNext = s; anyNext = true; }
          }
        }
        if(!anyNext) bestNext = -9999; // 次のピースが置けない=詰み
        if(bestNext > bestScore){
          bestScore = bestNext;
          bestMove = mv;
        }
      }
      return bestMove || candidates[0];
    }

    // それ以外: 現在の評価関数でスコアを計算し、ノイズとランダム性を加味
    const scored = candidates.map(c => {
      const base = evaluateAiBoard(aiGrid, c.matrix, c.row, c.col, aiPiece.color);
      const score = base * diff.weightScale + (Math.random() - 0.5) * diff.noise;
      return { ...c, score };
    });

    scored.sort((a,b)=>b.score - a.score);
    // 人間は「めちゃくちゃな場所」には置かず、惜しい2〜4番手の手を選ぶことがある
    if(scored.length > 1 && Math.random() < diff.randomChance){
      const k = Math.min(4, scored.length);
      return scored[1 + Math.floor(Math.random() * (k - 1))];
    }
    return scored[0];
  }

  function aiLockPiece(){
    if(!aiPiece) return;
    const { matrix, row, col, color } = aiPiece;
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr < 0 || gr >= TETRIS_ROWS || gc < 0 || gc >= TETRIS_COLS) continue;
        aiGrid[gr][gc] = color;
      }
    }
    // 揃った行を消す
    const cleared = [];
    for(let r=0;r<TETRIS_ROWS;r++){
      if(aiGrid[r].every(v => v !== -1)) cleared.push(r);
    }
    // ★スコア計算をプレイヤー(tetrisLockPiece)と完全に同じルールに統一
    // (以前はコンボ倍率・バックトゥバックボーナスがAI側に一切無く、単純に基本点×レベルのみだった)
    if(cleared.length > 0){
      aiCombo++;
      const isTetris4 = cleared.length === 4;
      let gained = TETRIS_LINE_POINTS[cleared.length] * aiLevel;
      const comboBonus = aiCombo > 1 ? Math.round(50 * aiCombo * aiLevel) : 0;
      const btbMult = (isTetris4 && aiBackToBack) ? 1.5 : 1;
      const aiB2bTetris = isTetris4 && aiBackToBack;
      aiBackToBack = isTetris4;
      gained = Math.round(gained * btbMult) + comboBonus;

      cleared.slice().sort((a,b)=>a-b).forEach(r=>{
        aiGrid.splice(r, 1);
        aiGrid.unshift(new Array(TETRIS_COLS).fill(-1));
      });
      // パーフェクトクリア(プレイヤーと同じ得点)
      if(aiGrid.every(rowArr => rowArr.every(v => v === -1))){
        gained += perfectClearBonus(cleared.length, aiB2bTetris, aiLevel);
      }
      aiLines += cleared.length;
      aiLevel = Math.floor(aiLines/10)+1;
      aiScore += gained;
    } else {
      aiCombo = 0;
    }
    aiPiece = null;
    tetrisAiScoreEl.textContent = aiScore;
  }

  // ===================== 🤖 AIの手を1手ずつ実行する =====================
  // 以前は「最善手の位置へ瞬間移動→即ロック」というテレポートのような動きで、
  // しかも思考中はピースが自然落下せず(重力なし)、プレイヤーには無い猶予時間があった。
  // ここでは、プレイヤーと全く同じ重力タイマー(aiGravityTick)を常時並行して走らせ、
  // 難易度ごとの思考速度(aiTick)は「回転・左右移動・決めたら即ハードドロップ」という
  // 純粋な操作判断だけを担当するようにして、盤面の落下挙動をプレイヤーと揃えている。
  let aiPlan = null;

  function matrixKey(m){
    return m.map(row => row.join('')).join('|');
  }

  // ピースを1つ確定させ、採点・次のピース生成・重力タイマーの再スタートまで行う共通処理
  function aiFinishPiece(){
    aiLockPiece();
    aiPlan = null;
    aiHoldUsed = false;
    renderAiBoard();
    if(aiGameOver) return;
    const spawned = aiSpawnPiece();
    renderAiBoard();
    if(!spawned || aiGameOver) return; // ゲームオーバーになった場合は重力タイマーを再スタートしない
    startAiGravity(); // ★新しいピース&レベルに合わせて、プレイヤーと同じ計算式で重力を再スタート
    scheduleAiTick(aiThinkDelay()); // 新しいピースを見てから動き出すまで「考える時間」を置く
  }

  // ===== 重力タイマー: プレイヤーのtetrisTickと全く同じ間隔・ロジックで自然落下させる =====
  function aiGravityTick(){
    if(!aiActive || aiGameOver || !aiPiece) return;
    if(!aiCollides(aiPiece.matrix, aiPiece.row + 1, aiPiece.col)){
      aiPiece.row++;
      renderAiBoard();
    } else {
      aiFinishPiece();
    }
  }
  function startAiGravity(){
    if(aiGravityTimer) clearInterval(aiGravityTimer);
    aiGravityTimer = setInterval(aiGravityTick, dropIntervalForLevel(aiLevel));
  }
  function stopAiGravity(){
    if(aiGravityTimer){ clearInterval(aiGravityTimer); aiGravityTimer = null; }
  }

  // ===== 🤖 AIの操作(人間らしさ重視) =====
  //  ・新しいピースが出てから、少し「考える時間」を置く
  //  ・操作の間隔は一定ではなく、ゆらぎ + たまに迷って止まる
  //  ・回転と移動をバラバラに混ぜる(回転→全部移動、ではない)
  //  ・たまに1マスずれて落としたり、行き過ぎて戻ったりする
  //  ・ホールドを使う / 最後はハードドロップかソフトドロップで落とす
  //  ・積み上がって追い詰められると、焦って操作が速くなる
  let aiHoldType = null, aiHoldUsed = false;
  const aiRand = (a,b)=> a + Math.random()*(b-a);
  function aiStackHeight(){
    for(let r=0;r<TETRIS_ROWS;r++){ if(aiGrid[r].some(v=>v!==-1)) return TETRIS_ROWS - r; }
    return 0;
  }
  function scheduleAiTick(delay){
    if(aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(aiTick, Math.max(25, delay));
  }
  function aiThinkDelay(){
    const d = getAiDiff();
    let t = d.think * aiRand(0.7, 1.4);
    if(aiStackHeight() >= 14) t *= 0.6;           // 追い詰められたら即決する
    return t;
  }
  function aiActionDelay(){
    const d = getAiDiff();
    let t = Math.max(40, d.speed) * aiRand(0.65, 1.45);
    if(Math.random() < 0.07) t += aiRand(120, 380);   // たまに一瞬止まる
    if(aiStackHeight() >= 14) t *= 0.75;
    return t;
  }

  function aiRotateSRS(){
    const p = aiPiece;
    if(p.type === 'O') return false;
    const rm = rotateMatrixCW(p.matrix);
    const table = (p.type === 'I') ? SRS_KICKS_I : SRS_KICKS_JLSTZ;
    for(const [dx, dy] of table[p.rot]){
      if(!aiCollides(rm, p.row - dy, p.col + dx)){
        p.matrix = rm; p.row -= dy; p.col += dx; p.rot = (p.rot + 1) % 4;
        return true;
      }
    }
    return false;
  }

  // 指定した種類のピースを置ける全候補(ホールド判断用)
  function aiBestEvalFor(type){
    const def = TETROMINOES[type];
    let best = -Infinity;
    for(const matrix of getRotations(def.matrix.map(r=>r.slice()))){
      for(let col = -matrix.length; col < TETRIS_COLS; col++){
        let row = -1;
        while(!aiCollides(matrix, row + 1, col)) row++;
        if(row < 0) continue;
        const v = evaluateAiBoard(aiGrid, matrix, row, col, def.color);
        if(v > best) best = v;
      }
    }
    return best;
  }
  function aiDoHold(){
    const cur = aiPiece.type;
    aiHoldUsed = true;
    aiPlan = null;
    let ok;
    if(aiHoldType === null){ aiHoldType = cur; ok = aiSpawnPiece(); }
    else { const t = aiHoldType; aiHoldType = cur; ok = aiSpawnPiece(t); }
    renderAiBoard();
    if(ok) startAiGravity();
    return ok;
  }

  function aiTick(){
    if(!aiActive || aiGameOver || !aiPiece) return;
    const diff = getAiDiff();

    // ① 計画: ピースごとに「どこに・どの向きで置くか」を最初に1回だけ決める
    if(!aiPlan){
      // ホールド: 手札の方が明らかに良く置けそうなら入れ替える
      if(!aiHoldUsed && Math.random() < diff.holdUse){
        const alt = aiHoldType || aiNextType;
        if(alt && aiBestEvalFor(alt) > aiBestEvalFor(aiPiece.type) + 0.6){
          if(aiDoHold()) scheduleAiTick(aiActionDelay());
          return;
        }
      }
      const move = findBestAiMove();
      if(!move){ aiTriggerGameOver(); return; }
      aiPlan = {
        targetMatrixKey: matrixKey(move.matrix),
        targetCol: move.col,
        checked: false,
        soft: Math.random() > diff.hardDrop
      };
      scheduleAiTick(aiActionDelay());
      return;
    }

    // ② 回転と左右移動を混ぜながら、目標に近づく
    const needRot = matrixKey(aiPiece.matrix) !== aiPlan.targetMatrixKey;
    const dir = Math.sign(aiPlan.targetCol - aiPiece.col);
    const needMove = dir !== 0 && !aiCollides(aiPiece.matrix, aiPiece.row, aiPiece.col + dir);
    if(needRot || needMove){
      if(needRot && (!needMove || Math.random() < 0.6)){
        if(!aiRotateSRS()) aiPlan.targetMatrixKey = matrixKey(aiPiece.matrix);  // 回せなければ今の向きで妥協
      } else {
        aiPiece.col += dir;
      }
      renderAiBoard();
      scheduleAiTick(aiActionDelay());
      return;
    }

    // ③ 目標に着いたら、たまに「ミス」や「迷い」を入れる(1ピースにつき1回だけ判定)
    if(!aiPlan.checked){
      aiPlan.checked = true;
      const r = Math.random(), d = Math.random() < 0.5 ? -1 : 1;
      const free = !aiCollides(aiPiece.matrix, aiPiece.row, aiPiece.col + d);
      if(r < diff.slip * 0.4){
        if(free){ aiPiece.col += d; renderAiBoard(); }          // 本当にずれたまま落とす
      } else if(r < diff.slip){
        if(free){                                               // 行き過ぎて、気づいて戻る
          aiPiece.col += d; renderAiBoard();
          scheduleAiTick(aiActionDelay() + aiRand(150, 350));
          return;
        }
      } else if(Math.random() < 0.1){
        scheduleAiTick(aiRand(150, 400));                       // 少し迷う
        return;
      }
    }

    // ④ 落とす: ハードドロップか、ソフトドロップでスッと下ろす
    if(aiPlan.soft){
      if(!aiCollides(aiPiece.matrix, aiPiece.row + 1, aiPiece.col)){
        aiPiece.row++;
        aiScore += 1;
        renderAiBoard();
        scheduleAiTick(aiActionDelay() * 0.3);
        return;
      }
      aiFinishPiece();
      return;
    }
    let dist = 0;
    while(!aiCollides(aiPiece.matrix, aiPiece.row + 1, aiPiece.col)){
      aiPiece.row++;
      dist++;
    }
    if(dist > 0) aiScore += dist * 2;
    aiFinishPiece();
  }

  function startAi(){
    aiGrid = Array.from({length:TETRIS_ROWS}, ()=>new Array(TETRIS_COLS).fill(-1));
    aiScore = 0; aiLevel = 1; aiLines = 0; aiCombo = 0; aiBackToBack = false;
    aiGameOver = false; aiActive = true; aiBag = [];
    aiHoldType = null; aiHoldUsed = false; aiPlan = null;
    aiPiece = null; aiNextType = tetrisRandomType();
    initAiTetrisBoard();
    tetrisAiScoreEl.textContent = '0';
    aiSpawnPiece();
    // ★難易度ごとの速度は「操作の速さ」だけを表し、落下自体は重力タイマーが別途プレイヤーと同じ規則で担当する
    scheduleAiTick(aiThinkDelay());
    startAiGravity();
  }

  function stopAi(){
    if(aiTimer){ clearTimeout(aiTimer); clearInterval(aiTimer); aiTimer = null; }
    stopAiGravity();
    aiActive = false;
  }

  function aiTriggerGameOver(){
    if(aiGameOver) return;
    aiGameOver = true;
    aiActive = false;
    stopAi();
    // AIが先に詰まったら、プレイヤーの勝ち
    endTetrisVsMatch('ai');
  }

  // テトリスモード中は、CSSのtouch-action等に加えてピンチズーム自体をJSでも完全にブロックする
  function preventMultiTouchZoom(e){
    if(e.touches && e.touches.length > 1) e.preventDefault();
  }

function enterTetrisMode(){
    currentMode = 'tetris';
    // ソロ/VS/スプリント/ウルトラをフラグに反映(フレンド対決は常にウルトラ)
    tetrisRunMode = tetrisDuelPending ? 'ultra' : tetrisSubMode;
    tetrisDuelPending = false;
    tetrisVsMode = (tetrisRunMode === 'vs');
    // 難易度が不正ならnormalに戻す
    if(!AI_DIFFICULTIES[aiDifficulty]) aiDifficulty = 'normal';

    // レイアウト切り替え
    if(tetrisVsMode){
      tetrisWrapEl.classList.remove('solo-mode');
      tetrisWrapEl.classList.add('vs-mode');
    } else {
      tetrisWrapEl.classList.remove('vs-mode');
      tetrisWrapEl.classList.add('solo-mode');
    }

    updateModeBadge();
    boardWrapEl.style.display = 'none';
    trayEl.style.display = 'none';
    tetrisWrapEl.style.display = 'flex';
    saveSettings();
    startPlayTimeTracking();
    restartTetris(); // 内部で tetrisVsMode に応じてAI起動/停止
    document.addEventListener('touchmove', preventMultiTouchZoom, { passive:false });
    document.addEventListener('touchstart', preventMultiTouchZoom, { passive:false });
  }

  function exitTetrisMode(){
    tetrisStopLoop();
    stopTetrisClock();
    timeAttackCardEl.style.display = 'none';
    tetrisActive = false;
    stopAi();
    tetrisWrapEl.style.display = 'none';
    boardWrapEl.style.display = '';
    trayEl.style.display = '';
    document.removeEventListener('touchmove', preventMultiTouchZoom, { passive:false });
    document.removeEventListener('touchstart', preventMultiTouchZoom, { passive:false });
  }

  // 数字が「1→2→3→…」と駆け上がるように見えるカウントアップアニメーション（約0.8秒以内）
  function animateNumberTo(el, toValue, duration){
    duration = duration || 800;
    const fromValue = parseInt(el.textContent, 10) || 0;
    if(fromValue === toValue){ el.textContent = toValue; return; }
    const start = performance.now();
    function step(now){
      const p = Math.min(1, (now-start)/duration);
      const eased = 1 - Math.pow(1-p, 3);
      const cur = Math.round(fromValue + (toValue-fromValue)*eased);
      el.textContent = cur;
      if(p<1) requestAnimationFrame(step);
      else el.textContent = toValue;
    }
    requestAnimationFrame(step);
  }

  // ===================== テトリス操作(キーボード) =====================
  document.addEventListener('keydown', (e)=>{
    if(currentMode!=='tetris' || !tetrisActive || tetrisGameOver) return;
    const key = e.key.toLowerCase();
    const isSpace = key===' ' || key==='spacebar' || e.code==='Space';
    if(['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s','q'].includes(key) || isSpace) e.preventDefault();
    // 十字キーに加えて、片手操作しやすいようWASDにも対応。ホールドはQ。
    if(key==='arrowleft' || key==='a') tetrisMove(-1);
    else if(key==='arrowright' || key==='d') tetrisMove(1);
    else if(key==='arrowup' || key==='w') tetrisRotate();
    else if(key==='arrowdown' || key==='s') tetrisSoftDrop();
    else if(isSpace) tetrisHardDrop();
    else if(key==='q') tetrisHoldSwap();
  });

  // ===================== テトリス操作(タッチ/タップ・iPad対応) =====================
  function bindTetrisHoldButton(el, fn, repeatMs, initialDelay){
    repeatMs = repeatMs || 100; initialDelay = initialDelay || 220;
    let holdTimer = null, startTimer = null;
    const start = (e)=>{
      e.preventDefault();
      fn();
      startTimer = setTimeout(()=>{ holdTimer = setInterval(fn, repeatMs); }, initialDelay);
    };
    const stop = ()=>{
      clearTimeout(startTimer); clearInterval(holdTimer);
      startTimer = null; holdTimer = null;
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointerleave', stop);
    el.addEventListener('pointercancel', stop);
  }
  bindTetrisHoldButton(tBtnLeftEl, ()=>tetrisMove(-1));
  bindTetrisHoldButton(tBtnRightEl, ()=>tetrisMove(1));
  bindTetrisHoldButton(tBtnSoftEl, ()=>tetrisSoftDrop());
  tBtnRotateEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisRotate(); });
  tBtnHardEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisHardDrop(); });
  tBtnHoldEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisHoldSwap(); });
  tetrisBoardEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisRotate(); });
  // ズームや長押しでの範囲選択・コピーメニューが出ないように抑制
  tetrisWrapEl.addEventListener('contextmenu', (e)=>e.preventDefault());
  tetrisWrapEl.addEventListener('selectstart', (e)=>e.preventDefault());

  // ===================== 操作説明パネル =====================
  tetrisHelpPanelEl.innerHTML = `
    <b>🎮 操作説明</b>
    ◀▶：左右移動<br>
    ⟳：回転<br>
    ▼：ソフトドロップ<br>
    ⤓：ハードドロップ<br>
    ⇄ HOLD：ピースを保持/交換<br>
    <b style="margin-top:8px;">⌨️ キーボード</b>
    ← → / A D：移動<br>
    ↑ / W：回転<br>
    ↓ / S：ソフトドロップ<br>
    スペース：ハードドロップ<br>
    Q：ホールド<br>
    <b style="margin-top:8px;">✨ ボーナス</b>
    Tスピン：Tを回転でスキマにはめて消すと高得点<br>
    パーフェクトクリア：盤面を全部消すと大ボーナス
  `;
  tetrisHelpBtnEl.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    tetrisHelpPanelEl.classList.toggle('show');
  });

  // ===================== サーバーお知らせ(管理者コマンド /announce の配信を表示) =====================
  const STORAGE_LAST_ANNOUNCEMENT = 'nexus-last-announcement-v1';
  let lastSeenAnnouncementId = 0;

  async function loadLastSeenAnnouncement(){
    try{
      const res = await appStorage.get(STORAGE_LAST_ANNOUNCEMENT, false);
      if(res && res.value) lastSeenAnnouncementId = parseInt(res.value,10) || 0;
    }catch(err){}
  }
  async function saveLastSeenAnnouncement(id){
    try{ await appStorage.set(STORAGE_LAST_ANNOUNCEMENT, String(id), false); }catch(err){}
  }

  function showAnnouncementToast(message){
    const el = document.createElement('div');
    el.className = 'announce-toast';
    el.innerHTML = `<span>📢</span><span class="announce-text">${escapeHtml(message)}</span><button class="announce-close">✕</button>`;
    document.body.appendChild(el);
    el.querySelector('.announce-close').addEventListener('click', ()=>el.remove());
    requestAnimationFrame(()=> el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 450); }, 8000);
  }

  async function checkAnnouncements(){
    try{
      const r = await fetch(`${API_BASE_URL}/api/announcements/latest`);
      const data = await r.json();
      if(data.announcement && data.announcement.id > lastSeenAnnouncementId){
        lastSeenAnnouncementId = data.announcement.id;
        saveLastSeenAnnouncement(lastSeenAnnouncementId);
        showAnnouncementToast(data.announcement.message);
      }
    }catch(err){}
  }

  // ===================== アップデート検知(新しいバージョンが公開されたらリアルタイムで案内) =====================
  const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content || '0';
  let updateToastShown = false;
  async function checkForUpdate(){
    if(updateToastShown) return;
    try{
      const r = await fetch(location.pathname + '?_check=' + Date.now(), { cache:'no-store' });
      const text = await r.text();
      const match = text.match(/name="app-version" content="([^"]+)"/);
      if(match && match[1] && match[1] !== APP_VERSION){
        updateToastShown = true;
        const el = document.createElement('div');
        el.className = 'update-toast';
        el.innerHTML = `<span>✨ 新しいバージョンがあります</span><button id="updateReloadBtn">今すぐ更新</button>`;
        document.body.appendChild(el);
        requestAnimationFrame(()=> el.classList.add('show'));
        document.getElementById('updateReloadBtn').addEventListener('click', ()=>location.reload());
      }
    }catch(err){}
  }

  // ===================== メインメニュー画面 =====================
  const titleScreenEl = document.getElementById('titleScreen');

  function showTitleScreen(){
    if(currentMode==='tetris') exitTetrisMode();
    if(currentMode==='timeattack') stopTimeAttackTimer();
    overlayEl.classList.remove('show');
    modalOverlay.classList.remove('show');
    clearTimeout(titleHideTimer);
    titleScreenEl.classList.remove('hidden', 'leaving');
    replayLobbyIn();
    setTimeout(()=>{ try{ if(window.GiftFx) window.GiftFx.check('lobby'); }catch(e){} }, 700);
  }
  let titleHideTimer = null;
  function motionOff(){ return document.body.classList.contains('reduce-motion') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  // ロビーの入場アニメを最初から再生する(終わったらクラスを外し、PLAYボタンの常時アニメを戻す)
  function replayLobbyIn(){
    if(motionOff()) return;
    titleScreenEl.classList.remove('lobby-in');
    void titleScreenEl.offsetWidth;
    titleScreenEl.classList.add('lobby-in');
    setTimeout(()=>titleScreenEl.classList.remove('lobby-in'), 1400);
  }
  function hideTitleScreen(){
    if(titleScreenEl.classList.contains('hidden')) return;
    const appEl = document.getElementById('app');
    if(motionOff()){ titleScreenEl.classList.add('hidden'); return; }
    // ロビーが拡大しながら消え、ゲーム画面が下から浮かび上がる
    titleScreenEl.classList.add('leaving');
    appEl.classList.remove('app-enter'); void appEl.offsetWidth; appEl.classList.add('app-enter');
    setTimeout(()=>appEl.classList.remove('app-enter'), 700);
    clearTimeout(titleHideTimer);
    titleHideTimer = setTimeout(()=>{ titleScreenEl.classList.add('hidden'); titleScreenEl.classList.remove('leaving'); }, 260);
  }

  document.getElementById('titleStartBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    pendingMode = (currentMode==='tetris' || currentMode==='timeattack') ? 'baked' : currentMode;
    pendingSize = SIZE;
    renderSettingsModal('mode');
    modalOverlay.classList.add('show');
  });
  document.getElementById('titleTimeAttackBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    startTimeAttackMode();
  });
  document.getElementById('titleWeeklyBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    openWeeklyChallengeModal();
  });
  document.getElementById('titleGachaBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    openGachaModal();
  });
  document.getElementById('titleBattlePassBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    openBattlePassModal();
  });
  document.getElementById('titleRecordsBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    renderRecordsModal();
    modalOverlay.classList.add('show');
  });
  document.getElementById('titleSettingsBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    renderAppSettingsModal();
    modalOverlay.classList.add('show');
  });

document.getElementById('titleOtherGamesBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    renderOtherGamesModal();
    modalOverlay.classList.add('show');
  });

// ===================== 🎵 音楽一覧モーダル =====================
  let musicSearchQuery = '';
  let musicCategoryFilter = 'すべて';

  // フィルタ条件に合う曲のリストを返す
  function getFilteredMusicList(){
    let list = MUSIC_LIBRARY.slice();
    if(musicCategoryFilter !== 'すべて'){
      list = list.filter(t => t.category === musicCategoryFilter);
    }
    if(musicSearchQuery.trim()){
      const q = musicSearchQuery.trim().toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    return list;
  }

  // リスト部分だけを再描画する(検索ボックスは触らないのでIMEが壊れない)
  function renderMusicList(){
    const listEl = document.getElementById('musicListArea');
    const countEl = document.getElementById('musicCountLabel');
    if(!listEl) return;
    const list = getFilteredMusicList();
    if(countEl) countEl.textContent = `${list.length} 件`;

    if(list.length === 0){
      listEl.innerHTML = `<div class="empty-hint">該当する曲が見つかりませんでした。</div>`;
      return;
    }
    listEl.innerHTML = list.map(track => {
      const isPlaying = track.file === bgmCurrentFile;
      return `
        <div class="quest-item music-item" data-musicfile="${escapeHtml(track.file)}"
             style="cursor:pointer; ${isPlaying?'border:2px solid var(--gold);':''}">
          <div class="qtitle">${track.emoji||'🎵'} ${escapeHtml(track.title)} ${isPlaying?'<span class="coin-tag">再生中</span>':''}</div>
          <div class="sub" style="margin-top:4px;">${escapeHtml(track.artist)} ・ ${escapeHtml(track.category)}</div>
        </div>`;
    }).join('');
    // 曲タップのイベントを貼り直す
    listEl.querySelectorAll('.music-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const file = el.dataset.musicfile;
        if(!file) return;
        playBgmTrack(file);
        bgmEnabled = true;
        renderMusicList();
      });
    });
  }

  function renderMusicModal(){
    modalContent.dataset.mode = 'music';

    const currentTrack = MUSIC_LIBRARY.find(t => t.file === bgmCurrentFile);
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">🎵 音楽</h2>
      <div class="sub" style="margin-bottom:10px;">好きな曲を選んで再生できます。今: <b style="color:var(--mint);">${currentTrack ? escapeHtml(currentTrack.title) : '停止中'}</b></div>

      <input type="text" id="musicSearchInput" placeholder="🔍 曲名・アーティストで検索..." value="${escapeHtml(musicSearchQuery)}"
        style="width:100%; padding:11px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif; margin-bottom:8px; box-sizing:border-box;">

      <div class="tab-row" style="margin-bottom:10px; flex-wrap:wrap;">
        ${MUSIC_CATEGORIES.map(cat => `
          <button class="tab-btn music-cat-btn ${musicCategoryFilter===cat?'active':''}" data-mcat="${cat}">${cat}</button>
        `).join('')}
      </div>

      <div class="sub" style="margin-bottom:6px;"><span id="musicCountLabel"></span></div>
      <div id="musicListArea"></div>

      <button class="ghost-btn" id="musicStopBtn" style="margin-top:10px;">⏹ BGMを停止する</button>
    `;

    // ★検索ボックスは「input」イベントで「リストだけ」を再描画する
    // → 検索ボックス自体は作り直されないので、IMEが途中でキャンセルされない
    const searchEl = document.getElementById('musicSearchInput');
    searchEl.addEventListener('input', (e)=>{
      musicSearchQuery = e.target.value;
      renderMusicList();
    });

    modalContent.querySelectorAll('.music-cat-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        musicCategoryFilter = btn.dataset.mcat;
        // カテゴリ変更時はタブの見た目も変えたいのでモーダル全体を再描画(検索キーワードは保持)
        renderMusicModal();
      });
    });

    document.getElementById('musicStopBtn').addEventListener('click', ()=>{
      stopBgm();
      bgmCurrentFile = null;
      bgmEnabled = false;
      saveBgmSettings();
      updateMusicButton();
      renderMusicModal();
    });

    // 初回リスト描画
    renderMusicList();
  }

// ===================== 🎮 別のゲーム =====================

const OTHER_GAMES = [
    // 修正中のゲームは url を持たせない(= タップしても開かない)。直ったら url を戻して maintenance を消す
    { emoji:'⚫', name:'オセロ', desc:'白と黒の石をひっくり返して陣取り！', maintenance:true },
    { emoji:'⚪', name:'五目並べ', desc:'縦・横・斜めに5つ並べたら勝ち！', maintenance:true },
    { emoji:'❌', name:'まるばつゲーム', desc:'3×3のマスで○×を並べる定番ゲーム', maintenance:true },
    { emoji:'🐢', name:'ウミガメのスープ', desc:'質問を重ねて、不思議な出来事の真相を推理しよう！', url:'https://chelonia.onrender.com' },
  ];

function renderOtherGamesModal(){
    modalContent.dataset.mode = 'othergames';
    let html = `
      <h2 style="color:var(--gold);">🎮 別のゲーム</h2>
      <div class="sub" style="margin-bottom:10px;">他のゲームも続々追加予定！お楽しみに。</div>
    `;
    if(OTHER_GAMES.length === 0){
      html += `<div class="empty-hint">現在公開中のゲームはありません。</div>`;
    } else {
      OTHER_GAMES.forEach((g, i)=>{
        const ready = !!g.url;
        html += `
          <div class="quest-item other-game-item" data-gameidx="${i}"
               style="cursor:${ready?'pointer':'default'}; ${ready?'':'opacity:0.55;'}">
            <div class="qtitle">${g.emoji} ${g.name}${ready?'':(g.maintenance?' <span class="coin-tag maint-tag">🛠 修正中</span>':' <span class="coin-tag">準備中</span>')}</div>
            <div class="sub" style="margin-top:4px;">${g.maintenance?'現在修正中です。直り次第また遊べるようになります。':g.desc}</div>
          </div>`;
      });
    }
    html += `
      <div class="coming-soon">
        <span class="cs-line"></span>
        <span class="cs-text">Coming Soon…</span>
        <span class="cs-line"></span>
      </div>
    `;
    modalContent.innerHTML = html;

    modalContent.querySelectorAll('.other-game-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const g = OTHER_GAMES[parseInt(el.dataset.gameidx, 10)];
        if(g && g.url) window.open(g.url, '_blank', 'noopener');
      });
    });
  }

  // ===================== 更新履歴 / バージョン表示 =====================
  const CHANGELOG = [
    { version:'4.3.0', date:'2026-11-04', items:[
      '❄ バトルパスが「ウィンターパス」に生まれ変わりました。全員のレベルをリセットして、雪と氷がテーマの新シーズンがスタート',
      '📈 レベルが上がるほど、次のレベルに必要なXPが増える方式に。報酬は25レベルで1周して、100レベルごとにコインがアップ(最大10倍)',
      '🎁 1000レベルまで続く特別報酬を追加: 冬の新スキン12種・勝利演出・レベルアップ演出・テーマ・称号。「🥶絶対零度」は1000レベル限定',
      '🔢 コイン・XP・スコアなど、数字の上限をなくしました。どんなに大きな数でもエラーにならず、短く読みやすく表示します',
      '🏠 メニューが1画面に収まるように。よく使う機能を大きなボタンにして、ほかは「すべて」から探せます',
      '🏆 実績センターを新設。隠し実績つきで、獲得すると画面の上に通知が出ます',
      '👤 プロフィール画面・📦 コレクション・📊 プレイ統計・🔥 連続プレイ記録を追加',
      '🧱 ミニゲーム「アイスブロック崩し」をリニューアル。アイテム(マルチボール・レーザー・ファイアなど)・コンボ・かたいブロック・💣ブロック・ステージ制で、ぐっと爽快に',
      '🕹 ミニゲームの選択画面を刷新: 検索・カテゴリ・お気に入り・最近遊んだゲーム・ランダム・おすすめ・★評価・遊び方',
      '🏅 ミニゲームのランキングを、ふつうのランキングと同じ見やすさに。ゲームを切り替えても、横スクロールが左に戻りません',
      '🎨 テーマ切り替え(ノーマル / ダーク / レトロ / ウィンター)・勝利演出・レベルアップ演出を選べるように',
      '✨ アニメーションを改善',
      '💾 お気に入り・評価・遊んだ履歴などをアカウントに自動保存(別の端末でも引き継ぎ、3世代のバックアップつき)',
      '🏷 称号を追加(遊んだ回数・連続日数・ミニゲーム制覇・実績・ウィンターパスの高レベル)',
      '🎃 ハロウィンイベントが終了しました(報酬の受け取りと交換所は11/6まで)。ミニゲームは冬の通常版になりました',
      '🎄 12月のイベントは準備中です'
    ]},
    { version:'4.2.0', date:'2026-10-27', items:[
      '🕹 ミニゲームの記録の制限を、すべてなくしました(どのゲームも、上限なし)'
    ]},
    { version:'4.1.0', date:'2026-10-27', items:[
      '🖼 iPadなどで画像が表示されないときの対策: 直接読めない画像は、自動でサーバー経由でやり直します',
      '🔐 HWID(この端末の登録)を見直し: ログイン/新規登録でこの端末とアカウントが紐づき、ログアウトで外れます。ページを開くたびにHWIDを確認し、紐づいたアカウントがあればそのままログイン、なければゲストになります。1つの端末に複数のアカウントが紐づいていたら、いちばん新しくログインしたものにそろえます',
      '🖼 画像のアップロードを2パターンに: imgBBにつながるときは、圧縮せず「オリジナルの画質のまま」送ってアイコン/チャットに使います。つながらないときだけ、圧縮して使います(撮影場所などの情報は自動で取り除かれます)'
    ]},
    { version:'4.0.0', date:'2026-10-27', items:[
      '👹 ハロウィン パート3 拡張！ 新タブ「👹 ボス」: みんなのダメージを合わせて、4体のボスを順番にたおす協力イベント。ゲームやミニゲームを遊ぶだけで自動でダメージが入り、キャンディを使って「こうげき」もできます(クリティカルあり)。たおすたびに、参加した全員にごほうび',
      '🕹 新しいミニゲームを5本追加(コウモリよけ / ともしびメモリー / ガイコツ・ビート / かぼちゃふくらまし / もじならべ)。スタンプラリーは31個に、27個・29個のごほうびも追加',
      '👻 「おばけ10秒れんだ」のスコア上限をなくしました。どこまでも記録がのびます',
      '🖼 画像の送信を見直し: imgBB のAPIキーを環境変数からしっかり読み取るように。サーバーが眠っていても自動でやり直すので、アイコン・チャット画像が送れないことが減ります'
    ]},
    { version:'3.9.0', date:'2026-10-26', items:[
      '🎃 ハロウィン パート3！ 新タブ「🍪 パート3」: 2時間ごとにもらえる「おやつタイム」と、今日あそんだ回数で報酬が増える「パンプキン・パレード」。期間中はキャンディ常時1.3倍',
      '🍬 キャンディが集めやすく: ミニゲームのおまけ+10・さまようおばけ1日20匹・ドアの無料回数2回・図鑑の出会い率UP。デイリー/ウィークリーのミッションが6個ずつに',
      '🕹 新しいミニゲームを8本追加(おばけ10秒れんだ / ぴったりストップ / ぴったり5秒 / ちがうのはどれ？ / おばけ仕分け / ハイ＆ロー / おばけじゃんけん / かぼちゃ数え)。スタンプラリーは26個に',
      '🎁 フレンドにコインのギフトが贈れるように(フレンド一覧の「🎁 ギフト」。1回1万まで・24時間で3万まで)',
      '🎁 ギフトの画面に ✕ ボタン(受け取らずに閉じられます)と「まとめて受け取る」を追加',
      '🔍 フレンド申請を、ID・表示名で探せるユーザー一覧に変更。同じ表示名の人も全員出て、IDが一致した人が一番上に出ます',
      '🔑 ログインの保存を、Cookieから「端末ID(HWID)」方式に変更。ログインが7日で切れにくくなりました(ログアウトすると、この端末の自動ログインも消えます)',
      '🖼 画像の保存先を imgBB に(アイコン・チャット画像)。imgBB が使えないときは、これまで通りサーバーに保存します',
      '🎲 週替わりチャレンジの1位報酬を 50,000 コインに増額'
    ]},
    { version:'3.8.0', date:'2026-10-25', items:[
      '🖼 アイコンを設定できるように。絵文字+色から選ぶか、手持ちの画像をアップロード(自動で小さくします)。ランキング・チャット・フレンドなどに表示されます',
      '📷 チャットに画像を送れるように。送る前に自動で小さくし、画像は3日たつと自動で消えます(メッセージは残ります)',
      '🏅 名前の横に、バトルパスのレベル(Lv.)が出るように',
      '📮 ご要望・不具合報告を送ると、運営との専用チャットが開きます。運営が1つずつ返信し、終了すると 👍/👎 で評価できます(👎なら新しいチャットが開きます)',
      '🔔 ロビーに「お知らせバー」を追加。未読のチャット・未投票・運営からの返信・フレンドの通知などが、ひと目でわかります'
    ]},
    { version:'3.7.0', date:'2026-10-24', items:[
      '🏷 「表示名」を追加。IDとは別に、ランキング・チャット・フレンドなどに出る名前を決められます(日本語OK・16文字まで・何度でも変更OK)',
      '🪪 IDを変更できるように(7日に1回まで)。アカウント画面から、パスワードで確認して変更します。フレンド・記録・ギフトなどはそのまま引き継がれます',
      '🆕 新規登録のときに、表示名も決められるようになりました(省略するとIDが表示されます)',
      '🛠 フレンド一覧などに、表示名とあわせてIDも小さく表示(フレンド申請はIDで探します)'
    ]},
    { version:'3.6.1', date:'2026-10-23', items:[
      '✨ ゲーム名が「NEXUS」になりました(制作: vortx)。タイトル・アプリ名・各画面の表記をすべて変更',
      '💾 今までのデータ(ハイスコア・コイン・スキン・設定・ログイン状態)は、そのまま引き継がれます'
    ]},
    { version:'3.6.0', date:'2026-10-23', items:[
      '🎃 ハロウィンパート2！ ハロウィン画面に新しいタブがたくさん増えました(🚪ドア / 🌱畑 / 📖図鑑 / 🎪スタンプ / 🌍みんなで)',
      '🚪 「トリック・オア・トリート」: 毎日3つのドアから1つ開けてプレゼント。🔮 おみくじ(1日1回)も追加',
      '🌱 「かぼちゃ畑」: 植えておくと時間で育ち、収穫でキャンディがもらえます(アプリを閉じていても育ちます)',
      '📖 「おばけ図鑑」24種: ゲームを遊ぶとおばけに出会えます。集めた数に応じてごほうび、コンプリートで限定スキン',
      '🎪 「スタンプラリー」: ミニゲームを1種類遊ぶごとにスタンプ。全部集めると限定スキン',
      '👻 ロビーに「さまようおばけ」が飛んでくるように。タップでつかまえるとキャンディ(金色は大当たり)',
      '🌍 「みんなでキャンディ大作戦」: 全員の累計キャンディが目標に届くたび、みんなにごほうび',
      '⚡ ボーナスタイム追加: 週末・毎晩20〜23時はキャンディ1.5倍、10/30・10/31(当日は3倍)・11/1はさらに増量',
      '🛤 ハロウィンロードが60段に拡大。新しいスキンを全8種追加(ガチャ2種 / 交換所2種 / ロード2種 / 図鑑・スタンプの記念各1種)',
      '📋 ミッションが日替わり4つ・週替わり4つに増え、ミニゲームや畑・ドアのミッションも登場。交換所の商品も増量',
      '🏷 新しい称号を追加(図鑑・スタンプ・畑・ドア・おばけ捕り・連続ログイン)',
      '🕹 ミニゲームを12本追加(全18本): ハロウィン・ラン(Chromeの恐竜ゲーム風) / ブロック崩し / キャンディキャッチ / スタック / 迷路 / スライド / ライツアウト / 反射神経 / ナンバータッチ / いろいろモンスター / ろうそくシモン / ばけばけ計算',
      '🐍 スネークにGoogleのヘビゲーム風の効果音を追加(食べる・曲がる・ぶつかる)',
      '🕹 ミニゲームのメニューをジャンル別に見分けやすく(アクション / パズル / はんしゃ / あたま)。NEWマークと「遊んだ」印つき',
      '📆 毎日ログインボーナス(1年中)を追加。連続日数で、7日ごと・14日・30日…に特別ボーナス',
      '🎁 アカウントを作ると、ウェルカムギフト(🪙3,000・🍬100・バトルパスXP)が届きます。ゲストでためたキャンディは引き継ぎOK',
      '🔔 ゲストの人には、アカウントを作るメリットをときどきお知らせ(ロビーにも案内バーが出ます)'
    ]},
    { version:'3.5.1', date:'2026-10-21', items:[
      '⚡ サーバーとの通信を見直し、読み込みの待ち時間を短縮(ログイン・新規登録も速くなりました)',
      '🔄 サーバーが眠っていたり、回線が一瞬途切れたりしても、自動でやり直して失敗しにくくなりました',
      '🎰 ガチャも、開いた瞬間に前回の内容を表示するようにしました'
    ]},
    { version:'3.5.0', date:'2026-10-21', items:[
      '✨ 起動時のロード画面を追加(サーバーが眠っているときは、その状況もお知らせします)',
      '🏷 「称号」を追加。遊び方に合わせて集められ、名前の横(ランキング・チャット・フレンド・プロフィール)に飾れます',
      '⚡ ランキング・投票・バトルパス・フレンド・チャットの読み込みと、メッセージ送信を高速化(開いた瞬間に前回の内容を表示)',
      '🔐 サーバーが眠っているときに、ログインが外れてしまうことがある問題を修正',
      '🏠 ホームのロゴ画像が、ハロウィンのバナーに重なる問題を修正'
    ]},
    { version:'3.4.1', date:'2026-10-21', items:[
      '🎫 バトルパスのレベルが大きくなっても、開くときに固まらないように修正(まとめて受け取りも一瞬で完了)',
      '🎰 ガチャの排出率をさらに引き下げ(通常: 1スキン0.4%・合計3.2% / ハロウィン: 1スキン0.5%・合計3%)',
      '🕹 ミニゲームの動作を軽く(iPadなどでのカクつきを軽減)',
      '🏆 ランキング画面の余計な表記を整理'
    ]},
    { version:'3.4.0', date:'2026-10-18', items:[
      '🗂 機能の置き場所を整理: ロビーも☰メニューも「あそぶ / あつめる / みんなと / せってい」の同じ区分に。☰メニューには検索欄も付きました',
      '🗳 「投票」を追加。ゲスト以外のみんなが、出された質問に投票できます(結果もリアルタイムで見られます)',
      '✏️ サーバーチャットとDMで、送ったメッセージの「編集」と「送信取り消し」ができるように(自分のメッセージをタップ)',
      '🎁 ギフト機能を追加。運営からのプレゼント(コイン・イベント通貨・XP・イベントXP)が届くと、ログイン時やゲームオーバー後にプレゼントボックスを開封できます'
    ]},
    { version:'3.3.0', date:'2026-10-18', items:[
      '🎁 ガチャ演出を追加！ 購入すると宝箱が降りてきて、揺れて、フタが開き、上でルーレットが回って結果が決まります(通常・ハロウィン共通、スキップも可)',
      '🏆 ミニゲームにランキングを追加(全6ゲーム・上位20人・自分の順位。メニューや結果画面から見られます)',
      '🔢 2048のタイルがスライドして、合体するとぽんっと弾むように',
      '🐍 パンプキン・スネークをヌルヌル動くように改善(1マスずつのカクカクをやめて、滑らかに補間)'
    ]},
    { version:'3.2.0', date:'2026-10-18', items:[
      '🕹 新しい「ミニゲーム」を6本追加(2048 / パンプキン・スネーク / おばけ神経衰弱 / おばけたたき / マイン・ハンター / ゴースト・フライト)。遊ぶとコイン・バトルパスXP・ハロウィンキャンディがもらえます',
      '🍬 ハロウィンガチャを、コインではなく専用通貨「ハロウィンキャンディ」で引くように変更(1回80個)。キャンディは集めやすく調整しました',
      '🎯 ガチャの天井を、通常・ハロウィンともに1000回に変更',
      '📢 更新履歴が他のUIと重なったり、一番奥に隠れたりする不具合を修正(専用のシートで表示)'
    ]},
    { version:'3.1.2', date:'2026-10-18', items:[
      '✨ 全体にアニメーションを追加(画面の切り替え・ボタン・ウィンドウ・リスト・ゲージ・数字・ゲーム中)',
      '👆 タップした場所に波紋が広がり、ボタンはぽよんと弾みます',
      '🪙 コインがふわっとカウントアップ / スコアが変わるとぽんっと弾む',
      '🧱 ハードドロップで盤面がズシンと揺れる',
      '⚙ 「動きを減らす」をオンにすると、アニメーションをまとめて止められます'
    ]},
    { version:'3.1.0', date:'2026-10-18', items:[
      '🏠 ホーム画面をロビー型に刷新(大きなPLAYボタン + 機能タイル + コイン・アカウント表示)',
      '🎮 ゲーム中のヘッダーを細いバーにして盤面を最大化。アイコン類は ☰ メニューにまとめました',
      '📋 ウィンドウを画面下から出るボトムシートに変更',
      '🧱 テトリスの操作ボタンを、両手の親指で押しやすい2ブロック配置に変更',
      '◇ 角丸を小さく、四隅に金の角飾りを付けたシャープなデザインに'
    ]},
    { version:'3.0.0', date:'2026-10-18', items:[
      '🎃 ハロウィン・ナイトフェス開催！ 期間限定ガチャ(1回5000コイン)・ロード・ミッション・交換所・ランキング',
      '👕 ハロウィンスキンを10種追加(ガチャ6種 / ロード2種 / 交換所2種)',
      '🎨 UIを一新(ガラス×金の高級感のあるデザイン、ハロウィン背景)',
      '🏁 テトリスに新モード「スプリント(40ライン)」と「ウルトラ(2分)」',
      '⚔️ フレンド対決でテトリスも遊べるように(ウルトラ2分のスコア勝負)',
      '🤖 テトリスAIをより人間らしい動きに(考える時間・迷い・ミス・ホールド)',
      '🛠 テトリスVS AIで自分の盤面が小さくなる問題を修正 / 先に詰まった方が負けに',
      '🎰 ガチャの排出率を下げ(1スキン1%)、排出率を画面に表示',
      '⚙ 設定に「動きを減らす」「振動」を追加 / 大きな数の表示を拡張',
      '🛠 オセロ・五目並べ・まるばつは修正中のため一時的に非表示'
    ]},
    { version:'2.2.0', date:'2026-10-13', items:[
      '🌀 テトリスに「Tスピン」を追加(ミニTスピン・B2B対応、回転はSRS準拠のウォールキックに)',
      '✨ テトリスに「パーフェクトクリア」を追加',
      '🐛 ライン消去中に▼長押しすると、ブロックが一気に消えるバグを修正',
      '🎰 ガチャの料金を1回2000コインに変更'
    ]},
    { version:'2.1.0', date:'2026-10-08', items:[
      '🎰 ガチャに「10連」を追加(無料チケットがあれば先に消費)',
      '🎁 バトルパスに「まとめて受け取る」ボタンを追加',
      '💤 サーバー・画面がスリープしにくいように改善',
      '🛠 GitHub Pages / Supabase に対応',
      '🐢 「別のゲーム」にウミガメのスープを追加'
    ]},
    { version:'2.0.2', date:'2026-09-07', items:[
      '📮 設定画面に「ご要望・不具合報告」を新設。ご要望と不具合報告を分けて送信でき、不具合報告には画像を添付可能に',
      '🐞 スキンが数秒後に元に戻ってしまうバグを修正',
      '🎨 スキン一覧を価格順に並び替え',
      '📜 更新履歴に「過去の履歴」を見られるページを追加'
    ]},
    { version:'2.0.1', date:'2026-09-07', items:[
      '⏱ タイムアタックモードのランキングを追加',
      '🔥 イベント機能を追加',
      '🔐 ログイン状態がリロードしても保持されるように改善',
      'その他のバグ修正',
      '',
      '📅 今後の予定',
      'リクエストに応えられるよう、要望を送信できるようにする',
      'フレンドとの対戦で、追加報酬が出るようにする',
      '🔐その他のバグ修正'
    ]},
    { version:'2.0.0', date:'2026-09', items:[
      '⏱ タイムアタックモードを追加(制限時間60秒、専用ハイスコア・別ランキング)',
      '🔥 コンボ倍率システムを追加(連続ライン消去でスコア倍率アップ)',
      '🧱 テトリスにHOLD機能・WASD操作・操作説明パネルを追加',
      '🏠 メインメニュー画面を新設。記録・実績、設定ページを追加',
      '🔊 サウンドを一新(より満足感のあるサウンドに)',
      '🐞 テトリスのハードドロップがiPad横画面で見えない不具合を修正'
    ]}
  ];
  // 更新履歴: 画面いっぱいの専用シート(ロビー・ゲーム中のどちらからでも、必ず一番手前に出る)
  function renderChangelogHTML(){
    const entries = CHANGELOG.map((v,i)=>`
      <details class="cl-item" ${i===0?'open':''}>
        <summary><span class="cl-ver">Ver ${v.version}</span><span class="cl-date">${v.date}</span>${i===0?'<span class="cl-new">NEW</span>':''}</summary>
        <div class="cl-items">${v.items.map(t=>`<div class="cl-line">${t}</div>`).join('')}</div>
      </details>`).join('');
    return `<div class="cl-sheet">
      <div class="qs-handle"></div>
      <div class="cl-head"><div class="cl-title">📢 更新履歴</div><button class="cl-close" id="clCloseBtn" type="button" aria-label="閉じる">✕</button></div>
      <div class="cl-body">${entries}</div>
    </div>`;
  }
  const changelogPanelEl = document.getElementById('changelogPanel');
  let changelogTimer = null;
  function openChangelogPanel(){
    clearTimeout(changelogTimer);
    changelogPanelEl.innerHTML = renderChangelogHTML();
    changelogPanelEl.classList.remove('closing');
    changelogPanelEl.classList.add('show');
    document.getElementById('clCloseBtn').addEventListener('click', closeChangelogPanel);
  }
  function closeChangelogPanel(){
    if(!changelogPanelEl.classList.contains('show')) return;
    if(motionOff()){ changelogPanelEl.classList.remove('show'); return; }
    changelogPanelEl.classList.add('closing');
    changelogTimer = setTimeout(()=>changelogPanelEl.classList.remove('show', 'closing'), 200);
  }
  changelogPanelEl.addEventListener('click', (e)=>{ if(e.target === changelogPanelEl) closeChangelogPanel(); });
  document.getElementById('versionBadge').addEventListener('click', ()=>{
    if(changelogPanelEl.classList.contains('show')) closeChangelogPanel(); else openChangelogPanel();
  });
  document.getElementById('titleChangelogBtn').addEventListener('click', openChangelogPanel);

  // ===================== 🆕 スケジュールイベント(管理者が設定した自動報酬)のカウントダウン表示 =====================
  let eventsData = [];
  const eventCountdownBadgeEl = document.getElementById('eventCountdownBadge');
  const eventCountdownTextEl = document.getElementById('eventCountdownText');

  async function fetchEventsList(){
    try{
      const r = await fetch(`${API_BASE_URL}/api/events/list`);
      const data = await r.json();
      eventsData = data.events || [];
      updateEventCountdownBadge();
    }catch(err){ /* 無視 */ }
  }

  function formatHMS(totalSec){
    const sec = Math.max(0, Math.round(totalSec));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function updateEventCountdownBadge(){
    if(!eventsData.length){ eventCountdownBadgeEl.style.display = 'none'; return; }
    const soonest = eventsData.reduce((a,b)=> a.secondsUntilNext<b.secondsUntilNext ? a : b);
    eventCountdownBadgeEl.style.display = 'block';
    eventCountdownTextEl.textContent = `⏰ ${formatHMS(soonest.secondsUntilNext)}`;
  }

  function tickEventCountdown(){
    if(!eventsData.length) return;
    eventsData.forEach(ev=>{ ev.secondsUntilNext = Math.max(0, ev.secondsUntilNext-1); });
    updateEventCountdownBadge();
    if(modalOverlay.classList.contains('show') && modalContent.dataset.mode==='events') renderEventsModal();
  }

  function eventWhenLabel(ev){
    const t = `${String(ev.hourJst).padStart(2,'0')}:${String(ev.minuteJst||0).padStart(2,'0')}`;
    if(ev.recurrence==='once') return `${ev.eventYear}/${ev.eventMonth}/${ev.eventDay} ${t} に一度だけ`;
    if(ev.recurrence==='weekly') return `毎週${['日','月','火','水','木','金','土'][ev.eventDay]}曜 ${t}`;
    if(ev.recurrence==='monthly') return `毎月${ev.eventDay}日 ${t}`;
    return `毎日 ${t}`;
  }

  function renderEventsModal(){
    modalContent.dataset.mode = 'events';
    let html = `<h2 style="color:var(--gold);">🎉 イベント一覧</h2>
      <div class="sub" style="margin-bottom:10px;">指定した日時(日本時間)になると、対象ランキングの順位者へ自動でコインが配布されます。</div>`;
    if(eventsData.length===0){
      html += `<div class="empty-hint">現在開催中のイベントはありません。</div>`;
    } else {
      eventsData.slice().sort((a,b)=>a.secondsUntilNext-b.secondsUntilNext).forEach(ev=>{
        const modeLabel = RANKING_MODE_LABELS[ev.rankingMode] || ev.rankingMode;
        html += `
          <div class="quest-item">
            <div class="qtitle">${modeLabel}ランキング ${ev.rankPosition}位 → 🪙${formatNumber(ev.rewardCoins)}</div>
            <div class="sub">${eventWhenLabel(ev)}(日本時間)に自動配布</div>
            <div class="sub" style="color:var(--mint); font-weight:800; margin-top:4px;">次回まで: ${formatHMS(ev.secondsUntilNext)}</div>
          </div>`;
      });
    }
    modalContent.innerHTML = html;
  }

  eventCountdownBadgeEl.addEventListener('click', ()=>{
    renderEventsModal();
    modalOverlay.classList.add('show');
  });

  // ===================== 🎃 ハロウィンイベント(期間はサーバーが管理。終了したら自動で消える) =====================
  const EVENT_CACHE_KEY = 'nexus-event-v1';
  const EVENT_PREF_KEY = 'nexus-uiprefs-v1';
  let eventInfo = null;        // { phase, startsAt, endsAt, graceEndsAt, skew }
  let hwState = null;          // /api/event/halloween/state の結果
  let hwTab = 'home';
  let uiPrefs = { hwTheme:true, reduceMotion:false, vibrate:true };

  function loadUiPrefs(){
    try{ Object.assign(uiPrefs, JSON.parse(localStorage.getItem(EVENT_PREF_KEY) || '{}')); }catch(e){}
    try{ const raw = localStorage.getItem(EVENT_CACHE_KEY); if(raw) eventInfo = JSON.parse(raw); }catch(e){}
  }
  function saveUiPrefs(){ try{ localStorage.setItem(EVENT_PREF_KEY, JSON.stringify(uiPrefs)); }catch(e){} }

  // 端末の時計がずれていても、サーバーの時刻との差(skew)で補正して判定する
  function eventPhaseNow(){
    if(!eventInfo) return 'ended';
    const now = Date.now() + (eventInfo.skew || 0);
    if(now < Date.parse(eventInfo.startsAt)) return 'upcoming';
    if(now < Date.parse(eventInfo.endsAt)) return 'active';
    if(now < Date.parse(eventInfo.graceEndsAt)) return 'grace';
    return 'ended';
  }
  function eventMsLeft(which){
    const target = Date.parse(which==='grace' ? eventInfo.graceEndsAt : eventInfo.endsAt);
    return target - (Date.now() + (eventInfo.skew || 0));
  }
  function fmtRemain(ms){
    if(ms <= 0) return '終了';
    const s = Math.floor(ms/1000), d = Math.floor(s/86400), h = Math.floor(s%86400/3600), m = Math.floor(s%3600/60), sec = s%60;
    const pad = n=>String(n).padStart(2,'0');
    return d>0 ? `${d}日 ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }
  function fmtDateJst(iso){
    const d = new Date(Date.parse(iso));
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ハロウィンUI(背景・装飾・配色)を出すかどうか。開催中だけ。終了時刻を過ぎれば、アップデート無しで元のUIに戻る
  function hwThemeOn(){ return uiPrefs.hwTheme && eventPhaseNow()==='active'; }
  function refreshEventTheme(){
    const on = hwThemeOn();
    const was = document.body.classList.contains('hw');
    document.body.classList.toggle('hw', on);
    document.body.classList.toggle('winter', !on && eventPhaseNow()!=='active');      // v4.3: ハロウィンが終わったら、メニューは冬仕様
    document.body.classList.toggle('reduce-motion', !!uiPrefs.reduceMotion);
    if(on !== was && typeof applySkin === 'function' && equippedSkin){ try{ applySkin(equippedSkin); }catch(e){} }
  }
  function updateEventButtons(){
    const btn = document.getElementById('titleEventBtn');
    if(!btn) return;
    const ph = eventPhaseNow();
    const show = (ph==='active' || ph==='grace');
    btn.style.display = show ? '' : 'none';
    if(show){
      const label = document.getElementById('titleEventTimer');
      if(label) label.textContent = ph==='active' ? `開催中 あと${fmtRemain(eventMsLeft('end'))}` : `受取期限 あと${fmtRemain(eventMsLeft('grace'))}`;
    }
  }

  async function fetchEventStatus(){
    try{
      const res = await fetch(`${API_BASE_URL}/api/event/status`, { cache:'no-store' });
      const data = await res.json();
      const h = data && data.halloween;
      if(h){
        eventInfo = { ...h, skew: Date.parse(h.serverNow) - Date.now() };
        try{ localStorage.setItem(EVENT_CACHE_KEY, JSON.stringify(eventInfo)); }catch(e){}
      }
    }catch(err){ /* 通信できなければ前回の情報(キャッシュ)のまま判定する */ }
    refreshEventTheme();
    updateEventButtons();
  }

  async function hwApi(path, method, body){
    const res = await fetch(`${API_BASE_URL}/api/event/halloween/${path}`, {
      method: method || 'GET',
      headers: { 'Content-Type':'application/json', ...(authToken ? { 'Authorization':`Bearer ${authToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try{ data = await res.json(); }catch(e){}
    if(!res.ok) throw new Error((data && data.error) || '通信に失敗しました');
    return data;
  }

  // 画面下に出る小さな通知
  function showEventToast(text){
    let box = document.getElementById('eventToastBox');
    if(!box){ box = document.createElement('div'); box.id = 'eventToastBox'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'event-toast';
    el.textContent = text;
    box.appendChild(el);
    setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 400); }, 2600);
  }

  // ゲーム終了時に呼ぶ: キャンディ獲得・ミッション進行(開催中でログイン中のときだけ)
  async function reportEventGame(info){
    // 🎁 ゲームが終わったら、届いているギフトを確認する(プレイ中には出さず、ゲームオーバー後に出す)
    setTimeout(()=>{ try{ if(window.GiftFx) window.GiftFx.check('gameover'); }catch(e){} }, 1600);
    if(!authToken){ if(eventPhaseNow()==='active' && window.CBEngage) window.CBEngage.guestPlayed(info); return; }   // ゲスト: かりキャンディ(登録で引き継ぎ)
    if(eventPhaseNow()!=='active') return;
    try{
      const data = await hwApi('report', 'POST', info);
      if(data && data.active && data.gained > 0) showEventToast(`🍬 キャンディ +${data.gained}${data.multiplier > 1 ? `(⚡${data.multiplier}倍!)` : ''}`);
      if(data && data.dex){ const dx = data.dex; setTimeout(()=>showEventToast(dx.new ? `📖 NEW! ${dx.emoji}${dx.name} が図鑑に仲間入り！` : `📖 ${dx.emoji}${dx.name} に再会(🍬+${dx.candies})`), 700); }
      if(data && data.newStamp) setTimeout(()=>showEventToast('🎪 スタンプをゲット！'), 1500);
      ((data && data.newlyCompleted) || []).forEach((t,i)=> setTimeout(()=>showEventToast(`✅ ミッション達成: ${t}`), 900*(i+1)));
    }catch(err){ /* 報告に失敗してもゲームには影響させない */ }
  }

  // ---------- 表示用ヘルパー ----------
  function hwSkinName(id){ const s = SKINS.find(x=>x.id===id); return s ? s.name : id; }
  function hwRewardText(r){
    if(r.type==='coins') return `🪙 ${formatNumber(r.amount)}`;
    if(r.type==='ticket') return `🎟 ハロウィンチケット×${r.amount}`;
    if(r.type==='bpxp') return `🎫 バトルパスXP +${formatNumber(r.amount)}`;
    if(r.type==='skin') return `${hwSkinName(r.skinId)}${r.extraCoins ? ` ＋🪙${formatNumber(r.extraCoins)}` : ''}`;
    return '';
  }
  function hwSwatches(id, n){
    const s = SKINS.find(x=>x.id===id);
    if(!s) return '';
    return `<div class="skin-swatches" style="justify-content:center;">${buildPatternedColors(s.colors, s.pattern).slice(0, n||5).map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>`;
  }
  function hwApplyWallet(d){
    if(d.coins != null){ coins = d.coins; updateCoinUI(); if(hwState) hwState.coins = d.coins; }
    if(d.ownedSkins){ ownedSkins = d.ownedSkins; saveSkinsData(); if(hwState) hwState.ownedSkins = d.ownedSkins; }
    if(hwState){
      if(d.candies != null) hwState.candies = d.candies;
      if(d.tickets != null) hwState.tickets = d.tickets;
    }
  }

  // パート2の画面(halloween2.js)に渡す道具
  function hw2Ctx(){
    return {
      api: hwApi, fmt: formatNumber, rewardText: hwRewardText, swatches: hwSwatches, skinName: hwSkinName,
      applyWallet: hwApplyWallet, sound: playSound, toast: showEventToast, closeModal,
      active: ()=> eventPhaseNow()==='active',
      nowSec: ()=> (Date.now() + ((eventInfo && eventInfo.skew) || 0)) / 1000,
      rerender: ()=> renderHalloween(),
      refresh: async (msg)=>{ hwState = await hwApi('state'); renderHalloween(msg ? `<div class="hw-banner ok">${msg}</div>` : ''); },
      silentRefresh: async ()=>{ try{ hwState = await hwApi('state'); }catch(e){} }
    };
  }

  // ---------- モーダル ----------
  async function openHalloweenModal(tab){
    modalContent.dataset.mode = 'halloween';
    hwTab = tab || 'home';
    modalOverlay.classList.add('show');
    const ph = eventPhaseNow();
    if(ph!=='active' && ph!=='grace'){
      modalContent.innerHTML = `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">現在開催していません。</div>`;
      return;
    }
    if(!authToken){
      modalContent.innerHTML = window.HW2 ? HW2.guestHtml() : `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">イベントに参加するにはログインが必要です。<br>右上の 👤 からログインしてください。</div>`;
      if(window.HW2) HW2.bindGuest(modalContent);
      return;
    }
    modalContent.innerHTML = `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">読み込み中...</div>`;
    try{
      hwState = await hwApi('state');
      if(modalContent.dataset.mode !== 'halloween') return;
      renderHalloween();
    }catch(err){
      modalContent.innerHTML = `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">${err.message}</div>`;
    }
  }

  // [キー, '絵文字 名前', NEWバッジ] — 受け取れるものがあるタブには、サーバーの badges で赤丸が付く
  const HW_TABS = [['home','🏠 ホーム'],['part3','🍪 パート3',1],['raid','👹 ボス',1],['road','🛤 ロード'],['missions','📋 ミッション'],['tot','🚪 ドア',1],['patch','🌱 畑',1],['dex','📖 図鑑',1],['stamps','🎪 スタンプ',1],['gacha','🎰 ガチャ'],['shop','🛒 交換所'],['community','🌍 みんなで',1],['ranking','🏆 ランキング']];
  let hwTimerHandle = null;

  function renderHalloween(extraHtml){
    const s = hwState;
    if(!s) return;
    const active = eventPhaseNow()==='active';
    let html = `
      <h2 class="hw-h2">🎃 ハロウィン・ナイトフェス</h2>
      <div class="hw-head">
        <div class="hw-timer" id="hwTimer"></div>
        <div class="hw-wallet">
          <span title="キャンディ">🍬 <b>${formatNumber(s.candies)}</b></span>
          <span title="ハロウィンチケット">🎟 <b>${formatNumber(s.tickets)}</b></span>
          <span title="コイン">🪙 <b>${formatNumber(s.coins)}</b></span>
        </div>
      </div>
      <div class="tab-row hw-tabs">${HW_TABS.map(([k,l,isNew])=>{ const sp = l.indexOf(' '), bd = (s.badges && s.badges[k]) || 0; return `<button class="tab-btn hw-tab ${hwTab===k?'active':''} ${isNew?'new':''}" data-hwtab="${k}"><span class="hw-ti">${l.slice(0,sp)}</span><span class="hw-tl">${l.slice(sp+1)}</span>${bd?`<i class="hw-bd">${bd>9?'9+':bd}</i>`:''}</button>`; }).join('')}</div>
      ${window.HW2 ? HW2.boostBar(s) : ''}
      ${active ? '' : `<div class="hw-banner warn">⏳ イベントは終了しました。報酬の受け取りと交換所だけ、あと少し使えます。</div>`}
      ${extraHtml || ''}
      <div id="hwBody"></div>`;
    modalContent.innerHTML = html;
    { const at = modalContent.querySelector('.hw-tab.active'); if(at && at.scrollIntoView) at.scrollIntoView({ inline:'center', block:'nearest' }); }
    modalContent.querySelectorAll('[data-hwtab]').forEach(b=>b.addEventListener('click', ()=>{
      hwTab = b.dataset.hwtab; renderHalloween();
    }));
    const body = document.getElementById('hwBody');
    if(hwTab==='home') body.innerHTML = hwHomeHtml();
    else if(hwTab==='road') body.innerHTML = hwRoadHtml();
    else if(hwTab==='missions') body.innerHTML = hwMissionsHtml();
    else if(hwTab==='gacha') body.innerHTML = hwGachaHtml();
    else if(hwTab==='shop') body.innerHTML = hwShopHtml();
    else if(hwTab==='ranking'){ body.innerHTML = `<div class="empty-hint">読み込み中...</div>`; hwLoadRanking(); }
    else if(window.HW2 && HW2.has(hwTab)) body.innerHTML = HW2.render(hwTab, hwState, hw2Ctx());
    hwBindBody();
    if(window.HW2 && HW2.has(hwTab)) HW2.bind(hwTab, modalContent, hwState, hw2Ctx());

    const tick = ()=>{
      const el = document.getElementById('hwTimer');
      if(!el || modalContent.dataset.mode!=='halloween'){ clearInterval(hwTimerHandle); hwTimerHandle = null; return; }
      const ph = eventPhaseNow();
      if(ph==='active') el.textContent = `⏰ 開催終了まで ${fmtRemain(eventMsLeft('end'))}`;
      else if(ph==='grace') el.textContent = `⏳ 受取期限まで ${fmtRemain(eventMsLeft('grace'))}`;
      else { el.textContent = '終了しました'; }
    };
    tick();
    if(hwTimerHandle) clearInterval(hwTimerHandle);
    hwTimerHandle = setInterval(tick, 1000);
  }

  // ----- ホーム -----
  function hwHomeHtml(){
    const s = hwState, lg = s.login;
    const next = s.road.find(t=>!t.reached);
    const prevNeed = next ? (s.road[next.tier-2] ? s.road[next.tier-2].need : 0) : 0;
    const pct = next ? Math.max(0, Math.min(100, Math.round((s.totalCandies - prevNeed) / (next.need - prevNeed) * 100))) : 100;
    const days = lg.rewards.map((r,i)=>{
      const d = i+1;
      const done = lg.claimedToday ? d <= lg.day : d < lg.day;
      const cur = !lg.claimedToday && d === lg.day;
      return `<div class="hw-day ${done?'done':''} ${cur?'cur':''}">
        <div class="hw-day-n">${d}日目</div>
        <div class="hw-day-r">🍬${r.candies}<br>🪙${formatNumber(r.coins)}${r.tickets?`<br>🎟×${r.tickets}`:''}</div>
        ${done?'<div class="hw-day-check">✓</div>':''}
      </div>`;
    }).join('');
    const claimable = !lg.claimedToday && eventPhaseNow()==='active';
    return `
      ${window.HW2 ? HW2.homeTop(s, hw2Ctx()) : ''}
      <div class="hw-card">
        <div class="qtitle">🎁 トリック・オア・トリート(毎日ログインボーナス)</div>
        <div class="hw-days">${days}</div>
        <button class="primary-btn" id="hwLoginBtn" style="margin-top:10px;" ${claimable?'':'disabled'}>${lg.claimedToday ? '✓ 今日は受け取り済み' : (eventPhaseNow()==='active' ? '🎁 今日のボーナスを受け取る' : '受付終了')}</button>
        <div class="sub" style="margin-top:6px;">連続ログイン ${lg.streak}日。7日目はハロウィンチケットがもらえます。</div>
      </div>
      <div class="hw-card">
        <div class="qtitle">🛤 ハロウィンロード</div>
        <div class="sub">累計 🍬${formatNumber(s.totalCandies)} ${next ? `／ 次の報酬(${next.tier}段目)まで あと🍬${formatNumber(next.need - s.totalCandies)}` : '／ 🎉 全段クリア！'}</div>
        <div class="quest-bar-bg" style="margin-top:6px;"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <button class="claim-btn" data-hwgo="road" style="margin-top:8px;">ロードを見る</button>
      </div>
      <div class="hw-card">
        <div class="qtitle">🍬 キャンディの集め方</div>
        <div class="sub hw-list">
          ・どのゲーム(ミニゲームも)も、遊ぶたびにキャンディがもらえる(高得点・ライン消し・Tスピン・パーフェクトクリアでボーナス)<br>
          ・毎日のミッション(3つ)と、毎週のミッション(3つ)をクリア<br>
          ・毎日のログインボーナス<br>
          ・フレンド対決をプレイすると +10 ボーナス<br>
          ・🚪 トリック・オア・トリートと 🔮 おみくじ(毎日)/ 🌱 かぼちゃ畑の収穫 / 👻 ロビーに飛んでくるおばけ<br>
          ・📖 図鑑・🎪 スタンプラリー・🌍 みんなの目標のごほうび<br>
          ・⚡ ボーナスタイム(週末・毎晩20〜23時・10/30〜11/1)はキャンディが増える<br>
          ・ハロウィンガチャは、ハズレでもキャンディが少し戻ってくる<br>
          ・集めたキャンディは、ガチャ(1回🍬80)・交換所・ロード・ランキングに使われます<br>
          ・ガチャや交換所で使っても、ロードの進行(累計)は減りません
        </div>
      </div>
      <div class="hw-card">
        <div class="qtitle">📅 開催期間</div>
        <div class="sub">${fmtDateJst(eventInfo.startsAt)} 〜 ${fmtDateJst(eventInfo.endsAt)}(日本時間)<br>
        ⚠️ ハロウィンガチャと新規のキャンディ獲得は、終了時刻で自動的に終了します(余ったキャンディは交換所で使えます)。終了後 約2日間は、報酬の受け取りと交換所が使えます。<br>
        入手したスキンは、イベント終了後もずっと使えます。</div>
      </div>`;
  }

  // ----- ロード -----
  function hwRoadHtml(){
    const s = hwState;
    const claimable = s.road.filter(t=>t.reached && !t.claimed);
    let html = `
      <div class="sub" style="margin-bottom:8px;">累計 🍬${formatNumber(s.totalCandies)}(使ってもロードの進行は減りません)</div>
      <button class="primary-btn" id="hwRoadAll" ${claimable.length?'':'disabled'}>🎁 まとめて受け取る${claimable.length?`(${claimable.length}件)`:''}</button>
      <div class="hw-road">`;
    s.road.forEach(t=>{
      const big = t.reward.type==='skin';
      html += `
        <div class="hw-road-row ${t.claimed?'claimed':''} ${t.reached&&!t.claimed?'ready':''} ${big?'big':''}">
          <div class="hw-road-tier">${t.tier}</div>
          <div class="hw-road-info">
            <div class="hw-road-reward">${hwRewardText(t.reward)}</div>
            <div class="hw-road-need">🍬 ${formatNumber(t.need)}</div>
            ${big ? hwSwatches(t.reward.skinId, 5) : ''}
          </div>
          <div class="hw-road-act">
            ${t.claimed ? '<span class="hw-done">済</span>' : (t.reached ? `<button class="claim-btn" data-hwroad="${t.tier}">受け取る</button>` : '<span class="hw-lock">🔒</span>')}
          </div>
        </div>`;
    });
    return html + `</div>`;
  }

  // ----- ミッション -----
  function hwMissionCard(m, scope){
    const pct = Math.round(m.progress / m.target * 100);
    return `
      <div class="hw-mission ${m.claimed?'claimed':''}">
        <div class="hw-mission-top"><span>${m.text}</span><span class="hw-mission-reward">🍬${m.candies}</span></div>
        <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="hw-mission-foot"><span>${formatNumber(m.progress)} / ${formatNumber(m.target)}</span>
          ${m.claimed ? '<span class="hw-done">受取済</span>' : `<button class="claim-btn" data-hwmission="${m.id}" ${m.done?'':'disabled'}>受け取る</button>`}
        </div>
      </div>`;
  }
  function hwMissionsHtml(){
    const s = hwState;
    const ready = [...s.daily, ...s.weekly].filter(m=>m.done && !m.claimed).length;
    return `
      <button class="primary-btn" id="hwMissionAll" ${ready?'':'disabled'}>🎁 まとめて受け取る${ready?`(${ready}件)`:''}</button>
      <div class="qtitle" style="margin:12px 0 6px;">☀️ 今日のミッション <span class="sub">(毎日0時に入れ替わり)</span></div>
      ${s.daily.map(m=>hwMissionCard(m,'daily')).join('')}
      <div class="qtitle" style="margin:12px 0 6px;">🌙 今週のミッション <span class="sub">(毎週月曜0時に入れ替わり)</span></div>
      ${s.weekly.map(m=>hwMissionCard(m,'weekly')).join('')}`;
  }

  // ----- ハロウィンガチャ -----
  function hwGachaHtml(){
    const s = hwState, g = s.gacha, active = eventPhaseNow()==='active';
    const tk = s.tickets;
    const canOne = active && (tk > 0 || s.candies >= g.cost);
    const usedTk10 = Math.min(tk, 10), candies10 = (10 - usedTk10) * g.cost;
    const canTen = active && s.candies >= candies10;
    const pct = Math.min(100, Math.round(g.pity / g.pityThreshold * 100));
    const pct2 = n => (n*100).toFixed(2).replace(/\.?0+$/,'');
    const cards = g.pool.map(id=>`
      <div class="hw-gcard ${s.ownedSkins.includes(id)?'owned':''}">
        ${hwSwatches(id, 4)}
        <div class="hw-gname">${hwSkinName(id)}</div>
        <div class="hw-gown">${s.ownedSkins.includes(id)?'✓ 入手済み':'未入手'}</div>
      </div>`).join('');
    return `
      <div class="hw-banner">⏰ ハロウィンガチャは <b>${fmtDateJst(eventInfo.endsAt)}</b> で終了します(終了後は引けなくなります)</div>
      <div class="hw-gpool">${cards}</div>
      <div class="hw-card">
        <div class="sub hw-list">
          📊 排出率: 1スキン ${pct2(g.ratePerSkin)}% ／ 合計 ${pct2(g.rateTotal)}%<br>
          🎯 天井: ${g.pityThreshold}回(未所持のスキンから優先して確定)<br>
          🍬 ハロウィンキャンディ専用ガチャ(コインは使いません)。1回 🍬${g.cost}<br>
          🔁 被り: 🍬${g.dupCandies}が戻る ／ ハズレ: 🍬${g.missCandies}が戻る
        </div>
        <div class="quest-bar-bg" style="margin-top:8px;"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="sub" style="margin-top:4px;">天井まで: ${g.pity} / ${g.pityThreshold}回(累計 ${g.pulls}回)</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="primary-btn" data-hwpull="1" style="flex:1;" ${canOne?'':'disabled'}>${tk>0 ? '🎟 チケットで1回' : `🎃 1回 (🍬${formatNumber(g.cost)})`}</button>
        <button class="primary-btn" data-hwpull="10" style="flex:1;" ${canTen?'':'disabled'}>🎃 10連 (🍬${formatNumber(candies10)}${usedTk10?` ＋🎟×${usedTk10}`:''})</button>
      </div>
      <div class="sub" style="margin-top:8px;">所持: 🍬 ${formatNumber(s.candies)} ／ 🎟 ${formatNumber(tk)}</div>
      <div id="hwGachaResult" style="margin-top:10px;"></div>`;
  }
  function hwResultHtml(d){
    const rows = d.results.map((r,i)=>{
      let label, cls = '';
      if(r.resultType==='win'){ label = `${r.pityTriggered?'🎯':'🎉'} ${hwSkinName(r.skinId)} 獲得！`; cls = 'win'; }
      else if(r.resultType==='duplicate'){ label = `🔁 ${hwSkinName(r.skinId)} 被り (+🍬${r.candiesGained})`; }
      else { label = `ハズレ (+🍬${r.candiesGained})`; cls = 'miss'; }
      return `<div class="hw-res-row ${cls}">${d.results.length>1 ? (i+1)+'. ' : ''}${label}</div>`;
    }).join('');
    const wins = d.results.filter(r=>r.resultType==='win');
    const swatches = wins.map(w=>hwSwatches(w.skinId,5)).join('');
    return `<div class="hw-card ${wins.length?'gold':''}"><div class="qtitle" style="text-align:center;">${wins.length?'🎉 ':''}${d.results.length>1?'10連結果':'結果'}</div>${swatches}${rows}</div>`;
  }
  function hwFxItem(r){
    const skin = r.skinId ? SKINS.find(x=>x.id === r.skinId) : null;
    return { type:r.resultType, name: skin ? skin.name : 'ハズレ', sw: fxSwatches(skin), pity: !!r.pityTriggered,
      extra: r.resultType === 'duplicate' ? `代わりに 🍬${r.candiesGained} を獲得` : (r.resultType === 'miss' ? `🍬${r.candiesGained} を獲得` : '') };
  }
  async function hwPull(count){
    const btns = modalContent.querySelectorAll('[data-hwpull]');
    btns.forEach(b=>b.disabled = true);
    const area = document.getElementById('hwGachaResult');
    if(area) area.innerHTML = `<div class="empty-hint">🎃 抽選中...</div>`;
    // 🎁 購入した瞬間に宝箱が降りてくる
    const poolIds = (hwState && hwState.gacha && hwState.gacha.pool) || [];
    const fx = window.GachaFx ? window.GachaFx.begin({ kind:'halloween', count, pool: poolIds.map(id=>{ const k = SKINS.find(x=>x.id === id); return { name: k ? k.name : id, sw: fxSwatches(k, 4) }; }) }) : null;
    try{
      const d = await hwApi('gacha/pull', 'POST', { count });
      hwApplyWallet(d);
      hwState.gacha.pity = d.pity; hwState.gacha.pulls = d.pulls;
      let again = false;
      if(fx){ again = (await fx.reveal(d.results.map(hwFxItem))) === 'again'; }       // 宝箱 → ルーレット → 結果
      else if(d.results.some(r=>r.resultType==='win'||r.resultType==='duplicate')) playSound('coin');
      if(modalContent.dataset.mode === 'halloween'){
        renderHalloween();
        const ra = document.getElementById('hwGachaResult'); if(ra) ra.innerHTML = hwResultHtml(d);
      }
      if(again) hwPull(count);
    }catch(err){
      if(fx) fx.abort();
      if(area) area.innerHTML = `<div class="empty-hint">${err.message}</div>`;
      btns.forEach(b=>b.disabled = false);
      fetchEventStatus();   // 終了していた場合は、画面もすぐ閉じる/切り替える
    }
  }

  // ----- 交換所 -----
  function hwShopHtml(){
    const s = hwState;
    return `<div class="sub" style="margin-bottom:8px;">キャンディ 🍬${formatNumber(s.candies)} 所持中(交換で減っても、ロードの進行には影響しません)</div>` +
      s.shop.map(it=>{
        const left = it.limit - it.bought;
        const can = left > 0 && s.candies >= it.cost;
        const skin = it.give.type==='skin';
        return `
          <div class="hw-card">
            <div class="qtitle">${it.name}</div>
            ${skin ? hwSwatches(it.give.skinId, 5) : ''}
            <div class="sub" style="margin:2px 0 8px;">${it.desc}</div>
            <div class="quest-foot"><span>🍬 ${formatNumber(it.cost)} ／ 残り ${left}/${it.limit}</span>
              <button class="claim-btn" data-hwbuy="${it.id}" ${can?'':'disabled'}>${left<=0?'交換済み':'交換する'}</button></div>
          </div>`;
      }).join('');
  }

  // ----- ランキング -----
  async function hwLoadRanking(){
    const body = document.getElementById('hwBody');
    try{
      const d = await hwApi('ranking');
      if(hwTab!=='ranking' || !body) return;
      const me = d.me;
      let html = `<div class="sub" style="margin-bottom:8px;">累計キャンディのランキング(上位20人)。あなた: ${me.rank ? `${me.rank}位 / 🍬${formatNumber(me.total)}` : '圏外(まだ0)'}</div>`;
      html += d.ranking.length ? d.ranking.map((r,i)=>`
        <div class="friend-item ${r.id===me.id?'pending':''}"><span class="fname">${['🥇','🥈','🥉'][i] || (i+1)+'位'} ${whoHtml(r)}</span><span class="fsub">🍬 ${formatNumber(r.total)}</span></div>`).join('')
        : `<div class="empty-hint">まだ誰もキャンディを集めていません。一番乗りを目指そう！</div>`;
      body.innerHTML = html;
    }catch(err){ if(body) body.innerHTML = `<div class="empty-hint">${err.message}</div>`; }
  }

  // ----- ボタンの結びつけ -----
  function hwBindBody(){
    const on = (sel, fn)=> modalContent.querySelectorAll(sel).forEach(el=>el.addEventListener('click', ()=>fn(el)));
    const run = async (fn, okMsg)=>{
      try{ const d = await fn(); hwApplyWallet(d); hwState = await hwApi('state'); renderHalloween(okMsg ? `<div class="hw-banner ok">${okMsg(d)}</div>` : ''); playSound('coin'); }
      catch(err){ alert(err.message); }
    };
    on('[data-hwgo]', el=>{ hwTab = el.dataset.hwgo; renderHalloween(); });
    on('#hwLoginBtn', ()=>run(()=>hwApi('login-bonus','POST'), d=>`🎁 ${d.day}日目のボーナス: 🍬${d.reward.candies} 🪙${formatNumber(d.reward.coins)}${d.reward.tickets?` 🎟×${d.reward.tickets}`:''}`));
    on('#hwRoadAll', ()=>run(()=>hwApi('road/claim','POST',{all:true}), d=>`🎁 ${d.claimedCount}件受け取りました: ${d.gained.join(' / ')}`));
    on('[data-hwroad]', el=>run(()=>hwApi('road/claim','POST',{tier:parseInt(el.dataset.hwroad)}), d=>`🎁 受け取りました: ${d.gained.join(' / ')}`));
    on('#hwMissionAll', ()=>run(()=>hwApi('missions/claim','POST',{all:true}), d=>`🍬 ミッション報酬 ${d.claimedCount}件(+${d.candies})`));
    on('[data-hwmission]', el=>run(()=>hwApi('missions/claim','POST',{id:el.dataset.hwmission}), d=>`🍬 +${d.candies}`));
    on('[data-hwbuy]', el=>run(()=>hwApi('shop/buy','POST',{id:el.dataset.hwbuy}), d=>`🛒 交換しました: ${d.gained}`));
    on('[data-hwpull]', el=>hwPull(parseInt(el.dataset.hwpull)));
  }

  // ハロウィン背景(コウモリ・おばけ・カボチャ)。表示/非表示は CSS の body.hw で切り替わる
  function buildHwBg(){
    const box = document.getElementById('hwBg');
    if(!box || box.childElementCount) return;
    const items = ['🦇','🦇','🦇','🦇','🦇','👻','👻','🎃','🕸️','🦇'];
    items.forEach((emoji, i)=>{
      const el = document.createElement('span');
      const ghost = (emoji==='👻' || emoji==='🎃' || emoji==='🕸️');
      el.className = 'hw-fly' + (ghost ? ' ghost' : '');
      el.textContent = emoji;
      el.style.left = (ghost ? (8 + (i*13)%80) : 0) + 'vw';
      el.style.top = (ghost ? 45 + (i*7)%40 : 6 + (i*11)%46) + 'vh';
      el.style.fontSize = (ghost ? 26 + (i%3)*6 : 16 + (i%4)*5) + 'px';
      el.style.setProperty('--dur', (ghost ? 14 + (i%4)*3 : 20 + (i*3)%16) + 's');
      el.style.setProperty('--delay', (-(i*4.3)) + 's');
      box.appendChild(el);
    });
  }
  buildHwBg();

  loadUiPrefs();
  refreshEventTheme();
  document.getElementById('titleEventBtn').addEventListener('click', ()=>{ hideTitleScreen(); openHalloweenModal('home'); });
  updateEventButtons();
  setInterval(()=>{ if(document.body.classList.contains('mg-open')) return; updateEventButtons(); const on = hwThemeOn(); if(on !== document.body.classList.contains('hw')) refreshEventTheme(); }, 1000);
  fetchEventStatus();
  setInterval(fetchEventStatus, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) fetchEventStatus(); });


  // ===================== 🧭 メニュー: ロビーと ☰ が同じ区分・同じ中身(あそぶ / あつめる / みんなと / せってい) =====================
  (function setupNewLayout(){
    const sheet = document.getElementById('quickSheetWrap');
    const lobbyName = document.getElementById('lobbyAccountName'), lobbyCoins = document.getElementById('lobbyCoins');
    const menuDot = document.getElementById('menuDot'), lobbyMenuDot = document.getElementById('lobbyMenuDot');
    const search = document.getElementById('qsSearch'), emptyEl = sheet.querySelector('.qs-empty');
    const evItem = sheet.querySelector('.ev-only');
    let sheetTimer = null;
    const items = Array.from(sheet.querySelectorAll('.qs-sec .icon-btn'));
    function applySearch(){
      const q = (search.value || '').trim().toLowerCase();
      let visible = 0;
      sheet.querySelectorAll('.qs-sec').forEach(sec=>{
        let n = 0;
        sec.querySelectorAll('.icon-btn').forEach(it=>{
          const hay = ((it.dataset.label || '') + ' ' + (it.textContent || '')).toLowerCase();
          const hit = !q || hay.includes(q);
          it.classList.toggle('hide-q', !hit); it.classList.toggle('hit', !!q && hit);
          const hiddenBy = (sheet.dataset.ctx === 'game' && it.classList.contains('lobby-only')) || (it.style.display === 'none');
          if(hit && !hiddenBy) n++;
        });
        sec.classList.toggle('hide-q', n === 0); visible += n;
      });
      emptyEl.style.display = visible ? 'none' : 'block';
    }
    const toggle = (on, ctx)=>{
      clearTimeout(sheetTimer);
      if(on){
        sheet.dataset.ctx = ctx || (document.getElementById('titleScreen').classList.contains('hidden') ? 'game' : 'lobby');
        search.value = ''; applySearch();
        sheet.classList.remove('closing'); sheet.classList.add('show'); return;
      }
      if(!sheet.classList.contains('show')) return;
      if(motionOff()){ sheet.classList.remove('show'); return; }
      sheet.classList.add('closing');
      sheetTimer = setTimeout(()=>{ sheet.classList.remove('show', 'closing'); }, 200);
    };
    document.getElementById('menuSheetBtn').addEventListener('click', ()=>toggle(true, 'game'));
    document.getElementById('lobbyMenuBtn').addEventListener('click', ()=>toggle(true, 'lobby'));
    search.addEventListener('input', applySearch);
    // 背景タップ・項目タップで閉じる(サウンドのON/OFFだけは開いたまま)
    sheet.addEventListener('click', (e)=>{
      if(e.target === sheet) return toggle(false);
      const item = e.target.closest && e.target.closest('.icon-btn');
      if(!item || item.id === 'soundBtn') return;
      if(item.dataset.act === 'gift'){ if(window.GiftFx) window.GiftFx.check('manual'); }
      toggle(false);
    });
    // data-proxy="○○" のボタンは、既存の ○○ ボタンを押したのと同じ動き(ロビーのタイル・☰メニューの両方で使う)
    document.addEventListener('click', (e)=>{
      const it = e.target.closest && e.target.closest('[data-proxy]');
      if(!it) return;
      const target = document.getElementById(it.dataset.proxy);
      if(target && target !== it) setTimeout(()=>target.click(), 70);
    });
    document.getElementById('lobbyAccount').addEventListener('click', ()=>{ hideTitleScreen(); accountBtn.click(); });
    document.getElementById('lobbyGiftBtn').addEventListener('click', ()=>{ if(window.GiftFx) window.GiftFx.check('manual'); });

    const setBadge = (el, n)=>{ if(!el) return; el.classList.toggle('show', n > 0); const t = n > 99 ? '99+' : (n > 0 ? String(n) : ''); if(el.textContent !== t) el.textContent = t; };
    let wasAuth = false;
    const update = ()=>{
      const nm = myName(), cn = formatNumber(coins);
      { const key = authToken ? `${currentIcon}|${nm}|${currentLv}` : '';
        if(lobbyName.dataset.k !== key){ lobbyName.dataset.k = key; lobbyName.innerHTML = authToken ? `${escapeHtml(nm)}${lvTag(currentLv)}` : escapeHtml(nm);
          const ic = document.getElementById('lobbyAccount').querySelector('.lc-ic'); if(ic) ic.innerHTML = authToken ? avatarHtml(currentIcon, nm, currentUserId, 26) : '👤'; } }
      if(lobbyCoins.textContent !== cn) lobbyCoins.textContent = cn;   // 変わったときだけ書き換える(アニメが毎秒走らないように)
      const frOn = friendsDot.classList.contains('show'), chOn = chatDot.classList.contains('show');
      const frM = friendsMentionBadge.classList.contains('show') ? (parseInt(friendsMentionBadge.textContent) || 0) : 0;
      const chM = chatMentionBadge.classList.contains('show') ? (parseInt(chatMentionBadge.textContent) || 0) : 0;
      setBadge(document.getElementById('lobbyFriendsBadge'), frM || (frOn ? 1 : 0));
      setBadge(document.getElementById('lobbyChatBadge'), chM || (chOn ? 1 : 0));
      const polls = (window.CBSocial && window.CBSocial.unvotedCount) ? window.CBSocial.unvotedCount() : 0;
      const gifts = (window.GiftFx && window.GiftFx.pendingCount) ? window.GiftFx.pendingCount() : 0;
      setBadge(document.getElementById('lobbyPollBadge'), polls);
      const giftBtn = document.getElementById('lobbyGiftBtn');
      giftBtn.style.display = gifts > 0 ? 'flex' : 'none'; setBadge(document.getElementById('lobbyGiftBadge'), gifts);
      const any = frOn || chOn || frM || chM || polls > 0 || gifts > 0;
      menuDot.classList.toggle('show', !!any); lobbyMenuDot.classList.toggle('show', !!any);
      if(evItem){ const vis = document.getElementById('titleEventBtn').style.display !== 'none'; const d = vis ? '' : 'none'; if(evItem.style.display !== d){ evItem.style.display = d; } }
      // ログイン(または保存されたログインの復元)を検知したら、届いているギフトを確認する
      if(authToken && !wasAuth){ wasAuth = true; if(window.GiftFx) window.GiftFx.check('login'); if(window.CBSocial) window.CBSocial.refresh(); }
      if(!authToken) wasAuth = false;
    };
    update();
    setInterval(()=>{ if(!document.body.classList.contains('mg-open')) update(); }, 1000);   // ミニゲーム中はロビーの更新を止める
  })();

  // ===================== ✨ アニメーション(波紋・タブ切替・数字のぽんっ) =====================
  (function setupAnimations(){
    // ① タップした場所に波紋(ボタンの種類を問わず全部)
    const CLICKABLE = 'button, .icon-btn, .pill-btn, .tab-btn, .mode-card, .claim-btn, .primary-btn, .ghost-btn, .tetris-btn, .lobby-tile, .lobby-wide, .lobby-play, .lobby-chip, .lobby-icon, .lobby-event, header .title, .other-game-item, .close-x, .switch-slider';
    document.addEventListener('pointerdown', (e)=>{
      if(motionOff()) return;
      const el = e.target.closest && e.target.closest(CLICKABLE);
      if(!el || el.disabled) return;
      const ring = document.createElement('span');
      ring.className = 'tap-ring';
      ring.style.left = e.clientX + 'px';
      ring.style.top = e.clientY + 'px';
      document.body.appendChild(ring);
      setTimeout(()=>ring.remove(), 520);
    }, { passive:true });

    // ② ウィンドウ内のタブを切り替えたら、中身がスッと入れ替わる
    const mc = document.getElementById('modalContent');
    let swapTimer = null;
    document.addEventListener('click', (e)=>{
      if(motionOff() || !e.target.closest || !e.target.closest('.tab-btn') || !mc.contains(e.target)) return;
      mc.classList.remove('tab-swap'); void mc.offsetWidth; mc.classList.add('tab-swap');
      clearTimeout(swapTimer);
      swapTimer = setTimeout(()=>mc.classList.remove('tab-swap'), 450);
    });

    // ③ 数字が変わったら、ぽんっと弾ませる(カウントアップ中は連発しない)
    const last = {};
    const watch = (id)=>{
      const el = document.getElementById(id);
      if(!el) return;
      new MutationObserver(()=>{
        const now = performance.now();
        if(motionOff() || (last[id] && now - last[id] < 700)) return;
        last[id] = now;
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      }).observe(el, { childList:true, characterData:true, subtree:true });
      el.addEventListener('animationend', ()=>el.classList.remove('bump'));
    };
    ['scoreVal','bestVal','coinVal','lobbyCoins','tetrisPlayerScore','tetrisAiScore','tetrisLevel','tetrisLines'].forEach(watch);

    // ④ 起動時、ロビーの入場アニメが終わったらクラスを外す(PLAYボタンの常時アニメを動かすため)
    setTimeout(()=>document.getElementById('titleScreen').classList.remove('lobby-in'), 1400);
  })();

  // ===================== 🤖 AI自動プレイ用のブリッジ(v4.3。管理者専用の機能が、メインのゲームを読み・操作するための窓口) =====================
  // 人間と同じルールで遊ぶため、操作は「置く・動かす・回す」だけ。スコアや盤面そのものは書き換えない
  window.CBGame = {
    mode(){ return currentMode; },
    inGame(){ return titleScreenEl.classList.contains('hidden') && !modalOverlay.classList.contains('show') && !document.body.classList.contains('mg-open'); },
    overOpen(){ return overlayEl.classList.contains('show'); },
    restart(){ if(overlayEl.classList.contains('show')) restartBtn.click(); },
    puzzle: {
      active(){ return currentMode!=='tetris' && !dragState && !overlayEl.classList.contains('show') && Array.isArray(tray); },
      size(){ return SIZE; },
      cells(){ return board.map(c=>!!c.filled); },
      tray(){ return tray.map(p=>({ shape:p.shape, used:!!p.used })); },
      place(i, r, c){
        const p = tray[i];
        if(!p || p.used || dragState || overlayEl.classList.contains('show') || !canPlaceAt(p.shape, r, c)) return false;
        commitPlacement(p, r, c, i); return true;
      }
    },
    tetris: {
      active(){ return currentMode==='tetris' && tetrisActive && !tetrisGameOver && !!tetrisPiece && !overlayEl.classList.contains('show'); },
      state(){ return { grid: tetrisGrid, piece: tetrisPiece, next: tetrisNextType, hold: tetrisHoldType, holdUsed: tetrisHoldUsed,
                        rows: TETRIS_ROWS, cols: TETRIS_COLS, level: tetrisLevel, runMode: tetrisRunMode, vs: tetrisVsMode, minos: TETROMINOES, collides: tetrisCollides }; },
      collides: tetrisCollides, move: tetrisMove, rotate: tetrisRotate, hard: tetrisHardDrop, soft: tetrisSoftDrop, hold: tetrisHoldSwap
    }
  };

  // ===================== 🕹 ミニゲーム(minigames.js)に公開する窓口 =====================
  window.CB = {
    // --- v4.3: 新しい画面(v43.js)が使う窓口 ---
    skinsInfo(){ return { list: SKINS.map(s=>({ id:s.id, name:s.name, price:s.price, gacha:!!s.gacha, event:s.event||null, colors:(s.colors||[]).slice(0,5).map(c=>c.bg), pattern:s.pattern||null })), owned: ownedSkins.slice(), equipped: equippedSkin }; },
    setOwnedSkins(list){ if(Array.isArray(list)){ ownedSkins = list; saveSkinsData(); } },
    equipSkin(id){ equipSkin(id); },
    refreshFromServer(){ try{ return syncFromServer(); }catch(e){} },
    modal(){ return { el: modalContent, overlay: modalOverlay }; },
    openRecordsOld(){ renderRecordsModal(); modalOverlay.classList.add('show'); },
    openSettings(){ renderAppSettingsModal(); modalOverlay.classList.add('show'); },
    openGacha(){ openGachaModal(); },
    openQuests(){ const b = document.getElementById('questBtn'); if(b) b.click(); },
    showTitle: showTitleScreen,
    reduceMotion(){ return motionOff(); },
    setCoinsExact(n){ coins = Number(n) || 0; updateCoinUI(); },
    addCoins(n){ coins += n; updateCoinUI(); },
    report: reportEventGame,                       // 🎃 イベントのキャンディ・ミッション
    xp: grantBattlePassXp,                         // バトルパスXP
    sync(){ if(authToken) syncToServer(); },       // コイン等をサーバーへ保存
    fmt: formatNumber, sound: playSound, vibrate, toast: showEventToast, motionOff,
    isLoggedIn(){ return !!authToken; },
    eventActive(){ return eventPhaseNow()==='active'; },
    openRegister(){ renderAuthModal(); modalOverlay.classList.add('show'); const t = modalContent.querySelector('[data-tab="register"]'); if(t) t.click(); },
    userId(){ return currentUserId; },
    displayName(){ return myName(); },
    openFeedback(){ renderFeedbackModal('request'); modalOverlay.classList.add('show'); },
    who: whoHtml, whoById, avatar: avatarHtml, lvTag, compressImage, openLightbox, apiBase: API_BASE_URL,
    counts(){ return { chat: chatMentionCount || chatUnreadCount, chatMention: chatMentionCount, friends: friendsMentionBadge.classList.contains('show') ? (parseInt(friendsMentionBadge.textContent) || 0) : (friendsDot.classList.contains('show') ? 1 : 0) }; },
    setMyTitle(t){ myTitle = t || null; },                    // 🏷 自分が付けている称号(チャットに送った直後の表示用)
    isAdmin(){ return !!authToken && currentUserId === ADMIN_USER_ID; },
    setCoins(n){ coins = Math.max(0, Number(n) || 0); updateCoinUI(); },
    adminCommand: executeAdminCommand,                       // 文字のコマンドを実行(結果の文字を返す)
    openAdminBlocks(){ renderAdminPanel(); modalOverlay.classList.add('show'); },
    closeModal, hideTitle: hideTitleScreen,
    // サーバーAPI呼び出し(ログイン中ならトークン付き)。失敗時は Error を投げる
    async api(path, method, body){
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: method || 'GET',
        headers: { 'Content-Type':'application/json', ...(authToken ? { 'Authorization':`Bearer ${authToken}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
      let data = null; try{ data = await res.json(); }catch(e){}
      if(!res.ok) throw new Error((data && data.error) || '通信に失敗しました');
      return data;
    }
  };

  // ===================== 💤 スリープ対策 =====================
  // ① サーバー(Render無料枠)が寝ていても、ページを開いた瞬間に起こしておく。開いている間も定期的に叩く。
  function pingServer(){
    fetch(`${API_BASE_URL}/healthz`, { cache:'no-store' }).catch(()=>{});
  }
  pingServer();
  setInterval(()=>{ if(!document.hidden) pingServer(); }, 4 * 60 * 1000);

  // ② 端末の画面が勝手に暗く/スリープしないようにする(Screen Wake Lock API。対応していないブラウザでは何もしない)
  let wakeLockSentinel = null;
  async function requestWakeLock(){
    try{
      if(!('wakeLock' in navigator) || document.hidden || wakeLockSentinel) return;
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', ()=>{ wakeLockSentinel = null; });
    }catch(err){ wakeLockSentinel = null; }
  }
  requestWakeLock();
  ['pointerdown','keydown','touchstart'].forEach(ev=> document.addEventListener(ev, requestWakeLock, { passive:true }));
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ requestWakeLock(); pingServer(); } });

  // ===================== 初期化 =====================
(async function start(){
    const L = window.CBLoading || { set(){}, done(){} };
    try{
      L.set(12, 'データを読み込んでいます…');
      await loadCustomBackground();
      await loadAppSettings();
      await loadBgmSettings();
      await loadBest();
      await loadBestScores();  // モード別ベスト読み込み
      await loadCoins();
      await loadSkinsData();
      await loadSettings();
      await loadDailyQuests();
      L.set(48, 'アカウントを確認しています…');
      // リロード後も安全にログイン状態を復元。サーバーが寝ていても最大4秒で先へ進む(確認は裏で続く)
      await Promise.race([restoreSession(), new Promise(r=>setTimeout(r, 4000))]);
      L.set(72, 'ゲームを準備しています…');
      updateAccountButton();
      updateModeBadge();
      if(currentMode === 'tetris'){
        enterTetrisMode();
      } else {
        initBoard();
        fillTray();
      }
      // 外部サイトへは飛ばさず、まずアプリ内のメインメニュー画面を表示する
      showTitleScreen();
      L.set(92, 'もうすぐ始まります…');
      await loadLastSeenAnnouncement();
    }catch(err){
      console.error('起動中にエラー:', err);
      try{ showTitleScreen(); }catch(e){}
    }
    L.done();
    // お知らせ・アップデート確認(ログイン状態に関わらず定期チェック)。画面を出したあとに裏で行う
    checkAnnouncements();
    setInterval(()=>{ if(!document.hidden) checkAnnouncements(); }, 30000);
    setInterval(checkForUpdate, 60000);
    // イベントカウントダウン(1秒ごとに更新、サーバーとは定期的に再同期)。待たずに裏で取得する
    fetchEventsList();
    setInterval(()=>{ if(!document.body.classList.contains('mg-open')) tickEventCountdown(); }, 1000);
    setInterval(()=>{ if(!document.hidden && !document.body.classList.contains('mg-open')) fetchEventsList(); }, 15000); // 管理者がイベントを消したときも、15秒以内に全員の画面へ反映
  })();

})();
