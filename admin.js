/* =====================================================================
   🔧 管理者パネル v2 — コマンドを選ぶ → 項目を選んで実行(文字入力は最小限)
   ・ユーザーは一覧から選ぶ / 数字は「−・＋」と金額ボタン / 種類はボタンや選択肢 / メッセージは定型文ボタン
   ・文字でコマンドを打ちたいときは、いちばん下の「⌨ 直接入力」
   ・window.AdminUI.open() で開く(script.js の 🔧 管理 ボタンから)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const el = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const esc = (s)=> String(s == null ? '' : s).replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const fmt = (n)=> Number(n || 0).toLocaleString('ja-JP');
  const mc = ()=> document.getElementById('modalContent');
  const mo = ()=> document.getElementById('modalOverlay');
  const api = (path, method, body)=> CB().api(path, method, body);
  const ok = (t)=> '✅ ' + t;
  const ng = (e)=> '❌ ' + ((e && e.message) || e);

  /* ---------- 定型文・金額ボタン(タイピングを減らすため) ---------- */
  const MSG_TEMPLATES = ['いつもありがとうございます！', '不具合のお詫びです', 'イベント報酬です', 'お誕生日おめでとう！', 'ログインボーナスです', '今後ともよろしくお願いします'];
  const ANN_TEMPLATES = ['メンテナンスを行います', '新しいイベントを開催中です！', 'アップデートしました', 'ご協力ありがとうございます'];
  const POLL_Q_TEMPLATES = ['次に追加してほしいものは？', '今のイベントはどうですか？', '好きなスキンは？', 'ガチャの演出は好きですか？'];
  const POLL_OPT_TEMPLATES = [['はい', 'いいえ'], ['賛成', '反対'], ['A', 'B', 'C'], ['とても良い', '良い', 'ふつう', '悪い']];
  const P_COINS = [100, 500, 1000, 5000, 10000, 50000, 100000];
  const P_COINS_PM = [-10000, -1000, -100, 100, 1000, 10000];
  const P_SMALL = [10, 50, 100, 300, 500, 1000];
  const P_XP = [100, 500, 1000, 3000, 5000, 10000];
  const P_SCORE = [0, 1000, 10000, 100000, 1000000];
  const MODES = [['soft', 'soft'], ['baked', 'baked'], ['hard', 'hard'], ['extreme', 'extreme'], ['tetris', 'テトリス'], ['timeattack', 'タイムアタック']];
  const RECUR = [['once', '一度だけ'], ['daily', '毎日'], ['weekly', '毎週'], ['monthly', '毎月']];
  const WEEKDAYS = [['0', '日'], ['1', '月'], ['2', '火'], ['3', '水'], ['4', '木'], ['5', '金'], ['6', '土']];
  const HOURS = Array.from({ length:24 }, (_, i)=> [String(i), `${i}時`]);
  const MINUTES = [['0', '00分'], ['15', '15分'], ['30', '30分'], ['45', '45分']];

  /* ---------- コマンド一覧(項目の定義 + 実行内容) ---------- */
  const COMMANDS = [
    { id:'gift', group:'👤 ユーザー', icon:'🎁', name:'ギフトを送る', desc:'メッセージ付きで、コイン・イベント通貨・XPを贈る',
      fields:[
        { key:'to', type:'user', label:'送り先', all:true },
        { key:'message', type:'text', label:'手紙のメッセージ', rows:3, max:300, templates:MSG_TEMPLATES },
        { key:'coins', type:'bignum', label:'🪙 コイン', presets:P_COINS },
        { key:'candies', type:'bignum', label:'🍬 イベント通貨', presets:P_SMALL },
        { key:'bpXp', type:'bignum', label:'❄ XP(ウィンターパス)', presets:P_XP },
        { key:'eventXp', type:'bignum', label:'🏁 イベントXP(ロードの進行)', presets:P_SMALL }
      ],
      summary:(v)=>{ const bf = (x)=> window.NXBig ? window.NXBig.full(x) : x; const has = (x)=> x && String(x) !== '0'; const it = [has(v.coins) && `🪙${bf(v.coins)}`, has(v.candies) && `🍬${bf(v.candies)}`, has(v.bpXp) && `❄XP ${bf(v.bpXp)}`, has(v.eventXp) && `🏁イベントXP ${bf(v.eventXp)}`].filter(Boolean);
        return `送り先: ${v.to === 'all' ? '全員' : (v.to || '(未選択)')} ／ 中身: ${it.length ? it.join(' ・ ') : '(未設定)'}`; },
      validate:(v)=> (![v.coins, v.candies, v.bpXp, v.eventXp].some(x=> x && String(x) !== '0') ? '贈るアイテムを1つ以上、設定してください' : null),
      confirm:(v)=> v.to === 'all' ? '全員にギフトを送ります。よろしいですか？' : null,
      run: async(v)=>{ try{ const d = await api('/api/admin/gift', 'POST', { to:v.to, message:v.message, coins:v.coins || '0', candies:v.candies || '0', bpXp:v.bpXp || '0', eventXp:v.eventXp || '0' });
        return ok(`ギフトを ${d.count}人 に送りました。受け取り側は、ログイン時/ゲームオーバー後に開封します。`); }catch(e){ return ng(e); } } },
    { id:'giftlist', group:'👤 ユーザー', icon:'📜', name:'ギフト履歴', desc:'送ったギフトの受け取り状況と、取り消し', view:'gifthist' },
    { id:'addcoins', group:'👤 ユーザー', icon:'🪙', name:'コインを増やす・減らす', desc:'いまの所持コインに加算(マイナスで減算)',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'amount', type:'number', label:'増減するコイン', presets:P_COINS_PM, step:100, min:-1000000000000 } ],
      validate:(v)=> (!v.amount ? '0以外の数を入れてください' : null),
      run:(v)=> CB().adminCommand(`/addcoins ${v.user} ${v.amount}`) },
    { id:'setcoins', group:'👤 ユーザー', icon:'💰', name:'コインをちょうどにする', desc:'所持コインを指定の数に設定',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'amount', type:'number', label:'コイン', presets:[0, ...P_COINS], step:100 } ],
      run:(v)=> CB().adminCommand(`/setcoins ${v.user} ${v.amount}`) },
    { id:'setscore', group:'👤 ユーザー', icon:'🏆', name:'スコアを設定', desc:'モードごとのベストスコアを設定',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'mode', type:'choice', label:'モード', options:MODES }, { key:'score', type:'number', label:'スコア', presets:P_SCORE, step:100 } ],
      run:(v)=> CB().adminCommand(`/setscore ${v.user} ${v.mode} ${v.score}`) },
    { id:'search', group:'👤 ユーザー', icon:'🔍', name:'ユーザー情報を見る', desc:'ベストスコア・コイン・最終ログインなど',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' } ], runLabel:'調べる',
      run:(v)=> CB().adminCommand(`/search ${v.user}`) },
    { id:'ban', group:'👤 ユーザー', icon:'🚫', name:'BAN / BAN解除', desc:'ユーザーのBANを切り替える',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'act', type:'choice', label:'操作', options:[['ban', '🚫 BANする'], ['unban', '✅ BANを解除']], def:'ban' } ],
      confirm:(v)=> v.act === 'ban' ? `${v.user} をBANします。よろしいですか？` : null,
      run:(v)=> CB().adminCommand(`/${v.act} ${v.user}`) },
    { id:'resetuser', group:'👤 ユーザー', icon:'♻️', name:'ユーザーをリセット', desc:'スコア・コイン・スキンを初期化(取り消し不可)', danger:true,
      fields:[ { key:'user', type:'user', label:'対象のユーザー' } ],
      confirm:(v)=> `${v.user} のデータを初期化します。取り消せません。`, run:(v)=> CB().adminCommand(`/resetuser ${v.user}`) },
    { id:'listusers', group:'👤 ユーザー', icon:'👥', name:'ユーザー一覧(上位20)', desc:'ベストスコア順(ID・表示名つき)', fields:[], runLabel:'表示', run:()=> CB().adminCommand('/listusers') },
    { id:'recovery', group:'👤 ユーザー', icon:'🔑', name:'復元コードを見る', desc:'そのユーザーのパスワード復元コードと、使用済みかどうか',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' } ], runLabel:'表示', run:(v)=> CB().adminCommand(`/recovery ${v.user}`) },
    { id:'recoverylist', group:'👤 ユーザー', icon:'🗝', name:'復元コード一覧', desc:'最近ログインした順に60人ぶん(ID・表示名つき)', fields:[], runLabel:'表示', run:()=> CB().adminCommand('/recoverylist') },
    { id:'reissue', group:'👤 ユーザー', icon:'🆕', name:'復元コードを再発行', desc:'新しいコードを作る(古いコードは使えなくなる・使用済みも有効に戻る)', danger:true,
      fields:[ { key:'user', type:'user', label:'対象のユーザー' } ],
      confirm:(v)=> `${v.user} の復元コードを再発行します。古いコードは使えなくなります。`, run:(v)=> CB().adminCommand(`/reissue ${v.user}`) },
    { id:'devices', group:'👤 ユーザー', icon:'📱', name:'登録端末を見る / 解除', desc:'端末(HWID)ログインで登録されている端末。解除すると、次回はパスワードが必要',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'act', type:'choice', label:'操作', options:[['devices', '📱 一覧を見る'], ['revokedevices', '🧹 全部解除']], def:'devices' } ],
      confirm:(v)=> v.act === 'revokedevices' ? `${v.user} の登録端末を全部解除します。` : null, run:(v)=> CB().adminCommand(`/${v.act} ${v.user}`) },

    { id:'announce', group:'📢 お知らせ・投票', icon:'📢', name:'お知らせを配信', desc:'全員に表示されるお知らせ',
      fields:[ { key:'text', type:'text', label:'お知らせの内容', rows:2, max:200, templates:ANN_TEMPLATES } ],
      confirm:()=> '全員にお知らせを配信します。', run:(v)=> CB().adminCommand(`/announce ${v.text.replace(/\s+/g, ' ')}`) },
    { id:'polls', group:'📢 お知らせ・投票', icon:'🗳', name:'投票を管理', desc:'質問の作成・編集・終了・削除・票のリセット', view:'polls' },

    { id:'eventadd', group:'⏰ 自動報酬イベント', icon:'➕', name:'自動報酬を追加', desc:'ランキング順位の人へ、決まった時間にコインを自動配布',
      fields:[
        { key:'rec', type:'choice', label:'いつ', options:RECUR, def:'daily' },
        { key:'date', type:'date', label:'日付', show:(v)=> v.rec === 'once' },
        { key:'weekday', type:'choice', label:'曜日', options:WEEKDAYS, def:'1', show:(v)=> v.rec === 'weekly' },
        { key:'day', type:'number', label:'毎月の日付(1〜31)', presets:[1, 10, 15, 20, 25], step:1, min:1, max:31, def:1, show:(v)=> v.rec === 'monthly' },
        { key:'hour', type:'select', label:'時(日本時間)', options:HOURS, def:'20' },
        { key:'minute', type:'select', label:'分', options:MINUTES, def:'0' },
        { key:'mode', type:'choice', label:'対象ランキング', options:MODES, def:'baked' },
        { key:'rank', type:'number', label:'何位の人に配る?', presets:[1, 2, 3, 5, 10], step:1, min:1, def:1 },
        { key:'coins', type:'number', label:'配るコイン', presets:P_COINS, step:100, def:500 }
      ],
      validate:(v)=> (v.rec === 'once' && !v.date ? '日付を選んでください' : null),
      run:(v)=>{ let y = 0, m = 0, d = 0;
        if(v.rec === 'once'){ [y, m, d] = v.date.split('-').map(Number); }
        else if(v.rec === 'weekly'){ d = Number(v.weekday); } else if(v.rec === 'monthly'){ d = Number(v.day); }
        return CB().adminCommand(`/eventadd ${v.rec} ${v.mode} ${v.rank} ${v.coins} ${y} ${m} ${d} ${v.hour} ${v.minute}`); } },
    { id:'eventlist', group:'⏰ 自動報酬イベント', icon:'📋', name:'登録済みの一覧', desc:'登録されている自動報酬イベントを表示', fields:[], runLabel:'表示', run:()=> CB().adminCommand('/eventlist') },
    { id:'eventremove', group:'⏰ 自動報酬イベント', icon:'🗑', name:'自動報酬を削除', desc:'IDを指定して削除(IDは「登録済みの一覧」で確認)',
      fields:[ { key:'id', type:'number', label:'イベントID', presets:[1, 2, 3, 4, 5], step:1, min:1, def:1 } ],
      confirm:(v)=> `イベント ${v.id} を削除します。`, run:(v)=> CB().adminCommand(`/eventremove ${v.id}`) },

    { id:'discordtest', group:'🖥 サーバー', icon:'📨', name:'外部通知の接続テスト', desc:'通知用Webhookの設定と、送信できるかを確認', fields:[], runLabel:'テスト', run:()=> CB().adminCommand('/discordtest') },
    { id:'imgbb', group:'🖥 サーバー', icon:'☁️', name:'imgBB 接続テスト', desc:'画像の保存先(imgBB)が使えているか、実際に1枚送って確かめる', fields:[], runLabel:'テスト', run:()=> CB().adminCommand('/imgbb') },
    { id:'imgbbkey', group:'🖥 サーバー', icon:'🔑', name:'imgBB APIキーを保存', desc:'Renderの環境変数で認識されないときの予備。キーをDBに保存します(環境変数があればそちらが優先)。消すときは clear と入力',
      fields:[ { key:'key', type:'text', label:'imgBB の APIキー(または clear)', rows:1, max:80 } ],
      confirm:(v)=> v.key.trim().toLowerCase() === 'clear' ? '保存したキーを削除します。' : 'このキーをサーバーに保存します。', run:(v)=> CB().adminCommand('/imgbbkey ' + v.key.trim()) },
    { id:'stats', group:'🖥 サーバー', icon:'📊', name:'サーバー統計', desc:'ユーザー数・総コイン・総プレイ時間', fields:[], runLabel:'表示', run:()=> CB().adminCommand('/stats') },
    { id:'safety', group:'🖥 サーバー', icon:'🛡', name:'セーフティモード', desc:'管理者アカウントの強制セーフティモードを切り替え',
      fields:[ { key:'mode', type:'choice', label:'設定', options:[['status', '状態を見る'], ['on', 'ONにする'], ['off', 'OFFにする']], def:'status' } ],
      run:(v)=> CB().adminCommand(v.mode === 'status' ? '/safety' : `/safety ${v.mode}`) },
    { id:'blocks', group:'🖥 サーバー', icon:'🧩', name:'ブロック出現設定', desc:'出現させないブロックの形を選ぶ', view:'blocks' },
    { id:'resetquests', group:'🖥 サーバー', icon:'🔁', name:'クエストをリセット', desc:'全ユーザーのクエスト進捗を初期化', danger:true, fields:[],
      confirm:()=> '全ユーザーのクエスト進捗をリセットします。', run:()=> CB().adminCommand('/resetquests') },
    { id:'setplaytime', group:'🖥 サーバー', icon:'⏱', name:'自分のプレイ時間を設定', desc:'管理者自身のプレイ時間(秒)',
      fields:[ { key:'sec', type:'number', label:'秒', presets:[0, 600, 3600, 36000], step:60 } ], run:(v)=> CB().adminCommand(`/setplaytime ${v.sec}`) },

    { id:'raw', group:'⌨ 上級者向け', icon:'⌨', name:'直接入力', desc:'コマンドを文字で入力して実行(例: /stats)',
      fields:[ { key:'cmd', type:'text', label:'コマンド', rows:1, max:300 } ], run:(v)=> CB().adminCommand(v.cmd.trim()) }
  ];

  /* ---------- 状態 ---------- */
  const formState = {};          // コマンドごとに入力値を覚える(ユーザー選択から戻っても消えない)
  let menuQuery = '';

  function defaults(cmd){
    const v = {};
    (cmd.fields || []).forEach(f=>{
      if(f.def !== undefined) v[f.key] = f.def;
      else if(f.type === 'bignum') v[f.key] = '';
      else if(f.type === 'number') v[f.key] = Math.max(f.min || 0, 0);
      else if(f.type === 'choice' || f.type === 'select') v[f.key] = f.options[0][0];
      else if(f.type === 'list') v[f.key] = Array.from({ length:f.min || 2 }, ()=>'');
      else if(f.type === 'toggle') v[f.key] = false;
      else v[f.key] = '';
    });
    return v;
  }
  function begin(){
    const root = mc(); root.dataset.mode = 'admin'; root.innerHTML = '';
    mo().classList.add('show');
    return root;
  }
  const backBtn = (label, fn)=>{ const b = el('button', 'adm-back', `‹ ${label}`); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const chip = (text, on, fn)=>{ const b = el('button', 'adm-chip' + (on ? ' on' : ''), esc(text)); b.type = 'button'; b.addEventListener('click', fn); return b; };

  /* ---------- メニュー(コマンド一覧) ---------- */
  function renderMenu(){
    const root = begin();
    root.append(el('h2', 'adm-h', '🔧 管理者コマンド'));
    root.append(el('div', 'sub', 'やりたいことを選んでください。入力はボタンと選択肢でできます。'));
    const search = el('input', 'adm-search'); search.type = 'search'; search.placeholder = '🔍 さがす(例: ギフト)'; search.value = menuQuery;
    root.append(search);
    const list = el('div', 'adm-menu'); root.append(list);
    function paint(){
      const q = search.value.trim().toLowerCase(); menuQuery = search.value; list.innerHTML = '';
      const groups = [...new Set(COMMANDS.map(c=>c.group))];
      let any = false;
      groups.forEach(g=>{
        const cs = COMMANDS.filter(c=> c.group === g && (!q || (c.name + c.desc + c.id).toLowerCase().includes(q)));
        if(!cs.length) return; any = true;
        list.append(el('div', 'adm-group', esc(g)));
        const grid = el('div', 'adm-grid');
        cs.forEach(c=>{
          const b = el('button', 'adm-card' + (c.danger ? ' danger' : ''), `<span class="ac-ic">${c.icon}</span><span class="ac-name">${esc(c.name)}</span><span class="ac-desc">${esc(c.desc)}</span>`);
          b.type = 'button'; b.addEventListener('click', ()=> openCommand(c)); grid.append(b);
        });
        list.append(grid);
      });
      if(!any) list.append(el('div', 'empty-hint', '見つかりません'));
    }
    search.addEventListener('input', paint); paint();
  }

  function openCommand(cmd){
    if(cmd.view === 'polls') return renderPolls();
    if(cmd.view === 'gifthist') return renderGiftHistory();
    if(cmd.view === 'blocks') return CB().openAdminBlocks && CB().openAdminBlocks();
    renderForm(cmd);
  }

  /* ---------- 入力フォーム ---------- */
  function validateAll(cmd, v){
    for(const f of (cmd.fields || [])){
      if(f.show && !f.show(v)) continue;
      if(f.type === 'user' && !v[f.key]) return `「${f.label}」を選んでください`;
      if(f.type === 'text' && !String(v[f.key] || '').trim()) return `「${f.label}」を入力してください`;
      if(f.type === 'bignum' && v[f.key] !== '' && !/^\d{1,300}$/.test(String(v[f.key]))) return `「${f.label}」は、数字だけ(300桁まで)で入力してください`;
      if(f.type === 'number' && f.max != null && v[f.key] > f.max) return `「${f.label}」は ${fmt(f.max)} 以下にしてください`;
      if(f.type === 'number' && f.min != null && v[f.key] < f.min) return `「${f.label}」は ${fmt(f.min)} 以上にしてください`;
    }
    return cmd.validate ? cmd.validate(v) : null;
  }

  function buildField(f, v, cmd, onChange){
    const wrap = el('div', 'adm-field'); wrap.dataset.key = f.key;
    wrap.append(el('div', 'adm-label', esc(f.label)));
    if(f.type === 'user'){
      const b = el('button', 'adm-userbtn'); b.type = 'button';
      const label = v[f.key] === 'all' ? '全員' : v[f.key];
      b.innerHTML = v[f.key] ? `👤 <b>${esc(label)}</b><span>変更 ▾</span>` : '👤 ユーザーを選ぶ ▾';
      b.classList.toggle('empty', !v[f.key]);
      b.addEventListener('click', ()=> renderUserPicker(cmd, f));
      wrap.append(b);
    } else if(f.type === 'bignum'){
      // 桁数の制限なし(300桁まで)。数ではなく「文字列」のまま扱うので、何桁でも丸まらない
      const row = el('div', 'adm-num'); const inp = el('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.autocomplete = 'off'; inp.placeholder = '0(数字だけ。例: 5000000000000000000000)'; inp.value = v[f.key] || '';
      const clean = (t)=> String(t).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 300);
      const set = (t)=>{ v[f.key] = clean(t); inp.value = v[f.key]; onChange(); };
      inp.addEventListener('input', ()=> set(inp.value));
      row.append(inp); wrap.append(row);
      const info = el('div', 'sub', ''); info.style.cssText = 'margin-top:4px;font-size:11px;'; wrap.append(info);
      const upd = ()=>{ info.textContent = v[f.key] ? `= ${window.NXBig ? window.NXBig.full(v[f.key]) : v[f.key]}(${String(v[f.key]).length}桁)` : ''; };
      inp.addEventListener('input', upd); upd();
      if(f.presets){ const pr = el('div', 'adm-presets'); f.presets.forEach(p=> pr.append(chip(fmt(p), false, ()=>{ set(String(p)); upd(); })));
        ['1000000000000', '1000000000000000000', '1' + '0'.repeat(30), '1' + '0'.repeat(100)].forEach(t=> pr.append(chip('10^' + (t.length - 1), false, ()=>{ set(t); upd(); })));
        wrap.append(pr); }
    } else if(f.type === 'number'){
      const min = f.min != null ? f.min : 0, max = f.max != null ? f.max : 1e12, step = f.step || 1;
      const row = el('div', 'adm-num'); const minus = el('button', 'adm-step', '−'), plus = el('button', 'adm-step', '＋'), inp = el('input');
      minus.type = plus.type = 'button'; inp.type = 'number'; inp.inputMode = 'numeric'; inp.value = v[f.key];
      const set = (n)=>{ n = Math.max(min, Math.min(max, Math.round(Number(n) || 0))); v[f.key] = n; inp.value = n; onChange(); };
      minus.addEventListener('click', ()=> set(v[f.key] - step)); plus.addEventListener('click', ()=> set(v[f.key] + step));
      inp.addEventListener('input', ()=>{ v[f.key] = Math.max(min, Math.min(max, Math.round(Number(inp.value) || 0))); onChange(); });
      row.append(minus, inp, plus); wrap.append(row);
      if(f.presets){ const pr = el('div', 'adm-presets'); f.presets.forEach(p=> pr.append(chip((p > 0 && min < 0 ? '+' : '') + fmt(p), false, ()=> set(p)))); wrap.append(pr); }
    } else if(f.type === 'choice'){
      const row = el('div', 'adm-chips');
      f.options.forEach(([val, label])=>{ row.append(chip(label, v[f.key] === val, ()=>{ v[f.key] = val; [...row.children].forEach((c,i)=> c.classList.toggle('on', f.options[i][0] === val)); onChange(); })); });
      wrap.append(row);
    } else if(f.type === 'select'){
      const s = el('select', 'adm-select'); f.options.forEach(([val, label])=>{ const o = el('option'); o.value = val; o.textContent = label; if(v[f.key] === val) o.selected = true; s.append(o); });
      s.addEventListener('change', ()=>{ v[f.key] = s.value; onChange(); }); wrap.append(s);
    } else if(f.type === 'date'){
      const d = el('input', 'adm-date'); d.type = 'date'; d.value = v[f.key] || ''; d.addEventListener('change', ()=>{ v[f.key] = d.value; onChange(); }); wrap.append(d);
    } else if(f.type === 'text'){
      const ta = el(f.rows > 1 ? 'textarea' : 'input', 'adm-text'); if(f.rows > 1) ta.rows = f.rows; ta.maxLength = f.max || 300; ta.value = v[f.key] || '';
      ta.addEventListener('input', ()=>{ v[f.key] = ta.value; onChange(); }); wrap.append(ta);
      if(f.templates){ const pr = el('div', 'adm-presets'); f.templates.forEach(t=> pr.append(chip(t, false, ()=>{ ta.value = t; v[f.key] = t; onChange(); }))); wrap.append(pr); }
    }
    return wrap;
  }

  function renderForm(cmd){
    const v = formState[cmd.id] || (formState[cmd.id] = defaults(cmd));
    const root = begin();
    root.append(backBtn('コマンド一覧', renderMenu));
    root.append(el('h2', 'adm-h', `${cmd.icon} ${esc(cmd.name)}`));
    root.append(el('div', 'sub', esc(cmd.desc)));
    const form = el('div', 'adm-form'); root.append(form);
    const sum = el('div', 'adm-summary'); const out = el('div', 'adm-result'); out.style.display = 'none';
    const fields = (cmd.fields || []).map(f=>({ f, wrap:null }));
    function refresh(){
      fields.forEach(x=>{ if(x.f.show) x.wrap.style.display = x.f.show(v) ? '' : 'none'; });
      sum.textContent = cmd.summary ? cmd.summary(v) : ''; sum.style.display = cmd.summary ? '' : 'none';
    }
    fields.forEach(x=>{ x.wrap = buildField(x.f, v, cmd, refresh); form.append(x.wrap); });
    const runBtn = el('button', 'primary-btn adm-run' + (cmd.danger ? ' danger' : ''), esc(cmd.runLabel || '実行')); runBtn.type = 'button';
    root.append(sum, runBtn, out);
    refresh();
    let armed = false, armTimer = null;
    const showOut = (text, kind)=>{ out.style.display = ''; out.className = 'adm-result ' + kind; out.textContent = text; };
    runBtn.addEventListener('click', async ()=>{
      const err = validateAll(cmd, v);
      if(err){ showOut('⚠ ' + err, 'ng'); return; }
      const need = cmd.confirm ? cmd.confirm(v) : null;
      if(need && !armed){                                              // 危険な操作は「もう一度押して実行」
        armed = true; runBtn.textContent = '⚠ もう一度押して実行'; showOut('⚠ ' + need, 'warn');
        clearTimeout(armTimer); armTimer = setTimeout(()=>{ armed = false; runBtn.textContent = cmd.runLabel || '実行'; }, 4500); return;
      }
      armed = false; clearTimeout(armTimer); runBtn.disabled = true; runBtn.textContent = '⏳ 実行中...';
      let res; try{ res = await cmd.run(v); }catch(e){ res = ng(e); }
      runBtn.disabled = false; runBtn.textContent = cmd.runLabel || '実行';
      res = String(res || '');
      showOut(res, res.startsWith('❌') ? 'ng' : 'ok');
      if(!res.startsWith('❌') && CB().sound) CB().sound('coin');
    });
  }

  /* ---------- ユーザーを選ぶ ---------- */
  function renderUserPicker(cmd, f){
    const root = begin();
    root.append(backBtn('戻る', ()=> renderForm(cmd)));
    root.append(el('h2', 'adm-h', '👤 ユーザーを選ぶ'));
    const search = el('input', 'adm-search'); search.type = 'search'; search.placeholder = '🔍 IDか表示名で絞り込み(入力は任意)'; root.append(search);
    if(f.all){ const all = el('button', 'adm-user all', '<span class="au-id">🌍 全員</span><span class="au-sub">BANされていない全ユーザー</span>'); all.type = 'button';
      all.addEventListener('click', ()=>{ formState[cmd.id][f.key] = 'all'; renderForm(cmd); }); root.append(all); }
    const list = el('div', 'adm-users'); root.append(list);
    let t = null, seq = 0;
    async function load(q){
      const my = ++seq; list.innerHTML = '<div class="empty-hint">読み込み中...</div>';
      try{
        const d = await api('/api/admin/users?q=' + encodeURIComponent(q || ''));
        if(my !== seq) return;
        list.innerHTML = '';
        if(!d.users.length){ list.innerHTML = '<div class="empty-hint">該当するユーザーがいません</div>'; return; }
        d.users.forEach(u=>{
          const b = el('button', 'adm-user', `<span class="au-id">${esc(u.name || u.id)}${u.name ? ` <small>@${esc(u.id)}</small>` : ''}${u.banned ? ' <em>BAN中</em>' : ''}</span><span class="au-sub">🏆 ${fmt(u.bestScore)} ／ 🪙 ${fmt(u.coins)}</span>`);
          b.type = 'button'; b.addEventListener('click', ()=>{ formState[cmd.id][f.key] = u.id; renderForm(cmd); }); list.append(b);
        });
      }catch(e){ if(my === seq) list.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; }
    }
    search.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=> load(search.value.trim()), 250); });
    load('');
  }

  /* ---------- 投票を管理 ---------- */
  async function renderPolls(){
    const root = begin();
    root.append(backBtn('コマンド一覧', renderMenu));
    root.append(el('h2', 'adm-h', '🗳 投票を管理'));
    const add = el('button', 'primary-btn', '＋ 新しい質問をつくる'); add.type = 'button'; add.addEventListener('click', ()=> renderPollForm(null)); root.append(add);
    const list = el('div', 'adm-polllist', '<div class="empty-hint">読み込み中...</div>'); root.append(list);
    let polls = [];
    try{ polls = (await api('/api/polls')).polls || []; }catch(e){ list.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; return; }
    list.innerHTML = polls.length ? '' : '<div class="empty-hint">まだ質問がありません</div>';
    polls.forEach(p=>{
      const card = el('div', 'adm-poll' + (p.closed ? ' closed' : ''));
      card.append(el('div', 'ap-q', esc(p.question)));
      card.append(el('div', 'ap-meta', `${p.closed ? '🔒 終了' : '🟢 受付中'} ／ 計${p.total}票 ／ ` + p.options.map(o=>`${esc(o.text)} ${o.votes}`).join(' ・ ')));
      const act = el('div', 'ap-act');
      const mk = (label, fn, cls)=>{ const b = el('button', 'adm-mini ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); act.append(b); return b; };
      mk('👀 投票の詳細', ()=> renderPollVoters(p));
      mk('✏️ 編集', ()=> renderPollForm(p));
      mk(p.closed ? '▶ 再開' : '⏹ 終了', async ()=>{ try{ await api('/api/admin/poll/close', 'POST', { id:p.id, closed:!p.closed }); renderPolls(); }catch(e){ alert(e.message); } });
      mk('🧹 票をリセット', async function(){ if(!confirmTap(this, '本当にリセット')) return; try{ await api('/api/admin/poll/reset', 'POST', { id:p.id }); renderPolls(); }catch(e){ alert(e.message); } });
      mk('🗑 削除', async function(){ if(!confirmTap(this, '本当に削除')) return; try{ await api('/api/admin/poll/delete', 'POST', { id:p.id }); renderPolls(); }catch(e){ alert(e.message); } }, 'danger');
      card.append(act); list.append(card);
    });
  }
  /* ---------- 投票の詳細: どのアカウントが、どれに投票したか ---------- */
  async function renderPollVoters(p){
    const root = begin();
    root.append(backBtn('投票の管理', renderPolls));
    root.append(el('h2', 'adm-h', '👀 投票の詳細'));
    root.append(el('div', 'ap-q', esc(p.question)));
    const find = el('input', 'adm-voter-find'); find.type = 'search'; find.placeholder = '🔍 アカウントで探す(何に投票したか表示)'; find.autocomplete = 'off';
    const found = el('div', 'adm-voter-found'); const box = el('div', 'adm-voters', '<div class="empty-hint">読み込み中...</div>');
    root.append(find, found, box);
    let d;
    try{ d = await api(`/api/admin/poll/${p.id}/voters`); }catch(e){ box.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; return; }
    const when = (iso)=>{ if(!iso) return ''; const t = new Date(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
      return isNaN(t) ? '' : t.toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }); };
    root.insertBefore(el('div', 'ap-meta', `${d.closed ? '🔒 終了' : '🟢 受付中'} ／ 計${d.total}票(時刻は日本時間)`), find);
    box.innerHTML = '';
    d.options.forEach((o, i)=>{
      const card = el('div', 'adm-vopt');
      card.append(el('div', 'avo-h', `<span class="avo-t">${i + 1}. ${esc(o.text)}</span><b>${o.voters.length}票</b>`));
      const list = el('div', 'avo-list');
      if(!o.voters.length) list.append(el('span', 'avo-none', 'まだ誰も投票していません'));
      o.voters.forEach(v=>{ const c = el('span', 'avo-chip', `${esc(v.id)}<small>${esc(when(v.at))}</small>`); c.dataset.uid = v.id.toLowerCase(); list.append(c); });
      card.append(list); box.append(card);
    });
    find.addEventListener('input', ()=>{
      const q = find.value.trim().toLowerCase(); found.innerHTML = '';
      box.querySelectorAll('.avo-chip').forEach(c=> c.classList.toggle('hit', !!q && c.dataset.uid.includes(q)));
      if(!q) return;
      const hits = [];
      d.options.forEach((o, i)=> o.voters.forEach(v=>{ if(v.id.toLowerCase().includes(q)) hits.push(`<b>${esc(v.id)}</b> → ${i + 1}. ${esc(o.text)}`); }));
      found.innerHTML = hits.length ? hits.slice(0, 10).join('<br>') : '投票していない、または見つかりません';
    });
  }
  // ボタンを2回押さないと実行されない(押し間違い防止)。1回目はラベルが変わるだけ
  function confirmTap(btn, label){
    if(btn.dataset.armed === '1') return true;
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = '⚠ ' + label;
    setTimeout(()=>{ btn.dataset.armed = ''; btn.textContent = old; }, 3500);
    return false;
  }

  function renderPollForm(poll){
    const root = begin();
    root.append(backBtn('投票の一覧', renderPolls));
    root.append(el('h2', 'adm-h', poll ? '✏️ 質問を編集' : '＋ 新しい質問'));
    const st = { q: poll ? poll.question : '', opts: poll ? poll.options.map(o=>o.text) : ['', ''] };
    // 質問
    const qf = el('div', 'adm-field'); qf.append(el('div', 'adm-label', '質問'));
    const qi = el('textarea', 'adm-text'); qi.rows = 2; qi.maxLength = 120; qi.value = st.q; qi.addEventListener('input', ()=>{ st.q = qi.value; }); qf.append(qi);
    const qt = el('div', 'adm-presets'); POLL_Q_TEMPLATES.forEach(t=> qt.append(chip(t, false, ()=>{ qi.value = t; st.q = t; }))); qf.append(qt); root.append(qf);
    // 選択肢
    const of = el('div', 'adm-field'); of.append(el('div', 'adm-label', '選択肢(2〜8個)'));
    const box = el('div', 'adm-list'); of.append(box);
    const tt = el('div', 'adm-presets'); POLL_OPT_TEMPLATES.forEach(t=> tt.append(chip(t.join(' / '), false, ()=>{ st.opts = t.slice(); paint(); })));
    of.append(el('div', 'adm-sublabel', 'よく使う選択肢(タップでセット)')); of.append(tt); root.append(of);
    function paint(){
      box.innerHTML = '';
      st.opts.forEach((t, i)=>{
        const r = el('div', 'adm-listrow'); const inp = el('input'); inp.placeholder = `選択肢${i + 1}`; inp.maxLength = 40; inp.value = t;
        inp.addEventListener('input', ()=>{ st.opts[i] = inp.value; });
        const rm = el('button', 'adm-step', '✕'); rm.type = 'button'; rm.addEventListener('click', ()=>{ if(st.opts.length > 2){ st.opts.splice(i, 1); paint(); } });
        r.append(inp, rm); box.append(r);
      });
      if(st.opts.length < 8){ const a = el('button', 'adm-mini', '＋ 選択肢を追加'); a.type = 'button'; a.addEventListener('click', ()=>{ st.opts.push(''); paint(); }); box.append(a); }
    }
    paint();
    if(poll && poll.total > 0) root.append(el('div', 'adm-note', '⚠ すでに票があります。選択肢の数を減らすと、消した選択肢への票は消えます。'));
    const out = el('div', 'adm-result'); out.style.display = 'none';
    const save = el('button', 'primary-btn adm-run', poll ? '保存する' : '作成する'); save.type = 'button';
    save.addEventListener('click', async ()=>{
      save.disabled = true;
      try{
        const body = { question: st.q, options: st.opts };
        if(poll){ body.id = poll.id; await api('/api/admin/poll/update', 'POST', body); } else await api('/api/admin/poll/create', 'POST', body);
        if(CB().sound) CB().sound('coin');
        renderPolls();
      }catch(e){ out.style.display = ''; out.className = 'adm-result ng'; out.textContent = '❌ ' + e.message; save.disabled = false; }
    });
    root.append(save, out);
  }

  /* ---------- ギフト履歴 ---------- */
  async function renderGiftHistory(){
    const root = begin();
    root.append(backBtn('コマンド一覧', renderMenu));
    root.append(el('h2', 'adm-h', '📜 ギフト履歴'));
    const list = el('div', 'adm-polllist', '<div class="empty-hint">読み込み中...</div>'); root.append(list);
    try{
      const d = await api('/api/admin/gifts');
      list.innerHTML = d.gifts.length ? '' : '<div class="empty-hint">まだギフトを送っていません</div>';
      d.gifts.forEach(g=>{
        const items = [g.coins && `🪙${fmt(g.coins)}`, g.candies && `🍬${fmt(g.candies)}`, g.bpXp && `🎫${fmt(g.bpXp)}`, g.eventXp && `🏁${fmt(g.eventXp)}`].filter(Boolean).join(' ');
        const card = el('div', 'adm-poll');
        card.append(el('div', 'ap-q', `${g.to === 'all' ? '🌍 全員' : '👤 ' + esc(g.to)} ← ${items}`));
        card.append(el('div', 'ap-meta', `「${esc(String(g.message).slice(0, 40))}」 ／ 受け取り ${g.claimed}/${g.total}`));
        if(g.claimed < g.total){
          const act = el('div', 'ap-act'); const b = el('button', 'adm-mini danger', '🚫 未受け取り分を取り消す'); b.type = 'button';
          b.addEventListener('click', async function(){ if(!confirmTap(this, '本当に取り消す')) return; try{ await api('/api/admin/gift/cancel', 'POST', { batch:g.batch }); renderGiftHistory(); }catch(e){ alert(e.message); } });
          act.append(b); card.append(act);
        }
        list.append(card);
      });
    }catch(e){ list.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; }
  }

  window.AdminUI = { open: renderMenu, _commands: COMMANDS };
})();

/* =====================================================================
   🎃 ハロウィン パート2 (v3.6) — 新しいタブの画面 / さまようおばけ / ボーナスバー
   ・script.js の ハロウィンウィンドウ から呼ばれる(window.HW2)。サーバーAPIは /api/event/halloween/*
   ・各タブ: 🚪ドア(トリック・オア・トリート+おみくじ) 🌱畑 📖図鑑 🎪スタンプ 🌍みんなで
   ===================================================================== */
(function(){
  'use strict';
  const TABS = ['part3', 'raid', 'tot', 'patch', 'dex', 'stamps', 'community'];
  const RARITY = { common:['ふつう', '#9fb0c8'], rare:['レア', '#5c9dff'], epic:['エピック', '#c25bff'], legendary:['伝説', '#ffc02e'] };
  const KIND_EMO = { candies:'🍬', coins:'🪙', ticket:'🎟', trick:'🤡', dex:'📖', jackpot:'🎰' };
  const fmtTime = (sec)=>{
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    return h ? `${h}時間${String(m).padStart(2,'0')}分` : (m ? `${m}分${String(s).padStart(2,'0')}秒` : `${s}秒`);
  };
  const rewardsText = (ctx, list)=> list.map(r=> ctx.rewardText(r)).join(' + ');
  let patchTimer = 0;

  // ---------- ホームの上に出すもの(ボーナスタイム / ハロウィンまでのカウントダウン / おすすめ) ----------
  function boostBar(s){
    if(!s.boost || !s.boost.label) return '';
    return `<div class="hw2-boost"><span class="b-ic">⚡</span><b>${s.boost.label}</b></div>`;
  }
  function homeTop(s, ctx){
    const d = s.daysToHalloween;
    const count = d > 0 ? `🎃 ハロウィンまで あと <b>${d}</b> 日` : (d === 0 ? '🎃 <b>今日はハロウィン当日！</b> キャンディ3倍！' : '🎃 ハロウィンは終わったけど、まだまだ遊べるよ');
    const todo = [];
    const b = s.badges || {};
    if(b.home) todo.push(['home', '🎁 ログインボーナス']);
    if(b.tot) todo.push(['tot', '🚪 ドア / おみくじ']);
    if(b.patch) todo.push(['patch', '🌱 畑']);
    if(b.missions) todo.push(['missions', '📋 ミッション報酬']);
    if(b.road) todo.push(['road', '🛤 ロード報酬']);
    if(b.dex) todo.push(['dex', '📖 図鑑報酬']);
    if(b.stamps) todo.push(['stamps', '🎪 スタンプ報酬']);
    return `<div class="hw2-count">${count}</div>
      ${todo.length ? `<div class="hw2-todo"><div class="t-h">📌 今日のおすすめ</div>${todo.map(([k,l])=>`<button type="button" class="t-chip" data-hwgo="${k}">${l}<i>!</i></button>`).join('')}</div>` : `<div class="hw2-todo done"><div class="t-h">✅ 今日のやることは全部おわり！</div></div>`}`;
  }

  // ---------- 🚪 ドア + おみくじ ----------
  function fortuneHtml(s){
    const f = s.fortune;
    if(f){
      return `<div class="hw2-card ft">
        <div class="hw2-ct">🔮 きょうのおみくじ</div>
        <div class="ft-rank r-${f.rank}">${f.rank}</div>
        <div class="ft-text">${f.text}</div>
        <div class="ft-lucky"><span>🍀 ラッキーアイテム <b>${f.item}</b></span><span>🎨 ラッキーカラー <b>${f.color}</b></span><span>🔢 ラッキーナンバー <b>${f.number}</b></span></div>
        <div class="ft-got">🍬 +${f.candies} もらった！ また明日引けるよ</div></div>`;
    }
    return `<div class="hw2-card ft"><div class="hw2-ct">🔮 きょうのおみくじ <span class="hw2-tag">1日1回・無料</span></div>
      <div class="sub">引くとキャンディがもらえます。大吉なら🍬80！</div>
      <button class="primary-btn" id="hw2Fortune" type="button">🔮 おみくじを引く</button></div>`;
  }
  function totHtml(s, ctx){
    const t = s.tot, left = Math.max(0, t.max - t.used), free = t.freeLeft > 0;
    const can = ctx.active() && left > 0 && (free || s.candies >= t.cost);
    const doors = [0,1,2].map(i=>`<button type="button" class="hw2-door" data-door="${i}" ${can ? '' : 'disabled'}><span class="d-face">🚪</span><span class="d-n">${i+1}</span></button>`).join('');
    return `${fortuneHtml(s)}
      <div class="hw2-card tot">
        <div class="hw2-ct">🚪 トリック・オア・トリート <span class="hw2-tag">${free ? '今日の1回目は無料' : `🍬${t.cost}で開けられる`}</span></div>
        <div class="sub">3つのドアから1つえらぼう。お菓子？ いたずら？ ときどき…おばけが遊びに来ます。</div>
        <div class="hw2-doors" id="hw2Doors">${doors}</div>
        <div class="hw2-door-msg" id="hw2DoorMsg">${can ? 'どのドアを開ける？' : (left <= 0 ? '今日はおしまい。また明日！' : (ctx.active() ? `キャンディが足りません(🍬${t.cost}必要)` : '開催期間外です'))}</div>
        <div class="sub" style="text-align:center;">今日あと ${left} 回(1日 ${t.max} 回まで)</div>
        <details class="hw2-det"><summary>出るもの一覧を見る</summary><ul>${t.table.map(x=>`<li>${x.title}</li>`).join('')}</ul></details>
      </div>
      <div class="hw2-card ghost"><div class="hw2-ct">👻 さまようおばけ <span class="hw2-tag">今日あと ${s.ghost.left} 匹</span></div>
        <div class="sub">ロビー画面に、ときどきおばけが飛んできます。タップでつかまえるとキャンディがもらえる！金色のおばけは大当たり(🍬45)。</div></div>`;
  }
  function bindTot(root, s, ctx){
    const f = root.querySelector('#hw2Fortune');
    if(f) f.addEventListener('click', async ()=>{
      f.disabled = true;
      try{ const d = await ctx.api('fortune', 'POST'); ctx.applyWallet(d); ctx.sound('win'); await ctx.refresh(`🔮 ${d.fortune.rank}！ 🍬+${d.fortune.candies}`); }
      catch(err){ alert(err.message); f.disabled = false; }
    });
    root.querySelectorAll('.hw2-door').forEach(btn=> btn.addEventListener('click', async ()=>{
      const door = +btn.dataset.door, msg = root.querySelector('#hw2DoorMsg');
      root.querySelectorAll('.hw2-door').forEach(b=> b.disabled = true);
      btn.classList.add('opening'); ctx.sound('whoosh');
      try{
        const d = await ctx.api('tot/open', 'POST', { door });
        ctx.applyWallet(d);
        const doors = root.querySelectorAll('.hw2-door');
        d.doors.forEach((x,i)=>{ doors[i].classList.add(i === door ? 'chosen' : 'other'); doors[i].querySelector('.d-face').textContent = KIND_EMO[x.kind] || '🎁'; });
        const r = d.result, parts = [];
        if(r.give.candies) parts.push(`🍬+${r.give.candies}`);
        if(r.give.coins) parts.push(`🪙+${r.give.coins.toLocaleString()}`);
        if(r.give.tickets) parts.push(`🎟×${r.give.tickets}`);
        if(r.dex) parts.push(r.dex.new ? `📖 ${r.dex.emoji}${r.dex.name} を図鑑に登録！` : `📖 ${r.dex.emoji}${r.dex.name}(もう友だち→🍬+${r.dex.candies})`);
        msg.innerHTML = `<b>${r.title}</b><br>${parts.join('　')}`;
        msg.classList.add('hit');
        ctx.sound(r.kind === 'jackpot' || r.kind === 'ticket' ? 'win' : (r.kind === 'trick' ? 'bad' : 'coin'));
        ctx.silentRefresh();
        const again = document.createElement('button'); again.type = 'button'; again.className = 'claim-btn'; again.textContent = 'もう1回ひらく / 画面を更新'; again.style.marginTop = '10px';
        again.addEventListener('click', ()=> ctx.rerender());
        msg.after(again);
      }catch(err){ alert(err.message); ctx.rerender(); }
    }));
  }

  // ---------- 🌱 かぼちゃ畑 ----------
  function patchHtml(s, ctx){
    const now = ctx.nowSec(), P = s.patch;
    const ripe = P.plots.filter(p=> !p.empty && now >= p.readyAt).length;
    const plots = P.plots.map(p=>{
      if(p.empty) return `<div class="hw2-plot empty"><div class="p-ic">🟫</div><div class="p-nm">あいている畑</div><button class="claim-btn" data-plant="${p.idx}" type="button">🌱 植える</button></div>`;
      const k = P.kinds.find(x=>x.id === p.kind) || P.kinds[0], total = k.sec, left = p.readyAt - now, pct = Math.max(0, Math.min(100, (1 - left/total)*100));
      return left <= 0
        ? `<div class="hw2-plot ripe"><div class="p-ic big">${p.emoji}</div><div class="p-nm">${p.name}</div><div class="p-st">🎉 しゅうかくOK！ 🍬${p.candies}</div><button class="primary-btn" data-harvest="${p.idx}" type="button">収穫する</button></div>`
        : `<div class="hw2-plot grow" data-ready="${p.readyAt}" data-total="${total}"><div class="p-ic">${pct < 40 ? '🌱' : '🌿'}</div><div class="p-nm">${p.name}</div><div class="p-bar"><i style="width:${pct}%"></i></div><div class="p-st" data-left>あと ${fmtTime(left)}</div></div>`;
    }).join('');
    return `<div class="hw2-card"><div class="hw2-ct">🌱 かぼちゃ畑 <span class="hw2-tag">時間がたつと実る</span></div>
      <div class="sub">植えておけば、アプリを閉じていても育ちます。あとで収穫してキャンディをゲット！</div>
      <button class="primary-btn" id="hw2HarvestAll" type="button" ${ripe ? '' : 'disabled'} style="margin:8px 0;">🧺 まとめて収穫${ripe ? `(${ripe}個)` : ''}</button>
      <div class="hw2-plots" id="hw2Plots">${plots}</div></div>
      <div class="hw2-card"><div class="hw2-ct">🎃 かぼちゃの種類</div>
      <div class="hw2-kinds">${P.kinds.map(k=>`<div class="k"><span class="k-e">${k.emoji}</span><b>${k.name}</b><span>${fmtTime(k.sec)}</span><span>🍬${k.candies}</span></div>`).join('')}</div>
      <div class="sub">長く育てるほど、お得。寝る前にゴールデンを植えるのがおすすめ！</div></div>`;
  }
  function bindPatch(root, s, ctx){
    const run = async (path, body, okMsg)=>{
      try{ const d = await ctx.api(path, 'POST', body); ctx.applyWallet(d); ctx.sound('coin'); await ctx.refresh(okMsg ? okMsg(d) : ''); }
      catch(err){ alert(err.message); }
    };
    root.querySelectorAll('[data-plant]').forEach(b=> b.addEventListener('click', ()=>{
      const idx = +b.dataset.plant, box = b.closest('.hw2-plot');
      box.innerHTML = `<div class="p-nm">なにを植える？</div>` + s.patch.kinds.map(k=>`<button class="claim-btn kind" data-kind="${k.id}" type="button">${k.emoji}${k.name}<small>${fmtTime(k.sec)} → 🍬${k.candies}</small></button>`).join('');
      box.querySelectorAll('[data-kind]').forEach(kb=> kb.addEventListener('click', ()=> run('patch/plant', { plot: idx, kind: kb.dataset.kind }, ()=> '🌱 植えました！ 育つのを待とう')));
    }));
    root.querySelectorAll('[data-harvest]').forEach(b=> b.addEventListener('click', ()=> run('patch/harvest', { plot: +b.dataset.harvest }, d=> `🧺 収穫！ 🍬+${d.gained}`)));
    const all = root.querySelector('#hw2HarvestAll');
    if(all) all.addEventListener('click', ()=> run('patch/harvest', { all: true }, d=> `🧺 ${d.harvested}個 収穫！ 🍬+${d.gained}`));
    clearInterval(patchTimer);
    patchTimer = setInterval(()=>{
      const wrap = document.getElementById('hw2Plots');
      if(!wrap){ clearInterval(patchTimer); return; }
      let need = false;
      wrap.querySelectorAll('.hw2-plot.grow').forEach(el=>{
        const left = +el.dataset.ready - ctx.nowSec(), total = +el.dataset.total;
        if(left <= 0){ need = true; return; }
        el.querySelector('[data-left]').textContent = `あと ${fmtTime(left)}`;
        el.querySelector('.p-bar i').style.width = Math.max(0, Math.min(100, (1 - left/total)*100)) + '%';
      });
      if(need){ clearInterval(patchTimer); ctx.rerender(); }
    }, 1000);
  }

  // ---------- 📖 図鑑 ----------
  function dexHtml(s, ctx){
    const D = s.dex, own = new Set(D.owned);
    const cards = s.dexList.map(c=>{
      const has = own.has(c.id), r = RARITY[c.rarity];
      return `<div class="hw2-dex ${has ? 'has' : 'no'}" style="--rc:${r[1]}"><div class="dx-e">${has ? c.emoji : '❔'}</div><div class="dx-n">${has ? c.name : '？？？'}</div><div class="dx-r">${r[0]}</div></div>`;
    }).join('');
    const ready = D.steps.filter(x=> x.reached && !x.claimed).length;
    const steps = D.steps.map(x=>`<div class="hw2-step ${x.claimed ? 'claimed' : (x.reached ? 'ready' : '')}"><div class="st-n">${x.need}<small>種</small></div><div class="st-r">${ctx.rewardText(x.reward)}</div>
      <div class="st-a">${x.claimed ? '<span class="hw-done">済</span>' : (x.reached ? `<button class="claim-btn" data-dexclaim="${x.need}" type="button">受け取る</button>` : `<span class="hw-lock">あと${x.need - D.owned.length}</span>`)}</div></div>`).join('');
    return `<div class="hw2-card"><div class="hw2-ct">📖 おばけ図鑑 <span class="hw2-tag">${D.owned.length} / ${D.total}</span></div>
      <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${Math.round(D.owned.length/D.total*100)}%"></div></div>
      <div class="sub" style="margin-top:6px;">ゲームを遊ぶと、ときどきおばけが図鑑に仲間入り！ トリック・オア・トリートからは、レアなおばけも。</div></div>
      <div class="hw2-dexgrid">${cards}</div>
      <div class="hw2-card"><div class="hw2-ct">🎁 図鑑のごほうび</div><button class="primary-btn" id="hw2DexAll" type="button" ${ready ? '' : 'disabled'}>まとめて受け取る${ready ? `(${ready}件)` : ''}</button>${steps}</div>`;
  }
  function bindDex(root, s, ctx){
    const run = async (body)=>{
      try{ const d = await ctx.api('dex/claim', 'POST', body); ctx.applyWallet(d); ctx.sound('win'); await ctx.refresh(`🎁 図鑑のごほうび: ${rewardsText(ctx, d.rewards)}`); }
      catch(err){ alert(err.message); }
    };
    root.querySelectorAll('[data-dexclaim]').forEach(b=> b.addEventListener('click', ()=> run({ need: +b.dataset.dexclaim })));
    const all = root.querySelector('#hw2DexAll'); if(all) all.addEventListener('click', ()=> run({ all: true }));
  }

  // ---------- 🎪 スタンプラリー ----------
  function stampsHtml(s, ctx){
    const S = s.stamps, got = new Set(S.got), games = (window.CBMini && window.CBMini.games) || [];
    const byId = Object.fromEntries(games.map(g=>[g.id, g]));
    const cells = S.games.map(id=>{
      const g = byId[id] || { emoji:'🎮', name:id }, has = got.has(id);
      return `<div class="hw2-stamp ${has ? 'has' : ''}"><div class="sp-e">${g.emoji}</div><div class="sp-n">${g.name}</div><div class="sp-s">${has ? '✔' : ''}</div></div>`;
    }).join('');
    const ready = S.steps.filter(x=> x.reached && !x.claimed).length;
    const steps = S.steps.map(x=>`<div class="hw2-step ${x.claimed ? 'claimed' : (x.reached ? 'ready' : '')} ${x.key === 'all' ? 'final' : ''}"><div class="st-n">${x.key === 'all' ? '全' : x.need}<small>${x.key === 'all' ? '部' : '個'}</small></div><div class="st-r">${ctx.rewardText(x.reward)}${x.reward.skinId ? ctx.swatches(x.reward.skinId, 5) : ''}</div>
      <div class="st-a">${x.claimed ? '<span class="hw-done">済</span>' : (x.reached ? `<button class="claim-btn" data-stclaim="${x.key}" type="button">受け取る</button>` : `<span class="hw-lock">あと${x.need - S.got.length}</span>`)}</div></div>`).join('');
    return `<div class="hw2-card"><div class="hw2-ct">🎪 ミニゲーム・スタンプラリー <span class="hw2-tag">${S.got.length} / ${S.games.length}</span></div>
      <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${Math.round(S.got.length/S.games.length*100)}%"></div></div>
      <div class="sub" style="margin:6px 0 8px;">ミニゲームを1種類遊ぶごとにスタンプが1つ。全部集めると限定スキンがもらえます！</div>
      <button class="primary-btn" id="hw2GoMini" type="button">🕹 ミニゲームへ行く</button></div>
      <div class="hw2-stampgrid">${cells}</div>
      <div class="hw2-card"><div class="hw2-ct">🎁 スタンプのごほうび</div><button class="primary-btn" id="hw2StAll" type="button" ${ready ? '' : 'disabled'}>まとめて受け取る${ready ? `(${ready}件)` : ''}</button>${steps}</div>`;
  }
  function bindStamps(root, s, ctx){
    const run = async (body)=>{
      try{ const d = await ctx.api('stamps/claim', 'POST', body); ctx.applyWallet(d); ctx.sound('win'); await ctx.refresh(`🎁 スタンプのごほうび: ${rewardsText(ctx, d.rewards)}`); }
      catch(err){ alert(err.message); }
    };
    root.querySelectorAll('[data-stclaim]').forEach(b=> b.addEventListener('click', ()=> run({ key: b.dataset.stclaim })));
    const all = root.querySelector('#hw2StAll'); if(all) all.addEventListener('click', ()=> run({ all: true }));
    const go = root.querySelector('#hw2GoMini'); if(go) go.addEventListener('click', ()=>{ ctx.closeModal(); if(window.CB && window.CB.hideTitle) window.CB.hideTitle(); if(window.CBMini) window.CBMini.open(); });
  }

  // ---------- 🍪 パート3: おやつタイム & パンプキン・パレード(キャンディが集めやすくなるイベント) ----------
  let p3Timer = 0;
  const mmss = (sec)=> { sec = Math.max(0, Math.ceil(sec)); const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), r = sec%60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); };
  function part3Html(s, ctx){
    const p = s.part3; if(!p) return '<div class="empty-hint">準備中です</div>';
    const sn = p.snack, pa = p.parade, top = pa.tiers[pa.tiers.length - 1].need;
    const ready = pa.tiers.filter(t=> t.reached && !t.claimed).length;
    const snackLabel = sn.left <= 0 ? '🌙 今日のおやつは全部食べました' : (sn.ready ? `🍪 おやつを食べる 🍬+${sn.candies}` : `⏳ 次のおやつまで ${mmss(sn.waitSec)}`);
    const tiers = pa.tiers.map(t=>`<div class="hw2-step ${t.claimed ? 'claimed' : (t.reached ? 'ready' : '')}"><div class="st-n">${t.need}<small>回</small></div>
      <div class="st-r">🍬 ${ctx.fmt(t.candies)}${t.ticket ? ' ＋ 🎟 チケット1枚' : ''}</div>
      <div class="st-a">${t.claimed ? '<span class="hw-done">済</span>' : (t.reached ? `<button class="claim-btn" data-p3claim="${t.need}" type="button">受け取る</button>` : `<span class="hw-lock">あと${t.need - pa.plays}回</span>`)}</div></div>`).join('');
    return `<div class="hw2-card"><div class="hw2-ct">🍪 おやつタイム <span class="hw2-tag">${sn.count} / ${sn.max}</span></div>
        <div class="sub" style="margin-bottom:8px;">2時間ごとに、ただでキャンディがもらえます(1日${sn.max}回まで)。ためておくことはできないので、こまめにどうぞ！</div>
        <button class="primary-btn" id="hw3Snack" type="button" ${sn.ready ? '' : 'disabled'}>${snackLabel}</button></div>
      <div class="hw2-card"><div class="hw2-ct">🎪 パンプキン・パレード <span class="hw2-tag">今日 ${pa.plays}回</span></div>
        <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${Math.min(100, Math.round(pa.plays / top * 100))}%"></div></div>
        <div class="sub" style="margin:6px 0 8px;">今日あそんだ回数(ゲーム＋ミニゲーム)に応じて、キャンディがもらえます。毎日リセット！</div>
        <button class="primary-btn" id="hw3All" type="button" ${ready ? '' : 'disabled'}>まとめて受け取る${ready ? `(${ready}件)` : ''}</button>${tiers}</div>
      <div class="hw2-card"><div class="hw2-ct">✨ パート3のボーナス</div>
        <div class="sub">・ミニゲーム1回ごとのおまけが 🍬+10 に増量<br>・さまようおばけが 1日20匹・20秒ごとに<br>・トリック・オア・トリートの無料回数が 1日2回に<br>・デイリー/ウィークリーミッションが6個ずつに<br>・新しいミニゲーム13本(スタンプラリーも31個に)<br>・みんなでボス討伐(「👹 ボス」タブ)<br>・パート3の期間中は、いつでもキャンディ 1.3倍</div></div>`;
  }
  function bindPart3(root, s, ctx){
    const p = s.part3; if(!p) return;
    const run = async (url, body)=>{
      try{ const d = await ctx.api(url, 'POST', body); ctx.applyWallet(d); ctx.sound('win'); await ctx.refresh(`🍬 +${ctx.fmt(d.gained || 0)} もらいました！`); }
      catch(err){ alert(err.message); }
    };
    const sb = root.querySelector('#hw3Snack'); if(sb) sb.addEventListener('click', ()=>{ sb.disabled = true; run('snack/claim'); });
    root.querySelectorAll('[data-p3claim]').forEach(b=> b.addEventListener('click', ()=> run('parade/claim', { need: +b.dataset.p3claim })));
    const all = root.querySelector('#hw3All'); if(all) all.addEventListener('click', ()=> run('parade/claim', { all: true }));
    // 次のおやつまでのカウントダウン
    clearInterval(p3Timer);
    if(sb && sb.disabled && p.snack.left > 0){
      const ends = Date.now() + p.snack.waitSec * 1000;
      p3Timer = setInterval(()=>{
        if(!document.body.contains(sb)){ clearInterval(p3Timer); return; }
        const left = (ends - Date.now()) / 1000;
        if(left <= 0){ clearInterval(p3Timer); ctx.refresh(); return; }
        sb.textContent = `⏳ 次のおやつまで ${mmss(left)}`;
      }, 1000);
    }
  }

  // ---------- 🌍 みんなでキャンディ大作戦 ----------
  function communityHtml(){ return `<div id="hw2Comm"><div class="empty-hint">読み込み中...</div></div>`; }
  async function bindCommunity(root, s, ctx){
    const box = root.querySelector('#hw2Comm'); if(!box) return;
    try{
      const d = await ctx.api('community');
      const next = d.goals.find(g=> !g.reached), prev = d.goals.filter(g=> g.reached).slice(-1)[0];
      const from = prev ? prev.need : 0, pct = next ? Math.max(2, Math.min(100, Math.round((d.total - from)/(next.need - from)*100))) : 100;
      const ready = d.goals.filter(g=> g.reached && !g.claimed).length;
      box.innerHTML = `<div class="hw2-card comm"><div class="hw2-ct">🌍 みんなでキャンディ大作戦</div>
        <div class="comm-total">みんなで集めた累計 <b>🍬 ${ctx.fmt(d.total)}</b></div>
        <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="sub" style="margin-top:6px;">${next ? `次の目標 🍬${ctx.fmt(next.need)} まで あと ${ctx.fmt(next.need - d.total)}` : '🎉 全部の目標を達成！ みんなありがとう！'}<br>目標に届くたびに、<b>参加している全員</b>にごほうびが届きます(数字は少し遅れて更新されます)。</div>
        <button class="primary-btn" id="hw2CommAll" type="button" ${ready ? '' : 'disabled'} style="margin-top:8px;">🎁 まとめて受け取る${ready ? `(${ready}件)` : ''}</button></div>
        ${d.goals.map(g=>`<div class="hw2-step ${g.claimed ? 'claimed' : (g.reached ? 'ready' : '')}"><div class="st-n sm">🍬${ctx.fmt(g.need)}</div><div class="st-r">${rewardsText(ctx, g.rewards)}</div><div class="st-a">${g.claimed ? '<span class="hw-done">済</span>' : (g.reached ? '<span class="hw2-tag ok">達成！</span>' : '<span class="hw-lock">🔒</span>')}</div></div>`).join('')}`;
      const all = box.querySelector('#hw2CommAll');
      if(all) all.addEventListener('click', async ()=>{
        try{ const r = await ctx.api('community/claim', 'POST'); ctx.applyWallet(r); ctx.sound('win'); await ctx.refresh(`🎁 みんなのごほうび: ${rewardsText(ctx, r.rewards)}`); }
        catch(err){ alert(err.message); }
      });
    }catch(err){ box.innerHTML = `<div class="empty-hint">${err.message}</div>`; }
  }

  // ---------- ゲストにハロウィンを見せるとき(ログインしていない人用) ----------
  function guestHtml(){
    return `<h2 class="hw-h2">🎃 ハロウィン・ナイトフェス</h2>
      <div class="hw2-guest">
        <div class="g-big">🔒 ゲストのままだと、イベントには参加できません</div>
        <div class="sub">アカウントを作ると、こんなに楽しめます！</div>
        <ul>
          <li>🎁 <b>ウェルカムギフト</b>(🪙3,000・🍬100・バトルパスXP)</li>
          <li>📆 毎日ログインボーナス(キャンディ・コイン)</li>
          <li>🍬 キャンディ集め → 🎰ガチャ・🛤ロード(60段)・🛒交換所</li>
          <li>📖 おばけ図鑑 24種 / 🎪 スタンプラリー / 🌱 かぼちゃ畑 / 🚪 トリック・オア・トリート</li>
          <li>🌍 みんなでキャンディ大作戦 / 🏆 ランキング</li>
        </ul>
        ${window.CBEngage ? window.CBEngage.guestCandyLine() : ''}
        <button class="primary-btn" id="hw2Signup" type="button">✨ アカウントを作る(無料・1分)</button>
      </div>`;
  }

  // ---------- さまようおばけ(ロビーに、ときどき飛んでくる) ----------
  const ghost = { el: null, timer: 0 };
  function ghostAllowed(){
    const CB = window.CB; if(!CB || !CB.eventActive || !CB.eventActive()) return false;
    const title = document.getElementById('titleScreen');
    if(!title || title.classList.contains('hidden')) return false;
    if(document.body.classList.contains('mg-open') || document.hidden) return false;
    const ov = document.getElementById('modalOverlay'); if(ov && ov.classList.contains('show')) return false;
    return true;
  }
  function spawnGhost(){
    if(ghost.el || !ghostAllowed()) return;
    const gold = Math.random() < .1, el = document.createElement('button');
    el.type = 'button'; el.className = 'hw2-ghost' + (gold ? ' gold' : ''); el.textContent = gold ? '🌟' : '👻'; el.setAttribute('aria-label', 'さまようおばけ');
    el.style.top = (18 + Math.random()*50) + 'vh'; el.style.animationDuration = (9 + Math.random()*4) + 's';
    el.addEventListener('animationend', ()=>{ el.remove(); ghost.el = null; });
    el.addEventListener('pointerdown', async (e)=>{
      e.preventDefault(); el.classList.add('caught'); setTimeout(()=>{ el.remove(); ghost.el = null; }, 350);
      const CB = window.CB;
      if(!CB.isLoggedIn()){
        CB.toast('👻 つかまえた！…けど、アカウントがないとキャンディにならない…'); CB.sound('bad');
        if(window.CBEngage) window.CBEngage.nudge('ghost'); return;
      }
      try{
        const d = await CB.api('/api/event/halloween/ghost/catch', 'POST');
        CB.sound(d.gold ? 'win' : 'coin'); CB.toast(`${d.gold ? '🌟 金色のおばけ！' : '👻 つかまえた！'} 🍬 +${d.gained}(今日あと${d.left}匹)`);
      }catch(err){ CB.toast('👻 ' + (err.message || 'にげられた…')); }
    });
    document.body.appendChild(el); ghost.el = el;
  }
  function scheduleGhost(first){
    clearTimeout(ghost.timer);
    ghost.timer = setTimeout(()=>{ spawnGhost(); scheduleGhost(false); }, (first ? 20 : 55 + Math.random()*60) * 1000);
  }
  scheduleGhost(true);

  // ---------- 👹 みんなでボス討伐(v4.0 パート3 拡張) ----------
  const escH = (t)=> String(t == null ? '' : t).replace(/[&<>"']/g, (c)=> ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const raidRw = (ctx, r)=> r.type === 'candies' ? `🍬${ctx.fmt(r.amount)}` : ctx.rewardText(r);
  function raidHtml(){ return `<div id="hwRaid"><div class="empty-hint">ボスをさがしています…</div></div>`; }
  async function bindRaid(root, s, ctx){
    const box = root.querySelector('#hwRaid'); if(!box) return;
    let busy = false;
    const draw = (d)=>{
      const cur = d.bosses.find(b=> b.current) || d.bosses[d.bosses.length - 1];
      const pct = d.allDefeated ? 0 : Math.max(0, Math.min(100, cur.hpLeft / cur.hp * 100));
      const m = d.mine, canAtk = !d.allDefeated && m.attacksLeft > 0;
      const btn = (n)=>{ const need = m.cost * n, can = canAtk && m.candies >= need; return `<button class="primary-btn rd-atk" data-rdatk="${n}" type="button" ${can ? '' : 'disabled'}>⚔️ ${n === 1 ? 'こうげき' : n + '回れんぞく'} 🍬${need}</button>`; };
      const ready = d.bosses.filter(b=> b.canClaim).length;
      box.innerHTML = `<div class="hw2-card rd-card ${d.allDefeated ? 'cleared' : ''}">
          <div class="hw2-ct">👹 みんなでボス討伐 <span class="hw2-tag">${d.allDefeated ? '全員の勝利！' : `第${cur.no}戦`}</span></div>
          <div class="rd-stage"><div class="rd-boss" id="rdBoss">${d.allDefeated ? '🎉' : cur.emoji}</div><div class="rd-fx" id="rdFx"></div></div>
          <div class="rd-name">${d.allDefeated ? 'ボスはぜんぶ、たおされました！' : escH(cur.name)}</div>
          <div class="rd-story">${d.allDefeated ? 'みんなのおかげで、ハロウィンの夜に平和がもどりました。' : escH(cur.story)}</div>
          <div class="quest-bar-bg rd-hp"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
          <div class="sub rd-hptext">${d.allDefeated ? 'HP 0' : `HP ${ctx.fmt(cur.hpLeft)} / ${ctx.fmt(cur.hp)}`}　みんなの合計ダメージ ${ctx.fmt(d.total)}</div>
          <div class="rd-btns">${btn(1)}${btn(5)}</div>
          <div class="sub" style="margin-top:6px;">今日の残りこうげき ${m.attacksLeft} / ${m.max}回　あなたの累計 <b>${ctx.fmt(m.dmg)}</b> ダメージ(🍬${ctx.fmt(m.candies)} もっています)<br>
            ゲームやミニゲームを遊ぶだけでも、自動でダメージが入ります！ たまに「クリティカル」も出るよ。</div></div>
        <div class="hw2-card"><div class="hw2-ct">🎁 たおしたボスのごほうび</div>
          <button class="primary-btn" id="rdClaimAll" type="button" ${ready ? '' : 'disabled'}>まとめて受け取る${ready ? `(${ready}件)` : ''}</button>
          <div class="sub" style="margin:6px 0;">ボスがたおれたら、<b>ダメージを ${ctx.fmt(m.minDmg)} 以上与えた全員</b>が受け取れます。</div>
          ${d.bosses.map(b=>`<div class="hw2-step ${b.claimed ? 'claimed' : (b.canClaim ? 'ready' : '')}"><div class="st-n sm">${b.defeated ? '✅' : b.emoji}</div>
            <div class="st-r"><b>${escH(b.name)}</b><br><small>HP ${ctx.fmt(b.hp)} ／ ${b.rewards.map(r=> raidRw(ctx, r)).join(' + ')}</small></div>
            <div class="st-a">${b.claimed ? '<span class="hw-done">済</span>' : (b.canClaim ? `<button class="claim-btn" data-rdclaim="${b.no}" type="button">受け取る</button>` : (b.defeated ? '<span class="hw-lock">ダメージ不足</span>' : '<span class="hw-lock">🔒</span>'))}</div></div>`).join('')}</div>
        <div class="hw2-card"><div class="hw2-ct">🏆 ダメージ ランキング TOP${d.top.length || ''}</div>
          ${d.top.length ? d.top.map((u, i)=>`<div class="rd-rank"><span>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'}</span><span class="rd-rn">${escH(u.name)}</span><b>${ctx.fmt(u.dmg)}</b></div>`).join('') : '<div class="empty-hint">まだだれも戦っていません。いちばん乗りのチャンス！</div>'}</div>`;
      box.querySelectorAll('[data-rdatk]').forEach(b=> b.addEventListener('click', ()=> attack(+b.dataset.rdatk)));
      box.querySelectorAll('[data-rdclaim]').forEach(b=> b.addEventListener('click', ()=> claim({ need: +b.dataset.rdclaim })));
      const all = box.querySelector('#rdClaimAll'); if(all) all.addEventListener('click', ()=> claim({ all: true }));
    };
    async function attack(times){
      if(busy) return; busy = true;
      try{
        const d = await ctx.api('raid/attack', 'POST', { times });
        ctx.applyWallet(d);
        const boss = box.querySelector('#rdBoss'), fx = box.querySelector('#rdFx'), crit = d.hits.some(h=> h.crit);
        ctx.sound(crit ? 'win' : 'hit');
        if(boss){ boss.classList.remove('hit'); void boss.offsetWidth; boss.classList.add('hit'); }
        if(fx) d.hits.slice(0, 10).forEach((h, i)=> setTimeout(()=>{
          if(!document.body.contains(fx)) return;
          const e = document.createElement('div'); e.className = 'rd-dmg' + (h.crit ? ' crit' : ''); e.textContent = (h.crit ? '💥 ' : '') + ctx.fmt(h.d);
          e.style.left = (20 + Math.random() * 60) + '%'; fx.appendChild(e); setTimeout(()=> e.remove(), 1000);
        }, i * 120));
        setTimeout(()=>{ if(document.body.contains(box)) draw(d.raid); busy = false; }, 600 + Math.min(10, d.hits.length) * 120);
        ctx.silentRefresh();
      }catch(err){ busy = false; alert(err.message); }
    }
    async function claim(body){
      try{ const r = await ctx.api('raid/claim', 'POST', body); ctx.applyWallet(r); ctx.sound('win'); await ctx.refresh(`🎁 ボス討伐のごほうび: ${r.rewards.map(x=> raidRw(ctx, x)).join(' + ')}`); }
      catch(err){ alert(err.message); }
    }
    try{ draw(await ctx.api('raid')); }catch(err){ box.innerHTML = `<div class="empty-hint">${escH(err.message)}</div>`; }
  }

  window.HW2 = {
    has: (tab)=> TABS.includes(tab),
    boostBar, homeTop, guestHtml,
    render(tab, s, ctx){
      if(tab === 'part3') return part3Html(s, ctx);
      if(tab === 'raid') return raidHtml();
      if(tab === 'tot') return totHtml(s, ctx);
      if(tab === 'patch') return patchHtml(s, ctx);
      if(tab === 'dex') return dexHtml(s, ctx);
      if(tab === 'stamps') return stampsHtml(s, ctx);
      if(tab === 'community') return communityHtml();
      return '';
    },
    bind(tab, root, s, ctx){
      if(tab !== 'patch') clearInterval(patchTimer);
      if(tab !== 'part3') clearInterval(p3Timer);
      if(tab === 'part3') bindPart3(root, s, ctx);
      if(tab === 'raid') bindRaid(root, s, ctx);
      if(tab === 'tot') bindTot(root, s, ctx);
      else if(tab === 'patch') bindPatch(root, s, ctx);
      else if(tab === 'dex') bindDex(root, s, ctx);
      else if(tab === 'stamps') bindStamps(root, s, ctx);
      else if(tab === 'community') bindCommunity(root, s, ctx);
    },
    bindGuest(root){
      const b = root.querySelector('#hw2Signup');
      if(b) b.addEventListener('click', ()=>{ if(window.CB && window.CB.openRegister) window.CB.openRegister(); });
    }
  };
})();

/* =====================================================================
   🎁 ゲスト向けの「アカウントを作りたくなる」工夫 + 毎日ログインボーナス (v3.6)
   ・ゲスト: ロビーの常設バー / 時々出る小さなお知らせ(1日6回まで・4分以上あける・プレイ中は出さない) /
             アカウント画面のメリット一覧 / ゲストでためた🍬の引き継ぎ / ミニゲーム結果のお誘い
   ・ログイン中: 毎日ログインボーナスのポップアップ(1年中) / 新規登録ウェルカムギフトの開封
   ・サーバー: backend/engage.py (/api/bonus/daily, /api/guest/perks)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const LS = {
    get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  };
  const K_CANDY = 'nexus-guest-candy', K_NUDGE = 'nexus-nudge-v1';
  const CARRY_MAX = 150, NUDGE_GAP_MS = 4*60*1000, NUDGE_FAST_GAP_MS = 70*1000, NUDGE_MAX_PER_DAY = 6;
  const todayKey = ()=>{ const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
  const fmt = (n)=> (CB().fmt ? CB().fmt(n) : String(n));

  // サーバーの /api/guest/perks が取れたら差し替える(文章をサーバーで一元管理)。取れなくても、この初期値で動く
  let PERKS = [
    { icon:'🎁', title:'ウェルカムギフト', text:'作った瞬間に🪙3,000・🍬100・バトルパスXPがもらえる' },
    { icon:'📆', title:'毎日ログインボーナス', text:'毎日もらえて、続けるほど豪華(7・14・30日…で特別ボーナス)' },
    { icon:'🎃', title:'ハロウィンイベントに参加', text:'キャンディ集め・ガチャ・ロード・図鑑・畑・スタンプラリーが全部遊べる' },
    { icon:'🏆', title:'ランキングに載る', text:'ミニゲームの記録が全国ランキングに載る。名前も残る' },
    { icon:'☁️', title:'データが消えない', text:'コイン・スキン・記録がサーバーに保存。機種変更しても引き継げる' },
    { icon:'👥', title:'フレンド・チャット・対決', text:'みんなとチャットしたり、フレンド対決ができる' },
    { icon:'🏷', title:'称号・ギフト・投票', text:'称号を集めたり、運営からのプレゼントを受け取れる' }
  ];
  let daily = null;            // ログイン中の「毎日ログインボーナス」の状況
  let popShown = false;

  const isGuest = ()=> !(CB().isLoggedIn && CB().isLoggedIn());
  const lobbyVisible = ()=>{ const t = document.getElementById('titleScreen'); return !!t && !t.classList.contains('hidden'); };
  const modalOpen = ()=>{ const o = document.getElementById('modalOverlay'); return !!(o && o.classList.contains('show')); };
  const busy = ()=> document.body.classList.contains('mg-open') || modalOpen() || document.hidden || !!document.getElementById('cbBonusPop');
  const openRegister = ()=>{ if(CB().openRegister) CB().openRegister(); };

  // ---------- ゲストでためた🍬(アカウントを作ったら引き継げる) ----------
  function guestCandy(){ return Math.max(0, Math.min(CARRY_MAX, Number(LS.get(K_CANDY, 0)) || 0)); }
  function guestPlayed(info){
    if(!isGuest() || !(CB().eventActive && CB().eventActive())) return;
    const score = Math.max(0, Number(info && info.score) || 0);
    const add = 6 + Math.min(30, Math.floor(score/1200)) + ((info && String(info.mode || '').startsWith('mini-')) ? 4 : 0);
    const before = guestCandy(), now = Math.min(CARRY_MAX, before + add);
    LS.set(K_CANDY, now);
    if(now > before && CB().toast) CB().toast(`🍬 +${now - before}(ゲストのかりキャンディ ${now}) — アカウントを作ると引き継げます`);
    setTimeout(()=> nudge('game'), 2200);
  }
  function guestCandyLine(){
    const n = guestCandy();
    return n > 0 ? `<div class="hw2-guestcandy">ゲストでためた 🍬 <b>${n}</b> は、アカウントを作ると<b>そのまま引き継げます</b>(最大${CARRY_MAX})</div>` : '';
  }

  // ---------- メリット一覧(アカウント画面・お知らせで使う) ----------
  function perksHtml(){
    return `<div class="eg-perks"><div class="eg-ph">✨ アカウントを作ると、こんなにいいこと！</div>
      ${PERKS.map(p=>`<div class="eg-perk"><span class="pk-i">${p.icon}</span><div><b>${p.title}</b><small>${p.text}</small></div></div>`).join('')}
      ${guestCandyLine()}</div>`;
  }
  function decorateAccount(root){
    if(!isGuest() || !root || root.querySelector('.eg-perks')) return;
    const tabs = root.querySelector('.tab-row'); if(!tabs) return;
    tabs.insertAdjacentHTML('beforebegin', perksHtml());
    const reg = root.querySelector('[data-tab="register"]'); if(reg && !reg.querySelector('.eg-gift')) reg.insertAdjacentHTML('beforeend', ' <span class="eg-gift">🎁</span>');
  }

  // ---------- ゲスト向けの小さなお知らせ ----------
  function nudgeState(){
    const s = LS.get(K_NUDGE, null);
    if(!s || s.date !== todayKey()) return { date: todayKey(), count: 0, last: s && s.last || 0, idx: s && s.idx || 0 };
    return s;
  }
  function nudge(reason){
    if(!isGuest() || document.getElementById('cbNudge') || busy()) return;
    if(reason !== 'game' && reason !== 'ghost' && !lobbyVisible()) return;
    const st = nudgeState(), now = Date.now();
    if(st.count >= NUDGE_MAX_PER_DAY) return;
    if(now - st.last < ((reason === 'timer') ? NUDGE_GAP_MS : NUDGE_FAST_GAP_MS)) return;
    const p = PERKS[st.idx % PERKS.length];
    st.count++; st.last = now; st.idx++; LS.set(K_NUDGE, st);
    const el = document.createElement('div'); el.id = 'cbNudge'; el.className = 'eg-nudge';
    el.innerHTML = `<div class="ng-ic">${p.icon}</div><div class="ng-tx"><b>アカウントを作ると…${p.title}</b><small>${p.text}</small></div>
      <div class="ng-bt"><button type="button" class="ng-go">作る</button><button type="button" class="ng-x" aria-label="とじる">×</button></div>`;
    document.body.appendChild(el);
    const close = ()=>{ el.classList.add('out'); setTimeout(()=> el.remove(), 350); };
    el.querySelector('.ng-go').addEventListener('click', ()=>{ close(); openRegister(); });
    el.querySelector('.ng-x').addEventListener('click', close);
    setTimeout(close, 12000);
  }

  // ---------- ロビーの常設バー(ゲスト=お誘い / ログイン中=ログインボーナス) ----------
  function updateBar(){
    const bar = document.getElementById('lobbyBonusBtn'); if(!bar) return;
    if(isGuest()){
      bar.className = 'lobby-bonus guest'; bar.hidden = false;
      bar.innerHTML = `<span class="lb-ic">🎁</span><span class="lb-tx"><b>アカウントを作ると 🪙3,000 もらえる！</b><small>毎日ログインボーナス・ウィンターパス・実績・ランキング</small></span><span class="lb-go">›</span>`;
    } else if(daily){
      const ready = !daily.claimedToday;
      bar.className = 'lobby-bonus ' + (ready ? 'ready' : 'done'); bar.hidden = false;
      bar.innerHTML = ready
        ? `<span class="lb-ic">📆</span><span class="lb-tx"><b>今日のログインボーナスを受け取ろう！</b><small>連続 ${daily.streak} 日 → 今日で ${daily.nextStreak} 日目</small></span><span class="lb-go">受け取る ›</span>`
        : `<span class="lb-ic">✅</span><span class="lb-tx"><b>連続ログイン ${daily.streak} 日</b><small>今日のボーナスは受け取り済み。明日も来てね！</small></span><span class="lb-go">›</span>`;
    } else bar.hidden = true;
  }

  // ---------- 毎日ログインボーナス(ポップアップ) ----------
  async function loadDaily(){
    try{ const d = await CB().api('/api/bonus/daily'); daily = (d && Array.isArray(d.rewards)) ? d : null; }catch(e){ daily = null; }
    updateBar();
  }
  function rewardLine(r){ return `🪙${fmt(r.coins || 0)}${r.bpxp ? `<br>🎫+${fmt(r.bpxp)}` : ''}`; }
  function showBonus(){
    if(!daily || document.getElementById('cbBonusPop')) return;
    popShown = true;
    const d = daily, cur = d.day;
    const days = d.rewards.map((r,i)=>{
      const n = i+1, done = d.claimedToday ? n <= cur : n < cur, now = !d.claimedToday && n === cur;
      return `<div class="bp-day ${done ? 'done' : ''} ${now ? 'cur' : ''} ${n === d.cycle ? 'last' : ''}"><div class="bp-n">${n}日目</div><div class="bp-r">${rewardLine(r)}</div>${done ? '<i>✓</i>' : ''}</div>`;
    }).join('');
    const sb = Object.entries(d.streakBonus || {}).map(([k,v])=>`${k}日連続: 🪙${fmt(v.coins || 0)}${v.bpxp ? ` 🎫${fmt(v.bpxp)}` : ''}`).join(' ／ ');
    const el = document.createElement('div'); el.id = 'cbBonusPop'; el.className = 'eg-pop';
    el.innerHTML = `<div class="bp-card"><button class="bp-x" type="button" aria-label="とじる">×</button>
      <div class="bp-h">📆 ログインボーナス</div>
      <div class="bp-sub" id="bpSub">連続ログイン <b>${d.streak}</b> 日 ${d.claimedToday ? '' : `→ 今日で <b>${d.nextStreak}</b> 日目`}</div>
      <div class="bp-days">${days}</div>
      <div class="bp-sb">🎯 連続ボーナス: ${sb}</div>
      <div class="bp-msg" id="bpMsg"></div>
      <button class="primary-btn" id="bpClaim" type="button" ${d.claimedToday ? 'disabled' : ''}>${d.claimedToday ? '✓ 今日は受け取り済み' : '🎁 今日のボーナスを受け取る'}</button></div>`;
    document.body.appendChild(el);
    const close = ()=>{ el.classList.add('out'); setTimeout(()=> el.remove(), 300); };
    el.querySelector('.bp-x').addEventListener('click', close);
    el.addEventListener('pointerdown', (e)=>{ if(e.target === el) close(); });
    const btn = el.querySelector('#bpClaim');
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      try{
        const r = await CB().api('/api/bonus/daily/claim', 'POST');
        if(CB().setCoins) CB().setCoins(r.coins);
        if(CB().sound) CB().sound('win');
        daily = { ...daily, claimedToday:true, streak:r.streak, day:r.day, nextStreak:r.streak };
        el.querySelector('#bpMsg').innerHTML = `🎉 🪙${fmt(r.reward.coins || 0)}${r.reward.bpxp ? ` ・ 🎫+${fmt(r.reward.bpxp)}` : ''} をゲット！${r.bonusHit ? '<br>🌟 連続ログインの特別ボーナス付き！' : ''}`;
        btn.textContent = '✓ 受け取りました'; updateBar();
        const sub = el.querySelector('#bpSub'); if(sub) sub.innerHTML = `連続ログイン <b>${r.streak}</b> 日 ✓`;
        setTimeout(close, 2600);
      }catch(err){ el.querySelector('#bpMsg').textContent = err.message; btn.disabled = false; }
    });
  }

  // ---------- 新規登録したとき(script.js が cb:registered を出す) ----------
  window.addEventListener('cb:registered', async ()=>{
    daily = null; updateBar();
    const n = guestCandy();
    if(n > 0 && CB().eventActive && CB().eventActive()){
      try{
        const r = await CB().api('/api/event/halloween/guest-carryover', 'POST', { candies: n });
        if(r && r.gained > 0 && CB().toast) CB().toast(`🍬 ゲストでためたキャンディ ${r.gained} 個を引き継ぎました！`);
      }catch(e){}
    }
    LS.set(K_CANDY, 0);
    setTimeout(()=>{ if(window.GiftFx) window.GiftFx.check('manual'); }, 1400);     // 🎁 ウェルカムギフトを開封
    setTimeout(loadDaily, 2000);
  });

  // ---------- まとめて見張る(2秒ごと。軽い処理だけ) ----------
  let wasIn = null, forcePop = false, lastTimerNudge = Date.now() - NUDGE_GAP_MS + 30000;
  function tick(){
    const inNow = !isGuest();
    if(inNow !== wasIn){
      const wasPrev = wasIn; wasIn = inNow;
      if(inNow){ popShown = false; forcePop = (wasPrev === false); loadDaily(); }
      else {
        daily = null; updateBar();
        CB().api && CB().api('/api/guest/perks').then(d=>{ if(d && Array.isArray(d.perks) && d.perks.length) PERKS = d.perks; }).catch(()=>{});
      }
    }
    if(inNow){
      if(daily && !daily.claimedToday && !popShown && (lobbyVisible() || forcePop) && !busy()){ forcePop = false; showBonus(); }
    } else if(lobbyVisible() && !busy() && Date.now() - lastTimerNudge > NUDGE_GAP_MS){
      lastTimerNudge = Date.now(); nudge('timer');
    }
  }
  setInterval(tick, 2000);
  setTimeout(()=>{ updateBar(); }, 1200);
  document.addEventListener('click', (e)=>{
    const bar = e.target.closest && e.target.closest('#lobbyBonusBtn');
    if(!bar) return;
    if(isGuest()) openRegister(); else if(daily) showBonus();
  });
  // 日付が変わっても(アプリを開きっぱなしでも)ボーナスを出せるように、画面に戻ったとき状況を取り直す
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && !isGuest()){ popShown = false; loadDaily(); } });

  window.CBEngage = { guestPlayed, guestCandyLine, perksHtml, decorateAccount, nudge, showBonus,
    signupLine(){ return isGuest() ? `<button class="mg-linkbtn eg-cta" id="mgSignup" type="button">🎁 アカウントを作ると、記録がランキングに載って 🪙3,000 ももらえる！</button>` : ''; } };
})();

/* =====================================================================
   📮 サポートチャット(運営とのやりとり) (v3.8)
   ・ご要望/不具合報告を送ると、運営との専用チャットが開く。運営が1つずつ返信し、終了すると 👍/👎 の評価が出る
   ・サーバー: /api/support/*  (backend/app.py)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const esc = (s)=> String(s == null ? '' : s).replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const mc = ()=> document.getElementById('modalContent'), mo = ()=> document.getElementById('modalOverlay');
  const KIND = { feature:'💡 ご要望', bug:'🐞 不具合報告' };
  const ZERO = { unread:0, pendingReview:0, adminUnread:0, adminOpen:0 };
  let summary = { ...ZERO }, listTab = 'mine', curId = null, pollTimer = null, lastSig = '', lastUnread = 0;
  const logged = ()=> !!(CB().isLoggedIn && CB().isLoggedIn());
  const isAdmin = ()=> !!(CB().isAdmin && CB().isAdmin());
  // 運営チャットに出てくる「相手(送った人)」を、他の画面と同じアイコン+名前+Lvで
  const whoOf = (t, size, zoom)=> CB().who ? CB().who({ id:t.userId, name:t.userName, icon:t.userIcon, lv:t.userLv }, 'id', size || 22, !!zoom) : esc(t.userName);
  const fmtTime = (iso)=>{ if(!iso) return ''; const d = new Date(iso), n = new Date(); const same = d.toDateString() === n.toDateString();
    return same ? d.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) : d.toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }); };
  const inMode = (m)=> mo().classList.contains('show') && mc().dataset.mode === m;

  async function refresh(){
    if(!logged()){ summary = { ...ZERO }; return summary; }
    try{
      summary = await CB().api('/api/support/summary');
      if(summary.unread > lastUnread && CB().toast) CB().toast('📮 運営から返信が届きました');
      lastUnread = summary.unread;
    }catch(e){}
    return summary;
  }
  const badgeCount = ()=> (summary.unread || 0) + (summary.pendingReview || 0) + (isAdmin() ? (summary.adminUnread || 0) : 0);

  // ---------- 一覧 ----------
  async function open(tab){
    if(!logged()){ alert('ログインすると、運営との専用チャットが使えます'); return; }
    clearInterval(pollTimer); pollTimer = null; curId = null;
    listTab = (tab === 'admin' && isAdmin()) ? 'admin' : 'mine';
    const body = mc(); body.dataset.mode = 'support'; mo().classList.add('show');
    body.innerHTML = `<h2 style="color:var(--gold);">💬 運営とのやりとり</h2><div class="empty-hint">読み込み中...</div>`;
    await renderList();
    pollTimer = setInterval(()=>{ if(document.hidden) return; if(inMode('support') && !curId) renderList(true); else if(!inMode('support')){ clearInterval(pollTimer); pollTimer = null; } }, 8000);
  }
  async function renderList(quiet){
    const body = mc(); if(!inMode('support') || curId) return;
    let threads = [];
    try{ threads = (await CB().api(listTab === 'admin' ? '/api/support/threads?scope=admin' : '/api/support/threads')).threads || []; }
    catch(err){ if(!quiet) body.innerHTML = `<h2 style="color:var(--gold);">💬 運営とのやりとり</h2><div class="empty-hint">${esc(err.message)}</div>`; return; }
    refresh();
    const tabs = isAdmin() ? `<div class="tab-row" style="margin-bottom:10px;"><button class="tab-btn ${listTab === 'mine' ? 'active' : ''}" data-st="mine">自分のやりとり</button><button class="tab-btn ${listTab === 'admin' ? 'active' : ''}" data-st="admin">🛠 受信箱${summary.adminUnread ? ` <span class="sup-dot">${summary.adminUnread}</span>` : ''}</button></div>` : '';
    const items = threads.map(t=>{
      const review = (t.status === 'closed' && !t.review && listTab === 'mine') ? '<span class="sup-chip warn">👍👎 評価をお願いします</span>' : '';
      const st = t.status === 'open' ? '<span class="sup-chip on">対応中</span>' : (t.review === 'up' ? '<span class="sup-chip done">👍 解決</span>' : (t.review === 'down' ? '<span class="sup-chip bad">👎 未解決</span>' : '<span class="sup-chip off">終了</span>'));
      return `<button type="button" class="sup-item ${t.unread ? 'unread' : ''}" data-tid="${t.id}">
        <div class="sup-top"><span class="sup-kind">${KIND[t.kind] || t.kind}</span>${st}${review}${t.unread ? `<span class="sup-new">NEW ${t.unread}</span>` : ''}</div>
        <div class="sup-title">${listTab === 'admin' ? `<span class="sup-whowrap">${whoOf(t)}</span> ` : ''}${esc(t.title || '(無題)')}${t.reopenedFrom ? ` <small>(#${t.reopenedFrom}の再オープン)</small>` : ''}</div>
        <div class="sup-prev">${esc(t.preview)}</div><div class="sup-time">#${t.id} ・ ${fmtTime(t.lastAt)}</div></button>`;
    }).join('');
    body.innerHTML = `<h2 style="color:var(--gold);">💬 運営とのやりとり</h2>${tabs}
      <div class="sub" style="margin-bottom:8px;">${listTab === 'admin' ? '届いているご要望・不具合報告のチャットです。' : 'ご要望・不具合報告を送ると、ここに専用チャットができます。運営がひとつずつ返信します。'}</div>
      ${items || '<div class="empty-hint">まだやりとりはありません。<br>「📮 ご要望・不具合報告」から送ると、ここにチャットができます。</div>'}
      <button class="ghost-btn" id="supBack" type="button" style="margin-top:10px;">📮 ご要望・不具合報告にもどる</button>`;
    body.querySelectorAll('[data-st]').forEach(b=> b.addEventListener('click', ()=>{ listTab = b.dataset.st; renderList(); }));
    body.querySelectorAll('.sup-item').forEach(b=> b.addEventListener('click', ()=> openThread(+b.dataset.tid)));
    document.getElementById('supBack').addEventListener('click', ()=>{ if(CB().openFeedback) CB().openFeedback(); else if(CB().closeModal) CB().closeModal(); });
  }

  // ---------- チャット画面 ----------
  async function openThread(id){
    if(!logged()) return;
    curId = id; lastSig = '';
    const body = mc(); body.dataset.mode = 'support'; mo().classList.add('show');
    body.innerHTML = `<div class="empty-hint">読み込み中...</div>`;
    await renderThread(id);
    clearInterval(pollTimer);
    pollTimer = setInterval(()=>{ if(document.hidden) return; if(inMode('support') && curId === id) renderThread(id, true); else if(!inMode('support')){ clearInterval(pollTimer); pollTimer = null; } }, 4000);
  }
  async function renderThread(id, quiet){
    const body = mc(); if(!inMode('support') || curId !== id) return;
    let d;
    try{ d = await CB().api(`/api/support/thread/${id}`); }
    catch(err){ if(!quiet) body.innerHTML = `<div class="empty-hint">${esc(err.message)}</div><button class="ghost-btn" id="supBack" type="button">← 一覧へ</button>`; const b = document.getElementById('supBack'); if(b) b.addEventListener('click', ()=>open(listTab)); return; }
    const t = d.thread, adminView = d.isAdminView, open = t.status === 'open';
    const sig = `${t.status}|${t.review}|${d.messages.length}|${d.messages.length ? d.messages[d.messages.length-1].id : 0}|${d.canReview}`;
    if(quiet && sig === lastSig) return;
    const prevInput = document.getElementById('supInput'), draft = prevInput ? prevInput.value : '';
    const hadFocus = !!prevInput && document.activeElement === prevInput, selPos = prevInput ? prevInput.selectionStart : 0;
    const prevMsgs = document.getElementById('supMsgs'), wasBottom = !prevMsgs || (prevMsgs.scrollHeight - prevMsgs.scrollTop - prevMsgs.clientHeight < 80), prevTop = prevMsgs ? prevMsgs.scrollTop : 0;
    lastSig = sig;
    const mineSender = adminView ? 'admin' : 'user';
    const msgs = d.messages.map(m=> m.sender === 'system'
      ? `<div class="sup-sys">${esc(m.message)}</div>`
      : `<div class="sup-msg ${m.sender === mineSender ? 'mine' : 'theirs'}"><div class="sup-who">${m.sender === 'admin' ? '👑 運営' : whoOf(t, 26, true)} <small>${fmtTime(m.at)}</small></div><div class="sup-bub">${esc(m.message).replace(/\n/g, '<br>')}</div></div>`).join('');
    let foot = '';
    if(open){
      foot = `<div class="sup-input"><textarea id="supInput" rows="2" maxlength="500" placeholder="${adminView ? '返信を入力…' : 'メッセージを入力…'}"></textarea><button class="primary-btn" id="supSend" type="button">送信</button></div>
        ${adminView ? '<button class="ghost-btn sup-close" id="supClose" type="button">✅ このチャットを終了する(送信できなくなり、相手に評価が出ます)</button>' : ''}`;
    } else {
      foot = `<div class="sup-ended">🔒 このチャットは終了しました。メッセージは送れません。</div>`;
      if(d.canReview) foot += `<div class="sup-review"><div class="sup-rq">${t.kind === 'bug' ? '問題は解決しましたか？' : 'ご要望はいかがでしたか？'}</div>
        <div class="sup-rbtns"><button class="sup-rb up" id="supUp" type="button">👍<small>${t.kind === 'bug' ? '解決した！' : 'ありがとう'}</small></button><button class="sup-rb down" id="supDown" type="button">👎<small>まだ困っている</small></button></div></div>`;
      else if(t.review === 'up') foot += `<div class="sup-result up">${t.kind === 'bug' ? '👍 問題は解決しました。ご報告ありがとうございました！' : '👍 リクエストありがとうございました！'}</div>`;
      else if(t.review === 'down') foot += `<div class="sup-result down">👎 未解決として、新しいチャットを開きました。</div>`;
    }
    body.innerHTML = `<div class="sup-head"><button class="ghost-btn sup-back" id="supBack" type="button">← 一覧</button><div class="sup-ht"><b>${esc(t.title || '(無題)')}</b><small>${KIND[t.kind] || ''} ・ #${t.id}${adminView ? ` ・ ${whoOf(t, 22, true)} (@${esc(t.userId)})` : ''}</small></div><span class="sup-chip ${open ? 'on' : 'off'}">${open ? '対応中' : '終了'}</span></div>
      <div class="sup-msgs" id="supMsgs">${msgs}</div>${foot}`;
    const box = document.getElementById('supMsgs'); box.scrollTop = wasBottom ? box.scrollHeight : prevTop;      // 上を読んでいるときは動かさない
    const inp = document.getElementById('supInput'); if(inp && draft) inp.value = draft;
    if(inp && hadFocus){ inp.focus(); try{ inp.setSelectionRange(selPos, selPos); }catch(e){} }      // 入力中にキーボードが閉じないように
    document.getElementById('supBack').addEventListener('click', ()=>{ curId = null; open_list(); });
    const send = document.getElementById('supSend');
    if(send){
      const go = async ()=>{
        const text = inp.value.trim(); if(!text) return; send.disabled = true;
        try{ await CB().api(`/api/support/thread/${id}/send`, 'POST', { message: text }); inp.value = ''; lastSig = ''; await renderThread(id); if(CB().sound) CB().sound('tick'); }
        catch(err){ alert(err.message); }
        const s2 = document.getElementById('supSend'); if(s2) s2.disabled = false;
      };
      send.addEventListener('click', go);
      inp.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); go(); } });
    }
    const close = document.getElementById('supClose');
    if(close) close.addEventListener('click', async ()=>{
      if(!confirm('このチャットを終了しますか？\n終了すると、どちらからも送信できなくなります。')) return;
      try{ await CB().api(`/api/support/thread/${id}/close`, 'POST'); lastSig = ''; await renderThread(id); refresh(); }catch(err){ alert(err.message); }
    });
    const review = async (result)=>{
      try{
        const r = await CB().api(`/api/support/thread/${id}/review`, 'POST', { result });
        if(CB().sound) CB().sound(result === 'up' ? 'win' : 'tick');
        refresh();
        if(result === 'down' && r.newThreadId){ alert(r.text); await openThread(r.newThreadId); } else { lastSig = ''; await renderThread(id); }
      }catch(err){ alert(err.message); }
    };
    const up = document.getElementById('supUp'), down = document.getElementById('supDown');
    if(up) up.addEventListener('click', ()=> review('up'));
    if(down) down.addEventListener('click', ()=> review('down'));
    refresh();
  }
  const open_list = ()=> open(listTab);

  refresh();
  setInterval(()=>{ if(!document.hidden && logged()) refresh(); }, 30000);
  window.CBSupport = { open, openThread, refresh, badgeCount, summary: ()=> summary };
})();

/* =====================================================================
   🔔 ロビーの「お知らせバー」 (v3.8)
   ・未読のチャット / 未投票の投票 / 運営からの返信 / 評価待ち / フレンドの通知 / 届いているギフト を、ひと目でわかるように並べる
   ・タップすると、その画面へ飛べる。何もなければバーごと隠れる
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const bar = ()=> document.getElementById('lobbyNotify');
  const lobbyVisible = ()=>{ const t = document.getElementById('titleScreen'); return !!t && !t.classList.contains('hidden'); };
  const go = (id, fn)=>{ if(CB().hideTitle) CB().hideTitle(); setTimeout(()=>{ if(fn) fn(); else { const el = document.getElementById(id); if(el) el.click(); } }, 70); };
  let lastSig = '';
  function items(){
    const c = CB().counts ? CB().counts() : { chat:0, chatMention:0, friends:0 };
    const polls = (window.CBSocial && window.CBSocial.unvotedCount) ? window.CBSocial.unvotedCount() : 0;
    const gifts = (window.GiftFx && window.GiftFx.pendingCount) ? window.GiftFx.pendingCount() : 0;
    const sup = window.CBSupport ? window.CBSupport.summary() : { unread:0, pendingReview:0, adminUnread:0 };
    const admin = !!(CB().isAdmin && CB().isAdmin());
    const out = [];
    if(admin && sup.adminUnread) out.push({ k:'adm', ic:'🛠', t:'未対応のサポートチャット', n:sup.adminUnread, hot:true, run:()=> go(null, ()=> window.CBSupport.open('admin')) });
    if(sup.unread) out.push({ k:'sup', ic:'📮', t:'運営からの返信', n:sup.unread, hot:true, run:()=> go(null, ()=> window.CBSupport.open()) });
    if(sup.pendingReview) out.push({ k:'rev', ic:'👍', t:'解決したか教えてください', n:sup.pendingReview, hot:true, run:()=> go(null, ()=> window.CBSupport.open()) });
    if(c.chatMention) out.push({ k:'men', ic:'💬', t:'あなた宛のメンション', n:c.chatMention, hot:true, run:()=> go('chatBtn') });
    else if(c.chat) out.push({ k:'chat', ic:'💬', t:'未読のチャット', n:c.chat, run:()=> go('chatBtn') });
    if(polls) out.push({ k:'poll', ic:'🗳', t:'まだ投票していない質問', n:polls, hot:true, run:()=> go('titlePollBtn') });
    if(c.friends) out.push({ k:'fr', ic:'👥', t:'フレンドからの通知', n:c.friends, run:()=> go('friendsBtn') });
    if(gifts) out.push({ k:'gift', ic:'🎁', t:'受け取れるギフト', n:gifts, hot:true, run:()=>{ if(window.GiftFx) window.GiftFx.check('manual'); } });
    return out;
  }
  function render(){
    const el = bar(); if(!el) return;
    if(!lobbyVisible() || document.body.classList.contains('mg-open')) return;
    const list = items();
    const sig = list.map(i=> `${i.k}:${i.n}`).join(',');
    if(sig === lastSig) return;
    lastSig = sig;
    if(!list.length){ el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<div class="nt-h">📣 お知らせ <small>タップで開きます</small></div><div class="nt-row">${list.map(i=>`<button type="button" class="nt-chip ${i.hot ? 'hot' : ''}" data-k="${i.k}"><span class="nt-ic">${i.ic}</span><span class="nt-t">${i.t}</span><b class="nt-n">${i.n > 99 ? '99+' : i.n}</b></button>`).join('')}</div>`;
    el.querySelectorAll('.nt-chip').forEach(b=> b.addEventListener('click', ()=>{ const it = list.find(x=> x.k === b.dataset.k); if(it) it.run(); }));
  }
  setInterval(render, 1500);
  setTimeout(render, 1200);
})();
