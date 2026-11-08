/* =====================================================================
   🆕 v4.3.0 新機能の本体 (script.js / minigames.js の後に読み込む)
   ・保存データ(お気に入り・評価・履歴・遊び方の既読など) … この端末 + アカウント(クラウド)に自動保存
   ・演出: 勝利演出 / レベルアップ演出 / レア演出 / 冬の雪 / テーマ切り替え / 実績の通知
   ・画面: ウィンターパス / プロフィール / 実績センター / コレクション / 統計 / テーマと演出 / データ保存 / チュートリアル
   ・ロビー(1画面のドック)の配線
   サーバー: backend/v43.py (/api/v43/...) と backend/season.py (/api/battlepass/...)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const esc = (s)=> String(s == null ? '' : s).replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const fmt = (n)=> (window.NXBig && window.NXBig.compact(n)) || (CB().fmt ? CB().fmt(n) : String(n));
  const full = (n)=> window.NXBig ? window.NXBig.full(n) : Number(n || 0).toLocaleString('ja-JP');
  // XPなど、正確に読みたい数: 10億未満は桁区切りで全部、それ以上は短い表記
  const num = (n)=> Math.abs(Number(n)) < 1e9 ? Number(n || 0).toLocaleString('ja-JP') : fmt(n);
  const logged = ()=> !!(CB().isLoggedIn && CB().isLoggedIn());
  const isAdmin = ()=> !!(CB().isAdmin && CB().isAdmin());
  const calm = ()=> !!(CB().reduceMotion && CB().reduceMotion());
  const $id = (id)=> document.getElementById(id);
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

  /* =============== 保存データ(この端末 + クラウド) =============== */
  const KEY = 'nexus-v43';
  const DEFAULT_STORE = { favs: [], ratings: {}, recent: [], plays: {}, howto: {}, tutorialDone: false, theme: 'theme:normal',
                          victory: 'v_classic', levelup: 'lu_default', lastLevel: 0, updatedAt: 0, winterFx: true };
  let store = Object.assign({}, DEFAULT_STORE);
  try{ Object.assign(store, JSON.parse(localStorage.getItem(KEY) || '{}')); }catch(e){}
  let cloudRev = 0, cloudTimer = null, cloudBusy = false, cloudLastAt = null, cloudError = '';
  function persist(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); }catch(e){} }
  function touch(){ store.updatedAt = Date.now(); persist(); scheduleCloud(); }
  function scheduleCloud(){
    if(!logged()) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(pushCloud, 3000);
  }
  // 端末のデータとクラウドのデータを合わせる(お気に入りは和集合、評価・選択は新しいほう、履歴は時間順にまとめる)
  function merge(local, remote){
    if(!remote || typeof remote !== 'object') return local;
    const out = Object.assign({}, DEFAULT_STORE, remote, local);
    out.favs = Array.from(new Set([...(remote.favs || []), ...(local.favs || [])]));
    const newer = (local.updatedAt || 0) >= (remote.updatedAt || 0);
    out.ratings = Object.assign({}, newer ? remote.ratings : local.ratings, newer ? local.ratings : remote.ratings);
    out.howto = Object.assign({}, remote.howto || {}, local.howto || {});
    out.plays = {}; Object.keys(Object.assign({}, remote.plays || {}, local.plays || {})).forEach(k=>{ out.plays[k] = Math.max((remote.plays || {})[k] || 0, (local.plays || {})[k] || 0); });
    const seen = new Set(), rec = [];
    [...(local.recent || []), ...(remote.recent || [])].sort((a,b)=> (b.t||0) - (a.t||0)).forEach(r=>{ if(r && r.g && !seen.has(r.g)){ seen.add(r.g); rec.push(r); } });
    out.recent = rec.slice(0, 30);
    out.tutorialDone = !!(local.tutorialDone || remote.tutorialDone);
    if(!newer){ ['theme','victory','levelup','winterFx'].forEach(k=>{ if(remote[k] !== undefined) out[k] = remote[k]; }); }
    out.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
    return out;
  }
  // store は、ほかのファイルも同じ入れ物を持っている。入れ物ごと差し替えず、中身だけを書き換える
  function replaceStore(next){
    Object.keys(store).forEach(k=>{ delete store[k]; });
    Object.assign(store, DEFAULT_STORE, next);
  }
  async function pullCloud(){
    if(!logged() || !CB().api) return false;
    try{
      const d = await CB().api('/api/v43/save');
      cloudRev = d.rev || 0;
      if(d.data && Object.keys(d.data).length){ replaceStore(merge(store, d.data)); persist(); }
      cloudError = '';
      await pushCloud();
      return true;
    }catch(e){ cloudError = e.message || '通信エラー'; return false; }
  }
  async function pushCloud(){
    if(!logged() || cloudBusy || !CB().api) return false;
    cloudBusy = true;
    try{
      const d = await CB().api('/api/v43/save', 'POST', { data: store, rev: cloudRev });
      cloudRev = d.rev || cloudRev; cloudLastAt = Date.now(); cloudError = '';
      return true;
    }catch(e){ cloudError = e.message || '通信エラー'; return false; }
    finally{ cloudBusy = false; }
  }

  /* =============== 小さな部品 =============== */
  let toastBox = null;
  function ensureToastBox(){
    if(toastBox) return toastBox;
    toastBox = document.createElement('div'); toastBox.id = 'nxToasts'; document.body.appendChild(toastBox);
    return toastBox;
  }
  // 実績・レベルアップなどの通知(上から滑らかに出て、少したつと消える)
  function notify(html, cls, ms){
    const box = ensureToastBox();
    const el = document.createElement('div'); el.className = 'nx-toast ' + (cls || ''); el.innerHTML = html;
    box.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('in'));
    const kill = ()=>{ el.classList.remove('in'); el.classList.add('out'); setTimeout(()=> el.remove(), 500); };
    el.addEventListener('click', kill);
    setTimeout(kill, ms || 4200);
    while(box.children.length > 4) box.firstChild.remove();
    return el;
  }
  function modalOpen(mode, html){
    const m = CB().modal && CB().modal(); if(!m) return null;
    m.el.dataset.mode = mode; m.el.innerHTML = html; m.overlay.classList.add('show');
    const body = m.el; try{ body.scrollTop = 0; }catch(e){}
    return m.el;
  }
  const modalIs = (mode)=> { const m = CB().modal && CB().modal(); return !!(m && m.overlay.classList.contains('show') && m.el.dataset.mode === mode); };
  const goLobbyHide = ()=>{ if(CB().hideTitle) CB().hideTitle(); };

  /* =============== 冬の雪(ロビーの背景) =============== */
  let snowCv = null, snowCtx = null, flakes = [], snowRaf = 0, snowOn = false;
  function snowWanted(){
    return document.body.classList.contains('winter') && store.winterFx !== false && !calm() && !document.hidden
      && !document.body.classList.contains('mg-open') && !($id('titleScreen') || document.body).classList.contains('hidden');
  }
  function snowSetup(){
    if(snowCv) return;
    snowCv = document.createElement('canvas'); snowCv.id = 'nxSnow'; snowCv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(snowCv, document.body.firstChild);
    snowCtx = snowCv.getContext('2d');
    const rs = ()=>{ const d = Math.min(2, window.devicePixelRatio || 1); snowCv.width = innerWidth * d; snowCv.height = innerHeight * d; snowCtx.setTransform(d,0,0,d,0,0); };
    rs(); window.addEventListener('resize', rs);
    const n = innerWidth < 500 ? 46 : 80;
    for(let i = 0; i < n; i++) flakes.push(newFlake(true));
  }
  function newFlake(anywhere){
    return { x: Math.random() * innerWidth, y: anywhere ? Math.random() * innerHeight : -10, r: 0.8 + Math.random() * 2.6,
             vy: 0.25 + Math.random() * 0.9, ph: Math.random() * 6.28, sw: 0.3 + Math.random() * 0.8, a: 0.35 + Math.random() * 0.55 };
  }
  function snowFrame(){
    snowRaf = 0;
    if(!snowWanted()){ snowOn = false; if(snowCtx) snowCtx.clearRect(0,0,innerWidth,innerHeight); if(snowCv) snowCv.style.opacity = '0'; return; }
    snowCv.style.opacity = '1';
    snowCtx.clearRect(0,0,innerWidth,innerHeight);
    for(const f of flakes){
      f.y += f.vy; f.ph += 0.012 * f.sw; f.x += Math.sin(f.ph) * 0.45 * f.sw;
      if(f.y > innerHeight + 6){ Object.assign(f, newFlake(false)); f.x = Math.random() * innerWidth; }
      snowCtx.beginPath(); snowCtx.fillStyle = `rgba(235,246,255,${f.a})`; snowCtx.arc(f.x, f.y, f.r, 0, 6.283); snowCtx.fill();
    }
    snowRaf = requestAnimationFrame(snowFrame);
  }
  function snowKick(){
    if(!document.body.classList.contains('winter')) return;
    snowSetup();
    if(!snowRaf && snowWanted()){ snowOn = true; snowRaf = requestAnimationFrame(snowFrame); }
  }
  setInterval(snowKick, 1200);
  document.addEventListener('visibilitychange', snowKick);

  /* =============== テーマ(画面の配色の切り替え) =============== */
  const THEME_NAMES = { 'theme:normal':'🌈 ノーマル', 'theme:dark':'🌙 ダーク', 'theme:retro':'🕹 レトロ', 'theme:winter':'❄ ウィンター', 'theme:glacier':'🏔 氷河', 'theme:polar':'🌃 極夜' };
  function applyTheme(id){
    const key = String(id || 'theme:normal').replace('theme:', '');
    document.body.dataset.theme = key;
  }
  /* =============== 演出(勝利 / レベルアップ / レア) =============== */
  // 粒を飛ばす共通部品。style ごとに色・形・動きを変える
  const FX = {
    v_classic:  { glyphs:['🎉','✨','⭐','🎊'], n:34, kind:'burst' },
    v_snow:     { glyphs:['❄','❅','❆','✦'], n:42, kind:'fall' },
    v_sparkle:  { glyphs:['✨','✦','✧','⭐'], n:36, kind:'burst' },
    v_frost:    { glyphs:['🧊','❄','💠','✦'], n:38, kind:'burst' },
    v_aurora:   { glyphs:['✦','✧','·'], n:52, kind:'aurora', colors:['#7CFFC8','#4CC0FF','#B06CFF','#9CFF7C'] },
    v_iceburst: { glyphs:['❄','✦','💠'], n:56, kind:'ring', colors:['#CFF8FF','#7FD8FF','#FFFFFF'] },
    v_blizzard: { glyphs:['❄','❅','❆'], n:90, kind:'blizzard' },
    v_diamond:  { glyphs:['💎','✦','✧'], n:44, kind:'burst', colors:['#FFFFFF','#9CFFF0','#FF9CE8'] },
    v_zero:     { glyphs:['❄','✦','💠','🥶'], n:80, kind:'zero', colors:['#FFFFFF','#00E0FF','#6C9CFF'] },
    lu_default: { glyphs:['⬆','✦','✨'], n:26, kind:'rise' },
    lu_snow:    { glyphs:['❄','❅','✦'], n:34, kind:'rise' },
    lu_frost:   { glyphs:['🧊','❄','💠'], n:34, kind:'rise' },
    lu_aurora:  { glyphs:['✦','✧','·'], n:48, kind:'aurora', colors:['#7CFFC8','#4CC0FF','#B06CFF'] },
    lu_crystal: { glyphs:['💠','✦','◆'], n:44, kind:'ring', colors:['#7FD8FF','#CFF8FF','#A0B8FF'] },
    lu_nova:    { glyphs:['🌟','✦','✧','⭐'], n:64, kind:'ring', colors:['#FFE890','#FFFFFF','#9CC8FF'] },
    lu_zero:    { glyphs:['🥶','❄','✦'], n:88, kind:'zero', colors:['#FFFFFF','#00E0FF','#6C9CFF'] }
  };
  function playFx(id, banner){
    if(calm()){ if(banner) notify(banner, 'fx-banner', 2600); return; }
    const spec = FX[id] || FX.v_classic;
    let layer = $id('nxFx');
    if(!layer){ layer = document.createElement('div'); layer.id = 'nxFx'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H * 0.42;
    const flash = document.createElement('div'); flash.className = 'nx-flash k-' + spec.kind; layer.appendChild(flash); setTimeout(()=> flash.remove(), 1300);
    for(let i = 0; i < spec.n; i++){
      const p = document.createElement('i'); p.className = 'nx-p k-' + spec.kind;
      p.textContent = spec.glyphs[i % spec.glyphs.length];
      let x = cx, y = cy, dx = 0, dy = 0, dur = 1100 + Math.random() * 900;
      const ang = Math.random() * 6.283, dist = 90 + Math.random() * Math.min(W, 520) * 0.55;
      if(spec.kind === 'fall' || spec.kind === 'blizzard'){ x = Math.random() * W; y = -20; dx = (Math.random() - 0.5) * 160; dy = H + 60; dur = 1800 + Math.random() * 1600; if(spec.kind === 'blizzard') dx = 260 + Math.random() * 260; }
      else if(spec.kind === 'rise'){ x = cx + (Math.random() - 0.5) * 220; y = H * 0.62; dx = (Math.random() - 0.5) * 120; dy = -(160 + Math.random() * 240); }
      else if(spec.kind === 'aurora'){ x = Math.random() * W; y = H * (0.25 + Math.random() * 0.5); dx = (Math.random() - 0.5) * 120; dy = -(80 + Math.random() * 160); dur = 1600 + Math.random() * 1200; }
      else if(spec.kind === 'ring'){ const a = (i / spec.n) * 6.283; dx = Math.cos(a) * (150 + Math.random() * 90); dy = Math.sin(a) * (150 + Math.random() * 90); }
      else if(spec.kind === 'zero'){ const a = (i / spec.n) * 6.283 * 3; const r = 30 + (i / spec.n) * 260; dx = Math.cos(a) * r; dy = Math.sin(a) * r; dur = 1500 + Math.random() * 900; }
      else { dx = Math.cos(ang) * dist; dy = Math.sin(ang) * dist - 40; }
      p.style.cssText = `left:${x}px;top:${y}px;--dx:${dx}px;--dy:${dy}px;--rot:${(Math.random() - 0.5) * 720}deg;--d:${dur}ms;font-size:${14 + Math.random() * 20}px;animation-delay:${Math.random() * 220}ms;`
        + (spec.colors ? `color:${spec.colors[i % spec.colors.length]};text-shadow:0 0 12px ${spec.colors[i % spec.colors.length]};` : '');
      layer.appendChild(p);
      setTimeout(()=> p.remove(), dur + 700);
    }
    if(banner){
      const b = document.createElement('div'); b.className = 'nx-banner k-' + spec.kind; b.innerHTML = banner; layer.appendChild(b);
      setTimeout(()=> b.remove(), 2600);
    }
  }
  const victoryFx = (banner)=> playFx(store.victory || 'v_classic', banner);
  const levelupFx = (banner)=> playFx(store.levelup || 'lu_default', banner);
  // レア演出: 満点・大きな自己ベストなどの特別なとき(金色の光の柱 + 専用バナー)
  function rareFx(text){
    if(!calm()){
      const r = document.createElement('div'); r.className = 'nx-rare'; r.innerHTML = '<i></i><i></i><i></i>';
      document.body.appendChild(r); setTimeout(()=> r.remove(), 2200);
    }
    playFx(store.victory === 'v_classic' ? 'v_diamond' : store.victory, `<b>RARE!</b><span>${text}</span>`);
    if(CB().sound) CB().sound('win');
  }

  /* =============== 実績の通知 =============== */
  let achQueue = [], achShowing = false;
  function showAch(list){
    (list || []).forEach(a=> achQueue.push(a));
    if(!achShowing) nextAch();
  }
  async function nextAch(){
    const a = achQueue.shift();
    if(!a){ achShowing = false; return; }
    achShowing = true;
    const rw = a.reward ? `<small>${a.reward.coins ? '🪙+' + fmt(a.reward.coins) + ' ' : ''}${a.reward.xp ? '❄+' + fmt(a.reward.xp) + 'XP' : ''}</small>` : '';
    notify(`<span class="ach-ic">${esc(a.icon || '🏆')}</span><span class="ach-tx"><b>実績を獲得！</b><em>${esc(a.name)}</em><span>${esc(a.desc || '')}</span>${rw}</span>`, 'ach' + (a.hidden ? ' hidden-ach' : ''), 4600);
    if(CB().sound) CB().sound('coin');
    if(a.hidden) rareFx('🔓 隠し実績を解放！');
    await sleep(1400);
    nextAch();
  }

  window.CBV43Core = { esc, fmt, full, num, clamp, notify, modalOpen, modalIs, goLobbyHide, sleep, logged, isAdmin, calm,
                       get store(){ return store; }, touch, persist, pullCloud, pushCloud,
                       cloud: ()=> ({ rev: cloudRev, at: cloudLastAt, err: cloudError, busy: cloudBusy }),
                       setStore(s){ replaceStore(s); persist(); },
                       FX, playFx, victoryFx, levelupFx, rareFx, showAch, applyTheme, THEME_NAMES, snowKick, DEFAULT_STORE };
  applyTheme(store.theme);
})();
