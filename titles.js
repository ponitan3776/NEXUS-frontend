/* =====================================================================
   🏷 称号 (v3.5)
   ・遊び方に合わせて称号が集まり、1つを名前の横に飾れる(ランキング・チャット・フレンド・プロフィールに表示)
   ・管理者だけの特別な称号は、管理者アカウントの一覧にだけ出る(判定はサーバー)
   サーバー: GET /api/titles  /  POST /api/titles/equip {id}   (定義は backend/titles.py の TITLES)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const esc = (s)=> String(s == null ? '' : s).replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const mc = ()=> document.getElementById('modalContent');
  const mo = ()=> document.getElementById('modalOverlay');
  const RLABEL = { common:'ノーマル', rare:'レア', epic:'エピック', legendary:'レジェンド', admin:'特別' };
  const fmt = (n)=> Number(n || 0).toLocaleString('ja-JP');

  let data = null;        // { titles, equipped }
  let filter = 'all';
  let busy = false;

  const nameOf = (id)=>{ const t = data && data.titles.find(x=>x.id === id); return t ? t.name : ''; };
  const rarityOf = (id)=>{ const t = data && data.titles.find(x=>x.id === id); return t ? t.rarity : 'common'; };

  // ロビーの自分の名前の下に、付けている称号を出す
  function paintLobby(){
    const el = document.getElementById('lobbyAccountTitle'); if(!el) return;
    const id = data && data.equipped;
    el.textContent = id ? nameOf(id) : '';
    el.className = 'lc-title' + (id ? ' r-' + rarityOf(id) : '');
    el.style.display = id ? '' : 'none';
    if(CB().setMyTitle) CB().setMyTitle(id ? { id, n: nameOf(id), r: rarityOf(id) } : null);
  }

  async function load(){
    if(!(CB().isLoggedIn && CB().isLoggedIn())){ data = null; paintLobby(); return false; }
    try{
      const d = await CB().api('/api/titles');
      data = d;
      paintLobby();
      if(d.newlyUnlocked && d.newlyUnlocked.length && CB().toast){
        const names = d.newlyUnlocked.map(nameOf).filter(Boolean);
        if(names.length) CB().toast('🏷 新しい称号を獲得: ' + names.slice(0, 2).join(' / ') + (names.length > 2 ? ` ほか${names.length - 2}件` : ''));
      }
      return true;
    }catch(e){ return false; }
  }

  function itemHtml(t){
    const eq = data.equipped === t.id;
    let right;
    if(t.owned) right = eq ? `<button type="button" class="ttl-btn on" data-off="1">装備中 ✓</button>` : `<button type="button" class="ttl-btn" data-eq="${esc(t.id)}">つける</button>`;
    else right = `<span class="ttl-lock">🔒</span>`;
    const prog = (!t.owned && t.need) ? `<div class="ttl-prog"><i style="width:${Math.min(100, Math.floor(t.progress / t.need * 100))}%"></i></div><div class="ttl-pn">${fmt(t.progress)} / ${fmt(t.need)}</div>` : '';
    return `<div class="ttl-item r-${t.rarity} ${t.owned ? 'owned' : 'locked'} ${eq ? 'eq' : ''}">
      <div class="ttl-main">
        <div class="ttl-row"><span class="ttl r-${t.rarity}">${esc(t.name)}</span><small class="ttl-rar">${RLABEL[t.rarity] || ''}</small></div>
        <div class="ttl-desc">${esc(t.desc)}</div>${prog}
      </div><div class="ttl-side">${right}</div>
    </div>`;
  }

  function render(){
    const body = mc(); if(!body || body.dataset.mode !== 'titles') return;
    const logged = !!(CB().isLoggedIn && CB().isLoggedIn());
    let html = `<h2 style="color:var(--gold);">🏷 称号</h2>`;
    if(!logged){ body.innerHTML = html + `<div class="empty-hint">ログインすると、称号を集めて飾れます。</div>`; return; }
    if(!data){ body.innerHTML = html + `<div class="empty-hint">読み込みに失敗しました。もう一度開いてください。</div>`; return; }
    const owned = data.titles.filter(t=>t.owned).length;
    html += `<div class="sub">遊ぶと称号が手に入ります。つけた称号は、名前の横に表示されます。</div>
      <div class="ttl-now">${data.equipped ? `<span class="ttl r-${rarityOf(data.equipped)}">${esc(nameOf(data.equipped))}</span>` : '<span class="ttl-none">称号をつけていません</span>'}
        <small>${owned} / ${data.titles.length} 獲得</small></div>
      <div class="tab-row ttl-tabs">${[['all','すべて'],['owned','獲得済み'],['locked','未獲得']].map(([k,l])=>`<button type="button" class="tab-btn ${filter === k ? 'active' : ''}" data-tf="${k}">${l}</button>`).join('')}</div>`;
    const rank = (r)=> RARITY_ORDER.indexOf(r);
    const list = data.titles.filter(t=> filter === 'all' || (filter === 'owned' ? t.owned : !t.owned))
      .sort((a, b)=> (b.owned - a.owned) || (rank(b.rarity) - rank(a.rarity)));
    html += `<div class="ttl-list">${list.length ? list.map(itemHtml).join('') : '<div class="empty-hint">ここには、まだありません。</div>'}</div>`;
    const keep = body.scrollTop;
    body.innerHTML = html; body.scrollTop = keep;
    body.querySelectorAll('[data-tf]').forEach(b=> b.addEventListener('click', ()=>{ filter = b.dataset.tf; render(); }));
    body.querySelectorAll('[data-eq]').forEach(b=> b.addEventListener('click', ()=> equip(b.dataset.eq)));
    body.querySelectorAll('[data-off]').forEach(b=> b.addEventListener('click', ()=> equip(null)));
  }
  const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'admin'];

  async function equip(id){
    if(busy) return; busy = true;
    const prev = data.equipped;
    data.equipped = id; paintLobby(); render();          // 先に画面へ反映(返事を待たない)
    try{
      await CB().api('/api/titles/equip', 'POST', { id });
      if(CB().sound) CB().sound('coin');
    }catch(e){
      data.equipped = prev; paintLobby(); render();
      alert(e.message || '変更できませんでした');
    }
    busy = false;
  }

  async function open(){
    const body = mc(); if(!body) return;
    body.dataset.mode = 'titles';
    mo().classList.add('show');
    if(data) render(); else body.innerHTML = `<h2 style="color:var(--gold);">🏷 称号</h2><div class="empty-hint">読み込み中...</div>`;
    await load();
    if(mo().classList.contains('show') && mc().dataset.mode === 'titles') render();
  }

  const btn = document.getElementById('titleTitlesBtn');
  if(btn) btn.addEventListener('click', ()=>{ if(CB().hideTitle) CB().hideTitle(); open(); });

  // ログインしたとき・別のアカウントに替わったときに、付けている称号を読み直す
  let lastUser = null;
  function watch(){
    const u = (CB().isLoggedIn && CB().isLoggedIn()) ? CB().userId() : null;
    if(u !== lastUser){ lastUser = u; data = null; paintLobby(); if(u) load(); }
  }
  setTimeout(watch, 1500);
  setInterval(()=>{ if(!document.hidden) watch(); }, 5000);

  window.CBTitles = { open, reload: load };
})();
