/* =====================================================================
   🌐 通信の土台 (v3.5.1) — script.js より先に読み込む
   サーバー(Render)への fetch だけを、次のように強くする(それ以外のURLには何もしない):
   ① 先読み: 接続(DNS・TLS)を先に済ませておく
   ② 起こす: 眠っているサーバーを、ページを開いた瞬間に起こしておく(ロード画面の間に済む)
   ③ 再試行: 読み込み(GET)が通信エラー・502/503/504になったら、少し待って最大3回まで自動でやり直す
   ④ まとめる: 同じ読み込み(GET)が同時に何本も走るとき、1本にまとめて結果を共有する
   ⑤ 時間切れ: 返事が60秒来なければ、止めてエラーにする(画面が永遠に「読み込み中」にならない)
   ※ 書き込み(POST など)は、二重に実行されないよう、自動の再試行はしない
   ===================================================================== */
(function(){
  'use strict';
  const BASE = String((window.NEXUS_CONFIG && window.NEXUS_CONFIG.API_BASE_URL) || 'https://pinkyburst.onrender.com').replace(/\/+$/, '');
  const orig = window.fetch.bind(window);
  const TIMEOUT_MS = 60000;
  const RETRY_STATUS = { 502:1, 503:1, 504:1 };

  // ① 先読み
  try{ const l = document.createElement('link'); l.rel = 'preconnect'; l.href = BASE; l.crossOrigin = 'anonymous'; document.head.appendChild(l); }catch(e){}
  // ② 起こす(結果は使わない)
  try{ orig(BASE + '/healthz', { cache:'no-store' }).catch(()=>{}); }catch(e){}

  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

  async function once(input, init){
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), TIMEOUT_MS);
    try{ return await orig(input, Object.assign({}, init, { signal: ctrl.signal })); }
    finally{ clearTimeout(timer); }
  }

  async function attempt(input, init, canRetry){
    const max = canRetry ? 3 : 1;
    let lastErr;
    for(let i = 1; i <= max; i++){
      try{
        const res = await once(input, init);
        if(RETRY_STATUS[res.status] && i < max){ await sleep(600 * i); continue; }
        return res;
      }catch(err){
        lastErr = err;
        if(i < max) await sleep(600 * i);
      }
    }
    throw lastErr;
  }

  const inflight = new Map();
  window.fetch = function(input, init){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if(url.indexOf(BASE + '/') !== 0) return orig(input, init);        // サーバー以外は、そのまま
    if(init && init.signal) return orig(input, init);                    // 呼び出し側が自分で止め方を決めているときは、そのまま
    const method = String((init && init.method) || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    if(method !== 'GET') return attempt(input, init || {}, false);
    if(typeof input !== 'string') return attempt(input, init || {}, true);
    const h = (init && init.headers) || {};
    const key = url + '|' + (h.Authorization || h.authorization || '');
    let p = inflight.get(key);
    if(!p){ p = attempt(input, init || {}, true).finally(()=> inflight.delete(key)); inflight.set(key, p); }
    return p.then(r=> r.clone());                                         // 何人が使っても読めるように、複製を渡す
  };
})();

/* =====================================================================
   🔢 巨大な数(v4.3) — サーバーは桁数の制限なし(最大300桁)で数を返す。
   JavaScript の数は約15桁を超えると丸まるので、「正確な桁」を別に覚えておき、表示のときだけ使う。
   ・JSON を読むとき、16桁以上の整数だけ、正確な数字を NXBig に覚えておく(計算は今まで通り Number で行うので、何も壊れない)
   ・NXBig.exact(n) = 正確な数字(文字列)。無ければ null / NXBig.full(n) = 3桁区切りの全桁 / NXBig.compact(n) = 短い表記
   ===================================================================== */
(function(){
  'use strict';
  const exact = new Map();
  const RE = /"(?:[^"\\]|\\.)*"|(-?\d{16,})(?![\d.eE])/g;
  function scan(text){
    if(!/\d{16}/.test(text)) return;
    let m; RE.lastIndex = 0;
    while((m = RE.exec(text))){
      if(!m[1]) continue;
      const d = m[1];
      if(exact.size > 4000) exact.clear();
      exact.set(Number(d), d);
    }
  }
  const origJson = Response.prototype.json;
  Response.prototype.json = function(){
    return this.text().then(t=>{ try{ scan(t); }catch(e){} return JSON.parse(t); });
  };
  void origJson;
  const commas = (d)=> d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const SUF = ['', 'K', 'M', 'B', 'T', 'Q', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];   // ゲーム内の表記(K M B T Q …)と同じ
  function exactOf(n){
    if(typeof n === 'string' && /^-?\d+$/.test(n)) return n;
    const v = Number(n);
    if(!isFinite(v) || Math.abs(v) < 1e15) return null;
    return exact.get(v) || null;
  }
  function full(n){
    const e = exactOf(n);
    if(e) return (e[0] === '-' ? '-' : '') + commas(e.replace('-', ''));
    const v = Number(n) || 0;
    if(!isFinite(v)) return '∞';
    if(Math.abs(v) >= 1e21) return BigInt(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return v.toLocaleString('ja-JP');
  }
  // 短い表記: 正確な桁がわかるときは「12.3Q」「4.5Dc」のようにゲーム内の表記にそろえる。1e66 以上は 1.23e+80
  function compact(n){
    const e = exactOf(n);
    if(!e) return null;
    const neg = e[0] === '-', d = e.replace('-', ''), len = d.length;
    let out;
    if(len > 66){ out = d[0] + '.' + d.slice(1, 3) + 'e+' + (len - 1); }
    else {
      const g = Math.floor((len - 1) / 3), headLen = len - g * 3;
      const dec = d.slice(headLen, headLen + 1);
      out = d.slice(0, headLen) + (headLen < 3 && dec !== '0' && dec !== '' ? '.' + dec : '') + SUF[g];
    }
    return (neg ? '-' : '') + out;
  }
  window.NXBig = { exact: exactOf, full, compact, scan };
})();
