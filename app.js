(() => {
  'use strict';

  const STORAGE_KEY = 'alexander_os_v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const pad = value => String(value).padStart(2, '0');
  const localISO = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const todayISO = () => localISO(new Date());
  const parseISO = value => value ? new Date(`${value}T12:00:00`) : null;
  const addDays = (date, amount) => { const result = new Date(date); result.setDate(result.getDate() + amount); return result; };
  const startOfWeek = (date = new Date()) => { const result = new Date(date); const day = result.getDay() || 7; result.setDate(result.getDate() - day + 1); result.setHours(0, 0, 0, 0); return result; };
  const endOfWeek = date => { const result = addDays(startOfWeek(date), 6); result.setHours(23, 59, 59, 999); return result; };
  const startOfDay = (date = new Date()) => { const result = new Date(date); result.setHours(0, 0, 0, 0); return result; };
  const startOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);
  const endOfMonth = (date = new Date()) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  const dateInRange = (iso, start, end) => { const date = parseISO(iso); return Boolean(date && date >= start && date <= end); };
  const money = value => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0))} ₽`;
  const numberText = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(Number(value || 0));
  const dateText = value => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(parseISO(value)) : 'Без срока';
  const longDateText = value => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseISO(value)) : 'Не указано';
  const fullDate = () => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const monthLabel = date => new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(date).replace('.', '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
  const sum = values => values.reduce((total, value) => total + Number(value || 0), 0);

  const INCOME_CATEGORIES = [
    ['salary', 'Зарплата'], ['client', 'Клиенты'], ['shop', 'Магазин'], ['refund', 'Возврат'], ['gift_income', 'Подарок'], ['other_income', 'Другой доход']
  ];
  const EXPENSE_CATEGORIES = [
    ['groceries', 'Продукты'], ['cafes', 'Кафе и доставка'], ['transport', 'Транспорт'], ['taxi', 'Такси'], ['housing', 'Жильё'], ['subscriptions', 'Подписки'], ['health', 'Здоровье'], ['clothing', 'Одежда'], ['entertainment', 'Развлечения'], ['education', 'Обучение'], ['business', 'Бизнес'], ['gifts', 'Подарки'], ['debt_payment', 'Долги и кредиты'], ['travel', 'Путешествия'], ['other_expense', 'Другое']
  ];
  const ALL_CATEGORIES = new Map([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]);
  const CATEGORY_REDUCIBLE = new Set(['cafes', 'taxi', 'subscriptions', 'clothing', 'entertainment', 'travel', 'other_expense']);

  function freshState() {
    return {
      version: 4,
      profile: {
        name: 'Александр',
        capitalTarget: 1000000,
        monthlyIncomeTarget: 200000,
        cushionTarget: 200000,
        monthlyExpenseLimit: 70000,
        theme: 'dark',
        notificationsEnabled: false,
        lastBackup: null,
        progressRange: '6m'
      },
      tasks: [
        { id: uid(), title: 'Определить 3 главные задачи дня', projectId: '', project: 'Личное управление', priority: 'high', due: todayISO(), dueTime: '', status: 'todo', notes: '', repeat: 'none', reminder: 'none', createdAt: new Date().toISOString(), completedAt: null },
        { id: uid(), title: 'Проверить финансы и обязательные платежи', projectId: '', project: 'Финансы', priority: 'medium', due: todayISO(), dueTime: '', status: 'todo', notes: '', repeat: 'weekly', reminder: 'none', createdAt: new Date().toISOString(), completedAt: null }
      ],
      accounts: [{ id: uid(), name: 'Основной баланс', type: 'card', balance: 0, isDefault: true }],
      transactions: [],
      obligations: [],
      projects: [],
      goals: [
        { id: uid(), title: 'Капитал 1 000 000 ₽', current: 0, target: 1000000, deadline: '2026-12-31', unit: '₽', monthlyPlan: 0, nextAction: '', autoSource: 'capital', createdAt: new Date().toISOString() },
        { id: uid(), title: 'Доход 200 000 ₽ в месяц', current: 0, target: 200000, deadline: '2026-12-31', unit: '₽', monthlyPlan: 200000, nextAction: '', autoSource: 'monthlyIncome', createdAt: new Date().toISOString() }
      ],
      habits: [
        { id: uid(), title: 'Профессиональное развитие', logs: {}, targetPerWeek: 5, schedule: [1, 2, 3, 4, 5] },
        { id: uid(), title: 'Работа над личным проектом', logs: {}, targetPerWeek: 5, schedule: [1, 2, 3, 4, 5] },
        { id: uid(), title: 'Чтение', logs: {}, targetPerWeek: 5, schedule: [1, 2, 3, 4, 5] },
        { id: uid(), title: 'Спорт', logs: {}, targetPerWeek: 2, schedule: [4, 5] },
        { id: uid(), title: 'Без импульсивных покупок', logs: {}, targetPerWeek: 7, schedule: [1, 2, 3, 4, 5, 6, 0] }
      ],
      weeklyReviews: [],
      snapshots: []
    };
  }

  function ensureAccountIntegrity(target) {
    target.accounts = Array.isArray(target.accounts) ? target.accounts : [];
    target.transactions = Array.isArray(target.transactions) ? target.transactions : [];

    let defaultAccount = target.accounts.find(account => account.isDefault);
    if (!defaultAccount) defaultAccount = target.accounts.find(account => account.name === 'Основной баланс');
    if (!defaultAccount) {
      defaultAccount = { id: uid(), name: 'Основной баланс', type: 'card', balance: 0, isDefault: true };
      target.accounts.unshift(defaultAccount);
    }

    target.accounts.forEach(account => { account.isDefault = account.id === defaultAccount.id; });
    const accountIds = new Set(target.accounts.map(account => account.id));
    const orphaned = target.transactions.filter(tx => !tx.accountId || !accountIds.has(tx.accountId));
    if (orphaned.length) {
      const delta = sum(orphaned.map(tx => Number(tx.amount || 0) * (tx.type === 'income' ? 1 : -1)));
      defaultAccount.balance = Number(defaultAccount.balance || 0) + delta;
      orphaned.forEach(tx => { tx.accountId = defaultAccount.id; });
    }
    return target;
  }

  function getDefaultAccount() {
    let account = state.accounts.find(item => item.isDefault) || state.accounts[0];
    if (!account) {
      account = { id: uid(), name: 'Основной баланс', type: 'card', balance: 0, isDefault: true };
      state.accounts.push(account);
    }
    return account;
  }

  function normalizeState(raw) {
    const base = freshState();
    const result = {
      ...base,
      ...raw,
      version: 4,
      profile: { ...base.profile, ...(raw.profile || {}) },
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      obligations: Array.isArray(raw.obligations) ? raw.obligations : [],
      projects: Array.isArray(raw.projects) ? raw.projects : [],
      goals: Array.isArray(raw.goals) ? raw.goals : [],
      habits: Array.isArray(raw.habits) ? raw.habits : [],
      weeklyReviews: Array.isArray(raw.weeklyReviews) ? raw.weeklyReviews : [],
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : []
    };

    result.tasks = result.tasks.map(task => ({
      projectId: '', project: '', priority: 'medium', due: '', dueTime: '', status: task.done ? 'done' : 'todo', notes: '', repeat: 'none', reminder: 'none', createdAt: new Date().toISOString(), completedAt: null,
      ...task,
      status: task.status || (task.done ? 'done' : 'todo')
    }));
    result.accounts = result.accounts.map(account => ({ type: 'card', balance: 0, ...account, balance: Number(account.balance || 0) }));
    result.transactions = result.transactions.map(tx => ({ notes: '', accountId: '', category: tx.type === 'income' ? 'other_income' : 'other_expense', necessity: tx.type === 'expense' ? 'unknown' : '', scope: 'personal', projectId: '', ...tx, amount: Number(tx.amount || 0) }));
    result.obligations = result.obligations.map(item => ({ status: 'open', type: 'payment', notes: '', dueDate: '', ...item, amount: Number(item.amount || 0) }));
    result.projects = result.projects.map(project => ({ type: 'client', service: '', contact: '', value: 0, status: 'active', paymentStatus: 'not_due', debt: 0, paymentDate: '', nextContact: '', next: '', site: '', adBudget: 0, leads: 0, cpl: 0, result: '', notes: '', startDate: '', ...project }));
    result.goals = result.goals.map(goal => ({ unit: '', monthlyPlan: 0, nextAction: '', autoSource: 'none', createdAt: new Date(new Date().getFullYear(), 0, 1).toISOString(), ...goal, current: Number(goal.current || 0), target: Number(goal.target || 1) }));
    result.habits = result.habits.map(habit => ({ logs: {}, targetPerWeek: 7, schedule: [1, 2, 3, 4, 5, 6, 0], ...habit }));
    return ensureAccountIntegrity(result);
  }

  function migrateState(raw) {
    if (!raw || typeof raw !== 'object') return freshState();
    if (Number(raw.version || 1) >= 2) return normalizeState(raw);

    const migrated = freshState();
    migrated.profile = { ...migrated.profile, ...(raw.profile || {}) };
    migrated.tasks = (raw.tasks || []).map(task => ({
      id: task.id || uid(), title: task.title || '', projectId: '', project: task.project || '', priority: task.priority || 'medium', due: task.due || '', dueTime: '', status: task.done ? 'done' : 'todo', notes: '', repeat: 'none', reminder: 'none', createdAt: new Date().toISOString(), completedAt: task.done ? new Date().toISOString() : null
    }));
    migrated.accounts = (raw.transactions || []).filter(item => item.type === 'balance' || item.type === 'cash').map(item => ({
      id: uid(), name: item.title || (item.type === 'cash' ? 'Наличные' : 'Карта'), type: item.type === 'cash' ? 'cash' : 'card', balance: Number(item.amount || 0)
    }));
    migrated.transactions = (raw.transactions || []).filter(item => item.type === 'expense').map(item => ({
      id: item.id || uid(), title: item.title || 'Расход', type: 'expense', amount: Number(item.amount || 0), date: item.date || todayISO(), category: 'other_expense', accountId: '', notes: ''
    }));
    migrated.obligations = (raw.transactions || []).filter(item => item.type === 'income' || item.type === 'debt').map(item => ({
      id: item.id || uid(), title: item.title || '', type: item.type === 'income' ? 'expected' : 'debt', amount: Number(item.amount || 0), dueDate: item.date || '', status: 'open', notes: ''
    }));
    migrated.projects = (raw.projects || []).map(project => ({ id: project.id || uid(), name: project.name || '', type: 'client', service: '', contact: '', value: Number(project.value || 0), status: project.status || 'active', paymentStatus: 'not_due', debt: 0, paymentDate: project.paymentDate || '', nextContact: '', next: project.next || '', site: '', adBudget: 0, leads: 0, cpl: 0, result: '', notes: '', startDate: '' }));
    migrated.goals = (raw.goals || []).map(goal => ({ id: goal.id || uid(), title: goal.title || '', current: Number(goal.current || 0), target: Number(goal.target || 1), deadline: goal.deadline || '', unit: '', monthlyPlan: 0, nextAction: '', autoSource: 'none' }));
    migrated.habits = (raw.habits || []).map(habit => ({ id: habit.id || uid(), title: habit.title || '', logs: habit.logs || {}, targetPerWeek: 7, schedule: [1, 2, 3, 4, 5, 6, 0] }));
    migrated.weeklyReviews = raw.weeklyNotes ? [{ id: uid(), weekStart: localISO(startOfWeek(new Date())), wins: raw.weeklyNotes, income: 0, saved: 0, failures: '', timeLeaks: '', lesson: '', priorities: '', createdAt: new Date().toISOString() }] : [];
    return normalizeState(migrated);
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? migrateState(JSON.parse(saved)) : freshState();
    } catch (error) {
      console.error(error);
      return freshState();
    }
  }

  let state = loadState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  let currentScreen = 'dashboard';
  let financeTab = 'overview';
  let taskFilter = 'today';
  let taskSearch = '';
  let financeCompareCurrent = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`;
  let financeCompareBase = `${new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getFullYear()}-${pad(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getMonth() + 1)}`;
  let modalAction = null;

  const app = $('#app');
  const modal = $('#modal');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const modalForm = $('#modalForm');
  const modalActions = $('#modalActions');
  const modalSubmit = $('#modalSubmit');
  const settingsModal = $('#settingsModal');
  const settingsBody = $('#settingsBody');

  function saveState() {
    state.version = 4;
    recordSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.profile.theme || 'dark';
    const themeColor = state.profile.theme === 'light' ? '#f3f6fb' : '#0b1020';
    $('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }

  function transactionsInRange(type, start, end) {
    return state.transactions.filter(tx => tx.type === type && dateInRange(tx.date, start, end));
  }

  function sumTransactions(type, start, end) {
    return sum(transactionsInRange(type, start, end).map(tx => tx.amount));
  }

  function openObligations(type = null) {
    return state.obligations.filter(item => item.status === 'open' && (!type || item.type === type));
  }

  function getFinanceAnalytics() {
    const now = new Date();
    const currentEnd = endOfToday(now);
    const weekStart = startOfWeek(now);
    const weekDayIndex = (now.getDay() || 7) - 1;
    const previousWeekStart = addDays(weekStart, -7);
    const previousWeekEnd = endOfToday(addDays(previousWeekStart, weekDayIndex));
    const monthStart = startOfMonth(now);
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthStart = startOfMonth(previousMonthDate);
    const previousMonthLastDay = endOfMonth(previousMonthDate).getDate();
    const comparableDay = Math.min(now.getDate(), previousMonthLastDay);
    const previousMonthEnd = endOfToday(new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth(), comparableDay));

    const assets = sum(state.accounts.map(account => account.balance));
    const investment = sum(state.accounts.filter(account => account.type === 'investment').map(account => account.balance));
    const liquid = sum(state.accounts.filter(account => account.type !== 'investment').map(account => account.balance));
    const debt = sum(openObligations('debt').map(item => item.amount));
    const expected = sum(openObligations('expected').map(item => item.amount));
    const upcomingPayments = sum(openObligations().filter(item => item.type !== 'expected' && item.dueDate && dateInRange(item.dueDate, now, addDays(now, 30))).map(item => item.amount));
    const capital = assets - debt;
    const freeBalance = liquid - upcomingPayments;
    const weekExpense = sumTransactions('expense', weekStart, currentEnd);
    const previousWeekExpense = sumTransactions('expense', previousWeekStart, previousWeekEnd);
    const monthExpense = sumTransactions('expense', monthStart, currentEnd);
    const previousMonthExpense = sumTransactions('expense', previousMonthStart, previousMonthEnd);
    const monthIncome = sumTransactions('income', monthStart, currentEnd);
    const previousMonthIncome = sumTransactions('income', previousMonthStart, previousMonthEnd);
    const monthSalary = sum(transactionsInRange('income', monthStart, currentEnd).filter(tx => tx.category === 'salary').map(tx => tx.amount));
    const previousMonthSalary = sum(transactionsInRange('income', previousMonthStart, previousMonthEnd).filter(tx => tx.category === 'salary').map(tx => tx.amount));
    const todayExpense = sumTransactions('expense', startOfDay(now), currentEnd);
    const monthBalance = monthIncome - monthExpense;
    const savingsRate = monthIncome > 0 ? Math.round(monthBalance / monthIncome * 100) : 0;
    const optionalExpense = sum(transactionsInRange('expense', monthStart, currentEnd).filter(tx => tx.necessity === 'optional').map(tx => tx.amount));

    const categories = new Map();
    transactionsInRange('expense', monthStart, currentEnd).forEach(tx => categories.set(tx.category, (categories.get(tx.category) || 0) + Number(tx.amount || 0)));
    const categoryRows = [...categories.entries()].map(([key, amount]) => ({ key, label: categoryLabel(key), amount })).sort((a, b) => b.amount - a.amount);

    const daysElapsed = now.getDate();
    const daysInMonth = endOfMonth(now).getDate();
    const projectedExpense = daysElapsed > 0 ? Math.round(monthExpense / daysElapsed * daysInMonth) : monthExpense;
    const remainingLimit = Number(state.profile.monthlyExpenseLimit || 0) - monthExpense;

    return {
      assets, investment, liquid, debt, expected, capital, upcomingPayments, freeBalance,
      weekExpense, previousWeekExpense,
      monthExpense, previousMonthExpense,
      monthIncome, previousMonthIncome,
      monthSalary, previousMonthSalary,
      todayExpense, monthBalance, savingsRate, optionalExpense, categoryRows, projectedExpense, remainingLimit,
      weekStart, weekEnd: currentEnd, monthStart, monthEnd: currentEnd
    };
  }

  function percentageChange(current, previous) {
    if (!previous) return current ? null : 0;
    return Math.round((current - previous) / previous * 100);
  }

  function compareBadge(current, previous, lowerIsBetter = false) {
    const change = percentageChange(current, previous);
    if (change === null) return '<span class="compare neutral">нет базы</span>';
    if (change === 0) return '<span class="compare neutral">без изменений</span>';
    const good = lowerIsBetter ? change < 0 : change > 0;
    const arrow = change > 0 ? '↑' : '↓';
    return `<span class="compare ${good ? 'good' : 'bad'}">${arrow} ${Math.abs(change)}%</span>`;
  }

  function getFinanceInsights(analytics) {
    const insights = [];
    if (!state.transactions.length) {
      return [{ cls: 'warning', text: 'Добавляй каждый доход и расход. Без фактических операций приложение не сможет показать реальную динамику.' }];
    }

    const weekChange = percentageChange(analytics.weekExpense, analytics.previousWeekExpense);
    if (weekChange !== null) {
      if (weekChange > 15) insights.push({ cls: 'danger', text: `Расходы этой недели выросли на ${weekChange}% к прошлой. Проверь ежедневные траты, пока рост не стал новой нормой.` });
      if (weekChange < -10) insights.push({ cls: '', text: `Расходы этой недели снизились на ${Math.abs(weekChange)}%. Зафиксируй, от каких трат отказался, чтобы сохранить результат.` });
    }

    const top = analytics.categoryRows[0];
    if (top && analytics.monthExpense > 0) {
      const share = Math.round(top.amount / analytics.monthExpense * 100);
      if (CATEGORY_REDUCIBLE.has(top.key)) {
        insights.push({ cls: 'warning', text: `Главная зона сокращения - «${top.label}»: ${money(top.amount)}, или ${share}% расходов месяца. Поставь лимит на остаток месяца.` });
      } else {
        insights.push({ cls: '', text: `Больше всего в этом месяце ушло на «${top.label}» - ${money(top.amount)} (${share}%). Проверь, соответствует ли это твоим приоритетам.` });
      }
    }

    if (analytics.projectedExpense > state.profile.monthlyExpenseLimit) {
      insights.push({ cls: 'danger', text: `При текущем темпе расходы месяца могут составить ${money(analytics.projectedExpense)}. Это выше лимита на ${money(analytics.projectedExpense - state.profile.monthlyExpenseLimit)}.` });
    } else if (analytics.monthExpense > 0) {
      insights.push({ cls: '', text: `Прогноз расходов к концу месяца - ${money(analytics.projectedExpense)} при лимите ${money(state.profile.monthlyExpenseLimit)}.` });
    }

    if (analytics.monthExpense > 0 && analytics.optionalExpense > 0) {
      const optionalShare = Math.round(analytics.optionalExpense / analytics.monthExpense * 100);
      if (optionalShare >= 25) insights.push({ cls: 'warning', text: `Необязательные траты составляют ${money(analytics.optionalExpense)} - ${optionalShare}% расходов месяца. Это первая зона для сокращения без ущерба обязательствам.` });
    }

    if (analytics.monthIncome > 0 && analytics.savingsRate < 20) {
      insights.push({ cls: 'warning', text: `Сохраняется только ${analytics.savingsRate}% дохода. Для роста капитала цель - удерживать минимум 20-30%, не повышая постоянные расходы.` });
    }

    if (analytics.monthSalary || analytics.previousMonthSalary) {
      const salaryChange = percentageChange(analytics.monthSalary, analytics.previousMonthSalary);
      if (salaryChange !== null && salaryChange !== 0) {
        insights.push({ cls: salaryChange > 0 ? '' : 'warning', text: `Зарплата изменилась на ${salaryChange > 0 ? '+' : ''}${salaryChange}% к прошлому месяцу: сейчас ${money(analytics.monthSalary)}.` });
      }
    }

    return insights.slice(0, 4);
  }

  function categoryLabel(key) {
    return ALL_CATEGORIES.get(key) || 'Другое';
  }

  function accountTypeText(type) {
    return ({ card: 'Карта', cash: 'Наличные', savings: 'Накопительный счёт', investment: 'Инвестиции' })[type] || 'Счёт';
  }

  function obligationTypeText(type) {
    return ({ expected: 'Ожидаемый доход', debt: 'Долг', payment: 'Обязательный платёж' })[type] || 'Обязательство';
  }

  function taskStatusText(status) {
    return ({ todo: 'К выполнению', doing: 'В работе', waiting: 'Жду', deferred: 'Отложено', done: 'Выполнено' })[status] || 'К выполнению';
  }

  function projectStatusText(status) {
    return ({ active: 'Активен', growth: 'Развитие', paused: 'Пауза', completed: 'Завершён' })[status] || 'Активен';
  }

  function paymentStatusText(status) {
    return ({ not_due: 'Не наступила', waiting: 'Ожидается', paid: 'Оплачено', overdue: 'Просрочено' })[status] || 'Не указано';
  }

  function priorityText(priority) {
    return ({ high: 'Высокий', medium: 'Средний', low: 'Низкий' })[priority] || 'Средний';
  }

  function repeatText(repeat) {
    return ({ none: 'Не повторяется', daily: 'Каждый день', weekly: 'Каждую неделю', monthly: 'Каждый месяц' })[repeat] || 'Не повторяется';
  }

  function endOfToday(date = new Date()) {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function monthRange(key) {
    const [year, month] = String(key).split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }

  function monthName(key) {
    const { start } = monthRange(key);
    return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(start);
  }

  function monthsForSelect() {
    const keys = new Set();
    const now = new Date();
    for (let index = 0; index < 18; index += 1) keys.add(monthKey(new Date(now.getFullYear(), now.getMonth() - index, 1)));
    state.transactions.forEach(tx => { if (tx.date) keys.add(String(tx.date).slice(0, 7)); });
    return [...keys].sort().reverse();
  }

  function monthMetrics(key) {
    const { start, end } = monthRange(key);
    const incomeRows = transactionsInRange('income', start, end);
    const expenseRows = transactionsInRange('expense', start, end);
    const income = sum(incomeRows.map(tx => tx.amount));
    const expense = sum(expenseRows.map(tx => tx.amount));
    const salary = sum(incomeRows.filter(tx => tx.category === 'salary').map(tx => tx.amount));
    const net = income - expense;
    const savingsRate = income > 0 ? Math.round(net / income * 100) : 0;
    const categories = new Map();
    expenseRows.forEach(tx => categories.set(tx.category, (categories.get(tx.category) || 0) + Number(tx.amount || 0)));
    const optionalExpense = sum(expenseRows.filter(tx => tx.necessity === 'optional').map(tx => tx.amount));
    const workExpense = sum(expenseRows.filter(tx => tx.scope === 'work').map(tx => tx.amount));
    return { key, income, expense, salary, net, savingsRate, categories, optionalExpense, workExpense };
  }

  function compareSentence(label, current, base, lowerIsBetter = false, unit = '₽') {
    const change = percentageChange(current, base);
    if (change === null) {
      const cls = current > 0 && lowerIsBetter ? 'bad' : 'neutral';
      return `<span class="compare ${cls}">нет базы для сравнения</span>`;
    }
    if (change === 0) return '<span class="compare neutral">без изменений</span>';
    const rose = change > 0;
    const good = lowerIsBetter ? !rose : rose;
    const verb = rose ? 'выросли' : 'снизились';
    return `<span class="compare ${good ? 'good' : 'bad'}">${label} ${verb} на ${Math.abs(change)}%</span>`;
  }

  function taskWeekStats(date = new Date(), partial = false) {
    const start = startOfWeek(date);
    const end = partial ? endOfToday(date) : endOfWeek(date);
    const rows = state.tasks.filter(task => task.due && dateInRange(task.due, start, end));
    const completed = rows.filter(task => task.status === 'done').length;
    return { total: rows.length, completed, rate: rows.length ? Math.round(completed / rows.length * 100) : 100 };
  }

  function habitWeekStats(date = new Date(), currentPartial = false) {
    const start = startOfWeek(date);
    const maxDays = currentPartial ? ((date.getDay() || 7)) : 7;
    let planned = 0;
    let completed = 0;
    state.habits.forEach(habit => {
      for (let offset = 0; offset < maxDays; offset += 1) {
        const day = addDays(start, offset);
        if ((habit.schedule || []).includes(day.getDay())) {
          planned += 1;
          if (habit.logs?.[localISO(day)]) completed += 1;
        }
      }
    });
    return { planned, completed, rate: planned ? Math.round(completed / planned * 100) : 100 };
  }

  function recordSnapshot() {
    state.snapshots ||= [];
    const analytics = getFinanceAnalytics();
    const tasks = taskWeekStats(new Date(), true);
    const habits = habitWeekStats(new Date(), true);
    const snapshot = {
      date: todayISO(),
      capital: analytics.capital,
      assets: analytics.assets,
      liquid: analytics.liquid,
      debt: analytics.debt,
      monthIncome: analytics.monthIncome,
      monthExpense: analytics.monthExpense,
      savingsRate: analytics.savingsRate,
      taskRate: tasks.rate,
      habitRate: habits.rate,
      activeProjects: state.projects.filter(project => ['active', 'growth'].includes(project.status)).length,
      overdueTasks: state.tasks.filter(task => task.status !== 'done' && task.due && task.due < todayISO()).length,
      updatedAt: new Date().toISOString()
    };
    const existing = state.snapshots.find(item => item.date === snapshot.date);
    if (existing) Object.assign(existing, snapshot); else state.snapshots.push(snapshot);
    state.snapshots = state.snapshots.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-730);
  }

  function snapshotChange(key) {
    const rows = (state.snapshots || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 2) return null;
    const current = Number(rows.at(-1)?.[key] || 0);
    const previous = Number(rows.at(-2)?.[key] || 0);
    return { current, previous, change: current - previous, percent: percentageChange(current, previous) };
  }

  function lineChart(rows, key, label = '') {
    if (rows.length < 2) return '<div class="item-meta">Динамика капитала появится после двух дней использования новой версии.</div>';
    const width = 640;
    const height = 170;
    const values = rows.map(row => Number(row[key] || 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(1, max - min);
    const points = rows.map((row, index) => {
      const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width;
      const y = height - 18 - ((Number(row[key] || 0) - min) / spread) * (height - 38);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<div class="line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}"><line x1="0" y1="${height - 18}" x2="${width}" y2="${height - 18}" class="chart-axis"/><polyline points="${points}" class="chart-line"/></svg><div class="chart-labels"><span>${dateText(rows[0].date)}</span><span>${dateText(rows.at(-1).date)}</span></div></div>`;
  }

  function dualBarChart(rows) {
    const max = Math.max(1, ...rows.flatMap(row => [row.income, row.expense]));
    return `<div class="dual-chart">${rows.map(row => `<div class="dual-column"><div class="dual-bars"><span class="income-bar" style="height:${Math.max(3, Math.round(row.income / max * 100))}%"></span><span class="expense-bar" style="height:${Math.max(3, Math.round(row.expense / max * 100))}%"></span></div><small>${escapeHtml(row.label)}</small></div>`).join('')}</div><div class="chart-legend"><span><i class="legend-income"></i>Доход</span><span><i class="legend-expense"></i>Расход</span></div>`;
  }

  function monthlyMoneySeries(count = 6) {
    const now = new Date();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
      const metrics = monthMetrics(monthKey(date));
      return { label: monthLabel(date), income: metrics.income, expense: metrics.expense, net: metrics.net };
    });
  }

  function estimatedCapitalSeries(count = 6) {
    const analytics = getFinanceAnalytics();
    const now = new Date();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
      const end = endOfMonth(date);
      const futureDelta = sum(state.transactions.filter(tx => {
        const txDate = parseISO(tx.date);
        return txDate && txDate > end && txDate <= now;
      }).map(tx => Number(tx.amount || 0) * (tx.type === 'income' ? 1 : -1)));
      return { label: monthLabel(date), capital: analytics.capital - futureDelta };
    });
  }

  function compactMoneyChart(rows, key = 'capital') {
    const max = Math.max(1, ...rows.map(row => Math.abs(Number(row[key] || 0))));
    return `<div class="money-chart">${rows.map(row => `<div class="money-column"><div class="money-bar-track"><span style="height:${Math.max(4, Math.round(Math.abs(Number(row[key] || 0)) / max * 100))}%"></span></div><small>${escapeHtml(row.label)}</small></div>`).join('')}</div>`;
  }

  function goalPace(goal, current, percent) {
    if (!goal.deadline) return { cls: 'neutral', text: 'Без срока' };
    const start = new Date(goal.createdAt || new Date(new Date().getFullYear(), 0, 1));
    const end = parseISO(goal.deadline);
    const now = new Date();
    if (!end || end <= start) return { cls: 'neutral', text: 'Проверь срок цели' };
    const expected = Math.max(0, Math.min(100, Math.round((now - start) / (end - start) * 100)));
    const gap = percent - expected;
    if (gap >= -5) return { cls: 'good', text: gap >= 5 ? `Опережение ${gap} п.п.` : 'Идёшь по плану' };
    return { cls: 'bad', text: `Отставание ${Math.abs(gap)} п.п.` };
  }

  function systemInsights() {
    const analytics = getFinanceAnalytics();
    const currentTasks = taskWeekStats(new Date(), true);
    const previousTasks = taskWeekStats(addDays(new Date(), -7), true);
    const currentHabits = habitWeekStats(new Date(), true);
    const previousHabits = habitWeekStats(addDays(new Date(), -7), true);
    const rows = [...getFinanceInsights(analytics)];
    if (currentTasks.rate < previousTasks.rate - 10) rows.push({ cls: 'danger', text: `Выполнение задач снизилось с ${previousTasks.rate}% до ${currentTasks.rate}%. Уменьши число активных задач и закрой 3 ключевые.` });
    if (currentHabits.rate < previousHabits.rate - 10) rows.push({ cls: 'warning', text: `Дисциплина просела на ${previousHabits.rate - currentHabits.rate} п.п. Самая сильная коррекция - вернуть 1-2 базовые привычки, а не пытаться закрыть все сразу.` });
    const overdueProjects = state.projects.filter(project => project.paymentStatus === 'overdue' || (project.paymentStatus === 'waiting' && project.paymentDate && project.paymentDate < todayISO()));
    if (overdueProjects.length) rows.push({ cls: 'danger', text: `${overdueProjects.length} проект(а) с просроченной оплатой. Это прямой риск денежного потока - поставь контакт с клиентом в задачи сегодня.` });
    const stalled = state.projects.filter(project => ['active', 'growth'].includes(project.status) && !String(project.next || '').trim());
    if (stalled.length) rows.push({ cls: 'warning', text: `${stalled.length} активных проект(а) без следующего шага. Проект без следующего действия фактически стоит.` });
    const laggingGoals = state.goals.filter(goal => {
      const current = goalCurrent(goal);
      const percent = Math.max(0, Math.min(100, Math.round(current / Math.max(1, Number(goal.target || 1)) * 100)));
      return goalPace(goal, current, percent).cls === 'bad';
    });
    if (laggingGoals.length) rows.push({ cls: 'warning', text: `${laggingGoals.length} цель(и) отстают от плана. У каждой должен быть конкретный следующий шаг на текущую неделю.` });
    if (!state.transactions.length) rows.push({ cls: 'warning', text: 'Прогресс денег не считается без операций. Добавляй доходы и расходы сразу после факта.' });
    return rows.slice(0, 8);
  }

  function render() {
    applyTheme();
    $('#todayLabel').textContent = fullDate();
    const titles = { dashboard: 'Главная', tasks: 'Задачи', finance: 'Финансы', projects: 'Проекты', growth: 'Прогресс' };
    $('#screenTitle').textContent = titles[currentScreen];
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === currentScreen));
    ({ dashboard: renderDashboard, tasks: renderTasks, finance: renderFinance, projects: renderProjects, growth: renderGrowth })[currentScreen]();
  }

  function taskCompletionToday() {
    const tasks = state.tasks.filter(task => task.due === todayISO());
    if (!tasks.length) return 100;
    return Math.round(tasks.filter(task => task.status === 'done').length / tasks.length * 100);
  }

  function habitCompletionToday() {
    const scheduled = state.habits.filter(habit => (habit.schedule || []).includes(new Date().getDay()));
    if (!scheduled.length) return 100;
    return Math.round(scheduled.filter(habit => habit.logs?.[todayISO()]).length / scheduled.length * 100);
  }

  function overallScore() {
    const finance = getFinanceAnalytics();
    const taskScore = taskCompletionToday();
    const habitScore = habitCompletionToday();
    const cushionScore = Math.max(0, Math.min(100, Math.round(finance.liquid / Math.max(1, state.profile.cushionTarget) * 100)));
    return Math.round(taskScore * 0.4 + habitScore * 0.25 + cushionScore * 0.35);
  }

  function getMainTask() {
    const priorities = { high: 0, medium: 1, low: 2 };
    return state.tasks
      .filter(task => task.status !== 'done' && (!task.due || task.due <= todayISO()))
      .sort((a, b) => (priorities[a.priority] ?? 1) - (priorities[b.priority] ?? 1) || (a.due || '9999').localeCompare(b.due || '9999'))[0];
  }

  function renderDashboard() {
    const analytics = getFinanceAnalytics();
    const score = overallScore();
    const mainTasks = state.tasks
      .filter(task => task.status !== 'done' && (!task.due || task.due <= todayISO()))
      .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1) || (a.due || '9999').localeCompare(b.due || '9999'))
      .slice(0, 3);
    const overdueTasks = state.tasks.filter(task => task.status !== 'done' && task.due && task.due < todayISO()).length;
    const overdueMoney = openObligations().filter(item => item.dueDate && item.dueDate < todayISO()).length;
    const upcoming = openObligations().filter(item => item.dueDate && dateInRange(item.dueDate, new Date(), addDays(new Date(), 7))).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
    const hasData = Boolean(state.accounts.length || state.transactions.length || state.projects.length || state.tasks.length > 2);
    const monthLimit = Number(state.profile.monthlyExpenseLimit || 0);
    const alertRows = [];
    if (overdueTasks) alertRows.push(`<div class="alert-row danger"><b>${overdueTasks}</b><span>просроченных задач</span><button data-go="tasks">Открыть</button></div>`);
    if (overdueMoney) alertRows.push(`<div class="alert-row danger"><b>${overdueMoney}</b><span>просроченных платежей</span><button data-go="finance">Открыть</button></div>`);
    if (monthLimit > 0 && analytics.projectedExpense > monthLimit) alertRows.push(`<div class="alert-row warning"><b>${money(analytics.projectedExpense - monthLimit)}</b><span>прогноз превышения бюджета</span><button data-go="finance">Разобрать</button></div>`);

    app.innerHTML = `
      <section class="hero">
        <div class="hero-top">
          <div>
            <p class="eyebrow">${escapeHtml(state.profile.name || 'Пользователь')}</p>
            <h2>${!hasData ? 'Система готова к работе' : score >= 75 ? 'Держишь курс' : score >= 45 ? 'Нужно вернуть контроль' : 'Система проседает'}</h2>
            <p>${!hasData ? 'Добавь счета, реальные деньги и 3 приоритетные задачи.' : mainTasks[0] ? `Главный фокус: ${escapeHtml(mainTasks[0].title)}` : 'Критичных задач на сегодня нет.'}</p>
          </div>
          <div class="score-ring" style="--score:${hasData ? score : 0}"><span>${hasData ? score : '—'}</span></div>
        </div>
      </section>

      <section class="quick-actions">
        <button class="quick-btn" type="button" id="quickTask"><span>＋</span>Задача</button>
        <button class="quick-btn" type="button" id="quickExpense"><span>−</span>Расход</button>
        <button class="quick-btn" type="button" id="quickIncome"><span>＋</span>Доход</button>
      </section>

      ${alertRows.length ? `<section class="section"><div class="section-head"><h2>Требует внимания</h2></div><div class="alert-list">${alertRows.join('')}</div></section>` : ''}

      <section class="section">
        <div class="section-head"><h2>Финансовый пульс</h2><button class="link-btn" type="button" data-go="finance">Финансы</button></div>
        <div class="card pulse-card">
          <div class="pulse-main"><div><small>Общий капитал</small><strong>${money(analytics.capital)}</strong></div><div><small>Свободно после платежей</small><strong class="${analytics.freeBalance < 0 ? 'negative' : ''}">${money(analytics.freeBalance)}</strong></div></div>
          <div class="pulse-grid"><div><small>Сегодня</small><b>${money(analytics.todayExpense)}</b></div><div><small>Неделя</small><b>${money(analytics.weekExpense)}</b></div><div><small>Месяц</small><b>${money(analytics.monthExpense)}</b></div><div><small>До лимита</small><b class="${analytics.remainingLimit < 0 ? 'negative' : 'positive'}">${money(analytics.remainingLimit)}</b></div></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Главное сегодня</h2><button class="link-btn" type="button" data-go="tasks">Все задачи</button></div>
        <div class="list">${mainTasks.length ? mainTasks.map(taskItem).join('') : empty('Главные задачи на сегодня закрыты.')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Ближайшие деньги</h2><button class="link-btn" type="button" data-go="finance">Открыть</button></div>
        <div class="list">${upcoming.length ? upcoming.map(obligationItem).join('') : empty('На ближайшие 7 дней платежей и поступлений нет.')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Дисциплина сегодня</h2><button class="link-btn" type="button" data-go="growth">Прогресс</button></div>
        <div class="discipline-strip"><strong>${habitCompletionToday()}%</strong><span>привычек выполнено сегодня</span></div>
      </section>
    `;
    bindCommon();
    $('#quickTask').addEventListener('click', () => openTaskModal());
    $('#quickExpense').addEventListener('click', () => openTransactionModal(null, 'expense'));
    $('#quickIncome').addEventListener('click', () => openTransactionModal(null, 'income'));
  }

  function taskItem(task) {
    const project = state.projects.find(item => item.id === task.projectId);
    const projectName = project?.name || task.project || 'Без проекта';
    const overdue = task.status !== 'done' && task.due && task.due < todayISO();
    return `
      <div class="item ${task.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''}">
        <input class="check task-check" type="checkbox" data-id="${task.id}" ${task.status === 'done' ? 'checked' : ''}>
        <div class="item-main">
          <div class="item-title">${escapeHtml(task.title)}</div>
          <div class="item-meta">${escapeHtml(projectName)} · ${dateText(task.due)}${task.dueTime ? `, ${escapeHtml(task.dueTime)}` : ''}</div>
          <div class="pill-row">
            <span class="badge ${task.priority}">${priorityText(task.priority)}</span>
            <span class="badge status-${task.status}">${taskStatusText(task.status)}</span>
            ${task.repeat !== 'none' ? `<span class="badge">↻ ${repeatText(task.repeat)}</span>` : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="mini-btn edit-task" type="button" data-id="${task.id}" aria-label="Редактировать">✎</button>
          <button class="mini-btn delete-task" type="button" data-id="${task.id}" aria-label="Удалить">×</button>
        </div>
      </div>`;
  }

  function renderTasks() {
    const today = todayISO();
    const nextWeek = localISO(addDays(new Date(), 7));
    const normalizedSearch = taskSearch.trim().toLowerCase();
    let tasks = state.tasks.filter(task => {
      if (normalizedSearch && !`${task.title} ${task.project} ${task.notes}`.toLowerCase().includes(normalizedSearch)) return false;
      if (taskFilter === 'today') return task.due === today;
      if (taskFilter === 'overdue') return task.status !== 'done' && task.due && task.due < today;
      if (taskFilter === 'week') return task.due && task.due >= today && task.due <= nextWeek;
      return true;
    });
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    tasks = tasks.sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due || '9999').localeCompare(b.due || '9999') || (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
    const active = tasks.filter(task => task.status !== 'done');
    const completed = tasks.filter(task => task.status === 'done');

    app.innerHTML = `
      <section class="toolbar-card">
        <div class="filter-row">
          ${[['today', 'Сегодня'], ['overdue', 'Просрочено'], ['week', '7 дней'], ['all', 'Все']].map(([key, label]) => `<button class="chip ${taskFilter === key ? 'active' : ''}" type="button" data-task-filter="${key}">${label}</button>`).join('')}
        </div>
        <input class="search-input" id="taskSearch" type="search" value="${escapeHtml(taskSearch)}" placeholder="Поиск задач">
      </section>
      <section class="section">
        <div class="section-head"><h2>Активные</h2><span class="badge">${active.length}</span></div>
        <div class="list">${active.length ? active.map(taskItem).join('') : empty('В этом фильтре активных задач нет.')}</div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Выполнено</h2><span class="badge">${completed.length}</span></div>
        <div class="list">${completed.length ? completed.map(taskItem).join('') : empty('Здесь появятся закрытые задачи.')}</div>
      </section>
      <button class="fab" id="addTask" type="button" aria-label="Добавить задачу">＋</button>`;

    bindCommon();
    $('#addTask').addEventListener('click', () => openTaskModal());
    $$('[data-task-filter]').forEach(button => button.addEventListener('click', () => { taskFilter = button.dataset.taskFilter; render(); }));
    $('#taskSearch').addEventListener('input', event => { taskSearch = event.target.value; renderTasks(); $('#taskSearch')?.focus(); });
  }

  function dailyExpenseSeries() {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(new Date(), index - 6);
      const iso = localISO(date);
      return { label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date).slice(0, 2), value: sum(state.transactions.filter(tx => tx.type === 'expense' && tx.date === iso).map(tx => tx.amount)) };
    });
  }

  function monthlySalarySeries() {
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - index), 1);
      return { label: monthLabel(date), value: sumTransactions('income', startOfMonth(date), endOfMonth(date), true), salary: sum(transactionsInRange('income', startOfMonth(date), endOfMonth(date)).filter(tx => tx.category === 'salary').map(tx => tx.amount)) };
    }).map(item => ({ label: item.label, value: item.salary }));
  }

  function barChart(series, formatter = money) {
    const maximum = Math.max(1, ...series.map(item => Number(item.value || 0)));
    return `<div class="bar-chart">${series.map(item => {
      const height = item.value ? Math.max(8, Math.round(item.value / maximum * 100)) : 3;
      return `<div class="bar-column" title="${escapeHtml(item.label)}: ${escapeHtml(formatter(item.value))}"><div class="bar-value">${item.value ? escapeHtml(shortMoney(item.value)) : ''}</div><div class="bar-track"><span style="height:${height}%"></span></div><small>${escapeHtml(item.label)}</small></div>`;
    }).join('')}</div>`;
  }

  function shortMoney(value) {
    const number = Number(value || 0);
    if (Math.abs(number) >= 1000000) return `${numberText(number / 1000000)}м`;
    if (Math.abs(number) >= 1000) return `${numberText(number / 1000)}к`;
    return `${Math.round(number)}`;
  }

  function renderFinance() {
    const analytics = getFinanceAnalytics();
    const progress = Math.max(0, Math.min(100, Math.round(analytics.capital / Math.max(1, state.profile.capitalTarget) * 100)));
    app.innerHTML = `
      <section class="hero compact">
        <p class="eyebrow">Общий капитал</p>
        <div class="kpi">${money(analytics.capital)}</div>
        <div class="capital-breakdown"><span>Активы ${money(analytics.assets)}</span><span>Долги ${money(analytics.debt)}</span><span>Ликвидно ${money(analytics.liquid)}</span></div>
        <div class="metric-row"><span class="muted">Цель: ${money(state.profile.capitalTarget)}</span><strong>${progress}%</strong></div>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </section>
      <section class="tabs">
        ${[['overview', 'Обзор'], ['operations', 'Операции'], ['accounts', 'Счета'], ['obligations', 'Платежи']].map(([key, label]) => `<button class="tab ${financeTab === key ? 'active' : ''}" type="button" data-finance-tab="${key}">${label}</button>`).join('')}
      </section>
      <div id="financeTabContent">${financeTabContent(financeTab, analytics)}</div>
    `;
    bindCommon();
    $$('[data-finance-tab]').forEach(button => button.addEventListener('click', () => { financeTab = button.dataset.financeTab; renderFinance(); }));
    bindFinanceActions();
  }

  function financeTabContent(tab, analytics) {
    if (tab === 'operations') return renderFinanceOperations();
    if (tab === 'accounts') return renderFinanceAccounts(analytics);
    if (tab === 'obligations') return renderFinanceObligations(analytics);
    return renderFinanceOverview(analytics);
  }

  function renderFinanceOverview(analytics) {
    const insights = getFinanceInsights(analytics);
    const maxCategory = Math.max(1, ...analytics.categoryRows.map(row => row.amount));
    const moneySeries = monthlyMoneySeries(6);
    return `
      <section class="finance-toolbar">
        <button class="action-tile" type="button" id="openMonthCompare">
          <span class="action-tile-icon">↗</span>
          <span><b>Сравнить периоды</b><small>Месяцы, зарплата и категории</small></span>
          <i>›</i>
        </button>
      </section>

      <section class="stats grid two finance-kpis">
        <div class="stat-card"><small>Доход за месяц</small><strong class="positive">${money(analytics.monthIncome)}</strong>${compareSentence('Доходы', analytics.monthIncome, analytics.previousMonthIncome)}</div>
        <div class="stat-card"><small>Расход за месяц</small><strong class="negative">${money(analytics.monthExpense)}</strong>${compareSentence('Расходы', analytics.monthExpense, analytics.previousMonthExpense, true)}</div>
        <div class="stat-card"><small>Расход за неделю</small><strong>${money(analytics.weekExpense)}</strong>${compareSentence('Расходы', analytics.weekExpense, analytics.previousWeekExpense, true)}</div>
        <div class="stat-card"><small>Сбережено</small><strong class="${analytics.monthBalance >= 0 ? 'positive' : 'negative'}">${money(analytics.monthBalance)}</strong><span class="compare neutral">${analytics.savingsRate}% дохода</span></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Денежный поток</h2><span class="badge">6 месяцев</span></div>
        <div class="card chart-card">${dualBarChart(moneySeries)}<div class="metric-row trend-footer"><span>Итог периода</span><strong>${money(sum(moneySeries.map(row => row.net)))}</strong></div></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Расходы по дням</h2><button class="link-btn" type="button" data-add-transaction="expense">+ Расход</button></div>
        <div class="card chart-card">${barChart(dailyExpenseSeries())}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>На что уходят деньги</h2><button class="link-btn" type="button" data-finance-tab-jump="operations">Все</button></div>
        <div class="card category-list">
          ${analytics.categoryRows.length ? analytics.categoryRows.map(row => `
            <div class="category-row">
              <div class="metric-row"><span>${escapeHtml(row.label)}</span><strong>${money(row.amount)}</strong></div>
              <div class="progress thin"><span style="width:${Math.round(row.amount / maxCategory * 100)}%"></span></div>
            </div>`).join('') : '<div class="item-meta">Расходов за текущий месяц пока нет.</div>'}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Анализ</h2></div>
        <div class="list">${insights.length ? insights.map(item => `<div class="insight ${item.cls}">${escapeHtml(item.text)}</div>`).join('') : '<div class="insight">Заполняй операции, и здесь появятся выводы по расходам и сбережениям.</div>'}</div>
      </section>
    `;
  }

  function monthComparisonMarkup() {
    const currentMetrics = monthMetrics(financeCompareCurrent);
    const baseMetrics = monthMetrics(financeCompareBase);
    const monthOptions = monthsForSelect().map(key => `<option value="${key}">${escapeHtml(monthName(key))}</option>`).join('');
    const categoryKeys = new Set([...currentMetrics.categories.keys(), ...baseMetrics.categories.keys()]);
    const categoryCompare = [...categoryKeys].map(key => {
      const current = Number(currentMetrics.categories.get(key) || 0);
      const base = Number(baseMetrics.categories.get(key) || 0);
      return { key, label: categoryLabel(key), current, base, delta: current - base, percent: percentageChange(current, base) };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
    return `<div class="compare-panel compact-compare">
      <div class="compare-selects"><label>Текущий<select id="compareCurrent">${monthOptions}</select></label><span>к</span><label>База<select id="compareBase">${monthOptions}</select></label></div>
      <div class="comparison-grid">
        <div><small>Доход</small><strong>${money(currentMetrics.income)}</strong>${compareSentence('Доходы', currentMetrics.income, baseMetrics.income)}</div>
        <div><small>Расход</small><strong>${money(currentMetrics.expense)}</strong>${compareSentence('Расходы', currentMetrics.expense, baseMetrics.expense, true)}</div>
        <div><small>Зарплата</small><strong>${money(currentMetrics.salary)}</strong>${compareSentence('Зарплата', currentMetrics.salary, baseMetrics.salary)}</div>
        <div><small>Сбережено</small><strong>${money(currentMetrics.net)}</strong>${compareSentence('Сбережения', currentMetrics.net, baseMetrics.net)}</div>
      </div>
      ${categoryCompare.length ? `<div class="category-compare"><h3>Изменения по категориям</h3>${categoryCompare.map(row => `<div class="category-delta"><span>${escapeHtml(row.label)}<small>${money(row.base)} → ${money(row.current)}</small></span><b class="${row.delta <= 0 ? 'positive' : 'negative'}">${row.percent === null ? 'нет базы' : `${row.delta > 0 ? '+' : '−'}${Math.abs(row.percent)}%`}</b></div>`).join('')}</div>` : '<div class="item-meta">Нет расходов для сравнения категорий.</div>'}
    </div>`;
  }

  function openMonthComparisonModal() {
    openModal('Сравнение периодов', monthComparisonMarkup(), null, { hideActions: true });
    const bind = () => {
      const current = $('#compareCurrent');
      const base = $('#compareBase');
      if (current) current.value = financeCompareCurrent;
      if (base) base.value = financeCompareBase;
      current?.addEventListener('change', () => { financeCompareCurrent = current.value; modalBody.innerHTML = monthComparisonMarkup(); bind(); });
      base?.addEventListener('change', () => { financeCompareBase = base.value; modalBody.innerHTML = monthComparisonMarkup(); bind(); });
    };
    bind();
  }

  function renderFinanceOperations() {
    const ordered = state.transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));
    return `
      <section class="quick-actions finance-actions">
        <button class="quick-btn" type="button" data-add-transaction="expense"><span>−</span>Расход</button>
        <button class="quick-btn" type="button" data-add-transaction="income"><span>＋</span>Доход</button>
      </section>
      <section class="section">
        <div class="section-head"><h2>История операций</h2><span class="badge">${ordered.length}</span></div>
        <div class="list">${ordered.length ? ordered.map(transactionItem).join('') : empty('Добавьте первый доход или расход.')}</div>
      </section>`;
  }

  function transactionItem(tx) {
    const account = state.accounts.find(item => item.id === tx.accountId);
    const project = state.projects.find(item => item.id === tx.projectId);
    const sign = tx.type === 'expense' ? '−' : '+';
    return `
      <div class="item">
        <div class="category-icon ${tx.type}">${tx.type === 'expense' ? '−' : '+'}</div>
        <div class="item-main">
          <div class="item-title">${escapeHtml(tx.title)}</div>
          <div class="item-meta">${escapeHtml(categoryLabel(tx.category))} · ${dateText(tx.date)}${account ? ` · ${escapeHtml(account.name)}` : ''}${project ? ` · ${escapeHtml(project.name)}` : ''}${tx.type === 'expense' ? ` · ${tx.necessity === 'required' ? 'обязательная' : tx.necessity === 'optional' ? 'необязательная' : 'характер не указан'}${tx.scope === 'work' ? ' · рабочая' : ''}` : ''}</div>
          ${tx.notes ? `<div class="item-note">${escapeHtml(tx.notes)}</div>` : ''}
        </div>
        <div class="amount-block">
          <strong class="${tx.type === 'expense' ? 'negative' : 'positive'}">${sign}${money(tx.amount)}</strong>
          <div class="item-actions">
            <button class="mini-btn edit-transaction" type="button" data-id="${tx.id}">✎</button>
            <button class="mini-btn delete-transaction" type="button" data-id="${tx.id}">×</button>
          </div>
        </div>
      </div>`;
  }

  function renderFinanceAccounts(analytics) {
    return `
      <section class="stats grid two">
        <div class="stat-card"><small>Все активы</small><strong>${money(analytics.assets)}</strong></div>
        <div class="stat-card"><small>Чистый капитал</small><strong>${money(analytics.capital)}</strong></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Счета</h2><button class="link-btn" type="button" id="addAccount">Добавить</button></div>
        <div class="list">${state.accounts.length ? state.accounts.map(accountItem).join('') : empty('Добавьте карту, наличные или накопительный счёт.')}</div>
      </section>`;
  }

  function accountItem(account) {
    return `<div class="item">
      <div class="account-icon">${account.type === 'cash' ? '₽' : account.type === 'savings' ? '◆' : account.type === 'investment' ? '↗' : '▣'}</div>
      <div class="item-main"><div class="item-title">${escapeHtml(account.name)}${account.isDefault ? ' <span class="badge">основной</span>' : ''}</div><div class="item-meta">${accountTypeText(account.type)}</div></div>
      <div class="amount-block"><strong>${money(account.balance)}</strong><div class="item-actions"><button class="mini-btn edit-account" type="button" data-id="${account.id}">✎</button><button class="mini-btn delete-account" type="button" data-id="${account.id}">×</button></div></div>
    </div>`;
  }

  function renderFinanceObligations(analytics) {
    const open = state.obligations.filter(item => item.status === 'open').sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const closed = state.obligations.filter(item => item.status !== 'open').sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || '')).slice(0, 10);
    return `
      <section class="stats grid two">
        <div class="stat-card"><small>Ожидается</small><strong class="positive">${money(analytics.expected)}</strong></div>
        <div class="stat-card"><small>Открытые долги</small><strong class="negative">${money(analytics.debt)}</strong></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Открытые</h2><button class="link-btn" type="button" id="addObligation">Добавить</button></div>
        <div class="list">${open.length ? open.map(obligationItem).join('') : empty('Открытых платежей и поступлений нет.')}</div>
      </section>
      ${closed.length ? `<section class="section"><div class="section-head"><h2>Закрытые</h2></div><div class="list">${closed.map(obligationItem).join('')}</div></section>` : ''}`;
  }

  function obligationItem(item) {
    const overdue = item.status === 'open' && item.dueDate && item.dueDate < todayISO();
    return `<div class="item ${overdue ? 'overdue' : ''}">
      <div class="category-icon ${item.type === 'expected' ? 'income' : 'expense'}">${item.type === 'expected' ? '+' : '!'}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-meta">${obligationTypeText(item.type)} · ${dateText(item.dueDate)} · ${item.status === 'open' ? 'Открыто' : item.status === 'received' ? 'Получено' : 'Оплачено'}</div>
      </div>
      <div class="amount-block">
        <strong class="${item.type === 'expected' ? 'positive' : 'negative'}">${money(item.amount)}</strong>
        <div class="item-actions">
          ${item.status === 'open' ? `<button class="mini-btn settle-obligation" type="button" data-id="${item.id}" title="Закрыть">✓</button>` : ''}
          <button class="mini-btn edit-obligation" type="button" data-id="${item.id}">✎</button>
          <button class="mini-btn delete-obligation" type="button" data-id="${item.id}">×</button>
        </div>
      </div>
    </div>`;
  }

  function bindFinanceActions() {
    $('#openMonthCompare')?.addEventListener('click', openMonthComparisonModal);
    $$('[data-add-transaction]').forEach(button => button.addEventListener('click', () => openTransactionModal(null, button.dataset.addTransaction)));
    $$('[data-finance-tab-jump]').forEach(button => button.addEventListener('click', () => { financeTab = button.dataset.financeTabJump; renderFinance(); }));
    $('#addAccount')?.addEventListener('click', () => openAccountModal());
    $('#addObligation')?.addEventListener('click', () => openObligationModal());
    $$('.edit-transaction').forEach(button => button.addEventListener('click', () => openTransactionModal(state.transactions.find(item => item.id === button.dataset.id))));
    $$('.delete-transaction').forEach(button => button.addEventListener('click', () => deleteTransaction(button.dataset.id)));
    $$('.edit-account').forEach(button => button.addEventListener('click', () => openAccountModal(state.accounts.find(item => item.id === button.dataset.id))));
    $$('.delete-account').forEach(button => button.addEventListener('click', () => deleteAccount(button.dataset.id)));
    $$('.edit-obligation').forEach(button => button.addEventListener('click', () => openObligationModal(state.obligations.find(item => item.id === button.dataset.id))));
    $$('.delete-obligation').forEach(button => button.addEventListener('click', () => removeItem('obligations', button.dataset.id)));
    $$('.settle-obligation').forEach(button => button.addEventListener('click', () => openSettlementModal(state.obligations.find(item => item.id === button.dataset.id))));
  }

  function renderProjects() {
    const active = state.projects.filter(project => project.status === 'active' || project.status === 'growth');
    const monthly = sum(active.map(project => project.value));
    const unpaid = sum(state.projects.filter(project => project.paymentStatus === 'overdue' || project.paymentStatus === 'waiting').map(project => project.debt || project.value));
    app.innerHTML = `
      <section class="hero compact">
        <p class="eyebrow">Плановый доход по проектам</p>
        <div class="kpi">${money(monthly)}</div>
        <p>Цель: ${money(state.profile.monthlyIncomeTarget)} · не хватает ${money(Math.max(0, state.profile.monthlyIncomeTarget - monthly))}</p>
      </section>
      <section class="stats grid two">
        <div class="stat-card"><small>Активные проекты</small><strong>${active.length}</strong></div>
        <div class="stat-card"><small>Ожидается от клиентов</small><strong class="${unpaid ? 'positive' : ''}">${money(unpaid)}</strong></div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Проекты и клиенты</h2><button class="link-btn" type="button" id="addProject">Добавить</button></div>
        <div class="list">${state.projects.length ? state.projects.map(projectItem).join('') : empty('Добавьте первый проект или клиента.')}</div>
      </section>
      <button class="fab" id="addProjectFab" type="button" aria-label="Добавить проект">＋</button>`;
    bindCommon();
    $('#addProject').addEventListener('click', () => openProjectModal());
    $('#addProjectFab').addEventListener('click', () => openProjectModal());
  }

  function projectItem(project) {
    const overdue = project.paymentStatus === 'overdue' || (project.paymentStatus === 'waiting' && project.paymentDate && project.paymentDate < todayISO());
    const calculatedCpl = Number(project.leads || 0) > 0 ? Math.round(Number(project.adBudget || 0) / Number(project.leads || 1)) : Number(project.cpl || 0);
    return `<div class="card project-card ${overdue ? 'overdue-card' : ''}">
      <div class="metric-row"><div><div class="item-title">${escapeHtml(project.name)}</div><div class="item-meta">${escapeHtml(project.service || projectTypeText(project.type))}</div></div><span class="badge ${project.status === 'active' ? 'low' : project.status === 'paused' ? 'high' : 'medium'}">${projectStatusText(project.status)}</span></div>
      <div class="project-metrics">
        <div><small>Доход</small><strong>${money(project.value)}</strong></div>
        <div><small>Оплата</small><strong class="${overdue ? 'negative' : ''}">${paymentStatusText(project.paymentStatus)}</strong></div>
        <div><small>Лиды</small><strong>${Number(project.leads || 0)}</strong></div>
        <div><small>CPL</small><strong>${calculatedCpl ? money(calculatedCpl) : '—'}</strong></div>
      </div>
      <div class="insight" style="margin-top:12px">Следующий шаг: ${escapeHtml(project.next || 'Не указан')}</div>
      ${project.result ? `<div class="item-note">Результат: ${escapeHtml(project.result)}</div>` : ''}
      <div class="project-footer">
        <span class="item-meta">${project.paymentDate ? `Оплата ${dateText(project.paymentDate)}` : 'Дата оплаты не указана'}</span>
        <div class="item-actions"><button class="mini-btn edit-project" type="button" data-id="${project.id}">✎</button><button class="mini-btn delete-project" type="button" data-id="${project.id}">×</button></div>
      </div>
    </div>`;
  }

  function projectTypeText(type) {
    return ({ client: 'Клиент', job: 'Работа', personal: 'Личный проект' })[type] || 'Проект';
  }

  function getLast7Days() {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(new Date(), index - 6);
      return { iso: localISO(date), label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date).slice(0, 2) };
    });
  }

  function habitStreak(habit) {
    let streak = 0;
    for (let index = 0; index < 365; index += 1) {
      const iso = localISO(addDays(new Date(), -index));
      if (habit.logs?.[iso]) streak += 1;
      else if (index === 0) continue;
      else break;
    }
    return streak;
  }

  function habitMonthPercent(habit) {
    const now = new Date();
    let planned = 0;
    let completed = 0;
    for (let day = 1; day <= now.getDate(); day += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      if ((habit.schedule || []).includes(date.getDay())) {
        planned += 1;
        if (habit.logs?.[localISO(date)]) completed += 1;
      }
    }
    return planned ? Math.round(completed / planned * 100) : 100;
  }

  function goalCurrent(goal) {
    const analytics = getFinanceAnalytics();
    if (goal.autoSource === 'capital') return analytics.capital;
    if (goal.autoSource === 'monthlyIncome') return analytics.monthIncome;
    return Number(goal.current || 0);
  }

  function renderGrowth() {
    const analytics = getFinanceAnalytics();
    const days = getLast7Days();
    const reviews = state.weeklyReviews.slice().sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''));
    const currentWeek = localISO(startOfWeek(new Date()));
    const currentReview = reviews.find(review => review.weekStart === currentWeek);
    const currentTasks = taskWeekStats(new Date(), true);
    const previousTasks = taskWeekStats(addDays(new Date(), -7), true);
    const currentHabits = habitWeekStats(new Date(), true);
    const previousHabits = habitWeekStats(addDays(new Date(), -7), true);
    const moneySeries = monthlyMoneySeries(6);
    const capitalSeries = estimatedCapitalSeries(6);
    const activeProjects = state.projects.filter(project => ['active', 'growth'].includes(project.status));
    const overduePayments = state.projects.filter(project => project.paymentStatus === 'overdue' || (project.paymentStatus === 'waiting' && project.paymentDate && project.paymentDate < todayISO())).length;
    const projectIncome = sum(activeProjects.map(project => project.value));
    const projectActualIncome = sum(state.transactions.filter(tx => tx.type === 'income' && tx.projectId && dateInRange(tx.date, analytics.monthStart, analytics.monthEnd)).map(tx => tx.amount));
    const insights = systemInsights();
    const score = overallScore();
    const capitalChange = percentageChange(capitalSeries.at(-1)?.capital || 0, capitalSeries.at(-2)?.capital || 0);

    app.innerHTML = `
      <section class="progress-hero">
        <div><p class="eyebrow">Индекс системы</p><h2>${score}%</h2><p>${score >= 75 ? 'Курс устойчивый. Не ослабляй дисциплину.' : score >= 45 ? 'Есть прогресс, но несколько зон тянут назад.' : 'Система теряет темп. Сначала деньги и ключевые задачи.'}</p></div>
        <div class="score-ring large" style="--score:${score}"><span>${score}</span></div>
      </section>

      <section class="growth-summary">
        <div class="stat-card"><small>Капитал</small><strong>${money(analytics.capital)}</strong><span class="compare ${capitalChange === null ? 'neutral' : capitalChange >= 0 ? 'good' : 'bad'}">${capitalChange === null ? 'первая база' : `${capitalChange >= 0 ? 'рост' : 'снижение'} ${Math.abs(capitalChange)}%`}</span></div>
        <div class="stat-card"><small>Чистый поток месяца</small><strong class="${analytics.monthBalance >= 0 ? 'positive' : 'negative'}">${money(analytics.monthBalance)}</strong><span class="compare neutral">доход минус расход</span></div>
        <div class="stat-card"><small>Задачи недели</small><strong>${currentTasks.rate}%</strong>${compareSentence('Выполнение', currentTasks.rate, previousTasks.rate)}</div>
        <div class="stat-card"><small>Привычки недели</small><strong>${currentHabits.rate}%</strong>${compareSentence('Дисциплина', currentHabits.rate, previousHabits.rate)}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Динамика капитала</h2><span class="badge">6 месяцев</span></div>
        <div class="card chart-card">${compactMoneyChart(capitalSeries)}<div class="metric-row trend-footer"><span>Сейчас</span><strong>${money(analytics.capital)}</strong></div></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Доходы и расходы</h2><button class="link-btn" type="button" data-go="finance">Финансы</button></div>
        <div class="card chart-card">${dualBarChart(moneySeries)}<div class="project-metrics two-cols"><div><small>Доход месяца</small><strong class="positive">${money(analytics.monthIncome)}</strong></div><div><small>Расход месяца</small><strong class="negative">${money(analytics.monthExpense)}</strong></div></div></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Где теряется прогресс</h2></div>
        <div class="list">${insights.length ? insights.map(item => `<div class="insight ${item.cls}">${escapeHtml(item.text)}</div>`).join('') : '<div class="insight">Критичных отклонений не найдено. Продолжай заполнять операции, задачи и привычки.</div>'}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Проекты</h2><button class="link-btn" type="button" data-go="projects">Открыть</button></div>
        <div class="card project-progress-grid"><div><small>Активных</small><strong>${activeProjects.length}</strong></div><div><small>Плановый доход</small><strong>${money(projectIncome)}</strong></div><div><small>Факт за месяц</small><strong class="positive">${money(projectActualIncome)}</strong></div><div><small>Просрочено оплат</small><strong class="${overduePayments ? 'negative' : ''}">${overduePayments}</strong></div></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Цели</h2><button class="link-btn" type="button" id="addGoal">Добавить</button></div>
        <div class="list">${state.goals.length ? state.goals.map(goal => {
          const current = goalCurrent(goal);
          const percent = Math.max(0, Math.min(100, Math.round(current / Math.max(1, Number(goal.target || 1)) * 100)));
          const pace = goalPace(goal, current, percent);
          return `<div class="card goal-card">
            <div class="metric-row"><div class="item-title">${escapeHtml(goal.title)}</div><strong>${percent}%</strong></div>
            <div class="progress"><span style="width:${percent}%"></span></div>
            <div class="goal-meta-row"><span>${numberText(current)}${goal.unit ? ` ${escapeHtml(goal.unit)}` : ''} из ${numberText(goal.target)}${goal.unit ? ` ${escapeHtml(goal.unit)}` : ''}</span><span class="compare ${pace.cls}">${pace.text}</span></div>
            ${goal.nextAction ? `<div class="item-note"><b>Следующий шаг:</b> ${escapeHtml(goal.nextAction)}</div>` : ''}
            <div class="item-actions end"><button class="mini-btn edit-goal" type="button" data-id="${goal.id}">✎</button><button class="mini-btn delete-goal" type="button" data-id="${goal.id}">×</button></div>
          </div>`;
        }).join('') : empty('Добавьте измеримую цель.')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Привычки</h2><button class="link-btn" type="button" id="addHabit">Добавить</button></div>
        <div class="list">${state.habits.length ? state.habits.map(habit => `
          <div class="card habit-card">
            <div class="metric-row"><div><div class="item-title">${escapeHtml(habit.title)}</div><div class="item-meta">Месяц ${habitMonthPercent(habit)}% · серия ${habitStreak(habit)} дн.</div></div><div class="item-actions"><button class="mini-btn edit-habit" type="button" data-id="${habit.id}">✎</button><button class="mini-btn delete-habit" type="button" data-id="${habit.id}">×</button></div></div>
            <div class="week-grid">${days.map(day => `<button class="day-cell habit-day ${habit.logs?.[day.iso] ? 'done' : ''}" type="button" data-id="${habit.id}" data-date="${day.iso}">${day.label}</button>`).join('')}</div>
          </div>`).join('') : empty('Добавьте полезную привычку.')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Недельные разборы</h2><button class="link-btn" type="button" id="addReview">${currentReview ? 'Изменить' : 'Заполнить'}</button></div>
        <div class="list">${reviews.length ? reviews.slice(0, 4).map(reviewItem).join('') : empty('Разбор недели покажет, что реально двигает доход и капитал.')}</div>
      </section>`;
    bindCommon();
    $('#addGoal').addEventListener('click', () => openGoalModal());
    $('#addHabit').addEventListener('click', () => openHabitModal());
    $('#addReview').addEventListener('click', () => openReviewModal(currentReview));
  }

  function reviewItem(review) {
    return `<div class="card">
      <div class="metric-row"><div class="item-title">Неделя с ${dateText(review.weekStart)}</div><div class="item-actions"><button class="mini-btn edit-review" type="button" data-id="${review.id}">✎</button><button class="mini-btn delete-review" type="button" data-id="${review.id}">×</button></div></div>
      <div class="project-metrics two-cols"><div><small>Заработано</small><strong>${money(review.income)}</strong></div><div><small>Отложено</small><strong>${money(review.saved)}</strong></div></div>
      ${review.wins ? `<div class="item-note"><b>Результаты:</b> ${escapeHtml(review.wins)}</div>` : ''}
      ${review.lesson ? `<div class="insight" style="margin-top:10px">Вывод: ${escapeHtml(review.lesson)}</div>` : ''}
      ${review.priorities ? `<div class="item-note"><b>Следующая неделя:</b> ${escapeHtml(review.priorities)}</div>` : ''}
    </div>`;
  }

  function empty(text) {
    return `<div class="empty-state"><div class="empty-icon">＋</div><h3>Пока пусто</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function bindCommon() {
    $$('[data-go]').forEach(button => button.addEventListener('click', () => switchScreen(button.dataset.go)));
    $$('.task-check').forEach(input => input.addEventListener('change', () => toggleTask(input.dataset.id, input.checked)));
    $$('.habit-check').forEach(input => input.addEventListener('change', () => {
      const habit = state.habits.find(item => item.id === input.dataset.id);
      if (!habit) return;
      habit.logs ||= {};
      habit.logs[todayISO()] = input.checked;
      saveState();
      render();
    }));
    $$('.edit-task').forEach(button => button.addEventListener('click', () => openTaskModal(state.tasks.find(item => item.id === button.dataset.id))));
    $$('.delete-task').forEach(button => button.addEventListener('click', () => removeItem('tasks', button.dataset.id)));
    $$('.edit-project').forEach(button => button.addEventListener('click', () => openProjectModal(state.projects.find(item => item.id === button.dataset.id))));
    $$('.delete-project').forEach(button => button.addEventListener('click', () => removeItem('projects', button.dataset.id)));
    $$('.edit-goal').forEach(button => button.addEventListener('click', () => openGoalModal(state.goals.find(item => item.id === button.dataset.id))));
    $$('.delete-goal').forEach(button => button.addEventListener('click', () => removeItem('goals', button.dataset.id)));
    $$('.edit-habit').forEach(button => button.addEventListener('click', () => openHabitModal(state.habits.find(item => item.id === button.dataset.id))));
    $$('.delete-habit').forEach(button => button.addEventListener('click', () => removeItem('habits', button.dataset.id)));
    $$('.habit-day').forEach(button => button.addEventListener('click', () => {
      const habit = state.habits.find(item => item.id === button.dataset.id);
      if (!habit) return;
      habit.logs ||= {};
      habit.logs[button.dataset.date] = !habit.logs[button.dataset.date];
      saveState();
      render();
    }));
    $$('.edit-review').forEach(button => button.addEventListener('click', () => openReviewModal(state.weeklyReviews.find(item => item.id === button.dataset.id))));
    $$('.delete-review').forEach(button => button.addEventListener('click', () => removeItem('weeklyReviews', button.dataset.id)));
  }

  function toggleTask(id, completed) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    task.status = completed ? 'done' : 'todo';
    task.completedAt = completed ? new Date().toISOString() : null;
    if (completed && task.repeat !== 'none' && task.due && task.repeatSpawnedFor !== task.due) {
      const nextDate = parseISO(task.due);
      if (task.repeat === 'daily') nextDate.setDate(nextDate.getDate() + 1);
      if (task.repeat === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      if (task.repeat === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      state.tasks.push({ ...clone(task), id: uid(), due: localISO(nextDate), status: 'todo', completedAt: null, reminderSentFor: null, repeatSpawnedFor: null, createdAt: new Date().toISOString() });
      task.repeatSpawnedFor = task.due;
    }
    saveState();
    render();
  }

  function removeItem(collection, id) {
    if (!confirm('Удалить запись?')) return;
    state[collection] = state[collection].filter(item => item.id !== id);
    saveState();
    render();
  }

  function applyTransactionToAccount(transaction, direction = 1) {
    if (!transaction.accountId || !state.accounts.some(item => item.id === transaction.accountId)) transaction.accountId = getDefaultAccount().id;
    const account = state.accounts.find(item => item.id === transaction.accountId);
    if (!account) return;
    const delta = Number(transaction.amount || 0) * (transaction.type === 'income' ? 1 : -1) * direction;
    account.balance = Number(account.balance || 0) + delta;
  }

  function deleteTransaction(id) {
    const transaction = state.transactions.find(item => item.id === id);
    if (!transaction || !confirm('Удалить операцию? Баланс связанного счёта будет пересчитан.')) return;
    applyTransactionToAccount(transaction, -1);
    state.transactions = state.transactions.filter(item => item.id !== id);
    saveState();
    render();
  }

  function deleteAccount(id) {
    const account = state.accounts.find(item => item.id === id);
    if (!account) return;
    if (state.accounts.length === 1) {
      alert('Нельзя удалить единственный счёт. Измени его название или баланс.');
      return;
    }
    if (!confirm(`Удалить счёт «${account.name}»? Связанные операции будут перенесены на основной счёт.`)) return;
    let fallback = state.accounts.find(item => item.id !== id && item.isDefault) || state.accounts.find(item => item.id !== id);
    fallback.balance = Number(fallback.balance || 0) + Number(account.balance || 0);
    state.transactions.filter(tx => tx.accountId === id).forEach(tx => { tx.accountId = fallback.id; });
    state.accounts = state.accounts.filter(item => item.id !== id);
    if (account.isDefault) fallback.isDefault = true;
    saveState();
    render();
  }

  function openGlobalAdd() {
    openModal('Быстрое добавление', `
      <div class="quick-sheet">
        <button type="button" data-quick="income"><span>＋</span><b>Доход</b><small>Пополнить общий баланс</small></button>
        <button type="button" data-quick="expense"><span>−</span><b>Расход</b><small>Списать со счёта</small></button>
        <button type="button" data-quick="task"><span>✓</span><b>Задача</b><small>Добавить действие</small></button>
        <button type="button" data-quick="account"><span>▣</span><b>Счёт</b><small>Карта, наличные или вклад</small></button>
      </div>`, null, { hideActions: true });
    $$('[data-quick]', modalBody).forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.quick;
      closeModal();
      if (action === 'income') openTransactionModal(null, 'income');
      if (action === 'expense') openTransactionModal(null, 'expense');
      if (action === 'task') openTaskModal();
      if (action === 'account') openAccountModal();
    }));
  }

  function openModal(title, body, action, options = {}) {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalAction = action;
    modalActions.hidden = Boolean(options.hideActions);
    modalSubmit.textContent = options.submitText || 'Сохранить';
    if (!modal.open) modal.showModal();
    setTimeout(() => modalBody.querySelector('input, select, textarea, button')?.focus(), 50);
  }

  function closeModal() {
    modalAction = null;
    modalForm.reset();
    if (modal.open) modal.close();
  }

  function projectOptions(selectedId = '') {
    return `<option value="">Без проекта</option>${state.projects.map(project => `<option value="${project.id}" ${selectedId === project.id ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}`;
  }

  function accountOptions(selectedId = '') {
    const selected = selectedId || getDefaultAccount().id;
    return state.accounts.map(account => `<option value="${account.id}" ${selected === account.id ? 'selected' : ''}>${escapeHtml(account.name)} · ${money(account.balance)}</option>`).join('');
  }

  function openTaskModal(item = null) {
    openModal(item ? 'Изменить задачу' : 'Новая задача', `
      <div class="field"><label>Задача</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Что конкретно нужно сделать"></div>
      <div class="form-grid">
        <div class="field"><label>Проект</label><select name="projectId">${projectOptions(item?.projectId || '')}</select></div>
        <div class="field"><label>Статус</label><select name="status">${[['todo', 'К выполнению'], ['doing', 'В работе'], ['waiting', 'Жду'], ['deferred', 'Отложено'], ['done', 'Выполнено']].map(([value, label]) => `<option value="${value}" ${item?.status === value || (!item && value === 'todo') ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Приоритет</label><select name="priority"><option value="high" ${item?.priority === 'high' ? 'selected' : ''}>Высокий</option><option value="medium" ${!item || item?.priority === 'medium' ? 'selected' : ''}>Средний</option><option value="low" ${item?.priority === 'low' ? 'selected' : ''}>Низкий</option></select></div>
        <div class="field"><label>Дата</label><input name="due" type="date" value="${item?.due || todayISO()}"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Время</label><input name="dueTime" type="time" value="${item?.dueTime || ''}"></div>
        <div class="field"><label>Напоминание</label><select name="reminder"><option value="none" ${!item || item?.reminder === 'none' ? 'selected' : ''}>Без напоминания</option><option value="at_time" ${item?.reminder === 'at_time' ? 'selected' : ''}>В указанное время</option><option value="1h" ${item?.reminder === '1h' ? 'selected' : ''}>За 1 час</option><option value="day_before" ${item?.reminder === 'day_before' ? 'selected' : ''}>За день</option></select></div>
      </div>
      <div class="field"><label>Повторение</label><select name="repeat"><option value="none" ${!item || item?.repeat === 'none' ? 'selected' : ''}>Не повторять</option><option value="daily" ${item?.repeat === 'daily' ? 'selected' : ''}>Каждый день</option><option value="weekly" ${item?.repeat === 'weekly' ? 'selected' : ''}>Каждую неделю</option><option value="monthly" ${item?.repeat === 'monthly' ? 'selected' : ''}>Каждый месяц</option></select></div>
      <div class="field"><label>Комментарий</label><textarea name="notes" placeholder="Детали, ссылка или критерий выполнения">${escapeHtml(item?.notes || '')}</textarea></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      if (!data.title.trim()) return false;
      const project = state.projects.find(projectItem => projectItem.id === data.projectId);
      data.project = project?.name || item?.project || '';
      if (item) {
        Object.assign(item, data, { completedAt: data.status === 'done' ? (item.completedAt || new Date().toISOString()) : null });
      } else {
        const task = { id: uid(), ...data, createdAt: new Date().toISOString(), completedAt: data.status === 'done' ? new Date().toISOString() : null, reminderSentFor: null };
        state.tasks.push(task);
        notifyTaskCreated(task);
      }
      return true;
    });
  }

  function categoryOptions(type, selected = '') {
    const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return list.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }

  function openTransactionModal(item = null, presetType = 'expense') {
    const type = item?.type || presetType;
    openModal(item ? 'Изменить операцию' : type === 'income' ? 'Новый доход' : 'Новый расход', `
      <div class="form-grid">
        <div class="field"><label>Тип</label><select name="type" id="transactionType"><option value="expense" ${type === 'expense' ? 'selected' : ''}>Расход</option><option value="income" ${type === 'income' ? 'selected' : ''}>Доход</option></select></div>
        <div class="field"><label>Сумма, ₽</label><input name="amount" type="number" min="0.01" step="0.01" required value="${item?.amount ?? ''}" inputmode="decimal"></div>
      </div>
      <div class="field"><label>Название</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Например, продукты или зарплата"></div>
      <div class="form-grid">
        <div class="field"><label>Категория</label><select name="category" id="transactionCategory">${categoryOptions(type, item?.category || (type === 'income' ? 'salary' : 'groceries'))}</select></div>
        <div class="field"><label>Дата</label><input name="date" type="date" value="${item?.date || todayISO()}"></div>
      </div>
      <div id="expenseDetails" ${type === 'income' ? 'hidden' : ''}>
        <div class="form-grid">
          <div class="field"><label>Характер траты</label><select name="necessity"><option value="required" ${item?.necessity === 'required' ? 'selected' : ''}>Обязательная</option><option value="optional" ${!item || item?.necessity !== 'required' ? 'selected' : ''}>Необязательная</option></select></div>
          <div class="field"><label>Контекст</label><select name="scope"><option value="personal" ${!item || item?.scope !== 'work' ? 'selected' : ''}>Личная</option><option value="work" ${item?.scope === 'work' ? 'selected' : ''}>Рабочая</option></select></div>
        </div>
      </div>
      <div class="field"><label>Связать с проектом</label><select name="projectId">${projectOptions(item?.projectId || '')}</select></div>
      <div class="field"><label>Счёт</label><select name="accountId">${accountOptions(item?.accountId || getDefaultAccount().id)}</select><small>Доход пополнит выбранный счёт, расход уменьшит его баланс.</small></div>
      <div class="field"><label>Комментарий</label><textarea name="notes" placeholder="На что именно или откуда доход">${escapeHtml(item?.notes || '')}</textarea></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      data.amount = Number(data.amount || 0);
      if (!data.title.trim() || data.amount <= 0) return false;
      if (data.type === 'income') { data.necessity = ''; data.scope = ''; }
      if (item) {
        applyTransactionToAccount(item, -1);
        Object.assign(item, data);
        applyTransactionToAccount(item, 1);
      } else {
        const transaction = { id: uid(), ...data };
        state.transactions.push(transaction);
        applyTransactionToAccount(transaction, 1);
      }
      return true;
    });
    $('#transactionType').addEventListener('change', event => {
      const select = $('#transactionCategory');
      select.innerHTML = categoryOptions(event.target.value, event.target.value === 'income' ? 'salary' : 'groceries');
      modalTitle.textContent = event.target.value === 'income' ? 'Новый доход' : 'Новый расход';
      $('#expenseDetails').hidden = event.target.value === 'income';
    });
  }

  function openAccountModal(item = null) {
    openModal(item ? 'Изменить счёт' : 'Новый счёт', `
      <div class="field"><label>Название</label><input name="name" required value="${escapeHtml(item?.name || '')}" placeholder="Основная карта, наличные, вклад"></div>
      <div class="form-grid">
        <div class="field"><label>Тип</label><select name="type"><option value="card" ${!item || item?.type === 'card' ? 'selected' : ''}>Карта</option><option value="cash" ${item?.type === 'cash' ? 'selected' : ''}>Наличные</option><option value="savings" ${item?.type === 'savings' ? 'selected' : ''}>Накопительный счёт</option><option value="investment" ${item?.type === 'investment' ? 'selected' : ''}>Инвестиции</option></select></div>
        <div class="field"><label>Текущий баланс, ₽</label><input name="balance" type="number" step="0.01" required value="${item?.balance ?? 0}"></div>
      </div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      data.balance = Number(data.balance || 0);
      if (!data.name.trim()) return false;
      if (item) Object.assign(item, data); else state.accounts.push({ id: uid(), ...data });
      return true;
    });
  }

  function openObligationModal(item = null) {
    openModal(item ? 'Изменить обязательство' : 'Новое обязательство', `
      <div class="field"><label>Название</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Клиент должен оплатить, кредит, аренда"></div>
      <div class="form-grid">
        <div class="field"><label>Тип</label><select name="type"><option value="expected" ${item?.type === 'expected' ? 'selected' : ''}>Ожидаемый доход</option><option value="payment" ${!item || item?.type === 'payment' ? 'selected' : ''}>Обязательный платёж</option><option value="debt" ${item?.type === 'debt' ? 'selected' : ''}>Долг</option></select></div>
        <div class="field"><label>Сумма, ₽</label><input name="amount" type="number" min="0.01" step="0.01" required value="${item?.amount ?? ''}"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Дата</label><input name="dueDate" type="date" value="${item?.dueDate || todayISO()}"></div>
        <div class="field"><label>Статус</label><select name="status"><option value="open" ${!item || item?.status === 'open' ? 'selected' : ''}>Открыто</option><option value="received" ${item?.status === 'received' ? 'selected' : ''}>Получено</option><option value="paid" ${item?.status === 'paid' ? 'selected' : ''}>Оплачено</option></select></div>
      </div>
      <div class="field"><label>Комментарий</label><textarea name="notes">${escapeHtml(item?.notes || '')}</textarea></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      data.amount = Number(data.amount || 0);
      if (!data.title.trim() || data.amount <= 0) return false;
      if (item) Object.assign(item, data); else state.obligations.push({ id: uid(), ...data });
      return true;
    });
  }

  function openSettlementModal(item) {
    if (!item) return;
    const isIncome = item.type === 'expected';
    openModal(isIncome ? 'Получить доход' : 'Оплатить обязательство', `
      <div class="insight ${isIncome ? '' : 'warning'}">Будет создана финансовая операция на ${money(item.amount)} и обязательство закроется.</div>
      <div class="field"><label>Счёт</label><select name="accountId">${accountOptions('')}</select></div>
      <div class="field"><label>Дата</label><input name="date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Название операции</label><input name="title" required value="${escapeHtml(item.title)}"></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      const transaction = { id: uid(), title: data.title, type: isIncome ? 'income' : 'expense', amount: Number(item.amount || 0), date: data.date || todayISO(), category: isIncome ? 'other_income' : 'debt_payment', accountId: data.accountId || '', notes: `Закрытие: ${item.title}` };
      state.transactions.push(transaction);
      applyTransactionToAccount(transaction, 1);
      item.status = isIncome ? 'received' : 'paid';
      item.settledTransactionId = transaction.id;
      return true;
    }, { submitText: isIncome ? 'Получено' : 'Оплачено' });
  }

  function openProjectModal(item = null) {
    openModal(item ? 'Изменить проект' : 'Новый проект', `
      <div class="field"><label>Название</label><input name="name" required value="${escapeHtml(item?.name || '')}" placeholder="Клиент или проект"></div>
      <div class="form-grid">
        <div class="field"><label>Тип</label><select name="type"><option value="client" ${!item || item?.type === 'client' ? 'selected' : ''}>Клиент</option><option value="job" ${item?.type === 'job' ? 'selected' : ''}>Основная работа</option><option value="personal" ${item?.type === 'personal' ? 'selected' : ''}>Личный проект</option></select></div>
        <div class="field"><label>Статус</label><select name="status"><option value="active" ${!item || item?.status === 'active' ? 'selected' : ''}>Активен</option><option value="growth" ${item?.status === 'growth' ? 'selected' : ''}>Развитие</option><option value="paused" ${item?.status === 'paused' ? 'selected' : ''}>Пауза</option><option value="completed" ${item?.status === 'completed' ? 'selected' : ''}>Завершён</option></select></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Услуга / направление</label><input name="service" value="${escapeHtml(item?.service || '')}" placeholder="Яндекс.Директ, работа"></div>
        <div class="field"><label>Контакт</label><input name="contact" value="${escapeHtml(item?.contact || '')}" placeholder="Телефон или Telegram"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Доход в месяц, ₽</label><input name="value" type="number" min="0" value="${item?.value ?? 0}"></div>
        <div class="field"><label>Статус оплаты</label><select name="paymentStatus"><option value="not_due" ${!item || item?.paymentStatus === 'not_due' ? 'selected' : ''}>Не наступила</option><option value="waiting" ${item?.paymentStatus === 'waiting' ? 'selected' : ''}>Ожидается</option><option value="paid" ${item?.paymentStatus === 'paid' ? 'selected' : ''}>Оплачено</option><option value="overdue" ${item?.paymentStatus === 'overdue' ? 'selected' : ''}>Просрочено</option></select></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Задолженность, ₽</label><input name="debt" type="number" min="0" value="${item?.debt ?? 0}"></div>
        <div class="field"><label>Дата оплаты</label><input name="paymentDate" type="date" value="${item?.paymentDate || ''}"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Рекламный бюджет, ₽</label><input name="adBudget" type="number" min="0" value="${item?.adBudget ?? 0}"></div>
        <div class="field"><label>Количество лидов</label><input name="leads" type="number" min="0" value="${item?.leads ?? 0}"></div>
      </div>
      <div class="field"><label>Следующий шаг</label><textarea name="next" placeholder="Одно конкретное действие">${escapeHtml(item?.next || '')}</textarea></div>
      <div class="form-grid">
        <div class="field"><label>Следующий контакт</label><input name="nextContact" type="date" value="${item?.nextContact || ''}"></div>
        <div class="field"><label>Дата начала</label><input name="startDate" type="date" value="${item?.startDate || ''}"></div>
      </div>
      <div class="field"><label>Сайт / ссылка</label><input name="site" type="url" value="${escapeHtml(item?.site || '')}" placeholder="https://"></div>
      <div class="field"><label>Результат</label><textarea name="result" placeholder="Что удалось получить">${escapeHtml(item?.result || '')}</textarea></div>
      <div class="field"><label>Заметки</label><textarea name="notes">${escapeHtml(item?.notes || '')}</textarea></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      ['value', 'debt', 'adBudget', 'leads'].forEach(key => { data[key] = Number(data[key] || 0); });
      data.cpl = data.leads > 0 ? Math.round(data.adBudget / data.leads) : 0;
      if (!data.name.trim()) return false;
      if (item) Object.assign(item, data); else state.projects.push({ id: uid(), ...data });
      return true;
    });
  }

  function openGoalModal(item = null) {
    openModal(item ? 'Изменить цель' : 'Новая цель', `
      <div class="field"><label>Цель</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Например, капитал 1 000 000 ₽"></div>
      <div class="form-grid">
        <div class="field"><label>Сейчас</label><input name="current" type="number" min="0" step="any" value="${item?.current ?? 0}"></div>
        <div class="field"><label>Цель</label><input name="target" type="number" min="1" step="any" value="${item?.target ?? 100}"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Единица</label><input name="unit" value="${escapeHtml(item?.unit || '')}" placeholder="₽, клиентов, книг"></div>
        <div class="field"><label>План на месяц</label><input name="monthlyPlan" type="number" min="0" step="any" value="${item?.monthlyPlan ?? 0}"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Срок</label><input name="deadline" type="date" value="${item?.deadline || ''}"></div>
        <div class="field"><label>Автоматически брать из</label><select name="autoSource"><option value="none" ${!item || item?.autoSource === 'none' ? 'selected' : ''}>Обновлять вручную</option><option value="capital" ${item?.autoSource === 'capital' ? 'selected' : ''}>Текущий капитал</option><option value="monthlyIncome" ${item?.autoSource === 'monthlyIncome' ? 'selected' : ''}>Доход за месяц</option></select></div>
      </div>
      <div class="field"><label>Следующее действие</label><textarea name="nextAction" placeholder="Что сделать дальше">${escapeHtml(item?.nextAction || '')}</textarea></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      data.current = Number(data.current || 0);
      data.target = Number(data.target || 1);
      data.monthlyPlan = Number(data.monthlyPlan || 0);
      if (!data.title.trim()) return false;
      if (item) Object.assign(item, data); else state.goals.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
      return true;
    });
  }

  function openHabitModal(item = null) {
    const days = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];
    openModal(item ? 'Изменить привычку' : 'Новая привычка', `
      <div class="field"><label>Название</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Полезное действие"></div>
      <div class="field"><label>Цель выполнений в неделю</label><input name="targetPerWeek" type="number" min="1" max="7" value="${item?.targetPerWeek ?? 5}"></div>
      <div class="field"><label>Дни</label><div class="checkbox-row">${days.map(([value, label]) => `<label class="day-checkbox"><input type="checkbox" name="schedule" value="${value}" ${(item?.schedule || [1, 2, 3, 4, 5]).includes(value) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></div>
    `, form => {
      const formData = new FormData(form);
      const title = String(formData.get('title') || '').trim();
      const schedule = formData.getAll('schedule').map(Number);
      if (!title || !schedule.length) return false;
      const data = { title, targetPerWeek: Number(formData.get('targetPerWeek') || schedule.length), schedule };
      if (item) Object.assign(item, data); else state.habits.push({ id: uid(), ...data, logs: {} });
      return true;
    });
  }

  function openReviewModal(item = null) {
    openModal(item ? 'Изменить недельный разбор' : 'Недельный разбор', `
      <div class="field"><label>Неделя начинается</label><input name="weekStart" type="date" value="${item?.weekStart || localISO(startOfWeek(new Date()))}"></div>
      <div class="form-grid">
        <div class="field"><label>Заработано, ₽</label><input name="income" type="number" min="0" value="${item?.income ?? 0}"></div>
        <div class="field"><label>Отложено, ₽</label><input name="saved" type="number" min="0" value="${item?.saved ?? 0}"></div>
      </div>
      <div class="field"><label>Что сделал и какой результат получил</label><textarea name="wins" placeholder="Не занятость, а фактический результат">${escapeHtml(item?.wins || '')}</textarea></div>
      <div class="field"><label>Что провалил</label><textarea name="failures">${escapeHtml(item?.failures || '')}</textarea></div>
      <div class="field"><label>Куда слил время</label><textarea name="timeLeaks">${escapeHtml(item?.timeLeaks || '')}</textarea></div>
      <div class="field"><label>Главный вывод</label><textarea name="lesson">${escapeHtml(item?.lesson || '')}</textarea></div>
      <div class="field"><label>3 приоритета следующей недели</label><textarea name="priorities">${escapeHtml(item?.priorities || '')}</textarea></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      data.income = Number(data.income || 0);
      data.saved = Number(data.saved || 0);
      if (item) Object.assign(item, data); else state.weeklyReviews.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
      return true;
    });
  }

  async function notifyTaskCreated(task) {
    if (!('Notification' in window) || !state.profile.notificationsEnabled || Notification.permission !== 'granted') return;
    const due = task.due ? `${dateText(task.due)}${task.dueTime ? ` в ${task.dueTime}` : ''}` : 'без срока';
    await showNotification('Задача добавлена', `${task.title} · ${due}`, `task-created-${task.id}`);
  }

  async function showNotification(title, body, tag) {
    try {
      if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, { body, tag, icon: './icon-192.png', badge: './icon-192.png', data: { url: './' } });
    } catch (error) {
      console.error(error);
    }
  }

  function reminderDate(task) {
    if (!task.due || task.reminder === 'none') return null;
    const time = task.dueTime || '09:00';
    const due = new Date(`${task.due}T${time}:00`);
    if (task.reminder === '1h') due.setHours(due.getHours() - 1);
    if (task.reminder === 'day_before') due.setDate(due.getDate() - 1);
    return due;
  }

  async function checkTaskReminders() {
    if (!('Notification' in window) || !state.profile.notificationsEnabled || Notification.permission !== 'granted') return;
    const now = new Date();
    let changed = false;
    for (const task of state.tasks) {
      if (task.status === 'done') continue;
      const reminder = reminderDate(task);
      if (!reminder) continue;
      const key = `${task.due}-${task.dueTime}-${task.reminder}`;
      if (now >= reminder && now <= addDays(reminder, 1) && task.reminderSentFor !== key) {
        await showNotification('Напоминание о задаче', task.title, `task-reminder-${task.id}-${key}`);
        task.reminderSentFor = key;
        changed = true;
      }
    }
    if (changed) saveState();
  }

  function switchScreen(screen) {
    currentScreen = screen;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toast(message) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2200);
  }

  function renderSettings() {
    const notificationSupported = 'Notification' in window && 'serviceWorker' in navigator;
    const notificationStatus = !notificationSupported ? 'Не поддерживаются' : Notification.permission === 'granted' && state.profile.notificationsEnabled ? 'Включены' : Notification.permission === 'denied' ? 'Запрещены в системе' : 'Выключены';
    settingsBody.innerHTML = `
      <form id="profileForm">
        <div class="field"><label>Имя</label><input name="name" value="${escapeHtml(state.profile.name || '')}"></div>
        <div class="form-grid">
          <div class="field"><label>Цель капитала, ₽</label><input name="capitalTarget" type="number" min="0" value="${state.profile.capitalTarget}"></div>
          <div class="field"><label>Цель дохода в месяц, ₽</label><input name="monthlyIncomeTarget" type="number" min="0" value="${state.profile.monthlyIncomeTarget}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Цель подушки, ₽</label><input name="cushionTarget" type="number" min="0" value="${state.profile.cushionTarget}"></div>
          <div class="field"><label>Лимит расходов в месяц, ₽</label><input name="monthlyExpenseLimit" type="number" min="0" value="${state.profile.monthlyExpenseLimit}"></div>
        </div>
        <div class="field"><label>Тема</label><select name="theme"><option value="dark" ${state.profile.theme === 'dark' ? 'selected' : ''}>Тёмная</option><option value="light" ${state.profile.theme === 'light' ? 'selected' : ''}>Светлая</option></select></div>
        <button class="btn primary full" type="submit">Сохранить настройки</button>
      </form>
      <div class="settings-list">
        <button class="settings-row" type="button" id="notificationSettings"><span>Уведомления задач<small>${notificationStatus}</small></span><b>›</b></button>
        <button class="settings-row" type="button" id="exportData"><span>Экспортировать резервную копию<small>${state.profile.lastBackup ? `Последняя: ${longDateText(state.profile.lastBackup)}` : 'Резервной копии ещё нет'}</small></span><b>›</b></button>
        <label class="settings-row file-row"><span>Импортировать резервную копию<small>Восстановить данные из JSON</small></span><b>›</b><input id="importData" type="file" accept="application/json"></label>
        <button class="settings-row" type="button" id="installHelp"><span>Как установить на iPhone<small>Добавить на экран Домой</small></span><b>›</b></button>
        <button class="settings-row danger" type="button" id="resetData"><span>Сбросить все данные<small>Вернуть стартовую версию</small></span><b>›</b></button>
      </div>
      <p class="privacy-note">Данные хранятся локально на устройстве. Пароли, реквизиты карт и документы сюда не добавляй.</p>`;

    $('#profileForm').addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      state.profile = { ...state.profile, name: data.name.trim() || 'Пользователь', capitalTarget: Number(data.capitalTarget || 0), monthlyIncomeTarget: Number(data.monthlyIncomeTarget || 0), cushionTarget: Number(data.cushionTarget || 0), monthlyExpenseLimit: Number(data.monthlyExpenseLimit || 0), theme: data.theme || 'dark' };
      saveState();
      applyTheme();
      render();
      toast('Настройки сохранены');
    });

    $('#notificationSettings').addEventListener('click', requestNotifications);
    $('#installHelp').addEventListener('click', () => alert('Открой приложение в Safari, нажми «Поделиться», затем «На экран Домой» и «Добавить». Уведомления на iPhone доступны для установленного приложения.'));
    $('#exportData').addEventListener('click', exportData);
    $('#importData').addEventListener('change', importData);
    $('#resetData').addEventListener('click', () => {
      if (!confirm('Точно удалить все данные и вернуть стартовую версию?')) return;
      state = freshState();
      saveState();
      settingsModal.close();
      render();
    });
  }

  async function requestNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Этот браузер не поддерживает уведомления. На iPhone сначала установи приложение на экран Домой и открой его оттуда.');
      return;
    }
    const permission = await Notification.requestPermission();
    state.profile.notificationsEnabled = permission === 'granted';
    saveState();
    renderSettings();
    if (permission === 'granted') {
      await showNotification('Alexander OS', 'Уведомления включены. Новые задачи и напоминания будут показываться на устройстве.', 'notifications-enabled');
    } else {
      alert('Разрешение не выдано. Его можно изменить в настройках уведомлений iPhone или браузера.');
    }
  }

  function exportData() {
    state.profile.lastBackup = todayISO();
    saveState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `alexander-os-backup-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    renderSettings();
  }

  async function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      state = migrateState(parsed);
      saveState();
      settingsModal.close();
      render();
      toast('Данные восстановлены');
    } catch (error) {
      console.error(error);
      alert('Файл резервной копии повреждён или имеет неверный формат.');
    }
    event.target.value = '';
  }

  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchScreen(button.dataset.screen)));

  modalForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!modalForm.reportValidity()) return;
    try {
      const ok = modalAction?.(modalForm);
      if (ok === false) return;
      saveState();
      closeModal();
      render();
      toast('Сохранено');
    } catch (error) {
      console.error(error);
      alert('Не удалось сохранить запись. Проверь данные.');
    }
  });

  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });

  $('#settingsButton').addEventListener('click', () => { renderSettings(); settingsModal.showModal(); });
  $('#globalAdd').addEventListener('click', openGlobalAdd);
  $('#closeSettings').addEventListener('click', () => settingsModal.close());
  settingsModal.addEventListener('cancel', event => { event.preventDefault(); settingsModal.close(); });
  settingsModal.addEventListener('click', event => { if (event.target === settingsModal) settingsModal.close(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(() => checkTaskReminders()).catch(console.error));
  }
  setInterval(checkTaskReminders, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTaskReminders(); });

  saveState();
  render();
})();
