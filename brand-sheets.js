/* Alexander OS | Sheets Sync Rescue 15.8.5 (2026-10-24)
 * Drop-in replacement for repository-root brand-sheets.js.
 * OAuth runs in the browser. Only financial fields are sent to Google Sheets.
 * This module never deletes local transactions, accounts, notes or passwords.
 */
(() => {
  'use strict';
  const VERSION = '15.8.5-auto-sync-hourly-safe-delete';
  const STATE_KEY = 'alexander_os_v1';
  const SETTINGS_KEY = 'aos_gsheets_sync_v1';
  const DELETION_KEY = 'aos_sheets_pending_deletions_v1';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const TABS = [
    { title: 'AOS_Операции', headers: ['ID','Дата','Тип','Название','Сумма ₽','Категория','Счёт','Обязательность','Контекст','Создано'] },
    { title: 'AOS_Переводы', headers: ['ID','Дата','Откуда','Куда','Сумма ₽','Создано'] },
    { title: 'AOS_Обязательства', headers: ['ID','Тип','Название','Сумма ₽','Срок','Статус'] },
    { title: 'AOS_Счета', headers: ['ID','Название счёта','Тип','Назначение','Текущий баланс ₽','Базовый баланс ₽','Основной','Обновлено'] }
  ];
  const $ = id => document.getElementById(id);
  const safe = v => String(v == null ? '' : v);
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
  const makeFinance = s => ({
    accounts: Array.isArray(s?.accounts) ? s.accounts : [],
    transactions: Array.isArray(s?.transactions) ? s.transactions : [],
    accountTransfers: Array.isArray(s?.accountTransfers) ? s.accountTransfers : [],
    obligations: Array.isArray(s?.obligations) ? s.obligations : []
  });
  let cfg = read(SETTINGS_KEY);
  let accessToken = '', expiresAt = 0, tokenClient = null, busy = false;
  let liveEnabled = false, lastSynced = '', debounceTimer = 0, dialog, statusNode;
  let inMemoryFinance = null, inMemoryTrash = null, localPersisted = true, dataStorageWarning = '';
  let syncAgain = false;
  // Explicit, durable deletions are journaled by record ID. A stale/empty local
  // backup is never sufficient evidence for an automatic deletion in Sheets.
  const fields = ['transactions','accountTransfers','obligations','accounts'];
  const restored = read(DELETION_KEY);
  const pendingRemovals = TABS.map(t => new Set(
    restored.sheetId === cfg.spreadsheetId && Array.isArray(restored[t.title])
      ? restored[t.title].filter(id => typeof id === 'string' && id)
      : []
  ));
  function savePendingRemovals() {
    const saved = { sheetId: cfg.spreadsheetId };
    TABS.forEach((t, i) => { saved[t.title] = [...pendingRemovals[i]]; });
    try { localStorage.setItem(DELETION_KEY, JSON.stringify(saved)); }
    catch (error) { console.warn('[Alexander OS Sheets] Deletion journal could not be persisted',error); }
  }
  function trackRemovals(before, after, incoming) {
    const trash = Array.isArray(incoming.trash) ? incoming.trash : [];
    const collectionFor = ['transactions','accountTransfers','obligations','accounts'];
    let changed = false;
    fields.forEach((key, i) => {
      const beforeIds = new Set((before[key] || []).map(item => safe(item?.id)).filter(Boolean));
      const afterIds = new Set((after[key] || []).map(item => safe(item?.id)).filter(Boolean));
      // A restoration/import that removes many records must not be auto-trusted.
      const removed = [...beforeIds].filter(id => !afterIds.has(id));
      if (removed.length > 0) {
        for (const id of removed) {
          if (trash.some(entry => entry?.collection === collectionFor[i] && safe(entry.item?.id) === id)) {
            pendingRemovals[i].add(id); changed = true;
          }
        }
      }
      for (const id of afterIds) if (pendingRemovals[i].delete(id)) changed = true;
    });
    if (changed) savePendingRemovals();
  }

  // When app.js saves financial data, verify durable storage. On QuotaExceeded,
  // retry without old undo snapshots (history ONLY). Never delete live records.
  // The original app.js silently catches storage errors and keeps a temporary copy.
  // Capture the latest finance fields before that catch so Sheets can sync accurately.
  (function safeguardStorage() {
    const nativeSet = Storage.prototype.setItem;
    if (nativeSet.__aosSyncRescue) return;
    const wrapped = function(key, value) {
      if (key !== STATE_KEY) return nativeSet.call(this, key, value);
      let incoming;
      try { incoming = JSON.parse(String(value)); } catch (_) { return nativeSet.call(this, key, value); }
      const previousFinance = makeFinance(read(STATE_KEY));
      try {
        nativeSet.call(this, key, value);
        localPersisted = true;
        dataStorageWarning = '';
      } catch (originalError) {
        let saved = false;
        const history = Array.isArray(incoming.history) ? incoming.history : [];
        // Undo history is expendable; transactions, accounts and obligations are not.
        const keepOptions = [...new Set([6, 3, 1, 0].filter(n => history.length > n))];
        for (const keep of keepOptions) {
          try {
            const compact = { ...incoming, history: history.slice(0, keep) };
            nativeSet.call(this, key, JSON.stringify(compact));
            saved = true;
            dataStorageWarning = 'Память была переполнена: сокращена история отмены. Финансовые записи сохранены.';
            break;
          } catch (_) { /* Try a smaller undo history only. */ }
        }
        localPersisted = saved;
        if (!saved) {
          dataStorageWarning = 'ВНИМАНИЕ: iPhone не сохранил изменения! Создай полную резервную копию JSON до закрытия приложения.';
          console.error('[Alexander OS] Cannot persist finance state:', originalError);
        }
      }
      inMemoryFinance = makeFinance(incoming);
      inMemoryTrash = Array.isArray(incoming.trash) ? incoming.trash : [];
      if (localPersisted) trackRemovals(previousFinance, inMemoryFinance, incoming);
      window.__AOS_SHEETS_MEMORY_FINANCE = inMemoryFinance;
      window.__AOS_SHEETS_LOCAL_PERSISTED = localPersisted;
      window.dispatchEvent(new Event('aos-finance-changed'));
      // Preserve app.js behavior: it treats a successful return as saved,
      // and previously caught failures silently. We explicitly warn now.
      if (!localPersisted) {
        if (!window.__AOS_SHEETS_WARNED) {
          window.__AOS_SHEETS_WARNED = true;
          setTimeout(() => alert(dataStorageWarning), 150);
        }
        throw new DOMException('Alexander OS: local data not persisted', 'QuotaExceededError');
      }
    };
    wrapped.__aosSyncRescue = true;
    Storage.prototype.setItem = wrapped;
  })();

  function financePayload() {
    const source = inMemoryFinance || read(STATE_KEY);
    const accountNames = new Map((source.accounts || []).map(a => [safe(a.id), safe(a.name)]));
    const transactions = (source.transactions || [])
      .filter(t => t && (t.type === 'income' || t.type === 'expense') && Number.isFinite(Number(t.amount)))
      .map(t => [safe(t.id),safe(t.date),t.type === 'income'?'Доход':'Расход',safe(t.title),Number(t.amount),safe(t.category),accountNames.get(safe(t.accountId))||'',safe(t.necessity),safe(t.scope),safe(t.createdAt)]);
    const transfers = (source.accountTransfers || [])
      .filter(t => t && Number.isFinite(Number(t.amount)))
      .map(t => [safe(t.id),safe(t.date),accountNames.get(safe(t.fromAccountId))||safe(t.fromName),accountNames.get(safe(t.toAccountId))||safe(t.toName),Number(t.amount),safe(t.createdAt)]);
    const obligations = (source.obligations || [])
      .filter(t => t && Number.isFinite(Number(t.amount)))
      .map(t => [safe(t.id),safe(t.type),safe(t.title),Number(t.amount),safe(t.dueDate||t.due),safe(t.status)]);
    const accounts = (source.accounts || [])
      .filter(a => a && a.id && typeof a.name === 'string')
      .map(a => {
        const balance = Number(a.balance);
        const base = Number(a.baseBalance);
        return [safe(a.id), safe(a.name), safe(a.type), safe(a.purpose),
          Number.isFinite(balance) ? balance : 0,
          Number.isFinite(base) ? base : 0,
          a.isDefault ? 'Да' : 'Нет', ''];
      });
    // The timestamp column is intentionally blank here: it is populated at
    // write time, not in the fingerprint, so idle syncs cannot churn forever.
    return [transactions, transfers, obligations, accounts];
  }
  function status(message, kind = '') {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.dataset.kind = kind;
  }
  function fromInputs() {
    const clientId = $('aosGoogleClient').value.trim();
    const rawId = $('aosGoogleSheet').value.trim();
    const match = rawId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const spreadsheetId = match ? match[1] : rawId;
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Введи полный OAuth Client ID (оканчивается на .apps.googleusercontent.com).');
    if (!/^[a-zA-Z0-9_-]{15,200}$/.test(spreadsheetId)) throw new Error('Вставь ссылку на Google Таблицу или её ID.');
    if (clientId !== cfg.clientId || spreadsheetId !== cfg.spreadsheetId) {
      accessToken = ''; expiresAt = 0; liveEnabled = false; lastSynced = '';
      pendingRemovals.forEach(set => set.clear());
    }
    const changed = clientId !== cfg.clientId || spreadsheetId !== cfg.spreadsheetId;
    cfg = { clientId, spreadsheetId };
    if (changed) {
      savePendingRemovals();
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); }
      catch (error) { dataStorageWarning = 'Настройки Google не сохранились на устройстве: хранилище переполнено.'; console.warn(dataStorageWarning,error); }
    }
  }
  async function ensureGIS() {
    if (window.google?.accounts?.oauth2) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google Identity Services не загружен. Проверь интернет.'));
      document.head.appendChild(script);
    });
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services недоступен.');
  }
  async function login() {
    fromInputs();
    await ensureGIS();
    status('Подключение к Google… После входа обновление данных будет автоматическим.');
    await new Promise((resolve,reject) => {
      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id:cfg.clientId,scope:SCOPE,callback:response => {
            if (response.error || !response.access_token) {
              reject(new Error(response.error_description || response.error || 'Вход отменён.'));return;
            }
            accessToken=response.access_token;
            expiresAt=Date.now()+(Math.max(60,Number(response.expires_in)||3600)-30)*1000;
            resolve();
          }
        });
        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {reject(err);}
    });
    liveEnabled = true;
    status('Google подключён. Дальше доходы, расходы, переводы и балансы отправляются автоматически.');
    await sync(true);
  }
  async function googleApi(path, options = {}) {
    if (!accessToken || Date.now() >= expiresAt) throw new Error('Срок входа истёк. Нажми «Войти через Google» ещё раз.');
    const response = await fetch(API+encodeURIComponent(cfg.spreadsheetId)+path, {
      ...options,
      headers:{Authorization:'Bearer '+accessToken,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}
    });
    if (!response.ok) {
      let details='';try { details=(await response.json())?.error?.message||''; } catch (_) {}
      throw new Error('Google Sheets HTTP '+response.status+(details?': '+details:''));
    }
    return response.status===204?{}:response.json();
  }
  const quote = tab => "'"+tab.replace(/'/g,"''")+"'";
  async function ensureTabs() {
    const result=await googleApi('?fields=sheets.properties.title');
    const known = new Set((result.sheets||[]).map(item => item.properties?.title));
    const missing = TABS.filter(t=>!known.has(t.title));
    if (!missing.length)return;
    await googleApi(':batchUpdate',{method:'POST',body:JSON.stringify({requests:missing.map(t=>({addSheet:{properties:{title:t.title}}}))})});
  }
  function rangeParams(tabs, tail) {
    return tabs.map(t=>'ranges='+encodeURIComponent(quote(t.title)+'!'+tail)).join('&');
  }
  function sourceSummary(rows) {
    const last = rows[0].at(-1);
    return rows[0].length+' операций, '+rows[1].length+' переводов, '+rows[2].length+' обязательств, '+rows[3].length+' счетов'+(last?' · последняя в выгрузке: '+safe(last[1]):'');
  }
  async function sync(force = false, audit = false) {
    if (busy) { syncAgain = true; return; }
    if (!liveEnabled || !cfg.spreadsheetId || !accessToken) { status('Нужен вход в Google. Данные остаются в Alexander OS.', 'error');return; }
    if (Date.now() >= expiresAt) {
      liveEnabled=false;
      status('Срок доступа Google истёк. Нажми «Войти через Google» один раз. Несинхронизированные данные сохранены на устройстве.', 'error');
      return;
    }
    const data = financePayload();
    const fingerprint = JSON.stringify(data);
    if (!force && !audit && fingerprint === lastSynced) return;
    busy=true;
    status('Проверяем актуальные расходы и состояние Google Таблицы…');
    try {
      await ensureTabs();
      const requestRanges = TABS.map(t => quote(t.title)+'!A1:J');
      const query = requestRanges.map(r=>'ranges='+encodeURIComponent(r)).join('&');
      const current = await googleApi('/values:batchGet?'+query);
      const currentTables = (current.valueRanges||[]).map(entry => entry.values||[]);
      // Alexander OS moves explicitly deleted transactions into its local trash.
      // This persisted evidence survives reopening the PWA and is safer than a
      // raw row-count comparison or a transient in-memory deletion journal.
      const trash = inMemoryTrash || read(STATE_KEY).trash || [];
      const collectionFor = ['transactions','accountTransfers','obligations','accounts'];
      const deletedByUser = TABS.map((_,i) => new Set((Array.isArray(trash) ? trash : [])
        .filter(entry => entry?.collection === collectionFor[i] && entry.item?.id)
        .map(entry => safe(entry.item.id))));
      const acceptedRemovals = TABS.map(() => []);
      for (let i=0; i<TABS.length; i++) {
        const oldRows = (currentTables[i] || []).slice(1).filter(row => row.some(value => safe(value).trim()));
        const remoteIds = oldRows.map(row => safe(row[0]).trim()).filter(Boolean);
        const localIds = new Set(data[i].map(row => safe(row[0]).trim()).filter(Boolean));
        const missing = remoteIds.filter(id => !localIds.has(id));
        const invalidIds = oldRows.length !== remoteIds.length || new Set(remoteIds).size !== remoteIds.length;
        if (invalidIds) throw new Error('В «'+TABS[i].title+'» обнаружены пустые или повторяющиеся ID. Автоочистка остановлена.');
        if (!missing.length) continue;
        const allProven = missing.every(id => deletedByUser[i].has(id));
        // A small, explicitly evidenced deletion is safe. A large disappearance
        // may mean browser storage corruption or an accidental import.
        const small = missing.length <= 10 && missing.length <= Math.max(2, Math.ceil(remoteIds.length * 0.10));
        const autoDelete = allProven && small && localPersisted && data[i].length > 0;
        if (!autoDelete) {
          if (!force) throw new Error('В «'+TABS[i].title+'» есть '+missing.length+
            ' записей, которых нет в приложении. Нет достаточного подтверждения их удаления. '+
            'Автоочистка остановлена для защиты истории.');
          const yes = confirm('В Google Таблице '+missing.length+' записей отсутствуют в Alexander OS. '+
            'Они будут удалены из таблицы. Ты уверен, что эти операции действительно удалены в приложении?');
          if (!yes) throw new Error('Удаление отменено. Данные Google не изменены.');
        }
        acceptedRemovals[i] = missing;
      }
      status('Отправляем: '+sourceSummary(data));
      const syncedAt = new Date().toISOString();
      const updates = TABS.map((tab,i)=>({
        range:quote(tab.title)+'!A1',
        majorDimension:'ROWS',
        values:[tab.headers,...(tab.title==='AOS_Счета'
          ? data[i].map(row=>[...row.slice(0,7),syncedAt])
          : data[i])]
      }));
      await googleApi('/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data:updates})});
      const stale=[];
      TABS.forEach((tab,i)=>{const old=currentTables[i]?.length||0;const keep=1+data[i].length;if(old>keep)stale.push(quote(tab.title)+'!A'+(keep+1)+':J'+old);});
      if (stale.length) await googleApi('/values:batchClear',{method:'POST',body:JSON.stringify({ranges:stale})});
      // Server-side readback: don't claim success merely because the write was accepted.
      const verificationRanges=TABS.map((t,i)=>quote(t.title)+'!A1:A'+Math.max(2, data[i].length+1));
      const verified=await googleApi('/values:batchGet?'+verificationRanges.map(r=>'ranges='+encodeURIComponent(r)).join('&'));
      const results=verified.valueRanges||[];
      for(let i=0;i<TABS.length;i++) {
        const values=results[i]?.values||[];
        const actual=values.slice(1).filter(row=>safe(row[0]).trim());
        const expected=data[i];
        if (actual.length!==expected.length) throw new Error('Google вернул '+actual.length+' строк для «'+TABS[i].title+'» вместо '+expected.length+'.');
        for (let j=0;j<expected.length;j++) {
          if (safe(actual[j]?.[0])!==safe(expected[j]?.[0]))
            throw new Error('ID записи '+(j+1)+' не совпал после записи в «'+TABS[i].title+'».');
        }
      }
      lastSynced = fingerprint;
      acceptedRemovals.forEach((ids,i)=>ids.forEach(id=>pendingRemovals[i].delete(id)));
      if (acceptedRemovals.some(ids=>ids.length)) savePendingRemovals();
      const removedCount = acceptedRemovals.reduce((sum,ids)=>sum+ids.length,0);
      const removedLabel = removedCount ? ' Удалено из таблицы: '+removedCount+'.' : '';
      const storageLabel = localPersisted ? '' : ' ВНИМАНИЕ: данные не записаны в память iPhone, срочно экспортируй резервную копию JSON.';
      status('Проверено в Google: '+sourceSummary(data)+'. '+new Date().toLocaleTimeString('ru-RU')+'.'+removedLabel+storageLabel+(dataStorageWarning?' '+dataStorageWarning:''),localPersisted?'success':'error');
    } catch(error) {
      if(/401|403|истёк/.test(error.message))liveEnabled=false;
      status('Синхронизация НЕ завершена: '+error.message,'error');
      console.error('[Alexander OS Sheets sync rescue]',error);
    } finally {
      busy=false;
      if(syncAgain) { syncAgain=false; queueSync(); }
    }
  }
  function queueSync(){
    if(!liveEnabled||document.hidden)return;
    if(busy){syncAgain=true;return;}
    if(Date.now() >= expiresAt) {
      liveEnabled=false;
      status('Google просит обновить доступ. Один раз нажми «Войти через Google». Новые записи останутся в Alexander OS.', 'error');
      return;
    }
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>sync(false),800);
  }
  function csv() {
    const rows=financePayload()[0];
    const quoteCsv=v=>'"'+safe(v).replace(/"/g,'""')+'"';
    const text='\ufeff'+[TABS[0].headers,...rows].map(r=>r.map(quoteCsv).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='alexander-os-finance-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('CSV выгружен из актуального состояния: '+rows.length+' операций.','success');
  }
  function openDialog(){
    $('aosGoogleClient').value=cfg.clientId||'';
    $('aosGoogleSheet').value=cfg.spreadsheetId||'';
    dialog.showModal();
    const local=financePayload()[0].length;
    status('Версия '+VERSION+' · На устройстве: '+local+' операций. '+(liveEnabled?'Google подключён. Изменения отправляются автоматически.':'Для отправки один раз войди через Google.')+(dataStorageWarning?' '+dataStorageWarning:''),liveEnabled?'success':'');
  }
  function setup() {
    if (!$('aosSheetTrigger'))return;
    dialog=document.createElement('dialog'); dialog.className='aos-sync-dialog';dialog.id='aosSyncDialog';
    dialog.innerHTML=`<div class="aos-sync-panel"><header class="aos-sync-head"><div><h2>Google Таблицы</h2><small>Sync Rescue ${VERSION}</small><p>Доходы, расходы, переводы, обязательства и балансы всех счетов. Автоотправка при сохранении.</p></div><button id="aosSyncClose" type="button" aria-label="Закрыть">✕</button></header><label class="aos-sync-label">OAuth Client ID<input id="aosGoogleClient" type="text" inputmode="url" autocomplete="off" placeholder="…apps.googleusercontent.com"></label><label class="aos-sync-label">Ссылка на Google Таблицу<input id="aosGoogleSheet" type="text" autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/…"></label><div class="aos-sync-actions"><button type="button" id="aosSyncLogin">Войти через Google</button><button type="button" id="aosSyncNow">Обновить сейчас</button><button type="button" id="aosSyncCSV">Скачать CSV</button><button type="button" id="aosSyncDisconnect">Отключить</button></div><div class="aos-sync-state" id="aosSyncStatus" role="status" aria-live="polite"></div><p class="aos-sync-note">После входа в Google изменения передаются автоматически. Каждый час при открытом приложении проверяем Google Таблицу, а при возвращении в приложение проверяем пропущенные изменения. Веб-версия Google требует повторного нажатия «Войти» после завершения сессии или истечения доступа. Закрывать приложение можно: записи остаются в локальном хранилище. Сохранение не заменяет резервную копию. При закрытом iPhone фоновая отправка не работает.</p></div>`;
    document.body.append(dialog);statusNode=$('aosSyncStatus');
    const style=document.createElement('style');style.id='aosSyncRescueStyle';style.textContent=`
      .aos-sync-dialog{box-sizing:border-box;width:min(92vw,540px);max-width:540px;max-height:min(85dvh,790px);overflow-y:auto;overscroll-behavior:contain;border:1px solid #333;border-radius:24px;background:#111414;color:#f5f7f5;padding:0;box-shadow:0 24px 90px #0009;}
      .aos-sync-dialog::backdrop{background:#000b;}
      .aos-sync-dialog *, .aos-sync-dialog *::before{box-sizing:border-box;}
      .aos-sync-dialog .aos-sync-panel{padding:22px;display:grid;gap:16px;min-width:0;}
      .aos-sync-dialog .aos-sync-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
      .aos-sync-dialog h2{font-size:23px;margin:0;color:#fff;}
      .aos-sync-dialog .aos-sync-head p{color:#abb2ae;font-size:13px;line-height:1.45;margin:6px 0 0;}
      .aos-sync-dialog .aos-sync-head small{font-size:11px;color:#B9FD50;}
      .aos-sync-dialog #aosSyncClose{flex-shrink:0;width:42px;height:42px;border-radius:12px;background:#222;color:#fff;border:1px solid #444;}
      .aos-sync-dialog .aos-sync-label{display:grid;gap:7px;font-size:13px;color:#c9d0cc;min-width:0;}
      .aos-sync-dialog input{display:block;width:100%;min-width:0;max-width:100%;padding:14px;border:1px solid #404747;border-radius:12px;background:#1b2220;color:#fff;font:400 16px/1.3 system-ui;}
      .aos-sync-dialog .aos-sync-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0;}
      .aos-sync-dialog .aos-sync-actions button{min-width:0;min-height:44px;padding:10px 8px;white-space:normal;word-break:normal;border:0;border-radius:10px;font:700 13px/1.25 system-ui;background:#B9FD50;color:#111;}
      .aos-sync-dialog .aos-sync-actions button:nth-child(n+3){background:#26312b;color:#d8eddf;border:1px solid #45564b;}
      .aos-sync-dialog .aos-sync-state{padding:12px;border-radius:12px;font-size:13px;line-height:1.5;background:#1b2820;color:#e2f1e6;overflow-wrap:anywhere;}
      .aos-sync-dialog .aos-sync-state[data-kind="error"]{background:#361c1c;color:#ffb2b2;}
      .aos-sync-dialog .aos-sync-note{font-size:11px;line-height:1.6;color:#9ca9a2;margin:0;}
      @media(max-width:380px){.aos-sync-dialog .aos-sync-panel{padding:16px;}.aos-sync-dialog .aos-sync-actions{grid-template-columns:1fr 1fr;}}
    `;document.head.append(style);
    $('aosSheetTrigger').addEventListener('click',openDialog);
    $('aosSyncClose').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    $('aosSyncLogin').addEventListener('click',async()=>{try{await login();}catch(e){status(e.message,'error');}});
    $('aosSyncNow').addEventListener('click',async()=>{try{fromInputs();if(!liveEnabled)throw new Error('Сначала войди через Google.');await sync(true);}catch(e){status(e.message,'error');}});
    $('aosSyncCSV').addEventListener('click',csv);
    $('aosSyncDisconnect').addEventListener('click',()=>{if(accessToken&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(accessToken,()=>{});accessToken='';expiresAt=0;lastSynced='';liveEnabled=false;status('Google отключён. Локальные данные не удалены.','success');});
    window.addEventListener('aos-finance-changed',queueSync);
    // A finance change is emitted by the installed Storage.setItem safeguard,
    // so the update is scheduled automatically without the Refresh button.

    window.addEventListener('aos-finance-updated',queueSync);
    window.addEventListener('storage',e=>{if(e.key===STATE_KEY){inMemoryFinance=null;queueSync();}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync();});
    window.addEventListener('pageshow',queueSync);
    window.addEventListener('online',queueSync);
    // Every hour, verify the Google copy even when local data has not changed.
    // iOS suspends timers when the PWA is closed or backgrounded.
    setInterval(()=>{if(liveEnabled&&!document.hidden)sync(false,true);},60*60*1000);
    setInterval(queueSync,7000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
