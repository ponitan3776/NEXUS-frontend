/* =====================================================================
   🤖 ミニゲーム31本のボット (bots.js の続き)
   人間と同じルール: 画面に見えている情報だけを使い、タップ・キー・ポインタで操作する
   ・見えていない情報(めくっていないカード、次の乱数 など)は使いません
   ・canvas のゲームは、見えている状態を spec(各ゲームが api.bot() で渡す読み取り窓口)から受け取ります
   ===================================================================== */
(function(){
  'use strict';
  const L = window.CBBotLib; if(!L) return;
  const { BOTS, tap, down, up, key, pointAt, pointer, sleep } = L;
  const clamp = (v, a, b)=> Math.max(a, Math.min(b, v));
  const $$ = (root, sel)=> Array.from(root.querySelectorAll(sel));
  const now = ()=> performance.now();

  /* ---------- 2048: 期待値探索(角に大きいタイルを集める) ---------- */
  function slide2048(g, dir){
    const N = 4; const out = g.map(r=> r.slice()); let gain = 0, moved = false;
    const pos = (i, j)=> dir === 0 ? [i, j] : dir === 2 ? [i, N - 1 - j] : dir === 1 ? [j, i] : [N - 1 - j, i];
    for(let i = 0; i < N; i++){
      const line = []; for(let j = 0; j < N; j++){ const [r, c] = pos(i, j); line.push(g[r][c]); }
      const res = []; let k = 0;
      const vals = line.filter(v=> v);
      while(k < vals.length){ if(k + 1 < vals.length && vals[k] === vals[k + 1]){ res.push(vals[k] * 2); gain += vals[k] * 2; k += 2; } else { res.push(vals[k]); k++; } }
      while(res.length < N) res.push(0);
      for(let j = 0; j < N; j++){ const [r, c] = pos(i, j); if(out[r][c] !== res[j]) moved = true; out[r][c] = res[j]; }
    }
    return { g: out, gain, moved };
  }
  function eval2048(g){
    let empty = 0, smooth = 0, mono = [0, 0, 0, 0], max = 0, sum = 0;
    for(let r = 0; r < 4; r++) for(let c = 0; c < 4; c++){
      const v = g[r][c]; if(!v){ empty++; continue; }
      const lv = Math.log2(v); max = Math.max(max, lv); sum += lv;
      if(c < 3 && g[r][c + 1]) smooth -= Math.abs(lv - Math.log2(g[r][c + 1]));
      if(r < 3 && g[r + 1][c]) smooth -= Math.abs(lv - Math.log2(g[r + 1][c]));
    }
    for(let r = 0; r < 4; r++){ for(let c = 0; c < 3; c++){ const a = g[r][c] ? Math.log2(g[r][c]) : 0, b = g[r][c + 1] ? Math.log2(g[r][c + 1]) : 0; if(a > b) mono[0] += b - a; else mono[1] += a - b; } }
    for(let c = 0; c < 4; c++){ for(let r = 0; r < 3; r++){ const a = g[r][c] ? Math.log2(g[r][c]) : 0, b = g[r + 1][c] ? Math.log2(g[r + 1][c]) : 0; if(a > b) mono[2] += b - a; else mono[3] += a - b; } }
    const corner = [g[0][0], g[0][3], g[3][0], g[3][3]].some(v=> v && Math.log2(v) === max) ? max * 1.2 : 0;
    return empty * 2.7 + smooth * 0.1 + Math.max(mono[0], mono[1]) * 1.0 + Math.max(mono[2], mono[3]) * 1.0 + corner + (empty > 0 ? 0 : -30);
  }
  function expect2048(g, depth, isMax){
    if(depth < 0) return eval2048(g);                                  // 深さが尽きたら、盤面の評価を返す(止まらずに再帰し続けない)
    if(isMax){
      let best = -1e9;
      for(let d = 0; d < 4; d++){ const r = slide2048(g, d); if(!r.moved) continue; best = Math.max(best, depth === 0 ? eval2048(r.g) + r.gain * 0.01 : expect2048(r.g, depth - 1, false)); }
      return best === -1e9 ? -1e6 : best;
    }
    const cells = []; for(let r = 0; r < 4; r++) for(let c = 0; c < 4; c++) if(!g[r][c]) cells.push([r, c]);
    if(!cells.length) return eval2048(g);
    const pick = cells.length > 6 ? cells.filter((_, i)=> i % Math.ceil(cells.length / 6) === 0) : cells;
    let tot = 0;
    for(const [r, c] of pick){ for(const [v, p] of [[2, 0.9], [4, 0.1]]){ const h = g.map(x=> x.slice()); h[r][c] = v; tot += p * expect2048(h, depth - 1, true); } }
    return tot / pick.length;
  }
  BOTS.g2048 = ({ spec, c, F })=>{
    c.every(Math.max(10, 170 / F()), ()=>{
      if(spec.over() || spec.busy()) return;
      const g = spec.grid(); let empties = 0; g.forEach(r=> r.forEach(v=>{ if(!v) empties++; }));
      const depth = empties > 7 ? 1 : empties > 3 ? 2 : 3;
      let best = -1, bv = -1e18;
      for(let d = 0; d < 4; d++){ const r = slide2048(g, d); if(!r.moved) continue; const v = expect2048(r.g, depth, false) + r.gain * 0.002; if(v > bv){ bv = v; best = d; } }
      if(best >= 0) spec.move(best);
    });
  };

  /* ---------- スノー・スネーク: 食べ物へ最短 + 食べたあとに尾へ戻れるときだけ進む ---------- */
  BOTS.snake = ({ spec, c })=>{
    const N = spec.N; let lastHead = null, started = false;
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const inb = (x, y)=> x >= 0 && y >= 0 && x < N && y < N;
    function bfs(from, goal, blocked){
      const q = [from], prev = new Map(); prev.set(from.x + ',' + from.y, null);
      while(q.length){ const p = q.shift(); if(p.x === goal.x && p.y === goal.y){ const path = []; let k = p.x + ',' + p.y; while(prev.get(k)){ const pr = prev.get(k); path.push({ x: +k.split(',')[0], y: +k.split(',')[1] }); k = pr; } return path.reverse(); }
        for(const [dx, dy] of D){ const nx = p.x + dx, ny = p.y + dy, kk = nx + ',' + ny; if(!inb(nx, ny) || blocked.has(kk) || prev.has(kk)) continue; prev.set(kk, p.x + ',' + p.y); q.push({ x: nx, y: ny }); } }
      return null;
    }
    function decide(){
      const sn = spec.snake(), food = spec.food(), head = sn[0], tail = sn[sn.length - 1];
      const body = new Set(sn.slice(0, -1).map(s=> s.x + ',' + s.y));
      // 1) 食べ物への最短経路。食べたあと、頭から尾へ戻れるなら安全
      const toFood = bfs(head, food, body);
      if(toFood && toFood.length){
        const ns = [...toFood.slice().reverse().map(p=> ({ x: p.x, y: p.y })), ...sn];
        const virt = ns.slice(0, sn.length + 1); const vb = new Set(virt.slice(1, -1).map(s=> s.x + ',' + s.y));
        const back = bfs(virt[0], virt[virt.length - 1], vb);
        if(back) return toFood[0];
      }
      // 2) 尾を追いかける(長い道を選んで、ぐるぐる)
      let best = null, bl = -1;
      for(const [dx, dy] of D){ const nx = head.x + dx, ny = head.y + dy, kk = nx + ',' + ny; if(!inb(nx, ny) || body.has(kk)) continue;
        const sb = new Set(sn.slice(0, -1).map(s=> s.x + ',' + s.y)); sb.add(head.x + ',' + head.y);
        const path = bfs({ x: nx, y: ny }, tail, sb); const len = path ? path.length : 0;
        const roomy = len + (path ? 5 : 0) - (Math.abs(nx - food.x) + Math.abs(ny - food.y)) * 0.01;
        if(roomy > bl){ bl = roomy; best = { x: nx, y: ny }; } }
      return best;
    }
    c.every(6, ()=>{
      if(spec.dead()) return;
      if(!started){ started = true; spec.turn(1, 0); return; }
      const sn = spec.snake(); const h = sn[0]; const hk = h.x + ',' + h.y + ',' + sn.length;
      if(hk === lastHead) return; lastHead = hk;
      const nx = decide(); if(!nx) return;
      const dir = spec.dir(); const dx = nx.x - h.x, dy = nx.y - h.y;
      if(dx === dir.x && dy === dir.y) return;
      spec.turn(dx, dy);
    });
  };

  /* ---------- スノー・フライト: 次の氷柱のすき間の中央へ ---------- */
  BOTS.flight = ({ spec, c })=>{
    const K = spec.k; let last = 0;
    c.frame((ts)=>{
      if(spec.dead()) return;
      const s = spec.state();
      if(!s.started){ spec.flap(); return; }
      const dt = clamp((ts - (last || ts)) / 1000, 0.006, 0.033); last = ts;      // ゲームの1フレームぶんの時間
      const p = s.pipes.find(q=> q.x + K.PW > K.GX - 14) || s.pipes[0];
      // 次のフレームで、すき間の下の縁(余裕つき)をこえそうなら、はねる。遠いときは、すき間の少し上を目指す
      const vy2 = s.vy + K.GRAV * dt, yn = s.y + vy2 * dt;
      const low = p.top + K.GAP - 13 - 10, near = (p.x - K.GX) < 150;
      const tgt = near ? low : Math.min(low, p.top + K.GAP * 0.6);
      if(yn > tgt) spec.flap();
    });
  };

  /* ---------- ウィンター・ラン: 物理を先読みして、ジャンプ / しゃがみを選ぶ ---------- */
  BOTS.dino = ({ spec, c })=>{
    const K = spec.k, H = 62;
    function sim(st, policy, horizon){
      let { y, vy, duck, speed } = st; const obs = st.obs.map(o=> ({ x: o.x, y: o.y, w: o.w, h: o.h, t: o.t }));
      const gnd = K.GROUND - 47;
      for(let f = 0; f < horizon; f++){
        const a = policy(f);                                   // 0:そのまま 1:ジャンプ 2:しゃがむ 3:しゃがみをやめる
        if(a === 1 && y >= gnd - 0.1 && !duck) vy = K.JUMP;
        if(a === 2) duck = true; else if(a === 3 || a === 1) duck = false;
        speed = Math.min(13, speed + 0.0016);
        vy += K.GRAV + (duck && y < gnd ? 1.1 : 0); y += vy; if(y >= gnd){ y = gnd; vy = 0; }
        obs.forEach(o=>{ o.x -= speed; });
        const d = (duck && y >= gnd - 0.1) ? { x: K.X0, y: K.GROUND - 24, w: 52, h: 22 } : { x: K.X0 + 10, y: y + 3, w: 30, h: 42 };
        for(const o of obs){ const m = o.t === 'bat' ? 6 : 3; if(d.x < o.x + o.w - m && d.x + d.w > o.x + m && d.y < o.y + o.h - m && d.y + d.h > o.y + m) return f; }
      }
      return horizon;
    }
    c.frame(()=>{
      const st = spec.state(); if(st.dead) return;
      if(!st.started){ spec.jump(); return; }
      const onGround = st.y >= K.GROUND - 47 - 0.1;
      const standSafe = sim(st, (f)=> f === 0 ? 3 : 0, H);             // 立って(しゃがみをやめて)進んで大丈夫?
      if(standSafe >= H){ if(st.duck) spec.setDuck(false); return; }
      const duckSafe = sim(st, ()=> 2, H);                              // しゃがんだまま進めば大丈夫?
      if(duckSafe >= H){ spec.setDuck(true); return; }
      if(onGround){
        // ジャンプ: 「いま跳べば安全」で「2フレーム待つと危ない」ときに跳ぶ(ぎりぎりまで引きつける)
        const jn = sim(st, (f)=> f === 0 ? 1 : 0, H), jl = sim(st, (f)=> f === 2 ? 1 : (f === 0 ? 3 : 0), H);
        if((jn >= H && jl < H) || (jn >= H && standSafe < 22) || (jn > standSafe && standSafe < 12)){ spec.setDuck(false); spec.jump(); return; }
      }
      spec.setDuck(duckSafe > standSafe);                              // どれもだめなら、長く生き残るほう
    });
  };

  /* ---------- アイスブロック崩し: いちばん早く落ちてくるボールを追い、余裕があるときはアイテムも拾う ---------- */
  BOTS.breakout = ({ spec, c, stage })=>{
    const K = spec.k, cv = stage.querySelector('canvas'); let waited = 0;
    // ボールがバーの高さに着く位置と、着くまでの時間(フレーム数)。壁での跳ね返りも考える
    function landing(b){
      if(b.vy <= 0) return null;
      const t = (K.PY - K.BR - b.y) / b.vy, w = K.W - 2 * K.BR; let xx = (b.x + b.vx * t - K.BR) % (2 * w); if(xx < 0) xx += 2 * w;
      return { x: K.BR + (xx > w ? 2 * w - xx : xx), t };
    }
    c.frame(()=>{
      if(spec.over()) return;
      const balls = spec.balls();
      if(balls.some(b=> !b.launched)){ if(++waited > 20){ waited = 0; spec.launch(); } return; }
      const lands = balls.map(b=> ({ b, l: landing(b) })).filter(o=> o.l).sort((p, q)=> p.l.t - q.l.t);
      const pw = spec.pw(), cl = (x)=> clamp(x, pw / 2, K.W - pw / 2);
      // 打ち返す向き: いちばん下に残っているブロックをねらう(ファイア中は、まっすぐ上でよい)
      const bricks = spec.bricks(); let tx = K.W / 2;
      if(bricks.length){ const low = Math.max(...bricks.map(r=> r.y)); const row = bricks.filter(r=> r.y === low); tx = row[Math.floor(row.length / 2)].x + K.BW / 2; }
      let target = null, urgentT = 1e9;
      if(lands.length){
        const o = lands[0]; urgentT = o.l.t;
        const rel = clamp(Math.atan2(tx - o.l.x, 330), -0.8, 0.8);
        target = cl(o.l.x - rel * (pw / 2) * 0.9);
      }
      // アイテム: ボールが着くより十分早く、バーのところに落ちてくるなら、先に拾いに行く
      const drops = spec.drops(); let best = null, bt = 1e9;
      for(const d of drops){ const t = (K.PY - d.y) / d.vy; if(t > -2 && t < bt && t < urgentT - 10){ bt = t; best = d; } }
      if(best && (target === null || bt < urgentT - 10)) target = cl(best.x);
      if(target === null){ const hi = balls.length ? balls[0].x : K.W / 2; target = cl(hi); }
      pointAt(cv, target, K.W, 'pointermove');
    });
  };

  /* ---------- スノーフレークキャッチ: 🔥を避けて、雪のかけらの下へ ---------- */
  BOTS.catch = ({ spec, c, stage })=>{
    const K = spec.k, cv = stage.querySelector('canvas'), half = K.BWID / 2;
    // かごは、ポインタで指した位置へ すぐ動く。だから「これから約0.12秒以内に受け取りゾーンへ入るもの」だけを見て、
    // その瞬間にいちばん得な位置へ動けばよい(🔥があるときは、そこを避ける)
    c.frame(()=>{
      if(spec.over()) return;
      const items = spec.items(), x0 = spec.x();
      const soon = items.map(it=>{
        const eta0 = (K.BY - 16 - it.y) / it.v, eta1 = (K.BY + 24 - it.y) / it.v;     // ゾーンに入る/出る時刻(秒)
        return { it, eta0, eta1 };
      }).filter(o=> o.eta1 > -0.02 && o.eta0 < 0.12);
      if(!soon.length) return;
      const cands = new Set([x0]);
      soon.forEach(o=>{ if(o.it.t !== 'skull'){ cands.add(o.it.x); cands.add(o.it.x - half + 14); cands.add(o.it.x + half - 14); } });
      soon.forEach(o=>{ if(o.it.t === 'skull'){ cands.add(o.it.x - half - 16); cands.add(o.it.x + half + 16); } });
      cands.add(K.BWID / 2); cands.add(K.W - K.BWID / 2);
      let best = x0, bs = -1e12;
      for(const x0c of cands){
        const x = clamp(x0c, half, K.W - half);
        let sc = -Math.abs(x - x0) * 0.001;
        for(const o of soon){
          const near = Math.abs(o.it.x - x) < half + 8;
          if(!near) continue;
          if(o.it.t === 'skull') sc -= 100000; else sc += (o.it.t === 'pump' ? 50 : o.it.t === 'lolli' ? 30 : 10);
        }
        if(sc > bs){ bs = sc; best = x; }
      }
      pointAt(cv, best, K.W, 'pointermove');
    });
  };

  /* ---------- アイス・タワー: ぴったり重なる瞬間に置く(連続パーフェクトで幅が広がる) ---------- */
  BOTS.stack = ({ spec, c })=>{
    let cool = 0;
    c.frame(()=>{
      if(spec.over()) return;
      const cur = spec.cur(), top = spec.top();
      if(now() < cool) return;
      const d = cur.x - top.x, step = spec.speed() * 1.0;
      if(Math.abs(d) <= 3.2 || (Math.abs(d) < step && step > 6.4 && d * cur.dir < 0)){ spec.place(); cool = now() + 60; }
    });
  };

  /* ---------- こおりの迷宮: 見えている迷路の最短経路 ---------- */
  BOTS.maze = ({ spec, c, F })=>{
    function path(){
      const g = spec.grid(), N = g.length, [px, py] = spec.pos(), [ex, ey] = spec.exit;
      const q = [[px, py]], prev = new Map([[px + ',' + py, null]]);
      while(q.length){ const [x, y] = q.shift(); if(x === ex && y === ey) break;
        for(const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if(nx < 0 || ny < 0 || nx >= N || ny >= N || g[ny][nx] || prev.has(k)) continue; prev.set(k, x + ',' + y); q.push([nx, ny]); } }
      const out = []; let k = ex + ',' + ey; if(!prev.has(k)) return out;
      while(prev.get(k)){ out.push(k.split(',').map(Number)); k = prev.get(k); }
      return out.reverse();
    }
    const stepOnce = ()=>{
      if(spec.over()) return;
      const p = path(); if(!p.length) return;
      const [px, py] = spec.pos(); const dx = Math.sign(p[0][0] - px), dy = Math.sign(p[0][1] - py);
      spec.go(dx, dy);
      if(!spec.over()) c.after(Math.max(0, 240 / F()), stepOnce);
    };
    c.after(Math.max(200, 500 / F()), stepOnce);
  };

  /* ---------- つららよけ: いちばん安全なレーンへ ---------- */
  BOTS.batdodge = ({ spec, c })=>{
    const K = spec.k, prevY = new Map(); let last = now();
    c.frame(()=>{
      if(spec.over()) return;
      const t = now(), dt = Math.max(0.001, (t - last) / 1000); last = t;
      const bats = spec.bats(), lane = spec.lane();
      const v = (spec.speed ? spec.speed() : 200) * 1.0;
      const risk = [0, 0, 0];
      for(const b of bats){
        const pv = prevY.get(b); prevY.set(b, b.y);
        const vel = pv != null ? Math.max(60, (b.y - pv) / dt) : v;
        const tIn = (K.H - 70 - b.y) / vel, tOut = (K.H - 8 - b.y) / vel;       // 当たり判定のゾーンにいる時間帯
        if(tOut < -0.05) continue;
        if(tIn < 0.75) risk[b.lane] += (tIn < 0.12 ? 100 : 12) / (0.05 + Math.max(0, tIn));
      }
      const score = (l)=> -risk[l] - Math.abs(l - lane) * 0.4;
      let best = lane; for(let l = 0; l < 3; l++) if(score(l) > score(best)) best = l;
      if(best !== lane) spec.move(best > lane ? 1 : -1);
    });
  };

  /* ---------- アイス・ビート: 降ってくる雪の結晶を、ぴったりのタイミングで ---------- */
  BOTS.rhythm = ({ spec, c })=>{
    c.frame(()=>{
      if(spec.over()) return;
      const t = spec.now();
      for(const n of spec.notes()){ if(!n.done && Math.abs(n.t - t) <= 0.014){ spec.judge(n.lane); n.__s = true; } }
    });
  };

  /* ---------- ゆきの神経衰弱: めくって見えたものだけを覚える(人間と同じ) ---------- */
  BOTS.memory = ({ stage, c, F })=>{
    const cards = $$(stage, '.mcard'); const seen = new Map();   // index → 絵(めくったことがあるもの)
    const faceOf = (el)=> el.querySelector('.mc-front').textContent;
    const isOpen = (el)=> el.classList.contains('open'), isDone = (el)=> el.classList.contains('done');
    const wait = (ms)=> sleep(Math.max(0, ms / F()));
    async function flip(i){ cards[i].click(); await wait(130); seen.set(i, faceOf(cards[i])); return seen.get(i); }
    (async ()=>{
      await wait(500);
      while(!c.dead){
        if(cards.every(isDone)) return;
        // 閉じるのを待つ
        while(!c.dead && cards.some(el=> isOpen(el) && !isDone(el))) await sleep(40);
        const alive = cards.map((_, i)=> i).filter(i=> !isDone(cards[i]));
        // 見えている組があれば、そろえる
        let pair = null; const byFace = {}; alive.forEach(i=>{ if(seen.has(i)){ (byFace[seen.get(i)] = byFace[seen.get(i)] || []).push(i); } });
        for(const f in byFace) if(byFace[f].length >= 2){ pair = byFace[f]; break; }
        if(pair){ await flip(pair[0]); await flip(pair[1]); await wait(300); continue; }
        const unknown = alive.filter(i=> !seen.has(i));
        const a = unknown[Math.floor(Math.random() * unknown.length)];
        const fa = await flip(a);
        const known = alive.find(i=> i !== a && seen.get(i) === fa);
        if(known !== undefined){ await flip(known); await wait(300); continue; }
        const rest = unknown.filter(i=> i !== a);
        const b = rest[Math.floor(Math.random() * rest.length)];
        await flip(b);
        await wait(900);
      }
    })();
  };

  /* ---------- ゆきだるまたたき: 出てきたら、すぐたたく(🔥は避ける) ---------- */
  BOTS.whack = ({ stage, c, REACT })=>{
    const holes = $$(stage, '.hole'); const tapped = new Map();
    c.every(8, ()=>{
      holes.forEach((h, i)=>{
        const up = h.classList.contains('up'), t = h.dataset.t;
        if(!up){ tapped.delete(i); return; }
        if(t === 'bad' || tapped.has(i)) return;
        tapped.set(i, true);
        const react = REACT() * (0.8 + Math.random() * 0.4);
        const go = ()=>{ if(h.classList.contains('up') && h.dataset.t === t) down(h); };
        if(react <= 1) go(); else c.after(react, go);
      });
    });
  };

  /* ---------- マイン・ハンター: 見えている数字から推理(確実なところから) ---------- */
  BOTS.mines = ({ stage, c, F })=>{
    const R = 9, C = 9, M = 10; const btns = $$(stage, '.mc'); const flagBtn = stage.querySelector('.mg-btn.small');
    const nb = (i)=>{ const r = Math.floor(i / C), cc = i % C, o = []; for(let dr = -1; dr <= 1; dr++) for(let dc = -1; dc <= 1; dc++){ if(!dr && !dc) continue; const rr = r + dr, c2 = cc + dc; if(rr >= 0 && rr < R && c2 >= 0 && c2 < C) o.push(rr * C + c2); } return o; };
    const isOpen = (i)=> btns[i].classList.contains('open');
    const num = (i)=> { const t = btns[i].textContent.trim(); return t === '' ? 0 : (Number(t) || 0); };
    const wait = (ms)=> sleep(Math.max(0, ms / F()));
    const known = new Set();                                         // 地雷と分かったマス(頭の中だけ。旗は立てない)
    (async ()=>{
      await wait(400);
      tap(btns[Math.floor(R * C / 2)]);                           // 最初は真ん中(最初の1手は必ず安全)
      await wait(300);
      while(!c.dead){
        if(btns.some(b=> b.classList.contains('boom'))) return;
        const opened = btns.filter(b=> b.classList.contains('open')).length; if(opened >= R * C - M) return;
        let acted = false;
        // 1) 単純な規則
        for(let i = 0; i < R * C; i++){
          if(!isOpen(i)) continue; const n = num(i); if(n === 0) continue;
          const ns = nb(i), hid = ns.filter(j=> !isOpen(j)), mines = hid.filter(j=> known.has(j)).length, unk = hid.filter(j=> !known.has(j));
          if(!unk.length) continue;
          if(mines === n){ for(const j of unk){ tap(btns[j]); acted = true; await wait(60); } }
          else if(mines + unk.length === n){ unk.forEach(j=> known.add(j)); acted = true; }
        }
        if(acted){ await wait(120); continue; }
        // 2) 部分集合の規則(2つの数字の未確定マスの差)
        const cons = [];
        for(let i = 0; i < R * C; i++){ if(!isOpen(i)) continue; const n = num(i); if(!n) continue; const hid = nb(i).filter(j=> !isOpen(j)), mines = hid.filter(j=> known.has(j)).length, unk = hid.filter(j=> !known.has(j)); if(unk.length) cons.push({ unk, left: n - mines }); }
        for(const a of cons) for(const b of cons){ if(a === b || a.unk.length >= b.unk.length) continue; if(!a.unk.every(x=> b.unk.includes(x))) continue; const diff = b.unk.filter(x=> !a.unk.includes(x)), dl = b.left - a.left;
          if(dl === 0){ for(const j of diff){ tap(btns[j]); acted = true; await wait(60); } } else if(dl === diff.length){ diff.forEach(j=> known.add(j)); acted = true; } }
        if(acted){ await wait(120); continue; }
        // 3) 推理できないとき: 地雷の確率がいちばん低いマスを開ける
        const prob = new Map();
        for(const cn of cons){ const p = cn.left / cn.unk.length; cn.unk.forEach(j=> prob.set(j, Math.max(prob.get(j) || 0, p))); }
        const hidden = btns.map((_, i)=> i).filter(i=> !isOpen(i) && !known.has(i));
        if(!hidden.length) return;
        const remain = M - known.size, free = hidden.filter(i=> !prob.has(i));
        const pFree = free.length ? Math.max(0, remain - [...prob.values()].reduce((a, b)=> a + b, 0)) / free.length : 9;
        let pick = null, pp = 9;
        for(const [j, p] of prob) if(p < pp && !known.has(j)){ pp = p; pick = j; }
        if(free.length && pFree < pp){ pick = free[Math.floor(Math.random() * free.length)]; }
        if(pick == null) pick = hidden[0];
        tap(btns[pick]); await wait(150);
      }
    })();
    void flagBtn;
  };

  /* ---------- ゆきスライド: 最短手数で解く(IDA*) ---------- */
  BOTS.slide = ({ stage, c, F })=>{
    const GOAL = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const readBoard = ()=> $$(stage, '.m2-tile').map(t=> t.classList.contains('blank') ? 0 : Number(t.querySelector('.n').textContent));
    const man = (b)=>{ let d = 0; for(let i = 0; i < 9; i++){ const v = b[i]; if(!v) continue; const g = v - 1; d += Math.abs(Math.floor(i / 3) - Math.floor(g / 3)) + Math.abs(i % 3 - g % 3); } return d; };
    function solve(start){
      const nbrs = (z)=>{ const r = Math.floor(z / 3), c2 = z % 3, o = []; if(r > 0) o.push(z - 3); if(r < 2) o.push(z + 3); if(c2 > 0) o.push(z - 1); if(c2 < 2) o.push(z + 1); return o; };
      let bound = man(start); const path = [];
      function dfs(b, g, z, prev){
        const f = g + man(b); if(f > bound) return f; if(man(b) === 0) return -1;
        let min = Infinity;
        for(const n of nbrs(z)){ if(n === prev) continue; b[z] = b[n]; b[n] = 0; path.push(n); const t = dfs(b, g + 1, n, z); if(t === -1) return -1; if(t < min) min = t; path.pop(); b[n] = b[z]; b[z] = 0; }
        return min;
      }
      for(let i = 0; i < 60; i++){ const t = dfs(start.slice(), 0, start.indexOf(0), -1); if(t === -1) return path.slice(); if(t === Infinity) return null; bound = t; }
      return null;
    }
    const b0 = readBoard(); const sol = solve(b0); if(!sol) return;
    (async ()=>{
      await sleep(Math.max(100, 400 / F()));
      for(const idx of sol){ if(c.dead) return; const tiles = $$(stage, '.m2-tile'); down(tiles[idx]); await sleep(Math.max(0, 260 / F())); }
    })();
    void GOAL;
  };

  /* ---------- ともしびライツアウト: GF(2)の連立方程式で、最少手数で解く ---------- */
  BOTS.lights = ({ stage, c, F })=>{
    const cells = $$(stage, '.m2-light'); const on = cells.map(el=> el.classList.contains('on'));
    // 5x5 の連立方程式 A x = b (mod 2)
    const n = 25, A = [];
    for(let i = 0; i < n; i++){ const row = new Array(n + 1).fill(0); const r = Math.floor(i / 5), cc = i % 5;
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc])=>{ const rr = r + dr, c2 = cc + dc; if(rr >= 0 && rr < 5 && c2 >= 0 && c2 < 5) row[rr * 5 + c2] = 1; }); row[n] = on[i] ? 1 : 0; A.push(row); }
    const piv = []; let rank = 0;
    for(let col = 0; col < n && rank < n; col++){
      let p = -1; for(let r = rank; r < n; r++) if(A[r][col]){ p = r; break; } if(p < 0) continue;
      [A[rank], A[p]] = [A[p], A[rank]]; for(let r = 0; r < n; r++) if(r !== rank && A[r][col]) for(let k = 0; k <= n; k++) A[r][k] ^= A[rank][k];
      piv.push(col); rank++;
    }
    const free = []; for(let col = 0; col < n; col++) if(!piv.includes(col)) free.push(col);
    let best = null;
    for(let mask = 0; mask < (1 << free.length); mask++){
      const x = new Array(n).fill(0); free.forEach((f, k)=>{ x[f] = (mask >> k) & 1; });
      for(let r = rank - 1; r >= 0; r--){ let v = A[r][n]; for(const f of free) if(A[r][f]) v ^= x[f]; x[piv[r]] = v; }
      const cnt = x.reduce((a, b)=> a + b, 0); if(!best || cnt < best.cnt) best = { x, cnt };
    }
    if(!best) return;
    (async ()=>{
      await sleep(Math.max(100, 400 / F()));
      for(let i = 0; i < n; i++){ if(best.x[i]){ if(c.dead) return; down(cells[i]); await sleep(Math.max(0, 230 / F())); } }
    })();
  };

  /* ---------- アイス反射神経: 「いま！」で即タップ ---------- */
  BOTS.reflex = ({ stage, c, F, REACT })=>{
    const pad = stage.querySelector('.m2-reflex'); const txt = pad.querySelector('.rf-txt');
    let armedAt = 0, reacted = false;
    const check = ()=>{
      const t = txt.textContent;
      if(pad.classList.contains('go')){
        if(!reacted){ reacted = true; const r = REACT() * (0.85 + Math.random() * 0.3); if(r <= 1) down(pad); else c.after(r, ()=> down(pad)); }
        return;
      }
      reacted = false;
      if(/平均/.test(t)) return;
      if(/タップ/.test(t) && now() - armedAt > 300 / F()){ armedAt = now(); c.after(Math.max(30, 350 / F()), ()=>{ if(/タップ/.test(txt.textContent)) down(pad); }); }
    };
    c.watch(pad, check); c.every(60, check);
  };

  /* ---------- ナンバータッチ: 1から16まで順番に ---------- */
  BOTS.numtouch = ({ stage, c, F })=>{
    const btns = $$(stage, '.m2-n'); let next = 1;
    const go = ()=>{ if(next > 16) return; const b = btns.find(x=> Number(x.textContent) === next); if(b){ down(b); next++; } c.after(Math.max(10, 300 / F()), go); };
    c.after(Math.max(200, 600 / F()), go);
  };

  /* ---------- いろいろモンスター: 文字の「色」と同じ色のボタン ---------- */
  BOTS.stroop = ({ stage, c, F, REACT })=>{
    const word = stage.querySelector('.m2-word'), btns = $$(stage, '.m2-ink'); let busy = 0, lastKey = '';
    const rgb = (el, p)=> getComputedStyle(el)[p];
    c.every(8, ()=>{
      if(now() < busy) return;
      const k = word.textContent + '|' + rgb(word, 'color'); if(!word.textContent) return;
      const col = rgb(word, 'color'); const b = btns.find(x=> rgb(x, 'backgroundColor') === col); if(!b) return;
      lastKey = k; busy = Infinity;                          // タップするまで、次の読み取りはしない(同じ問題を2回読まないため)
      const go = ()=>{ down(b); busy = now() + 150; };       // 次の問題は、タップの120ms後に出る
      const r = REACT() * (0.85 + Math.random() * 0.3); if(r <= 1) go(); else c.after(r, go);
    });
    void lastKey; void F;
  };

  /* ---------- ろうそくシモン: 光った順番を、見ていて覚える ---------- */
  BOTS.simon = ({ stage, c, F })=>{
    const pads = $$(stage, '.m2-pad'), msg = stage.querySelector('.m2-simon-msg'); let rec = [], phase = 'watch', tapping = false, rounds = 0;
    const lit = new Set();
    c.watch(stage.querySelector('.m2-simon'), ()=>{
      if(phase !== 'watch') return;
      pads.forEach((p, i)=>{ const on = p.classList.contains('lit'); if(on && !lit.has(i)){ lit.add(i); rec.push(i); } if(!on) lit.delete(i); });
    }, { subtree: true, attributes: true, attributeFilter: ['class'] });
    c.every(40, ()=>{
      const t = msg.textContent;
      if(/よく見て/.test(t)){ if(phase !== 'watch'){ phase = 'watch'; rec = []; lit.clear(); tapping = false; } }
      else if(/あなたの番/.test(t) && !tapping){
        phase = 'input'; tapping = true; rounds++;
        (async ()=>{
          await sleep(Math.max(60, 300 / F()));
          const seq = rec.slice();
          for(let k = 0; k < seq.length; k++){
            if(c.dead) return;
            const i = seq[k];
            down(pads[i]); await sleep(Math.max(30, 220 / F()));
          }
        })();
      }
    });
  };

  /* ---------- ゆきゆき計算 ---------- */
  BOTS.math = ({ stage, c, F, REACT })=>{
    const q = stage.querySelector('.m2-q'), opts = stage.querySelector('.m2-opts'); let busy = 0;
    c.every(8, ()=>{
      if(now() < busy) return; const m = /^(\d+)\s*([+−×])\s*(\d+)/.exec(q.textContent.trim()); if(!m) return;
      const a = +m[1], b = +m[3], ans = m[2] === '+' ? a + b : m[2] === '−' ? a - b : a * b;
      const btn = $$(opts, '.m2-opt').find(x=> Number(x.textContent) === ans); if(!btn) return;
      busy = Infinity;
      const go = ()=>{ down(btn); busy = now() + 230; };     // 次の問題は、タップの180ms後に出る
      const r = REACT() * 2 * (0.85 + Math.random() * 0.3); if(r <= 1) go(); else c.after(r, go);
    });
    void F;
  };

  /* ---------- ゆきだるま10秒れんだ ---------- */
  BOTS.tapspeed = ({ stage, c, F })=>{
    const btn = stage.querySelector('.m3-bigtap'); const rate = { 0.4: 7, 1: 11, 3: 22, 14: 80 }[F()] || 11;
    const gap = 1000 / rate; c.after(400, ()=>{ c.every(gap, ()=> down(btn)); });
  };

  /* ---------- ぴったりストップ: マークの動きから、真ん中を通る瞬間を予測 ---------- */
  BOTS.timing = ({ stage, c })=>{
    const mark = stage.querySelector('.m3-mark'), btn = stage.querySelector('.m3-stop'); let prev = null, cool = 0, sched = 0;
    // マークの位置は、ゲーム側の requestAnimationFrame が書き換える。コールバックの順番に左右されないよう、
    // そのフレームの処理がすべて終わった直後(setTimeout 0)に位置を読む
    function measure(ts){
      const t = now(); if(t < cool){ prev = null; return; }
      const p = parseFloat(mark.style.left) / 100; if(isNaN(p)) return;
      if(prev && ts > prev.ts){
        const v = (p - prev.p) / (ts - prev.ts);            // 1ミリ秒あたりの位置の変化
        const toward = (p < 0.5 && v > 0) || (p > 0.5 && v < 0);
        if(toward && Math.abs(v) > 1e-6 && !sched){
          const dtMs = (0.5 - p) / v;                        // 位置 p は、フレームの時刻 ts のもの。真ん中を通る時刻は ts + dtMs
          const at = ts + dtMs, wait = at - now();
          if(wait < 70 && wait > -3){
            sched = 1;
            c.after(Math.max(0, wait - 3), ()=>{ while(now() < at - 0.2){} down(btn); cool = now() + 950; sched = 0; prev = null; });
          }
        }
      }
      prev = { ts, p };
    }
    c.frame((ts)=>{ c.after(0, ()=> measure(ts)); });
  };

  /* ---------- ぴったり5秒: 押して、ちょうど5.000秒で離す ---------- */
  BOTS.holdexact = ({ stage, c, F })=>{
    const btn = stage.querySelector('.m3-bigtap');
    let tries = 0;
    function one(){
      if(tries >= 3 || c.dead) return; tries++;
      down(btn); const t0 = now(), target = t0 + 5000;
      c.after(4980, ()=>{ while(now() < target - 0.3){} up(btn); c.after(Math.max(1300, 1500 / F()), one); });
    }
    c.after(Math.max(300, 600 / F()), one);
  };

  /* ---------- ちがうのはどれ？ ---------- */
  BOTS.oddone = ({ stage, c, REACT })=>{
    const grid = stage.querySelector('.m3-grid'); let busy = 0;
    c.every(8, ()=>{
      if(now() < busy) return; const cells = $$(grid, '.m3-cell'); if(cells.length < 9) return;
      const cnt = {}; cells.forEach(x=>{ cnt[x.textContent] = (cnt[x.textContent] || 0) + 1; });
      const odd = cells.find(x=> cnt[x.textContent] === 1); if(!odd) return;
      busy = Infinity;
      const go = ()=>{ down(odd); busy = now() + 190; };     // 次の問題は、タップの140ms後に出る
      const r = REACT() * 2 * (0.85 + Math.random() * 0.3); if(r <= 1) go(); else c.after(r, go);
    });
  };

  /* ---------- あったか仕分け ---------- */
  BOTS.sortg = ({ stage, c, REACT })=>{
    const card = stage.querySelector('.m3-card'), treat = stage.querySelector('.m3-side.treat'), trick = stage.querySelector('.m3-side.trick'); let busy = 0;
    const WARM = ['☕', '🍲', '🔥', '🧣', '🧤', '🍜', '🫖'];
    c.every(8, ()=>{
      if(now() < busy) return; const e = card.textContent.trim(); if(!e) return;
      const btn = WARM.includes(e) ? treat : trick; busy = Infinity;
      const go = ()=>{ down(btn); busy = now() + 130; };     // 次のカードは、タップの90ms後に出る
      const r = REACT() * 0.8 * (0.85 + Math.random() * 0.3); if(r <= 1) go(); else c.after(r, go);
    });
  };

  /* ---------- ハイ＆ロー: 勝てる確率が高いほうを選ぶ(次の数字は乱数なので、完全にはできません) ---------- */
  BOTS.highlow = ({ stage, c, F })=>{
    const card = stage.querySelector('.m3-card'), msg = stage.querySelector('.m3-msg'), btns = $$(stage, '.m3-two .m3-side'); let busy = 0;
    c.every(40, ()=>{
      if(now() < busy || msg.textContent.trim()) return; const cur = Number(card.textContent); if(!cur) return;
      const high = cur <= 6 ? true : cur >= 8 ? false : true;                 // 7 は同じ確率
      busy = now() + Math.max(500, 800 / F()); c.after(Math.max(40, 300 / F()), ()=> down(high ? btns[1] : btns[0]));
    });
  };

  /* ---------- ゆきだるまじゃんけん: 相手の手は乱数なので、ランダムに出します(完全には勝てません) ---------- */
  BOTS.rps = ({ stage, c, F })=>{
    const hands = $$(stage, '.m3-hand'), cpu = stage.querySelector('.m3-card'); let busy = 0;
    c.every(40, ()=>{
      if(now() < busy || cpu.textContent.trim() !== '⛄') return;
      busy = now() + Math.max(600, 900 / F()); c.after(Math.max(30, 250 / F()), ()=> down(hands[Math.floor(Math.random() * 3)]));
    });
  };

  /* ---------- ゆきの結晶数え: 一瞬見えたときに数える ---------- */
  BOTS.pumpcount = ({ stage, c, REACT })=>{
    const field = stage.querySelector('.m3-field'), opts = stage.querySelector('.m2-opts'); let count = 0, busy = 0;
    c.every(10, ()=>{
      const n = field.querySelectorAll('.m3-pump').length; if(n > 0) count = n;
      const bs = $$(opts, 'button'); if(!bs.length || !count || now() < busy) return;
      const b = bs.find(x=> Number(x.textContent) === count && !x.disabled); if(!b) return;
      busy = now() + 700; const k = count; count = 0;
      c.after(Math.max(0, REACT() * 2), ()=>{ const t = $$(opts, 'button').find(x=> Number(x.textContent) === k); if(t) down(t); });
    });
  };

  /* ---------- ともしびメモリー: 光った場所を覚えてタップ ---------- */
  BOTS.glowmem = ({ stage, c, F })=>{
    const grid = stage.querySelector('.m3-grid'), msg = stage.querySelector('.m3-msg'); let targets = new Set(), phase = 'show', level = 0;
    c.every(30, ()=>{
      const t = msg.textContent;
      const cells = $$(grid, '.m3-cell');
      if(/覚えて/.test(t)){ if(phase !== 'show'){ phase = 'show'; targets = new Set(); } cells.forEach((el, i)=>{ if(el.classList.contains('m4-lit')) targets.add(i); }); }
      else if(/タップ！/.test(t) && phase === 'show'){
        phase = 'input'; level++;
        const list = [...targets]; (async ()=>{
          await sleep(Math.max(40, 250 / F()));
          const cs = $$(grid, '.m3-cell');
          for(let k = 0; k < list.length; k++){
            if(c.dead) return; const idx = list[k];
            down(cs[idx]); await sleep(Math.max(25, 200 / F()));
          }
        })();
      }
    });
  };

  /* ---------- バルーンふくらまし: 「いつ割れるか」は分からないので、期待値がいちばん高くなるところで「ためる」 ---------- */
  BOTS.puffpump = ({ stage, c, F })=>{
    const msg = stage.querySelector('.m3-msg'), [puff, bank] = $$(stage, '.m3-two button'); let busy = 0, taps = 0, lastRound = '';
    // 割れる回数は 7〜24 回目のどれかが同じ確率(ゲームのヒントどおり)。ここから、続けたときの期待値を後ろから計算する
    const LO = 7, HI = 24, pts = (t)=> t * (t + 1) / 2;
    const V = []; V[HI] = pts(HI);
    for(let t = HI - 1; t >= 0; t--){ const h = (t + 1) >= LO ? 1 / (HI - t) : 0; V[t] = Math.max(pts(t), (1 - h) * V[t + 1]); }
    const hazard = (t)=> (t + 1) >= LO ? 1 / (HI - t) : 0;
    c.every(40, ()=>{
      if(now() < busy) return; const t = msg.textContent;
      if(/ふくらませて、いいところで/.test(t)){ taps = 0; }
      if(/破裂|ゲット|まず/.test(t) && !/ふくらませて、いいところで/.test(t)){ return; }
      const m = /この回: (\d+) 点\(次は \+(\d+)\)/.exec(t); if(m) taps = Number(m[2]) - 1;
      const cur = pts(taps), go = (1 - hazard(taps)) * V[taps + 1] > cur + 1e-9 || taps === 0;
      busy = now() + Math.max(120, 420 / F());
      c.after(Math.max(20, 100 / F()), ()=>{ if(go){ down(puff); taps = taps + 0; } else down(bank); });
    });
    void lastRound;
  };

  /* ---------- もじならべ: 文字を見て、ふゆのことばに並べる ---------- */
  BOTS.wordscr = ({ stage, spec, c, F })=>{
    const WORDS = (spec && spec.words) || [];
    const tilesEl = stage.querySelector('.m4-tiles'), skip = stage.querySelector('.mg-btn.ghost'); let busy = 0, sig = '';
    const sortKey = (a)=> [...a].sort().join('');
    c.every(30, ()=>{
      if(now() < busy) return; const tiles = $$(tilesEl, '.m4-tile'); if(!tiles.length) return;
      const letters = tiles.map(t=> t.textContent); const k = letters.join('');
      if(k === sig) return; sig = k;
      const w = WORDS.find(x=> x.length === letters.length && sortKey(x) === sortKey(letters));
      if(!w){ busy = now() + 300; c.after(100, ()=> down(skip)); return; }
      busy = now() + Math.max(250, 450 / F());
      (async ()=>{
        const used = new Set();
        for(const ch of [...w]){ if(c.dead) return; const i = tiles.findIndex((t, j)=> !used.has(j) && t.textContent === ch); used.add(i); down(tiles[i]); await sleep(Math.max(8, 110 / F())); }
      })();
    });
  };
})();
