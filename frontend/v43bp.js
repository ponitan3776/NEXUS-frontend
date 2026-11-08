/* =====================================================================
   ❄ ウィンターパスの画面 (v4.3.0)
   ・script.js にあった古いバトルパス画面の代わりに、ロビーの「バトルパス」ボタンを横取りして開く
   ・サーバー: GET /api/battlepass/state / POST /api/battlepass/claim / POST /api/battlepass/claim-all (backend/season.py)
   ・レベル・XP・件数は桁数の制限なし。画面では正確な桁(NXBig)から短く表記する
   ===================================================================== */
(function(){
  'use strict';
  const C = ()=> window.CBV43Core || {};
  const CB = ()=> window.CB || {};
  const esc = (s)=> C().esc(s);
  const fmt = (n)=> C().fmt(n);
  const exactStr = (n)=> (window.NXBig && window.NXBig.exact(n)) || String(n);
  let state = null, tab = 'next', busy = false, lastNotice = '';

  async function fetchState(){
    if(!C().logged()) return null;
    try{ const d = await CB().api('/api/battlepass/state'); state = d; return d; }
    catch(e){ return null; }
  }

  // ---- レベルアップの検知(ゲームのあとや、画面を開いたときに呼ぶ) ----
  async function checkLevelUp(silent){
    const d = await fetchState(); if(!d) return;
    const st = C().store, lv = Number(d.level) || 0;
    if(st.lastLevel && lv > st.lastLevel && !silent){
      C().levelupFx(`<b>LEVEL UP!</b><span>ウィンターパス Lv.${fmt(d.level)}</span>`);
      if(CB().sound) CB().sound('win');
    }
    if(lv !== st.lastLevel){ st.lastLevel = lv; C().persist(); }
    const b = document.getElementById('dockBpBadge');
    if(b){ const n = Number(d.pendingCount) || 0; b.classList.toggle('show', n > 0); b.textContent = n > 99 ? '99+' : (n > 0 ? String(n) : ''); }
    if(C().modalIs('v43-wpass')) render();
  }

  function itemChips(items){
    return (items || []).map(i=> `<span class="wp-chip t-${esc(i.type)}${i.limited ? ' limited' : ''}">${esc(i.label)}</span>`).join('');
  }
  function rewardRow(r){
    const can = r.reached && !r.claimed;
    const state_ = r.claimed ? '受取済み' : (r.reached ? '受け取る' : '🔒');
    const sp = (r.items || []).some(i=> ['skin','cosmetic','title'].includes(i.type));
    const lim = (r.items || []).some(i=> i.limited);
    return `<div class="wp-row${r.claimed ? ' claimed' : ''}${can ? ' can' : ''}${sp ? ' special' : ''}${lim ? ' limited' : ''}">
      <div class="wp-lv">Lv.${fmt(r.level)}</div>
      <div class="wp-items">${itemChips(r.items)}</div>
      <button type="button" class="wp-claim" data-wlv="${esc(exactStr(r.level))}" ${can ? '' : 'disabled'}>${state_}</button>
    </div>`;
  }

  function render(){
    if(!C().modalIs('v43-wpass')) return;
    const m = CB().modal().el;
    if(!state){ m.innerHTML = head() + '<div class="empty-hint">読み込めませんでした。もう一度開いてください。</div>'; return; }
    const s = state;
    const into = Number(s.xpIntoLevel) || 0, per = Number(s.xpPerLevel) || 1;
    const pct = C().clamp(Math.round(into / per * 100), 0, 100);
    const pend = Number(s.pendingCount) || 0;
    const nx = s.nextSpecial;
    const keep = m.scrollTop;
    let body = '';
    if(tab === 'next'){
      body = `<div class="wp-list">${(s.rewards || []).slice().sort((a,b)=> Number(a.level) - Number(b.level)).map(rewardRow).join('')}</div>`;
    } else if(tab === 'special'){
      body = `<div class="sub wp-note">1000レベルまでの特別報酬です。金色の「★1000レベル限定」は、1000レベルまでしか手に入りません。</div>
        <div class="wp-list">${(s.specials || []).map(rewardRow).join('')}</div>`;
    } else {
      body = `<div class="wp-how">
        <p>🎮 ゲームを遊ぶとXPがたまり、レベルが上がります。</p>
        <p>📈 次のレベルに必要なXPは、レベルが上がるごとに <b>+25</b> ずつ増えます(Lv.1→2: 1,000 / Lv.100→101: 3,475 / Lv.1000: 25,975)。</p>
        <p>🎁 基本の報酬は25レベルで1周し、<b>100レベルごとにコインが増えます</b>(最大10倍)。5の倍数のレベルはガチャ無料チケット。</p>
        <p>✨ 10レベルごとにボーナスコイン、50レベルごとにチケット+2、さらに冬のスキン12種・勝利演出・レベルアップ演出・テーマ・称号が、1000レベルまで続きます。</p>
        <p>🥶 <b>1000レベル限定</b>: スキン「絶対零度」・称号「絶対零度の覇者」・勝利演出と専用のレベルアップ演出。</p>
        <p>♾ レベルの上限はありません。1001レベル以降も、基本の報酬が続きます。</p>
      </div>`;
    }
    m.innerHTML = `${head()}
      <div class="wp-hero">
        <div class="wp-snow"></div>
        <div class="wp-season">${esc((s.season && s.season.name) || '❄ ウィンターパス')}</div>
        <div class="wp-level">Lv.<b>${fmt(s.level)}</b></div>
        <div class="wp-bar"><i style="width:${pct}%"></i></div>
        <div class="wp-xp">${C().num(s.xpIntoLevel)} / ${C().num(s.xpPerLevel)} XP<small> ・ 次のレベルまで あと ${C().num(Math.max(0, per - into))}</small></div>
        ${nx ? `<div class="wp-next">🎯 次の特別報酬 <b>Lv.${fmt(nx.level)}</b>${nx.items.some(i=>i.limited) ? ' <em>★1000レベル限定</em>' : ''}<div>${itemChips(nx.items)}</div></div>` : ''}
      </div>
      ${lastNotice}
      <button type="button" class="primary-btn wp-all" id="wpAll" ${pend ? '' : 'disabled'}>
        ${pend ? `🎁 まとめて受け取る (${fmt(s.pendingCount)}件 / 🪙${fmt(s.pendingCoins)}${Number(s.pendingTickets) ? ` ＋🎫×${fmt(s.pendingTickets)}` : ''})` : '🎁 受け取れる報酬はありません'}
      </button>
      ${(s.pendingItems || []).length ? `<div class="wp-pend">特別報酬もあります: ${(s.pendingItems || []).slice(0, 6).map(p=> `Lv.${fmt(p.level)} ${esc((p.labels || []).join(' / '))}`).join(' ・ ')}${(s.pendingItems || []).length > 6 ? ' ほか' : ''}</div>` : ''}
      <div class="tab-row wp-tabs">${[['next','つづき'],['special','特別報酬'],['how','しくみ']].map(([k,l])=> `<button type="button" class="tab-btn ${tab === k ? 'active' : ''}" data-wtab="${k}">${l}</button>`).join('')}</div>
      ${body}`;
    m.scrollTop = keep;
    m.querySelectorAll('[data-wtab]').forEach(b=> b.addEventListener('click', ()=>{ tab = b.dataset.wtab; lastNotice = ''; render(); }));
    m.querySelectorAll('.wp-claim:not([disabled])').forEach(b=> b.addEventListener('click', ()=> claim(b.dataset.wlv)));
    const all = m.querySelector('#wpAll'); if(all) all.addEventListener('click', claimAll);
  }
  const head = ()=> '<h2 class="wp-title">❄ ウィンターパス</h2>';

  function afterClaim(d, title){
    if(d.coins !== undefined && CB().setCoins) CB().setCoins(d.coins);
    if(CB().sound) CB().sound('coin');
    const extras = [];
    (d.newSkins || []).forEach(id=> extras.push('🎨 新しいスキンを獲得！(コレクション / スキン から装備)'));
    (d.newCosmetics || []).forEach(id=> extras.push('✨ 新しい演出・テーマを獲得！(テーマと演出 から選べます)'));
    if(d.newSkins && d.newSkins.length){ C().rareFx('❄ 限定スキンを獲得'); if(CB().refreshFromServer) CB().refreshFromServer(); }
    else if(d.newCosmetics && d.newCosmetics.length) C().victoryFx(`<b>${esc(title)}</b>`);
    lastNotice = `<div class="wp-notice">${esc(title)}${extras.length ? '<br>' + extras.join('<br>') : ''}</div>`;
  }
  async function claim(lv){
    if(busy) return; busy = true;
    try{
      const d = await CB().api('/api/battlepass/claim', 'POST', { level: lv });
      afterClaim(d, '🎁 報酬を受け取りました！');
      await fetchState(); render(); if(window.CBV43) window.CBV43.refreshBadges();
    }catch(e){ lastNotice = `<div class="wp-notice err">${esc(e.message || '受け取れませんでした')}</div>`; render(); }
    busy = false;
  }
  async function claimAll(){
    if(busy) return; busy = true;
    try{
      const d = await CB().api('/api/battlepass/claim-all', 'POST', {});
      afterClaim(d, `🎁 ${fmt(d.claimedCount)}件まとめて受け取りました！ 🪙${fmt(d.totalCoins)}${Number(d.totalTickets) ? ` ／ 🎫×${fmt(d.totalTickets)}` : ''}`);
      await fetchState(); render(); if(window.CBV43) window.CBV43.refreshBadges();
    }catch(e){ lastNotice = `<div class="wp-notice err">${esc(e.message || '受け取れませんでした')}</div>`; render(); }
    busy = false;
  }

  async function open(){
    if(C().goLobbyHide) C().goLobbyHide();
    lastNotice = ''; tab = 'next';
    if(!C().logged()){
      C().modalOpen('v43-wpass', head() + '<div class="empty-hint">ログインすると、ウィンターパスに参加できます。<br>ゲームを遊んでXPをためて、冬のスキンや演出を集めよう！</div>');
      return;
    }
    C().modalOpen('v43-wpass', head() + (state ? '' : '<div class="empty-hint">読み込み中...</div>'));
    if(state) render();
    await fetchState();
    if(state && state.level) { const st = C().store; st.lastLevel = Number(state.level) || st.lastLevel; C().persist(); }
    render();
  }

  // ロビー・☰メニューの「バトルパス」を、新しい画面に差し替える(元のハンドラより先に実行して止める)
  const btn = document.getElementById('titleBattlePassBtn');
  if(btn) btn.addEventListener('click', (e)=>{ e.stopImmediatePropagation(); e.preventDefault(); open(); }, true);

  window.CBWinterPass = { open, refresh: checkLevelUp, state: ()=> state };
})();
