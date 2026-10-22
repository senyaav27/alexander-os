/* Alexander OS -> Google Sheets (financial fields only).
   Works in GitHub Pages via Google Identity Services OAuth token flow.
   No API secrets, banking details, notes, tasks, passwords or full state exported.
   Sync only while page is open AND a Google OAuth access token is valid.
*/
(() => {
  'use strict';
  const STATE_KEY = 'alexander_os_v1';
  const SETTINGS_KEY = 'aos_gsheets_sync_v1';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const TABS = [
    {title:'AOS_Операции', headers:['ID','Дата','Тип','Название','Сумма ₽','Категория','Счёт','Обязательность','Контекст','Создано']},
    {title:'AOS_Переводы', headers:['ID','Дата','Откуда','Куда','Сумма ₽','Создано']},
    {title:'AOS_Обязательства',headers:['ID','Тип','Название','Сумма ₽','Срок','Статус']}
  ];
  const $ = id => document.getElementById(id);
  const safe = value => String(value == null ? '' : value);
  const load = key => {try{return JSON.parse(localStorage.getItem(key) || '{}') || {}}catch{return {}}};
  let cfg = load(SETTINGS_KEY);
  let accessToken = '';
  let expiry = 0;
  let tokenClient = null;
  let busy = false;
  let lastSynced = '';
  let debounceTimer = 0;
  let liveEnabled = false;
  let dialog, statusNode;

  function financePayload() {
    const source = load(STATE_KEY);
    const accounts = new Map((Array.isArray(source.accounts) ? source.accounts : []).map(a => [safe(a.id), safe(a.name)]));
    const tx = (Array.isArray(source.transactions) ? source.transactions : [])
      .filter(t => t && (t.type === 'income' || t.type === 'expense') && Number.isFinite(Number(t.amount)))
      .map(t => [safe(t.id),safe(t.date),t.type==='income'?'Доход':'Расход',safe(t.title),Number(t.amount),safe(t.category),accounts.get(safe(t.accountId))||'',safe(t.necessity),safe(t.scope),safe(t.createdAt)]);
    const transfers = (Array.isArray(source.accountTransfers) ? source.accountTransfers : [])
      .filter(t => t && Number.isFinite(Number(t.amount)))
      .map(t => [safe(t.id),safe(t.date),accounts.get(safe(t.fromAccountId))||safe(t.fromName),accounts.get(safe(t.toAccountId))||safe(t.toName),Number(t.amount),safe(t.createdAt)]);
    const obligations = (Array.isArray(source.obligations) ? source.obligations : [])
      .filter(t => t && Number.isFinite(Number(t.amount)))
      .map(t => [safe(t.id),safe(t.type),safe(t.title),Number(t.amount),safe(t.dueDate||t.due),safe(t.status)]);
    return [tx, transfers, obligations];
  }
  function setStatus(msg, kind = '') {
    if (!statusNode) return;
    statusNode.textContent = msg;
    statusNode.dataset.kind = kind;
  }
  function saveCfg() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); }
  function normalizeSheetId(s) {
    const v = s.trim();
    const match = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : v;
  }
  function validSheetId(s) { return /^[a-zA-Z0-9_-]{15,200}$/.test(s); }
  function validClientId(s) {return /^[\w-]+\.apps\.googleusercontent\.com$/.test(s);}
  function fromInputs() {
    const next = {clientId:$('aosGoogleClient').value.trim(),spreadsheetId:normalizeSheetId($('aosGoogleSheet').value)};
    if (!validClientId(next.clientId)) throw new Error('Укажи корректный OAuth Client ID Google (заканчивается на .apps.googleusercontent.com).');
    if (!validSheetId(next.spreadsheetId)) throw new Error('Укажи ID или ссылку на Google Таблицу.');
    if (next.clientId!==cfg.clientId || next.spreadsheetId!==cfg.spreadsheetId) {
      accessToken = '';expiry = 0;lastSynced = '';liveEnabled = false;
    }
    cfg = next;
    saveCfg();
  }
  async function ensureGIS() {
    if (window.google?.accounts?.oauth2) return;
    await new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src='https://accounts.google.com/gsi/client';
      script.async=true;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('Не удалось загрузить Google Identity Services. Проверь подключение к интернету.'));
      document.head.appendChild(script);
    });
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services не инициализирован.');
  }
  async function login() {
    fromInputs();
    await ensureGIS();
    setStatus('Ожидается разрешение Google…');
    await new Promise((resolve,reject) => {
      try {
        tokenClient=google.accounts.oauth2.initTokenClient({
          client_id:cfg.clientId,scope:SCOPE,callback:response=>{
            if (response.error || !response.access_token) {
              reject(new Error(response.error_description || response.error || 'Авторизация отменена.'));
              return;
            }
            accessToken=response.access_token;
            expiry=Date.now()+(Math.max(60,Number(response.expires_in)||3600)-30)*1000;
            resolve();
          }
        });
        tokenClient.requestAccessToken({prompt:'consent'});
      } catch(error){reject(error)}
    });
    liveEnabled=true;
    setStatus('Google подключён. Синхронизация доступна, пока приложение открыто и действует разрешение.', 'success');
    await sync(true);
  }
  async function callGoogle(path, options = {}) {
    if (!accessToken || Date.now() >= expiry) throw new Error('Срок авторизации истёк. Открой подключение и нажми «Войти через Google» повторно.');
    const response = await fetch(API+encodeURIComponent(cfg.spreadsheetId)+path, {
      ...options,
      headers:{Authorization:'Bearer '+accessToken,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}
    });
    if(!response.ok){
      let details='';try {details=(await response.json())?.error?.message||''}catch{}
      throw new Error('Google Sheets HTTP '+response.status+(details?': '+details:''));
    }
    if(response.status===204)return {};
    return response.json();
  }
  const range = tab => "'"+tab.replace(/'/g,"''")+"'";
  async function ensureTabs() {
    const meta=await callGoogle('?fields=sheets.properties.title');
    const existing=new Set((meta.sheets||[]).map(s=>s.properties?.title));
    const missing=TABS.filter(t=>!existing.has(t.title));
    if(!missing.length)return;
    await callGoogle(':batchUpdate',{method:'POST',body:JSON.stringify({requests:missing.map(t=>({addSheet:{properties:{title:t.title}}}))})});
  }
  async function sync(force = false) {
    if (busy || !liveEnabled || !cfg.spreadsheetId || !accessToken) return;
    const rows=financePayload();
    const fingerprint=JSON.stringify(rows);
    if(!force && fingerprint===lastSynced)return;
    busy=true;
    setStatus('Передача финансовых операций в Google Таблицу…');
    try {
      await ensureTabs();
      const ranges=TABS.map(t=>range(t.title)+'!A1:J');
      const current=await callGoogle('/values:batchGet?'+ranges.map(r=>'ranges='+encodeURIComponent(r)).join('&'));
      const oldCounts=(current.valueRanges||[]).map(v=>(v.values||[]).length);
      const updates=TABS.map((tab,i)=>({
        range:range(tab.title)+'!A1',majorDimension:'ROWS',values:[tab.headers,...rows[i]]
      }));
      await callGoogle('/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data:updates})});
      const stale=[];
      TABS.forEach((tab,i)=>{const keep=1+rows[i].length;const old=oldCounts[i]||0;if(old>keep)stale.push(range(tab.title)+'!A'+(keep+1)+':J'+old)});
      if(stale.length)await callGoogle('/values:batchClear',{method:'POST',body:JSON.stringify({ranges:stale})});
      lastSynced=fingerprint;
      setStatus('Синхронизировано: '+rows[0].length+' операций, '+rows[1].length+' переводов, '+rows[2].length+' обязательств. '+new Date().toLocaleTimeString('ru-RU'), 'success');
      const indicator=$('aosSheetTrigger');if(indicator)indicator.title='Google Таблицы: синхронизировано';
    } catch(error){
      if(/401|403|истёк/.test(error.message))liveEnabled=false;
      setStatus('Не удалось синхронизировать: '+error.message,'error');
      console.error('[AOS Google Sheets]',error);
    } finally {busy=false}
  }
  function queueSync() {
    if(!liveEnabled || document.hidden || busy)return;
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>sync(false),1100);
  }
  function exportCSV() {
    const data=financePayload();
    const tab=TABS[0];
    const serialize=v=>'"'+safe(v).replace(/"/g,'""')+'"';
    const output='\uFEFF'+[tab.headers,...data[0]].map(r=>r.map(serialize).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([output],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='alexander-os-finance-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
    setStatus('CSV финансовых операций сохранён. Никакие данные не отправлялись в сеть.','success');
  }
  function openDialog() {
    if(!dialog)return;
    $('aosGoogleClient').value=cfg.clientId||'';
    $('aosGoogleSheet').value=cfg.spreadsheetId||'';
    dialog.showModal();
    if(liveEnabled)setStatus('Подключено к Google. Отправка выполняется при изменении операций, пока приложение открыто.','success');
    else setStatus('Подключение выключено. Для автоматической передачи откройте доступ Google.');
  }
  function init() {
    dialog=document.createElement('dialog');dialog.className='aos-sync-dialog';dialog.id='aosSyncDialog';
    dialog.innerHTML=`<div class="aos-sync-panel"><div class="aos-sync-head"><div><h2>Google Таблицы</h2><p>Передача только доходов, расходов, переводов и обязательств.</p></div><button type="button" id="aosSyncClose" aria-label="Закрыть">✕</button></div><label>OAuth Client ID<input id="aosGoogleClient" type="text" inputmode="url" autocomplete="off" placeholder="…apps.googleusercontent.com"></label><label>ID или ссылка на Google Таблицу<input id="aosGoogleSheet" type="text" autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/…"></label><div class="aos-sync-actions"><button type="button" class="action" id="aosSyncLogin">Войти через Google</button><button type="button" class="action secondary" id="aosSyncNow">Обновить сейчас</button><button type="button" class="action secondary" id="aosSyncCSV">Скачать CSV</button><button type="button" class="action secondary" id="aosSyncDisconnect">Отключить</button></div><div id="aosSyncStatus" class="aos-sync-state" role="status" aria-live="polite"></div><p class="aos-sync-note">Нужен Google OAuth Client ID для вашего адреса GitHub Pages. Токен хранится только в памяти вкладки. После закрытия приложения повторный вход может понадобиться. Фоновая синхронизация с закрытого iPhone недоступна. <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></p></div>`;
    document.body.appendChild(dialog);statusNode=$('aosSyncStatus');
    $('aosSheetTrigger')?.addEventListener('click',openDialog);
    $('aosSyncClose').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
    $('aosSyncLogin').addEventListener('click',async()=>{try{await login()}catch(e){setStatus(e.message,'error')}});
    $('aosSyncNow').addEventListener('click',async()=>{try {fromInputs();if(!liveEnabled)throw new Error('Сначала войди через Google.');await sync(true)}catch(e){setStatus(e.message,'error')}});
    $('aosSyncCSV').addEventListener('click',exportCSV);
    $('aosSyncDisconnect').addEventListener('click',()=>{if(accessToken&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(accessToken,()=>{});accessToken='';expiry=0;lastSynced='';liveEnabled=false;setStatus('Отключено. Токен удалён из памяти.','success')});
    setInterval(queueSync,7000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync()});
    window.addEventListener('storage',e=>{if(e.key===STATE_KEY)queueSync()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
