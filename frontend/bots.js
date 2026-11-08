/* =====================================================================
   🤖 AI自動プレイ (v4.3.0) — 管理者(vortx)専用。アップデートログには載せない機能
   ・ボタンを押すと、いま遊んでいるゲーム(パズル / タイムアタック / ウィークリー / テトリス / ミニゲーム全31種)を、AIが代わりに遊びます
   ・ルールは人間とまったく同じ: 「置く・動かす・回す・タップする」だけで操作します。スコアや盤面そのものは書き換えません。
     見えている情報(盤面・画面に出ているもの)だけを使い、隠れている情報(めくっていないカード、次に出る乱数など)は使いません
   ・速さは「ゆっくり / ふつう / はやい / 最速」。「連続プレイ」をONにすると、終わるたびに自動でもう一度遊びます
   ・管理者以外のアカウントでは、ボタンも出ず、何も起きません(isAdmin はサーバー側の管理者IDと同じ判定)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const G = ()=> window.CBGame || {};
  const KEY = 'nexus-bot-v1';
  const SP = {
    slow:   { f: 0.4, react: 240, label: 'ゆっくり' },
    normal: { f: 1,   react: 110, label: 'ふつう' },
    fast:   { f: 3,   react: 40,  label: 'はやい' },
    max:    { f: 14,  react: 0,   label: '最速' }
  };
  let cfg = { speed: 'normal', auto: false };
  try{ Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); }catch(e){}
  if(!SP[cfg.speed]) cfg.speed = 'normal';
  const save = ()=>{ try{ localStorage.setItem(KEY, JSON.stringify(cfg)); }catch(e){} };
  const F = ()=> SP[cfg.speed].f;
  const REACT = ()=> SP[cfg.speed].react;
  const isAdmin = ()=> !!(CB().isAdmin && CB().isAdmin());

  let running = false, ctl = null, specs = {}, curGame = null, status = '';
  const setStatus = (t)=>{ status = t; const el = document.querySelector('#nxBot .bot-st'); if(el) el.textContent = t; };

  /* ---------- 後片付けつきのタイマー(止めると全部止まる) ---------- */
  function makeCtl(){
    const c = { dead: false, timers: new Set(), raf: new Set(), obs: [], listeners: [] };
    c.after = (ms, fn)=>{ const t = setTimeout(()=>{ c.timers.delete(t); if(!c.dead) fn(); }, ms); c.timers.add(t); return t; };
    c.every = (ms, fn)=>{ const t = setInterval(()=>{ if(!c.dead) fn(); }, ms); c.timers.add(t); return t; };
    c.pace = (baseMs, fn)=> c.after(baseMs / F(), fn);                       // 速さに合わせて待つ
    c.frame = (fn)=>{ let id = 0; const loop = (ts)=>{ if(c.dead) return; c.raf.delete(id); try{ fn(ts); }catch(e){ console.warn('bot frame', e); } id = requestAnimationFrame(loop); c.raf.add(id); }; id = requestAnimationFrame(loop); c.raf.add(id); };
    c.watch = (el, fn, opts)=>{ const mo = new MutationObserver(()=>{ if(!c.dead) fn(); }); mo.observe(el, opts || { subtree: true, childList: true, attributes: true, characterData: true }); c.obs.push(mo); return mo; };
    c.on = (t, ev, fn)=>{ t.addEventListener(ev, fn); c.listeners.push([t, ev, fn]); };
    c.stop = ()=>{ c.dead = true; c.timers.forEach(t=>{ clearTimeout(t); clearInterval(t); }); c.raf.forEach(id=> cancelAnimationFrame(id)); c.obs.forEach(o=> o.disconnect()); c.listeners.forEach(([t, ev, fn])=> t.removeEventListener(ev, fn)); };
    return c;
  }
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

  /* ---------- 人間と同じ操作(タップ・キー・ポインタ) ---------- */
  function pointer(el, type, x, y){
    if(!el) return;
    const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x || 0, clientY: y || 0, button: 0, buttons: type === 'pointerup' ? 0 : 1 };
    try{ el.dispatchEvent(new PointerEvent(type, o)); }catch(e){ el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), o)); }
  }
  function center(el){ const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  const down = (el)=>{ const [x, y] = center(el); pointer(el, 'pointerdown', x, y); };
  const up = (el)=>{ const [x, y] = center(el); pointer(el, 'pointerup', x, y); };
  const tap = (el)=>{ down(el); up(el); };                                   // pointerdown / up を送る(ゲームの press() が受ける)
  const clickEl = (el)=>{ if(el) el.click(); };                              // click で動くボタン(カードなど)
  const KCODE = { ' ': 'Space', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  function key(k, type){ document.dispatchEvent(new KeyboardEvent(type || 'keydown', { key: k, code: KCODE[k] || ('Key' + String(k).toUpperCase()), bubbles: true, cancelable: true })); }
  // キャンバスの横位置(ゲーム内の座標 gx / 全体の幅 W)をポインタで指す(ドラッグと同じ)
  function pointAt(cv, gx, W, type){
    const r = cv.getBoundingClientRect(); pointer(cv, type || 'pointermove', r.left + gx / W * r.width, r.top + r.height * 0.8);
  }

  /* =====================================================================
     メインのゲーム: ブロックパズル(パズル / タイムアタック / ウィークリー)
     ===================================================================== */
  function pzClone(cells){ return cells.slice(); }
  function pzCanPlace(cells, S, shape, r, c){
    for(const [dr, dc] of shape){ const rr = r + dr, cc = c + dc; if(rr < 0 || rr >= S || cc < 0 || cc >= S || cells[rr * S + cc]) return false; }
    return true;
  }
  // 置いて、そろったラインを消す。戻り値: { cells, lines }
  function pzApply(cells, S, shape, r, c){
    const a = cells.slice(); for(const [dr, dc] of shape) a[(r + dr) * S + (c + dc)] = true;
    const rows = [], cols = [];
    for(let i = 0; i < S; i++){ let fr = true, fc = true; for(let j = 0; j < S; j++){ if(!a[i * S + j]) fr = false; if(!a[j * S + i]) fc = false; } if(fr) rows.push(i); if(fc) cols.push(i); }
    for(const i of rows) for(let j = 0; j < S; j++) a[i * S + j] = false;
    for(const i of cols) for(let j = 0; j < S; j++) a[j * S + i] = false;
    return { cells: a, lines: rows.length + cols.length };
  }
  // 盤面の「悪さ」: 穴(まわりを囲まれた空き)・ギザギザ・埋まり具合
  function pzBad(a, S){
    let filled = 0, holes = 0, rough = 0;
    for(let r = 0; r < S; r++) for(let c = 0; c < S; c++){
      const f = a[r * S + c]; if(f){ filled++; continue; }
      let n = 0; if(r === 0 || a[(r - 1) * S + c]) n++; if(r === S - 1 || a[(r + 1) * S + c]) n++; if(c === 0 || a[r * S + c - 1]) n++; if(c === S - 1 || a[r * S + c + 1]) n++;
      if(n === 4) holes += 3; else if(n === 3) holes += 1;
      if(c < S - 1 && !a[r * S + c + 1] === !!f) {} 
    }
    for(let r = 0; r < S; r++) for(let c = 0; c < S - 1; c++){ if(!!a[r * S + c] !== !!a[r * S + c + 1]) rough++; }
    for(let c = 0; c < S; c++) for(let r = 0; r < S - 1; r++){ if(!!a[r * S + c] !== !!a[(r + 1) * S + c]) rough++; }
    return filled * 0.2 + holes * 2 + rough * 1.4;          // 重みは、ゲームの形で何千手もシミュレーションして調整した値
  }
  function pzMoves(cells, S, shape){
    const out = [];
    for(let r = 0; r < S; r++) for(let c = 0; c < S; c++) if(pzCanPlace(cells, S, shape, r, c)){
      const res = pzApply(cells, S, shape, r, c);
      out.push({ r, c, cells: res.cells, lines: res.lines, val: res.lines * 30 - pzBad(res.cells, S) });
    }
    return out.sort((x, y)=> y.val - x.val);
  }
  // 残りのピースを、置く順番も含めて、深さ優先で探す(各段で上位だけ試す)
  function pzSearch(cells, S, pieces, beam){
    let best = null;
    const perms = []; const idx = pieces.map((_, i)=> i);
    (function rec(cur, rest){ if(!rest.length){ perms.push(cur); return; } rest.forEach((x, i)=> rec(cur.concat(x), rest.filter((_, j)=> j !== i))); })([], idx);
    for(const order of perms){
      (function go(k, cur, acc, seq){
        if(k === order.length){ const sc = acc - pzBad(cur, S) * 0.0; if(!best || sc > best.score) best = { score: sc, seq }; return; }
        const p = pieces[order[k]]; const ms = pzMoves(cur, S, p.shape).slice(0, beam);
        if(!ms.length){ const sc = acc - 60 * (order.length - k); if(!best || sc > best.score) best = { score: sc, seq }; return; }
        for(const m of ms) go(k + 1, m.cells, acc + m.lines * 30 - pzBad(m.cells, S) * (k === order.length - 1 ? 1 : 0.25), seq.concat({ i: p.i, r: m.r, c: m.c }));
      })(0, cells, 0, []);
    }
    return best;
  }
  let pzBusyUntil = 0;
  function puzzleStep(){
    const P = G().puzzle; if(!P || !P.active()) return;
    if(performance.now() < pzBusyUntil) return;
    const S = P.size(), cells = P.cells(), tray = P.tray();
    const pieces = tray.map((p, i)=> ({ i, shape: p.shape, used: p.used })).filter(p=> !p.used);
    if(!pieces.length) return;
    const plan = pzSearch(cells, S, pieces, 6);
    if(!plan || !plan.seq.length){
      // どこにも置けない = ゲームオーバー待ち(何もしない)
      return;
    }
    const m = plan.seq[0];
    if(P.place(m.i, m.r, m.c)) pzBusyUntil = performance.now() + Math.max(300, 700 / F());      // ライン消去のアニメが終わるまで待つ
  }

  /* =====================================================================
     メインのゲーム: テトリス(ソロ / スプリント / ウルトラ / VS)
     ===================================================================== */
  function tcells(matrix, row, col){ const out = []; for(let r = 0; r < matrix.length; r++) for(let c = 0; c < matrix[r].length; c++) if(matrix[r][c]) out.push([row + r, col + c]); return out; }
  const rotCW = (m)=>{ const n = m.length; const o = m.map(()=> new Array(n).fill(0)); for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) o[c][n - 1 - r] = m[r][c]; return o; };
  function tHeights(grid, rows, cols){
    const h = new Array(cols).fill(0);
    for(let c = 0; c < cols; c++){ for(let r = 0; r < rows; r++) if(grid[r][c] !== -1){ h[c] = rows - r; break; } }
    return h;
  }
  function tEval(grid, rows, cols, lines){
    const h = tHeights(grid, rows, cols); let holes = 0, bump = 0, agg = 0, maxH = 0, wells = 0;
    for(let c = 0; c < cols; c++){
      agg += h[c]; if(h[c] > maxH) maxH = h[c];
      let seen = false; for(let r = 0; r < rows; r++){ if(grid[r][c] !== -1) seen = true; else if(seen) holes++; }
      if(c < cols - 1) bump += Math.abs(h[c] - h[c + 1]);
    }
    for(let c = 0; c < cols; c++){ const l = c === 0 ? 99 : h[c - 1], r = c === cols - 1 ? 99 : h[c + 1]; const d = Math.min(l, r) - h[c]; if(d >= 3) wells += d; }
    const lineScore = [0, 0.8, 2.4, 4.6, 9][lines] || 0;
    return lineScore * 3.0 - holes * 6.4 - bump * 0.62 - agg * 0.33 - maxH * 0.22 - wells * 0.55;
  }
  function tPlacements(st, type){
    const def = st.minos[type]; let m = def.matrix.map(r=> r.slice()); const out = [];
    const seen = new Set();
    for(let rot = 0; rot < 4; rot++){
      const key = JSON.stringify(m);
      if(!seen.has(key)){
        seen.add(key);
        const n = m.length;
        for(let col = -3; col < st.cols; col++){
          if(st.collides(m, -1, col) && st.collides(m, 0, col)) continue;
          if(st.collides(m, -1, col)) continue;
          let row = -1; while(!st.collides(m, row + 1, col)) row++;
          // ブロックを置いたあとの盤面
          const g = st.grid.map(r=> r.slice()); let ok = true;
          for(const [rr, cc] of tcells(m, row, col)){ if(rr < 0){ ok = false; break; } g[rr][cc] = 1; }
          if(!ok) continue;
          let lines = 0; for(let r = st.rows - 1; r >= 0; r--){ if(g[r].every(v=> v !== -1)){ lines++; g.splice(r, 1); g.unshift(new Array(st.cols).fill(-1)); r++; } }
          out.push({ rot, col, row, score: tEval(g, st.rows, st.cols, lines), n });
        }
      }
      m = rotCW(m);
    }
    return out;
  }
  let tBusy = 0, tPlan = null, tPieceKey = '';
  function tetrisStep(){
    const T = G().tetris; if(!T || !T.active()) return;
    const st = T.state(); const p = st.piece; if(!p) return;
    const pkey = p.type + ':' + st.next + ':' + (st.hold || '-');
    // 新しいミノが出たら、置き場所を決める(ホールドも含めて比べる)
    if(tPieceKey !== pkey + ':' + p.row || !tPlan){
      if(!tPlan || tPlan.piece !== p){
        const cur = tPlacements(st, p.type).sort((a, b)=> b.score - a.score)[0];
        let choice = { useHold: false, place: cur, score: cur ? cur.score : -1e9 };
        if(!st.holdUsed){
          const ht = st.hold || st.next;
          if(ht){
            const alt = tPlacements(st, ht).sort((a, b)=> b.score - a.score)[0];
            if(alt && alt.score > choice.score + 0.8) choice = { useHold: true, place: alt, score: alt.score };
          }
        }
        tPlan = { piece: p, choice, rotsDone: 0 };
      }
    }
    tPieceKey = pkey + ':' + p.row;
    const ch = tPlan.choice;
    if(ch.useHold){ T.hold(); tPlan = null; return; }
    if(!ch.place){ T.hard(); tPlan = null; return; }
    const target = ch.place;
    // 回す → 横に動かす → 落とす(人間と同じキー操作の順番)
    if(tPlan.rotsDone < target.rot){ const before = p.rot; T.rotate(); if(p.rot === before){ tPlan.rotsDone = target.rot; } else tPlan.rotsDone++; return; }
    if(p.col < target.col){ const b = p.col; T.move(1); if(p.col === b) tPlan.stuck = (tPlan.stuck || 0) + 1; if(tPlan.stuck > 3){ T.hard(); tPlan = null; } return; }
    if(p.col > target.col){ const b = p.col; T.move(-1); if(p.col === b) tPlan.stuck = (tPlan.stuck || 0) + 1; if(tPlan.stuck > 3){ T.hard(); tPlan = null; } return; }
    T.hard(); tPlan = null;
  }

  /* ---------- メインのゲームを動かす見張り番 ---------- */
  function mainLoop(c){
    c.every(40, ()=>{
      if(!running) return;
      const g = G();
      if(!g.inGame || !g.inGame()){ return; }
      if(g.overOpen && g.overOpen()){
        if(cfg.auto){ if(!c.restartAt){ c.restartAt = performance.now() + 1400 / F(); } else if(performance.now() >= c.restartAt){ c.restartAt = 0; g.restart(); tPlan = null; pzBusyUntil = 0; } }
        else { stop('ゲームが終わりました'); }
        return;
      }
      c.restartAt = 0;
      const gap = Math.max(18, 160 / F());
      if(g.mode() === 'tetris'){ if(!c.lastT || performance.now() - c.lastT >= (g.tetris.state().vs ? gap : gap)){ c.lastT = performance.now(); tetrisStep(); } }
      else puzzleStep();
    });
  }
  window.__nxBotInternals = { pzSearch, pzApply, pzCanPlace, tPlacements, tEval };

  /* =====================================================================
     ミニゲーム: ゲームごとのボット(下に続く bots2.js 部分で登録)
     ===================================================================== */
  const BOTS = {};
  window.CBBotLib = { BOTS, makeCtl, tap, down, up, clickEl, key, pointAt, pointer, sleep, F, REACT, SP, cfg, center, isRunning: ()=> running };

  function runMini(id, stage){
    stopMini();
    const fn = BOTS[id]; const sp = specs[id];
    if(!fn){ setStatus('このゲームのAIはまだありません'); return; }
    const c = makeCtl(); ctl = c; curGame = id;
    try{ fn({ stage, spec: sp && sp.stage === stage ? sp.spec : (sp ? sp.spec : null), c, F, REACT, tap, down, up, click: clickEl, key, pointAt, pointer, sleep, center }); setStatus(`🤖 ${SP[cfg.speed].label}で プレイ中`); }
    catch(e){ console.warn('bot error', id, e); setStatus('AIでエラーが起きました: ' + (e.message || e)); }
  }
  function stopMini(){ if(ctl){ ctl.stop(); ctl = null; } curGame = null; }

  /* ---------- 外から呼ばれる窓口(minigames.js) ---------- */
  let mainCtl = null;
  function start(){
    if(!isAdmin()) return;
    running = true; render();
    // ミニゲームの途中なら、そのゲームのAIを始める
    if(document.body.classList.contains('mg-open') && window.CBMini && window.__nxCurMini){ runMini(window.__nxCurMini.id, window.__nxCurMini.stage); }
    if(!mainCtl){ mainCtl = makeCtl(); mainLoop(mainCtl); }
    setStatus(`🤖 ${SP[cfg.speed].label}で プレイ中`);
  }
  function stop(msg){
    running = false; stopMini();
    if(mainCtl){ mainCtl.stop(); mainCtl = null; }
    tPlan = null; setStatus(msg || '待機中'); render();
  }
  const API = {
    attach(id, stage, spec){ specs[id] = { stage, spec }; },
    gameStarted(id, stage){ window.__nxCurMini = { id, stage }; if(running && isAdmin()) runMini(id, stage); render(); },
    gameEnded(id, nav){
      stopMini();
      if(!running) return;
      if(cfg.auto) setTimeout(()=>{ if(running) nav.again(); }, 1800 / F());
      else stop('ゲームが終わりました');
    },
    userLeft(){ if(running){ stopMini(); } window.__nxCurMini = null; },
    running(){ return running; },
    start, stop, cfg, SP
  };
  window.CBBot = API;

  /* ---------- 画面の右下のボタン(管理者だけ) ---------- */
  function ensureUI(){
    let el = document.getElementById('nxBot');
    if(!el){
      el = document.createElement('div'); el.id = 'nxBot';
      el.innerHTML = `<div class="bot-panel"><div class="bot-speeds">${Object.entries(SP).map(([k, v])=> `<button type="button" class="bot-sp" data-sp="${k}">${v.label}</button>`).join('')}</div>
        <label><input type="checkbox" id="botAuto"> 連続プレイ(終わったら自動でもう一度)</label><div class="bot-st"></div></div>
        <button type="button" class="bot-main" id="botMain"><span>🤖</span><b>AIにまかせる</b></button>`;
      document.body.appendChild(el);
      el.querySelector('#botMain').addEventListener('click', ()=>{ if(running) stop('とめました'); else start(); });
      el.querySelector('#botMain').addEventListener('contextmenu', (e)=>{ e.preventDefault(); el.classList.toggle('open'); });
      let lp = 0; const mm = el.querySelector('#botMain');
      mm.addEventListener('pointerdown', ()=>{ lp = setTimeout(()=>{ el.classList.toggle('open'); lp = -1; }, 550); });
      mm.addEventListener('pointerup', (e)=>{ clearTimeout(lp); if(lp === -1){ e.stopImmediatePropagation(); } }, true);
      el.querySelectorAll('.bot-sp').forEach(b=> b.addEventListener('click', ()=>{ cfg.speed = b.dataset.sp; save(); render(); if(running){ if(curGame && window.__nxCurMini) runMini(curGame, window.__nxCurMini.stage); setStatus(`🤖 ${SP[cfg.speed].label}で プレイ中`); } }));
      el.querySelector('#botAuto').addEventListener('change', (e)=>{ cfg.auto = e.target.checked; save(); });
      const gear = document.createElement('button'); gear.type = 'button'; gear.className = 'bot-gear'; gear.textContent = '⚙'; gear.title = '速さ・連続プレイ'; gear.addEventListener('click', ()=> el.classList.toggle('open'));
      el.insertBefore(gear, el.firstChild);
    }
    return el;
  }
  function render(){
    const el = ensureUI();
    el.classList.toggle('on', running);
    el.querySelector('#botMain b').textContent = running ? 'AI プレイ中(タップで停止)' : 'AIにまかせる';
    el.querySelectorAll('.bot-sp').forEach(b=> b.classList.toggle('on', b.dataset.sp === cfg.speed));
    el.querySelector('#botAuto').checked = !!cfg.auto;
    const st = el.querySelector('.bot-st'); if(st) st.textContent = status;
  }
  function visibility(){
    if(!isAdmin()){ const el = document.getElementById('nxBot'); if(el){ el.classList.remove('show'); } if(running) stop(); return; }
    const el = ensureUI();
    const inMini = document.body.classList.contains('mg-open') && !!window.__nxCurMini;
    const g = G();
    const inMain = !!(g.inGame && g.inGame());
    el.classList.toggle('show', inMini || inMain);
    if(!inMini && !inMain && running) stop();
  }
  setInterval(visibility, 700);
})();
