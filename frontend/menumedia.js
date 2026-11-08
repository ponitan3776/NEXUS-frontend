/* =====================================================================
   🎞 メニューの画像/動画 (menumedia.js)  v3.9
   frontend/icons/ に、下のどれかを GitHub に push するだけ。置いていなければ何も起きない(今までの表示のまま)。
     動画: menu.mp4(おすすめ。H.264+AAC) / menu.webm              ← 優先
     画像: menu.jpg / menu.png / menu.webp                      ← 動画が無いとき(動画が読み込めないときの代わりにもなる)
   サイズ: 1280×720 の横動画(16:9。幅・高さとも偶数なので H.264 でOK)。それ以外でも、枠(16:9)に合わせて中央でトリミング。
   DB・サーバーは通さない(GitHub Pages から直接読み込む)。目安: 動画は 数MB〜10MB 以内。GitHub は 1ファイル100MBまで。

   🔊 音について(ブラウザの決まりで、最初は音なしで始まる)
   ・ページを最初にタップ/キー操作した瞬間に、自動で音が出る(「🔊」ボタンで、いつでも消せる。消した設定は覚えておく)
   ・音が出ている間は、BGMを止めて、かぶらないようにする(動画が止まる=ゲームを始める・別タブ、でBGMが続きから戻る)
   ・BGMを OFF にしている人は、動画の音も出さない。音量は、BGMの音量スライダーに合わせる
   ・動画に音声トラックが無いときは、BGMは止めず、🔊ボタンも出さない
   ・画面が見えていない間(ゲーム中・別タブ)は自動で止まる。「動きを減らす」設定・データ節約モードの端末では、動画は再生せず画像(あれば)だけ
   ===================================================================== */
(function(){
  'use strict';
  const VER = 'menumedia 4.1.3';
  const BASE = 'icons/';
  const VIDEOS = ['menu.mp4', 'menu.webm'];
  const IMAGES = ['menu.jpg', 'menu.png', 'menu.webp'];
  const PREF = 'nexus-menu-sound';
  const box = document.getElementById('heroMedia'), card = document.getElementById('titleCard');
  if(!box || !card) return;

  // iPad/iPhone(iPadOS は「Macのふり」をするので、タッチ点の数でも見分ける)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // 🛠 診断モード: URLの最後に ?menudebug=1 を付けて開くと、画面の下に、動画の読み込み状況が出る(iPadで原因を調べる用)
  const DEBUG = /[?&]menudebug\b/.test(location.search);
  let dbgBox = null; const t0 = performance.now();
  function dbg(msg){
    if(!DEBUG) return;
    if(!dbgBox){
      dbgBox = document.createElement('pre');
      dbgBox.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;margin:0;padding:6px 8px;z-index:99999;font:11px/1.35 monospace;color:#0f0;background:rgba(0,0,0,.88);white-space:pre-wrap;';
      document.body.appendChild(dbgBox);
    }
    dbgBox.textContent += `[${((performance.now() - t0) / 1000).toFixed(1)}s] ${msg}\n`; dbgBox.scrollTop = dbgBox.scrollHeight;
  }
  if(DEBUG){
    dbg(`${VER} / UA: ${navigator.userAgent}`);
    const tv = document.createElement('video');
    dbg(`canPlayType  H.264: "${tv.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"')}"  H.265: "${tv.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')}"  webm: "${tv.canPlayType('video/webm; codecs="vp9"')}"`);
    dbg(`動き減らす設定: ${!!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)} / データ節約: ${!!(navigator.connection && navigator.connection.saveData)}`);
    VIDEOS_PROBE();
  }
  function VIDEOS_PROBE(){
    ['menu.mp4', 'menu.webm'].forEach(n=>{
      fetch('icons/' + n, { method: 'HEAD', cache: 'no-store' }).then(r=> dbg(`HEAD ${n}: HTTP ${r.status} / ${r.headers.get('content-type')} / ${r.headers.get('content-length')}バイト / Range対応: ${r.headers.get('accept-ranges')}`))
        .catch(e=> dbg(`HEAD ${n}: 失敗 ${e}`));
    });
  }
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const getPref = ()=>{ try{ return localStorage.getItem(PREF) !== '0'; }catch(e){ return true; } };
  const setPref = (on)=>{ try{ localStorage.setItem(PREF, on ? '1' : '0'); }catch(e){} };
  const audioApi = ()=> window.CBMenuAudio || null;
  const show = (el)=>{ box.replaceChildren(el); box.hidden = false; card.classList.add('has-media'); };
  const SVG = (inner)=> `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON_ON  = SVG('<path d="M4 9v6h4l5 4V5L8 9H4z" fill="#fff"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/>');
  const ICON_OFF = SVG('<path d="M4 9v6h4l5 4V5L8 9H4z" fill="#fff"/><path d="M17 9l5 6M22 9l-5 6"/>');
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#fff"/></svg>';

  let still = false;                                                 // true = 動画は再生せず、最初の1コマだけ見せる(動きを減らす設定の端末で、画像が無いとき)
  function tryImage(i, onNone){
    if(i >= IMAGES.length){ if(onNone) onNone(); return; }           // どれも無い → 何もしない(今までの表示)
    const im = new Image();
    im.alt = ''; im.decoding = 'async';
    im.onload = ()=> show(im);
    im.onerror = ()=> tryImage(i + 1, onNone);
    im.src = BASE + IMAGES[i];
  }

  // 動画の「ブラウザが読んだ本当の向き・大きさ」に、枠を合わせる(切り取らない)。?menudebug=1 を付けて開くと、数字が画面に出る
  function fitToVideo(v){
    const w = v.videoWidth, h = v.videoHeight;
    if(!w || !h) return;
    box.style.aspectRatio = `${w} / ${h}`;
    box.classList.toggle('portrait', h > w);                          // 本当に縦向きとして読まれたときは、高さを抑えて縦のまま表示
    if(/[?&]menudebug\b/.test(location.search)){
      let d = box.querySelector('.hero-debug');
      if(!d){ d = document.createElement('div'); d.className = 'hero-debug'; box.append(d); }
      d.textContent = `動画 ${w}×${h}(${h > w ? '縦' : w === h ? '正方形' : '横'}) / 枠 ${box.clientWidth}×${box.clientHeight}`;
      console.log('[menu video]', d.textContent);
    }
  }

  function setupVideo(v){
    if(v.parentNode !== box) show(v); else { box.hidden = false; card.classList.add('has-media'); }
    if(still){ try{ v.currentTime = 0.1; }catch(e){} }
    fitToVideo(v);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'hero-sound'; box.append(btn);
    const playBtn = document.createElement('button');                 // 自動再生を止められたとき(低電力モードなど)の「▶」ボタン
    playBtn.type = 'button'; playBtn.className = 'hero-play'; playBtn.hidden = true; playBtn.setAttribute('aria-label', '再生'); playBtn.innerHTML = ICON_PLAY; box.append(playBtn);

    let wantSound = getPref();            // ボタンで消していなければ ON
    let unlocked = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);   // 一度でも操作済みなら、すぐ音を出せる
    let visible = true, noAudio = false, checkTimer = 0;
    const musicOn = ()=> { const a = audioApi(); return a ? a.enabled() : true; };

    function refreshBtn(){
      btn.hidden = noAudio;
      const on = wantSound && musicOn();
      btn.innerHTML = (on && unlocked) ? ICON_ON : ICON_OFF;
      btn.setAttribute('aria-label', on ? '音を消す' : '音を出す');
      btn.title = on ? (unlocked ? '音を消す' : 'タップで音が出ます') : '音を出す';
    }
    function apply(){
      const a = audioApi(), vis = visible && !document.hidden;
      if(!vis || still){ v.pause(); if(a) a.duck(false); clearTimeout(checkTimer); return; }
      const sound = wantSound && musicOn() && unlocked && !noAudio;
      v.muted = !sound;
      if(sound) v.volume = a ? a.volume() : 0.6;
      const p = v.play();
      setTimeout(()=>{ if(v.paused && visible && !document.hidden && !still) playBtn.hidden = false; }, 1200);     // 1.2秒たっても止まったまま → ▶ を出す
      if(p && p.catch) p.catch(()=>{                                 // 音つき再生をブラウザに止められたら、音なしで続ける
        if(!v.muted){ v.muted = true; unlocked = false; v.play().catch(()=>{}); if(a) a.duck(false); refreshBtn(); }
      });
      if(a) a.duck(sound && !v.paused);                              // 音が出ている間だけ、BGMを止める
      if(sound && !checkTimer){                                      // 音声トラックが無い動画か、少し再生してから確かめる
        checkTimer = setTimeout(()=>{
          checkTimer = 0;
          // ※ iPad/iPhone では、この判定(webkitAudioDecodedByteCount)が常に0になり「音声なし」と誤判定して、ボタンまで消えてしまうため使わない
          const none = (typeof v.mozHasAudio === 'boolean' && !v.mozHasAudio) ||
                       (!isIOS && 'webkitAudioDecodedByteCount' in v && !v.muted && !v.paused && v.currentTime > 0.8 && v.webkitAudioDecodedByteCount === 0);
          if(none){ noAudio = true; if(a) a.duck(false); v.muted = true; refreshBtn(); }
        }, 1500);
      }
      refreshBtn();
    }

    v.addEventListener('playing', ()=>{ playBtn.hidden = true; });
    playBtn.addEventListener('click', (e)=>{ e.stopPropagation(); unlocked = true; playBtn.hidden = true; apply(); v.play().catch(()=>{ playBtn.hidden = false; }); });
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); unlocked = true; wantSound = !(wantSound && musicOn()) ; setPref(wantSound); apply(); });
    const onGesture = ()=>{ if(unlocked) return; unlocked = true; apply(); };
    ['pointerdown', 'keydown', 'touchend'].forEach(ev=> document.addEventListener(ev, onGesture, { capture: true }));
    document.addEventListener('visibilitychange', apply);
    if(audioApi()) audioApi().changed = ()=>{ if(!v.muted) v.volume = audioApi().volume(); apply(); };    // BGMの音量・ON/OFFの変更に合わせる
    if('IntersectionObserver' in window) new IntersectionObserver((es)=>{ visible = es[0].isIntersecting; apply(); }, { threshold: .05 }).observe(box);
    apply();
  }

  // iPad/iPhone の Safari 対策(v4.1.2):
  //   ・画面に置いていない動画は、読み込みを始めず「loadeddata」も来ない → 先に、見えない場所に置いてから読み込む
  //   ・iOS は preload を無視するので、読み込みの合図は loadedmetadata / loadeddata / canplay の「どれか最初の1つ」にする
  //   ・自動再生を止められたとき(低電力モードなど)も、枠をタップすれば再生できるようにする
  function tryVideo(i, onFail){
    if(i >= VIDEOS.length){ box.replaceChildren(); box.hidden = true; card.classList.remove('has-media'); (onFail || (()=> tryImage(0)))(); return; }   // 動画が無い/読めない → 画像へ
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.setAttribute('muted', ''); v.setAttribute('autoplay', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.disablePictureInPicture = true; v.preload = 'auto';
    let done = false, timer = 0;
    const next = ()=>{ if(done) return; done = true; clearTimeout(timer); v.remove(); tryVideo(i + 1, onFail); };
    const ready = ()=>{ if(done) return; done = true; clearTimeout(timer); setupVideo(v); };
    if(DEBUG){
      dbg(`動画 ${VIDEOS[i]} を読み込みます`);
      ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'ended'].forEach(ev=> v.addEventListener(ev, ()=> dbg(`${ev}  (readyState ${v.readyState} / ${v.videoWidth}×${v.videoHeight} / ${v.currentTime.toFixed(1)}秒)`)));
      let n = 0; const iv = setInterval(()=>{ dbg(`状態 paused=${v.paused} muted=${v.muted} readyState=${v.readyState} network=${v.networkState} time=${v.currentTime.toFixed(2)} err=${v.error ? v.error.code + ' ' + v.error.message : '-'}`); if(++n >= 6) clearInterval(iv); }, 1500);
    }
    v.addEventListener('error', (e)=>{
      dbg(`error: code ${v.error ? v.error.code : '?'} ${v.error ? v.error.message : ''}`);
      if(!done) next();
      else{ box.replaceChildren(); box.hidden = true; card.classList.remove('has-media'); tryVideo(i + 1, onFail); }      // 読み込んだあとの「再生できない」エラー → 次の形式/画像へ
    });
    ['loadedmetadata', 'loadeddata', 'canplay'].forEach(ev=> v.addEventListener(ev, ready, { once: true }));
    timer = setTimeout(()=>{ if(v.readyState >= 1) ready(); else next(); }, 8000);       // 8秒たっても読めなければ、次(別の形式/画像)へ
    // iPad/iPhone の Safari は、画面に置いていない動画を読み込まないので、最初から枠の中に置く(読み込み中は、暗い枠だけが見える)
    box.replaceChildren(v); box.hidden = false; card.classList.add('has-media');
    v.src = BASE + VIDEOS[i];
    v.load();
    const p = v.play(); if(p && p.catch) p.catch((e)=> dbg(`play() が止められました: ${e && e.name} ${e && e.message}`));
  }

  if(reduce || saveData) tryImage(0, ()=>{ still = true; tryVideo(0, ()=>{}); });   // 動きを減らす/データ節約 → 画像があれば画像。無ければ、動画を止めたまま(1コマ)で見せる
  else tryVideo(0);
})();
