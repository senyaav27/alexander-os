(() => {
  'use strict';

  const BUILD = '15.5.0';
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
      try { captureStateDiff(before, after); } catch (error) { console.error('[SENYAAV AI] activity diff failed', error); }
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
    return { logs, current, previous, target, change };
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
    const reducible = new Set(['cafes','taxi','subscriptions','clothing','entertainment','travel']);

    if (tasks.overdue.length) signals.push(signal('tasks-overdue','tasks','danger',99,`${tasks.overdue.length} просроченн${tasks.overdue.length===1?'ая задача':'ых задач'}`,`Самая ранняя - «${tasks.overdue.slice().sort((a,b)=>String(a.due).localeCompare(String(b.due)))[0]?.title || 'задача'}». Сначала закрой или перенеси срок.`,{screen:'tasks'}));
    if (tasks.english) {
      const suffix = tasks.english.dueTime ? ` в ${tasks.english.dueTime}` : '';
      signals.push(signal('english-today','tasks','info',91,`Английский сегодня${suffix}`,`Задача ещё не завершена. Оставь этот слот свободным и отметь выполнение после занятия.`,{screen:'tasks'}));
    }
    const nextTimed = tasks.timed.find(x=>x.minutes>=0 && x.minutes<=240);
    if (nextTimed && nextTimed.task.id !== tasks.english?.id) signals.push(signal('task-upcoming','tasks','info',88,`Через ${Math.max(1,Math.round(nextTimed.minutes/60))} ч. - ${nextTimed.task.title}`,`Запланировано на ${nextTimed.task.dueTime}. До этого времени лучше не забивать слот второстепенными задачами.`,{screen:'tasks'}));
    if (tasks.todayTasks.length >= 4) signals.push(signal('tasks-load','tasks','warning',79,`Сегодня ${tasks.todayTasks.length} открытых задач`,`Выбери 1-3 результата дня. Остальные задачи не должны конкурировать за внимание.`,{screen:'tasks'}));

    if (finance.target > 0 && finance.gap > 0) {
      const progress = Math.round(finance.income / Math.max(1, finance.target) * 100);
      signals.push(signal('income-gap','finance',progress < 40 ? 'warning' : 'info',86,`До цели дохода осталось ${money(finance.gap)}`,`Сейчас выполнено ${progress}% месячного плана. Смотри в первую очередь на действия, которые могут дать доход, а не на косметическую занятость.`,{screen:'finance'}));
    }
    if (finance.limit > 0 && finance.projected > finance.limit) signals.push(signal('expense-projection','finance','danger',94,`Темп расходов выше лимита`,`При текущем темпе прогноз около ${money(finance.projected)} при лимите ${money(finance.limit)}. Проверь необязательные категории до следующей покупки.`,{screen:'finance'}));
    const top = finance.categoryRows[0];
    if (top && finance.expense > 0 && reducible.has(top.key)) {
      const share = Math.round(top.amount / finance.expense * 100);
      if (share >= 15) signals.push(signal('top-expense','finance','warning',82,`${top.label} - заметная статья расходов`,`${money(top.amount)} за месяц, около ${share}% всех расходов. Это первая категория, которую стоит проверить на повторяющиеся траты.`,{screen:'finance'}));
    }
    const expenseAge = daysSince(finance.lastExpense?.createdAt || finance.lastExpense?.date);
    if (expenseAge !== null && expenseAge >= 3) signals.push(signal('expense-stale','activity','warning',76,`Расходы не обновлялись ${expenseAge} дн.`,`Последний расход в базе - «${finance.lastExpense?.title || categoryLabel(finance.lastExpense?.category)}». Если траты были позже, аналитика уже неполная.`,{screen:'finance'}));
    if (!finance.lastExpense) signals.push(signal('expense-empty','activity','warning',75,'Нет записанных расходов','Без фактических расходов SENYAAV AI не сможет нормально оценивать бюджет и категории.',{screen:'finance'}));

    if (projects.overdue.length) signals.push(signal('project-payment','projects','danger',96,`${projects.overdue.length} проект с просроченной оплатой`,`Проверь оплату и поставь конкретный контакт с клиентом. Денежный поток важнее новых гипотез.`,{screen:'projects'}));
    if (projects.noNext.length) signals.push(signal('project-next','projects','warning',84,`${projects.noNext.length} активн. проект без следующего шага`,`Например, «${projects.noNext[0]?.name}». Добавь одно конкретное действие, иначе проект будет выглядеть активным, но стоять.`,{screen:'projects'}));
    if (projects.leads.length && !projects.paid.length) signals.push(signal('pipeline-stall','projects','warning',81,`${projects.leads.length} лидов, оплат пока нет`,`Проверь, на каком этапе чаще всего останавливаются лиды, и усили следующий шаг воронки.`,{screen:'projects'}));

    if (health.current && health.target) {
      const gap = Number((health.current-health.target).toFixed(1));
      if (gap > 0) signals.push(signal('health-weight','health','info',61,`До цели по весу ${String(gap).replace('.',',')} кг`,`Последний вес - ${String(health.current).replace('.',',')} кг. Смотри на тенденцию за несколько записей, а не на один день.`,{screen:'growth'}));
    }
    if (health.change >= 0.8) signals.push(signal('health-change','health','warning',67,`Вес вырос на ${String(health.change).replace('.',',')} кг с прошлой записи`,`Проверь последние дни по питанию, сну и активности. Одна запись ещё не тренд.`,{screen:'growth'}));

    const activity = loadActivity();
    if (activity.length) {
      const latest = activity[0];
      signals.push(signal('recent-activity','activity','neutral',35,'Последнее действие в системе',`${latest.title}${latest.detail ? ` - ${latest.detail}` : ''}.`,{}));
    }

    if (!signals.length) signals.push(signal('steady','system','good',20,'Критичных отклонений не вижу','Данные выглядят спокойно. Продолжай фиксировать факты и закрывать текущие обязательства.',{}));
    return signals.sort((a,b)=>b.priority-a.priority);
  }

  function topSignal(area) {
    const signals = buildSignals();
    if (!area) return signals[0];
    const found = signals.find(item => item.area === area);
    if (found) return found;
    const fallbacks = {
      tasks: signal('tasks-steady','tasks','good',10,'По задачам нет срочных сигналов','Продолжай текущий план и не добавляй новые задачи без необходимости.',{screen:'tasks'}),
      projects: signal('projects-steady','projects','good',10,'Проекты выглядят управляемо','У активных проектов нет критичных сигналов. Следующий шаг всё равно должен оставаться явным.',{screen:'projects'}),
      growth: signal('growth-steady','growth','good',10,'Прогресс без критичных отклонений','Продолжай фиксировать привычки, цели и фактические результаты.',{screen:'growth'}),
      health: signal('health-steady','health','good',10,'По здоровью нет нового сигнала','Добавляй вес и тренировки по факту, чтобы видеть устойчивую динамику.',{screen:'growth'}),
      finance: signal('finance-steady','finance','good',10,'Финансы без срочного сигнала','Продолжай фиксировать доходы и расходы по факту.',{screen:'finance'}),
      activity: signal('activity-steady','activity','neutral',10,'Журнал действий активен','SENYAAV AI фиксирует новые изменения с версии V15.5.',{})
    };
    return fallbacks[area] || signal('system-steady','system','good',10,'Критичных отклонений не вижу','Продолжай текущий план.',{});
  }

  function iconMarkup(area='system') {
    return `<span class="senyaav-ai-icon">${AI_ICON}</span>`;
  }
  function severityClass(value) { return ['danger','warning','good','info'].includes(value) ? value : 'neutral'; }
  function signalMarkup(item, compact = false) {
    return `<button type="button" class="senyaav-ai-signal ${severityClass(item.severity)} ${compact?'compact':''}" data-ai-signal-area="${esc(item.area)}"><span class="senyaav-ai-signal-mark">${AREA_ICON[item.area] || '✦'}</span><span class="senyaav-ai-signal-copy"><b>${esc(item.title)}</b><small>${esc(item.text)}</small></span><span class="senyaav-ai-arrow">›</span></button>`;
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
    const activity = loadActivity();
    if (activeTab === 'overview') {
      body.innerHTML = `<section class="senyaav-ai-hero"><div><small>Анализ сейчас</small><h2>${signals.filter(x=>x.priority>=70).length || 1} важных сигнала</h2></div><span class="senyaav-ai-live">По данным приложения</span></section><section class="senyaav-ai-stack">${signals.slice(0,5).map(item=>signalMarkup(item)).join('')}</section><section class="senyaav-ai-note"><b>Что умеет Preview</b><p>SENYAAV AI уже читает цифры, задачи, проекты, прогресс и журнал действий. Свободные ответы пока строятся локально по правилам. OpenAI API можно подключить позже без переделки интерфейса.</p></section>`;
    } else if (activeTab === 'finance') {
      const lastExpenseAge = daysSince(finance.lastExpense?.createdAt || finance.lastExpense?.date);
      body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Доход месяца',money(finance.income),finance.target?`из ${money(finance.target)}`:'цель не задана')}${metric('Расход месяца',money(finance.expense),finance.limit?`лимит ${money(finance.limit)}`:'лимит не задан')}${metric('Прогноз расходов',money(finance.projected),'при текущем темпе')}${metric('Последний расход',lastExpenseAge===null?'нет данных':lastExpenseAge===0?'сегодня':`${lastExpenseAge} дн. назад`,finance.lastExpense?.title || '')}</section><section class="senyaav-ai-stack">${signals.filter(x=>['finance','activity'].includes(x.area)).slice(0,5).map(item=>signalMarkup(item)).join('') || '<div class="senyaav-ai-empty">Финансовых предупреждений сейчас нет.</div>'}</section>`;
    } else if (activeTab === 'tasks') {
      body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Сегодня',String(tasks.todayTasks.length),'открытых задач')}${metric('Просрочено',String(tasks.overdue.length),'требуют решения')}${metric('Всего открыто',String(tasks.active.length),'в системе')}${metric('По времени',String(tasks.timed.length),'на сегодня')}</section>${tasks.timed.length?`<section class="senyaav-ai-timeline">${tasks.timed.slice(0,6).map(x=>`<div><time>${esc(x.task.dueTime)}</time><span><b>${esc(x.task.title)}</b><small>${x.minutes<0?'время прошло':'запланировано сегодня'}</small></span></div>`).join('')}</section>`:''}<section class="senyaav-ai-stack">${signals.filter(x=>x.area==='tasks').slice(0,5).map(item=>signalMarkup(item)).join('') || '<div class="senyaav-ai-empty">По задачам нет срочных сигналов.</div>'}</section>`;
    } else if (activeTab === 'projects') {
      body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Активные проекты',String(projects.active.length))}${metric('Без следующего шага',String(projects.noNext.length))}${metric('Лиды в работе',String(projects.leads.length))}${metric('Оплата / ведение',String(projects.paid.length))}</section><section class="senyaav-ai-stack">${signals.filter(x=>x.area==='projects').slice(0,5).map(item=>signalMarkup(item)).join('') || '<div class="senyaav-ai-empty">Проекты выглядят управляемо. Продолжай фиксировать следующий шаг.</div>'}</section>`;
    } else if (activeTab === 'growth') {
      const english = tasks.english;
      body.innerHTML = `<section class="senyaav-ai-metrics-grid">${metric('Текущий вес',health.current?`${String(health.current).replace('.',',')} кг`:'нет данных')}${metric('Цель веса',health.target?`${String(health.target).replace('.',',')} кг`:'не задана')}${metric('Записей веса',String(health.logs.length))}${metric('Английский сегодня',english ? (english.dueTime || 'есть задача') : 'нет задачи')}</section><section class="senyaav-ai-stack">${signals.filter(x=>['health','growth','tasks'].includes(x.area)).slice(0,5).map(item=>signalMarkup(item)).join('')}</section>`;
    } else {
      body.innerHTML = `<section class="senyaav-ai-activity-head"><div><small>Журнал действий</small><h2>${activity.length} событий</h2></div><span>с V15.5</span></section><section class="senyaav-ai-activity">${activity.length ? activity.slice(0,80).map(item=>`<div class="senyaav-ai-activity-row"><span class="senyaav-ai-activity-dot ${esc(item.area)}"></span><div><b>${esc(item.title)}</b>${item.detail?`<small>${esc(item.detail)}</small>`:''}<time>${esc(formatDateTime(item.at))}</time></div></div>`).join('') : '<div class="senyaav-ai-empty">Журнал начнёт заполняться после новых действий: расходов, задач, проектов, привычек, веса и других изменений.</div>'}</section>`;
    }
  }

  function localAnswer(question) {
    const q = question.toLowerCase();
    const state = loadState();
    const finance = financeSnapshot(state), tasks = taskSnapshot(state), projects = projectSnapshot(state), health = healthSnapshot(state), signals = buildSignals(state);
    if (/что.*делать|что.*сегодня|приоритет|фокус/.test(q)) {
      const today = tasks.todayTasks.slice().sort((a,b)=>(a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
      const items = today.length ? today.slice(0,3).map((task,i)=>`${i+1}. ${task.title}${task.dueTime ? ` - ${task.dueTime}` : ''}`) : signals.slice(0,3).map((s,i)=>`${i+1}. ${s.title}`);
      return { title:'Фокус на сегодня', text:items.join('\n') || 'Критичных действий не вижу. Закрой одно важное обязательство и не добавляй новые без необходимости.' };
    }
    if (/англ|english/.test(q)) {
      if (tasks.english) return { title:'Английский', text:`Сегодня есть задача «${tasks.english.title}»${tasks.english.dueTime ? ` на ${tasks.english.dueTime}` : ''}. Она ещё не завершена.` };
      const habit = (state.habits || []).find(x=>/англ|english/i.test(x.title || ''));
      return { title:'Английский', text:habit ? `Есть привычка «${habit.title}». Сегодняшнюю отметку проверь во вкладке Прогресс.` : 'На сегодня отдельной задачи по английскому не вижу.' };
    }
    if (/расход|бюджет|финанс|деньг|доход/.test(q)) return { title:'Финансы', text:`Доход месяца ${money(finance.income)}${finance.target?` из ${money(finance.target)}`:''}. Расходы ${money(finance.expense)}${finance.limit?`, лимит ${money(finance.limit)}`:''}. ${signals.find(x=>x.area==='finance')?.text || 'Критичных финансовых отклонений сейчас не вижу.'}` };
    if (/задач|дела|срок|проср/.test(q)) return { title:'Задачи', text:`Сегодня открыто ${tasks.todayTasks.length}, просрочено ${tasks.overdue.length}, всего открыто ${tasks.active.length}. ${signals.find(x=>x.area==='tasks')?.text || 'Срочных сигналов нет.'}` };
    if (/проект|rift|senya|клиент|воронк/.test(q)) return { title:'Проекты', text:`Активных проектов ${projects.active.length}, без следующего шага ${projects.noNext.length}, лидов в работе ${projects.leads.length}. ${signals.find(x=>x.area==='projects')?.text || 'Критичных проектных отклонений сейчас не вижу.'}` };
    if (/вес|здоров|тренир|тело/.test(q)) return { title:'Прогресс и здоровье', text:health.current ? `Последний вес ${String(health.current).replace('.',',')} кг${health.target?`, цель ${String(health.target).replace('.',',')} кг`:''}. ${signals.find(x=>x.area==='health')?.text || 'Смотри на тренд по нескольким записям.'}` : 'Записей веса пока недостаточно для анализа.' };
    if (/последн|делал|действ|истор/.test(q)) {
      const activity = loadActivity().slice(0,5);
      return { title:'Последние действия', text:activity.length ? activity.map(item=>`${item.title}${item.detail?` - ${item.detail}`:''}`).join('\n') : 'После установки V15.5 новых действий ещё не записано.' };
    }
    return { title:'SENYAAV AI Preview', text:`По текущим данным главное сейчас: ${signals.slice(0,3).map(x=>x.title).join('; ')}. В Preview я отвечаю по данным Alexander OS. После подключения OpenAI API смогу свободнее понимать формулировки и связывать больше контекста.` };
  }

  function renderLocalAnswer(question) {
    const body = $('#senyaavAiBody');
    if (!body) return;
    const answer = localAnswer(question);
    body.innerHTML = `<section class="senyaav-ai-chat"><div class="senyaav-ai-user-bubble">${esc(question)}</div><div class="senyaav-ai-answer"><div class="senyaav-ai-answer-head">${iconMarkup()}<b>${esc(answer.title)}</b></div><p>${esc(answer.text).replace(/\n/g,'<br>')}</p></div><button type="button" class="senyaav-ai-back-overview">Вернуться к обзору</button></section>`;
    $('.senyaav-ai-back-overview',body)?.addEventListener('click',()=>setDialogTab('overview'));
  }

  function homeCard() {
    if (document.body.dataset.screen !== 'dashboard') return;
    const welcome = $('.home-welcome');
    if (!welcome) return;
    const signals = buildSignals();
    let card = $('#senyaavAiHome');
    if (!card) {
      card = document.createElement('section');
      card.id = 'senyaavAiHome';
      card.className = 'card senyaav-ai-home';
      welcome.after(card);
    }
    const top = signals.filter(item=>item.id!=='recent-activity').slice(0,3);
    const sig = top.map(x=>`${x.id}:${x.title}:${x.text}`).join('|');
    if (card.dataset.sig === sig) return;
    card.dataset.sig = sig;
    card.innerHTML = `<div class="senyaav-ai-card-head"><div class="senyaav-ai-brand">${iconMarkup()}<div><strong>SENYAAV AI <span>Preview</span></strong><small>Анализ дня - без повторов с главной</small></div></div><button type="button" data-open-senyaav-ai="overview" aria-label="Открыть SENYAAV AI">›</button></div><div class="senyaav-ai-home-summary"><b>${top.length} ${top.length===1?'важный сигнал':'важных сигнала'}</b><span>по данным финансов, задач, проектов и прогресса</span></div><div class="senyaav-ai-home-signals">${top.map(item=>`<div class="${severityClass(item.severity)}"><span>${AREA_ICON[item.area] || '✦'}</span><p><b>${esc(item.title)}</b><small>${esc(item.text)}</small></p></div>`).join('')}</div><button type="button" class="senyaav-ai-open" data-open-senyaav-ai="overview">Открыть ассистента</button>`;
  }

  function compactContextCard(id, anchor, area, label, insert = 'after') {
    if (!anchor) return;
    const item = topSignal(area);
    let card = document.getElementById(id);
    if (!card) {
      card = document.createElement('section');
      card.id = id;
      card.className = 'card senyaav-ai-context';
      insert === 'before' ? anchor.before(card) : anchor.after(card);
    }
    const sig = `${item.id}:${item.title}:${item.text}`;
    if (card.dataset.sig === sig) return;
    card.dataset.sig = sig;
    card.innerHTML = `<button type="button" data-open-senyaav-ai="${area==='health'?'growth':area}"><div class="senyaav-ai-context-head">${iconMarkup()}<b>SENYAAV AI <span>- ${esc(label)}</span></b><i>Preview</i></div><strong>${esc(item.title)}</strong><p>${esc(item.text)}</p><em>Открыть анализ ›</em></button>`;
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
    if (list && !$('.senyaav-ai-finance-intro',section)) {
      const intro = document.createElement('div'); intro.className='senyaav-ai-finance-intro'; intro.textContent='Локальный анализ по операциям и бюджету. Цифры выше не дублирую - здесь только выводы.'; list.before(intro);
    }
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
      if (screen === 'growth') compactContextCard('senyaavAiGrowth', $('.progress-command-card'), topSignal('health')?.area === 'health' ? 'health' : 'growth', 'Прогресс');
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
