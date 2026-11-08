/* =====================================================================
   🎁 ギフト開封 (v3.4)
   プレゼントボックスと開封ボタン → 箱が開く(アニメ) → 手紙が出てくる → 「次へ」で手紙が小さくなって隅に移動
   → アイテムをもらう → 「閉じる」で元の画面に戻る

   いつ出るか:
     ・ログインしたとき(ロビーにいるとき) / ロビーに戻ったとき
     ・プレイ中は出さず、ゲームオーバーになってから出す
     ・メニューの「ギフト」から、いつでも開ける
   サーバー: GET /api/gifts/pending  /  POST /api/gifts/claim {id}
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const $ = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
  const snd = (n, a)=>{ try{ CB().sound && CB().sound(n, a); }catch(e){} };
  const vib = (p)=>{ try{ CB().vibrate && CB().vibrate(p); }catch(e){} };
  const motionless = ()=>{ try{ return !!(CB().motionOff && CB().motionOff()); }catch(e){ return false; } };
  const fmt = (n)=> (window.NXBig && window.NXBig.compact(n)) || Number(n).toLocaleString('ja-JP');       // 15桁を超える数は、正確な桁から短く表記
  const esc = (s)=> String(s == null ? '' : s).replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  let pending = [];
  let showing = false;
  let checking = false;
  let dismissed = false;        // ✕で閉じたあと、自動ではもう出さない(ログイン時・手動で開いたときは、また出す)
  const fromLabel = (g)=> (g.from === 'vortx' || g.from === 'spirit') ? '運営' : (g.fromName || g.from);

  function lobbyVisible(){
    const t = document.getElementById('titleScreen');
    return !!t && !t.classList.contains('hidden') && !t.classList.contains('leaving');
  }
  async function fetchPending(){
    if(!(CB().isLoggedIn && CB().isLoggedIn()) || !CB().api){ pending = []; return pending; }
    try{ const d = await CB().api('/api/gifts/pending'); pending = (d && d.gifts) || []; }catch(e){ /* 通信失敗は無視 */ }
    return pending;
  }

  /* ---------- 届いているか確認して、出してよいタイミングなら出す ---------- */
  async function check(reason){
    if(showing || checking) return;
    if(reason === 'login' || reason === 'manual') dismissed = false;
    if(dismissed) return;            // ✕で閉じたあとは、勝手に出さない
    checking = true;
    try{
      await fetchPending();
      if(!pending.length){
        if(reason === 'manual' && CB().toast) CB().toast('🎁 いま届いているギフトはありません');
        return;
      }
      // プレイ中は出さない。ログイン/ロビー/定期チェックは「ロビーにいるとき」だけ。ゲームオーバー後と手動は、いつでも
      if((reason === 'login' || reason === 'lobby' || reason === 'poll') && !lobbyVisible()) return;
      present();
    } finally { checking = false; }
  }

  /* ---------- 演出 ---------- */
  function present(){
    if(showing || !pending.length) return;
    showing = true;
    const gift = pending[0];
    const fast = motionless();
    const wait = (ms)=> sleep(fast ? 0 : ms);
    const timers = [];

    const root = $('div', 'gx');
    root.innerHTML = `
      <div class="gx-bg"></div><div class="gx-rays"></div><div class="gx-flash"></div>
      <button class="gx-mini" id="gxMini" type="button" aria-label="手紙をもう一度読む">💌</button>
      <div class="gx-stage">
        <div class="gx-head" id="gxHead">🎁 ギフトが届いています！<small>${esc(fromLabel(gift))} より</small></div>
        <div class="gx-box" id="gxBox"><div class="gb-glow"></div><div class="gb-body"></div><div class="gb-lid"><i class="gb-bow"></i></div></div>
        <div class="gx-letter" id="gxLetter">
          <div class="gl-paper">
            <div class="gl-seal">💌</div>
            <div class="gl-title">メッセージが届いています</div>
            <div class="gl-msg">${esc(gift.message).replace(/\n/g, '<br>')}</div>
            <div class="gl-from">— ${esc(fromLabel(gift))} より</div>
          </div>
        </div>
        <div class="gx-items" id="gxItems"></div>
        <div class="gx-btns"><button class="gx-btn" id="gxAction" type="button">🎁 開封する</button>
          ${pending.length > 1 ? `<button class="gx-btn gx-all" id="gxAll" type="button">📦 まとめて受け取る(${pending.length}件)</button>` : ''}</div>
      </div>
      <button class="gx-x" id="gxX" type="button" aria-label="とじる(あとで受け取れます)">✕</button>`;
    document.body.appendChild(root);
    const q = (s)=> root.querySelector(s);
    const allBtn = q('#gxAll'), xBtn = q('#gxX');
    const box = q('#gxBox'), letter = q('#gxLetter'), itemsEl = q('#gxItems'), action = q('#gxAction'), mini = q('#gxMini'), flash = q('.gx-flash'), head = q('#gxHead');
    root.classList.add('show');
    if(!fast){ box.classList.add('drop'); snd('place'); }
    let state = 'box';           // box → opening → letter → claiming → items

    function doFlash(){ flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
    function sparks(n){
      for(let i=0;i<n;i++){
        const p = $('i', 'gx-spark'); const a = Math.random()*Math.PI*2, d = 90 + Math.random()*200;
        p.style.setProperty('--dx', Math.cos(a)*d + 'px'); p.style.setProperty('--dy', (Math.sin(a)*d - 90) + 'px');
        p.style.background = ['#ffd36b','#ff7ab6','#fff','#7fe6b0','#6fa8ff'][i % 5]; p.style.animationDelay = (Math.random()*.2) + 's';
        root.appendChild(p); timers.push(setTimeout(()=>p.remove(), 1600));
      }
    }
    function close(){
      timers.forEach(clearTimeout);
      root.classList.add('closing');
      setTimeout(()=>root.remove(), fast ? 0 : 260);
      showing = false;
      pending.shift();
      if(pending.length){ setTimeout(()=>present(), fast ? 0 : 420); }          // まだ届いていれば、次の箱へ
    }
    // ✕: 受け取らずに閉じる。ギフトはそのまま残る(メニューの🎁から、いつでも受け取れる)
    function dismiss(){
      if(state === 'claiming') return;                         // 受け取り中は閉じない
      if(state === 'items'){ close(); return; }                // もう受け取り済みなら、ふつうに閉じる
      timers.forEach(clearTimeout);
      root.classList.add('closing');
      setTimeout(()=>root.remove(), fast ? 0 : 260);
      showing = false; dismissed = true;
      try{ CB().toast && CB().toast('🎁 ギフトは、あとで受け取れます(メニューの「ギフト」から)'); }catch(e){}
    }

    /* 1) 開封: 箱が揺れて、フタが飛び、光があふれて、手紙が出てくる */
    async function openBox(){
      state = 'opening'; action.disabled = true;
      if(!fast){ box.classList.remove('drop'); box.classList.add('shake'); snd('place'); vib([20,40,20,40,30]); }
      await wait(800);
      box.classList.remove('shake'); box.classList.add('open'); root.classList.add('opened');
      doFlash(); sparks(34); snd('clear', 4); vib(60);
      head.innerHTML = '💌 手紙が入っていました';
      await wait(700);
      box.classList.add('gone');
      letter.classList.add('show');
      await wait(850);
      state = 'letter'; action.disabled = false; action.textContent = '次へ ▶';
    }

    /* アイテムのカード(数字がカウントアップ) */
    async function renderItems(it){
      const rows = [
        ['🪙', 'コイン', it.coins], ['🍬', 'イベント通貨', it.candies], ['🎫', 'XP', it.bpXp], ['🏁', 'イベントXP', it.eventXp]
      ].filter(r=>r[2] > 0);
      itemsEl.classList.add('show');
      for(let i=0;i<rows.length;i++){
        const [ic, nm, val] = rows[i];
        const card = $('div', 'gi-card', `<div class="gi-ic">${ic}</div><div class="gi-nm">${nm}</div><div class="gi-val">+0</div>`);
        itemsEl.appendChild(card);
        snd('coin'); vib(15);
        const valEl = card.querySelector('.gi-val');
        if(fast){ valEl.textContent = '+' + fmt(val); }
        else {
          const t0 = performance.now(), dur = 700;
          await new Promise(res=>{ const step = (t)=>{ const k = Math.min(1, (t - t0)/dur), e = 1 - Math.pow(1 - k, 3); valEl.textContent = '+' + fmt(Math.round(val*e)); if(k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
        }
        await wait(160);
      }
      doFlash(); sparks(18);
    }

    /* 2) 次へ: ギフトを受け取り → 手紙が小さくなって左上へ → アイテムが出る */
    async function next(){
      state = 'claiming'; action.disabled = true; action.textContent = '受け取り中...';
      let data = null;
      try{
        data = await CB().api('/api/gifts/claim', 'POST', { id: gift.id });
      }catch(err){
        if(/受け取り済み|存在しません/.test(err.message || '')){ close(); return; }   // すでに受け取り済み(別の端末など)
        action.disabled = false; action.textContent = '次へ ▶ (もう一度)';
        head.innerHTML = `⚠️ ${esc(err.message || '受け取りに失敗しました')}`; state = 'letter'; return;
      }
      if(data && data.coins != null && CB().setCoins) CB().setCoins(data.coins);
      // 手紙を小さくして、左上のアイコンの位置までずらす(FLIP)
      head.innerHTML = '🎉 アイテムを受け取りました！';
      const r1 = letter.getBoundingClientRect(), r2 = mini.getBoundingClientRect();
      if(!fast && r1.width){
        const dx = (r2.left + r2.width/2) - (r1.left + r1.width/2), dy = (r2.top + r2.height/2) - (r1.top + r1.height/2), sc = Math.max(.05, r2.width / r1.width);
        letter.style.transition = 'transform .85s cubic-bezier(.6,0,.2,1), opacity .85s';
        letter.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${sc}) rotate(-6deg)`;
        letter.style.opacity = '.0';
        await wait(750);
      } else { letter.style.opacity = '0'; }
      letter.classList.add('away'); mini.classList.add('show');
      snd('place');
      await wait(250);
      await renderItems(data.items || gift);
      state = 'items';
      const remain = pending.length - 1;
      action.disabled = false;
      action.textContent = remain > 0 ? `次のギフトへ (残り${remain}件)` : '閉じる';
    }

    /* 📦 まとめて受け取り: 届いている全部を一度に受け取って、合計を見せる */
    async function claimAll(){
      if(state === 'claiming' || state === 'items') return;
      const prev = state;
      state = 'claiming'; action.disabled = true; if(allBtn){ allBtn.disabled = true; allBtn.textContent = '受け取り中...'; }
      let data = null;
      try{
        data = await CB().api('/api/gifts/claim-all', 'POST');
      }catch(err){
        if(/受け取れるギフトがありません/.test(err.message || '')){ pending.length = 0; showing = false; timers.forEach(clearTimeout); root.remove(); return; }
        state = prev; action.disabled = false;
        if(allBtn){ allBtn.disabled = false; allBtn.textContent = `📦 まとめて受け取る(${pending.length}件)`; }
        head.innerHTML = `⚠️ ${esc(err.message || '受け取りに失敗しました')}`; return;
      }
      if(data && data.coins != null && CB().setCoins) CB().setCoins(data.coins);
      const n = data.count || pending.length;
      pending.length = 0;
      box.classList.remove('drop', 'shake'); box.classList.add('gone'); letter.classList.add('away');
      if(allBtn) allBtn.remove();
      head.innerHTML = `🎉 ${n}件のギフトを、まとめて受け取りました！`;
      snd('place');
      await renderItems(data.items || {});
      state = 'items'; action.disabled = false; action.textContent = '閉じる';
    }
    if(allBtn) allBtn.addEventListener('click', claimAll);
    if(xBtn) xBtn.addEventListener('click', dismiss);
    root.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') dismiss(); });

    action.addEventListener('click', ()=>{
      if(state === 'box') openBox();
      else if(state === 'letter') next();
      else if(state === 'items') close();
    });
    // 左上の小さな手紙をタップすると、もう一度読める(もう一度タップで戻る)
    mini.addEventListener('click', ()=>{
      if(!letter.classList.contains('away')) return;
      letter.classList.toggle('reread');
    });
    letter.addEventListener('click', ()=>{ if(letter.classList.contains('reread')) letter.classList.remove('reread'); });
  }

  // 定期チェック(ロビーにいるときだけ表示。プレイ中はバッジだけ更新)
  setInterval(()=>{ if(CB().isLoggedIn && CB().isLoggedIn()) check('poll'); }, 60000);

  window.GiftFx = { check, pendingCount: ()=> pending.length, reset: ()=>{ dismissed = false; } };
})();
