(() => {
  'use strict';

  const STORAGE_KEY = 'alexander_os_v1';
  const SECURITY_KEY = 'alexander_os_security_v11';
  const memoryStorage = new Map();
  const safeStorage = {
    getItem(key) {
      try { return window.localStorage.getItem(key); } catch (error) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; }
    },
    setItem(key, value) {
      try { window.localStorage.setItem(key, value); } catch (error) { memoryStorage.set(key, String(value)); }
    },
    removeItem(key) {
      try { window.localStorage.removeItem(key); } catch (error) { memoryStorage.delete(key); }
    }
  };
  function loadSecurity() {
    try {
      const parsed = JSON.parse(safeStorage.getItem(SECURITY_KEY) || '{}');
      return {
        pinEnabled: Boolean(parsed.pinEnabled && parsed.pinHash && parsed.pinSalt),
        pinHash: parsed.pinHash || '',
        pinSalt: parsed.pinSalt || '',
        faceIdEnabled: Boolean(parsed.faceIdEnabled && parsed.faceCredentialId),
        faceCredentialId: parsed.faceCredentialId || '',
        failedAttempts: 0,
        blockedUntil: 0
      };
    } catch (error) {
      return { pinEnabled: false, pinHash: '', pinSalt: '', faceIdEnabled: false, faceCredentialId: '', failedAttempts: 0, blockedUntil: 0 };
    }
  }

  function saveSecurity() {
    safeStorage.setItem(SECURITY_KEY, JSON.stringify({
      pinEnabled: security.pinEnabled,
      pinHash: security.pinHash,
      pinSalt: security.pinSalt,
      faceIdEnabled: security.faceIdEnabled,
      faceCredentialId: security.faceCredentialId
    }));
  }

  const bytesToBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const base64ToBytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const concatBytes = (...parts) => {
    const arrays = parts.map(part => part instanceof Uint8Array ? part : new Uint8Array(part));
    const output = new Uint8Array(arrays.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    arrays.forEach(part => { output.set(part, offset); offset += part.length; });
    return output;
  };

  let security = loadSecurity();
  let lastActivityAt = Date.now();
  let appLocked = false;
  let faceUnlockPending = false;
  let faceAutoTimer = null;

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
    ['salary', 'Зарплата'], ['client', 'Клиенты'], ['project_income', 'Свои проекты'], ['shop', 'Магазин'], ['refund', 'Возврат'], ['gift_income', 'Подарок'], ['other_income', 'Другой доход']
  ];
  const EXPENSE_CATEGORIES = [
    ['groceries', 'Продукты'], ['cafes', 'Кафе и доставка'], ['transport', 'Транспорт'], ['taxi', 'Такси'], ['housing', 'Жильё'], ['subscriptions', 'Подписки'], ['health', 'Здоровье'], ['clothing', 'Одежда'], ['entertainment', 'Развлечения'], ['education', 'Обучение'], ['business', 'Бизнес'], ['gifts', 'Подарки'], ['debt_payment', 'Долги и кредиты'], ['travel', 'Путешествия'], ['other_expense', 'Другое']
  ];
  const ALL_CATEGORIES = new Map([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]);
  const CATEGORY_REDUCIBLE = new Set(['cafes', 'taxi', 'subscriptions', 'clothing', 'entertainment', 'travel', 'other_expense']);
  const BUILTIN_EXPENSE_KEYWORDS = {
    groceries: ['продукт', 'супермаркет', 'магазин', 'пятероч', 'перекрест', 'вкусвилл', 'магнит', 'ашан', 'лента', 'самокат', 'овощ', 'молок', 'хлеб'],
    cafes: ['кафе', 'ресторан', 'кофе', 'обед', 'ужин', 'завтрак', 'доставка еды', 'яндекс еда', 'delivery club', 'бургер', 'пицц', 'суши'],
    transport: ['метро', 'автобус', 'транспорт', 'проезд', 'электрич', 'бензин', 'топливо', 'парковк', 'мойка'],
    taxi: ['такси', 'яндекс go', 'яндекс такси', 'uber', 'ситимобил'],
    housing: ['аренд', 'жкх', 'квартплат', 'коммунал', 'квартир', 'электричеств', 'вода', 'газ', 'ремонт дома'],
    subscriptions: ['подписк', 'интернет', 'мобильная связь', 'связь', 'телефон', 'spotify', 'youtube', 'apple music', 'icloud', 'telegram premium'],
    health: ['аптек', 'врач', 'анализ', 'лекар', 'стоматолог', 'клиник', 'медицин', 'витамин'],
    clothing: ['одежд', 'обув', 'куртк', 'футболк', 'джинс', 'рубашк', 'кроссовк'],
    entertainment: ['кино', 'игр', 'развлеч', 'концерт', 'театр', 'аттракцион'],
    education: ['курс', 'книга', 'обучен', 'skillbox', 'университет', 'лекци'],
    business: ['реклама', 'директ', 'домен', 'хостинг', 'сервис', 'crm', 'подрядчик', 'дизайнер', 'маркетинг'],
    gifts: ['подарок', 'цветы', 'сюрприз'],
    debt_payment: ['кредит', 'займ', 'долг', 'ипотек', 'рассрочк', 'платеж банку', 'погашен'],
    travel: ['билет', 'отель', 'гостиниц', 'поездк', 'путешеств', 'авиабилет', 'тур'],
    other_expense: []
  };
  const EXPENSE_STOP_WORDS = new Set(['расход', 'покупка', 'оплата', 'заплатил', 'заплатила', 'сегодня', 'вчера', 'руб', 'рубль', 'рублей', 'р', 'на', 'за', 'для', 'и', 'в', 'во', 'по', 'от']);

  function freshState() {
    return {
      version: 11.6,
      profile: {
        name: 'Александр',
        capitalTarget: 1000000,
        monthlyIncomeTarget: 200000,
        cushionTarget: 200000,
        monthlyExpenseLimit: 70000,
        theme: 'emerald',
        notificationsEnabled: false,
        lastBackup: null,
        lastChatGPTExport: null,
        progressRange: '6m',
        lastExpenseCategory: 'groceries',
        lastExpenseAccountId: '',
        autoLockMinutes: 1,
        lockOnBackground: true,
        recurringReminderDays: 3,
        lastWeeklyReviewWeek: '',
        lastDiagnosticsAt: null,
        expenseCategoryAliases: {}
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
      workoutProfile: {
        height: 177,
        age: 27,
        weight: 78,
        goal: 'health',
        level: 'beginner',
        days: 3,
        equipment: 'mixed',
        savedAt: null
      },
      weeklyReviews: [],
      noteFolders: [{ id: 'inbox', name: 'Входящие', createdAt: new Date().toISOString() }],
      notes: [],
      history: [],
      trash: [],
      recurringRules: [],
      customExpenseCategories: [],
      workoutLogs: [],
      workoutFavorites: [],
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
      version: 11.6,
      profile: { ...base.profile, ...(raw.profile || {}) },
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      obligations: Array.isArray(raw.obligations) ? raw.obligations : [],
      projects: Array.isArray(raw.projects) ? raw.projects : [],
      goals: Array.isArray(raw.goals) ? raw.goals : [],
      habits: Array.isArray(raw.habits) ? raw.habits : [],
      workoutProfile: { ...base.workoutProfile, ...(raw.workoutProfile || {}) },
      weeklyReviews: Array.isArray(raw.weeklyReviews) ? raw.weeklyReviews : [],
      noteFolders: Array.isArray(raw.noteFolders) && raw.noteFolders.length ? raw.noteFolders : clone(base.noteFolders),
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      history: Array.isArray(raw.history) ? raw.history : [],
      trash: Array.isArray(raw.trash) ? raw.trash : [],
      recurringRules: Array.isArray(raw.recurringRules) ? raw.recurringRules : [],
      customExpenseCategories: Array.isArray(raw.customExpenseCategories) ? raw.customExpenseCategories : [],
      workoutLogs: Array.isArray(raw.workoutLogs) ? raw.workoutLogs : [],
      workoutFavorites: Array.isArray(raw.workoutFavorites) ? raw.workoutFavorites : [],
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : []
    };

    if (!['emerald', 'graphite', 'light', 'future', 'neonlime'].includes(result.profile.theme)) result.profile.theme = result.profile.theme === 'light' ? 'light' : 'emerald';

    result.tasks = result.tasks.map(task => ({
      projectId: '', project: '', priority: 'medium', due: '', dueTime: '', status: task.done ? 'done' : 'todo', notes: '', repeat: 'none', reminder: 'none', createdAt: new Date().toISOString(), completedAt: null,
      ...task,
      status: task.status || (task.done ? 'done' : 'todo')
    }));
    result.accounts = result.accounts.map(account => ({ type: 'card', balance: 0, ...account, balance: Number(account.balance || 0) }));
    result.transactions = result.transactions.map(tx => ({ notes: '', accountId: '', category: tx.type === 'income' ? 'other_income' : 'other_expense', necessity: tx.type === 'expense' ? 'unknown' : '', scope: 'personal', projectId: '', createdAt: new Date().toISOString(), ...tx, amount: Number(tx.amount || 0) }));
    result.obligations = result.obligations.map(item => ({ status: 'open', type: 'payment', notes: '', dueDate: '', ...item, amount: Number(item.amount || 0) }));
    result.projects = result.projects.map(project => ({ type: 'client', value: 0, status: 'active', paymentStatus: 'not_due', paymentDate: '', next: '', notes: '', startDate: '', ...project, value: Number(project.value || 0) }));
    result.noteFolders = result.noteFolders.map(folder => ({ id: folder.id || uid(), name: folder.name || 'Без названия', createdAt: folder.createdAt || new Date().toISOString() }));
    result.notes = result.notes.map(note => ({ id: note.id || uid(), folderId: note.folderId || result.noteFolders[0]?.id || 'inbox', title: note.title || 'Без названия', body: note.body || '', tags: note.tags || '', projectId: note.projectId || '', createdAt: note.createdAt || new Date().toISOString(), updatedAt: note.updatedAt || note.createdAt || new Date().toISOString() }));
    result.goals = result.goals.map(goal => ({ unit: '', monthlyPlan: 0, nextAction: '', autoSource: 'none', createdAt: new Date(new Date().getFullYear(), 0, 1).toISOString(), ...goal, current: Number(goal.current || 0), target: Number(goal.target || 1) }));
    result.habits = result.habits.map(habit => ({ logs: {}, targetPerWeek: 7, schedule: [1, 2, 3, 4, 5, 6, 0], ...habit }));
    result.history = result.history.slice(0, 12).map(entry => ({ id: entry.id || uid(), label: entry.label || 'Изменение данных', createdAt: entry.createdAt || new Date().toISOString(), snapshot: entry.snapshot || {} }));
    result.trash = result.trash.map(entry => ({ id: entry.id || uid(), collection: entry.collection || '', label: entry.label || 'Удалённая запись', deletedAt: entry.deletedAt || new Date().toISOString(), item: entry.item || {}, related: Array.isArray(entry.related) ? entry.related : [] }));
    result.recurringRules = result.recurringRules.map(rule => ({ id: rule.id || uid(), title: rule.title || 'Регулярная операция', type: rule.type === 'income' ? 'income' : 'expense', amount: Number(rule.amount || 0), category: rule.category || (rule.type === 'income' ? 'salary' : 'subscriptions'), accountId: rule.accountId || '', day: Math.max(1, Math.min(31, Number(rule.day || 1))), enabled: rule.enabled !== false, createdAt: rule.createdAt || new Date().toISOString() }));
    result.customExpenseCategories = result.customExpenseCategories.map(category => ({
      id: String(category.id || `custom_${uid()}`).startsWith('custom_') ? String(category.id || `custom_${uid()}`) : `custom_${category.id || uid()}`,
      name: String(category.name || 'Своя категория').trim().slice(0, 32),
      keywords: Array.isArray(category.keywords) ? category.keywords.map(value => String(value).trim().toLowerCase()).filter(Boolean).slice(0, 30) : [],
      createdAt: category.createdAt || new Date().toISOString()
    })).filter((category, index, list) => category.name && list.findIndex(item => item.id === category.id) === index);
    result.profile.expenseCategoryAliases = result.profile.expenseCategoryAliases && typeof result.profile.expenseCategoryAliases === 'object' ? result.profile.expenseCategoryAliases : {};
    result.workoutLogs = result.workoutLogs.map(log => ({ id: log.id || uid(), date: log.date || todayISO(), type: log.type || 'Силовая тренировка', duration: Number(log.duration || 45), effort: Number(log.effort || 3), notes: log.notes || '', createdAt: log.createdAt || new Date().toISOString() }));
    result.workoutFavorites = [...new Set(result.workoutFavorites.map(String))];
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
      const saved = safeStorage.getItem(STORAGE_KEY);
      return saved ? migrateState(JSON.parse(saved)) : freshState();
    } catch (error) {
      console.error(error);
      return freshState();
    }
  }

  let state = loadState();
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  let currentScreen = 'dashboard';
  let financeTab = 'overview';
  let taskFilter = 'today';
  let taskSearch = '';
  let projectFilter = 'active';
  let growthRange = 'month';
  let financeCompareCurrent = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`;
  let financeCompareBase = `${new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getFullYear()}-${pad(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getMonth() + 1)}`;
  let financeSelectedMonth = financeCompareCurrent;
  let modalAction = null;

  const app = $('#app');
  const modal = $('#modal');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const modalForm = $('#modalForm');
  const modalActions = $('#modalActions');
  const modalSubmit = $('#modalSubmit');
  const lockScreen = $('#lockScreen');
  const lockHint = $('#lockHint');
  const lockError = $('#lockError');
  const faceStatus = $('#faceStatus');
  const unlockFaceIdButton = $('#unlockFaceId');
  const unlockPinForm = $('#unlockPinForm');
  const unlockPinInput = $('#unlockPin');


  function stateForHistory(source) {
    const snapshot = clone(source || {});
    delete snapshot.history;
    return snapshot;
  }

  function saveState(options = {}) {
    state.version = 11.6;
    const previousRaw = safeStorage.getItem(STORAGE_KEY);
    if (options.history !== false && previousRaw) {
      try {
        const previous = JSON.parse(previousRaw);
        const before = JSON.stringify(stateForHistory(previous));
        const after = JSON.stringify(stateForHistory(state));
        if (before !== after) {
          state.history ||= [];
          state.history.unshift({
            id: uid(),
            label: options.label || 'Изменение данных',
            createdAt: new Date().toISOString(),
            snapshot: stateForHistory(previous)
          });
          state.history = state.history.slice(0, 12);
        }
      } catch (error) {
        console.warn('Не удалось сохранить историю изменения', error);
      }
    }
    if (options.snapshot !== false) recordSnapshot();
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function applyTheme() {
    if (state.profile.theme === 'future') state.profile.theme = 'emerald';
    document.documentElement.dataset.theme = state.profile.theme || 'emerald';
    const themeColors = { emerald: '#03130b', graphite: '#090d12', light: '#f3f6f4', neonlime: '#121416' };
    $('meta[name="theme-color"]')?.setAttribute('content', themeColors[state.profile.theme] || themeColors.emerald);
  }

  function collectionTitle(collection) {
    return ({
      tasks: 'Задача', transactions: 'Операция', obligations: 'Платёж', projects: 'Проект',
      goals: 'Цель', habits: 'Привычка', weeklyReviews: 'Недельный разбор', notes: 'Заметка',
      workoutLogs: 'Тренировка', recurringRules: 'Регулярная операция'
    })[collection] || 'Запись';
  }

  function itemTitle(collection, item) {
    return item?.title || item?.name || item?.type || collectionTitle(collection);
  }

  function pushToTrash(collection, item, related = []) {
    state.trash ||= [];
    state.trash.unshift({
      id: uid(), collection, label: itemTitle(collection, item), deletedAt: new Date().toISOString(),
      item: clone(item), related: clone(related)
    });
    state.trash = state.trash.slice(0, 100);
  }

  function restoreTrashEntry(id) {
    const entry = state.trash.find(item => item.id === id);
    if (!entry) return;
    const collection = entry.collection;
    state[collection] ||= [];
    const added = !state[collection].some(item => item.id === entry.item.id);
    if (added) state[collection].push(clone(entry.item));
    if (collection === 'transactions' && added) applyTransactionToAccount(entry.item, 1);
    if (collection === 'projects' && entry.related?.length) {
      entry.related.forEach(transaction => {
        if (!state.transactions.some(item => item.id === transaction.id)) {
          state.transactions.push(clone(transaction));
          applyTransactionToAccount(transaction, 1);
        }
      });
    }
    state.trash = state.trash.filter(item => item.id !== id);
    saveState({ label: `Восстановлено: ${entry.label}` });
    render();
    toast('Запись восстановлена');
  }

  function deleteTrashEntry(id) {
    const entry = state.trash.find(item => item.id === id);
    if (!entry || !confirm(`Удалить «${entry.label}» окончательно?`)) return;
    state.trash = state.trash.filter(item => item.id !== id);
    saveState({ label: `Окончательно удалено: ${entry.label}` });
    openTrashManager();
  }

  function openTrashManager() {
    const rows = (state.trash || []).slice().sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
    openModal('Корзина', `
      <div class="utility-intro"><b>Удалённые записи хранятся локально</b><p>Их можно вернуть вместе со связанными данными. Окончательное удаление отменить нельзя.</p></div>
      <div class="utility-list">${rows.length ? rows.map(entry => `
        <div class="utility-row">
          <div><b>${escapeHtml(entry.label)}</b><small>${collectionTitle(entry.collection)} · ${longDateText((entry.deletedAt || '').slice(0,10))}</small></div>
          <div class="utility-actions"><button type="button" class="mini-action restore-trash" data-id="${entry.id}">Вернуть</button><button type="button" class="mini-action danger delete-trash" data-id="${entry.id}">Удалить</button></div>
        </div>`).join('') : empty('Корзина пуста.')}</div>
    `, null, { hideActions: true });
    $$('.restore-trash', modalBody).forEach(button => button.addEventListener('click', () => restoreTrashEntry(button.dataset.id)));
    $$('.delete-trash', modalBody).forEach(button => button.addEventListener('click', () => deleteTrashEntry(button.dataset.id)));
  }

  function undoLastChange() {
    const entry = state.history?.[0];
    if (!entry?.snapshot) {
      toast('История изменений пуста');
      return;
    }
    if (!confirm(`Вернуть состояние до изменения «${entry.label}»?`)) return;
    const remaining = state.history.slice(1);
    const restored = normalizeState(clone(entry.snapshot));
    restored.history = remaining;
    state = restored;
    saveState({ history: false, snapshot: false });
    render();
    toast('Последнее изменение отменено');
  }

  function openHistoryManager() {
    const rows = state.history || [];
    openModal('История изменений', `
      <div class="utility-intro"><b>Последние ${rows.length} изменений</b><p>История хранится только на этом устройстве и ограничена 12 состояниями.</p></div>
      ${rows.length ? `<button class="btn primary full" type="button" id="undoLatestChange">Отменить последнее изменение</button>` : ''}
      <div class="utility-list">${rows.length ? rows.map((entry, index) => `<div class="utility-row"><div><b>${escapeHtml(entry.label)}</b><small>${new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(entry.createdAt))}</small></div><span class="utility-index">${index + 1}</span></div>`).join('') : empty('Изменений для восстановления пока нет.')}</div>
    `, null, { hideActions: true });
    $('#undoLatestChange')?.addEventListener('click', () => { closeModal(); undoLastChange(); });
  }

  function transactionFingerprint(tx) {
    return [tx.type, tx.date, Math.round(Number(tx.amount || 0) * 100), tx.category, String(tx.title || '').trim().toLowerCase(), tx.accountId || ''].join('|');
  }

  function findDuplicateTransaction(candidate, excludeId = '') {
    const fingerprint = transactionFingerprint(candidate);
    return state.transactions.find(item => item.id !== excludeId && transactionFingerprint(item) === fingerprint);
  }

  function confirmTransactionNotDuplicate(candidate, excludeId = '') {
    const duplicate = findDuplicateTransaction(candidate, excludeId);
    if (!duplicate) return true;
    return confirm(`Похожая операция уже существует: «${duplicate.title}», ${money(duplicate.amount)}, ${longDateText(duplicate.date)}. Добавить ещё одну?`);
  }

  function smartExpenseCategory(textValue) {
    const text = normalizeExpenseText(textValue);
    if (!text) return state.profile.lastExpenseCategory || 'other_expense';
    let best = { id: state.profile.lastExpenseCategory || 'other_expense', score: 0, longest: 0 };
    expenseCategoryList().forEach(([categoryId]) => {
      let score = 0;
      let longest = 0;
      const customPriority = categoryId.startsWith('custom_') ? 12 : 0;
      expenseCategoryKeywords(categoryId).forEach(keyword => {
        if (!keyword) return;
        if (text === keyword) {
          score += 100 + keyword.length + customPriority;
          longest = Math.max(longest, keyword.length);
          return;
        }
        if (text.includes(keyword)) {
          score += 20 + Math.min(keyword.length, 18) + customPriority;
          longest = Math.max(longest, keyword.length);
          return;
        }
        const keywordTokens = keyword.split(' ').filter(Boolean);
        if (keywordTokens.length > 1 && keywordTokens.every(token => text.includes(token))) {
          score += 12 + keywordTokens.length * 3 + customPriority;
          longest = Math.max(longest, keyword.length);
        }
      });
      if (score > best.score || (score === best.score && longest > best.longest)) best = { id: categoryId, score, longest };
    });
    return best.score > 0 ? best.id : (state.profile.lastExpenseCategory || 'other_expense');
  }

  function parseSmartAmount(rawValue) {
    const raw = normalizeExpenseText(rawValue).replace(/ /g, ' ');
    const regex = /(\d{1,3}(?:\s\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(тыс(?:\.|яч[аи]?)?|к|k|₽|р(?:\.|уб(?:\.|ля|лей)?)?)?/giu;
    const candidates = [];
    let match;
    while ((match = regex.exec(raw))) {
      const compact = match[1].replace(/\s/g, '').replace(',', '.');
      let value = Number(compact);
      const suffix = String(match[2] || '').toLowerCase();
      if (!Number.isFinite(value)) continue;
      if (/^(тыс|к|k)/i.test(suffix)) value *= 1000;
      const yearLike = Number.isInteger(value) && value >= 2000 && value <= 2100 && !suffix;
      const score = (suffix ? 5 : 0) + (value >= 10 ? 2 : 0) + (value >= 100 ? 1 : 0) - (yearLike ? 4 : 0);
      candidates.push({ value, score, index: match.index, raw: match[0] });
    }
    if (!candidates.length) return { amount: 0, matched: '' };
    candidates.sort((a, b) => b.score - a.score || b.value - a.value || a.index - b.index);
    return { amount: Math.round(candidates[0].value * 100) / 100, matched: candidates[0].raw };
  }

  function parseSmartExpense(value) {
    const raw = String(value || '').trim();
    const amountResult = parseSmartAmount(raw);
    const escaped = amountResult.matched.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const title = raw
      .replace(escaped ? new RegExp(escaped, 'i') : /$^/, ' ')
      .replace(/\b(руб(?:лей|ля)?|р|₽)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cleanedTitle = title || 'Расход';
    return { amount: amountResult.amount, title: cleanedTitle, category: smartExpenseCategory(cleanedTitle) };
  }

  function createCustomExpenseCategory(nameValue, keywordsValue = '') {
    const name = String(nameValue || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    if (name.length < 2) throw new Error('Название категории должно содержать минимум 2 символа.');
    const duplicate = expenseCategoryList().find(([, label]) => normalizeExpenseText(label) === normalizeExpenseText(name));
    if (duplicate) return duplicate[0];
    const keywords = String(keywordsValue || '')
      .split(/[,;\n]/)
      .map(value => normalizeExpenseText(value))
      .filter(Boolean)
      .slice(0, 30);
    const category = { id: `custom_${uid()}`, name, keywords: [...new Set([name, ...keywords])], createdAt: new Date().toISOString() };
    state.customExpenseCategories.push(category);
    saveState();
    return category.id;
  }

  function deleteCustomExpenseCategory(categoryId) {
    const category = customExpenseCategoryById(categoryId);
    if (!category) return false;
    const usage = state.transactions.filter(transaction => transaction.category === categoryId).length + state.recurringRules.filter(rule => rule.category === categoryId).length;
    if (!confirm(usage ? `Категория «${category.name}» используется в ${usage} записях. Перенести их в «Другое» и удалить категорию?` : `Удалить категорию «${category.name}»?`)) return false;
    state.transactions.forEach(transaction => { if (transaction.category === categoryId) transaction.category = 'other_expense'; });
    state.recurringRules.forEach(rule => { if (rule.category === categoryId) rule.category = 'other_expense'; });
    state.obligations.forEach(item => { if (item.category === categoryId) item.category = 'other_expense'; });
    state.customExpenseCategories = state.customExpenseCategories.filter(item => item.id !== categoryId);
    if (state.profile.lastExpenseCategory === categoryId) state.profile.lastExpenseCategory = 'other_expense';
    delete state.profile.expenseCategoryAliases?.[categoryId];
    saveState();
    return true;
  }

  function recurringDueDate(rule, key = monthKey(new Date())) {
    const { start, end } = monthRange(key);
    const day = Math.min(end.getDate(), Math.max(1, Number(rule.day || 1)));
    return localISO(new Date(start.getFullYear(), start.getMonth(), day));
  }

  function ensureRecurringObligations() {
    const key = monthKey(new Date());
    let created = false;
    (state.recurringRules || []).filter(rule => rule.enabled !== false && Number(rule.amount || 0) > 0).forEach(rule => {
      const exists = state.obligations.some(item => item.recurringRuleId === rule.id && item.recurringMonth === key);
      if (exists) return;
      state.obligations.push({
        id: uid(), title: rule.title, type: rule.type === 'income' ? 'expected' : 'payment', amount: Number(rule.amount),
        dueDate: recurringDueDate(rule, key), status: 'open', notes: 'Создано по регулярному правилу',
        recurringRuleId: rule.id, recurringMonth: key, accountId: rule.accountId || '', category: rule.category || ''
      });
      created = true;
    });
    if (created) saveState({ history: false, snapshot: false });
  }

  function recurringRuleItem(rule) {
    return `<div class="utility-row"><div><b>${escapeHtml(rule.title)}</b><small>${rule.type === 'income' ? 'Доход' : 'Расход'} · ${money(rule.amount)} · каждый месяц ${rule.day}-го числа</small></div><div class="utility-actions"><button type="button" class="mini-action edit-rule" data-id="${rule.id}">Изменить</button><button type="button" class="mini-action danger delete-rule" data-id="${rule.id}">Удалить</button></div></div>`;
  }

  function openRecurringRules() {
    ensureRecurringObligations();
    openModal('Регулярные операции', `
      <div class="utility-intro"><b>План без смешивания с фактом</b><p>Каждое правило создаёт ожидаемый платёж или поступление. В доходы и расходы сумма попадёт только после подтверждения.</p></div>
      <button class="btn primary full" type="button" id="addRecurringRule">+ Добавить правило</button>
      <div class="utility-list">${state.recurringRules.length ? state.recurringRules.map(recurringRuleItem).join('') : empty('Добавьте зарплату, подписку, кредит или оплату клиента.')}</div>
    `, null, { hideActions: true });
    $('#addRecurringRule')?.addEventListener('click', () => openRecurringRuleModal());
    $$('.edit-rule', modalBody).forEach(button => button.addEventListener('click', () => openRecurringRuleModal(state.recurringRules.find(item => item.id === button.dataset.id))));
    $$('.delete-rule', modalBody).forEach(button => button.addEventListener('click', () => {
      const rule = state.recurringRules.find(item => item.id === button.dataset.id);
      if (!rule || !confirm(`Удалить правило «${rule.title}»? Уже созданные платежи останутся.`)) return;
      pushToTrash('recurringRules', rule);
      state.recurringRules = state.recurringRules.filter(item => item.id !== rule.id);
      saveState({ label: `Удалено правило: ${rule.title}` });
      openRecurringRules();
    }));
  }

  function openRecurringRuleModal(item = null) {
    openModal(item ? 'Изменить правило' : 'Новое регулярное правило', `
      <div class="field"><label>Название</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Например, зарплата или интернет"></div>
      <div class="form-grid"><div class="field"><label>Тип</label><select name="type" id="recurringType"><option value="expense" ${item?.type !== 'income' ? 'selected' : ''}>Расход</option><option value="income" ${item?.type === 'income' ? 'selected' : ''}>Доход</option></select></div><div class="field"><label>Сумма, ₽</label><input name="amount" type="number" min="1" step="0.01" required value="${item?.amount ?? ''}"></div></div>
      <div class="form-grid"><div class="field"><label>День месяца</label><input name="day" type="number" min="1" max="31" value="${item?.day ?? 1}"></div><div class="field"><label>Счёт</label><select name="accountId">${accountOptions(item?.accountId || '')}</select></div></div>
      <div class="field"><label>Категория</label><select name="category" id="recurringCategory">${categoryOptions(item?.type === 'income' ? 'income' : 'expense', item?.category || (item?.type === 'income' ? 'salary' : 'subscriptions'))}</select></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      data.amount = Number(data.amount || 0); data.day = Math.max(1, Math.min(31, Number(data.day || 1))); data.enabled = true;
      if (!data.title.trim() || data.amount <= 0) return false;
      if (item) Object.assign(item, data); else state.recurringRules.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
      setTimeout(ensureRecurringObligations, 0);
      return true;
    });
    $('#recurringType')?.addEventListener('change', event => { $('#recurringCategory').innerHTML = categoryOptions(event.target.value, event.target.value === 'income' ? 'salary' : 'subscriptions'); });
  }

  function calendarDayData(iso) {
    return {
      income: sum(state.transactions.filter(tx => tx.type === 'income' && tx.date === iso).map(tx => tx.amount)),
      expense: sum(state.transactions.filter(tx => tx.type === 'expense' && tx.date === iso).map(tx => tx.amount)),
      obligations: state.obligations.filter(item => item.status === 'open' && item.dueDate === iso)
    };
  }

  function financialCalendarMarkup(key) {
    const { start, end } = monthRange(key);
    const firstOffset = (start.getDay() || 7) - 1;
    const cells = [];
    for (let i = 0; i < firstOffset; i += 1) cells.push('<div class="calendar-cell empty"></div>');
    for (let day = 1; day <= end.getDate(); day += 1) {
      const iso = localISO(new Date(start.getFullYear(), start.getMonth(), day));
      const data = calendarDayData(iso);
      cells.push(`<button type="button" class="calendar-cell ${iso === todayISO() ? 'today' : ''}" data-calendar-day="${iso}"><b>${day}</b><div>${data.income ? `<span class="cal-income">+${shortMoney(data.income)}</span>` : ''}${data.expense ? `<span class="cal-expense">−${shortMoney(data.expense)}</span>` : ''}${data.obligations.length ? `<i>${data.obligations.length}</i>` : ''}</div></button>`);
    }
    return `<div class="calendar-weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day => `<span>${day}</span>`).join('')}</div><div class="finance-calendar">${cells.join('')}</div><div id="calendarDayDetails" class="calendar-day-details"><span>Нажми на день, чтобы увидеть детали.</span></div>`;
  }

  function openFinancialCalendar(key = financeSelectedMonth) {
    openModal('Финансовый календарь', `
      <div class="field compact-month-field"><label>Месяц</label><input id="calendarMonth" type="month" value="${key}"></div>
      <div id="calendarBody">${financialCalendarMarkup(key)}</div>
      <div class="calendar-legend"><span class="cal-income">Доход</span><span class="cal-expense">Расход</span><span class="cal-obligation">Платёж</span></div>
    `, null, { hideActions: true });
    const bind = () => {
      $$('.calendar-cell[data-calendar-day]', modalBody).forEach(button => button.addEventListener('click', () => {
        const iso = button.dataset.calendarDay;
        const data = calendarDayData(iso);
        const operations = state.transactions.filter(tx => tx.date === iso);
        const details = $('#calendarDayDetails');
        details.innerHTML = `<h3>${longDateText(iso)}</h3><div class="calendar-summary"><span>Доход <b class="positive">${money(data.income)}</b></span><span>Расход <b class="negative">${money(data.expense)}</b></span></div>${operations.length ? operations.map(tx => `<div class="calendar-op"><span>${escapeHtml(tx.title)}</span><b class="${tx.type === 'income' ? 'positive' : 'negative'}">${tx.type === 'income' ? '+' : '−'}${money(tx.amount)}</b></div>`).join('') : '<p>Операций нет.</p>'}${data.obligations.map(item => `<div class="calendar-op planned"><span>${escapeHtml(item.title)}</span><b>${money(item.amount)}</b></div>`).join('')}`;
      }));
    };
    bind();
    $('#calendarMonth')?.addEventListener('change', event => { const body = $('#calendarBody'); body.innerHTML = financialCalendarMarkup(event.target.value); bind(); });
  }

  function storageSizeBytes() {
    return new Blob([safeStorage.getItem(STORAGE_KEY) || '']).size;
  }

  function buildDiagnostics() {
    const checks = [];
    const ids = [];
    ['tasks','accounts','transactions','obligations','projects','goals','habits','notes','recurringRules','customExpenseCategories','workoutLogs'].forEach(collection => (state[collection] || []).forEach(item => ids.push(`${collection}:${item.id}`)));
    const idValues = ids.map(value => value.split(':').slice(1).join(':'));
    const duplicateIds = idValues.filter((id, index) => idValues.indexOf(id) !== index);
    const duplicateTransactions = [];
    const seen = new Map();
    state.transactions.forEach(tx => { const fp = transactionFingerprint(tx); if (seen.has(fp)) duplicateTransactions.push(tx); else seen.set(fp, tx); });
    const accountIds = new Set(state.accounts.map(item => item.id));
    const orphanTransactions = state.transactions.filter(tx => !accountIds.has(tx.accountId));
    const invalidTransactions = state.transactions.filter(tx => !Number.isFinite(Number(tx.amount)) || Number(tx.amount) <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date || ''));
    const invalidGoals = state.goals.filter(goal => Number(goal.target || 0) <= 0);
    const staleBackup = !state.profile.lastBackup || (Date.now() - new Date(state.profile.lastBackup).getTime()) > 14 * 86400000;
    const add = (name, ok, detail, severity = 'warning') => checks.push({ name, ok, detail, severity });
    add('Уникальные идентификаторы', !duplicateIds.length, duplicateIds.length ? `Повторов: ${duplicateIds.length}` : 'Дубликатов ID нет', 'danger');
    add('Связи операций со счетами', !orphanTransactions.length, orphanTransactions.length ? `Без счёта: ${orphanTransactions.length}` : 'Все операции связаны со счетами', 'danger');
    add('Корректность операций', !invalidTransactions.length, invalidTransactions.length ? `Ошибок: ${invalidTransactions.length}` : 'Суммы и даты корректны', 'danger');
    add('Защита от дублей', !duplicateTransactions.length, duplicateTransactions.length ? `Похожих операций: ${duplicateTransactions.length}` : 'Повторяющихся операций не найдено');
    add('Цели', !invalidGoals.length, invalidGoals.length ? `Целей с ошибкой: ${invalidGoals.length}` : 'Все цели имеют корректную сумму');
    add('Резервная копия', !staleBackup, staleBackup ? 'Копия старше 14 дней или ещё не создавалась' : `Последняя: ${longDateText(state.profile.lastBackup)}`);
    add('Размер локальной базы', storageSizeBytes() < 4_000_000, `${numberText(storageSizeBytes() / 1024)} КБ`, storageSizeBytes() < 4_000_000 ? 'ok' : 'danger');
    return { checks, duplicateTransactions, orphanTransactions, invalidTransactions, score: Math.round(checks.filter(check => check.ok).length / checks.length * 100) };
  }

  function runSelfTests() {
    const tests = [];
    const test = (name, fn) => { try { const result = fn(); tests.push({ name, ok: result !== false, detail: result === false ? 'Не пройден' : 'Пройден' }); } catch (error) { tests.push({ name, ok: false, detail: error.message }); } };
    test('Структура состояния', () => ['tasks','accounts','transactions','projects','goals','habits','history','trash','recurringRules','customExpenseCategories','workoutLogs'].every(key => Array.isArray(state[key])));
    test('Основной счёт существует', () => Boolean(getDefaultAccount()?.id));
    test('Финансовая аналитика', () => Number.isFinite(getFinanceAnalytics().capital));
    test('Экспортируемая копия', () => validateBackupData(extractBackupData(createBackupPayload(state))));
    test('Парсер быстрого расхода', () => { const first = parseSmartExpense('550 обед'); const second = parseSmartExpense('Кредит 1 300'); const third = parseSmartExpense('кофе 1,5к'); return first.amount === 550 && first.category === 'cafes' && second.amount === 1300 && second.category === 'debt_payment' && third.amount === 1500 && third.category === 'cafes'; });
    test('Календарный диапазон', () => monthRange(monthKey(new Date())).end >= monthRange(monthKey(new Date())).start);
    test('План тренировок', () => workoutPlan(state.workoutProfile).length >= 2);
    test('Темы интерфейса', () => ['emerald','graphite','light','future','neonlime'].includes(state.profile.theme));
    test('Уникальность счетов', () => new Set(state.accounts.map(item => item.id)).size === state.accounts.length);
    test('Категории расходов', () => new Set(expenseCategoryList().map(([id]) => id)).size === expenseCategoryList().length);
    test('Безопасное восстановление', () => Boolean(normalizeState(clone(state)).accounts.length));
    return tests;
  }

  function openDiagnostics() {
    const diagnostics = buildDiagnostics();
    const tests = runSelfTests();
    state.profile.lastDiagnosticsAt = new Date().toISOString();
    saveState({ history: false, snapshot: false });
    openModal('Диагностика системы', `
      <div class="diagnostic-score"><strong>${diagnostics.score}%</strong><span>состояние базы</span></div>
      <div class="diagnostic-list">${diagnostics.checks.map(check => `<div class="diagnostic-row ${check.ok ? 'ok' : check.severity}"><i>${check.ok ? '✓' : '!'}</i><span><b>${escapeHtml(check.name)}</b><small>${escapeHtml(check.detail)}</small></span></div>`).join('')}</div>
      <details class="card self-tests"><summary>Автоматические тесты <b>${tests.filter(test => test.ok).length}/${tests.length}</b></summary>${tests.map(test => `<div class="test-row ${test.ok ? 'ok' : 'bad'}"><span>${test.ok ? '✓' : '×'} ${escapeHtml(test.name)}</span><small>${escapeHtml(test.detail)}</small></div>`).join('')}</details>
      ${diagnostics.duplicateTransactions.length ? `<button type="button" class="btn secondary full" id="reviewDuplicates">Показать возможные дубли</button>` : ''}
    `, null, { hideActions: true });
    $('#reviewDuplicates')?.addEventListener('click', () => {
      modalBody.innerHTML = `<div class="utility-list">${diagnostics.duplicateTransactions.map(transactionItem).join('')}</div>`;
      $$('.delete-transaction', modalBody).forEach(button => button.addEventListener('click', () => deleteTransaction(button.dataset.id)));
    });
  }

  function workoutLogItem(log) {
    return `<div class="utility-row"><div><b>${escapeHtml(log.type)}</b><small>${longDateText(log.date)} · ${log.duration} мин · нагрузка ${log.effort}/5${log.notes ? ` · ${escapeHtml(log.notes)}` : ''}</small></div><button type="button" class="mini-action danger delete-workout-log" data-id="${log.id}">Удалить</button></div>`;
  }

  function openWorkoutJournal() {
    const logs = state.workoutLogs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    openModal('Журнал тренировок', `
      <div class="workout-log-form">
        <div class="form-grid"><div class="field"><label>Дата</label><input id="workoutLogDate" type="date" value="${todayISO()}"></div><div class="field"><label>Продолжительность</label><input id="workoutLogDuration" type="number" min="5" max="240" value="45"></div></div>
        <div class="form-grid"><div class="field"><label>Тип</label><select id="workoutLogType"><option>Силовая тренировка</option><option>Кардио</option><option>Мобильность</option><option>Восстановление</option><option>Другое</option></select></div><div class="field"><label>Нагрузка 1–5</label><input id="workoutLogEffort" type="number" min="1" max="5" value="3"></div></div>
        <div class="field"><label>Комментарий</label><input id="workoutLogNotes" placeholder="Что получилось, самочувствие"></div>
        <button type="button" class="btn primary full" id="saveWorkoutLog">Записать тренировку</button>
      </div>
      <div class="utility-list workout-log-list">${logs.length ? logs.map(workoutLogItem).join('') : empty('Журнал пока пуст. Запишите первую тренировку.')}</div>
    `, null, { hideActions: true });
    $('#saveWorkoutLog')?.addEventListener('click', () => {
      const log = { id: uid(), date: $('#workoutLogDate').value || todayISO(), duration: Math.max(5, Number($('#workoutLogDuration').value || 45)), type: $('#workoutLogType').value, effort: Math.max(1, Math.min(5, Number($('#workoutLogEffort').value || 3))), notes: $('#workoutLogNotes').value.trim(), createdAt: new Date().toISOString() };
      state.workoutLogs.push(log);
      const habit = state.habits.find(item => /спорт|трен/i.test(item.title));
      if (habit) { habit.logs ||= {}; habit.logs[log.date] = true; }
      saveState({ label: `Записана тренировка: ${log.type}` });
      openWorkoutJournal();
    });
    $$('.delete-workout-log', modalBody).forEach(button => button.addEventListener('click', () => removeItem('workoutLogs', button.dataset.id, { reopen: 'workoutJournal' })));
  }

  function weeklyReviewDraft() {
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    const income = sumTransactions('income', weekStart, weekEnd);
    const expense = sumTransactions('expense', weekStart, weekEnd);
    const taskStats = taskWeekStats(new Date(), false);
    const completedTasks = state.tasks.filter(task => task.completedAt && new Date(task.completedAt) >= weekStart && new Date(task.completedAt) <= weekEnd).slice(0, 5);
    const activeProjects = state.projects.filter(project => ['active','growth'].includes(project.status));
    return {
      weekStart: localISO(weekStart), income, saved: Math.max(0, income - expense),
      wins: completedTasks.length ? `Выполнено задач: ${taskStats.done}. Ключевые: ${completedTasks.map(task => task.title).join('; ')}.` : `Выполнено задач: ${taskStats.done}.`,
      failures: taskStats.total > taskStats.done ? `Не завершено задач: ${taskStats.total - taskStats.done}.` : 'Критичных незавершённых задач нет.',
      timeLeaks: 'Заполни вручную: где было больше всего отвлечений или лишних действий?',
      lesson: `Доход недели ${money(income)}, расходы ${money(expense)}. Активных проектов: ${activeProjects.length}.`,
      priorities: activeProjects.slice(0,3).map(project => project.next || `Определить следующий шаг по проекту «${project.name}»`).join('\n') || 'Определить 3 главных результата следующей недели.'
    };
  }

  function openAutoWeeklyReview() {
    openReviewModal(null, weeklyReviewDraft());
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

  function getFinanceAnalytics(selectedMonthKey = null) {
    const now = new Date();
    const selectedKey = selectedMonthKey || monthKey(now);
    const { start: monthStart, end: monthEndRange } = monthRange(selectedKey);
    const isCurrentMonth = selectedKey === monthKey(now);
    const currentEnd = isCurrentMonth ? endOfToday(now) : monthEndRange;
    const weekStart = startOfWeek(now);
    const weekDayIndex = (now.getDay() || 7) - 1;
    const previousWeekStart = addDays(weekStart, -7);
    const previousWeekEnd = endOfToday(addDays(previousWeekStart, weekDayIndex));
    const previousMonthDate = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    const previousMonthStart = startOfMonth(previousMonthDate);
    const previousMonthLastDay = endOfMonth(previousMonthDate).getDate();
    const comparableDay = isCurrentMonth ? Math.min(now.getDate(), previousMonthLastDay) : previousMonthLastDay;
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

    const daysInMonth = endOfMonth(monthStart).getDate();
    const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
    const projectedExpense = isCurrentMonth && daysElapsed > 0 ? Math.round(monthExpense / daysElapsed * daysInMonth) : monthExpense;
    const remainingLimit = Number(state.profile.monthlyExpenseLimit || 0) - monthExpense;

    return {
      assets, investment, liquid, debt, expected, capital, upcomingPayments, freeBalance,
      weekExpense, previousWeekExpense,
      monthExpense, previousMonthExpense,
      monthIncome, previousMonthIncome,
      monthSalary, previousMonthSalary,
      todayExpense, monthBalance, savingsRate, optionalExpense, categoryRows, projectedExpense, remainingLimit,
      weekStart, weekEnd: currentEnd, monthStart, monthEnd: currentEnd, selectedMonth: selectedKey, isCurrentMonth
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

    const weekChange = analytics.isCurrentMonth ? percentageChange(analytics.weekExpense, analytics.previousWeekExpense) : null;
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

  function customExpenseCategoryById(id) {
    return (state.customExpenseCategories || []).find(category => category.id === id) || null;
  }

  function expenseCategoryList() {
    return [...EXPENSE_CATEGORIES, ...(state.customExpenseCategories || []).map(category => [category.id, category.name])];
  }

  function categoryLabel(key) {
    return ALL_CATEGORIES.get(key) || customExpenseCategoryById(key)?.name || 'Другое';
  }

  function normalizeExpenseText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»“”„]/g, ' ')
      .replace(/[^a-zа-я0-9+.,₽\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function expensePhraseTokens(value) {
    return normalizeExpenseText(value)
      .split(' ')
      .map(token => token.replace(/^[+.,-]+|[+.,-]+$/g, ''))
      .filter(token => token.length >= 3 && !/^\d/.test(token) && !EXPENSE_STOP_WORDS.has(token));
  }

  function expenseCategoryKeywords(categoryId) {
    const custom = customExpenseCategoryById(categoryId);
    const aliases = Array.isArray(state.profile.expenseCategoryAliases?.[categoryId]) ? state.profile.expenseCategoryAliases[categoryId] : [];
    const base = custom ? [custom.name, ...(custom.keywords || [])] : [categoryLabel(categoryId), ...(BUILTIN_EXPENSE_KEYWORDS[categoryId] || [])];
    return [...new Set([...base, ...aliases].map(normalizeExpenseText).filter(Boolean))];
  }

  function learnExpenseCategory(value, categoryId) {
    const tokens = expensePhraseTokens(value).slice(0, 8);
    if (!tokens.length || !categoryId) return;
    const custom = customExpenseCategoryById(categoryId);
    if (custom) {
      custom.keywords = [...new Set([...(custom.keywords || []), ...tokens])].slice(0, 30);
      return;
    }
    state.profile.expenseCategoryAliases ||= {};
    const current = Array.isArray(state.profile.expenseCategoryAliases[categoryId]) ? state.profile.expenseCategoryAliases[categoryId] : [];
    state.profile.expenseCategoryAliases[categoryId] = [...new Set([...current, ...tokens])].slice(-30);
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
    const feminine = new Set(['Зарплата', 'Дисциплина']);
    const neuter = new Set(['Выполнение']);
    const plural = new Set(['Доходы', 'Расходы', 'Сбережения']);
    const verb = feminine.has(label) ? (rose ? 'выросла' : 'снизилась') : neuter.has(label) ? (rose ? 'выросло' : 'снизилось') : plural.has(label) ? (rose ? 'выросли' : 'снизились') : (rose ? 'вырос' : 'снизился');
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

  function heroSparkline(rows, key = 'capital') {
    const values = rows.map(row => Number(row[key] || 0));
    if (values.length < 2) return '<div class="hero-spark-empty">Динамика появится после операций</div>';
    const width = 640;
    const height = 110;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(1, max - min);
    const points = values.map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - 10 - ((value - min) / spread) * (height - 22);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const area = `0,${height} ${points} ${width},${height}`;
    return `<div class="hero-sparkline"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".26"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#heroArea)"/><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
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
    document.body.dataset.screen = currentScreen;
    const titles = { dashboard: 'Главная', tasks: 'Задачи', finance: 'Финансы', projects: 'Проекты', growth: 'Прогресс' };
    $('#screenTitle').textContent = titles[currentScreen] || 'Главная';
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.screen === currentScreen));
    const renderer = { dashboard: renderDashboard, tasks: renderTasks, finance: renderFinance, projects: renderProjects, growth: renderGrowth }[currentScreen] || renderDashboard;
    renderer();
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
    const mainTasks = state.tasks
      .filter(task => task.status !== 'done' && (!task.due || task.due <= todayISO()))
      .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1) || (a.due || '9999').localeCompare(b.due || '9999'))
      .slice(0, 4);
    const upcoming = openObligations().filter(item => item.dueDate && dateInRange(item.dueDate, new Date(), addDays(new Date(), 14))).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
    const capitalSeries = estimatedCapitalSeries(6);
    const capitalChange = percentageChange(capitalSeries.at(-1)?.capital || 0, capitalSeries.at(-2)?.capital || 0);
    const greetingHour = new Date().getHours();
    const greeting = greetingHour < 12 ? 'Доброе утро' : greetingHour < 18 ? 'Добрый день' : 'Добрый вечер';

    app.innerHTML = `
      <section class="home-welcome">
        <small>Сегодня, ${dateText(todayISO())}</small>
        <h2>${greeting}, ${escapeHtml(state.profile.name || 'Пользователь')}! <span>👋</span></h2>
      </section>

      <section class="card home-capital-card">
        <div class="metric-row">
          <div><small>Общий капитал</small><strong>${money(analytics.capital)}</strong></div>
          <span class="compare ${capitalChange === null ? 'neutral' : capitalChange >= 0 ? 'good' : 'bad'}">${capitalChange === null ? 'первая база' : `${capitalChange >= 0 ? '↑' : '↓'} ${Math.abs(capitalChange)}%`}</span>
        </div>
        ${heroSparkline(capitalSeries)}
      </section>

      <section class="home-metric-grid">
        <button type="button" class="home-metric-card income" data-go="finance"><small>Доход за месяц</small><strong>${money(analytics.monthIncome)}</strong><span>${compareSentence('Доход', analytics.monthIncome, analytics.previousMonthIncome).replace(/<[^>]+>/g, '')}</span></button>
        <button type="button" class="home-metric-card expense" data-go="finance"><small>Расход за месяц</small><strong>${money(analytics.monthExpense)}</strong><span>${compareSentence('Расход', analytics.monthExpense, analytics.previousMonthExpense, true).replace(/<[^>]+>/g, '')}</span></button>
        <button type="button" class="home-metric-card week" data-go="finance"><small>Расход за неделю</small><strong>${money(analytics.weekExpense)}</strong><span>Текущая неделя</span></button>
        <button type="button" class="home-metric-card free" data-go="finance"><small>Свободный остаток</small><strong>${money(analytics.freeBalance)}</strong><span>После ближайших платежей</span></button>
      </section>

      <section class="section">
        <div class="section-head"><h2>Ближайшие платежи</h2><button class="link-btn" type="button" data-go="finance">Все</button></div>
        <div class="list">${upcoming.length ? upcoming.map(obligationItem).join('') : empty('На ближайшие 14 дней платежей нет.')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Ближайшие задачи</h2><button class="link-btn" type="button" data-go="tasks">Все</button></div>
        <div class="list">${mainTasks.length ? mainTasks.map(taskItem).join('') : empty('Главные задачи на сегодня закрыты.')}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Стратегический сигнал</h2><button class="link-btn" type="button" data-go="growth">Прогресс</button></div>
        <div class="insight ${getFinanceInsights(analytics)[0]?.cls || ''}">${escapeHtml(getFinanceInsights(analytics)[0]?.text || 'Добавляй операции, задачи и цели - система начнёт находить точки роста.')}</div>
      </section>
    `;
    bindCommon();
    bindFinanceActions();
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
    const tomorrow = localISO(addDays(new Date(), 1));
    const normalizedSearch = taskSearch.trim().toLowerCase();
    const baseTasks = state.tasks.filter(task => !normalizedSearch || `${task.title} ${task.project} ${task.notes}`.toLowerCase().includes(normalizedSearch));
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = baseTasks.slice().sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due || '9999').localeCompare(b.due || '9999') || (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
    const todayTasks = sorted.filter(task => task.due === today && task.status !== 'done');
    const tomorrowTasks = sorted.filter(task => task.due === tomorrow && task.status !== 'done');
    const planTasks = sorted.filter(task => task.status !== 'done');
    const completed = sorted.filter(task => task.status === 'done').slice(0, 8);

    const tabBar = `<section class="tabs task-view-tabs">
      ${[['today','Сегодня'],['plan','План'],['notes','Заметки']].map(([key,label]) => `<button class="tab ${taskFilter === key ? 'active' : ''}" type="button" data-task-filter="${key}">${label}</button>`).join('')}
    </section>`;

    if (taskFilter === 'notes') {
      app.innerHTML = `${tabBar}${knowledgeSectionMarkup(12)}`;
      bindCommon();
      bindKnowledgeInline();
      $$('[data-task-filter]').forEach(button => button.addEventListener('click', () => { taskFilter = button.dataset.taskFilter; renderTasks(); }));
      return;
    }

    app.innerHTML = `
      ${tabBar}
      <section class="task-search-row"><input class="search-input" id="taskSearch" type="search" value="${escapeHtml(taskSearch)}" placeholder="Найти задачу"></section>
      ${taskFilter === 'today' ? `
        <section class="section compact-section">
          <div class="section-head"><h2>Сегодня, ${dateText(today)}</h2><span class="badge">${todayTasks.length}</span></div>
          <div class="list compact-list">${todayTasks.length ? todayTasks.map(taskItem).join('') : empty('На сегодня задач нет.')}</div>
        </section>
        <section class="section compact-section">
          <div class="section-head"><h2>Завтра, ${dateText(tomorrow)}</h2><span class="badge">${tomorrowTasks.length}</span></div>
          <div class="list compact-list">${tomorrowTasks.length ? tomorrowTasks.map(taskItem).join('') : empty('На завтра задач нет.')}</div>
        </section>` : `
        <section class="section compact-section">
          <div class="section-head"><h2>План</h2><span class="badge">${planTasks.length}</span></div>
          <div class="list compact-list">${planTasks.length ? planTasks.map(taskItem).join('') : empty('Активных задач нет.')}</div>
        </section>
        <section class="section compact-section">
          <div class="section-head"><h2>Выполнено</h2><span class="badge">${completed.length}</span></div>
          <div class="list compact-list">${completed.length ? completed.map(taskItem).join('') : empty('Выполненных задач пока нет.')}</div>
        </section>`}
      <section class="task-ideas-link card" data-task-filter-jump="notes">
        <div><small>Идеи и заметки</small><strong>${state.notes.length} записей в ${state.noteFolders.length} папках</strong></div><span>›</span>
      </section>`;

    bindCommon();
    $$('[data-task-filter]').forEach(button => button.addEventListener('click', () => { taskFilter = button.dataset.taskFilter; renderTasks(); }));
    $('[data-task-filter-jump]')?.addEventListener('click', () => { taskFilter = 'notes'; renderTasks(); });
    $('#taskSearch')?.addEventListener('input', event => { taskSearch = event.target.value; renderTasks(); $('#taskSearch')?.focus(); });
  }

  function knowledgeSectionMarkup(limit = 4) {
    const folders = state.noteFolders;
    const notes = state.notes.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, limit);
    return `
      <section class="section">
        <div class="section-head"><h2>База мыслей и идей</h2><div class="action-inline"><button class="link-btn" type="button" id="openKnowledgeInline">Открыть</button><button class="link-btn" type="button" id="addKnowledgeInline">+ Запись</button></div></div>
        <div class="card knowledge-preview-card">
          <div class="folder-chip-row">${folders.map(folder => `<button type="button" class="chip knowledge-folder" data-folder="${folder.id}">${escapeHtml(folder.name)} <small>${state.notes.filter(note => note.folderId === folder.id).length}</small></button>`).join('')}</div>
          <div class="list knowledge-list inline">${notes.length ? notes.map(note => `<div class="card knowledge-note inline-note" data-folder-id="${note.folderId}"><div class="metric-row"><div><div class="item-title">${escapeHtml(note.title)}</div><div class="item-meta">${escapeHtml(folders.find(folder => folder.id === note.folderId)?.name || 'Без папки')} · ${longDateText((note.updatedAt || note.createdAt).slice(0,10))}</div></div><div class="item-actions"><button class="mini-btn edit-note" type="button" data-id="${note.id}">✎</button></div></div><div class="item-note">${escapeHtml(note.body).split('\\n').join('<br>')}</div></div>`).join('') : empty('Записывай идеи, запуски, мысли и выводы прямо здесь.')}</div>
        </div>
      </section>`;
  }

  function bindKnowledgeInline() {
    $('#openKnowledgeInline')?.addEventListener('click', () => renderKnowledgeBase());
    $('#addKnowledgeInline')?.addEventListener('click', () => openKnowledgeNoteModal());
    $$('.knowledge-folder').forEach(button => button.addEventListener('click', () => {
      const folderId = button.dataset.folder;
      $$('.inline-note').forEach(note => note.hidden = note.dataset.folderId !== folderId);
    }));
    $$('.edit-note').forEach(button => button.addEventListener('click', () => openKnowledgeNoteModal(state.notes.find(note => note.id === button.dataset.id))));
  }

  function dailyExpenseSeries(monthKey = financeSelectedMonth) {
    const { start, end } = monthRange(monthKey);
    const days = end.getDate();
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), index + 1);
      const iso = localISO(date);
      return { label: String(index + 1), value: sum(state.transactions.filter(tx => tx.type === 'expense' && tx.date === iso).map(tx => tx.amount)) };
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

  function incomeSourceTotals(analytics) {
    const incomes = transactionsInRange('income', analytics.monthStart, analytics.monthEnd);
    const salary = sum(incomes.filter(tx => tx.category === 'salary').map(tx => tx.amount));
    const clients = sum(incomes.filter(tx => tx.category === 'client').map(tx => tx.amount));
    const ownProjects = sum(incomes.filter(tx => tx.category === 'project_income').map(tx => tx.amount));
    const other = Math.max(0, analytics.monthIncome - salary - clients - ownProjects);
    return { salary, clients, ownProjects, projectsTotal: clients + ownProjects, other };
  }

  function renderFinance() {
    ensureRecurringObligations();
    const analytics = getFinanceAnalytics(financeSelectedMonth);
    const sources = incomeSourceTotals(analytics);
    const progress = Math.max(0, Math.min(100, Math.round(analytics.capital / Math.max(1, state.profile.capitalTarget) * 100)));
    const capitalSeries = estimatedCapitalSeries(6);
    const capitalChange = percentageChange(capitalSeries.at(-1)?.capital || 0, capitalSeries.at(-2)?.capital || 0);
    const monthIsCurrent = analytics.selectedMonth === monthKey(new Date());
    app.innerHTML = `
      <section class="hero compact finance-hero finance-master-card">
        <div class="finance-hero-head">
          <div><p class="eyebrow">Общий капитал</p><div class="kpi">${money(analytics.capital)}</div></div>
          <div class="finance-head-actions">
            <label class="hero-month-picker"><span>Месяц</span><select id="financeMonthPicker">${monthsForSelect().map(key => `<option value="${key}" ${key === analytics.selectedMonth ? 'selected' : ''}>${escapeHtml(monthName(key))}</option>`).join('')}</select></label>
            <span class="compare ${capitalChange === null ? 'neutral' : capitalChange >= 0 ? 'good' : 'bad'}">${capitalChange === null ? 'первая база' : `${capitalChange >= 0 ? '↑' : '↓'} ${Math.abs(capitalChange)}%`}</span>
          </div>
        </div>
        ${heroSparkline(capitalSeries)}
        <div class="capital-breakdown"><span><small>Активы</small>${money(analytics.assets)}</span><span><small>Долги</small>${money(analytics.debt)}</span><span><small>Ликвидно</small>${money(analytics.liquid)}</span></div>
        <div class="finance-master-grid">
          <div><small>Заработано за месяц</small><strong>${money(analytics.monthIncome)}</strong></div>
          <div><small>Зарплата</small><strong>${money(sources.salary)}</strong></div>
          <div><small>Клиенты и проекты</small><strong>${money(sources.projectsTotal)}</strong></div>
          <div><small>Расходы за месяц</small><strong>${money(analytics.monthExpense)}</strong></div>
          <div><small>Расходы за неделю</small><strong>${money(analytics.weekExpense)}</strong><em>${monthIsCurrent ? 'текущая неделя' : 'текущая неделя'}</em></div>
          <div><small>Свободный остаток</small><strong>${money(analytics.freeBalance)}</strong></div>
        </div>
        <details class="finance-source-details">
          <summary>Структура дохода</summary>
          <div class="finance-source-row"><span>Клиенты</span><b>${money(sources.clients)}</b></div>
          <div class="finance-source-row"><span>Свои проекты</span><b>${money(sources.ownProjects)}</b></div>
          <div class="finance-source-row"><span>Другие доходы</span><b>${money(sources.other)}</b></div>
        </details>
        <div class="metric-row goal-row"><span>Цель: ${money(state.profile.capitalTarget)}</span><strong>${progress}%</strong></div>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </section>
      <section class="tabs finance-tabs">
        ${[['overview', 'Обзор'], ['operations', 'Операции'], ['accounts', 'Счета'], ['obligations', 'Платежи']].map(([key, label]) => `<button class="tab ${financeTab === key ? 'active' : ''}" type="button" data-finance-tab="${key}">${label}</button>`).join('')}
      </section>
      <div id="financeTabContent">${financeTabContent(financeTab, analytics)}</div>
    `;
    bindCommon();
    $$('[data-finance-tab]').forEach(button => button.addEventListener('click', () => { financeTab = button.dataset.financeTab; renderFinance(); }));
    $('#financeMonthPicker')?.addEventListener('change', event => { financeSelectedMonth = event.target.value || monthKey(new Date()); renderFinance(); });
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
    const recent = state.transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id))).slice(0, 5);
    return `
      <section class="finance-tool-grid">
        <button class="card finance-tool" type="button" id="openFinancialCalendar"><span>▦</span><div><b>Финансовый календарь</b><small>Доходы, расходы и платежи по дням</small></div><i>›</i></button>
        <button class="card finance-tool" type="button" id="openRecurringRules"><span>↻</span><div><b>Регулярные операции</b><small>${state.recurringRules.length} правил · план без двойного учёта</small></div><i>›</i></button>
      </section>
      <section class="section finance-support-section">
        <div class="section-head"><h2>Динамика</h2><span class="badge">6 месяцев</span></div>
        <div class="card chart-card">${dualBarChart(moneySeries)}</div>
      </section>
      <section class="section finance-support-section">
        <div class="section-head"><h2>Категории расходов</h2><button class="link-btn" type="button" data-finance-tab-jump="operations">Все</button></div>
        <div class="card category-list">
          ${analytics.categoryRows.length ? analytics.categoryRows.slice(0, 6).map(row => `
            <div class="category-row">
              <div class="metric-row"><span>${escapeHtml(row.label)}</span><strong>${money(row.amount)}</strong></div>
              <div class="progress thin"><span style="width:${Math.round(row.amount / maxCategory * 100)}%"></span></div>
            </div>`).join('') : '<div class="item-meta">Расходов за выбранный месяц пока нет.</div>'}
        </div>
      </section>
      <section class="section finance-support-section">
        <div class="section-head"><h2>Последние операции</h2><button class="link-btn" type="button" data-finance-tab-jump="operations">Все</button></div>
        <div class="list">${recent.length ? recent.map(transactionItem).join('') : empty('Добавьте первый доход или расход.')}</div>
      </section>
      <section class="section finance-support-section">
        <details class="card details-card month-compare-card">
          <summary><span>Сравнение месяцев</span><small>Доход, зарплата, расходы и категории</small></summary>
          <div class="details-body">${monthComparisonMarkup()}</div>
        </details>
      </section>
      <section class="section finance-support-section">
        <div class="section-head"><h2>Выводы</h2></div>
        <div class="list">${insights.length ? insights.slice(0, 4).map(item => `<div class="insight ${item.cls}">${escapeHtml(item.text)}</div>`).join('') : '<div class="insight">Добавляй операции, и здесь появятся выводы.</div>'}</div>
      </section>`;
  }

  function monthComparisonMarkup() {
    const currentMetrics = monthMetrics(financeCompareCurrent);
    const baseMetrics = monthMetrics(financeCompareBase);
    const currentMonthOptions = monthsForSelect().map(key => `<option value="${key}" ${key === financeCompareCurrent ? 'selected' : ''}>${escapeHtml(monthName(key))}</option>`).join('');
    const baseMonthOptions = monthsForSelect().map(key => `<option value="${key}" ${key === financeCompareBase ? 'selected' : ''}>${escapeHtml(monthName(key))}</option>`).join('');
    const categoryKeys = new Set([...currentMetrics.categories.keys(), ...baseMetrics.categories.keys()]);
    const categoryCompare = [...categoryKeys].map(key => {
      const current = Number(currentMetrics.categories.get(key) || 0);
      const base = Number(baseMetrics.categories.get(key) || 0);
      return { key, label: categoryLabel(key), current, base, delta: current - base, percent: percentageChange(current, base) };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8);
    return `<div class="compare-panel compact-compare">
      <div class="compare-selects"><label>Текущий<select id="compareCurrent">${currentMonthOptions}</select></label><span>к</span><label>База<select id="compareBase">${baseMonthOptions}</select></label></div>
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
    $('#financeMonthPicker')?.addEventListener('change', event => { financeSelectedMonth = event.target.value || financeSelectedMonth; renderFinance(); });
    const refreshInlineCompare = () => {
      const container = $('.month-compare-card .details-body');
      if (!container) return;
      container.innerHTML = monthComparisonMarkup();
      bindFinanceActions();
    };
    $('#compareCurrent')?.addEventListener('change', event => { financeCompareCurrent = event.target.value; refreshInlineCompare(); });
    $('#compareBase')?.addEventListener('change', event => { financeCompareBase = event.target.value; refreshInlineCompare(); });
    $('#openMonthCompare')?.addEventListener('click', openMonthComparisonModal);
    $('#openFinancialCalendar')?.addEventListener('click', () => openFinancialCalendar(financeSelectedMonth));
    $('#openRecurringRules')?.addEventListener('click', openRecurringRules);
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
    const visible = state.projects.filter(project => projectFilter === 'archive' ? project.status === 'completed' : project.status !== 'completed');
    const activeClients = visible.filter(project => project.type === 'client');
    const ownProjects = visible.filter(project => project.type !== 'client');
    app.innerHTML = `
      <section class="tabs project-tabs">
        <button class="tab ${projectFilter === 'active' ? 'active' : ''}" type="button" data-project-filter="active">Активные</button>
        <button class="tab ${projectFilter === 'archive' ? 'active' : ''}" type="button" data-project-filter="archive">Архив</button>
      </section>
      ${activeClients.length ? `<section class="section compact-section"><div class="section-head"><h2>Клиенты</h2><span class="badge">${activeClients.length}</span></div><div class="list project-list">${activeClients.map(projectItem).join('')}</div></section>` : ''}
      ${ownProjects.length ? `<section class="section compact-section"><div class="section-head"><h2>Собственные проекты</h2><span class="badge">${ownProjects.length}</span></div><div class="list project-list">${ownProjects.map(projectItem).join('')}</div></section>` : ''}
      ${!visible.length ? empty(projectFilter === 'archive' ? 'В архиве пока нет проектов.' : 'Добавьте первый клиентский или собственный проект.') : ''}
      <button class="btn primary full add-project-button" type="button" id="addProject">＋ Новый проект</button>`;
    bindCommon();
    $$('[data-project-filter]').forEach(button => button.addEventListener('click', () => { projectFilter = button.dataset.projectFilter; renderProjects(); }));
    $('#addProject')?.addEventListener('click', () => openProjectModal());
  }

  function projectItem(project) {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const actual = sum(state.transactions.filter(tx => tx.type === 'income' && tx.projectId === project.id && dateInRange(tx.date, monthStart, monthEnd)).map(tx => tx.amount));
    const overdue = project.paymentStatus === 'overdue' || (project.paymentStatus === 'waiting' && project.paymentDate && project.paymentDate < todayISO());
    const projectPercent = project.value > 0 ? Math.max(0, Math.min(100, Math.round(actual / project.value * 100))) : 0;
    return `<div class="card project-card ${overdue ? 'overdue-card' : ''}" style="--project-progress:${projectPercent}%">
      <div class="project-card-head"><div><div class="item-title">${escapeHtml(project.name)}</div><div class="item-meta">${projectTypeText(project.type)}</div></div><strong>${money(project.value)}</strong></div>
      <div class="project-compact-stats">
        <span><small>Получено</small><b>${money(actual)}</b></span>
        <span><small>Ожидается</small><b>${money(project.value)}</b></span>
        <span><small>Статус</small><b>${projectStatusText(project.status)}</b></span>
      </div>
      ${project.paymentDate ? `<div class="project-date-row"><span>Следующая оплата</span><b>${dateText(project.paymentDate)}</b></div>` : ''}
      ${project.next ? `<div class="project-next">${escapeHtml(project.next)}</div>` : ''}
      <div class="project-footer"><span class="item-meta">${paymentStatusText(project.paymentStatus)}</span><div class="item-actions"><button class="mini-btn edit-project" type="button" data-id="${project.id}" aria-label="Редактировать">✎</button><button class="mini-btn delete-project" type="button" data-id="${project.id}" aria-label="Удалить">×</button></div></div>
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

  function goalItem(goal) {
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
  }

  function habitItem(habit) {
    const days = getLast7Days();
    return `<div class="card habit-card">
      <div class="metric-row"><div><div class="item-title">${escapeHtml(habit.title)}</div><div class="item-meta">Месяц ${habitMonthPercent(habit)}% · серия ${habitStreak(habit)} дн.</div></div><div class="item-actions"><button class="mini-btn edit-habit" type="button" data-id="${habit.id}">✎</button><button class="mini-btn delete-habit" type="button" data-id="${habit.id}">×</button></div></div>
      <div class="week-grid">${days.map(day => `<button class="day-cell habit-day ${habit.logs?.[day.iso] ? 'done' : ''}" type="button" data-id="${habit.id}" data-date="${day.iso}">${day.label}</button>`).join('')}</div>
    </div>`;
  }

  function renderGrowth() {
    const analytics = getFinanceAnalytics();
    const months = growthRange === 'year' ? 12 : growthRange === 'week' ? 3 : 6;
    const moneySeries = monthlyMoneySeries(months);
    const capitalSeries = estimatedCapitalSeries(months);
    const currentTasks = taskWeekStats(new Date(), true);
    const previousTasks = taskWeekStats(addDays(new Date(), -7), true);
    const currentHabits = habitWeekStats(new Date(), true);
    const previousHabits = habitWeekStats(addDays(new Date(), -7), true);
    const activeGoals = state.goals.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const profile = state.workoutProfile || freshState().workoutProfile;
    const workoutHabit = state.habits.find(habit => /спорт|трен/i.test(habit.title));
    const workoutRate = workoutHabit ? habitMonthPercent(workoutHabit) : 0;
    const weekStartDate = startOfWeek(new Date());
    const weekEndDate = endOfWeek(new Date());
    const workoutLogsThisWeek = state.workoutLogs.filter(log => dateInRange(log.date, weekStartDate, weekEndDate));
    const reviews = state.weeklyReviews.slice().sort((a,b)=>(b.weekStart||'').localeCompare(a.weekStart||''));
    const currentReview = reviews.find(review => review.weekStart === localISO(weekStartDate));
    const projectRate = state.projects.length ? Math.round(state.projects.filter(project => ['active','growth'].includes(project.status)).length / state.projects.length * 100) : 0;
    const goalRate = activeGoals.length ? Math.round(sum(activeGoals.map(goal => Math.min(100, goalCurrent(goal) / Math.max(1, goal.target) * 100))) / activeGoals.length) : 0;

    app.innerHTML = `
      <section class="tabs progress-period-tabs v11-tabs">
        ${[['week','Неделя'],['month','Месяц'],['year','Год']].map(([key,label]) => `<button class="tab ${growthRange === key ? 'active' : ''}" type="button" data-growth-range="${key}">${label}</button>`).join('')}
      </section>

      <section class="card v11-progress-overview">
        <div class="section-head"><div><small>Общий прогресс</small><h2>Все сферы жизни</h2></div><strong class="positive">+${Math.max(0, percentageChange(analytics.capital, Math.max(1, analytics.capital - analytics.monthBalance)) || 0)}%</strong></div>
        ${compactMoneyChart(capitalSeries)}
      </section>

      <section class="v11-progress-grid">
        <button class="card v11-progress-tile" type="button" id="jumpGoals"><span class="tile-icon">◎</span><small>Цели</small><strong>${goalRate}%</strong><em>${activeGoals.length} активных</em></button>
        <button class="card v11-progress-tile" type="button" data-go="finance"><span class="tile-icon">₽</span><small>Финансы</small><strong>${money(analytics.monthBalance)}</strong><em>${analytics.monthBalance >= 0 ? 'рост капитала' : 'нужно сократить расходы'}</em></button>
        <button class="card v11-progress-tile" type="button" id="jumpHabits"><span class="tile-icon habit-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4" pathLength="100"/><path d="m8.2 12.1 2.4 2.5 5.4-5.7"/></svg></span><small>Привычки</small><strong>${currentHabits.rate}%</strong><em>${currentHabits.rate >= previousHabits.rate ? 'стабильный ритм' : 'ниже прошлой недели'}</em></button>
        <button class="card v11-progress-tile" type="button" data-go="projects"><span class="tile-icon">▣</span><small>Проекты</small><strong>${projectRate}%</strong><em>${state.projects.filter(project => ['active','growth'].includes(project.status)).length} в работе</em></button>
      </section>

      <section class="card v11-workout-card">
        <div class="workout-card-head"><span class="workout-icon">⌁</span><div><small>Тренировки</small><h2>Персональный план</h2><p>Сила, выносливость, мобильность и восстановление.</p></div><strong>${workoutRate}%</strong></div>
        <div class="workout-card-stats"><span><b>${workoutLogsThisWeek.length}/${profile.days}</b><small>тренировок на неделе</small></span><span><b>${profile.height} см</b><small>рост</small></span><span><b>${profile.age}</b><small>возраст</small></span></div>
        <div class="workout-card-actions"><button class="btn primary" type="button" id="openWorkouts">Видео и план</button><button class="btn secondary" type="button" id="openWorkoutJournal">Журнал</button></div>
      </section>

      <section class="section compact-section" id="goalDynamics">
        <div class="section-head"><h2>Цели</h2><button class="link-btn" type="button" id="addGoal">Добавить</button></div>
        <div class="list goal-list">${activeGoals.length ? activeGoals.map(goalItem).join('') : empty('Добавьте первую цель.')}</div>
      </section>

      <section class="section compact-section" id="habitDynamics">
        <div class="section-head"><h2>Привычки</h2><button class="link-btn" type="button" id="addHabit">Добавить</button></div>
        <div class="list">${state.habits.length ? state.habits.map(habitItem).join('') : empty('Добавьте полезную привычку.')}</div>
      </section>

      <section class="section compact-section weekly-review-section">
        <div class="section-head"><h2>Недельный разбор</h2><button class="link-btn" type="button" id="${currentReview ? 'editCurrentReview' : 'createAutoReview'}">${currentReview ? 'Изменить' : 'Создать автоматически'}</button></div>
        <div class="list">${currentReview ? reviewItem(currentReview) : `<div class="card auto-review-card"><div><b>Черновик формируется из задач, финансов и проектов</b><p>Приложение заполнит цифры и факты. Тебе останется добавить личный вывод.</p></div><button class="btn primary" type="button" id="createAutoReviewCard">Создать разбор</button></div>`}</div>
        ${reviews.length > 1 ? `<details class="card review-history"><summary>Предыдущие разборы <b>${reviews.length - 1}</b></summary><div class="list">${reviews.filter(review => review.id !== currentReview?.id).slice(0,4).map(reviewItem).join('')}</div></details>` : ''}
      </section>

      <section class="section compact-section">
        <div class="section-head"><h2>Динамика денег</h2><span class="badge">${growthRange === 'year' ? '12 месяцев' : growthRange === 'week' ? 'короткий период' : '6 месяцев'}</span></div>
        <div class="card chart-card">${dualBarChart(moneySeries)}</div>
      </section>`;

    bindCommon();
    $$('[data-growth-range]').forEach(button => button.addEventListener('click', () => { growthRange = button.dataset.growthRange; renderGrowth(); }));
    $('#addGoal')?.addEventListener('click', () => openGoalModal());
    $('#addHabit')?.addEventListener('click', () => openHabitModal());
    $('#openWorkouts')?.addEventListener('click', openWorkoutModal);
    $('#openWorkoutJournal')?.addEventListener('click', openWorkoutJournal);
    $('#createAutoReview')?.addEventListener('click', openAutoWeeklyReview);
    $('#createAutoReviewCard')?.addEventListener('click', openAutoWeeklyReview);
    $('#editCurrentReview')?.addEventListener('click', () => openReviewModal(currentReview));
    $('#jumpGoals')?.addEventListener('click', () => $('#goalDynamics')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    $('#jumpHabits')?.addEventListener('click', () => $('#habitDynamics')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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

  function removeItem(collection, id, options = {}) {
    const item = state[collection]?.find(entry => entry.id === id);
    if (!item || !confirm(`Переместить «${itemTitle(collection, item)}» в корзину?`)) return;
    let related = [];
    if (collection === 'projects') {
      related = state.transactions.filter(entry => entry.projectId === id && entry.autoProjectIncome);
      related.forEach(entry => applyTransactionToAccount(entry, -1));
      state.transactions = state.transactions.filter(entry => !(entry.projectId === id && entry.autoProjectIncome));
    }
    if (collection === 'transactions') applyTransactionToAccount(item, -1);
    pushToTrash(collection, item, related);
    state[collection] = state[collection].filter(entry => entry.id !== id);
    saveState({ label: `Удалено: ${itemTitle(collection, item)}` });
    if (options.reopen === 'workoutJournal') openWorkoutJournal(); else render();
    toast('Перемещено в корзину');
  }

  function applyTransactionToAccount(transaction, direction = 1) {
    if (!transaction.accountId || !state.accounts.some(item => item.id === transaction.accountId)) transaction.accountId = getDefaultAccount().id;
    const account = state.accounts.find(item => item.id === transaction.accountId);
    if (!account) return;
    const delta = Number(transaction.amount || 0) * (transaction.type === 'income' ? 1 : -1) * direction;
    account.balance = Number(account.balance || 0) + delta;
  }

  function deleteTransaction(id) {
    removeItem('transactions', id);
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
    openOtherActionsMenu();
  }

  function quickCategoryButton(categoryId, label, selected, custom = false) {
    return `<button type="button" class="expense-category-chip ${selected === categoryId ? 'active' : ''} ${custom ? 'custom' : ''}" data-expense-category="${escapeHtml(categoryId)}"><span>${escapeHtml(label)}</span>${custom ? '<i aria-hidden="true">•</i>' : ''}</button>`;
  }

  function quickExpenseCategoryMarkup(selected) {
    const custom = state.customExpenseCategories || [];
    const preferredIds = [...new Set([selected, ...custom.map(item => item.id), 'groceries', 'cafes', 'transport', 'taxi', 'housing', 'subscriptions', 'health', 'clothing'])].filter(Boolean);
    const all = expenseCategoryList();
    const preferred = preferredIds.map(id => all.find(([value]) => value === id)).filter(Boolean);
    const rest = all.filter(([id]) => !preferredIds.includes(id));
    return `
      <div class="expense-category-grid category-favorites">${preferred.map(([id, label]) => quickCategoryButton(id, label, selected, id.startsWith('custom_'))).join('')}</div>
      ${rest.length ? `<details class="category-more"><summary>Все категории <span>${rest.length}</span></summary><div class="expense-category-grid">${rest.map(([id, label]) => quickCategoryButton(id, label, selected, id.startsWith('custom_'))).join('')}</div></details>` : ''}
      <div class="category-tools"><button type="button" id="toggleCustomCategory">+ Своя категория</button>${custom.length ? '<button type="button" id="toggleCustomCategoryList">Мои категории</button>' : ''}</div>
      <div class="custom-category-editor" id="customCategoryEditor" hidden>
        <div class="field"><label>Название категории</label><input id="customCategoryName" type="text" maxlength="32" placeholder="Например, Автомобиль"></div>
        <div class="field"><label>Слова для распознавания <small>через запятую</small></label><input id="customCategoryKeywords" type="text" placeholder="бензин, мойка, сервис"></div>
        <button type="button" class="btn primary full" id="saveCustomCategory">Добавить категорию</button>
      </div>
      <div class="custom-category-list" id="customCategoryList" hidden>${custom.map(category => `<div><span><b>${escapeHtml(category.name)}</b><small>${escapeHtml((category.keywords || []).slice(0, 5).join(', ') || 'Распознавание по названию')}</small></span><button type="button" data-delete-custom-category="${category.id}" aria-label="Удалить ${escapeHtml(category.name)}">×</button></div>`).join('')}</div>`;
  }

  function openQuickExpenseModal() {
    const initialCategory = expenseCategoryList().some(([id]) => id === state.profile.lastExpenseCategory) ? state.profile.lastExpenseCategory : 'groceries';
    openModal('Быстрый расход', `
      <div class="quick-expense-form">
        <div class="smart-expense-line"><input id="smartExpenseInput" type="text" inputmode="text" autocomplete="off" placeholder="Например: кредит 1300"><button type="button" id="parseSmartExpense">Распознать</button></div>
        <small class="smart-expense-hint">Можно написать «кредит 1300», «1,5к кофе» или название своей категории.</small>
        <div class="quick-amount-wrap"><span>−</span><input id="quickExpenseAmount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="0"><b>₽</b></div>
        <div class="quick-amounts"><button type="button" data-add-amount="100">+100</button><button type="button" data-add-amount="500">+500</button><button type="button" data-add-amount="1000">+1 000</button></div>
        <input type="hidden" name="category" id="quickExpenseCategory" value="${escapeHtml(initialCategory)}">
        <div class="field"><label>Категория</label><div id="quickCategoryArea">${quickExpenseCategoryMarkup(initialCategory)}</div></div>
        <div class="form-grid">
          <div class="field"><label>Счёт</label><select name="accountId">${accountOptions(state.profile.lastExpenseAccountId || '')}</select></div>
          <div class="field"><label>Дата</label><input name="date" type="date" value="${todayISO()}"></div>
        </div>
        <div class="field"><label>Комментарий <small>необязательно</small></label><input name="title" placeholder="Например, кредит или такси"></div>
        <button class="quick-more-actions" type="button" id="openOtherActions">Доход, задача или счёт</button>
      </div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      const amount = Number(data.amount || 0);
      if (amount <= 0) return false;
      const category = expenseCategoryList().some(([id]) => id === data.category) ? data.category : 'other_expense';
      const title = String(data.title || '').trim() || categoryLabel(category);
      const transaction = { id: uid(), title, type: 'expense', amount, date: data.date || todayISO(), category, accountId: data.accountId || getDefaultAccount().id, notes: '', necessity: 'unknown', scope: 'personal', projectId: '', createdAt: new Date().toISOString() };
      if (!confirmTransactionNotDuplicate(transaction)) return false;
      state.transactions.push(transaction);
      applyTransactionToAccount(transaction, 1);
      state.profile.lastExpenseCategory = category;
      state.profile.lastExpenseAccountId = transaction.accountId;
      learnExpenseCategory(`${$('#smartExpenseInput')?.value || ''} ${title}`, category);
      return true;
    }, { submitText: 'Сохранить расход' });

    const bindCategoryArea = () => {
      const area = $('#quickCategoryArea');
      if (!area) return;
      $$('[data-expense-category]', area).forEach(button => button.addEventListener('click', () => {
        $$('[data-expense-category]', area).forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        $('#quickExpenseCategory').value = button.dataset.expenseCategory;
      }));
      $('#toggleCustomCategory')?.addEventListener('click', () => {
        const editor = $('#customCategoryEditor');
        editor.hidden = !editor.hidden;
        if (!editor.hidden) setTimeout(() => $('#customCategoryName')?.focus(), 20);
      });
      $('#toggleCustomCategoryList')?.addEventListener('click', () => {
        const list = $('#customCategoryList');
        list.hidden = !list.hidden;
      });
      $('#saveCustomCategory')?.addEventListener('click', () => {
        try {
          const categoryId = createCustomExpenseCategory($('#customCategoryName')?.value, $('#customCategoryKeywords')?.value);
          $('#quickExpenseCategory').value = categoryId;
          area.innerHTML = quickExpenseCategoryMarkup(categoryId);
          bindCategoryArea();
          toast(`Категория «${categoryLabel(categoryId)}» добавлена`);
        } catch (error) {
          alert(error.message || 'Не удалось добавить категорию.');
        }
      });
      $$('[data-delete-custom-category]', area).forEach(button => button.addEventListener('click', () => {
        if (!deleteCustomExpenseCategory(button.dataset.deleteCustomCategory)) return;
        const selected = $('#quickExpenseCategory').value === button.dataset.deleteCustomCategory ? 'other_expense' : $('#quickExpenseCategory').value;
        $('#quickExpenseCategory').value = selected;
        area.innerHTML = quickExpenseCategoryMarkup(selected);
        bindCategoryArea();
        toast('Категория удалена');
      }));
    };

    const applySmartExpense = () => {
      const parsed = parseSmartExpense($('#smartExpenseInput')?.value || '');
      if (!parsed.amount) { toast('Укажи сумму, например: кредит 1300'); return; }
      $('#quickExpenseAmount').value = parsed.amount;
      const titleInput = modalForm.elements.title;
      if (titleInput) titleInput.value = parsed.title;
      $('#quickExpenseCategory').value = parsed.category;
      $('#quickCategoryArea').innerHTML = quickExpenseCategoryMarkup(parsed.category);
      bindCategoryArea();
      toast(`Распознано: ${money(parsed.amount)} · ${categoryLabel(parsed.category)}`);
    };
    bindCategoryArea();
    $('#parseSmartExpense')?.addEventListener('click', applySmartExpense);
    $('#smartExpenseInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applySmartExpense(); } });
    setTimeout(() => $('#smartExpenseInput')?.focus(), 80);
    $$('[data-add-amount]', modalBody).forEach(button => button.addEventListener('click', () => {
      const input = $('#quickExpenseAmount');
      input.value = Number(input.value || 0) + Number(button.dataset.addAmount || 0);
      input.focus();
    }));
    $('#openOtherActions')?.addEventListener('click', () => { closeModal(); openOtherActionsMenu(); });
  }

  function openOtherActionsMenu() {
    openModal('Добавить', `
      <div class="quick-sheet vnext-quick-sheet">
        <button type="button" class="primary-action" data-quick="expense"><span>−</span><b>Расход</b><small>Внести за несколько секунд</small></button>
        <button type="button" data-quick="income"><span>＋</span><b>Доход</b><small>Зарплата, клиент или проект</small></button>
        <button type="button" data-quick="task"><span>✓</span><b>Задача</b><small>Добавить действие</small></button>
        <button type="button" data-quick="project"><span>▣</span><b>Проект</b><small>Клиент или собственный проект</small></button>
        <button type="button" data-quick="note"><span>✦</span><b>Заметка</b><small>Мысль, идея или наблюдение</small></button>
        <button type="button" data-quick="account"><span>◫</span><b>Счёт</b><small>Карта, наличные или вклад</small></button>
      </div>`, null, { hideActions: true });
    $$('[data-quick]', modalBody).forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.quick;
      closeModal();
      if (action === 'income') openTransactionModal(null, 'income');
      if (action === 'expense') openQuickExpenseModal();
      if (action === 'task') openTaskModal();
      if (action === 'account') openAccountModal();
      if (action === 'project') openProjectModal();
      if (action === 'note') openKnowledgeNoteModal();
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
    modal.classList.remove('workout-dialog', 'video-workout-dialog', 'settings-dialog');
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
    const list = type === 'income' ? INCOME_CATEGORIES : expenseCategoryList();
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
      const candidate = { id: item?.id || uid(), ...data, createdAt: item?.createdAt || new Date().toISOString() };
      if (!confirmTransactionNotDuplicate(candidate, item?.id || '')) return false;
      if (item) {
        applyTransactionToAccount(item, -1);
        Object.assign(item, candidate);
        applyTransactionToAccount(item, 1);
      } else {
        state.transactions.push(candidate);
        applyTransactionToAccount(candidate, 1);
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
      <div class="field"><label>Счёт</label><select name="accountId">${accountOptions(item.accountId || '')}</select></div>
      <div class="field"><label>Дата</label><input name="date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Название операции</label><input name="title" required value="${escapeHtml(item.title)}"></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      const transaction = { id: uid(), title: data.title, type: isIncome ? 'income' : 'expense', amount: Number(item.amount || 0), date: data.date || todayISO(), category: item.category || (isIncome ? 'other_income' : 'debt_payment'), accountId: data.accountId || item.accountId || '', notes: `Закрытие: ${item.title}`, createdAt: new Date().toISOString(), recurringRuleId: item.recurringRuleId || '' };
      if (!confirmTransactionNotDuplicate(transaction)) return false;
      state.transactions.push(transaction);
      applyTransactionToAccount(transaction, 1);
      item.status = isIncome ? 'received' : 'paid';
      item.settledTransactionId = transaction.id;
      return true;
    }, { submitText: isIncome ? 'Получено' : 'Оплачено' });
  }

  function projectIncomeCategory(type) {
    if (type === 'client') return 'client';
    if (type === 'personal') return 'project_income';
    if (type === 'job') return 'salary';
    return 'other_income';
  }

  function syncProjectMonthlyIncome(project, amount, monthKey) {
    if (!project?.id || !monthKey) return;
    const start = `${monthKey}-01`;
    let tx = state.transactions.find(item => item.type === 'income' && item.projectId === project.id && item.projectIncomeMonth === monthKey && item.autoProjectIncome);
    if (tx) {
      applyTransactionToAccount(tx, -1);
      if (amount > 0) {
        tx.title = `${project.name} - доход`;
        tx.amount = amount;
        tx.date = start;
        tx.category = projectIncomeCategory(project.type);
        applyTransactionToAccount(tx, 1);
      } else {
        state.transactions = state.transactions.filter(item => item.id !== tx.id);
      }
      return;
    }
    if (amount > 0) {
      tx = { id: uid(), title: `${project.name} - доход`, type: 'income', amount, date: start, category: projectIncomeCategory(project.type), accountId: getDefaultAccount().id, notes: `Автосинхронизация проекта: ${project.name}`, projectId: project.id, autoProjectIncome: true, projectIncomeMonth: monthKey };
      state.transactions.push(tx);
      applyTransactionToAccount(tx, 1);
    }
  }

  function openProjectModal(item = null) {
    const actualMonth = monthKey(new Date());
    const existingIncome = item ? state.transactions.find(tx => tx.type === 'income' && tx.projectId === item.id && tx.projectIncomeMonth === actualMonth && tx.autoProjectIncome) : null;
    openModal(item ? 'Изменить проект' : 'Новый проект', `
      <div class="field"><label>Название</label><input name="name" required value="${escapeHtml(item?.name || '')}" placeholder="Например, Dmitry Auto"></div>
      <div class="form-grid">
        <div class="field"><label>Тип</label><select name="type"><option value="client" ${!item || item?.type === 'client' ? 'selected' : ''}>Клиент</option><option value="personal" ${item?.type === 'personal' ? 'selected' : ''}>Свой проект</option><option value="job" ${item?.type === 'job' ? 'selected' : ''}>Зарплата / работа</option></select></div>
        <div class="field"><label>Статус</label><select name="status"><option value="active" ${!item || item?.status === 'active' ? 'selected' : ''}>Активен</option><option value="growth" ${item?.status === 'growth' ? 'selected' : ''}>Развитие</option><option value="paused" ${item?.status === 'paused' ? 'selected' : ''}>Пауза</option><option value="completed" ${item?.status === 'completed' ? 'selected' : ''}>Завершён</option></select></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>План в месяц, ₽</label><input name="value" type="number" min="0" value="${item?.value ?? 0}"></div>
        <div class="field"><label>Статус оплаты</label><select name="paymentStatus"><option value="not_due" ${!item || item?.paymentStatus === 'not_due' ? 'selected' : ''}>Не ожидается</option><option value="waiting" ${item?.paymentStatus === 'waiting' ? 'selected' : ''}>Ожидается</option><option value="paid" ${item?.paymentStatus === 'paid' ? 'selected' : ''}>Получено</option><option value="overdue" ${item?.paymentStatus === 'overdue' ? 'selected' : ''}>Просрочено</option></select></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Месяц фактического дохода</label><input name="actualMonth" type="month" value="${actualMonth}"></div>
        <div class="field"><label>Фактически пришло, ₽</label><input name="actualIncome" type="number" min="0" value="${existingIncome?.amount ?? 0}"></div>
      </div>
      <div class="field"><label>Дата следующей оплаты</label><input name="paymentDate" type="date" value="${item?.paymentDate || ''}"></div>
      <div class="field"><label>Следующий шаг</label><textarea name="next" placeholder="Одно конкретное действие">${escapeHtml(item?.next || '')}</textarea></div>
      <div class="field"><label>Заметки</label><textarea name="notes" placeholder="Контекст, договорённости, идеи">${escapeHtml(item?.notes || '')}</textarea></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      data.value = Number(data.value || 0);
      const actualIncome = Number(data.actualIncome || 0);
      const actualMonth = data.actualMonth || monthKey(new Date());
      delete data.actualIncome;
      delete data.actualMonth;
      if (!data.name.trim()) return false;
      let target = item;
      if (item) Object.assign(item, data); else { target = { id: uid(), debt: 0, startDate: todayISO(), ...data }; state.projects.push(target); }
      syncProjectMonthlyIncome(target, actualIncome, actualMonth);
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
      data.title = String(data.title || '').trim();
      data.unit = String(data.unit || '').trim();
      data.nextAction = String(data.nextAction || '').trim();
      if (!data.title) return false;
      if (item) {
        Object.assign(item, data, { updatedAt: new Date().toISOString() });
      } else {
        state.goals = [{ id: uid(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...state.goals];
      }
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

  function openReviewModal(item = null, preset = null) {
    openModal(item ? 'Изменить недельный разбор' : 'Недельный разбор', `
      <div class="field"><label>Неделя начинается</label><input name="weekStart" type="date" value="${item?.weekStart || preset?.weekStart || localISO(startOfWeek(new Date()))}"></div>
      <div class="form-grid">
        <div class="field"><label>Заработано, ₽</label><input name="income" type="number" min="0" value="${item?.income ?? preset?.income ?? 0}"></div>
        <div class="field"><label>Отложено, ₽</label><input name="saved" type="number" min="0" value="${item?.saved ?? preset?.saved ?? 0}"></div>
      </div>
      <div class="field"><label>Что сделал и какой результат получил</label><textarea name="wins" placeholder="Не занятость, а фактический результат">${escapeHtml(item?.wins || preset?.wins || '')}</textarea></div>
      <div class="field"><label>Что провалил</label><textarea name="failures">${escapeHtml(item?.failures || preset?.failures || '')}</textarea></div>
      <div class="field"><label>Куда слил время</label><textarea name="timeLeaks">${escapeHtml(item?.timeLeaks || preset?.timeLeaks || '')}</textarea></div>
      <div class="field"><label>Главный вывод</label><textarea name="lesson">${escapeHtml(item?.lesson || preset?.lesson || '')}</textarea></div>
      <div class="field"><label>3 приоритета следующей недели</label><textarea name="priorities">${escapeHtml(item?.priorities || preset?.priorities || '')}</textarea></div>
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

  function openKnowledgeBase() {
    renderKnowledgeBase();
  }

  function renderKnowledgeBase() {
    const folders = state.noteFolders;
    const notes = state.notes.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    openModal('База мыслей и идей', `
      <div class="knowledge-toolbar"><button class="btn primary" type="button" id="addNoteFolder">+ Папка</button><button class="btn secondary" type="button" id="addKnowledgeNote">+ Запись</button></div>
      <div class="folder-chip-row">${folders.map(folder => `<button type="button" class="chip knowledge-folder" data-folder="${folder.id}">${escapeHtml(folder.name)} <small>${notes.filter(note => note.folderId === folder.id).length}</small></button>`).join('')}</div>
      <div class="list knowledge-list">${notes.length ? notes.map(note => `<div class="card knowledge-note" data-folder-id="${note.folderId}"><div class="metric-row"><div><div class="item-title">${escapeHtml(note.title)}</div><div class="item-meta">${escapeHtml(folders.find(folder => folder.id === note.folderId)?.name || 'Без папки')} · ${longDateText((note.updatedAt || note.createdAt).slice(0,10))}</div></div><div class="item-actions"><button class="mini-btn edit-note" type="button" data-id="${note.id}">✎</button><button class="mini-btn delete-note" type="button" data-id="${note.id}">×</button></div></div><div class="item-note">${escapeHtml(note.body).replace(/\n/g,'<br>')}</div>${note.tags ? `<div class="pill-row"><span class="badge">${escapeHtml(note.tags)}</span></div>` : ''}</div>`).join('') : empty('Создайте первую запись, идею или рабочую заметку.')}</div>
    `, null, { hideActions: true });
    $('#addNoteFolder')?.addEventListener('click', () => {
      const name = prompt('Название папки');
      if (!name?.trim()) return;
      state.noteFolders.push({ id: uid(), name: name.trim(), createdAt: new Date().toISOString() }); saveState(); modal.close(); renderKnowledgeBase();
    });
    $('#addKnowledgeNote')?.addEventListener('click', () => openKnowledgeNoteModal());
    $$('.knowledge-folder').forEach(button => button.addEventListener('click', () => {
      $$('.knowledge-note').forEach(note => note.hidden = note.dataset.folderId !== button.dataset.folder);
    }));
    $$('.edit-note').forEach(button => button.addEventListener('click', () => openKnowledgeNoteModal(state.notes.find(note => note.id === button.dataset.id))));
    $$('.delete-note').forEach(button => button.addEventListener('click', () => { const note = state.notes.find(item => item.id === button.dataset.id); if (!note || !confirm(`Переместить «${note.title}» в корзину?`)) return; pushToTrash('notes', note); state.notes = state.notes.filter(item => item.id !== note.id); saveState({ label: `Удалена заметка: ${note.title}` }); modal.close(); renderKnowledgeBase(); }));
  }

  function openKnowledgeNoteModal(item = null) {
    const folderOptions = state.noteFolders.map(folder => `<option value="${folder.id}" ${item?.folderId === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>`).join('');
    openModal(item ? 'Изменить запись' : 'Новая запись', `
      <div class="field"><label>Папка</label><select name="folderId">${folderOptions}</select></div>
      <div class="field"><label>Заголовок</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Например, запуск новых кампаний"></div>
      <div class="field"><label>Мысли, идеи, контекст</label><textarea name="body" rows="10" required>${escapeHtml(item?.body || '')}</textarea></div>
      <div class="field"><label>Теги</label><input name="tags" value="${escapeHtml(item?.tags || '')}" placeholder="реклама, идея, SenyaMarketing"></div>
      <div class="field"><label>Связать с проектом</label><select name="projectId">${projectOptions(item?.projectId || '')}</select></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      if (!data.title.trim() || !data.body.trim()) return false;
      if (item) Object.assign(item, data, { updatedAt: new Date().toISOString() }); else state.notes.push({ id: uid(), ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      return true;
    });
  }

  async function derivePinHash(pin, saltBytes) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 180000, hash: 'SHA-256' }, keyMaterial, 256);
    return bytesToBase64(bits);
  }

  function securityAvailable() {
    return Boolean(window.isSecureContext && window.PublicKeyCredential && navigator.credentials);
  }

  function lockApp(message = '') {
    if (!(security.pinEnabled || security.faceIdEnabled) || !lockScreen) return;
    appLocked = true;
    document.body.classList.add('app-locked');
    lockScreen.hidden = false;
    unlockFaceIdButton.hidden = !security.faceIdEnabled;
    unlockPinForm.hidden = !security.pinEnabled;
    const faceOrb = $('.face-orb');
    if (faceOrb) faceOrb.hidden = !security.faceIdEnabled;
    $('.lock-divider')?.toggleAttribute('hidden', !security.pinEnabled || !security.faceIdEnabled);
    $('.lock-card h2').textContent = security.faceIdEnabled ? 'Разблокировка Face ID' : 'Введите PIN-код';
    lockHint.textContent = message || (security.faceIdEnabled ? 'Подтверди вход, чтобы открыть личные данные.' : 'Введи PIN-код для доступа к данным.');
    lockError.textContent = '';
    unlockPinInput.value = '';
    if (faceStatus) {
      faceStatus.hidden = !security.faceIdEnabled;
      faceStatus.className = 'face-status waiting';
      faceStatus.innerHTML = '<span></span> Ожидание Face ID';
    }
    clearTimeout(faceAutoTimer);
    if (security.faceIdEnabled && document.visibilityState !== 'hidden') {
      faceAutoTimer = setTimeout(() => unlockWithFaceId({ automatic: true }), 260);
    } else if (security.pinEnabled && document.visibilityState !== 'hidden') {
      setTimeout(() => unlockPinInput?.focus(), 120);
    }
  }

  function unlockApp() {
    appLocked = false;
    faceUnlockPending = false;
    clearTimeout(faceAutoTimer);
    document.body.classList.remove('app-locked');
    if (lockScreen) lockScreen.hidden = true;
    if (lockError) lockError.textContent = '';
    lastActivityAt = Date.now();
  }

  async function unlockWithFaceId(options = {}) {
    if (faceUnlockPending) return false;
    if (!security.faceIdEnabled || !security.faceCredentialId || !securityAvailable()) {
      lockError.textContent = 'Face ID недоступен на этом устройстве.';
      if (faceStatus) {
        faceStatus.className = 'face-status error';
        faceStatus.innerHTML = '<span></span> Face ID недоступен';
      }
      return false;
    }
    faceUnlockPending = true;
    try {
      lockError.textContent = '';
      if (faceStatus) {
        faceStatus.className = 'face-status scanning';
        faceStatus.innerHTML = '<span></span> Проверка Face ID';
      }
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
          allowCredentials: [{ type: 'public-key', id: base64ToBytes(security.faceCredentialId), transports: ['internal'] }]
        },
        mediation: 'optional'
      });
      security.failedAttempts = 0;
      if (faceStatus) {
        faceStatus.className = 'face-status success';
        faceStatus.innerHTML = '<span></span> Успешно';
      }
      setTimeout(unlockApp, 160);
      return true;
    } catch (error) {
      console.error(error);
      faceUnlockPending = false;
      if (faceStatus) {
        faceStatus.className = 'face-status error';
        faceStatus.innerHTML = '<span></span> Повтори Face ID';
      }
      lockError.textContent = options.automatic ? 'Не удалось запустить Face ID автоматически. Нажми «Повторить Face ID».' : error?.name === 'NotAllowedError' ? 'Проверка отменена. Повтори или введи PIN.' : 'Не удалось пройти Face ID.';
      return false;
    }
  }

  async function verifyPin(pin) {
    if (!security.pinEnabled) return false;
    if (Date.now() < security.blockedUntil) {
      const seconds = Math.ceil((security.blockedUntil - Date.now()) / 1000);
      lockError.textContent = `Слишком много попыток. Повтори через ${seconds} сек.`;
      return false;
    }
    const hash = await derivePinHash(String(pin || ''), base64ToBytes(security.pinSalt));
    if (hash === security.pinHash) {
      security.failedAttempts = 0;
      unlockApp();
      return true;
    }
    security.failedAttempts += 1;
    if (security.failedAttempts >= 5) {
      security.blockedUntil = Date.now() + 30000;
      security.failedAttempts = 0;
      lockError.textContent = '5 неверных попыток. Вход заблокирован на 30 секунд.';
    } else {
      lockError.textContent = `Неверный PIN. Осталось попыток: ${5 - security.failedAttempts}.`;
    }
    unlockPinInput?.select();
    return false;
  }

  async function setupPin() {
    if (!globalThis.crypto?.subtle) { alert('Шифрование PIN недоступно в этом браузере. Открой Alexander OS через HTTPS.'); return; }
    const pin = prompt('Придумай PIN-код из 4–8 цифр. Не используй дату рождения.');
    if (pin === null) return;
    if (!/^\d{4,8}$/.test(pin)) {
      alert('PIN должен содержать от 4 до 8 цифр.');
      return;
    }
    const repeat = prompt('Повтори PIN-код.');
    if (repeat !== pin) {
      alert('PIN-коды не совпадают.');
      return;
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    security.pinSalt = bytesToBase64(salt);
    security.pinHash = await derivePinHash(pin, salt);
    security.pinEnabled = true;
    saveSecurity();
    closeModal();
    toast('PIN-код включён');
    if (currentScreen === 'settings') renderSettings();
  }

  function disablePin() {
    if (!security.pinEnabled) return;
    if (!confirm(security.faceIdEnabled ? 'Отключить PIN-код? Face ID останется единственным способом входа.' : 'Отключить PIN-код? Защита приложения будет выключена.')) return;
    security.pinEnabled = false;
    security.pinHash = '';
    security.pinSalt = '';
    if (!security.faceIdEnabled) security.faceCredentialId = '';
    saveSecurity();
    closeModal();
    if (currentScreen === 'settings') renderSettings();
    toast('PIN-код отключён');
  }

  async function enableFaceId() {
    if (!securityAvailable()) {
      alert('Face ID для веб-приложения доступен только на поддерживаемом устройстве через HTTPS. Открой установленный Alexander OS на iPhone.');
      return;
    }
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Alexander OS' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: 'alexander-os-local-user',
            displayName: state.profile.name || 'Пользователь'
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          timeout: 60000,
          attestation: 'none',
          authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'discouraged', userVerification: 'required' }
        }
      });
      if (!credential) throw new Error('Credential was not created');
      security.faceCredentialId = bytesToBase64(credential.rawId);
      security.faceIdEnabled = true;
      saveSecurity();
      closeModal();
      toast('Face ID включён');
      if (currentScreen === 'settings') renderSettings();
    } catch (error) {
      console.error(error);
      alert(error?.name === 'NotAllowedError' ? 'Настройка Face ID отменена.' : 'Не удалось включить Face ID на этом устройстве.');
    }
  }

  function disableFaceId() {
    if (!security.faceIdEnabled) return;
    if (!confirm('Отключить Face ID для Alexander OS?')) return;
    security.faceIdEnabled = false;
    security.faceCredentialId = '';
    saveSecurity();
    closeModal();
    if (currentScreen === 'settings') renderSettings();
    toast('Face ID отключён');
  }

  function openSecuritySettings() {
    openModal('Безопасность', `
      <div class="security-overview">
        <div class="security-shield">⌾</div>
        <div><strong>${security.pinEnabled || security.faceIdEnabled ? 'Защита включена' : 'Защита выключена'}</strong><small>Локальная блокировка приложения на этом устройстве</small></div>
      </div>
      <div class="settings-list card security-list">
        <button type="button" class="settings-row" id="securityPin"><span>PIN-код<small>${security.pinEnabled ? 'Включён · нажми, чтобы изменить' : 'Можно использовать отдельно или вместе с Face ID'}</small></span><b>${security.pinEnabled ? 'Изменить' : 'Включить'}</b></button>
        ${security.pinEnabled ? '<button type="button" class="settings-row danger-soft" id="disablePin"><span>Отключить PIN<small>Face ID останется единственным способом входа</small></span><b>›</b></button>' : ''}
        <button type="button" class="settings-row" id="securityFace"><span>Face ID<small>${security.faceIdEnabled ? 'Автоматически при открытии' : securityAvailable() ? 'Можно включить без PIN' : 'Недоступен в этом браузере'}</small></span><b>${security.faceIdEnabled ? 'Отключить' : 'Включить'}</b></button>
        <label class="settings-row select-row"><span>Автоблокировка<small>При бездействии</small></span><select id="autoLockMinutes"><option value="0" ${Number(state.profile.autoLockMinutes || 0) === 0 ? 'selected' : ''}>Никогда</option><option value="1" ${Number(state.profile.autoLockMinutes || 0) === 1 ? 'selected' : ''}>Через 1 минуту</option><option value="5" ${Number(state.profile.autoLockMinutes || 0) === 5 ? 'selected' : ''}>Через 5 минут</option><option value="15" ${Number(state.profile.autoLockMinutes || 0) === 15 ? 'selected' : ''}>Через 15 минут</option></select></label>
        <label class="settings-row switch-row"><span>Блокировать при сворачивании<small>Рекомендуется для финансовых данных</small></span><input id="lockOnBackground" type="checkbox" ${state.profile.lockOnBackground !== false ? 'checked' : ''}></label>
      </div>
      <div class="privacy-note"><b>Важно:</b> Face ID запускается автоматически при открытии, если он включён. Приложение не блокируется, пока ты сам не включишь Face ID или PIN-код.</div>
    `, null, { hideActions: true });
    $('#securityPin')?.addEventListener('click', setupPin);
    $('#disablePin')?.addEventListener('click', disablePin);
    $('#securityFace')?.addEventListener('click', () => security.faceIdEnabled ? disableFaceId() : enableFaceId());
    $('#autoLockMinutes')?.addEventListener('change', event => { state.profile.autoLockMinutes = Number(event.target.value || 0); saveState({ snapshot: false }); toast('Автоблокировка сохранена'); });
    $('#lockOnBackground')?.addEventListener('change', event => { state.profile.lockOnBackground = event.target.checked; saveState({ snapshot: false }); toast('Настройка сохранена'); });
  }

  function openProfileSettings() {
    openModal('Профиль', `
      <div class="profile-editor-head"><div class="settings-avatar">S</div><div><b>Alexander OS</b><small>Персональные настройки</small></div></div>
      <div class="field"><label>Имя</label><input name="name" value="${escapeHtml(state.profile.name || '')}" required></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      state.profile.name = String(data.name || '').trim() || 'Пользователь';
      return true;
    });
  }

  function openFinancePreferences() {
    openModal('Финансы и цели', `
      <div class="form-grid"><div class="field"><label>Цель капитала, ₽</label><input name="capitalTarget" type="number" min="0" value="${state.profile.capitalTarget}"></div><div class="field"><label>Цель дохода, ₽/мес.</label><input name="monthlyIncomeTarget" type="number" min="0" value="${state.profile.monthlyIncomeTarget}"></div></div>
      <div class="form-grid"><div class="field"><label>Цель подушки, ₽</label><input name="cushionTarget" type="number" min="0" value="${state.profile.cushionTarget}"></div><div class="field"><label>Лимит расходов, ₽</label><input name="monthlyExpenseLimit" type="number" min="0" value="${state.profile.monthlyExpenseLimit}"></div></div>
    `, form => {
      const data = Object.fromEntries(new FormData(form));
      state.profile.capitalTarget = Number(data.capitalTarget || 0);
      state.profile.monthlyIncomeTarget = Number(data.monthlyIncomeTarget || 0);
      state.profile.cushionTarget = Number(data.cushionTarget || 0);
      state.profile.monthlyExpenseLimit = Number(data.monthlyExpenseLimit || 0);
      return true;
    });
  }

  function openAppearanceSettings() {
    openModal('Внешний вид', `
      <p class="modal-description">Четыре темы используют одну систему контрастов, поэтому текст, поля и кнопки остаются читаемыми.</p>
      <div class="theme-picker exact-theme-picker" role="radiogroup">
        ${[['emerald','Изумрудная','#42e778','Основная'],['neonlime','Неон лайм','#d7ff19','Контрастная'],['graphite','Графитовая','#59636b','Нейтральная'],['light','Светлая','#f5f7f6','Дневная']].map(([key,label,color,subtitle]) => `<button type="button" class="theme-choice ${state.profile.theme === key ? 'active' : ''}" data-theme-modal="${key}" role="radio" aria-checked="${state.profile.theme === key}"><span style="--theme-dot:${color}"></span><b>${label}</b><small>${subtitle}</small></button>`).join('')}
      </div>`, null, { hideActions: true });
    $$('[data-theme-modal]', modalBody).forEach(button => button.addEventListener('click', () => {
      state.profile.theme = button.dataset.themeModal;
      saveState({ snapshot: false });
      applyTheme();
      closeModal();
      render();
      toast('Тема изменена');
    }));
  }


  const WORKOUT_GROUPS = [
    ['all', 'Все'], ['chest', 'Грудь'], ['back', 'Спина'], ['legs', 'Ноги'], ['shoulders', 'Плечи'], ['arms', 'Руки'], ['core', 'Корпус'], ['glutes', 'Ягодицы']
  ];

  const WORKOUT_EXERCISES = [
    {
      id:'squat', group:'legs', title:'Приседания с весом тела', sets:'3 подхода', reps:'8–12 повторений',
      note:'Поставь стопы примерно на ширине плеч. Отведи таз назад и вниз, сохраняя стопы полностью на полу. Колени направляй по линии носков.',
      mistakes:['Колени заваливаются внутрь','Пятки отрываются от пола','Движение выполняется слишком быстро'],
      easier:'Приседание до стула', harder:'Гоблет-присед с лёгким весом', muscles:'Ноги и ягодицы', icon:'squat',
      videoId:'BPBX4HTcVcs', source:'World Class Россия', videoLabel:'Приседания: правильная техника'
    },
    {
      id:'pushup', group:'chest', title:'Отжимания', sets:'3 подхода', reps:'6–15 повторений',
      note:'Сохраняй прямую линию от головы до пяток. Ладони немного шире плеч. Опускай корпус контролируемо и не проваливай поясницу.',
      mistakes:['Локти сильно разведены в стороны','Таз опускается раньше корпуса','Шея вытягивается вперёд'],
      easier:'Отжимания от высокой опоры', harder:'Медленное опускание на 3 секунды', muscles:'Грудь, трицепс и корпус', icon:'pushup',
      videoId:'jjwKTsl4HWE', source:'World Class Россия', videoLabel:'Отжимания: правильная техника'
    },
    {
      id:'row', group:'back', title:'Тяга в наклоне', sets:'3 подхода', reps:'8–12 повторений',
      note:'Отведи таз назад, сохрани нейтральную спину и тяни вес к нижним рёбрам. Плечи не поднимай к ушам.',
      mistakes:['Спина округляется','Корпус раскачивается','Вес тянется только руками'],
      easier:'Тяга одной рукой с опорой', harder:'Пауза в верхней точке', muscles:'Спина и задняя поверхность плеч', icon:'row',
      videoId:'n2tuBztj5tk', source:'Сергей Сивец', videoLabel:'Тяга гантелей к поясу'
    },
    {
      id:'lunge', group:'legs', title:'Выпады назад', sets:'3 подхода', reps:'8–10 на ногу',
      note:'Шагни назад достаточно далеко, чтобы передняя стопа оставалась полностью на полу. Опускайся плавно и отталкивайся серединой передней стопы.',
      mistakes:['Переднее колено заваливается внутрь','Слишком короткий шаг','Потеря равновесия из-за спешки'],
      easier:'Выпад с опорой рукой', harder:'Выпад с лёгкими гантелями', muscles:'Ноги и ягодицы', icon:'lunge',
      videoId:'d3xVz2ObWyg', source:'Иван Красавин', videoLabel:'Выпады: техника и частые ошибки'
    },
    {
      id:'plank', group:'core', title:'Планка на предплечьях', sets:'3 подхода', reps:'20–45 секунд',
      note:'Поставь локти под плечами, напряги живот и ягодицы. Тело образует прямую линию. Закончи подход до того, как поясница начнёт прогибаться.',
      mistakes:['Поясница провисает','Таз поднят слишком высоко','Задерживается дыхание'],
      easier:'Планка с колен', harder:'Дольше удерживать при идеальной форме', muscles:'Корпус, плечи и ягодицы', icon:'plank',
      videoId:'R73Q4uiFJ-Q', source:'Твой тренер', videoLabel:'Планка: техника и нюансы'
    },
    {
      id:'sideplank', group:'core', title:'Боковая планка', sets:'2–3 подхода', reps:'15–35 секунд на сторону',
      note:'Локоть держи под плечом. Подними таз и сохрани корпус прямым. Не разворачивай грудную клетку к полу.',
      mistakes:['Плечо уходит к уху','Таз опускается','Корпус вращается вперёд'],
      easier:'Боковая планка с согнутыми коленями', harder:'Подъём верхней ноги', muscles:'Боковая поверхность корпуса', icon:'plank',
      videoId:'nBc0g3rhi8I', source:'Трамонтана', videoLabel:'Боковая планка: техника выполнения'
    },
    {
      id:'press', group:'shoulders', title:'Жим гантелей над головой', sets:'3 подхода', reps:'8–12 повторений',
      note:'Напряги корпус и не переразгибай поясницу. Поднимай вес вертикально, не выталкивая голову вперёд.',
      mistakes:['Сильный прогиб в пояснице','Плечи поднимаются к ушам','Вес опускается без контроля'],
      easier:'Жим сидя с лёгкими гантелями', harder:'Пауза в верхней точке', muscles:'Плечи и трицепс', icon:'press',
      videoId:'X5bgyaiWoJI', source:'Кузница Спорта', videoLabel:'Жим гантелей сидя'
    },
    {
      id:'curl', group:'arms', title:'Сгибание рук со штангой', sets:'2–3 подхода', reps:'10–15 повторений',
      note:'Локти держи рядом с корпусом. Поднимай вес без раскачивания и медленно возвращай его вниз.',
      mistakes:['Корпус раскачивается','Локти уходят вперёд','Вес бросается вниз'],
      easier:'Лёгкие гантели поочерёдно', harder:'Медленная негативная фаза', muscles:'Бицепс и предплечья', icon:'curl',
      videoId:'8ignu7DXOWw', source:'Олег Гундуров', videoLabel:'Сгибание рук со штангой стоя'
    },
    {
      id:'bridge', group:'glutes', title:'Ягодичный мост', sets:'3 подхода', reps:'12–15 повторений',
      note:'Толкайся пятками, поднимай таз до прямой линии корпуса и не переразгибай поясницу. В верхней точке напряги ягодицы.',
      mistakes:['Толчок идёт носками','Поясница переразгибается','Колени расходятся или заваливаются'],
      easier:'Меньшая амплитуда', harder:'Одноногий мост после освоения базы', muscles:'Ягодицы и задняя поверхность бедра', icon:'bridge',
      videoId:'96SMWKjpYLg', source:'Алеся, фитнес-тренер', videoLabel:'Ягодичный мост: правильная техника'
    }
  ];

  function workoutGoalLabel(value) {
    return ({ health:'Общее здоровье', strength:'Сила', endurance:'Выносливость', mobility:'Подвижность' })[value] || 'Общее здоровье';
  }

  function workoutLevelLabel(value) {
    return ({ beginner:'Начальный', intermediate:'Средний', advanced:'Опытный' })[value] || 'Начальный';
  }

  function workoutIconSvg(type) {
    const paths = {
      squat:'<path d="M28 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"/><path d="m27 16-7 10 8 7 11-2 7 11M20 26 10 37l9 13M39 31l-2 18M11 37H3M37 49h9"/>',
      pushup:'<circle cx="49" cy="19" r="5"/><path d="m44 23-17 4-11 13 22 1 12 8M27 27l-8 12M16 40 5 48M38 41l-7 9"/>',
      row:'<circle cx="22" cy="13" r="5"/><path d="m19 18 12 9 13 2M31 27l-10 8-4 15M31 27l8 21M44 29l10-5M51 21l6 6"/>',
      lunge:'<circle cx="26" cy="11" r="5"/><path d="m25 16-2 17 15 5 11 12M23 33 10 43 4 51M38 38l9-3"/>',
      plank:'<circle cx="52" cy="24" r="4"/><path d="m47 27-20 4-13 13M27 31 8 34M14 44 5 50M27 31l20 13M47 44h10"/>',
      press:'<circle cx="31" cy="15" r="5"/><path d="M31 20v20M20 30h22M22 29 16 9M40 29l6-20M12 9h8M42 9h8M25 40l-5 14M37 40l5 14"/>',
      curl:'<circle cx="30" cy="13" r="5"/><path d="M30 18v20M22 24l-7 13M38 24l8 13M13 36h7M42 36h8M25 38l-4 15M35 38l4 15"/>',
      bridge:'<circle cx="50" cy="34" r="4"/><path d="M46 36 31 29 18 35 8 48M31 29l8 20M18 35l-5 14M8 48H3M39 49h8"/>'
    };
    return `<svg class="exercise-svg" viewBox="0 0 64 64" aria-hidden="true">${paths[type] || paths.squat}</svg>`;
  }

  function workoutPlan(profile) {
    const days = Math.max(2, Math.min(5, Number(profile.days || 3)));
    const templates = [
      { title:'Всё тело A', subtitle:'Ноги, грудь, спина и корпус', ids:['squat','pushup','row','plank'] },
      { title:'Всё тело B', subtitle:'Ноги, плечи, ягодицы и руки', ids:['lunge','press','bridge','curl'] },
      { title:'Мобильность и корпус', subtitle:'Контроль движения и восстановление', ids:['plank','sideplank','bridge'] },
      { title:'Сила всего тела', subtitle:'Контролируемая техника без отказа', ids:['squat','row','pushup','press'] },
      { title:'Функциональная тренировка', subtitle:'Выносливость и координация', ids:['lunge','pushup','plank','bridge'] }
    ];
    return templates.slice(0, days);
  }

  function workoutNutritionMarkup(profile) {
    const goal = workoutGoalLabel(profile.goal);
    return `<div class="nutrition-grid">
      <article><span>🥗</span><b>Основа тарелки</b><small>Овощи или фрукты, источник белка и сложные углеводы.</small></article>
      <article><span>🥚</span><b>Белок регулярно</b><small>Добавляй яйца, рыбу, птицу, бобовые, творог или другой удобный источник.</small></article>
      <article><span>💧</span><b>Вода</b><small>Пей в течение дня и дополнительно после активной тренировки.</small></article>
      <article><span>🍚</span><b>Энергия для занятий</b><small>Перед тренировкой подойдёт обычный приём пищи без переедания.</small></article>
    </div><p class="workout-disclaimer">Цель: ${escapeHtml(goal)}. Рекомендации общие и не заменяют врача или тренера. При боли, травме, головокружении или резком ухудшении самочувствия остановись.</p>`;
  }

  function workoutGroupLabel(group) {
    return Object.fromEntries(WORKOUT_GROUPS)[group] || 'Упражнение';
  }

  function workoutYoutubeUrl(item) {
    return `https://www.youtube.com/watch?v=${item.videoId}`;
  }

  function workoutThumbUrl(item) {
    return `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
  }

  function workoutVideoPosterInner(item, compact = false) {
    return `<img loading="lazy" src="${workoutThumbUrl(item)}" alt="Видео: ${escapeHtml(item.title)}"><span class="video-shade"></span><button type="button" class="workout-play ${compact ? 'compact' : ''}" data-play-workout-video="${item.id}" aria-label="Воспроизвести ${escapeHtml(item.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5Z"/></svg></button><span class="video-source">${escapeHtml(item.source)}</span>`;
  }

  function workoutVideoShell(item, compact = false) {
    return `<div class="workout-video-shell ${compact ? 'compact' : ''}" data-video-shell="${item.id}">${workoutVideoPosterInner(item, compact)}</div>`;
  }

  function workoutFavoriteButton(item) {
    const active = (state.workoutFavorites || []).includes(item.id);
    return `<button type="button" class="workout-favorite ${active ? 'active' : ''}" data-toggle-workout-favorite="${item.id}" aria-pressed="${active}" aria-label="${active ? 'Убрать из избранного' : 'Добавить в избранное'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg></button>`;
  }

  function workoutVideoCard(item) {
    return `<article class="workout-video-card" data-workout-item="${item.id}">
      ${workoutVideoShell(item)}
      <div class="workout-video-copy">
        <div class="workout-video-title"><div><span>${escapeHtml(workoutGroupLabel(item.group))}</span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.muscles)} · ${escapeHtml(item.videoLabel)}</p></div>${workoutFavoriteButton(item)}</div>
        <div class="workout-video-metrics"><span>${escapeHtml(item.sets)}</span><span>${escapeHtml(item.reps)}</span></div>
        <details class="workout-technique"><summary>Техника и частые ошибки <i>⌄</i></summary><p>${escapeHtml(item.note)}</p><b>Частые ошибки</b><ul>${item.mistakes.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul><div class="workout-variants"><span><small>Проще</small>${escapeHtml(item.easier)}</span><span><small>Сложнее</small>${escapeHtml(item.harder)}</span></div></details>
        <div class="workout-video-actions"><button type="button" class="btn primary" data-play-workout-video="${item.id}">Смотреть</button><button type="button" class="btn secondary" data-open-workout-youtube="${item.id}">Открыть в YouTube</button></div>
      </div>
    </article>`;
  }

  function workoutExerciseCards(group = 'all') {
    const items = WORKOUT_EXERCISES.filter(item => group === 'all' || item.group === group);
    return items.length ? items.map(workoutVideoCard).join('') : empty('Для этой группы пока нет видео.');
  }

  function workoutReelCard(item) {
    return `<article class="workout-reel" data-workout-item="${item.id}">
      ${workoutVideoShell(item)}
      <div class="workout-reel-copy"><div><span>${escapeHtml(workoutGroupLabel(item.group))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.muscles)}</p></div>${workoutFavoriteButton(item)}</div>
      <div class="workout-reel-meta"><span>${escapeHtml(item.sets)}</span><span>${escapeHtml(item.reps)}</span></div>
      <button type="button" class="btn primary full" data-play-workout-video="${item.id}">Запустить видео</button>
    </article>`;
  }

  function workoutReelsMarkup(group = 'all') {
    const items = WORKOUT_EXERCISES.filter(item => group === 'all' || item.group === group);
    return items.length ? items.map(workoutReelCard).join('') : empty('Для этой группы пока нет видео.');
  }

  function workoutFavoritesMarkup() {
    const ids = new Set(state.workoutFavorites || []);
    const items = WORKOUT_EXERCISES.filter(item => ids.has(item.id));
    return items.length ? items.map(workoutVideoCard).join('') : `<div class="workout-empty-favorites"><span>☆</span><h3>Избранное пусто</h3><p>Нажимай на звезду у упражнения, чтобы быстро возвращаться к нему.</p></div>`;
  }

  function workoutFiltersMarkup(target, selected = 'all') {
    return `<div class="exercise-filters workout-video-filters">${WORKOUT_GROUPS.map(([key,label]) => `<button type="button" class="chip ${selected===key?'active':''}" data-workout-filter="${key}" data-filter-target="${target}">${label}</button>`).join('')}</div>`;
  }

  function openWorkoutModal(initialTab = 'plan') {
    const profile = { ...freshState().workoutProfile, ...(state.workoutProfile || {}) };
    const plan = workoutPlan(profile);
    openModal('Тренировки', `
      <nav class="workout-hub-tabs" aria-label="Разделы тренировок">
        ${[['plan','Мой план'],['catalog','Каталог'],['reels','Видео-лента'],['favorites','Избранное']].map(([key,label]) => `<button type="button" class="${initialTab===key?'active':''}" data-workout-tab="${key}">${label}</button>`).join('')}
      </nav>

      <section class="workout-tab-panel" data-workout-panel="plan" ${initialTab==='plan'?'':'hidden'}>
        <section class="workout-profile-grid">
          <label><span>Рост, см</span><input name="height" type="number" min="100" max="230" value="${profile.height}"></label>
          <label><span>Возраст</span><input name="age" type="number" min="12" max="90" value="${profile.age}"></label>
          <label><span>Вес, кг</span><input name="weight" type="number" min="30" max="250" step="0.1" value="${profile.weight}"></label>
          <label><span>Цель</span><select name="goal"><option value="health" ${profile.goal==='health'?'selected':''}>Общее здоровье</option><option value="strength" ${profile.goal==='strength'?'selected':''}>Сила</option><option value="endurance" ${profile.goal==='endurance'?'selected':''}>Выносливость</option><option value="mobility" ${profile.goal==='mobility'?'selected':''}>Подвижность</option></select></label>
          <label><span>Уровень</span><select name="level"><option value="beginner" ${profile.level==='beginner'?'selected':''}>Начальный</option><option value="intermediate" ${profile.level==='intermediate'?'selected':''}>Средний</option><option value="advanced" ${profile.level==='advanced'?'selected':''}>Опытный</option></select></label>
          <label><span>Тренировок в неделю</span><select name="days">${[2,3,4,5].map(day => `<option value="${day}" ${Number(profile.days)===day?'selected':''}>${day}</option>`).join('')}</select></label>
        </section>

        <section class="workout-recommendation" id="workoutRecommendation">
          <div><small>Рекомендация</small><strong>${profile.days} тренировки в неделю</strong><p>${workoutLevelLabel(profile.level)} уровень · ${workoutGoalLabel(profile.goal)} · 40–60 минут.</p></div>
          <span class="workout-ring">${profile.days}</span>
        </section>

        <section class="workout-section">
          <div class="section-head"><h3>План на неделю</h3><span class="badge">гибкий</span></div>
          <div class="workout-week" id="workoutWeek">${plan.map((day,index) => `<details ${index===0?'open':''}><summary><span>День ${index+1}</span><b>${escapeHtml(day.title)}</b><small>${escapeHtml(day.subtitle)}</small><i>⌄</i></summary><div>${day.ids.map(id => { const exercise = WORKOUT_EXERCISES.find(item => item.id===id); return `<button type="button" data-open-exercise-video="${exercise.id}"><span>${escapeHtml(exercise.title)}</span><small>${escapeHtml(exercise.sets)} · ${escapeHtml(exercise.reps)}</small><i>▶</i></button>`; }).join('')}</div></details>`).join('')}</div>
        </section>

        <section class="workout-section"><div class="section-head"><h3>Питание и восстановление</h3></div>${workoutNutritionMarkup(profile)}</section>

        <section class="workout-section faq-section"><div class="section-head"><h3>Часто задаваемые вопросы</h3></div>
          <details><summary>Как часто тренироваться?<i>⌄</i></summary><p>Начни с 2–3 тренировок в неделю. Добавляй день только после того, как восстановление и техника остаются стабильными.</p></details>
          <details><summary>Что делать, если пропустил занятие?<i>⌄</i></summary><p>Продолжи со следующего запланированного дня. Не нужно выполнять две тяжёлые тренировки подряд, чтобы «догнать» график.</p></details>
          <details><summary>Когда увеличивать нагрузку?<i>⌄</i></summary><p>Когда все повторения выполняются уверенно и с одинаковой техникой, добавь 1–2 повторения или небольшой вес.</p></details>
          <details><summary>Нужна ли разминка?<i>⌄</i></summary><p>Да. 5–10 минут лёгкого движения и несколько подготовительных повторений перед первым тяжёлым упражнением.</p></details>
        </section>
        <button type="button" class="btn primary full workout-save-profile" id="saveWorkoutProfile">Сохранить мой план</button>
      </section>

      <section class="workout-tab-panel" data-workout-panel="catalog" ${initialTab==='catalog'?'':'hidden'}>
        <div class="workout-video-intro"><div><small>Проверенная библиотека</small><h3>Техника упражнений</h3><p>Видео запускается только после нажатия. Одновременно работает один плеер.</p></div><span>${WORKOUT_EXERCISES.length}</span></div>
        ${workoutFiltersMarkup('catalog')}
        <div class="workout-video-grid" id="workoutCatalog">${workoutExerciseCards()}</div>
      </section>

      <section class="workout-tab-panel" data-workout-panel="reels" ${initialTab==='reels'?'':'hidden'}>
        <div class="workout-video-intro"><div><small>Вертикальная лента</small><h3>Листай упражнения</h3><p>Листай вверх или вниз. Все видео и пояснения полностью на русском языке.</p></div><span>↕</span></div>
        ${workoutFiltersMarkup('reels')}
        <div class="workout-reels" id="workoutReels">${workoutReelsMarkup()}</div>
      </section>

      <section class="workout-tab-panel" data-workout-panel="favorites" ${initialTab==='favorites'?'':'hidden'}>
        <div class="workout-video-intro"><div><small>Быстрый доступ</small><h3>Избранные упражнения</h3><p>Сохраняются внутри резервной копии Alexander OS.</p></div><span>☆</span></div>
        <div class="workout-video-grid" id="workoutFavorites">${workoutFavoritesMarkup()}</div>
      </section>

      <p class="workout-video-disclaimer">Видео используются как справочник по технике. Выбирай комфортную нагрузку. При боли или плохом самочувствии остановись.</p>
    `, () => false, { hideActions: true });

    modal.classList.add('workout-dialog', 'video-workout-dialog');
    let catalogGroup = 'all';
    let reelsGroup = 'all';

    const switchTab = tab => {
      stopOtherPlayers();
      $$('[data-workout-tab]', modalBody).forEach(button => button.classList.toggle('active', button.dataset.workoutTab === tab));
      $$('[data-workout-panel]', modalBody).forEach(panel => { panel.hidden = panel.dataset.workoutPanel !== tab; });
      if (tab === 'favorites') {
        const container = $('#workoutFavorites');
        if (container) container.innerHTML = workoutFavoritesMarkup();
      }
      modalBody.scrollTop = 0;
    };

    const refreshPreview = () => {
      const formData = Object.fromEntries(new FormData(modalForm));
      const live = { ...profile, ...formData, days:Number(formData.days || profile.days) };
      const recommendation = $('#workoutRecommendation');
      if (recommendation) recommendation.innerHTML = `<div><small>Рекомендация</small><strong>${live.days} тренировки в неделю</strong><p>${workoutLevelLabel(live.level)} уровень · ${workoutGoalLabel(live.goal)} · 40–60 минут.</p></div><span class="workout-ring">${live.days}</span>`;
      const week = $('#workoutWeek');
      if (week) week.innerHTML = workoutPlan(live).map((day,index) => `<details ${index===0?'open':''}><summary><span>День ${index+1}</span><b>${escapeHtml(day.title)}</b><small>${escapeHtml(day.subtitle)}</small><i>⌄</i></summary><div>${day.ids.map(id => { const exercise = WORKOUT_EXERCISES.find(item => item.id===id); return `<button type="button" data-open-exercise-video="${exercise.id}"><span>${escapeHtml(exercise.title)}</span><small>${escapeHtml(exercise.sets)} · ${escapeHtml(exercise.reps)}</small><i>▶</i></button>`; }).join('')}</div></details>`).join('');
    };

    const stopOtherPlayers = exceptShell => {
      $$('[data-video-shell]', modalBody).forEach(shell => {
        if (!shell.classList.contains('playing') || shell === exceptShell) return;
        const item = WORKOUT_EXERCISES.find(value => value.id === shell.dataset.videoShell);
        if (!item) return;
        shell.classList.remove('playing');
        shell.innerHTML = workoutVideoPosterInner(item, shell.classList.contains('compact'));
      });
    };

    const playVideo = (id, trigger) => {
      const item = WORKOUT_EXERCISES.find(value => value.id === id);
      const card = trigger?.closest('[data-workout-item]');
      const shell = trigger?.closest('[data-video-shell]') || card?.querySelector(`[data-video-shell="${id}"]`);
      if (!item || !shell) return;
      stopOtherPlayers(shell);
      shell.classList.add('playing');
      shell.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&hl=ru&cc_lang_pref=ru&iv_load_policy=3&controls=1" title="${escapeHtml(item.title)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="eager"></iframe>`;
    };

    const updateFavoriteButtons = id => {
      const active = (state.workoutFavorites || []).includes(id);
      $$(`[data-toggle-workout-favorite="${id}"]`, modalBody).forEach(button => {
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const favorites = $('#workoutFavorites');
      if (favorites && !favorites.closest('[hidden]')) favorites.innerHTML = workoutFavoritesMarkup();
    };

    $$('input,select', modalBody).forEach(input => input.addEventListener('change', refreshPreview));

    modalBody.onclick = event => {
      const tabButton = event.target.closest('[data-workout-tab]');
      if (tabButton) { switchTab(tabButton.dataset.workoutTab); return; }

      const filterButton = event.target.closest('[data-workout-filter]');
      if (filterButton) {
        const target = filterButton.dataset.filterTarget;
        const group = filterButton.dataset.workoutFilter;
        $$(`[data-filter-target="${target}"]`, modalBody).forEach(button => button.classList.toggle('active', button === filterButton));
        if (target === 'catalog') { catalogGroup = group; $('#workoutCatalog').innerHTML = workoutExerciseCards(catalogGroup); }
        if (target === 'reels') { reelsGroup = group; $('#workoutReels').innerHTML = workoutReelsMarkup(reelsGroup); }
        return;
      }

      const planExercise = event.target.closest('[data-open-exercise-video]');
      if (planExercise) {
        switchTab('catalog');
        const item = WORKOUT_EXERCISES.find(value => value.id === planExercise.dataset.openExerciseVideo);
        if (item) {
          catalogGroup = item.group;
          $$('[data-filter-target="catalog"]', modalBody).forEach(button => button.classList.toggle('active', button.dataset.workoutFilter === item.group));
          $('#workoutCatalog').innerHTML = workoutExerciseCards(item.group);
          setTimeout(() => {
            modalBody.querySelector(`[data-workout-item="${item.id}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' });
          }, 40);
        }
        return;
      }

      const playButton = event.target.closest('[data-play-workout-video]');
      if (playButton) { playVideo(playButton.dataset.playWorkoutVideo, playButton); return; }

      const youtubeButton = event.target.closest('[data-open-workout-youtube]');
      if (youtubeButton) {
        const item = WORKOUT_EXERCISES.find(value => value.id === youtubeButton.dataset.openWorkoutYoutube);
        if (item) window.open(workoutYoutubeUrl(item), '_blank', 'noopener,noreferrer');
        return;
      }

      const favoriteButton = event.target.closest('[data-toggle-workout-favorite]');
      if (favoriteButton) {
        const id = favoriteButton.dataset.toggleWorkoutFavorite;
        const values = new Set(state.workoutFavorites || []);
        if (values.has(id)) values.delete(id); else values.add(id);
        state.workoutFavorites = [...values];
        saveState({ snapshot:false });
        updateFavoriteButtons(id);
        toast(values.has(id) ? 'Добавлено в избранное' : 'Удалено из избранного');
        return;
      }

      if (event.target.closest('#saveWorkoutProfile')) {
        const data = Object.fromEntries(new FormData(modalForm));
        state.workoutProfile = {
          height: Math.max(100, Math.min(230, Number(data.height || 177))),
          age: Math.max(12, Math.min(90, Number(data.age || 18))),
          weight: Math.max(30, Math.min(250, Number(data.weight || 70))),
          goal: data.goal || 'health',
          level: data.level || 'beginner',
          days: Math.max(2, Math.min(5, Number(data.days || 3))),
          equipment: 'mixed',
          savedAt: new Date().toISOString()
        };
        saveState();
        toast('План тренировок сохранён');
      }
    };
  }

  function renderSettings(target = app) {
    const notificationSupported = 'Notification' in window && 'serviceWorker' in navigator;
    const notificationStatus = !notificationSupported ? 'Не поддерживаются' : Notification.permission === 'granted' && state.profile.notificationsEnabled ? 'Включены' : Notification.permission === 'denied' ? 'Запрещены' : 'Выключены';
    const securityStatus = security.faceIdEnabled && security.pinEnabled ? 'Face ID + PIN' : security.faceIdEnabled ? 'Face ID' : security.pinEnabled ? 'PIN-код' : 'Не настроена';
    target.innerHTML = `
      <section class="settings-screen v11-settings">
        <button class="card settings-profile-card" type="button" id="profileSettings">
          <div class="settings-avatar">S</div><div><h2>${escapeHtml(state.profile.name || 'Пользователь')}</h2><p>Твоя система. Твой прогресс. Твоя жизнь.</p></div><span>›</span>
        </button>

        <section class="card v11-theme-card">
          <div class="section-head"><div><h2>Внешний вид</h2><small>Тема меняется мгновенно</small></div></div>
          <div class="v11-theme-picker">
            ${[['emerald','Изумрудная','#33e36d'],['neonlime','Неон лайм','#d7ff19'],['graphite','Графитовая','#364149'],['light','Светлая','#f2efe5']].map(([key,label,color]) => `<button type="button" class="v11-theme-choice ${state.profile.theme===key?'active':''}" data-theme-inline="${key}"><span style="--theme-swatch:${color}"></span><b>${label}</b></button>`).join('')}
          </div>
        </section>

        <section class="settings-list card exact-settings-list">
          <button class="settings-row" type="button" id="securitySettings"><i class="settings-icon">◇</i><span>Безопасность<small>${securityStatus} · автоблокировка</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="financePreferences"><i class="settings-icon">▥</i><span>Финансы<small>Валюта, категории и цели</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="notificationSettings"><i class="settings-icon">♢</i><span>Уведомления<small>${notificationStatus}</small></span><b>›</b></button>
        </section>

        <section class="settings-list card exact-settings-list">
          <button class="settings-row featured" type="button" id="exportEncryptedData"><i class="settings-icon">⇧</i><span>Резервное копирование<small>Защищённая копия .aos</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="exportData"><i class="settings-icon">⇩</i><span>Экспорт JSON<small>Полная копия всех данных</small></span><b>›</b></button>
          <label class="settings-row file-row"><i class="settings-icon">↺</i><span>Импорт данных<small>Точное восстановление JSON или .aos</small></span><b>›</b><input id="importData" type="file" accept=".json,.aos,application/json,application/octet-stream"></label>
          <button class="settings-row" type="button" id="exportChatGPT"><i class="settings-icon">✦</i><span>Отчёт для ChatGPT<small>Финансы, задачи, цели, тренировки и заметки</small></span><b>›</b></button>
        </section>

        <section class="settings-list card exact-settings-list stability-settings">
          <button class="settings-row" type="button" id="openHistory"><i class="settings-icon">↶</i><span>История изменений<small>${state.history.length} сохранённых состояний</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="openTrash"><i class="settings-icon">⌫</i><span>Корзина<small>${state.trash.length} удалённых записей</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="openDiagnostics"><i class="settings-icon">✓</i><span>Диагностика системы<small>${state.profile.lastDiagnosticsAt ? `Последняя: ${longDateText(state.profile.lastDiagnosticsAt.slice(0,10))}` : 'Проверка базы и автоматические тесты'}</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="openRecurringFromSettings"><i class="settings-icon">↻</i><span>Регулярные операции<small>${state.recurringRules.length} правил</small></span><b>›</b></button>
        </section>

        <section class="settings-list card exact-settings-list">
          <button class="settings-row" type="button" id="openKnowledgeBase"><i class="settings-icon">◫</i><span>База мыслей<small>${state.notes.length} записей · ${state.noteFolders.length} папок</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="installHelp"><i class="settings-icon">▯</i><span>Установка на iPhone<small>Добавить на экран «Домой»</small></span><b>›</b></button>
          <button class="settings-row" type="button" id="lockNow" ${security.pinEnabled || security.faceIdEnabled ? '' : 'disabled'}><i class="settings-icon">⌁</i><span>Заблокировать сейчас<small>Проверить Face ID или PIN</small></span><b>›</b></button>
        </section>
        <section class="settings-list card exact-settings-list"><button class="settings-row danger" type="button" id="resetData"><i class="settings-icon">×</i><span>Сбросить все данные<small>Действие нельзя отменить</small></span><b>›</b></button></section>
        <p class="app-version">Alexander OS V11.6 · Video Workouts RU</p>
      </section>`;

    $('#profileSettings')?.addEventListener('click', openProfileSettings);
    $('#securitySettings')?.addEventListener('click', openSecuritySettings);
    $('#financePreferences')?.addEventListener('click', openFinancePreferences);
    $('#lockNow')?.addEventListener('click', () => lockApp());
    $('#openKnowledgeBase')?.addEventListener('click', openKnowledgeBase);
    $('#openHistory')?.addEventListener('click', openHistoryManager);
    $('#openTrash')?.addEventListener('click', openTrashManager);
    $('#openDiagnostics')?.addEventListener('click', openDiagnostics);
    $('#openRecurringFromSettings')?.addEventListener('click', openRecurringRules);
    $('#notificationSettings')?.addEventListener('click', requestNotifications);
    $('#installHelp')?.addEventListener('click', () => alert('Открой приложение в Safari, нажми «Поделиться», затем «На экран Домой» и «Добавить».'));
    $('#exportData')?.addEventListener('click', exportData);
    $('#exportEncryptedData')?.addEventListener('click', exportEncryptedData);
    $('#exportChatGPT')?.addEventListener('click', exportChatGPTData);
    $('#importData')?.addEventListener('change', importData);
    $$('[data-theme-inline]').forEach(button => button.addEventListener('click', () => {
      state.profile.theme = button.dataset.themeInline;
      saveState({ snapshot:false });
      applyTheme();
      renderSettings(target);
      toast('Тема изменена');
    }));
    $('#resetData')?.addEventListener('click', () => {
      if (!confirm('Точно удалить все данные и вернуть стартовую версию?')) return;
      state = freshState();
      saveState();
      render();
    });
  }

  function openSettingsModal() {
    openModal('Настройки', '', null, { hideActions: true });
    modal.classList.add('settings-dialog');
    renderSettings(modalBody);
    requestAnimationFrame(() => { modalBody.scrollTop = 0; });
  }

  async function requestNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Этот браузер не поддерживает уведомления. На iPhone сначала установи приложение на экран Домой и открой его оттуда.');
      return;
    }
    const permission = await Notification.requestPermission();
    state.profile.notificationsEnabled = permission === 'granted';
    saveState();
    if (currentScreen === 'settings') renderSettings();
    if (permission === 'granted') {
      await showNotification('Alexander OS', 'Уведомления включены. Новые задачи и напоминания будут показываться на устройстве.', 'notifications-enabled');
    } else {
      alert('Разрешение не выдано. Его можно изменить в настройках уведомлений iPhone или браузера.');
    }
  }

  async function shareOrDownloadFile(filename, content, type = 'text/plain') {
    const file = new File([content], filename, { type });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') return false;
      }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  async function deriveBackupKey(password, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptBackupPayload(payload, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(password, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      format: 'AlexanderOSEncryptedBackup',
      schemaVersion: 1,
      appVersion: '11.6',
      exportedAt: new Date().toISOString(),
      kdf: { name: 'PBKDF2', iterations: 250000, hash: 'SHA-256', salt: bytesToBase64(salt) },
      cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
      ciphertext: bytesToBase64(ciphertext)
    };
  }

  async function decryptBackupPayload(wrapper, password) {
    if (wrapper?.format !== 'AlexanderOSEncryptedBackup') throw new Error('Not encrypted backup');
    const salt = base64ToBytes(wrapper.kdf?.salt || '');
    const iv = base64ToBytes(wrapper.cipher?.iv || '');
    const key = await deriveBackupKey(password, salt);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(wrapper.ciphertext || ''));
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async function exportEncryptedData() {
    if (!globalThis.crypto?.subtle) { alert('Защищённый экспорт доступен только через HTTPS в современном браузере.'); return; }
    const password = prompt('Придумай пароль для резервной копии. Минимум 8 символов.');
    if (password === null) return;
    if (password.length < 8) {
      alert('Пароль должен содержать минимум 8 символов.');
      return;
    }
    const repeat = prompt('Повтори пароль резервной копии.');
    if (repeat !== password) {
      alert('Пароли не совпадают.');
      return;
    }
    try {
      state.profile.lastBackup = todayISO();
      saveState({ snapshot: false });
      const encrypted = await encryptBackupPayload(createBackupPayload(state), password);
      await shareOrDownloadFile(`alexander-os-secure-${todayISO()}.aos`, JSON.stringify(encrypted), 'application/octet-stream');
      if (currentScreen === 'settings') renderSettings();
      toast('Защищённая копия создана');
    } catch (error) {
      console.error(error);
      alert('Не удалось создать защищённую копию на этом устройстве.');
    }
  }

  function createBackupPayload(sourceState = state) {
    return {
      format: 'AlexanderOSBackup',
      schemaVersion: 1,
      appVersion: '11.6',
      exportedAt: new Date().toISOString(),
      data: clone(sourceState)
    };
  }

  function extractBackupData(parsed) {
    if (parsed?.format === 'AlexanderOSBackup' && parsed?.data && typeof parsed.data === 'object') return parsed.data;
    if (parsed && typeof parsed === 'object' && (parsed.profile || parsed.tasks || parsed.transactions)) return parsed;
    throw new Error('Unsupported backup format');
  }

  function validateBackupData(data) {
    if (!data || typeof data !== 'object') return false;
    const requiredArrays = ['tasks', 'accounts', 'transactions', 'obligations', 'projects', 'goals', 'habits', 'weeklyReviews', 'noteFolders', 'notes', 'snapshots'];
    const optionalArrays = ['history', 'trash', 'recurringRules', 'customExpenseCategories', 'workoutLogs', 'workoutFavorites'];
    if (!data.profile || typeof data.profile !== 'object') return false;
    return requiredArrays.every(key => Array.isArray(data[key])) && optionalArrays.every(key => data[key] === undefined || Array.isArray(data[key]));
  }

  function backupSummary(data) {
    return `${data.tasks.length} задач, ${data.transactions.length} операций, ${data.projects.length} проектов, ${data.goals.length} целей, ${data.notes.length} заметок, ${(data.customExpenseCategories || []).length} своих категорий, ${(data.workoutLogs || []).length} тренировок, ${(data.workoutFavorites || []).length} избранных видео`;
  }

  async function exportData() {
    state.profile.lastBackup = todayISO();
    saveState({ snapshot: false });
    const payload = createBackupPayload(state);
    await shareOrDownloadFile(`alexander-os-full-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    if (currentScreen === 'settings') renderSettings();
    toast('Полная резервная копия создана');
  }

  function reportList(items, formatter, emptyText = 'Нет данных') {
    return items.length ? items.map(formatter).join('\n') : `- ${emptyText}`;
  }

  function createChatGPTReport() {
    const analytics = getFinanceAnalytics();
    const currentTasks = taskWeekStats(new Date(), true);
    const previousTasks = taskWeekStats(addDays(new Date(), -7), true);
    const currentHabits = habitWeekStats(new Date(), true);
    const previousHabits = habitWeekStats(addDays(new Date(), -7), true);
    const insights = systemInsights();
    const overdueTasks = state.tasks.filter(task => task.status !== 'done' && task.due && task.due < todayISO());
    const openTasks = state.tasks.filter(task => task.status !== 'done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const recentTransactions = state.transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 200);
    const monthSeries = monthlyMoneySeries(6);
    const generatedAt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());

    return `# Alexander OS - данные для анализа в ChatGPT

Сформировано: ${generatedAt}
Период актуальности: данные на ${longDateText(todayISO())}

## Задача для ChatGPT

Проанализируй мои данные как персональный стратег по финансам, доходу, маркетингу, дисциплине и проектам. Не пересказывай цифры. Найди слабые места, противоречия, риски и точки роста. Дай:
1. Главные 5 выводов.
2. Где я теряю деньги и время.
3. Какие решения принять на этой неделе.
4. Какие расходы сократить без ущерба целям.
5. Как увеличить доход и капитал.
6. Какие задачи, проекты и привычки требуют внимания.
7. Конкретный план на 7 и 30 дней.

## Профиль и цели

- Имя: ${state.profile.name || 'Не указано'}
- Цель капитала: ${money(state.profile.capitalTarget)}
- Цель дохода в месяц: ${money(state.profile.monthlyIncomeTarget)}
- Цель подушки: ${money(state.profile.cushionTarget)}
- Лимит расходов в месяц: ${money(state.profile.monthlyExpenseLimit)}

## Финансовая сводка

- Общий капитал: ${money(analytics.capital)}
- Активы: ${money(analytics.assets)}
- Долги: ${money(analytics.debt)}
- Ликвидно: ${money(analytics.liquid)}
- Свободный остаток после ближайших платежей: ${money(analytics.freeBalance)}
- Доход за текущий месяц: ${money(analytics.monthIncome)}
- Расход за текущий месяц: ${money(analytics.monthExpense)}
- Чистый поток месяца: ${money(analytics.monthBalance)}
- Процент сбережений: ${analytics.savingsRate}%
- Расход за текущую неделю: ${money(analytics.weekExpense)}
- Прогноз расходов до конца месяца: ${money(analytics.projectedExpense)}
- Остаток лимита расходов: ${money(analytics.remainingLimit)}
- Необязательные расходы месяца: ${money(analytics.optionalExpense)}

### Динамика за 6 месяцев
${reportList(monthSeries, row => `- ${row.label}: доход ${money(row.income)}, расход ${money(row.expense)}, чистый поток ${money(row.net)}`)}

### Счета
${reportList(state.accounts, account => `- ${account.name}: ${money(account.balance)} (${accountTypeText(account.type)})${account.isDefault ? ', основной' : ''}`)}

### Категории расходов текущего месяца
${reportList(analytics.categoryRows, row => `- ${row.label}: ${money(row.amount)} (${analytics.monthExpense ? Math.round(row.amount / analytics.monthExpense * 100) : 0}% расходов)`)}

### Открытые обязательства
${reportList(openObligations(), item => `- ${item.title}: ${money(item.amount)}, тип ${obligationTypeText(item.type)}, срок ${longDateText(item.dueDate)}, статус ${item.status}`)}

### Последние операции (до 200)
${reportList(recentTransactions, tx => `- ${tx.date}: ${tx.type === 'income' ? 'доход' : 'расход'} ${money(tx.amount)} - ${tx.title}; категория ${categoryLabel(tx.category)}; ${tx.notes || 'без комментария'}`)}

## Задачи и исполнение

- Выполнение задач текущей недели: ${currentTasks.rate}% (${currentTasks.completed} из ${currentTasks.total})
- Выполнение прошлой недели: ${previousTasks.rate}%
- Открытых задач: ${openTasks.length}
- Просроченных задач: ${overdueTasks.length}

### Открытые задачи
${reportList(openTasks.slice(0, 100), task => `- [${task.priority}] ${task.title}; статус ${taskStatusText(task.status)}; срок ${longDateText(task.due)}${task.dueTime ? ` ${task.dueTime}` : ''}; проект ${state.projects.find(project => project.id === task.projectId)?.name || task.project || 'не указан'}; ${task.notes || 'без комментария'}`)}

## Проекты и клиенты

${reportList(state.projects, project => `- ${project.name}: тип ${projectTypeText(project.type)}, статус ${projectStatusText(project.status)}, ожидаемый доход ${money(project.value)}, оплата ${paymentStatusText(project.paymentStatus)}, следующий шаг: ${project.next || 'не указан'}, заметки: ${project.notes || 'нет'}`)}

## База мыслей и идей

${reportList(state.notes.slice().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')), note => `- [${state.noteFolders.find(folder => folder.id === note.folderId)?.name || 'Без папки'}] ${note.title} (${longDateText((note.updatedAt || note.createdAt || '').slice(0,10))}): ${note.body || 'без текста'}${note.tags ? `; теги: ${note.tags}` : ''}`)}

## Цели

${reportList(state.goals, goal => { const current = goalCurrent(goal); const percent = Math.round(current / Math.max(1, Number(goal.target || 1)) * 100); return `- ${goal.title}: ${numberText(current)}${goal.unit ? ` ${goal.unit}` : ''} из ${numberText(goal.target)}${goal.unit ? ` ${goal.unit}` : ''} (${percent}%), срок ${longDateText(goal.deadline)}, следующий шаг: ${goal.nextAction || 'не указан'}`; })}

## Привычки и дисциплина

- Выполнение привычек текущей недели: ${currentHabits.rate}% (${currentHabits.completed} из ${currentHabits.planned})
- Выполнение прошлой недели: ${previousHabits.rate}%
${reportList(state.habits, habit => `- ${habit.title}: месяц ${habitMonthPercent(habit)}%, серия ${habitStreak(habit)} дней, цель ${habit.targetPerWeek} раз в неделю`)}

## Тренировки и восстановление

- Рост: ${state.workoutProfile?.height || 'не указан'} см
- Возраст: ${state.workoutProfile?.age || 'не указан'}
- Вес: ${state.workoutProfile?.weight || 'не указан'} кг
- Цель: ${workoutGoalLabel(state.workoutProfile?.goal || 'health')}
- Уровень: ${workoutLevelLabel(state.workoutProfile?.level || 'beginner')}
- План: ${state.workoutProfile?.days || 3} тренировок в неделю

### Журнал тренировок

${reportList(state.workoutLogs.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,30), log => `- ${longDateText(log.date)}: ${log.type}, ${log.duration} минут, нагрузка ${log.effort}/5; ${log.notes || 'без комментария'}`)}

## Регулярные операции

${reportList(state.recurringRules, rule => `- ${rule.title}: ${rule.type === 'income' ? 'доход' : 'расход'} ${money(rule.amount)}, каждый месяц ${rule.day}-го числа, категория ${categoryLabel(rule.category)}`)}

## Автоматические выводы Alexander OS

${reportList(insights, item => `- ${item.text}`)}

## Недельные разборы

${reportList(state.weeklyReviews.slice().sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || '')).slice(0, 12), review => `- Неделя с ${longDateText(review.weekStart)}: заработано ${money(review.income)}, отложено ${money(review.saved)}; результаты: ${review.wins || 'не указаны'}; ошибки: ${review.failures || 'не указаны'}; потери времени: ${review.timeLeaks || 'не указаны'}; вывод: ${review.lesson || 'не указан'}; приоритеты: ${review.priorities || 'не указаны'}`)}

## Полные данные приложения в JSON

\`\`\`json
${JSON.stringify(state, null, 2)}
\`\`\`
`;
  }

  async function exportChatGPTData() {
    state.profile.lastChatGPTExport = todayISO();
    saveState();
    const report = createChatGPTReport();
    await shareOrDownloadFile(`alexander-os-chatgpt-${todayISO()}.md`, report, 'text/markdown');
    if (currentScreen === 'settings') renderSettings();
    toast('Отчёт для ChatGPT подготовлен');
  }

  async function importData(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      let parsed = JSON.parse(await file.text());
      if (parsed?.format === 'AlexanderOSEncryptedBackup') {
        const password = prompt('Введите пароль защищённой резервной копии.');
        if (password === null) return;
        try {
          parsed = await decryptBackupPayload(parsed, password);
        } catch (error) {
          throw new Error('Wrong password or damaged encrypted backup');
        }
      }
      const backupData = extractBackupData(parsed);
      if (!validateBackupData(backupData)) throw new Error('Backup validation failed');
      const summary = backupSummary(backupData);
      const confirmed = confirm(`Импорт полностью заменит текущие данные приложения.\n\nВ файле: ${summary}.\n\nПродолжить?`);
      if (!confirmed) return;

      safeStorage.setItem('alexander_os_pre_import_backup', JSON.stringify(createBackupPayload(state)));
      state = normalizeState(clone(backupData));
      state.version = 11;
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      financeSelectedMonth = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`;
      applyTheme();
      render();
      toast(`Восстановлено: ${summary}`);
    } catch (error) {
      console.error(error);
      alert(error?.message?.includes('Wrong password') ? 'Неверный пароль или файл повреждён.' : 'Не удалось импортировать файл. Выбери JSON или .aos, скачанный через «Экспорт данных» в Alexander OS.');
    } finally {
      input.value = '';
    }
  }

  $('#profileSettingsTrigger')?.addEventListener('click', openSettingsModal);

  $$('.nav-item[data-screen]').forEach(button => button.addEventListener('click', () => switchScreen(button.dataset.screen)));

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

  $('#globalAdd').addEventListener('click', openGlobalAdd);
  $('#floatingAdd')?.addEventListener('click', openGlobalAdd);

  unlockFaceIdButton?.addEventListener('click', unlockWithFaceId);
  unlockPinForm?.addEventListener('submit', event => {
    event.preventDefault();
    verifyPin(unlockPinInput.value);
  });
  ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => document.addEventListener(eventName, () => { if (!appLocked) lastActivityAt = Date.now(); }, { passive: true }));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(() => checkTaskReminders()).catch(console.error));
  }
  setInterval(checkTaskReminders, 60000);
  setInterval(() => {
    const minutes = Number(state.profile.autoLockMinutes || 0);
    if (!appLocked && minutes > 0 && (security.pinEnabled || security.faceIdEnabled) && Date.now() - lastActivityAt >= minutes * 60000) lockApp('Приложение заблокировано из-за бездействия.');
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.profile.lockOnBackground !== false && (security.pinEnabled || security.faceIdEnabled)) lockApp('Приложение заблокировано после сворачивания.');
    } else {
      checkTaskReminders();
      if (appLocked && security.faceIdEnabled) {
        clearTimeout(faceAutoTimer);
        faceAutoTimer = setTimeout(() => unlockWithFaceId({ automatic: true }), 260);
      } else if (appLocked && security.pinEnabled) {
        setTimeout(() => unlockPinInput?.focus(), 120);
      }
    }
  });

  saveState({ history: false, snapshot: false });
  ensureRecurringObligations();
  render();
  const reviewWeek = localISO(startOfWeek(new Date()));
  const hasCurrentReview = state.weeklyReviews.some(review => review.weekStart === reviewWeek);
  if (security.pinEnabled || security.faceIdEnabled) lockApp();
})();
