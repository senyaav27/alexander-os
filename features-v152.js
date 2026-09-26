(() => {
  'use strict';

  const BUILD = '15.2.0';
  const STATE_KEY = 'alexander_os_v1';
  const PREFS_KEY = 'alexander_os_v152_prefs';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  const money = value => `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(value||0))} ₽`;
  const pad = value => String(value).padStart(2,'0');
  const monthKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}`;
  const currentMonth = () => monthKey(new Date());
  const monthDate = key => { const [y,m] = String(key||currentMonth()).split('-').map(Number); return new Date(y||new Date().getFullYear(), Math.max(0,(m||1)-1), 1); };
  const shiftMonth = (key, delta) => { const d = monthDate(key); d.setMonth(d.getMonth()+delta); return monthKey(d); };
  const monthLabel = key => new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(monthDate(key)).replace(/^./,m=>m.toUpperCase());
  const sum = items => items.reduce((total,item)=>total+Number(item||0),0);

  const DEFAULT_PREFS = {
    labels: {
      capital: 'Общий капитал',
      income: 'Цель дохода',
      cushion: 'Финансовая подушка',
      payday: 'Деньги до зарплаты',
      focus: 'Фокус дня',
      weekExpense: 'Расходы за неделю'
    }
  };

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (error) { console.error('[AOS V15.2] state read failed', error); return {}; }
  }

  function loadPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
      return { ...DEFAULT_PREFS, ...raw, labels: { ...DEFAULT_PREFS.labels, ...(raw.labels || {}) } };
    } catch (_) { return typeof structuredClone === 'function' ? structuredClone(DEFAULT_PREFS) : JSON.parse(JSON.stringify(DEFAULT_PREFS)); }
  }

  function savePrefs(prefs) { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }

  const ICONS = {
    profile:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-4 3.2-6 7-6s6.4 2 7 6"/></svg>',
    shield:'<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.8-2.8 8.1-7 10-4.2-1.9-7-5.2-7-10V6z"/><path d="M9 12l2 2 4-5"/></svg>',
    home:'<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
    target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 3V1M21 12h2"/></svg>',
    bell:'<svg viewBox="0 0 24 24"><path d="M6 17h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.8z"/><path d="M10 20h4"/></svg>',
    wallet:'<svg viewBox="0 0 24 24"><path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6z"/><path d="M16 11h5v4h-5a2 2 0 1 1 0-4z"/></svg>',
    body:'<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.4"/><path d="M8 10c1-1.5 2.2-2.2 4-2.2s3 .7 4 2.2M9 9l-1 5 2 7M15 9l1 5-2 7M8 14h8"/></svg>',
    backup:'<svg viewBox="0 0 24 24"><path d="M6 5h9l3 3v11H6z"/><path d="M9 5v5h6V5M9 16h6"/></svg>',
    export:'<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 13v7h14v-7"/></svg>',
    import:'<svg viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 13v7h14v-7"/></svg>',
    ai:'<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/></svg>',
    history:'<svg viewBox="0 0 24 24"><path d="M4 6v5h5"/><path d="M5.5 17a8 8 0 1 0-1.2-8"/><path d="M12 8v5l3 2"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/></svg>',
    check:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12l2.5 2.5L16 9"/></svg>',
    repeat:'<svg viewBox="0 0 24 24"><path d="M7 7h10l-2-2M17 17H7l2 2M19 7v4M5 17v-4"/></svg>',
    notes:'<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    phone:'<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M11 19h2"/></svg>',
    lock:'<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    labels:'<svg viewBox="0 0 24 24"><path d="M4 5h11l5 5-10 10-6-6z"/><circle cx="9" cy="10" r="1.2"/></svg>',
    appearance:'<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="2"/><path d="M6 17l4-4 3 3 2-2 3 3"/></svg>'
  };

  const SETTINGS_ICON_MAP = {
    profileSettings:'profile', securitySettings:'shield', homePreferences:'home', financePreferences:'target',
    notificationSettings:'bell', budgetSettings:'wallet', bodySettings:'body', exportEncryptedData:'backup',
    exportData:'export', exportChatGPT:'ai', openHistory:'history', openTrash:'trash', openDiagnostics:'check',
    openRecurringFromSettings:'repeat', openKnowledgeBase:'notes', installHelp:'phone', lockNow:'lock'
  };

  const CORE_SETTINGS_CHILDREN = new Set([
    'profileSettings','securitySettings','homePreferences','financePreferences','budgetSettings','bodySettings',
    'openKnowledgeBase','openHistory','openTrash','openDiagnostics','openRecurringFromSettings'
  ]);

  function iconForCategory(category) {
    const common = {
      groceries:'<svg viewBox="0 0 24 24"><path d="M7 3v7M10 3v7M7 7h3M8.5 10v11M16 3c2 3 2 7 0 9v9"/></svg>',
      cafes:'<svg viewBox="0 0 24 24"><path d="M5 5h11v8a5 5 0 0 1-10 0z"/><path d="M16 7h2a2 2 0 0 1 0 4h-2M5 21h12"/></svg>',
      housing:'<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/></svg>',
      transport:'<svg viewBox="0 0 24 24"><path d="M5 6h14l2 6v6H3v-6z"/><path d="M7 18v2M17 18v2M5 12h14M7 15h1M16 15h1"/></svg>',
      taxi:'<svg viewBox="0 0 24 24"><path d="M5 8h14l2 5v5H3v-5zM8 8l1-3h6l1 3M7 15h1M16 15h1"/></svg>',
      subscriptions:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h5"/></svg>',
      health:'<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8 12h2l1-2 2 4 1-2h2"/></svg>',
      clothing:'<svg viewBox="0 0 24 24"><path d="M8 4l4 2 4-2 4 4-3 3v10H7V11L4 8z"/></svg>',
      entertainment:'<svg viewBox="0 0 24 24"><path d="M5 7h14l2 10H3z"/><path d="M8 12h4M10 10v4M16 11h.1M18 14h.1"/></svg>',
      education:'<svg viewBox="0 0 24 24"><path d="M3 9l9-5 9 5-9 5z"/><path d="M6 11v5c4 3 8 3 12 0v-5"/></svg>',
      business:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></svg>',
      gifts:'<svg viewBox="0 0 24 24"><path d="M4 9h16v12H4zM3 6h18v4H3zM12 6v15"/><path d="M12 6c-4 0-5-4-2-4 2 0 2 2 2 4M12 6c4 0 5-4 2-4-2 0-2 2-2 4"/></svg>',
      debt_payment:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 8h4a2 2 0 0 1 0 4H9h5a2 2 0 0 1 0 4H9M12 6v12"/></svg>',
      travel:'<svg viewBox="0 0 24 24"><path d="M3 13l18-8-6 15-3-6zM12 14L21 5"/></svg>',
      other_expense:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8 12h.1M12 12h.1M16 12h.1"/></svg>'
    };
    return common[category] || common.other_expense;
  }

  const LABEL_TO_CATEGORY = {
    'Продукты':'groceries','Кафе и доставка':'cafes','Рестораны':'cafes','Жильё':'housing','Транспорт':'transport','Такси':'taxi',
    'Подписки':'subscriptions','Здоровье':'health','Одежда':'clothing','Развлечения':'entertainment','Обучение':'education',
    'Бизнес':'business','Подарки':'gifts','Долги и кредиты':'debt_payment','Путешествия':'travel','Другое':'other_expense'
  };

  function patchDashboard() {
    if (document.body.dataset.screen !== 'dashboard') return;
    const prefs = loadPrefs();
    const hero = $('.home-premium-capital[data-value-source]');
    if (hero) {
      const key = hero.dataset.valueSource;
      const label = $('.home-capital-head small', hero);
      if (label && prefs.labels[key]) label.textContent = prefs.labels[key];
    }
    $$('.home-goal-card[data-home-metric]').forEach(card => {
      const label = $('.home-goal-title small', card);
      const key = card.dataset.homeMetric;
      if (label && prefs.labels[key]) label.textContent = prefs.labels[key];
    });
    const budget = $('#openBudgetModule');
    if (budget) {
      const label = $('small', budget);
      if (label) label.textContent = prefs.labels.payday;
      if (!$('.aos-mini-info', budget)) {
        const state = loadState();
        const info = document.createElement('span');
        info.className = 'aos-mini-info';
        const next = state.profile?.nextSalaryDate ? new Date(`${state.profile.nextSalaryDate}T12:00:00`) : null;
        const today = new Date(); today.setHours(12,0,0,0);
        const days = next && !Number.isNaN(next.getTime()) ? Math.max(1, Math.ceil((next-today)/86400000)) : null;
        const reserve = Number(state.profile?.dailyBudgetReserve || 0);
        info.textContent = `${days ? `${days} дн.` : 'дата не задана'}${reserve ? ` · лимит ${money(reserve)}` : ''}`;
        budget.append(info);
      }
    }
    const focus = $('#openFocusModule');
    if (focus) { const label = $('small', focus); if (label) label.textContent = prefs.labels.focus; }
    const week = $('.home-week-expense-card .home-week-copy small');
    if (week) week.textContent = prefs.labels.weekExpense;
  }

  function ensureFeatureDialog() {
    let dialog = $('#aosFeatureDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'aosFeatureDialog';
    dialog.innerHTML = `
      <form class="aos152-sheet" id="aosFeatureForm" novalidate>
        <div class="aos152-sheet-head"><div><small>Alexander OS</small><h2 id="aosFeatureTitle">Настройка</h2></div><button class="aos152-close" type="button" aria-label="Закрыть">×</button></div>
        <div id="aosFeatureBody"></div>
        <div class="aos152-sheet-actions"><button class="aos152-reset" id="aosFeatureReset" type="button">По умолчанию</button><button class="aos152-save" type="submit">Сохранить</button></div>
      </form>`;
    document.body.append(dialog);
    $('.aos152-close', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', e => { e.preventDefault(); dialog.close(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    return dialog;
  }

  function openDashboardLabels() {
    const dialog = ensureFeatureDialog();
    const prefs = loadPrefs();
    $('#aosFeatureTitle', dialog).textContent = 'Названия на главной';
    $('#aosFeatureBody', dialog).innerHTML = `
      <div class="aos152-help"><b>Меняются только подписи</b><p>Расчёты и логика показателей остаются прежними. Можно назвать блоки так, как удобнее тебе.</p></div>
      <div class="aos152-label-grid">
        ${[
          ['capital','Общий капитал'],['income','Цель дохода'],['cushion','Финансовая подушка'],
          ['payday','Деньги до зарплаты'],['focus','Фокус дня'],['weekExpense','Расходы за неделю']
        ].map(([key,label],i)=>`<label class="aos152-field ${i>3?'wide':''}"><span>${label}</span><input name="${key}" maxlength="32" value="${esc(prefs.labels[key])}"></label>`).join('')}
      </div>`;
    $('#aosFeatureReset', dialog).onclick = () => {
      $$('input', dialog).forEach(input => { if (DEFAULT_PREFS.labels[input.name]) input.value = DEFAULT_PREFS.labels[input.name]; });
    };
    $('#aosFeatureForm', dialog).onsubmit = event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const next = loadPrefs();
      Object.keys(DEFAULT_PREFS.labels).forEach(key => { next.labels[key] = String(data[key] || DEFAULT_PREFS.labels[key]).trim().slice(0,32) || DEFAULT_PREFS.labels[key]; });
      savePrefs(next);
      patchDashboard();
      dialog.close();
    };
    if (!dialog.open) dialog.showModal();
  }

  let returnToSettings = false;
  let settingsScrollTop = 0;
  function openAppearancePicker() {
    const dialog = ensureFeatureDialog();
    $('#aosFeatureTitle', dialog).textContent = 'Внешний вид';
    $('#aosFeatureBody', dialog).innerHTML = `<div class="aos152-help"><b>Тема интерфейса</b><p>Выбор применяется сразу. Данные и расчёты не меняются.</p></div><div class="aos152-theme-grid">${[
      ['black','Чёрная','#000000'],['emerald','Изумрудная','#33e36d'],['neonlime','Неон лайм','#d7ff19'],['graphite','Графитовая','#364149'],['light','Светлая','#f2efe5']
    ].map(([key,label,color])=>`<button type="button" data-aos-theme="${key}"><span style="background:${color}"></span><b>${label}</b></button>`).join('')}</div>`;
    $('.aos152-sheet-actions', dialog).hidden = true;
    $$('[data-aos-theme]', dialog).forEach(button => button.onclick = () => {
      const target = document.querySelector(`[data-theme-inline="${button.dataset.aosTheme}"]`);
      target?.click();
      dialog.close();
    });
    dialog.addEventListener('close', () => { $('.aos152-sheet-actions', dialog).hidden = false; }, { once:true });
    if (!dialog.open) dialog.showModal();
  }

  function patchSettings() {
    const screen = $('.settings-screen');
    if (!screen) return;
    $$('.settings-row[id]', screen).forEach(row => {
      const icon = $('.settings-icon', row);
      const key = SETTINGS_ICON_MAP[row.id];
      if (icon && key && icon.dataset.aos152Icon !== key) {
        icon.dataset.aos152Icon = key;
        icon.innerHTML = ICONS[key];
      }
    });
    const importRow = $('.file-row', screen);
    if (importRow) {
      const icon = $('.settings-icon', importRow);
      if (icon && !icon.dataset.aos152Icon) { icon.dataset.aos152Icon='import'; icon.innerHTML=ICONS.import; }
    }
    $('.v11-theme-card', screen)?.classList.add('aos152-inline-theme-hidden');
    if (!$('#dashboardLabelsSettings', screen)) {
      const anchor = $('#homePreferences', screen);
      if (anchor) {
        const appearance = document.createElement('button');
        appearance.type='button'; appearance.id='appearanceSettingsV152'; appearance.className='settings-row';
        appearance.innerHTML=`<i class="settings-icon" data-aos152-icon="appearance">${ICONS.appearance}</i><span>Внешний вид<small>Чёрная, изумрудная, графитовая, светлая и другие темы</small></span><b>›</b>`;
        appearance.addEventListener('click', openAppearancePicker);
        const row = document.createElement('button');
        row.type='button'; row.id='dashboardLabelsSettings'; row.className='settings-row';
        row.innerHTML=`<i class="settings-icon" data-aos152-icon="labels">${ICONS.labels}</i><span>Названия на главной<small>Свои подписи для капитала, дохода, подушки и мини-блоков</small></span><b>›</b>`;
        row.addEventListener('click', openDashboardLabels);
        anchor.after(appearance);
        appearance.after(row);
      }
    }
    const version = $('.app-version', screen);
    if (version) version.textContent = `Alexander OS V15.2 · Strategy Modules`;
  }

  function selectedFinanceMonth() {
    return $('#financeMonthPicker')?.value || currentMonth();
  }
  let planFactMonth = '';
  function monthIncome(state, key) {
    return sum((state.transactions || []).filter(tx => tx.type === 'income' && String(tx.date||'').slice(0,7) === key).map(tx => tx.amount));
  }
  function monthTarget(state, key) {
    const specific = Number(state.profile?.monthlyIncomeTargets?.[key]);
    return Number.isFinite(specific) && specific > 0 ? specific : Number(state.profile?.monthlyIncomeTarget || 0);
  }
  function renderPlanFact() {
    if (document.body.dataset.screen !== 'finance' || !$('.finance-tool-grid')) return;
    const host = $('#financeTabContent');
    if (!host) return;
    if (!planFactMonth) planFactMonth = selectedFinanceMonth();
    const state = loadState();
    const key = planFactMonth;
    const plan = monthTarget(state,key);
    const fact = monthIncome(state,key);
    const deviation = fact - plan;
    const pct = plan > 0 ? Math.round(fact / plan * 100) : 0;
    let card = $('#aosPlanFact');
    if (!card) {
      card = document.createElement('section');
      card.id='aosPlanFact'; card.className='card aos-plan-fact';
      host.prepend(card);
    }
    card.innerHTML = `
      <div class="aos-pf-head"><div><h2>План / Факт</h2><p>Контроль цели дохода по месяцам</p></div><div class="aos-pf-month"><button type="button" data-pf-step="-1">‹</button><b>${esc(monthLabel(key))}</b><button type="button" data-pf-step="1">›</button></div></div>
      <div class="aos-pf-grid"><div class="aos-pf-metric"><small>План</small><strong>${money(plan)}</strong></div><div class="aos-pf-metric"><small>Факт</small><strong>${money(fact)}</strong></div></div>
      <div class="aos-pf-deviation"><span>Отклонение</span><b class="${deviation>=0?'good':'bad'}">${deviation>=0?'+':''}${money(deviation)}${plan>0?` · ${deviation>=0?'+':''}${Math.round(deviation/plan*100)}%`:''}</b></div>
      <div class="aos-pf-track"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div>`;
    $$('[data-pf-step]',card).forEach(btn => btn.addEventListener('click',()=>{ planFactMonth=shiftMonth(planFactMonth,Number(btn.dataset.pfStep)); renderPlanFact(); }));
  }

  function renderFunnel() {
    if (document.body.dataset.screen !== 'projects') return;
    const tabs = $('.project-tabs');
    if (!tabs) return;
    const state = loadState();
    const pipeline = Array.isArray(state.clientPipeline) ? state.clientPipeline : [];
    const stages = [
      ['Лиды',pipeline.filter(x=>x.status==='lead').length],
      ['Созвоны',pipeline.filter(x=>x.status==='call').length],
      ['КП',pipeline.filter(x=>['proposal','thinking'].includes(x.status)).length],
      ['Оплата',pipeline.filter(x=>['paid','retainer'].includes(x.status)).length]
    ];
    let card = $('#aosClientFunnel');
    if (!card) { card=document.createElement('section'); card.id='aosClientFunnel'; card.className='card aos-client-funnel'; tabs.after(card); }
    card.innerHTML=`<div class="aos-funnel-head"><div><h2>Клиентская воронка</h2><p>Лиды, созвоны, КП и оплаты в одном месте</p></div><button type="button" class="aos-funnel-open">Управлять</button></div><div class="aos-funnel-grid">${stages.map(([label,value])=>`<div class="aos-funnel-stage"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><div class="aos-funnel-bar"><i></i><i></i><i></i><i></i></div>`;
    $('.aos-funnel-open',card).onclick=()=>{
      const growth=$('.nav-item[data-screen="growth"]');
      growth?.click();
      setTimeout(()=>$('#openClientsModule')?.click(),120);
    };
  }

  function projectIncome(state, projectId, key) {
    return sum((state.transactions||[]).filter(tx=>tx.type==='income' && tx.projectId===projectId && String(tx.date||'').slice(0,7)===key).map(tx=>tx.amount));
  }
  function lastMonths(n=6){ const now=new Date(); return Array.from({length:n},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-(n-1-i),1); return monthKey(d);}); }
  function enhanceProjectCards(){
    if(document.body.dataset.screen!=='projects')return;
    const state=loadState(); const months=lastMonths(6); const cur=currentMonth(); const prev=shiftMonth(cur,-1);
    $$('.project-card').forEach(card=>{
      if($('.aos-project-analytics',card))return;
      const name=$('.item-title',card)?.textContent?.trim();
      const project=(state.projects||[]).find(p=>String(p.name||'').trim()===name);
      if(!project)return;
      const actual=projectIncome(state,project.id,cur); const previous=projectIncome(state,project.id,prev); const plan=Number(project.value||0);
      const delta=previous>0?Math.round((actual-previous)/previous*100):null;
      const values=months.map(m=>projectIncome(state,project.id,m)); const max=Math.max(1,...values);
      const head=$('.project-card-head',card);
      if(head&&!$('.aos-project-status',head)){ const badge=document.createElement('span'); badge.className=`aos-project-status ${project.status==='paused'?'paused':project.status==='completed'?'completed':'active'}`; badge.textContent=project.status==='growth'?'Развитие':project.status==='paused'?'Пауза':project.status==='completed'?'Завершён':'Активен'; head.append(badge); }
      const wrap=document.createElement('div'); wrap.className='aos-project-analytics';
      wrap.innerHTML=`<div class="aos-project-kpis"><span><small>Доход (мес.)</small><b>${money(actual)}</b></span><span><small>к прошлому</small><b class="${delta===null?'':delta>=0?'good':'bad'}">${delta===null?'нет базы':`${delta>=0?'+':''}${delta}%`}</b></span><span><small>План</small><b>${money(plan)}</b></span></div><div class="aos-project-spark">${values.map((v,i)=>`<i class="${i>=values.length-2?'active':''}" style="height:${Math.max(8,Math.round(v/max*100))}%" title="${money(v)}"></i>`).join('')}</div>`;
      card.append(wrap);
    });
  }

  function chartPoints(values,width=220,height=100,padY=14){
    if(values.length<2)return `0,${height/2} ${width},${height/2}`;
    const min=Math.min(...values), max=Math.max(...values), span=Math.max(.1,max-min);
    return values.map((v,i)=>`${Math.round(i/(values.length-1)*width)},${Math.round(padY+(max-v)/span*(height-padY*2))}`).join(' ');
  }
  function renderHealth(){
    if(document.body.dataset.screen!=='growth')return;
    const core=$('#bodyTracker'); if(!core)return;
    const state=loadState(); const profile=state.workoutProfile||{};
    const logs=(state.bodyLogs||[]).filter(x=>Number(x.weight)>0).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(-8);
    const current=Number(logs.at(-1)?.weight||profile.weight||0); const start=Number(profile.startWeight||logs[0]?.weight||current||0); const target=Number(profile.targetWeight||0);
    const change=current&&start?current-start:0; const values=logs.length?logs.map(x=>Number(x.weight||0)):(current?[current,current]:[0,0]);
    let card=$('#aosHealthDynamics');
    if(!card){card=document.createElement('section');card.id='aosHealthDynamics';card.className='card aos-health-card';core.before(card);}
    const pts=chartPoints(values);
    card.innerHTML=`<div class="aos-health-title"><h2>Здоровье</h2><p>Вес, рост и динамика</p></div><div class="aos-health-main"><div class="aos-health-current"><small>Текущий вес</small><strong>${current?`${String(current).replace('.',',')} кг`:'—'}</strong><span class="aos-health-change">${change>0?'+':''}${String(Math.round(change*10)/10).replace('.',',')} кг</span></div><div class="aos-health-chart"><svg viewBox="0 0 220 100" preserveAspectRatio="none" aria-label="Динамика веса"><path class="aos-health-gridline" d="M0 25H220M0 50H220M0 75H220"/><polyline class="aos-health-line" points="${pts}"/>${pts.split(' ').map(p=>{const[x,y]=p.split(',');return `<circle class="aos-health-dot" cx="${x}" cy="${y}" r="3.2"/>`;}).join('')}</svg></div></div><div class="aos-health-foot"><span>Рост: <b>${Number(profile.height||0)||'—'} см</b></span><span>Возраст: <b>${Number(profile.age||0)||'—'} лет</b></span><span>Цель: <b>${target?`${String(target).replace('.',',')} кг`:'не задана'}</b></span></div><div class="aos-health-actions"><button type="button" data-health-action="log">Записать вес</button><button type="button" data-health-action="profile">Параметры</button></div>`;
    core.classList.add('aos-core-body-hidden');
    $('[data-health-action="log"]',card).onclick=()=>$('#openBodyLog',core)?.click();
    $('[data-health-action="profile"]',card).onclick=()=>$('#openBodyProfile',core)?.click();
  }

  function patchCategoryIcons(){
    $$('.category-icon.expense:not(.aos-cat-icon)').forEach(icon=>{
      const item=icon.closest('.item'); const meta=$('.item-meta',item)?.textContent||''; const label=meta.split('·')[0].trim(); const category=LABEL_TO_CATEGORY[label]||'other_expense';
      icon.classList.add('aos-cat-icon',`aos-cat-${category}`); icon.innerHTML=iconForCategory(category);
    });
    $$('.category-row:not(.aos-category-row)').forEach(row=>{
      const metric=$('.metric-row',row); const label=metric?.querySelector('span')?.textContent?.trim(); if(!metric||!label)return;
      const category=LABEL_TO_CATEGORY[label]||'other_expense'; const badge=document.createElement('span'); badge.className=`aos-category-badge aos-cat-${category}`; badge.innerHTML=iconForCategory(category); metric.prepend(badge); row.classList.add('aos-category-row');
    });
  }

  function patchSettingsReturnBehavior(){
    const modal=$('#modal'); if(!modal||modal.dataset.aos152ReturnBound)return;
    modal.dataset.aos152ReturnBound='1';
    modal.addEventListener('close',()=>{
      if(!returnToSettings)return;
      returnToSettings=false;
      setTimeout(()=>{
        $('#profileSettingsTrigger')?.click();
        setTimeout(()=>{ const body=$('#modalBody'); if(body) body.scrollTop=settingsScrollTop; },50);
      },35);
    });
    document.addEventListener('click',event=>{
      const row=event.target.closest?.('.settings-screen .settings-row[id], .settings-screen #profileSettings');
      if(!row||!CORE_SETTINGS_CHILDREN.has(row.id))return;
      settingsScrollTop=$('#modalBody')?.scrollTop||0;
      returnToSettings=true;
    },true);
  }

  function patchBuildText(){
    const brand=$('.brand-line span'); if(brand) brand.textContent='V15.2';
  }

  function enhanceAll(){
    patchBuildText(); patchDashboard(); patchSettings(); renderPlanFact(); renderFunnel(); enhanceProjectCards(); renderHealth(); patchCategoryIcons();
  }

  let scheduled=false;
  const schedule=()=>{ if(scheduled)return; scheduled=true; requestAnimationFrame(()=>{scheduled=false; enhanceAll();}); };
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('change',event=>{ if(event.target?.id==='financeMonthPicker'){planFactMonth=event.target.value; schedule();} });
  window.addEventListener('pageshow',schedule);
  patchSettingsReturnBehavior();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();

  window.AlexanderOSV152={openDashboardLabels,enhanceAll,version:BUILD};
})();
