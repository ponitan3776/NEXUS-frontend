/* =====================================================================
   🆕 v4.3.0 画面いろいろ (v43.js の後 / bots.js の前に読み込む)
   プロフィール / 実績センター / コレクション / プレイ統計 / テーマと演出 / データ保存 / チュートリアル / ロビー(ドック)の配線
   サーバー: backend/v43.py (/api/v43/...)
   ===================================================================== */
(function(){
  'use strict';
  const C = window.CBV43Core;
  if(!C) return;
  const CB = ()=> window.CB || {};
  const { esc, fmt, full, notify, modalOpen, modalIs, goLobbyHide, logged, isAdmin, store } = C;
  const $id = (id)=> document.getElementById(id);
  const gameOf = (id)=> (window.CBMini && window.CBMini.games.find(g=> g.id === id)) || null;
  const gameName = (id)=>{ const g = gameOf(id); return g ? `${g.emoji} ${g.name}` : id; };
  const MODE_NAMES = { soft:'🌱 やさしい', baked:'🔥 ふつう', hard:'💪 硬い', extreme:'💀 極限', timeattack:'⏱ タイムアタック', tetris:'🧱 テトリス' };
  let prof = null, titlesData = null;

  /* ---------- データの読み込み ---------- */
  async function loadProfile(){
    if(!logged()) return null;
    try{
      prof = await CB().api('/api/v43/profile');
      if(prof.newAch && prof.newAch.length) C.showAch(prof.newAch);
      // サーバーの選択(勝利演出・レベルアップ演出・テーマ)を、この端末にも反映する
      const sel = prof.selected || {};
      if(sel.victory){ store.victory = sel.victory; }
      if(sel.levelup){ store.levelup = sel.levelup; }
      if(sel.theme){ store.theme = sel.theme; C.applyTheme(store.theme); }
      C.persist();
      updateAchBadge();
      return prof;
    }catch(e){ return null; }
  }
  async function loadTitles(){
    if(!logged()) return null;
    try{ titlesData = await CB().api('/api/titles'); }catch(e){}
    return titlesData;
  }
  const titleName = (id)=>{ const t = titlesData && titlesData.titles.find(x=> x.id === id); return t ? t.name : ''; };
  function updateAchBadge(){
    const b = $id('dockAchBadge'); if(!b || !prof) return;
    const seen = store.achSeen || 0, n = Math.max(0, (prof.achCount || 0) - seen);
    b.classList.toggle('show', n > 0); b.textContent = n > 9 ? '9+' : (n > 0 ? String(n) : '');
  }
  function needLogin(what){
    goLobbyHide();
    modalOpen('v43-login', `<h2>🔐 ログインが必要です</h2><div class="empty-hint">${esc(what)}は、ログインするとつかえます。<br>ゲームの記録・実績・コレクションがアカウントに保存されます。</div>
      <button type="button" class="primary-btn" id="v43Reg" style="margin-top:12px;">ログイン / 新規登録</button>`);
    const b = document.querySelector('#v43Reg'); if(b) b.addEventListener('click', ()=>{ if(CB().openRegister) CB().openRegister(); });
  }
  const bar = (v, max)=> `<div class="v43-bar"><i style="width:${max ? Math.max(0, Math.min(100, Math.round(v / max * 100))) : 0}%"></i></div>`;
  const fmtDur = (sec)=>{ sec = Math.max(0, Number(sec) || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? `${h}時間${m}分` : `${m}分`; };
  const closeBtn = ()=> '';

  /* ---------- プロフィール ---------- */
  async function openProfile(){
    if(!logged()) return needLogin('プロフィール');
    goLobbyHide();
    modalOpen('v43-profile', '<h2>👤 プロフィール</h2><div class="empty-hint">読み込み中...</div>');
    const [p] = await Promise.all([loadProfile(), loadTitles()]);
    if(!modalIs('v43-profile')) return;
    if(!p) return modalOpen('v43-profile', '<h2>👤 プロフィール</h2><div class="empty-hint">読み込めませんでした。</div>');
    const st = p.stats, eq = p.equippedTitle && titleName(p.equippedTitle);
    const favs = (store.favs || []).slice(0, 8).map(id=> `<button type="button" class="pf-fav" data-g="${esc(id)}">${esc((gameOf(id) || {}).emoji || '🎮')}</button>`).join('');
    const own = titlesData ? titlesData.titles.filter(t=> t.owned).length : 0, allT = titlesData ? titlesData.titles.length : 0;
    const joined = p.joinedAt ? new Date(p.joinedAt).toLocaleDateString('ja-JP') : '-';
    modalOpen('v43-profile', `<h2>👤 プロフィール</h2>
      <div class="pf-card">
        <div class="pf-ava">${CB().avatar ? CB().avatar(p.icon, p.name, p.id, 64) : '👤'}</div>
        <div class="pf-main"><div class="pf-name">${esc(p.name)}</div>${eq ? `<div class="pf-title">${esc(eq)}</div>` : ''}
          <div class="pf-lv">❄ ウィンターパス Lv.<b>${fmt(p.level)}</b></div>
          ${bar(Number(p.xpIntoLevel) || 0, Number(p.xpPerLevel) || 1)}
          <div class="pf-sub">${C.num(p.xpIntoLevel)} / ${C.num(p.xpPerLevel)} XP ・ 登録日 ${esc(joined)}</div></div>
      </div>
      <div class="pf-grid">
        <div class="pf-tile"><b>${fmt(st.plays)}</b><span>🎮 遊んだ回数</span></div>
        <div class="pf-tile"><b>${fmt(st.streak)}日</b><span>🔥 連続プレイ</span></div>
        <div class="pf-tile"><b>${fmt(st.bestStreak)}日</b><span>🏅 最長の連続</span></div>
        <div class="pf-tile"><b>${fmt(st.days)}日</b><span>📆 遊んだ日数</span></div>
        <div class="pf-tile"><b>${fmt(st.perfects)}</b><span>⭐ 満点の回数</span></div>
        <div class="pf-tile"><b>${st.minisPlayed}/${(window.CBMini ? window.CBMini.games.length : 31)}</b><span>🧭 ミニゲーム</span></div>
        <div class="pf-tile"><b>${fmt(p.coins)}</b><span>🪙 コイン</span></div>
        <div class="pf-tile"><b>${fmtDur(p.playTime)}</b><span>⏱ 遊んだ時間</span></div>
        <div class="pf-tile"><b>${fmt(st.totalScore)}</b><span>📊 累計スコア</span></div>
      </div>
      <button type="button" class="pf-sec" data-go="achievements"><span>🏆 実績</span><b>${p.achCount} / ${p.achTotal}</b>${bar(p.achCount, p.achTotal)}</button>
      <button type="button" class="pf-sec" data-go="titles"><span>🏷 称号</span><b>${own} / ${allT}</b>${bar(own, allT)}</button>
      ${favs ? `<div class="pf-favs"><span>💖 お気に入り</span><div>${favs}</div></div>` : ''}
      <div class="pf-btns">
        <button type="button" class="ghost-btn" data-go="collection">📦 コレクション</button>
        <button type="button" class="ghost-btn" data-go="stats">📊 統計・履歴</button>
        <button type="button" class="ghost-btn" data-go="themes">🎨 テーマと演出</button>
        <button type="button" class="ghost-btn" data-go="cloud">💾 データ保存</button>
      </div>`);
    const m = CB().modal().el;
    m.querySelectorAll('[data-go]').forEach(b=> b.addEventListener('click', ()=> go(b.dataset.go)));
    m.querySelectorAll('.pf-fav').forEach(b=> b.addEventListener('click', ()=>{ CB().closeModal(); setTimeout(()=>{ if(CB().showTitle) CB().showTitle(); if(window.CBMini) window.CBMini.start(b.dataset.g, true); }, 120); }));
  }

  /* ---------- 実績センター ---------- */
  let achFilter = 'all';
  async function openAchievements(){
    if(!logged()) return needLogin('実績');
    goLobbyHide();
    modalOpen('v43-ach', '<h2>🏆 実績センター</h2><div class="empty-hint">読み込み中...</div>');
    const p = await loadProfile();
    if(!modalIs('v43-ach')) return;
    if(!p) return modalOpen('v43-ach', '<h2>🏆 実績センター</h2><div class="empty-hint">読み込めませんでした。</div>');
    store.achSeen = p.achCount; C.persist(); updateAchBadge();
    renderAch();
  }
  function renderAch(){
    if(!modalIs('v43-ach') || !prof) return;
    const list = prof.achievements.filter(a=> achFilter === 'all' ? true : achFilter === 'have' ? a.have : !a.have);
    const m = CB().modal().el, keep = m.scrollTop;
    modalOpen('v43-ach', `<h2>🏆 実績センター</h2>
      <div class="ach-hero"><b>${prof.achCount}</b><span> / ${prof.achTotal} 個 獲得</span>${bar(prof.achCount, prof.achTotal)}
        <small>遊ぶと実績が解放されて、コインとXPがもらえます。<em>❓隠し実績</em>は、解放するまで条件が見えません。</small></div>
      <div class="tab-row ach-tabs">${[['all','すべて'],['have','獲得済み'],['no','未獲得']].map(([k,l])=> `<button type="button" class="tab-btn ${achFilter === k ? 'active' : ''}" data-af="${k}">${l}</button>`).join('')}</div>
      <div class="ach-list">${list.map(a=>`<div class="ach-item ${a.have ? 'have' : ''} ${a.hidden && !a.have ? 'secret' : ''}">
        <div class="ach-ic">${esc(a.icon)}</div>
        <div class="ach-body"><div class="ach-nm">${esc(a.name)}${a.hidden && a.have ? ' <em>隠し</em>' : ''}</div><div class="ach-ds">${esc(a.desc)}</div>
          ${!a.have && a.need ? `${bar(a.progress || 0, a.need)}<div class="ach-pg">${fmt(a.progress || 0)} / ${fmt(a.need)}</div>` : ''}
          ${a.reward ? `<div class="ach-rw">${a.reward.coins ? '🪙+' + fmt(a.reward.coins) + ' ' : ''}${a.reward.xp ? '❄+' + fmt(a.reward.xp) + 'XP' : ''}</div>` : ''}</div>
        <div class="ach-st">${a.have ? '✅' : (a.hidden ? '❓' : '🔒')}</div></div>`).join('') || '<div class="empty-hint">なにもありません</div>'}</div>
      <button type="button" class="ghost-btn" id="achOld" style="margin-top:10px;">📜 これまでのプレイ記録を見る</button>`);
    const m2 = CB().modal().el; m2.scrollTop = keep;
    m2.querySelectorAll('[data-af]').forEach(b=> b.addEventListener('click', ()=>{ achFilter = b.dataset.af; renderAch(); }));
    m2.querySelector('#achOld').addEventListener('click', ()=> CB().openRecordsOld());
  }

  /* ---------- コレクション ---------- */
  async function openCollection(){
    if(!logged()) return needLogin('コレクション');
    goLobbyHide();
    modalOpen('v43-col', '<h2>📦 コレクション</h2><div class="empty-hint">読み込み中...</div>');
    let col = null; try{ col = await CB().api('/api/v43/collection'); }catch(e){}
    await loadTitles();
    if(!modalIs('v43-col')) return;
    if(!col) return modalOpen('v43-col', '<h2>📦 コレクション</h2><div class="empty-hint">読み込めませんでした。</div>');
    const info = CB().skinsInfo ? CB().skinsInfo() : { list: [], owned: [], equipped: '' };
    const ownedSet = new Set(info.owned), unl = new Set(col.unlocked);
    const skinsShown = info.list.filter(s=> ownedSet.has(s.id));
    const winterAll = Object.entries(col.winterSkins || {});
    const winterOwn = winterAll.filter(([id])=> ownedSet.has(id)).length;
    const tOwn = titlesData ? titlesData.titles.filter(t=> t.owned).length : 0, tAll = titlesData ? titlesData.titles.length : 0;
    const catRow = (kind, label)=> `<div class="col-sec"><h3>${label} <small>${col.catalog[kind].filter(c=> unl.has(c.id)).length} / ${col.catalog[kind].length}</small></h3>
      <div class="col-chips">${col.catalog[kind].map(c=> `<span class="col-chip ${unl.has(c.id) ? 'own' : ''}">${unl.has(c.id) ? '' : '🔒 '}${esc(c.name)}</span>`).join('')}</div></div>`;
    modalOpen('v43-col', `<h2>📦 コレクション</h2>
      <div class="col-sum"><div><b>${skinsShown.length}</b><span>🎨 スキン</span></div><div><b>${tOwn}</b><span>🏷 称号</span></div><div><b>${col.catalog.victory.filter(c=> unl.has(c.id)).length + col.catalog.levelup.filter(c=> unl.has(c.id)).length}</b><span>✨ 演出</span></div><div><b>${col.catalog.theme.filter(c=> unl.has(c.id)).length}</b><span>🖼 テーマ</span></div></div>
      <div class="col-sec"><h3>🎨 スキン <small>${skinsShown.length} / ${info.list.length}</small></h3>
        <div class="col-skins">${skinsShown.map(s=> `<button type="button" class="col-skin ${info.equipped === s.id ? 'eq' : ''}" data-skin="${esc(s.id)}"><span class="sw">${(s.colors || []).slice(0, 4).map(c=> `<i style="background:${c}"></i>`).join('')}</span><span class="nm">${esc(s.name)}</span><small>${info.equipped === s.id ? '装備中' : 'つける'}</small></button>`).join('')}</div></div>
      <div class="col-sec"><h3>❄ ウィンターパスの限定スキン <small>${winterOwn} / ${winterAll.length}</small></h3>
        <div class="col-chips">${winterAll.map(([id, v])=> `<span class="col-chip ${ownedSet.has(id) ? 'own' : ''}">${ownedSet.has(id) ? '' : '🔒 '}${esc(v.name)} <em>Lv.${v.level}</em></span>`).join('')}</div></div>
      ${catRow('victory', '🏆 勝利演出')}${catRow('levelup', '⬆ レベルアップ演出')}${catRow('theme', '🖼 テーマ')}
      <div class="pf-btns"><button type="button" class="ghost-btn" data-go="titles">🏷 称号を見る</button><button type="button" class="ghost-btn" data-go="themes">🎨 演出を選ぶ</button></div>`);
    const m = CB().modal().el;
    m.querySelectorAll('[data-go]').forEach(b=> b.addEventListener('click', ()=> go(b.dataset.go)));
    m.querySelectorAll('[data-skin]').forEach(b=> b.addEventListener('click', ()=>{ CB().equipSkin(b.dataset.skin); setTimeout(openCollection, 120); }));
  }

  /* ---------- 統計・プレイ履歴・連続プレイ ---------- */
  async function openStats(){
    if(!logged()) return needLogin('プレイ統計');
    goLobbyHide();
    modalOpen('v43-stats', '<h2>📊 プレイ統計</h2><div class="empty-hint">読み込み中...</div>');
    const p = await loadProfile();
    if(!modalIs('v43-stats')) return;
    if(!p) return modalOpen('v43-stats', '<h2>📊 プレイ統計</h2><div class="empty-hint">読み込めませんでした。</div>');
    const st = p.stats, by = Object.entries(st.byGame || {}).sort((a, b)=> b[1] - a[1]).slice(0, 10), top = by.length ? by[0][1] : 1;
    const flame = st.streak >= 30 ? '🔥🔥🔥' : st.streak >= 7 ? '🔥🔥' : st.streak >= 1 ? '🔥' : '❄';
    modalOpen('v43-stats', `<h2>📊 プレイ統計</h2>
      <div class="st-streak"><div class="st-flame">${flame}</div><div><b>${fmt(st.streak)}</b><span>日 連続プレイ中</span><small>最長 ${fmt(st.bestStreak)} 日 ・ 合計 ${fmt(st.days)} 日 ・ 今日 ${fmt(st.todayPlays)} 回</small></div></div>
      <div class="pf-grid">
        <div class="pf-tile"><b>${fmt(st.plays)}</b><span>🎮 総プレイ回数</span></div>
        <div class="pf-tile"><b>${fmt(st.totalScore)}</b><span>📊 累計スコア</span></div>
        <div class="pf-tile"><b>${fmt(st.perfects)}</b><span>⭐ 満点</span></div>
        <div class="pf-tile"><b>${fmtDur(p.playTime)}</b><span>⏱ 遊んだ時間</span></div>
        <div class="pf-tile"><b>${fmt(p.bestScore)}</b><span>🏆 最高スコア</span></div>
        <div class="pf-tile"><b>${st.minisPlayed}</b><span>🧭 遊んだミニゲーム</span></div>
      </div>
      <div class="col-sec"><h3>🎮 よく遊ぶゲーム</h3>${by.length ? by.map(([id, n])=> `<div class="st-row"><span>${esc(MODE_NAMES[id] || gameName(id))}</span><div class="v43-bar"><i style="width:${Math.round(n / top * 100)}%"></i></div><b>${fmt(n)}</b></div>`).join('') : '<div class="empty-hint">まだ記録がありません</div>'}</div>
      <div class="col-sec"><h3>🕘 最近のプレイ</h3>${(p.history || []).slice(0, 15).map(h=> `<div class="st-hist"><span class="hn">${esc(MODE_NAMES[h.g] || gameName(h.g))}</span><span class="hs">${h.k === 'mini' ? '★'.repeat(Math.min(5, Math.ceil((h.r || 0) / 20))) : fmt(h.s)}</span><span class="ht">${h.t ? esc(String(h.t).slice(5, 16).replace('T', ' ')) : ''}${h.ai ? ' 🤖' : ''}</span></div>`).join('') || '<div class="empty-hint">まだ記録がありません</div>'}</div>`);
  }

  /* ---------- テーマと演出 ---------- */
  async function openThemes(){
    goLobbyHide();
    modalOpen('v43-theme', '<h2>🎨 テーマと演出</h2><div class="empty-hint">読み込み中...</div>');
    if(logged()) await loadProfile();
    if(!modalIs('v43-theme')) return;
    renderThemes();
  }
  function unlockedSet(){ return new Set(prof && prof.unlocked ? prof.unlocked : C.DEFAULT_STORE && ['v_classic', 'v_snow', 'v_sparkle', 'lu_default', 'lu_snow', 'theme:normal', 'theme:dark', 'theme:retro', 'theme:winter']); }
  function renderThemes(){
    if(!modalIs('v43-theme')) return;
    const unl = unlockedSet();
    const sections = [
      ['theme', '🖼 画面テーマ', C.THEME_NAMES, 'theme'],
      ['victory', '🏆 勝利演出(クリア・ハイスコアのとき)', Object.fromEntries(Object.keys(C.FX).filter(k=> k.startsWith('v_')).map(k=> [k, ({ v_classic:'🎉 クラシック', v_snow:'❄ 雪舞い', v_sparkle:'✨ きらめき', v_frost:'🧊 霜の花', v_aurora:'🌌 オーロラ', v_iceburst:'💥 アイスバースト', v_blizzard:'🌨 ブリザード', v_diamond:'💎 ダイヤモンドダスト', v_zero:'🥶 絶対零度' })[k]])), 'victory'],
      ['levelup', '⬆ レベルアップ演出', Object.fromEntries(Object.keys(C.FX).filter(k=> k.startsWith('lu_')).map(k=> [k, ({ lu_default:'⬆ スタンダード', lu_snow:'❄ 粉雪', lu_frost:'🧊 フロスト', lu_aurora:'🌌 オーロラ', lu_crystal:'💠 クリスタル', lu_nova:'🌟 ノヴァ', lu_zero:'🥶 絶対零度' })[k]])), 'levelup']
    ];
    const cur = { theme: store.theme, victory: store.victory, levelup: store.levelup };
    const m = CB().modal().el, keep = m.scrollTop;
    modalOpen('v43-theme', `<h2>🎨 テーマと演出</h2>
      <div class="sub" style="margin-bottom:8px;">🔒 のものは、ウィンターパスのレベルを上げると解放されます。タップで選択、▶でためし見ができます。</div>
      ${sections.map(([kind, label, names])=> `<div class="col-sec"><h3>${label}</h3><div class="th-list">${Object.entries(names).map(([id, nm])=>{
        const uid = kind === 'theme' ? id : id; const ok = unl.has(uid) || (kind === 'theme' && unl.has(id));
        return `<div class="th-item ${cur[kind] === id ? 'on' : ''} ${ok ? '' : 'lock'}" data-kind="${kind}" data-id="${esc(id)}"><button type="button" class="th-pick" ${ok ? '' : 'disabled'}>${ok ? '' : '🔒 '}${esc(nm)}${cur[kind] === id ? ' ✓' : ''}</button>${kind !== 'theme' ? `<button type="button" class="th-try" data-try="${esc(id)}" aria-label="ためし見">▶</button>` : ''}</div>`;
      }).join('')}</div></div>`).join('')}
      <div class="col-sec"><h3>❄ 冬のかざり</h3><label class="th-sw"><input type="checkbox" id="thSnow" ${store.winterFx !== false ? 'checked' : ''}> ロビーに雪を降らせる</label></div>`);
    const m2 = CB().modal().el; m2.scrollTop = keep;
    m2.querySelectorAll('.th-item').forEach(el=>{
      const kind = el.dataset.kind, id = el.dataset.id;
      el.querySelector('.th-pick').addEventListener('click', ()=> choose(kind, id));
      const t = el.querySelector('.th-try'); if(t) t.addEventListener('click', ()=> C.playFx(id, id.startsWith('lu_') ? '<b>LEVEL UP!</b><span>ためし見</span>' : '<b>VICTORY!</b><span>ためし見</span>'));
    });
    m2.querySelector('#thSnow').addEventListener('change', (e)=>{ store.winterFx = e.target.checked; C.touch(); C.snowKick(); });
  }
  async function choose(kind, id){
    if(kind === 'theme'){ store.theme = id; C.applyTheme(id); }
    else if(kind === 'victory') store.victory = id;
    else store.levelup = id;
    C.touch();
    if(logged()){ try{ await CB().api('/api/v43/select', 'POST', { kind, id }); }catch(e){ notify(`<span class="ach-tx"><b>${esc(e.message || '選べませんでした')}</b></span>`, '', 2400); } }
    renderThemes();
  }

  /* ---------- データ保存(クラウド / バックアップ / 書き出し・読み込み) ---------- */
  async function openCloud(){
    goLobbyHide();
    modalOpen('v43-cloud', '<h2>💾 データ保存</h2><div class="empty-hint">読み込み中...</div>');
    let info = null;
    if(logged()){ try{ info = await CB().api('/api/v43/save'); }catch(e){} }
    if(!modalIs('v43-cloud')) return;
    const c = C.cloud();
    const bk = (info && info.backups) || [];
    modalOpen('v43-cloud', `<h2>💾 データ保存</h2>
      <div class="cl-card">${logged() ? `<b>☁ アカウントに自動保存中</b><span>お気に入り・★評価・遊んだ履歴・テーマ・遊び方の既読は、変えるたびに自動で保存されます。別の端末でログインしても引き継げます。</span>
        <small>保存の版: ${c.rev || (info && info.rev) || 0}${c.at ? ' ・ 最後の保存 ' + new Date(c.at).toLocaleTimeString('ja-JP') : ''}${c.err ? ' ・ ⚠ ' + esc(c.err) : ''}</small>`
        : `<b>📱 この端末にだけ保存中</b><span>ログインすると、アカウントに自動保存されて、別の端末でも引き継げます。</span>`}</div>
      <div class="pf-btns"><button type="button" class="ghost-btn" id="clNow">☁ 今すぐ保存</button><button type="button" class="ghost-btn" id="clPull">⬇ クラウドから読み込む</button></div>
      <div class="col-sec"><h3>🕰 バックアップ(最新${bk.length}世代)</h3>${bk.length ? bk.map((b, i)=> `<div class="cl-bk"><span>版 ${b.rev} ・ ${esc(String(b.at || '').slice(0, 16).replace('T', ' '))}</span><button type="button" class="ghost-btn" data-rs="${i}">戻す</button></div>`).join('') : '<div class="empty-hint">まだバックアップはありません。内容を変えると、前の版が自動で残ります。</div>'}</div>
      <div class="col-sec"><h3>📤 書き出し / 📥 読み込み</h3><div class="sub">データを文字で書き出して、ほかの端末に貼りつけて引き継げます。</div>
        <textarea id="clBox" class="cl-box" rows="3" placeholder="ここに書き出されます / 貼りつけて読み込み"></textarea>
        <div class="pf-btns"><button type="button" class="ghost-btn" id="clExp">📤 書き出す</button><button type="button" class="ghost-btn" id="clImp">📥 読み込む</button></div></div>`);
    const m = CB().modal().el;
    const say = (t)=> notify(`<span class="ach-tx"><b>${esc(t)}</b></span>`, '', 2400);
    m.querySelector('#clNow').addEventListener('click', async ()=>{ if(!logged()) return say('ログインが必要です'); say((await C.pushCloud()) ? '☁ 保存しました' : '保存できませんでした'); openCloud(); });
    m.querySelector('#clPull').addEventListener('click', async ()=>{ if(!logged()) return say('ログインが必要です'); say((await C.pullCloud()) ? '⬇ 読み込みました' : '読み込めませんでした'); });
    m.querySelectorAll('[data-rs]').forEach(b=> b.addEventListener('click', async ()=>{
      try{ const d = await CB().api('/api/v43/save/restore', 'POST', { index: Number(b.dataset.rs) }); C.setStore(Object.assign({}, store, d.data)); C.applyTheme(store.theme); say('🕰 バックアップから戻しました'); openCloud(); }
      catch(e){ say(e.message || '戻せませんでした'); }
    }));
    const box = m.querySelector('#clBox');
    m.querySelector('#clExp').addEventListener('click', ()=>{ box.value = btoa(unescape(encodeURIComponent(JSON.stringify(store)))); box.select(); try{ navigator.clipboard.writeText(box.value); say('📤 書き出してコピーしました'); }catch(e){ say('📤 書き出しました(コピーしてください)'); } });
    m.querySelector('#clImp').addEventListener('click', ()=>{
      try{
        const obj = JSON.parse(decodeURIComponent(escape(atob(box.value.trim()))));
        if(!obj || typeof obj !== 'object' || !Array.isArray(obj.favs)) throw new Error('形式がちがいます');
        C.setStore(Object.assign({}, store, obj)); C.applyTheme(store.theme); C.touch(); say('📥 読み込みました');
      }catch(e){ say('読み込めませんでした(形式がちがいます)'); }
    });
  }

  /* ---------- チュートリアル(はじめての案内 / ☰から何度でも) ---------- */
  const TUTO = [
    ['❄', 'NEXUSへようこそ', 'ブロックパズル・テトリス・31種類のミニゲームで遊べます。遊ぶとコインとXPがたまり、ウィンターパスのレベルが上がります。'],
    ['🕹', 'ゲームのえらびかた', 'ロビーの <b>PLAY</b> でパズルやテトリス、<b>ミニゲーム</b>では検索・カテゴリ・お気に入り(♡)・おすすめ・ランダムで選べます。'],
    ['🎁', 'ウィンターパス', '遊ぶほどレベルアップ。必要XPはレベルごとに増えます。1000レベルまで続く特別報酬(スキン・演出・称号)を集めよう。'],
    ['🏆', '実績とプロフィール', '実績を解放するとコインとXPがもらえます。隠し実績も…？ プロフィールで連続プレイ記録や統計を見られます。'],
    ['🎨', '自分好みに', 'テーマ(ダーク・レトロ・ウィンター)や、勝利演出・レベルアップ演出を選べます。<b>すべて</b>ボタンから探せます。']
  ];
  let tutoI = 0;
  function openTutorial(){
    goLobbyHide(); tutoI = 0; renderTuto();
  }
  function renderTuto(){
    const [ic, tt, tx] = TUTO[tutoI], last = tutoI === TUTO.length - 1;
    modalOpen('v43-tuto', `<div class="tu-box"><div class="tu-ic">${ic}</div><h2>${esc(tt)}</h2><p>${tx}</p>
      <div class="tu-dots">${TUTO.map((_, i)=> `<i class="${i === tutoI ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pf-btns"><button type="button" class="ghost-btn" id="tuSkip">${last ? '閉じる' : 'スキップ'}</button><button type="button" class="primary-btn" id="tuNext">${last ? 'はじめよう！' : '次へ'}</button></div></div>`);
    const m = CB().modal().el;
    m.querySelector('#tuSkip').addEventListener('click', endTuto);
    m.querySelector('#tuNext').addEventListener('click', ()=>{ if(last) endTuto(); else { tutoI++; renderTuto(); } });
  }
  function endTuto(){ store.tutorialDone = true; C.touch(); CB().closeModal(); if(CB().showTitle) CB().showTitle(); }

  /* ---------- 画面の行き先(ロビーのドック・☰メニュー・各画面のボタンから) ---------- */
  function go(what){
    switch(what){
      case 'profile': return openProfile();
      case 'achievements': return logged() ? openAchievements() : needLogin('実績');
      case 'collection': return openCollection();
      case 'stats': return openStats();
      case 'themes': return openThemes();
      case 'cloud': return openCloud();
      case 'tutorial': return openTutorial();
      case 'titles': { const b = $id('titleTitlesBtn'); if(b) b.click(); return; }
      case 'more': { const b = $id('lobbyMenuBtn'); if(b) b.click(); return; }
      case 'favorites': return window.CBMini && window.CBMini.open({ filter: 'fav' });          // ロビーは隠さない(ミニゲームの画面が上に重なる。閉じるとロビーに戻る)
      case 'recent': return window.CBMini && window.CBMini.open({ filter: 'recent' });
      case 'random': {
        const g = window.CBMini.games; const pick = g[Math.floor(Math.random() * g.length)];
        notify(`<span class="ach-tx"><b>🎲 ${esc(pick.emoji)} ${esc(pick.name)}</b></span>`, 'mini', 1500);
        return setTimeout(()=> window.CBMini.start(pick.id), 350);
      }
    }
  }
  document.addEventListener('click', (e)=>{
    const el = e.target.closest && e.target.closest('[data-v43]');
    if(!el) return;
    e.preventDefault();
    const what = el.dataset.v43;
    // ☰シートの項目は、シートが自分で閉じる。少しあとに開く(アニメが重ならないように)
    setTimeout(()=> go(what), el.closest('#quickSheetWrap') ? 90 : 0);
  });
  // 「記録・実績」ボタンは、新しい実績センターに差し替える(古い記録は実績センターの下のボタンから見られる)
  const recBtn = $id('titleRecordsBtn');
  if(recBtn) recBtn.addEventListener('click', (e)=>{ e.stopImmediatePropagation(); e.preventDefault(); CB().openRecordsOld(); }, true);

  /* ---------- ゲーム終了のフック(統計・実績・演出) ---------- */
  async function report(ev){
    if(!logged()) return null;
    try{
      const d = await CB().api('/api/v43/event', 'POST', ev);
      if(d.newAch && d.newAch.length) C.showAch(d.newAch);
      if(d.bonusCoins && CB().refreshFromServer) setTimeout(()=> CB().refreshFromServer(), 600);
      return d;
    }catch(e){ return null; }
  }
  function afterGame(){ if(window.CBWinterPass) setTimeout(()=> window.CBWinterPass.refresh(), 2600); }
  window.CBV43 = {
    openStats, openProfile, openAchievements, openCollection, openThemes, openCloud, openTutorial, go,
    refreshBadges(){ updateAchBadge(); if(window.CBWinterPass) window.CBWinterPass.refresh(true); },
    async onMiniEnd(r){
      const ai = !!(window.CBBot && window.CBBot.running());
      report({ game: r.game, kind: 'mini', score: r.score, rating: r.rating, ai });
      if(r.rating >= 100) setTimeout(()=> C.rareFx('⭐ 満点！パーフェクト'), 500);
      else if(r.newBest || r.rating >= 80) setTimeout(()=> C.victoryFx(r.newBest ? '<b>NEW BEST!</b>' : '<b>VICTORY!</b>'), 450);
      afterGame();
    },
    async onMainEnd(r){
      const ai = !!(window.CBBot && window.CBBot.running());
      report({ game: r.mode, kind: 'main', score: r.score, rating: 0, ai });
      setTimeout(()=>{
        const note = $id('newBestNote');
        if(note && /ハイスコア/.test(note.textContent || '')) C.victoryFx('<b>NEW RECORD!</b>');
        else if(/clear/.test(String(r.mode)) && Number(r.score) > 0) C.victoryFx('<b>CLEAR!</b>');
      }, 450);
      afterGame();
    }
  };

  /* ---------- ロビー: ウィンターパスの進み具合・クリスマスの予告・バッジの写し ---------- */
  function setupLobby(){
    const hero = document.querySelector('.lobby-hero'); if(!hero || $id('lobbyWpass')) return;
    const wp = document.createElement('button'); wp.type = 'button'; wp.id = 'lobbyWpass'; wp.className = 'lobby-wpass';
    wp.innerHTML = `<span class="lw-ic">❄</span><span class="lw-tx"><b>ウィンターパス</b><small id="lobbyWpassSub">ログインして参加</small></span><span class="lw-go">›</span>`;
    wp.addEventListener('click', ()=> { if(window.CBWinterPass) window.CBWinterPass.open(); });
    hero.parentNode.insertBefore(wp, hero);
    const xm = document.createElement('div'); xm.className = 'lobby-xmas'; xm.id = 'lobbyXmas';
    xm.innerHTML = '🎄 12月、クリスマスイベント開催予定 <small>準備中…</small>';
    hero.appendChild(xm);
  }
  async function refreshLobby(){
    const sub = $id('lobbyWpassSub'); if(!sub) return;
    if(!logged()){ sub.textContent = 'ログインして参加 ・ 1000レベルまで報酬'; return; }
    if(window.CBWinterPass){ await window.CBWinterPass.refresh(true); const s = window.CBWinterPass.state(); if(s) sub.textContent = `Lv.${fmt(s.level)} ・ 次まで ${fmt(Math.max(0, Number(s.xpPerLevel) - Number(s.xpIntoLevel)))} XP${Number(s.pendingCount) ? ` ・ 🎁${fmt(s.pendingCount)}件` : ''}`; }
  }
  const lobbyBadgeMirror = ()=>{
    const src = $id('lobbyChatBadge'), dst = $id('dockChatBadge');
    if(src && dst){ dst.classList.toggle('show', src.classList.contains('show')); dst.textContent = src.textContent; }
  };
  setInterval(lobbyBadgeMirror, 1000);

  // 起動後の流れ
  window.addEventListener('load', ()=>{
    setupLobby();
    C.applyTheme(store.theme);
    setTimeout(async ()=>{
      if(logged()){ await C.pullCloud(); await loadProfile(); }
      refreshLobby();
      if(!store.tutorialDone){ setTimeout(()=>{ if(!store.tutorialDone && !document.querySelector('#modalOverlay.show')) openTutorial(); }, 1200); }
    }, 1800);
    setInterval(()=>{ if(!document.hidden && !document.body.classList.contains('mg-open') && !(($id('titleScreen') || document.body).classList.contains('hidden'))) refreshLobby(); }, 60000);
  });
  // ログインした直後にも、クラウドを読み込む
  let wasLogged = false;
  setInterval(()=>{
    const now = logged();
    if(now && !wasLogged){ wasLogged = true; C.pullCloud().then(loadProfile).then(refreshLobby); }
    if(!now) wasLogged = false;
  }, 1500);
})();
