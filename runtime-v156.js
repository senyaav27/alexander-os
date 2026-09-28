(() => {
  'use strict';

  const BUILD = '15.5.0';
  const STATE_KEY = 'alexander_os_v1';
  const PREFS_KEY = 'alexander_os_v152_prefs';
  const TRANSFER_KEY = 'accountTransfers';
  const app = document.getElementById('app');
  const modalBody = document.getElementById('modalBody');
  const mainModal = document.getElementById('modal');
  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  const money = value => `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(value||0))} ₽`;
  const pad = value => String(value).padStart(2,'0');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const monthKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}`;
  const currentMonth = () => monthKey(new Date());
  const monthDate = key => { const [y,m] = String(key||currentMonth()).split('-').map(Number); return new Date(y||new Date().getFullYear(), Math.max(0,(m||1)-1), 1); };
  const shiftMonth = (key, delta) => { const d = monthDate(key); d.setMonth(d.getMonth()+delta); return monthKey(d); };
  const monthLabel = key => new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(monthDate(key)).replace(/^./,m=>m.toUpperCase());
  const sum = items => (items || []).reduce((total,item)=>total+Number(item||0),0);
  const uid = prefix => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------
  function loadState() {
    try {
      const state = JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {};
      state.accounts = Array.isArray(state.accounts) ? state.accounts : [];
      state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
      state.clientPipeline = Array.isArray(state.clientPipeline) ? state.clientPipeline : [];
      state.projects = Array.isArray(state.projects) ? state.projects : [];
      state.bodyLogs = Array.isArray(state.bodyLogs) ? state.bodyLogs : [];
      state[TRANSFER_KEY] = Array.isArray(state[TRANSFER_KEY]) ? state[TRANSFER_KEY] : [];
      state.profile ||= {};
      return state;
    } catch (error) {
      console.error('[Alexander OS V15.5] state read failed', error);
      return null;
    }
  }
  function saveState(state) { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }

  const DEFAULT_PREFS = {
    labels: {
      capital:'Общий капитал', income:'Цель дохода', cushion:'Финансовая подушка',
      payday:'Деньги до зарплаты', focus:'Фокус дня', weekExpense:'Расходы за неделю'
    }
  };
  function loadPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
      return { ...DEFAULT_PREFS, ...raw, labels:{ ...DEFAULT_PREFS.labels, ...(raw.labels||{}) } };
    } catch (_) { return JSON.parse(JSON.stringify(DEFAULT_PREFS)); }
  }
  function savePrefs(prefs) { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }

  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
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
    profileSettings:'profile',securitySettings:'shield',homePreferences:'home',financePreferences:'target',
    notificationSettings:'bell',budgetSettings:'wallet',bodySettings:'body',exportEncryptedData:'backup',
    exportData:'export',exportChatGPT:'ai',openHistory:'history',openTrash:'trash',openDiagnostics:'check',
    openRecurringFromSettings:'repeat',openKnowledgeBase:'notes',installHelp:'phone',lockNow:'lock'
  };
  const CORE_SETTINGS_CHILDREN = new Set([
    'profileSettings','securitySettings','homePreferences','financePreferences','budgetSettings','bodySettings',
    'openKnowledgeBase','openHistory','openTrash','openDiagnostics','openRecurringFromSettings'
  ]);

  const CATEGORY_ICONS = {
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
  const LABEL_TO_CATEGORY = {
    'Продукты':'groceries','Кафе и доставка':'cafes','Рестораны':'cafes','Жильё':'housing','Транспорт':'transport','Такси':'taxi',
    'Подписки':'subscriptions','Здоровье':'health','Одежда':'clothing','Развлечения':'entertainment','Обучение':'education',
    'Бизнес':'business','Подарки':'gifts','Долги и кредиты':'debt_payment','Путешествия':'travel','Другое':'other_expense'
  };
  const EXPENSE_CATEGORIES = [
    ['groceries','Продукты'],['cafes','Кафе и доставка'],['transport','Транспорт'],['taxi','Такси'],['housing','Жильё'],
    ['subscriptions','Подписки'],['health','Здоровье'],['clothing','Одежда'],['entertainment','Развлечения'],['education','Обучение'],
    ['business','Бизнес'],['gifts','Подарки'],['debt_payment','Долги и кредиты'],['travel','Путешествия'],['other_expense','Другое']
  ];
  const INCOME_CATEGORIES = [
    ['salary','Зарплата'],['client','Клиенты'],['project_income','Свои проекты'],['shop','Магазин'],
    ['refund','Возврат'],['gift_income','Подарок'],['other_income','Другой доход']
  ];

  // ---------------------------------------------------------------------------
  // V15.5 motion policy
  // Only the dashboard progress bars animate once after a fresh app launch.
  // Navigation, cards, tabs, buttons and repeat visits are intentionally static.
  // ---------------------------------------------------------------------------
  let startupDashboardProgressPlayed = false;
  function revealStartupDashboardProgress(root = app) {
    if (startupDashboardProgressPlayed || !root || reducedMotion) return;
    if (document.body.dataset.screen !== 'dashboard') { startupDashboardProgressPlayed = true; return; }
    const bars = $$('.premium-progress > i', root);
    const visibleBars = bars.filter(bar => {
      const rect = bar.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).slice(0, 24);
    startupDashboardProgressPlayed = true;
    visibleBars.forEach((bar, index) => {
      if (typeof bar.animate !== 'function') return;
      const animation = bar.animate([
        { transform:'scaleX(0)', transformOrigin:'left center' },
        { transform:'scaleX(1)', transformOrigin:'left center' }
      ], {
        duration: 420,
        delay: Math.min(index * 18, 126),
        easing: 'cubic-bezier(.22,.72,.22,1)',
        fill: 'both'
      });
      animation.finished.catch(()=>{}).then(()=>bar.style.removeProperty('transform'));
    });
  }

  function scheduleStartupDashboardProgress() {
    const splash = document.getElementById('appSplash');
    const play = () => requestAnimationFrame(() => revealStartupDashboardProgress(app));
    if (!splash || splash.classList.contains('splash-hidden')) {
      requestAnimationFrame(play);
      return;
    }
    let started = false;
    const startAfterSplash = () => {
      if (started) return;
      started = true;
      observer.disconnect();
      window.setTimeout(play, 280);
    };
    const observer = new MutationObserver(() => {
      if (splash.classList.contains('splash-hidden')) startAfterSplash();
    });
    observer.observe(splash, { attributes:true, attributeFilter:['class'] });
    window.setTimeout(startAfterSplash, 1800);
  }

  // ---------------------------------------------------------------------------
  // Dashboard labels and settings UI
  // ---------------------------------------------------------------------------
  function patchDashboard() {
    if (document.body.dataset.screen !== 'dashboard') return;
    const prefs=loadPrefs();
    const hero=$('.home-premium-capital[data-value-source]');
    if(hero){const key=hero.dataset.valueSource;const label=$('.home-capital-head small',hero);if(label&&prefs.labels[key]&&label.textContent!==prefs.labels[key])label.textContent=prefs.labels[key];}
    $$('.home-goal-card[data-home-metric]').forEach(card=>{const label=$('.home-goal-title small',card);const key=card.dataset.homeMetric;if(label&&prefs.labels[key]&&label.textContent!==prefs.labels[key])label.textContent=prefs.labels[key];});
    const budget=$('#openBudgetModule');
    if(budget){const label=$('small',budget);if(label&&label.textContent!==prefs.labels.payday)label.textContent=prefs.labels.payday;if(!$('.aos-mini-info',budget)){
      const state=loadState();const info=document.createElement('span');info.className='aos-mini-info';
      const next=state?.profile?.nextSalaryDate?new Date(`${state.profile.nextSalaryDate}T12:00:00`):null;const today=new Date();today.setHours(12,0,0,0);
      const days=next&&!Number.isNaN(next.getTime())?Math.max(1,Math.ceil((next-today)/86400000)):null;const reserve=Number(state?.profile?.dailyBudgetReserve||0);
      info.textContent=`${days?`${days} дн.`:'дата не задана'}${reserve?` · лимит ${money(reserve)}`:''}`;budget.append(info);
    }}
    const focus=$('#openFocusModule');if(focus){const label=$('small',focus);if(label&&label.textContent!==prefs.labels.focus)label.textContent=prefs.labels.focus;}
    const week=$('.home-week-expense-card .home-week-copy small');if(week&&week.textContent!==prefs.labels.weekExpense)week.textContent=prefs.labels.weekExpense;
  }

  function ensureFeatureDialog(){
    let dialog=$('#aosFeatureDialog');if(dialog)return dialog;
    dialog=document.createElement('dialog');dialog.id='aosFeatureDialog';dialog.innerHTML=`<form class="aos152-sheet" id="aosFeatureForm" novalidate><div class="aos152-sheet-head"><div><small>Alexander OS</small><h2 id="aosFeatureTitle">Настройка</h2></div><button class="aos152-close" type="button" aria-label="Закрыть">×</button></div><div id="aosFeatureBody"></div><div class="aos152-sheet-actions"><button class="aos152-reset" id="aosFeatureReset" type="button">По умолчанию</button><button class="aos152-save" type="submit">Сохранить</button></div></form>`;
    document.body.append(dialog);$('.aos152-close',dialog).addEventListener('click',()=>dialog.close());dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close();});dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});return dialog;
  }
  function openDashboardLabels(){
    const dialog=ensureFeatureDialog(),prefs=loadPrefs();$('#aosFeatureTitle',dialog).textContent='Названия на главной';$('.aos152-sheet-actions',dialog).hidden=false;
    $('#aosFeatureBody',dialog).innerHTML=`<div class="aos152-help"><b>Меняются только подписи</b><p>Расчёты и логика показателей остаются прежними.</p></div><div class="aos152-label-grid">${[
      ['capital','Общий капитал'],['income','Цель дохода'],['cushion','Финансовая подушка'],['payday','Деньги до зарплаты'],['focus','Фокус дня'],['weekExpense','Расходы за неделю']
    ].map(([key,label],i)=>`<label class="aos152-field ${i>3?'wide':''}"><span>${label}</span><input name="${key}" maxlength="32" value="${esc(prefs.labels[key])}"></label>`).join('')}</div>`;
    $('#aosFeatureReset',dialog).onclick=()=>$$('input',dialog).forEach(input=>{if(DEFAULT_PREFS.labels[input.name])input.value=DEFAULT_PREFS.labels[input.name];});
    $('#aosFeatureForm',dialog).onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const next=loadPrefs();Object.keys(DEFAULT_PREFS.labels).forEach(key=>{next.labels[key]=String(data[key]||DEFAULT_PREFS.labels[key]).trim().slice(0,32)||DEFAULT_PREFS.labels[key];});savePrefs(next);patchDashboard();dialog.close();};
    if(!dialog.open)dialog.showModal();
  }
  function openAppearancePicker(){
    const dialog=ensureFeatureDialog();$('#aosFeatureTitle',dialog).textContent='Внешний вид';$('.aos152-sheet-actions',dialog).hidden=true;
    $('#aosFeatureBody',dialog).innerHTML=`<div class="aos152-help"><b>Тема интерфейса</b><p>Выбор применяется сразу.</p></div><div class="aos152-theme-grid">${[['black','Чёрная','#000000'],['emerald','Изумрудная','#33e36d'],['neonlime','Неон лайм','#d7ff19'],['graphite','Графитовая','#364149'],['light','Светлая','#f2efe5']].map(([key,label,color])=>`<button type="button" data-aos-theme="${key}"><span style="background:${color}"></span><b>${label}</b></button>`).join('')}</div>`;
    $$('[data-aos-theme]',dialog).forEach(button=>button.onclick=()=>{document.querySelector(`[data-theme-inline="${button.dataset.aosTheme}"]`)?.click();dialog.close();});
    dialog.addEventListener('close',()=>{$('.aos152-sheet-actions',dialog).hidden=false;},{once:true});if(!dialog.open)dialog.showModal();
  }
  function patchSettings(){
    const screen=$('.settings-screen',modalBody||document);if(!screen)return;
    $$('.settings-row[id]',screen).forEach(row=>{const icon=$('.settings-icon',row),key=SETTINGS_ICON_MAP[row.id];if(icon&&key&&icon.dataset.aos153Icon!==key){icon.dataset.aos153Icon=key;icon.innerHTML=ICONS[key];}});
    const importRow=$('.file-row',screen);if(importRow){const icon=$('.settings-icon',importRow);if(icon&&icon.dataset.aos153Icon!=='import'){icon.dataset.aos153Icon='import';icon.innerHTML=ICONS.import;}}
    $('.v11-theme-card',screen)?.classList.add('aos152-inline-theme-hidden');
    if(!$('#dashboardLabelsSettings',screen)){
      const anchor=$('#homePreferences',screen);if(anchor){
        const appearance=document.createElement('button');appearance.type='button';appearance.id='appearanceSettingsV153';appearance.className='settings-row';appearance.innerHTML=`<i class="settings-icon" data-aos153-icon="appearance">${ICONS.appearance}</i><span>Внешний вид<small>Темы и оформление интерфейса</small></span><b>›</b>`;appearance.addEventListener('click',openAppearancePicker);
        const labels=document.createElement('button');labels.type='button';labels.id='dashboardLabelsSettings';labels.className='settings-row';labels.innerHTML=`<i class="settings-icon" data-aos153-icon="labels">${ICONS.labels}</i><span>Названия на главной<small>Свои подписи для капитала, дохода, подушки и мини-блоков</small></span><b>›</b>`;labels.addEventListener('click',openDashboardLabels);
        anchor.after(appearance);appearance.after(labels);
      }
    }
    const version=$('.app-version',screen);if(version)version.textContent='Alexander OS V15.5 · Static navigation';
  }

  let returnToSettings=false,settingsScrollTop=0;
  function bindSettingsReturnBehavior(){
    if(!mainModal||mainModal.dataset.aos153ReturnBound)return;mainModal.dataset.aos153ReturnBound='1';
    mainModal.addEventListener('close',()=>{
      if(!returnToSettings)return;returnToSettings=false;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(document.querySelector('dialog[open]'))return;
        $('#profileSettingsTrigger')?.click();
        requestAnimationFrame(()=>{if(modalBody)modalBody.scrollTop=settingsScrollTop;});
      }));
    });
    document.addEventListener('click',event=>{
      const row=event.target.closest?.('.settings-screen .settings-row[id], .settings-screen #profileSettings');
      if(!row||!CORE_SETTINGS_CHILDREN.has(row.id))return;settingsScrollTop=modalBody?.scrollTop||0;returnToSettings=true;
    },true);
  }

  // ---------------------------------------------------------------------------
  // Finance plan/fact
  // ---------------------------------------------------------------------------
  let planFactMonth='';
  const selectedFinanceMonth=()=>$('#financeMonthPicker')?.value||currentMonth();
  const monthIncome=(state,key)=>sum((state?.transactions||[]).filter(tx=>tx.type==='income'&&String(tx.date||'').slice(0,7)===key).map(tx=>tx.amount));
  const monthTarget=(state,key)=>{const specific=Number(state?.profile?.monthlyIncomeTargets?.[key]);return Number.isFinite(specific)&&specific>0?specific:Number(state?.profile?.monthlyIncomeTarget||0);};
  function renderPlanFact(){
    if(document.body.dataset.screen!=='finance'||!$('.finance-tool-grid'))return;const host=$('#financeTabContent');if(!host)return;
    if(!planFactMonth)planFactMonth=selectedFinanceMonth();const state=loadState();if(!state)return;const key=planFactMonth,plan=monthTarget(state,key),fact=monthIncome(state,key),deviation=fact-plan,pct=plan>0?Math.round(fact/plan*100):0;
    let card=$('#aosPlanFact');if(!card){card=document.createElement('section');card.id='aosPlanFact';card.className='card aos-plan-fact';host.prepend(card);}
    const sig=[key,plan,fact].join('|');if(card.dataset.aosSig===sig)return;card.dataset.aosSig=sig;
    card.innerHTML=`<div class="aos-pf-head"><div><h2>План / Факт</h2><p>Контроль цели дохода по месяцам</p></div><div class="aos-pf-month"><button type="button" data-pf-step="-1">‹</button><b>${esc(monthLabel(key))}</b><button type="button" data-pf-step="1">›</button></div></div><div class="aos-pf-grid"><div class="aos-pf-metric"><small>План</small><strong>${money(plan)}</strong></div><div class="aos-pf-metric"><small>Факт</small><strong>${money(fact)}</strong></div></div><div class="aos-pf-deviation"><span>Отклонение</span><b class="${deviation>=0?'good':'bad'}">${deviation>=0?'+':''}${money(deviation)}${plan>0?` · ${deviation>=0?'+':''}${Math.round(deviation/plan*100)}%`:''}</b></div><div class="aos-pf-track"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div>`;
    $$('[data-pf-step]',card).forEach(btn=>btn.addEventListener('click',()=>{planFactMonth=shiftMonth(planFactMonth,Number(btn.dataset.pfStep));card.dataset.aosSig='';renderPlanFact();}));
  }

  // ---------------------------------------------------------------------------
  // Projects funnel and analytics
  // ---------------------------------------------------------------------------
  function renderFunnel(){
    if(document.body.dataset.screen!=='projects')return;const tabs=$('.project-tabs');if(!tabs)return;const state=loadState();if(!state)return;const p=state.clientPipeline||[];
    const stages=[['Лиды',p.filter(x=>x.status==='lead').length],['Созвоны',p.filter(x=>x.status==='call').length],['КП',p.filter(x=>['proposal','thinking'].includes(x.status)).length],['Оплата',p.filter(x=>['paid','retainer'].includes(x.status)).length]];
    let card=$('#aosClientFunnel');if(!card){card=document.createElement('section');card.id='aosClientFunnel';card.className='card aos-client-funnel';tabs.after(card);}
    const sig=stages.map(x=>x[1]).join('|');if(card.dataset.aosSig===sig)return;card.dataset.aosSig=sig;
    card.innerHTML=`<div class="aos-funnel-head"><div><h2>Клиентская воронка</h2><p>Лиды, созвоны, КП и оплаты в одном месте</p></div><button type="button" class="aos-funnel-open">Управлять</button></div><div class="aos-funnel-grid">${stages.map(([label,value])=>`<div class="aos-funnel-stage"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div><div class="aos-funnel-bar"><i></i><i></i><i></i><i></i></div>`;
    $('.aos-funnel-open',card).onclick=()=>{document.querySelector('.nav-item[data-screen="growth"]')?.click();requestAnimationFrame(()=>requestAnimationFrame(()=>$('#openClientsModule')?.click()));};
  }
  const projectIncome=(state,projectId,key)=>sum((state.transactions||[]).filter(tx=>tx.type==='income'&&tx.projectId===projectId&&String(tx.date||'').slice(0,7)===key).map(tx=>tx.amount));
  function lastMonths(n=6){const now=new Date();return Array.from({length:n},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-(n-1-i),1);return monthKey(d);});}
  function enhanceProjectCards(){
    if(document.body.dataset.screen!=='projects')return;const state=loadState();if(!state)return;const months=lastMonths(6),cur=currentMonth(),prev=shiftMonth(cur,-1);
    $$('.project-card').forEach(card=>{if($('.aos-project-analytics',card))return;const name=$('.item-title',card)?.textContent?.trim();const project=(state.projects||[]).find(p=>String(p.name||'').trim()===name);if(!project)return;
      const actual=projectIncome(state,project.id,cur),previous=projectIncome(state,project.id,prev),plan=Number(project.value||0),delta=previous>0?Math.round((actual-previous)/previous*100):null,values=months.map(m=>projectIncome(state,project.id,m)),max=Math.max(1,...values);
      const head=$('.project-card-head',card);if(head&&!$('.aos-project-status',head)){const badge=document.createElement('span');badge.className=`aos-project-status ${project.status==='paused'?'paused':project.status==='completed'?'completed':'active'}`;badge.textContent=project.status==='growth'?'Развитие':project.status==='paused'?'Пауза':project.status==='completed'?'Завершён':'Активен';head.append(badge);}
      const wrap=document.createElement('div');wrap.className='aos-project-analytics';wrap.innerHTML=`<div class="aos-project-kpis"><span><small>Доход (мес.)</small><b>${money(actual)}</b></span><span><small>к прошлому</small><b class="${delta===null?'':delta>=0?'good':'bad'}">${delta===null?'нет базы':`${delta>=0?'+':''}${delta}%`}</b></span><span><small>План</small><b>${money(plan)}</b></span></div><div class="aos-project-spark">${values.map((v,i)=>`<i class="${i>=values.length-2?'active':''}" style="height:${Math.max(8,Math.round(v/max*100))}%" title="${money(v)}"></i>`).join('')}</div>`;card.append(wrap);
    });
  }

  // ---------------------------------------------------------------------------
  // Health card
  // ---------------------------------------------------------------------------
  function chartPoints(values,width=220,height=100,padY=14){if(values.length<2)return `0,${height/2} ${width},${height/2}`;const min=Math.min(...values),max=Math.max(...values),span=Math.max(.1,max-min);return values.map((v,i)=>`${Math.round(i/(values.length-1)*width)},${Math.round(padY+(max-v)/span*(height-padY*2))}`).join(' ');}
  function renderHealth(){
    if(document.body.dataset.screen!=='growth')return;const core=$('#bodyTracker');if(!core)return;const state=loadState();if(!state)return;const profile=state.workoutProfile||{},logs=(state.bodyLogs||[]).filter(x=>Number(x.weight)>0).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(-8);
    const current=Number(logs.at(-1)?.weight||profile.weight||0),start=Number(profile.startWeight||logs[0]?.weight||current||0),target=Number(profile.targetWeight||0),change=current&&start?current-start:0,values=logs.length?logs.map(x=>Number(x.weight||0)):(current?[current,current]:[0,0]),pts=chartPoints(values);
    let card=$('#aosHealthDynamics');if(!card){card=document.createElement('section');card.id='aosHealthDynamics';card.className='card aos-health-card';core.before(card);}const sig=[current,start,target,profile.height,profile.age,...values].join('|');if(card.dataset.aosSig===sig)return;card.dataset.aosSig=sig;
    card.innerHTML=`<div class="aos-health-title"><h2>Здоровье</h2><p>Вес, рост и динамика</p></div><div class="aos-health-main"><div class="aos-health-current"><small>Текущий вес</small><strong>${current?`${String(current).replace('.',',')} кг`:'—'}</strong><span class="aos-health-change">${change>0?'+':''}${String(Math.round(change*10)/10).replace('.',',')} кг</span></div><div class="aos-health-chart"><svg viewBox="0 0 220 100" preserveAspectRatio="none" aria-label="Динамика веса"><path class="aos-health-gridline" d="M0 25H220M0 50H220M0 75H220"/><polyline class="aos-health-line" points="${pts}"/>${pts.split(' ').map(p=>{const[x,y]=p.split(',');return `<circle class="aos-health-dot" cx="${x}" cy="${y}" r="3.2"/>`;}).join('')}</svg></div></div><div class="aos-health-foot"><span>Рост: <b>${Number(profile.height||0)||'—'} см</b></span><span>Возраст: <b>${Number(profile.age||0)||'—'} лет</b></span><span>Цель: <b>${target?`${String(target).replace('.',',')} кг`:'не задана'}</b></span></div><div class="aos-health-actions"><button type="button" data-health-action="log">Записать вес</button><button type="button" data-health-action="profile">Параметры</button></div>`;
    core.classList.add('aos-core-body-hidden');$('[data-health-action="log"]',card).onclick=()=>$('#openBodyLog',core)?.click();$('[data-health-action="profile"]',card).onclick=()=>$('#openBodyProfile',core)?.click();
  }

  // ---------------------------------------------------------------------------
  // Category icons
  // ---------------------------------------------------------------------------
  function patchCategoryIcons(){
    $$('.category-icon.expense:not(.aos-cat-icon)').forEach(icon=>{const item=icon.closest('.item'),meta=$('.item-meta',item)?.textContent||'',label=meta.split('·')[0].trim(),category=LABEL_TO_CATEGORY[label]||'other_expense';icon.classList.add('aos-cat-icon',`aos-cat-${category}`);icon.innerHTML=CATEGORY_ICONS[category]||CATEGORY_ICONS.other_expense;});
    $$('.category-row:not(.aos-category-row)').forEach(row=>{const metric=$('.metric-row',row),label=metric?.querySelector('span')?.textContent?.trim();if(!metric||!label)return;const category=LABEL_TO_CATEGORY[label]||'other_expense',badge=document.createElement('span');badge.className=`aos-category-badge aos-cat-${category}`;badge.innerHTML=CATEGORY_ICONS[category]||CATEGORY_ICONS.other_expense;metric.prepend(badge);row.classList.add('aos-category-row');});
  }

  // ---------------------------------------------------------------------------
  // Account transfers / account-specific expense and top-up
  // ---------------------------------------------------------------------------
  const transactionDelta=tx=>Number(tx?.amount||0)*(tx?.type==='income'?1:-1);
  const ledgerDelta=(state,accountId)=>sum((state.transactions||[]).filter(tx=>tx.accountId===accountId).map(transactionDelta));
  function ensureBaseBalance(state,account){if(Number.isFinite(Number(account.baseBalance))){account.baseBalance=Number(account.baseBalance||0);return;}account.baseBalance=Number(account.balance||0)-ledgerDelta(state,account.id);}
  function recalcBalances(state){state.accounts.forEach(account=>{ensureBaseBalance(state,account);account.balance=Number(account.baseBalance||0)+ledgerDelta(state,account.id);});}
  function accountOptions(accounts,selectedId='',excludeId=''){return accounts.filter(a=>a.id!==excludeId).map(a=>`<option value="${esc(a.id)}" ${a.id===selectedId?'selected':''}>${esc(a.name)} · ${money(a.balance)}</option>`).join('');}
  function categoryOptions(type,selected=''){const items=type==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES;return items.map(([id,label])=>`<option value="${id}" ${id===selected?'selected':''}>${label}</option>`).join('');}
  function ensureAccountDialog(){
    let dialog=$('#aosAccountFlow');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.id='aosAccountFlow';dialog.className='aos-account-dialog';dialog.innerHTML=`<form class="aos-account-sheet" id="aosAccountFlowForm" novalidate><div class="aos-account-sheet-head"><div><small>Счета</small><h2 id="aosAccountFlowTitle">Операция</h2></div><button type="button" class="aos-account-close" aria-label="Закрыть">×</button></div><div class="aos-operation-tabs" role="tablist"><button type="button" data-aos-mode="transfer" class="active">Перевод</button><button type="button" data-aos-mode="expense">Расход</button><button type="button" data-aos-mode="income">Пополнение</button></div><div id="aosAccountFlowFields"></div><p class="aos-account-error" id="aosAccountFlowError" role="alert"></p><button class="aos-account-submit" type="submit">Перевести</button></form>`;document.body.append(dialog);$('.aos-account-close',dialog).addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('cancel',e=>{e.preventDefault();dialog.close();});$('#aosAccountFlowForm',dialog).addEventListener('submit',e=>{e.preventDefault();if(e.currentTarget.reportValidity())saveAccountOperation(e.currentTarget,dialog);});return dialog;
  }
  let accountMode='transfer',accountSourceId='';
  function renderAccountFields(dialog){
    const state=loadState();if(!state?.accounts?.length)return;recalcBalances(state);const source=state.accounts.find(a=>a.id===accountSourceId)||state.accounts[0];accountSourceId=source.id;const fields=$('#aosAccountFlowFields',dialog),title=$('#aosAccountFlowTitle',dialog),submit=$('.aos-account-submit',dialog),isTransfer=accountMode==='transfer',isExpense=accountMode==='expense';title.textContent=isTransfer?'Перевод между счетами':isExpense?'Расход со счёта':'Пополнение счёта';submit.textContent=isTransfer?'Перевести':isExpense?'Сохранить расход':'Пополнить';const defaultTarget=state.accounts.find(a=>a.id!==source.id)?.id||'';
    fields.innerHTML=`<label class="aos-field"><span>${isTransfer?'Списать со счёта':isExpense?'Счёт расхода':'Счёт пополнения'}</span><select name="sourceAccountId" id="aosSourceAccount">${accountOptions(state.accounts,source.id)}</select><small>Доступно: <b id="aosSourceBalance">${money(source.balance)}</b></small></label>${isTransfer?`<label class="aos-field"><span>Зачислить на счёт</span><select name="targetAccountId">${accountOptions(state.accounts,defaultTarget,source.id)}</select></label>`:''}<div class="aos-field-grid"><label class="aos-field"><span>Сумма, ₽</span><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0" required></label><label class="aos-field"><span>Дата</span><input name="date" type="date" value="${todayISO()}" required></label></div>${!isTransfer?`<label class="aos-field"><span>Категория</span><select name="category">${categoryOptions(accountMode,accountMode==='income'?'other_income':'other_expense')}</select></label>`:''}<label class="aos-field"><span>${isTransfer?'Комментарий':'Название'}</span><input name="title" maxlength="90" placeholder="${isTransfer?'Например, в подушку':isExpense?'Например, интернет':'Например, перевод от клиента'}"></label>${isExpense?`<div class="aos-field-grid"><label class="aos-field"><span>Характер</span><select name="necessity"><option value="required">Обязательная</option><option value="optional" selected>Необязательная</option></select></label><label class="aos-field"><span>Контекст</span><select name="scope"><option value="personal" selected>Личная</option><option value="work">Рабочая</option></select></label></div>`:''}<div class="aos-flow-note">${isTransfer?'Перевод меняет только остатки счетов и не попадает в доходы или расходы.':isExpense?'Сумма будет списана именно с выбранного счёта.':'Сумма будет добавлена именно на выбранный счёт.'}</div>`;
    $('#aosSourceAccount',fields)?.addEventListener('change',e=>{accountSourceId=e.target.value;if(accountMode==='transfer')renderAccountFields(dialog);else{const fresh=loadState();if(!fresh)return;recalcBalances(fresh);const selected=fresh.accounts.find(a=>a.id===accountSourceId);if(selected)$('#aosSourceBalance',fields).textContent=money(selected.balance);}});
  }
  function setAccountMode(dialog,mode){accountMode=mode;$$('[data-aos-mode]',dialog).forEach(b=>b.classList.toggle('active',b.dataset.aosMode===mode));$('#aosAccountFlowError',dialog).textContent='';renderAccountFields(dialog);}
  function openAccountFlow(sourceId='',mode='transfer'){
    const state=loadState();if(!state?.accounts?.length){alert('Сначала добавь хотя бы один счёт.');return;}if(mode==='transfer'&&state.accounts.length<2){alert('Для перевода нужно минимум два счёта.');return;}accountSourceId=sourceId||state.accounts.find(a=>a.isDefault)?.id||state.accounts[0].id;const dialog=ensureAccountDialog();$$('[data-aos-mode]',dialog).forEach(b=>b.onclick=()=>setAccountMode(dialog,b.dataset.aosMode));setAccountMode(dialog,mode);if(!dialog.open)dialog.showModal();requestAnimationFrame(()=>dialog.querySelector('input[name="amount"]')?.focus());
  }
  function saveAccountOperation(form,dialog){
    const state=loadState(),error=$('#aosAccountFlowError',dialog);if(!state){error.textContent='Не удалось прочитать данные.';return false;}recalcBalances(state);const data=Object.fromEntries(new FormData(form)),amount=Number(data.amount||0),source=state.accounts.find(a=>a.id===data.sourceAccountId);if(!source||!Number.isFinite(amount)||amount<=0){error.textContent='Укажи корректный счёт и сумму.';return false;}
    if(accountMode==='transfer'){const target=state.accounts.find(a=>a.id===data.targetAccountId);if(!target||target.id===source.id){error.textContent='Выбери другой счёт для зачисления.';return false;}if(amount>Number(source.balance||0)+.001){error.textContent=`Недостаточно средств. На «${source.name}» сейчас ${money(source.balance)}.`;return false;}ensureBaseBalance(state,source);ensureBaseBalance(state,target);source.baseBalance-=amount;target.baseBalance+=amount;state[TRANSFER_KEY].unshift({id:uid('tr'),amount,date:data.date||todayISO(),fromAccountId:source.id,toAccountId:target.id,fromName:source.name,toName:target.name,note:String(data.title||'').trim(),createdAt:new Date().toISOString()});state[TRANSFER_KEY]=state[TRANSFER_KEY].slice(0,200);}else{const type=accountMode,title=String(data.title||'').trim()||(type==='expense'?'Расход':'Пополнение');state.transactions.push({id:uid('tx'),title,type,amount,date:data.date||todayISO(),category:data.category||(type==='income'?'other_income':'other_expense'),accountId:source.id,notes:'',necessity:type==='expense'?(data.necessity||'unknown'):'',scope:type==='expense'?(data.scope||'personal'):'',projectId:'',createdAt:new Date().toISOString()});}
    recalcBalances(state);saveState(state);dialog.close();location.reload();return true;
  }
  function reverseTransfer(id){const state=loadState();if(!state)return;recalcBalances(state);const transfer=state[TRANSFER_KEY].find(x=>x.id===id);if(!transfer)return;const source=state.accounts.find(a=>a.id===transfer.fromAccountId),target=state.accounts.find(a=>a.id===transfer.toAccountId);if(!source||!target){alert('Один из счетов перевода уже удалён.');return;}if(!confirm(`Отменить перевод ${money(transfer.amount)}: ${source.name} → ${target.name}?`))return;ensureBaseBalance(state,source);ensureBaseBalance(state,target);source.baseBalance+=Number(transfer.amount||0);target.baseBalance-=Number(transfer.amount||0);state[TRANSFER_KEY]=state[TRANSFER_KEY].filter(x=>x.id!==id);recalcBalances(state);saveState(state);location.reload();}
  function injectAccountControls(){
    const addButton=$('#addAccount');if(!addButton)return;if(!$('#aosTransferAccounts')){let actions=addButton.parentElement.querySelector('.aos-account-head-actions');if(!actions){actions=document.createElement('div');actions.className='aos-account-head-actions';addButton.before(actions);actions.append(addButton);}const transfer=document.createElement('button');transfer.type='button';transfer.id='aosTransferAccounts';transfer.className='link-btn aos-transfer-head-btn';transfer.textContent='Перевести';transfer.addEventListener('click',()=>openAccountFlow('','transfer'));actions.prepend(transfer);}
    $$('.edit-account[data-id]').forEach(edit=>{const actions=edit.closest('.item-actions');if(!actions||actions.querySelector('.aos-account-action'))return;const b=document.createElement('button');b.type='button';b.className='mini-btn aos-account-action';b.dataset.accountId=edit.dataset.id;b.setAttribute('aria-label','Операции со счётом');b.textContent='↔';b.addEventListener('click',()=>openAccountFlow(b.dataset.accountId,'transfer'));actions.prepend(b);});injectTransferHistory(addButton.closest('section'));
  }
  function injectTransferHistory(accountsSection){if(!accountsSection||$('#aosTransferHistory'))return;const state=loadState(),transfers=state?.[TRANSFER_KEY]||[];if(!transfers.length)return;const section=document.createElement('section');section.id='aosTransferHistory';section.className='section aos-transfer-history';section.innerHTML=`<div class="section-head"><h2>Последние переводы</h2><span class="badge">${transfers.length}</span></div><div class="list">${transfers.slice(0,6).map(t=>`<div class="item aos-transfer-row"><div class="account-icon">↔</div><div class="item-main"><div class="item-title">${esc(t.fromName)} → ${esc(t.toName)}</div><div class="item-meta">${esc(t.date)}${t.note?` · ${esc(t.note)}`:''}</div></div><div class="amount-block"><strong>${money(t.amount)}</strong><div class="item-actions"><button type="button" class="mini-btn aos-reverse-transfer" data-transfer-id="${esc(t.id)}" aria-label="Отменить перевод">↶</button></div></div></div>`).join('')}</div>`;accountsSection.after(section);$$('.aos-reverse-transfer',section).forEach(b=>b.addEventListener('click',()=>reverseTransfer(b.dataset.transferId)));}

  // ---------------------------------------------------------------------------
  // Enhancement scheduler - crucial: observe only top-level application renders.
  // It does not observe the entire document subtree, so our own DOM inserts cannot
  // create an endless MutationObserver -> innerHTML -> MutationObserver loop.
  // ---------------------------------------------------------------------------
  let enhanceQueued=false;
  function enhanceAll(){
    const brand=$('.brand-line span');if(brand&&brand.textContent!=='V15.5')brand.textContent='V15.5';
    patchDashboard();patchSettings();renderPlanFact();renderFunnel();enhanceProjectCards();renderHealth();patchCategoryIcons();injectAccountControls();window.SENYAAVAI?.enhance?.();
  }
  function scheduleEnhance(){
    if(enhanceQueued)return;
    enhanceQueued=true;
    requestAnimationFrame(()=>{
      enhanceQueued=false;
      enhanceAll();
    });
  }
  function runInitialEnhance(){
    scheduleEnhance();
    scheduleStartupDashboardProgress();
  }
  function isCoreNode(node){return node?.nodeType===1&&!String(node.id||'').startsWith('aos');}
  if(app){
    const appObserver=new MutationObserver(mutations=>{
      const added=mutations.flatMap(m=>[...m.addedNodes]);
      if(added.some(isCoreNode))scheduleEnhance();
    });
    appObserver.observe(app,{childList:true,subtree:false});
  }
  if(modalBody){
    const modalObserver=new MutationObserver(mutations=>{if(mutations.some(m=>m.addedNodes.length))scheduleEnhance();});
    modalObserver.observe(modalBody,{childList:true,subtree:false});
  }
  document.addEventListener('change',e=>{if(e.target?.id==='financeMonthPicker'){planFactMonth=e.target.value;scheduleEnhance();}});
  window.addEventListener('pageshow',scheduleEnhance);
  bindSettingsReturnBehavior();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',runInitialEnhance,{once:true});else runInitialEnhance();

  document.documentElement.classList.add('aos-runtime-v155');
  window.AlexanderOSV155={version:BUILD,openDashboardLabels,openAccountFlow,enhanceAll};
})();
