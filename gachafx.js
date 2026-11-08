/* =====================================================================
   🎁 ガチャ演出 (v3.3)
   宝箱が降りてくる → ガタガタ揺れる → フタが開いて光があふれる → 上にルーレットが出て回り、減速して止まる → 結果発表

   使い方(script.js から):
     const fx = GachaFx.begin({ kind:'normal' | 'halloween', count:1|10, pool:[{name, sw:[色...]}] });   // 購入した瞬間に呼ぶ(宝箱が降りてくる)
     const action = await fx.reveal([{ type:'win'|'duplicate'|'miss', name, sw, pity, extra }]);       // サーバーの結果が来たら呼ぶ
        → 'again'(もう一度) or 'close'(閉じる) が返る
     通信に失敗したら fx.abort()
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const $ = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
  const rnd = (n)=> Math.floor(Math.random()*n);
  const snd = (name, a)=>{ try{ CB().sound && CB().sound(name, a); }catch(e){} };
  const vib = (p)=>{ try{ CB().vibrate && CB().vibrate(p); }catch(e){} };
  const reduce = ()=>{ try{ return !!(CB().motionOff && CB().motionOff()); }catch(e){ return false; } };

  const RARITY = {
    win:       { cls:'win',  label:'✨ 大当たり！', tag:'NEW' },
    duplicate: { cls:'dup',  label:'🔁 被り',       tag:'被り' },
    miss:      { cls:'miss', label:'ハズレ…',        tag:'ハズレ' }
  };
  const swHtml = (sw, n)=> (sw || []).slice(0, n || 5).map(c=>`<i style="background:${c}"></i>`).join('');

  function tileHtml(t){
    if(t.miss) return `<div class="gfx-tile miss"><div class="gt-emo">💨</div><div class="gt-nm">ハズレ</div></div>`;
    return `<div class="gfx-tile ${t.rar || ''}"><div class="gt-sw">${swHtml(t.sw, 4)}</div><div class="gt-nm">${t.name}</div></div>`;
  }

  function begin(opts){
    opts = opts || {};
    const kind = opts.kind === 'halloween' ? 'halloween' : 'normal';
    const pool = (opts.pool && opts.pool.length) ? opts.pool : [{ name:'スキン', sw:['#ffd36b','#ff8a1f','#b14dff'] }];
    const count = opts.count === 10 ? 10 : 1;
    const timers = [];
    let finished = false, skipped = false, revealStarted = false, resolveAction = null, rafId = 0;
    const later = (fn, ms)=>{ const id = setTimeout(fn, ms); timers.push(id); return id; };

    // ---------- DOM ----------
    const root = $('div', `gfx kind-${kind}`);
    root.innerHTML = `
      <div class="gfx-bg"></div><div class="gfx-rays"></div><div class="gfx-flash"></div>
      <button class="gfx-skip" type="button">スキップ ▶▶</button>
      <div class="gfx-stage">
        <div class="gfx-reelwrap">
          <div class="gfx-pointer top">▼</div>
          <div class="gfx-reel"><div class="gfx-strip"></div><div class="gfx-reelglow"></div></div>
          <div class="gfx-pointer bot">▲</div>
        </div>
        <div class="gfx-chest">
          <div class="ch-beam"></div>
          <div class="ch-body"><div class="ch-inside"></div><div class="ch-front"><span class="ch-lock"></span></div></div>
          <div class="ch-lid"><span class="ch-clasp"></span></div>
          <div class="ch-shadow"></div>
        </div>
        <div class="gfx-caption">宝箱が降ってきた…</div>
      </div>
      <div class="gfx-result"></div>`;
    document.body.appendChild(root);
    const q = (s)=> root.querySelector(s);
    const chest = q('.gfx-chest'), caption = q('.gfx-caption'), reelWrap = q('.gfx-reelwrap'), reel = q('.gfx-reel'), strip = q('.gfx-strip'),
          resultEl = q('.gfx-result'), flash = q('.gfx-flash'), skipBtn = q('.gfx-skip');
    const motionless = reduce();
    root.classList.add('show');
    if(!motionless){ chest.classList.add('drop'); snd('place'); }
    const dropDone = motionless ? Promise.resolve() : sleep(950);
    if(!motionless) later(()=>{ if(!revealStarted) { chest.classList.add('idle'); caption.textContent = 'ガチャを回しています…'; } }, 950);

    function setCaption(t){ caption.textContent = t; caption.classList.remove('pop'); void caption.offsetWidth; caption.classList.add('pop'); }
    function confetti(n, colors){
      for(let i=0;i<n;i++){
        const p = $('i','gfx-conf'); const a = Math.random()*Math.PI*2, d = 120 + Math.random()*220;
        p.style.setProperty('--dx', Math.cos(a)*d + 'px'); p.style.setProperty('--dy', (Math.sin(a)*d - 120) + 'px');
        p.style.setProperty('--rot', (Math.random()*720 - 360) + 'deg'); p.style.background = colors[rnd(colors.length)];
        p.style.animationDelay = (Math.random()*.15) + 's'; root.appendChild(p); later(()=>p.remove(), 1700);
      }
    }
    function doFlash(){ flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }

    // ---------- 閉じる ----------
    function close(action){
      if(finished) return; finished = true;
      timers.forEach(clearTimeout); cancelAnimationFrame(rafId);
      root.classList.add('closing');
      setTimeout(()=> root.remove(), 260);
      if(resolveAction){ resolveAction(action || 'close'); resolveAction = null; }
    }

    // ---------- 結果パネル ----------
    function showResults(results){
      if(finished) return;
      cancelAnimationFrame(rafId);
      root.classList.add('showing-result');
      const wins = results.filter(r=>r.type === 'win').length, dups = results.filter(r=>r.type === 'duplicate').length, miss = results.filter(r=>r.type === 'miss').length;
      let body;
      if(results.length === 1){
        const r = results[0], R = RARITY[r.type] || RARITY.miss;
        body = `<div class="gfx-big ${R.cls}">
          ${r.type === 'miss' ? '<div class="gb-emo">💨</div>' : `<div class="gb-sw">${swHtml(r.sw, 7)}</div>`}
          <div class="gb-name">${r.type === 'miss' ? 'ハズレ' : r.name}</div>
          <div class="gb-tag">${R.label}${r.pity ? ' ／ 🎯天井' : ''}</div>
          ${r.extra ? `<div class="gb-extra">${r.extra}</div>` : ''}
        </div>`;
      } else {
        body = `<div class="gfx-sum">${wins ? `<b class="w">大当たり ${wins}</b>` : ''}<span>被り ${dups}</span><span>ハズレ ${miss}</span></div>
          <div class="gfx-grid">${results.map((r,i)=>{ const R = RARITY[r.type] || RARITY.miss;
            return `<div class="gfx-card ${R.cls}" style="animation-delay:${i*0.11}s">
              ${r.type === 'miss' ? '<div class="gc-emo">💨</div>' : `<div class="gc-sw">${swHtml(r.sw, 3)}</div>`}
              <div class="gc-nm">${r.type === 'miss' ? 'ハズレ' : r.name}</div>
              ${r.type === 'win' ? `<span class="gc-new">${r.pity ? '天井' : 'NEW'}</span>` : ''}
            </div>`; }).join('')}</div>
          ${results.some(r=>r.extra) ? `<div class="gfx-extras">${results.filter(r=>r.extra).length ? '被り・ハズレの戻り分は、すでに受け取り済みです' : ''}</div>` : ''}`;
      }
      resultEl.innerHTML = `<div class="gfx-panel">
        <div class="gfx-title">${wins ? '🎉 おめでとう！' : (count === 10 ? '10連 結果' : '結果')}</div>
        ${body}
        <div class="gfx-btns"><button class="gfx-btn" data-a="again" type="button">もう一度 ${count === 10 ? '10連' : '1回'}</button><button class="gfx-btn ghost" data-a="close" type="button">閉じる</button></div>
      </div>`;
      resultEl.classList.add('show');
      resultEl.querySelectorAll('[data-a]').forEach(b=> b.addEventListener('click', ()=> close(b.dataset.a)));
      skipBtn.style.display = 'none';
      if(wins){ doFlash(); confetti(46, kind === 'halloween' ? ['#ff8a1f','#ffd36b','#b14dff','#fff'] : ['#ffd36b','#6fa8ff','#ff7ab6','#fff']); snd('coin'); vib([20,30,60]); }
      else if(dups){ snd('coin'); }
    }

    // ---------- ルーレット ----------
    function buildReel(best){
      const N = 40, T = 32, tiles = [];
      for(let i=0;i<N;i++){
        if(i === T){ tiles.push(best.type === 'miss' ? { miss:true } : { name:best.name, sw:best.sw, rar:'target' }); continue; }
        if(Math.random() < .34) tiles.push({ miss:true });
        else { const p = pool[rnd(pool.length)]; tiles.push({ name:p.name, sw:p.sw }); }
      }
      strip.innerHTML = tiles.map(tileHtml).join('');
      return { T, pitch:100 };
    }
    async function spin(best){
      const { T, pitch } = buildReel(best);
      reelWrap.classList.add('up');                       // 宝箱の中から せり上がる
      await sleep(560);
      if(skipped) return;
      const vw = reel.clientWidth || 340;
      const jitter = (Math.random() - .5) * pitch * .5;
      const target = -(T*pitch + pitch/2 - vw/2 + jitter);
      strip.style.transition = 'none'; strip.style.transform = 'translateX(0px)'; void strip.offsetWidth;
      const dur = 4200;
      strip.style.transition = `transform ${dur}ms cubic-bezier(.08,.8,.12,1)`;
      strip.style.transform = `translateX(${target}px)`;
      setCaption('ルーレット スタート！');
      // 通過するたびに「カチッ」と鳴らす
      let lastIdx = -1, lastT = 0;
      const tick = ()=>{
        if(finished || skipped) return;
        try{
          const m = new DOMMatrix(getComputedStyle(strip).transform), idx = Math.floor((-m.m41 + vw/2)/pitch);
          const now = performance.now();
          if(idx !== lastIdx && now - lastT > 45){ lastIdx = idx; lastT = now; snd('place'); }
        }catch(e){}
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      await sleep(dur + 120);
      cancelAnimationFrame(rafId);
    }

    // ---------- 本編: 結果が来たら再生 ----------
    async function reveal(results){
      revealStarted = true;
      const done = new Promise(res=>{ resolveAction = res; });
      const best = results.find(r=>r.type === 'win') || results.find(r=>r.type === 'duplicate') || results[0];
      root.classList.add('r-' + (RARITY[best.type] || RARITY.miss).cls);
      if(motionless){ showResults(results); return done; }
      skipBtn.classList.add('show');
      skipBtn.addEventListener('click', ()=>{ skipped = true; timers.forEach(clearTimeout); showResults(results); });
      (async ()=>{
        await dropDone; if(skipped || finished) return;
        chest.classList.remove('idle'); chest.classList.add('shake'); setCaption('宝箱が…揺れている！'); snd('place'); vib([20,40,20,40]);
        await sleep(950); if(skipped || finished) return;
        chest.classList.remove('shake'); chest.classList.add('open'); root.classList.add('opened');
        setCaption('パカッ！'); snd('clear', 4); vib(60); doFlash();
        await sleep(650); if(skipped || finished) return;
        await spin(best); if(skipped || finished) return;
        // 止まった！ → 当たりのタイルを光らせる
        reel.classList.add('landed'); setCaption(best.type === 'win' ? '🎉 大当たり！！' : best.type === 'duplicate' ? '被りでした…' : 'ハズレ…');
        if(best.type === 'win'){ doFlash(); snd('coin'); vib([30,30,80]); confetti(30, ['#ffd36b','#fff']); }
        await sleep(best.type === 'win' ? 1300 : 800); if(skipped || finished) return;
        showResults(results);
      })();
      return done;
    }

    return {
      reveal,
      abort(){ close('close'); }
    };
  }

  window.GachaFx = { begin };
})();
