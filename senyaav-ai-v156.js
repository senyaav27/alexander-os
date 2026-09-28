(() => {
  'use strict';

  const BUILD = '15.6.0';
  const STATE_KEY = 'alexander_os_v1';
  const ACTIVITY_KEY = 'senyaav_ai_activity_v1';
  const META_KEY = 'senyaav_ai_meta_v1';
  const MAX_ACTIVITY = 300;
  const originalSetItem = Storage.prototype.setItem;
  const originalGetItem = Storage.prototype.getItem;
  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => root?.querySelectorAll ? [...root.querySelectorAll(selector)] : [];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
  const money = value => `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(value||0))} ₽`;
  const pad = value => String(value).padStart(2,'0');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const monthKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}`;
  const uid = prefix => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
  const nowISO = () => new Date().toISOString();
  const sum = values => (values || []).reduce((acc, value) => acc + Number(value || 0), 0);

  const CATEGORY_LABELS = {
    groceries:'Продукты', cafes:'Кафе и доставка', transport:'Транспорт', taxi:'Такси', housing:'Жильё',
    subscriptions:'Подписки', health:'Здоровье', clothing:'Одежда', entertainment:'Развлечения', education:'Обучение',
    business:'Бизнес', gifts:'Подарки', debt_payment:'Долги и кредиты', travel:'Путешествия', other_expense:'Другое',
    salary:'Зарплата', client:'Клиенты', project_income:'Свои проекты', shop:'Магазин', refund:'Возврат', gift_income:'Подарок', other_income:'Другой доход'
  };

  const AI_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z"/><path d="M18.3 15.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>';
  const AREA_ICON = {
    finance:'₽', tasks:'✓', projects:'▣', growth:'↗', health:'◉', activity:'•', system:'✦'
  };

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function loadState() {
    const raw = originalGetItem.call(localStorage, STATE_KEY);
    const state = safeParse(raw, {}) || {};
    state.profile ||= {};
    ['accounts','transactions','tasks','projects','goals','habits','bodyLogs','focusItems','clientPipeline','obligations','notes','weeklyReviews','incomeLevers','recurringRules','workoutLogs','accountTransfers'].forEach(key => {
      state[key] = Array.isArray(state[key]) ? state[key] : [];
    });
    return state;
  }
  function loadActivity() {
    return safeParse(originalGetItem.call(localStorage, ACTIVITY_KEY), []) || [];
  }
  function saveActivity(items) {
    originalSetItem.call(localStorage, ACTIVITY_KEY, JSON.stringify(items.slice(0, MAX_ACTIVITY)));
  }
  function loadMeta() {
    return safeParse(originalGetItem.call(localStorage, META_KEY), {}) || {};
  }
  function saveMeta(meta) {
    originalSetItem.call(localStorage, META_KEY, JSON.stringify(meta));
  }
  function pushActivity(event) {
    const list = loadActivity();
    const item = {
      id: uid('act'),
      at: nowISO(),
      area: event.area || 'system',
      type: event.type || 'change',
      title: String(event.title || 'Изменение').slice(0, 120),
      detail: String(event.detail || '').slice(0, 220),
      entityId: event.entityId || ''
    };
    const previous = list[0];
    if (previous && previous.title === item.title && previous.detail === item.detail && Date.now() - new Date(previous.at).getTime() < 1200) return;
    list.unshift(item);
    saveActivity(list);
    window.dispatchEvent(new CustomEvent('senyaavai:activity', { detail:item }));
  }

  function byId(items) {
    return new Map((items || []).filter(item => item && item.id != null).map(item => [String(item.id), item]));
  }
  function changed(a, b, fields) {
    return fields.some(field => JSON.stringify(a?.[field]) !== JSON.stringify(b?.[field]));
  }
  function diffCollection(before, after, handlers = {}) {
    const prev = byId(before), next = byId(after);
    for (const [id, item] of next) {
      if (!prev.has(id)) handlers.added?.(item);
      else if (handlers.updated) handlers.updated(prev.get(id), item);
    }
    for (const [id, item] of prev) if (!next.has(id)) handlers.removed?.(item);
  }

  function captureStateDiff(before, after) {
    if (!before || !after) return;
    diffCollection(before.transactions, after.transactions, {
      added: tx => pushActivity({ area:'finance', type:tx.type, title:tx.type === 'income' ? 'Добавлен доход' : 'Добавлен расход', detail:`${tx.title || CATEGORY_LABELS[tx.category] || 'Операция'} - ${money(tx.amount)}`, entityId:tx.id }),
      removed: tx => pushActivity({ area:'finance', type:'delete', title:'Удалена операция', detail:`${tx.title || CATEGORY_LABELS[tx.category] || 'Операция'} - ${money(tx.amount)}`, entityId:tx.id }),
      updated: (a,b) => { if (changed(a,b,['title','amount','category','date','accountId','necessity','scope'])) pushActivity({ area:'finance', type:'edit', title:'Изменена операция', detail:`${b.title || CATEGORY_LABELS[b.category] || 'Операция'} - ${money(b.amount)}`, entityId:b.id }); }
    });
    diffCollection(before.tasks, after.tasks, {
      added: item => pushActivity({ area:'tasks', type:'add', title:'Добавлена задача', detail:item.title, entityId:item.id }),
      removed: item => pushActivity({ area:'tasks', type:'delete', title:'Удалена задача', detail:item.title, entityId:item.id }),
      updated: (a,b) => {
        if (a.status !== b.status) pushActivity({ area:'tasks', type:b.status === 'done' ? 'done' : 'reopen', title:b.status === 'done' ? 'Задача выполнена' : 'Задача возвращена', detail:b.title, entityId:b.id });
        else if (changed(a,b,['title','due','dueTime','priority','projectId','notes'])) pushActivity({ area:'tasks', type:'edit', title:'Изменена задача', detail:b.title, entityId:b.id });
      }
    });
    diffCollection(before.projects, after.projects, {
      added: item => pushActivity({ area:'projects', type:'add', title:'Добавлен проект', detail:item.name, entityId:item.id }),
      removed: item => pushActivity({ area:'projects', type:'delete', title:'Удалён проект', detail:item.name, entityId:item.id }),
      updated: (a,b) => { if (changed(a,b,['name','status','paymentStatus','paymentDate','next','value'])) pushActivity({ area:'projects', type:'edit', title:'Обновлён проект', detail:`${b.name}${b.next ? ` - следующий шаг: ${b.next}` : ''}`, entityId:b.id }); }
    });
    diffCollection(before.goals, after.goals, {
      added: item => pushActivity({ area:'growth', type:'add', title:'Добавлена цель', detail:item.title, entityId:item.id }),
      removed: item => pushActivity({ area:'growth', type:'delete', title:'Удалена цель', detail:item.title, entityId:item.id }),
      updated: (a,b) => { if (changed(a,b,['title','current','target','deadline','nextAction'])) pushActivity({ area:'growth', type:'edit', title:'Обновлена цель', detail:b.title, entityId:b.id }); }
    });
    diffCollection(before.habits, after.habits, {
      added: item => pushActivity({ area:'growth', type:'add', title:'Добавлена привычка', detail:item.title, entityId:item.id }),
      removed: item => pushActivity({ area:'growth', type:'delete', title:'Удалена привычка', detail:item.title, entityId:item.id }),
      updated: (a,b) => {
        if (JSON.stringify(a.logs || {}) !== JSON.stringify(b.logs || {})) {
          const beforeLogs = a.logs || {}, afterLogs = b.logs || {};
          const keys = [...new Set([...Object.keys(beforeLogs), ...Object.keys(afterLogs)])];
          const key = keys.find(k => Boolean(beforeLogs[k]) !== Boolean(afterLogs[k]));
          const done = key ? Boolean(afterLogs[key]) : true;
          pushActivity({ area:'growth', type:done ? 'done' : 'reopen', title:done ? 'Привычка отмечена' : 'Отметка привычки снята', detail:`${b.title}${key ? ` - ${key}` : ''}`, entityId:b.id });
        } else if (changed(a,b,['title','targetPerWeek','schedule','pinned'])) pushActivity({ area:'growth', type:'edit', title:'Изменена привычка', detail:b.title, entityId:b.id });
      }
    });
    diffCollection(before.bodyLogs, after.bodyLogs, {
      added: item => pushActivity({ area:'health', type:'add', title:'Записан вес', detail:`${String(item.weight).replace('.',',')} кг${item.notes ? ` - ${item.notes}` : ''}`, entityId:item.id }),
      removed: item => pushActivity({ area:'health', type:'delete', title:'Удалена запись веса', detail:`${item.weight} кг`, entityId:item.id })
    });
    diffCollection(before.clientPipeline, after.clientPipeline, {
      added: item => pushActivity({ area:'projects', type:'add', title:'Добавлен лид', detail:`${item.name}${item.potential ? ` - ${money(item.potential)}` : ''}`, entityId:item.id }),
      removed: item => pushActivity({ area:'projects', type:'delete', title:'Удалён лид', detail:item.name, entityId:item.id }),
      updated: (a,b) => { if (changed(a,b,['status','potential','probability','nextAction','nextDate'])) pushActivity({ area:'projects', type:'edit', title:'Обновлена воронка', detail:`${b.name} - ${b.status}`, entityId:b.id }); }
    });
    diffCollection(before.obligations, after.obligations, {
      added: item => pushActivity({ area:'finance', type:'add', title:'Добавлен платёж', detail:`${item.title || 'Платёж'} - ${money(item.amount)}`, entityId:item.id }),
      removed: item => pushActivity({ area:'finance', type:'delete', title:'Удалён платёж', detail:item.title || 'Платёж', entityId:item.id }),
      updated: (a,b) => { if (changed(a,b,['status','amount','dueDate','title'])) pushActivity({ area:'finance', type:'edit', title:'Обновлён платёж', detail:`${b.title || 'Платёж'} - ${money(b.amount)}`, entityId:b.id }); }
    });
    diffCollection(before.focusItems, after.focusItems, {
      added: item => pushActivity({ area:'tasks', type:'add', title:'Добавлен фокус', detail:item.title, entityId:item.id }),
      removed: item => pushActivity({ area:'tasks', type:'delete', title:'Удалён фокус', detail:item.title, entityId:item.id }),
      updated: (a,b) => { if (a.done !== b.done) pushActivity({ area:'tasks', type:b.done ? 'done' : 'reopen', title:b.done ? 'Фокус выполнен' : 'Фокус возвращён', detail:b.title, entityId:b.id }); }
    });
    diffCollection(before.accountTransfers, after.accountTransfers, {
      added: item => pushActivity({ area:'finance', type:'transfer', title:'Перевод между счетами', detail:`${item.fromName || 'Счёт'} → ${item.toName || 'Счёт'} - ${money(item.amount)}`, entityId:item.id }),
      removed: item => pushActivity({ area:'finance', type:'undo', title:'Перевод отменён', detail:`${item.fromName || 'Счёт'} → ${item.toName || 'Счёт'} - ${money(item.amount)}`, entityId:item.id })
    });
    diffCollection(before.notes, after.notes, {
      added: item => pushActivity({ area:'system', type:'add', title:'Добавлена заметка', detail:item.title, entityId:item.id }),
      removed: item => pushActivity({ area:'system', type:'delete', title:'Удалена заметка', detail:item.title, entityId:item.id }),
      updated: (a,b) => { if (changed(a,b,['title','body','tags'])) pushActivity({ area:'system', type:'edit', title:'Изменена заметка', detail:b.title, entityId:b.id }); }
    });
  }

  let trackerReady = false;
  Storage.prototype.setItem = function(key, value) {
    if (this !== localStorage || key !== STATE_KEY) return originalSetItem.call(this, key, value);
    const before = safeParse(originalGetItem.call(this, key), null);
    const result = originalSetItem.call(this, key, value);
    if (trackerReady) {
      const after = safeParse(value, null);
      try { captureStateDiff(before, after); } catch (error) { console.error('[SENYAAV AI V15.6] activity diff failed', error); }
    }
    return result;
  };

  function setTrackerReady() {
    if (trackerReady) return;
    trackerReady = true;
    const meta = loadMeta();
    meta.lastOpenAt = nowISO();
    meta.openCount = Number(meta.openCount || 0) + 1;
    meta.version = BUILD;
    saveMeta(meta);
  }
  window.addEventListener('load', () => window.setTimeout(setTrackerReady, 450), { once:true });
  window.setTimeout(setTrackerReady, 1800);

  // Lightweight usage stats. These are counts, not a noisy click-by-click activity feed.
  document.addEventListener('click', event => {
    const nav = event.target.closest?.('.nav-item[data-screen]');
    if (nav) {
      const meta = loadMeta();
      meta.screenVisits ||= {};
      meta.screenVisits[nav.dataset.screen] = Number(meta.screenVisits[nav.dataset.screen] || 0) + 1;
      meta.lastScreen = nav.dataset.screen;
      meta.lastScreenAt = nowISO();
      saveMeta(meta);
    }
  }, { passive:true });

  function startOfDay(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
  function dateMs(value) {
    if (!value) return NaN;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
    return d.getTime();
  }
  function daysSince(value) {
    const ms = dateMs(value);
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.floor((startOfDay().getTime() - startOfDay(new Date(ms)).getTime()) / 86400000));
  }
  function formatDateTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(d);
  }
  function categoryLabel(key) { return CATEGORY_LABELS[key] || 'Другое'; }
  function currentMonthTransactions(state, type) {
    const key = monthKey(new Date());
    return (state.transactions || []).filter(tx => (!type || tx.type === type) && String(tx.date || '').slice(0,7) === key);
  }
  function incomeTarget(state) {
    const key = monthKey(new Date());
    const specific = Number(state.profile?.monthlyIncomeTargets?.[key]);
    return Number.isFinite(specific) && specific > 0 ? specific : Number(state.profile?.monthlyIncomeTarget || 0);
  }
  function financeSnapshot(state) {
    const incomes = currentMonthTransactions(state, 'income');
    const expenses = currentMonthTransactions(state, 'expense');
    const income = sum(incomes.map(x=>x.amount));
    const expense = sum(expenses.map(x=>x.amount));
    const target = incomeTarget(state);
    const gap = Math.max(0, target - income);
    const limit = Number(state.profile?.monthlyExpenseLimit || 0);
    const day = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
    const projected = day > 0 ? Math.round(expense / day * daysInMonth) : expense;
    const categories = new Map();
    expenses.forEach(tx => categories.set(tx.category || 'other_expense', Number(categories.get(tx.category || 'other_expense') || 0) + Number(tx.amount || 0)));
    const categoryRows = [...categories.entries()].map(([key,amount])=>({key,label:categoryLabel(key),amount})).sort((a,b)=>b.amount-a.amount);
    const lastExpense = (state.transactions || []).filter(tx=>tx.type==='expense').slice().sort((a,b)=>String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))[0];
    const lastIncome = (state.transactions || []).filter(tx=>tx.type==='income').slice().sort((a,b)=>String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))[0];
    return { income, expense, target, gap, limit, projected, categoryRows, lastExpense, lastIncome };
  }
  function taskSnapshot(state) {
    const today = todayISO();
    const now = new Date();
    const active = (state.tasks || []).filter(task => task.status !== 'done');
    const overdue = active.filter(task => task.due && task.due < today);
    const todayTasks = active.filter(task => task.due === today);
    const timed = todayTasks.filter(task => /^\d{1,2}:\d{2}$/.test(String(task.dueTime || ''))).map(task => {
      const [h,m] = task.dueTime.split(':').map(Number);
      const when = new Date(); when.setHours(h,m,0,0);
      return { task, when, minutes:Math.round((when-now)/60000) };
    }).sort((a,b)=>a.when-b.when);
    const english = todayTasks.find(task => /англ|english/i.test(`${task.title} ${task.project || ''} ${task.notes || ''}`));
    return { active, overdue, todayTasks, timed, english };
  }
  function projectSnapshot(state) {
    const active = (state.projects || []).filter(project => ['active','growth'].includes(project.status));
    const noNext = active.filter(project => !String(project.next || '').trim());
    const overdue = active.filter(project => project.paymentStatus === 'overdue' || (project.paymentStatus === 'waiting' && project.paymentDate && project.paymentDate < todayISO()));
    const pipeline = state.clientPipeline || [];
    const leads = pipeline.filter(x=>!['paid','lost','retainer'].includes(x.status));
    const paid = pipeline.filter(x=>['paid','retainer'].includes(x.status));
    return { active, noNext, overdue, pipeline, leads, paid };
  }

function healthSnapshot(state) {
  const logs = (state.bodyLogs || []).filter(x=>Number(x.weight)>0).slice().sort((a,b)=>String(a.date || '').localeCompare(String(b.date || '')));
  const current = Number(logs.at(-1)?.weight || state.workoutProfile?.weight || 0);
  const previous = Number(logs.at(-2)?.weight || 0);
  const target = Number(state.workoutProfile?.targetWeight || 0);
  const change = current && previous ? Number((current-previous).toFixed(1)) : 0;
  const trendUp = logs.length >= 3 ? Number(logs.at(-1).weight || 0) > Number(logs.at(-2).weight || 0) && Number(logs.at(-2).weight || 0) >= Number(logs.at(-3).weight || 0) : false;
  return { logs, current, previous, target, change, trendUp };
}
function englishSnapshot(state) {
  const profile = state.profile || {};
  const taskState = taskSnapshot(state);
  const habit = (state.habits || []).find(x => /англ|english/i.test(String(x.title || '')));
  const current = profile.englishCurrentLevel || profile.englishLevel || 'A1';
  const target = profile.englishTargetLevel || 'B2';
  const progress = Math.max(0, Math.min(100, Number(profile.englishProgress || profile.englishPercent || 18)));
  const deadline = profile.englishDeadline || 'декабрю 2026';
  return { current, target, progress, deadline, task: taskState.english, habit };
}
function taskValueScore(task) {
  const hay = `${task?.title || ''} ${task?.project || ''} ${task?.notes || ''}`.toLowerCase();
  let score = 0;
  if (/(senyamarketing|rift|tvoe|кейс|клиент|доход|реклама|отч[её]т|кампан|продаж)/i.test(hay)) score += 5;
  if (task?.priority === 'high' || /важн/i.test(hay)) score += 2;
  if (task?.due === todayISO()) score += 1;
  if (/англ|english|продукт|магазин|доставка/i.test(hay)) score -= 1;
  return score;
}
function focusTask(state) {
  return (taskSnapshot(state).active || []).slice().sort((a,b)=>taskValueScore(b)-taskValueScore(a)||String(a.due || '9999-99-99').localeCompare(String(b.due || '9999-99-99'))||String(a.dueTime || '99:99').localeCompare(String(b.dueTime || '99:99')))[0] || null;
}
function compactText(text, max = 108) {
  const clean = String(text || '').replace(/\s+/g,' ').trim();
  if (clean.length <= max) return clean;
  const short = clean.slice(0, max).replace(/[\s,;:.!?-]+$/,'');
  return `${short}…`;
}
function listLabel(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}
function buildFinanceInsights(state) {
  const finance = financeSnapshot(state);
  const signals = buildSignals(state).filter(x=>['finance','activity'].includes(x.area));
  const insights = [];
  const top = signals.find(x => x.id === 'expense-over' || x.id === 'top-expense');
  if (top) insights.push({ area:'finance', title: top.title, text: top.text, severity: top.severity });
  if (finance.gap > 0) insights.push({ area:'finance', title:`До цели дохода ${money(finance.gap)}`, text:'Сфокусируйся на действиях, которые могут дать выручку в этом месяце.', severity:'info' });
  if (finance.lastExpense) {
    const age = daysSince(finance.lastExpense.createdAt || finance.lastExpense.date);
    insights.push({ area:'activity', title: age === 0 ? 'Расходы обновлены сегодня' : `Последний расход ${age} дн. назад`, text: age >= 3 ? 'Добавь новые траты, чтобы бюджет не искажался.' : 'База расходов выглядит актуально.', severity: age >= 3 ? 'warning' : 'good' });
  }
  if (!insights.length) insights.push({ area:'finance', title:'Финансовых перекосов не вижу', text:'Продолжай фиксировать траты и держать фокус на доходных действиях.', severity:'good' });
  return insights.slice(0,3);
}
function mountAtScreenEnd(card) {
  const app = document.getElementById('app');
  if (!app || !card) return;
  if (app.lastElementChild !== card) app.append(card);
}

  function signal(id, area, severity, priority, title, text, action = {}) {
    return { id, area, severity, priority, title, text, action };
  }

function buildSignals(state = loadState()) {
  const signals = [];
  const finance = financeSnapshot(state);
  const tasks = taskSnapshot(state);
  const projects = projectSnapshot(state);
  const health = healthSnapshot(state);
  const english = englishSnapshot(state);
  const reducible = new Set(['cafes','taxi','subscriptions','clothing','entertainment','travel']);
  const focus = focusTask(state);

  if (focus && taskValueScore(focus) >= 4) {
    signals.push(signal('task-focus','tasks','info',98,`Сначала: ${focus.title}`,'Эта задача ближе всего к доходу или ключевому результату. Дай ей первый сильный слот дня.',{screen:'tasks'}));
  }
  if (tasks.overdue.length) {
    signals.push(signal('tasks-overdue','tasks','danger',96,`Просрочено: ${listLabel(tasks.overdue.length,'задача','задач')}`,'Закрой минимум одну сегодня или перенеси срок, чтобы не размывать фокус.',{screen:'tasks'}));
  }
  if (english.task) {
    signals.push(signal('english-today','tasks','info',83,`Английский${english.task.dueTime ? ` в ${english.task.dueTime}` : ' сегодня'}`,'После занятия сразу отметь выполнение, чтобы прогресс был честным.',{screen:'growth'}));
  }
  if (tasks.todayTasks.length >= 4) {
    signals.push(signal('tasks-load','tasks','warning',78,`Сегодня ${tasks.todayTasks.length} открытых задач`,'Оставь 1–3 результата дня, остальное не должно спорить за внимание.',{screen:'tasks'}));
  }

  if (finance.target > 0 && finance.gap > 0) {
    signals.push(signal('income-gap','finance','info',92,`До цели дохода ${money(finance.gap)}`,'Смотри в первую очередь на задачи, которые дают деньги, а не на косметическую занятость.',{screen:'finance'}));
  }
  if (finance.limit > 0 && finance.projected > finance.limit) {
    signals.push(signal('expense-over','finance','danger',94,'Расходы выше безопасного темпа',`Прогноз около ${money(finance.projected)} при лимите ${money(finance.limit)}. Сократи необязательные траты.`,{screen:'finance'}));
  }
  const top = finance.categoryRows[0];
  if (top && finance.expense > 0 && reducible.has(top.key)) {
    const share = Math.round(top.amount / Math.max(1, finance.expense) * 100);
    if (share >= 14) signals.push(signal('top-expense','finance','warning',90,`${top.label} съедают бюджет`,`${money(top.amount)} и около ${share}% всех расходов месяца. Это первая зона сокращения.`,{screen:'finance'}));
  }
  const expenseAge = daysSince(finance.lastExpense?.createdAt || finance.lastExpense?.date);
  if (expenseAge !== null && expenseAge >= 3) signals.push(signal('expense-stale','activity','warning',74,`Расходы не обновлялись ${expenseAge} дн.`,'Если траты были позже, аналитика уже неполная.',{screen:'finance'}));
  if (!finance.lastExpense) signals.push(signal('expense-empty','activity','warning',73,'Нет записанных расходов','Без расходов SENYAAV AI не сможет нормально подсказать, где течёт бюджет.',{screen:'finance'}));

  if (projects.overdue.length) signals.push(signal('project-payment','projects','danger',95,`Оплата просрочена: ${listLabel(projects.overdue.length,'проект','проектов')}`,'Сначала верни контроль по деньгам и следующим контактам с клиентами.',{screen:'projects'}));
  if (projects.noNext.length) signals.push(signal('project-next','projects','warning',86,`${listLabel(projects.noNext.length,'активный проект','активных проекта')} без шага`,'Добавь конкретное следующее действие, иначе проект выглядит активным, но стоит.',{screen:'projects'}));
  if (projects.leads.length && !projects.paid.length) signals.push(signal('pipeline-stall','projects','warning',80,'Воронка есть, оплат пока нет','Проверь, на каком этапе теряются лиды, и усили следующий шаг.',{screen:'projects'}));

  if (health.trendUp || health.change >= 0.8) {
    signals.push(signal('health-up','health','warning',70,'Вес растёт последние недели','На этой неделе уменьшай калорийность на 10–15% и добавь 1 кардио-сессию.',{screen:'growth'}));
  } else if (health.current && health.target) {
    const gap = Number((health.current - health.target).toFixed(1));
    if (gap > 0) signals.push(signal('health-gap','health','info',64,`До цели по весу ${String(gap).replace('.',',')} кг`,'Следи за трендом по нескольким неделям, а не по одной записи.',{screen:'growth'}));
  }

  const activity = loadActivity();
  if (activity.length) {
    const latest = activity[0];
    signals.push(signal('recent-activity','activity','neutral',30,'Последнее действие',`${latest.title}${latest.detail ? ` — ${latest.detail}` : ''}.`,{}));
  }

  if (!signals.length) signals.push(signal('steady','system','good',20,'День выглядит ровно','Продолжай фиксировать факты и двигаться по текущему плану.',{}));
  return signals.sort((a,b)=>b.priority-a.priority);
}


function topSignal(area) {
  const signals = buildSignals();
  if (!area) return signals[0];
  const found = signals.find(item => item.area === area);
  if (found) return found;
  const fallbacks = {
    tasks: signal('tasks-steady','tasks','good',10,'Задачи под контролем','Сегодня нет срочного сигнала. Выбери один главный результат и закрой его первым.',{screen:'tasks'}),
    projects: signal('projects-steady','projects','good',10,'Проекты без критики','Держи явным следующий шаг по каждому активному проекту.',{screen:'projects'}),
    growth: signal('growth-steady','growth','good',10,'Прогресс идёт','Фиксируй привычки, цели и фактические результаты.',{screen:'growth'}),
    health: signal('health-steady','health','good',10,'По здоровью без нового сигнала','Добавляй вес и тренировки по факту, чтобы видеть честную динамику.',{screen:'growth'}),
    finance: signal('finance-steady','finance','good',10,'Финансы без срочного сигнала','Продолжай заносить доходы и расходы без пропусков.',{screen:'finance'}),
    activity: signal('activity-steady','activity','neutral',10,'Журнал действий активен','SENYAAV AI фиксирует ключевые действия внутри приложения.',{})
  };
  return fallbacks[area] || signal('system-steady','system','good',10,'Критичных отклонений не вижу','Продолжай текущий план.',{});
}

  function iconMarkup(area='system') {
    return `<span class="senyaav-ai-icon">${AI_ICON}</span>`;
  }
  function severityClass(value) { return ['danger','warning','good','info'].includes(value) ? value : 'neutral'; }

function signalMarkup(item, compact = false) {
  const body = compact ? compactText(item.text, 94) : item.text;
  return `<button type="button" class="senyaav-ai-signal ${severityClass(item.severity)} ${compact?'compact':''}" data-ai-signal-area="${esc(item.area)}"><span class="senyaav-ai-signal-mark">${AREA_ICON[item.area] || '✦'}</span><span class="senyaav-ai-signal-copy"><b>${esc(item.title)}</b><small>${esc(body)}</small></span><span class="senyaav-ai-arrow">›</span></button>`;
}

  function ensureDialog() {
    let dialog = $('#senyaavAiDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'senyaavAiDialog';
    dialog.className = 'senyaav-ai-dialog';
    dialog.innerHTML = `<div class="senyaav-ai-sheet"><header class="senyaav-ai-dialog-head"><div class="senyaav-ai-brand">${iconMarkup()}<div><strong>SENYAAV AI <span>Preview</span></strong><small>Локальный аналитический ассистент Alexander OS</small></div></div><button type="button" class="senyaav-ai-close" aria-label="Закрыть">×</button></header><nav class="senyaav-ai-tabs" aria-label="Разделы SENYAAV AI"><button type="button" data-ai-tab="overview">Обзор</button><button type="button" data-ai-tab="finance">Финансы</button><button type="button" data-ai-tab="tasks">Задачи</button><button type="button" data-ai-tab="projects">Проекты</button><button type="button" data-ai-tab="growth">Прогресс</button><button type="button" data-ai-tab="activity">Действия</button></nav><main id="senyaavAiBody" class="senyaav-ai-dialog-body"></main><form id="senyaavAiAskForm" class="senyaav-ai-ask"><input id="senyaavAiQuestion" maxlength="220" autocomplete="off" placeholder="Спроси SENYAAV AI о своих данных"><button type="submit" aria-label="Отправить">↑</button></form></div>`;
    document.body.append(dialog);
    $('.senyaav-ai-close', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    $$('[data-ai-tab]', dialog).forEach(button => button.addEventListener('click', () => setDialogTab(button.dataset.aiTab)));
    $('#senyaavAiAskForm', dialog).addEventListener('submit', event => {
      event.preventDefault();
      const input = $('#senyaavAiQuestion', dialog);
      const question = input.value.trim();
      if (!question) return;
      renderLocalAnswer(question);
      input.value = '';
    });
    return dialog;
  }

  let activeTab = 'overview';
  function openAI(tab = 'overview') {
    const dialog = ensureDialog();
    setDialogTab(tab);
    if (!dialog.open) dialog.showModal();
  }
  function setDialogTab(tab) {
    activeTab = ['overview','finance','tasks','projects','growth','activity'].includes(tab) ? tab : 'overview';
    const dialog = ensureDialog();
    $$('[data-ai-tab]', dialog).forEach(button => button.classList.toggle('active', button.dataset.aiTab === activeTab));
    renderDialogBody();
  }

  function metric(label, value, sub = '') {
    return `<div class="senyaav-ai-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  }

function renderDialogBody() {
  const body = $('#senyaavAiBody');
  if (!body) return;
  const state = loadState();
  const signals = buildSignals(state);
  const finance = financeSnapshot(state);
  const tasks = taskSnapshot(state);
  const projects = projectSnapshot(state);
  const health = healthSnapshot(state);
  const english = englishSnapshot(state);
  const activity = loadActivity();
  if (activeTab === 'overview') {
    body.innerHTML = `<section class="senyaav-ai-hero"><div><small>Короткий разбор</small><h2>${Math.min(3, signals.length)} сигнала на сейчас</h2></div><span class="senyaav-ai-live">Без дублей</span></section><section class="senyaav-ai-stack">${signals.filter(x=>x.id!=='recent-activity').slice(0,4).map(item=>signalMarkup(item,true)).join('')}</section><section class="senyaav-ai-note"><b>Как читать SENYAAV AI</b><p>Сверху только выводы и приоритет. Цифры смотри в карточках разделов, здесь — что именно делать дальше.</p></section>`;
  } else if (activeTab === 'finance') {
    const lastExpenseAge = daysSince(finance.lastExpense?.createdAt || finance.lastExpense?.date);
    body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Доход месяца',money(finance.income),finance.target?`из ${money(finance.target)}`:'цель не задана')}${metric('Расход месяца',money(finance.expense),finance.limit?`лимит ${money(finance.limit)}`:'лимит не задан')}${metric('Прогноз',money(finance.projected),'при текущем темпе')}${metric('Последний расход',lastExpenseAge===null?'нет данных':lastExpenseAge===0?'сегодня':`${lastExpenseAge} дн. назад`,finance.lastExpense?.title || '')}</section><section class="senyaav-ai-stack">${buildFinanceInsights(state).map(item=>signalMarkup(item,true)).join('')}</section>`;
  } else if (activeTab === 'tasks') {
    body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Сегодня',String(tasks.todayTasks.length),'открытых задач')}${metric('Просрочено',String(tasks.overdue.length),'требуют решения')}${metric('Всего открыто',String(tasks.active.length),'в системе')}${metric('По времени',String(tasks.timed.length),'на сегодня')}</section>${tasks.timed.length?`<section class="senyaav-ai-timeline">${tasks.timed.slice(0,6).map(x=>`<div><time>${esc(x.task.dueTime)}</time><span><b>${esc(x.task.title)}</b><small>${x.minutes<0?'время уже прошло':'запланировано на сегодня'}</small></span></div>`).join('')}</section>`:''}<section class="senyaav-ai-stack">${signals.filter(x=>x.area==='tasks').slice(0,4).map(item=>signalMarkup(item,true)).join('') || '<div class="senyaav-ai-empty">По задачам нет срочных сигналов.</div>'}</section>`;
  } else if (activeTab === 'projects') {
    body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Активные проекты',String(projects.active.length))}${metric('Без шага',String(projects.noNext.length))}${metric('Лиды в работе',String(projects.leads.length))}${metric('Оплата / ведение',String(projects.paid.length))}</section><section class="senyaav-ai-stack">${signals.filter(x=>x.area==='projects').slice(0,4).map(item=>signalMarkup(item,true)).join('') || '<div class="senyaav-ai-empty">Проекты выглядят управляемо.</div>'}</section>`;
  } else if (activeTab === 'growth') {
    body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Текущий вес',health.current?`${String(health.current).replace('.',',')} кг`:'нет данных')}${metric('Цель веса',health.target?`${String(health.target).replace('.',',')} кг`:'не задана')}${metric('Английский',english.current,`${english.progress}% к ${english.target}`)}${metric('Задача по англ.',english.task ? (english.task.dueTime || 'сегодня') : 'нет задачи',`цель: ${english.target} к ${english.deadline}`)}</section><section class="senyaav-ai-stack">${signals.filter(x=>['health','growth','tasks'].includes(x.area)).slice(0,4).map(item=>signalMarkup(item,true)).join('')}</section>`;
  } else {
    body.innerHTML = `<section class="senyaav-ai-activity-head"><div><small>Журнал действий</small><h2>${activity.length} событий</h2></div><span>автотрекинг</span></section><section class="senyaav-ai-activity">${activity.length ? activity.slice(0,80).map(item=>`<div class="senyaav-ai-activity-row"><span class="senyaav-ai-activity-dot ${esc(item.area)}"></span><div><b>${esc(item.title)}</b>${item.detail?`<small>${esc(item.detail)}</small>`:''}<time>${esc(formatDateTime(item.at))}</time></div></div>`).join('') : '<div class="senyaav-ai-empty">Журнал заполнится после новых расходов, задач, проектов, привычек и записей веса.</div>'}</section>`;
  }
  bindOpeners();
  bindShortcuts();
}


  function localAnswer(question) {
    const q = question.toLowerCase();
    const state = loadState();
    const finance = financeSnapshot(state), tasks = taskSnapshot(state), projects = projectSnapshot(state), health = healthSnapshot(state), english = englishSnapshot(state), signals = buildSignals(state);
    const focus = focusTask(state);
    if (/что.*делать|что.*сегодня|приоритет|фокус/.test(q)) {
      const items = [];
      if (focus) items.push(`1. ${focus.title} — лучший первый фокус дня.`);
      if (tasks.overdue.length) items.push(`2. Закрой или перенеси ${listLabel(tasks.overdue.length,'просроченную задачу','просроченные задачи')}.`);
      if (english.task) items.push(`3. Не пропусти английский${english.task.dueTime ? ` в ${english.task.dueTime}` : ''}.`);
      return { title:'Что важно сделать сегодня', text:(items.slice(0,3).join('\n') || 'Критичных действий не вижу. Закрой один важный результат дня и не распыляйся.'), actions:['tasks','projects','finance'] };
    }
    if (/англ|english/.test(q)) {
      return { title:'Английский', text:english.task ? `Сегодня есть задача «${english.task.title}»${english.task.dueTime ? ` на ${english.task.dueTime}` : ''}. После занятия сразу отметь выполнение.` : `Текущий трек: ${english.current}, цель ${english.target} к ${english.deadline}. Добавь короткую задачу или привычку на сегодня.`, actions:['growth','tasks'] };
    }
    if (/расход|бюджет|финанс|деньг|доход/.test(q)) return { title:'Финансы', text:`Доход месяца ${money(finance.income)}${finance.target?` из ${money(finance.target)}`:''}. Расходы ${money(finance.expense)}${finance.limit?`, лимит ${money(finance.limit)}`:''}. ${signals.find(x=>x.area==='finance')?.text || 'Критичных финансовых отклонений сейчас не вижу.'}`, actions:['finance','new-expense'] };
    if (/задач|дела|срок|проср/.test(q)) return { title:'Задачи', text:`Сегодня открыто ${tasks.todayTasks.length}, просрочено ${tasks.overdue.length}, всего открыто ${tasks.active.length}. ${signals.find(x=>x.area==='tasks')?.text || 'Срочных сигналов нет.'}`, actions:['tasks','new-task'] };
    if (/проект|rift|senya|клиент|воронк/.test(q)) return { title:'Проекты', text:`Активных проектов ${projects.active.length}, без следующего шага ${projects.noNext.length}, лидов в работе ${projects.leads.length}. ${signals.find(x=>x.area==='projects')?.text || 'Критичных проектных отклонений сейчас не вижу.'}`, actions:['projects','tasks'] };
    if (/вес|здоров|тренир|тело/.test(q)) return { title:'Прогресс и здоровье', text:health.current ? `Последний вес ${String(health.current).replace('.',',')} кг${health.target?`, цель ${String(health.target).replace('.',',')} кг`:''}. ${signals.find(x=>x.area==='health')?.text || 'Смотри на тренд по нескольким записям.'}` : 'Записей веса пока недостаточно для анализа.', actions:['growth'] };
    if (/последн|делал|действ|истор/.test(q)) {
      const activity = loadActivity().slice(0,5);
      return { title:'Последние действия', text:activity.length ? activity.map(item=>`${item.title}${item.detail?` — ${item.detail}`:''}`).join('\n') : 'После установки V15.6 новых действий ещё не записано.', actions:['activity'] };
    }
    return { title:'SENYAAV AI', text:`Главное сейчас: ${signals.slice(0,3).map(x=>x.title).join('; ')}. Я уже понимаю данные приложения и умею давать короткие приоритеты без повторения цифр.`, actions:['overview','tasks','finance'] };
  }


  function renderLocalAnswer(question) {
    const body = $('#senyaavAiBody');
    if (!body) return;
    const answer = localAnswer(question);
    const actionMap = {
      overview:'Обзор', finance:'Показать финансы', tasks:'Показать задачи', projects:'Показать проекты', growth:'Прогресс', activity:'Журнал', 'new-task':'Создать задачу', 'new-expense':'Добавить расход'
    };
    body.innerHTML = `<section class="senyaav-ai-chat"><div class="senyaav-ai-user-bubble">${esc(question)}</div><div class="senyaav-ai-answer"><div class="senyaav-ai-answer-head">${iconMarkup()}<b>${esc(answer.title)}</b></div><p>${esc(answer.text).replace(/\n/g,'<br>')}</p>${Array.isArray(answer.actions) && answer.actions.length ? `<div class="senyaav-ai-actions">${answer.actions.map(key=>`<button type="button" class="senyaav-ai-action" data-ai-shortcut="${esc(key)}">${esc(actionMap[key] || key)}</button>`).join('')}</div>` : ''}</div><button type="button" class="senyaav-ai-back-overview">Вернуться к обзору</button></section>`;
    $('.senyaav-ai-back-overview',body)?.addEventListener('click',()=>setDialogTab('overview'));
    bindShortcuts();
  }


function homeCard() {
  if (document.body.dataset.screen !== 'dashboard') return;
  const signals = buildSignals();
  let card = $('#senyaavAiHome');
  if (!card) {
    card = document.createElement('section');
    card.id = 'senyaavAiHome';
    card.className = 'card senyaav-ai-home';
  }
  mountAtScreenEnd(card);
  const top = signals.filter(item=>item.id!=='recent-activity').slice(0,3);
  const sig = top.map(x=>`${x.id}:${x.title}:${x.text}`).join('|');
  if (card.dataset.sig === sig) return;
  card.dataset.sig = sig;
  card.innerHTML = `<div class="senyaav-ai-glow" aria-hidden="true"></div><div class="senyaav-ai-card-head"><div class="senyaav-ai-brand">${iconMarkup()}<div><strong>SENYAAV AI <span>Preview</span></strong><small>Короткий AI-разбор дня без дублей с главной</small></div></div><button type="button" data-open-senyaav-ai="overview" aria-label="Открыть SENYAAV AI">›</button></div><div class="senyaav-ai-home-summary"><b>${top.length} ключевых сигнала</b><span>Только выводы и следующий шаг</span></div><div class="senyaav-ai-home-signals">${top.map(item=>`<div class="${severityClass(item.severity)}"><span>${AREA_ICON[item.area] || '✦'}</span><p><b>${esc(item.title)}</b><small>${esc(compactText(item.text, 86))}</small></p></div>`).join('')}</div><button type="button" class="senyaav-ai-open" data-open-senyaav-ai="overview">Открыть ассистента</button>`;
}


function compactContextCard(id, anchor, area, label, insert = 'after') {
  const app = document.getElementById('app');
  if (!app) return;
  const item = topSignal(area);
  let card = document.getElementById(id);
  if (!card) {
    card = document.createElement('section');
    card.id = id;
    card.className = 'card senyaav-ai-context';
  }
  mountAtScreenEnd(card);
  const sig = `${item.id}:${item.title}:${item.text}`;
  if (card.dataset.sig === sig) return;
  card.dataset.sig = sig;
  card.innerHTML = `<button type="button" data-open-senyaav-ai="${area==='health'?'growth':area}"><div class="senyaav-ai-glow" aria-hidden="true"></div><div class="senyaav-ai-context-head">${iconMarkup()}<b>SENYAAV AI <span>· ${esc(label)}</span></b><i>Короткий вывод</i></div><strong>${esc(item.title)}</strong><p>${esc(compactText(item.text, 108))}</p><em>Открыть анализ ›</em></button>`;
}


function patchFinanceNativeInsights() {
  if (document.body.dataset.screen !== 'finance') return;
  const headings = $$('.section-head h2');
  const heading = headings.find(node => node.textContent.trim() === 'Выводы' || node.closest('.ai-native-finance'));
  if (!heading) return;
  const section = heading.closest('section');
  if (!section) return;
  section.classList.add('ai-native-finance');
  heading.innerHTML = `<span class="senyaav-ai-inline-title">${AI_ICON}<b>SENYAAV AI</b><small>Финансы</small></span>`;
  const head = heading.closest('.section-head');
  if (head && !$('.senyaav-ai-preview-badge',head)) {
    const badge = document.createElement('span'); badge.className='senyaav-ai-preview-badge'; badge.textContent='Preview'; head.append(badge);
  }
  const list = $('.list', section);
  if (list) {
    let intro = $('.senyaav-ai-finance-intro',section);
    if (!intro) { intro = document.createElement('div'); intro.className='senyaav-ai-finance-intro'; list.before(intro); }
    intro.textContent = 'Здесь только выводы AI по операциям и бюджету — без повторения цифр из карточек выше.';
    const rows = buildFinanceInsights(loadState());
    const sig = rows.map(x=>`${x.title}:${x.text}`).join('|');
    if (list.dataset.senyaavAiSig !== sig) {
      list.dataset.senyaavAiSig = sig;
      list.innerHTML = rows.map(item => `<button type="button" class="item senyaav-ai-insight-row ${severityClass(item.severity)}" data-ai-signal-area="finance"><div class="senyaav-ai-insight-mark">${AREA_ICON[item.area] || '₽'}</div><div class="item-main"><div class="item-title">${esc(item.title)}</div><div class="item-meta">${esc(item.text)}</div></div><div class="senyaav-ai-row-arrow">›</div></button>`).join('');
    }
  }
}

function renderEnglishCard() {
  if (document.body.dataset.screen !== 'growth') return;
  const app = document.getElementById('app');
  const anchor = $('#aosHealthDynamics') || $('#bodyTracker') || app;
  if (!anchor) return;
  const state = loadState();
  const english = englishSnapshot(state);
  let card = $('#aosEnglishProgress');
  if (!card) {
    card = document.createElement('section');
    card.id = 'aosEnglishProgress';
    card.className = 'card aos-english-card';
  }
  if (anchor.parentNode && card.parentNode !== anchor.parentNode) anchor.before(card);
  const sig = `${english.current}|${english.target}|${english.progress}|${english.deadline}|${english.task?.title || ''}|${english.task?.dueTime || ''}`;
  if (card.dataset.aosSig === sig) return;
  card.dataset.aosSig = sig;
  card.innerHTML = `<div class="aos-english-head"><div><h2>Английский</h2><p>Текущий уровень и прогресс</p></div><span class="aos-english-percent">${english.progress}%</span></div><div class="aos-english-level-row"><strong>${esc(english.current)}</strong><small>Текущий уровень</small></div><div class="aos-english-progress"><i style="width:${english.progress}%"></i></div><div class="aos-english-foot"><span>Цель: ${esc(english.target)} к ${esc(english.deadline)}</span>${english.task ? `<b>Сегодня: ${esc(english.task.title)}${english.task.dueTime ? ` · ${esc(english.task.dueTime)}` : ''}</b>` : `<b>Добавь слот на практику сегодня</b>`}</div></div>`;
}

function bindShortcuts() {
  $$('[data-ai-shortcut]').forEach(button => {
    if (button.dataset.aiBound === '1') return;
    button.dataset.aiBound = '1';
    button.addEventListener('click', () => {
      const key = button.dataset.aiShortcut;
      const dialog = $('#senyaavAiDialog');
      if (['overview','finance','tasks','projects','growth','activity'].includes(key)) {
        if (key === 'overview') setDialogTab('overview');
        else if (key === 'activity') setDialogTab('activity');
        else {
          dialog?.close?.();
          document.querySelector(`.nav-item[data-screen="${key === 'growth' ? 'growth' : key}"]`)?.click();
        }
        return;
      }
      dialog?.close?.();
      if (key === 'new-task') {
        document.querySelector('.nav-item[data-screen="tasks"]')?.click();
        setTimeout(() => document.querySelector('.global-add')?.click(), 80);
      }
      if (key === 'new-expense') {
        document.querySelector('.nav-item[data-screen="finance"]')?.click();
        setTimeout(() => document.querySelector('.global-add')?.click(), 80);
      }
    });
  });
}

function patchSettings() {
    const settings = $('.settings-screen', $('#modalBody') || document);
    if (!settings || $('#senyaavAiSettings',settings)) return;
    const anchor = $('#dashboardLabelsSettings', settings) || $('#homePreferences', settings);
    if (!anchor) return;
    const row = document.createElement('button');
    row.type='button'; row.id='senyaavAiSettings'; row.className='settings-row';
    row.innerHTML=`<i class="settings-icon senyaav-ai-settings-icon">${AI_ICON}</i><span>SENYAAV AI<small>Анализ данных и журнал действий с V15.5</small></span><b>›</b>`;
    row.addEventListener('click',()=>openAI('activity'));
    anchor.after(row);
  }

  function bindOpeners() {
    $$('[data-open-senyaav-ai]').forEach(button => {
      if (button.dataset.aiBound === '1') return;
      button.dataset.aiBound='1';
      button.addEventListener('click', () => openAI(button.dataset.openSenyaavAi || 'overview'));
    });
    $$('[data-ai-signal-area]').forEach(button => {
      if (button.dataset.aiBound === '1') return;
      button.dataset.aiBound='1';
      button.addEventListener('click', () => openAI(button.dataset.aiSignalArea === 'health' ? 'growth' : button.dataset.aiSignalArea));
    });
  }

  function enhance() {
    try {
      const screen = document.body.dataset.screen;
      if (screen === 'dashboard') homeCard();
      if (screen === 'finance') patchFinanceNativeInsights();
      if (screen === 'tasks') compactContextCard('senyaavAiTasks', $('.task-view-tabs'), 'tasks', 'Задачи');
      if (screen === 'projects') compactContextCard('senyaavAiProjects', $('#aosClientFunnel') || $('.project-tabs'), 'projects', 'Проекты');
      if (screen === 'growth') { renderEnglishCard(); compactContextCard('senyaavAiGrowth', $('.progress-command-card'), topSignal('health')?.area === 'health' ? 'health' : 'growth', 'Прогресс'); }
      patchSettings();
      bindOpeners();
      const dialog = $('#senyaavAiDialog');
      if (dialog?.open) renderDialogBody();
    } catch (error) {
      console.error('[SENYAAV AI] enhance failed', error);
    }
  }

  window.addEventListener('senyaavai:activity', () => {
    const dialog = $('#senyaavAiDialog');
    if (dialog?.open && activeTab === 'activity') renderDialogBody();
  });

  window.SENYAAVAI = {
    version: BUILD,
    enhance,
    open: openAI,
    buildSignals,
    localAnswer,
    getActivity: loadActivity,
    pushActivity
  };
})();
