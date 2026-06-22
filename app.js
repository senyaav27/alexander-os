(() => {
  'use strict';

  const STORAGE_KEY = 'alexander_os_v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const money = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' ₽';
  const dateText = value => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)) : 'Без срока';
  const fullDate = () => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));

  const defaultState = {
    version: 1,
    profile: { name: 'Пользователь', capitalTarget: 1000000, monthlyIncomeTarget: 200000, cushionTarget: 200000 },
    tasks: [
      { id: uid(), title: 'Определить 3 главные задачи дня', project: 'Личное управление', priority: 'high', due: todayISO(), done: false },
      { id: uid(), title: 'Проверить финансы и обязательные платежи', project: 'Финансы', priority: 'medium', due: todayISO(), done: false },
      { id: uid(), title: '30 минут профессионального развития', project: 'Развитие', priority: 'low', due: todayISO(), done: false }
    ],
    transactions: [],
    projects: [],
    goals: [
      { id: uid(), title: 'Капитал 1 000 000 ₽', current: 0, target: 1000000, deadline: '2026-12-31' },
      { id: uid(), title: 'Доход 200 000 ₽ в месяц', current: 0, target: 200000, deadline: '2026-12-31' }
    ],
    habits: [
      { id: uid(), title: 'Профессиональное развитие', logs: {} },
      { id: uid(), title: 'Работа над личным проектом', logs: {} },
      { id: uid(), title: 'Чтение', logs: {} },
      { id: uid(), title: 'Спорт', logs: {} },
      { id: uid(), title: 'Без импульсивных покупок', logs: {} }
    ],
    weeklyNotes: ''
  };

  let state = loadState();
  let currentScreen = 'dashboard';
  let modalAction = null;

  const app = $('#app');
  const modal = $('#modal');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const modalForm = $('#modalForm');
  const settingsModal = $('#settingsModal');

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return structuredClone(defaultState);
      return { ...structuredClone(defaultState), ...JSON.parse(saved) };
    } catch (error) {
      console.error(error);
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function render() {
    $('#todayLabel').textContent = fullDate();
    const titles = { dashboard: 'Главная', tasks: 'Задачи', finance: 'Финансы', projects: 'Проекты', growth: 'Рост' };
    $('#screenTitle').textContent = titles[currentScreen];
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === currentScreen));
    ({ dashboard: renderDashboard, tasks: renderTasks, finance: renderFinance, projects: renderProjects, growth: renderGrowth })[currentScreen]();
  }

  function getFinanceSummary() {
    const sumType = type => state.transactions.filter(x => x.type === type).reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const liquid = sumType('balance') + sumType('cash');
    const expected = sumType('income');
    const debt = sumType('debt');
    const expenses = sumType('expense');
    const capital = Math.max(0, liquid - debt);
    return { liquid, expected, debt, expenses, capital };
  }

  function taskCompletion() {
    const todays = state.tasks.filter(t => !t.due || t.due <= todayISO());
    if (!todays.length) return 100;
    return Math.round(todays.filter(t => t.done).length / todays.length * 100);
  }

  function habitCompletionToday() {
    if (!state.habits.length) return 100;
    return Math.round(state.habits.filter(h => h.logs?.[todayISO()]).length / state.habits.length * 100);
  }

  function overallScore() {
    const taskScore = taskCompletion();
    const habitScore = habitCompletionToday();
    const finance = getFinanceSummary();
    const cushionScore = Math.min(100, Math.round(finance.liquid / Math.max(1, state.profile.cushionTarget) * 100));
    return Math.round(taskScore * .45 + habitScore * .30 + cushionScore * .25);
  }

  function financeInsight() {
    const f = getFinanceSummary();
    if (f.debt > 0 && f.liquid < state.profile.cushionTarget) {
      return { cls: 'danger', text: `Сейчас нельзя разгонять крупные покупки. Ликвидные деньги ${money(f.liquid)}, долг ${money(f.debt)}, подушка ещё не сформирована.` };
    }
    if (f.liquid < state.profile.cushionTarget) {
      return { cls: 'warning', text: `До целевой подушки не хватает ${money(state.profile.cushionTarget - f.liquid)}. Свободные поступления лучше направлять в фундамент, а не в импульсивные траты.` };
    }
    return { cls: '', text: `Подушка достигла целевого уровня. Следующий приоритет - рост капитала и дохода без повышения постоянных расходов.` };
  }

  function renderDashboard() {
    const dueTasks = state.tasks.filter(t => !t.done && (!t.due || t.due <= todayISO())).slice(0, 4);
    const f = getFinanceSummary();
    const score = overallScore();
    const insight = financeInsight();
    const activeProjects = state.projects.filter(p => p.status !== 'paused').length;

    app.innerHTML = `
      <section class="hero">
        <div class="hero-top">
          <div>
            <h2>${score >= 75 ? 'Держишь курс' : score >= 45 ? 'Нужно собраться' : 'Система проседает'}</h2>
            <p>${score >= 75 ? 'Главное - не распыляться и закрыть ключевые действия дня.' : 'Не добавляй новые цели. Сначала верни контроль над текущими задачами и деньгами.'}</p>
          </div>
          <div class="score-ring" style="--score:${score}"><span>${score}</span></div>
        </div>
      </section>

      <section class="stats grid two">
        <div class="stat-card"><small>Деньги сейчас</small><strong>${money(f.liquid)}</strong></div>
        <div class="stat-card"><small>Ожидается</small><strong>${money(f.expected)}</strong></div>
        <div class="stat-card"><small>Задачи дня</small><strong>${taskCompletion()}%</strong></div>
        <div class="stat-card"><small>Активные проекты</small><strong>${activeProjects}</strong></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Главное сегодня</h2><button class="link-btn" data-go="tasks">Все задачи</button></div>
        <div class="list">
          ${dueTasks.length ? dueTasks.map(taskItem).join('') : empty('Все задачи на сегодня закрыты.')}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Финансовый контроль</h2><button class="link-btn" data-go="finance">Открыть</button></div>
        <div class="insight ${insight.cls}">${insight.text}</div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Привычки сегодня</h2><button class="link-btn" data-go="growth">Прогресс</button></div>
        <div class="grid two">
          ${state.habits.map(h => `
            <label class="card" style="display:flex;gap:10px;align-items:center;cursor:pointer">
              <input class="check habit-check" type="checkbox" data-id="${h.id}" ${h.logs?.[todayISO()] ? 'checked' : ''}>
              <span class="item-title" style="margin:0">${escapeHtml(h.title)}</span>
            </label>`).join('')}
        </div>
      </section>
    `;
    bindCommon();
  }

  function taskItem(t) {
    return `
      <div class="item ${t.done ? 'done' : ''}">
        <input class="check task-check" type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''}>
        <div class="item-main">
          <div class="item-title">${escapeHtml(t.title)}</div>
          <div class="item-meta">${escapeHtml(t.project || 'Без проекта')} · ${dateText(t.due)}</div>
          <div class="pill-row"><span class="badge ${t.priority}">${priorityText(t.priority)}</span></div>
        </div>
        <div class="item-actions">
          <button class="mini-btn edit-task" data-id="${t.id}" aria-label="Редактировать">✎</button>
          <button class="mini-btn delete-task" data-id="${t.id}" aria-label="Удалить">×</button>
        </div>
      </div>`;
  }

  function priorityText(value) {
    return ({ high: 'Высокий', medium: 'Средний', low: 'Низкий' })[value] || 'Средний';
  }

  function renderTasks() {
    const pending = state.tasks.filter(t => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const done = state.tasks.filter(t => t.done).slice().reverse();
    app.innerHTML = `
      <section class="section" style="margin-top:4px">
        <div class="section-head"><h2>В работе</h2><span class="badge">${pending.length}</span></div>
        <div class="list">${pending.length ? pending.map(taskItem).join('') : empty('Невыполненных задач нет.')}</div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Выполнено</h2><span class="badge">${done.length}</span></div>
        <div class="list">${done.length ? done.map(taskItem).join('') : empty('Здесь появятся закрытые задачи.')}</div>
      </section>
      <button class="fab" id="addTask" aria-label="Добавить задачу">＋</button>`;
    bindCommon();
    $('#addTask').addEventListener('click', () => openTaskModal());
  }

  function renderFinance() {
    const f = getFinanceSummary();
    const target = state.profile.capitalTarget;
    const progress = Math.min(100, Math.round(f.capital / Math.max(1, target) * 100));
    const insight = financeInsight();
    const ordered = state.transactions.slice().sort((a,b) => (b.date || '').localeCompare(a.date || ''));
    app.innerHTML = `
      <section class="hero">
        <p class="eyebrow">Чистый текущий капитал</p>
        <div class="kpi">${money(f.capital)}</div>
        <div class="metric-row"><span class="muted">Цель: ${money(target)}</span><strong>${progress}%</strong></div>
        <div class="progress"><span style="width:${progress}%"></span></div>
      </section>

      <section class="stats grid two">
        <div class="stat-card"><small>Ликвидные деньги</small><strong>${money(f.liquid)}</strong></div>
        <div class="stat-card"><small>Ожидаемые доходы</small><strong>${money(f.expected)}</strong></div>
        <div class="stat-card"><small>Долги</small><strong class="${f.debt ? 'negative' : ''}">${money(f.debt)}</strong></div>
        <div class="stat-card"><small>Расходы в учёте</small><strong>${money(f.expenses)}</strong></div>
      </section>

      <section class="section"><div class="insight ${insight.cls}">${insight.text}</div></section>

      <section class="section">
        <div class="section-head"><h2>Деньги и обязательства</h2><button class="link-btn" id="addFinance">Добавить</button></div>
        <div class="list">
          ${ordered.length ? ordered.map(x => `
            <div class="item">
              <div class="item-main">
                <div class="item-title">${escapeHtml(x.title)}</div>
                <div class="item-meta">${financeTypeText(x.type)} · ${dateText(x.date)}</div>
              </div>
              <div style="text-align:right">
                <strong class="${x.type === 'debt' || x.type === 'expense' ? 'negative' : x.type === 'income' ? 'positive' : ''}">${money(x.amount)}</strong>
                <div class="item-actions" style="margin-top:7px;justify-content:flex-end">
                  <button class="mini-btn edit-finance" data-id="${x.id}">✎</button>
                  <button class="mini-btn delete-finance" data-id="${x.id}">×</button>
                </div>
              </div>
            </div>`).join('') : empty('Добавьте деньги, долги и ожидаемые поступления.')}
        </div>
      </section>`;
    bindCommon();
    $('#addFinance').addEventListener('click', () => openFinanceModal());
  }

  function financeTypeText(type) {
    return ({ balance: 'На карте', cash: 'Наличные', income: 'Ожидаемый доход', debt: 'Долг', expense: 'Расход' })[type] || 'Запись';
  }

  function renderProjects() {
    const monthly = state.projects.filter(p => p.status === 'active').reduce((sum, p) => sum + Number(p.value || 0), 0);
    app.innerHTML = `
      <section class="hero">
        <p class="eyebrow">Доход по активным проектам</p>
        <div class="kpi">${money(monthly)} <span class="muted" style="font-size:14px">в месяц</span></div>
        <p style="margin-top:9px">Цель: ${money(state.profile.monthlyIncomeTarget)}. Не хватает ${money(Math.max(0, state.profile.monthlyIncomeTarget - monthly))}.</p>
      </section>
      <section class="section">
        <div class="section-head"><h2>Проекты и клиенты</h2><button class="link-btn" id="addProject">Добавить</button></div>
        <div class="list">
          ${state.projects.length ? state.projects.map(p => `
            <div class="card">
              <div class="metric-row"><div class="item-title">${escapeHtml(p.name)}</div><span class="badge ${p.status === 'active' ? 'low' : p.status === 'paused' ? 'high' : 'medium'}">${projectStatusText(p.status)}</span></div>
              <div class="metric-row"><span class="muted">Стоимость</span><strong>${money(p.value)}</strong></div>
              <div class="insight" style="margin-top:12px">Следующий шаг: ${escapeHtml(p.next || 'Не указан')}</div>
              <div class="item-actions" style="margin-top:12px;justify-content:flex-end">
                <button class="mini-btn edit-project" data-id="${p.id}">✎</button>
                <button class="mini-btn delete-project" data-id="${p.id}">×</button>
              </div>
            </div>`).join('') : empty('Добавьте первый проект или клиента.')}
        </div>
      </section>`;
    bindCommon();
    $('#addProject').addEventListener('click', () => openProjectModal());
  }

  function projectStatusText(status) {
    return ({ active: 'Активен', growth: 'Развитие', paused: 'Пауза' })[status] || 'Активен';
  }

  function getLast7Days() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { iso: d.toISOString().slice(0, 10), label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(d).slice(0,2) };
    });
  }

  function renderGrowth() {
    const days = getLast7Days();
    app.innerHTML = `
      <section class="section" style="margin-top:4px">
        <div class="section-head"><h2>Цели</h2><button class="link-btn" id="addGoal">Добавить</button></div>
        <div class="list">
          ${state.goals.length ? state.goals.map(g => {
            const pct = Math.min(100, Math.round(Number(g.current || 0) / Math.max(1, Number(g.target || 1)) * 100));
            return `<div class="card">
              <div class="metric-row"><div class="item-title">${escapeHtml(g.title)}</div><strong>${pct}%</strong></div>
              <div class="progress"><span style="width:${pct}%"></span></div>
              <div class="item-meta" style="margin-top:9px">${escapeHtml(g.current)} из ${escapeHtml(g.target)} · срок ${dateText(g.deadline)}</div>
              <div class="item-actions" style="margin-top:10px;justify-content:flex-end"><button class="mini-btn edit-goal" data-id="${g.id}">✎</button><button class="mini-btn delete-goal" data-id="${g.id}">×</button></div>
            </div>`;
          }).join('') : empty('Добавьте измеримую цель.')}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Привычки за 7 дней</h2><button class="link-btn" id="addHabit">Добавить</button></div>
        <div class="list">
          ${state.habits.map(h => `
            <div class="card">
              <div class="metric-row"><div class="item-title">${escapeHtml(h.title)}</div><button class="mini-btn delete-habit" data-id="${h.id}">×</button></div>
              <div class="week-grid">
                ${days.map(d => `<button class="day-cell habit-day ${h.logs?.[d.iso] ? 'done' : ''}" data-id="${h.id}" data-date="${d.iso}">${d.label}</button>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Недельный разбор</h2><button class="link-btn" id="saveReview">Сохранить</button></div>
        <div class="field"><textarea id="weeklyNotes" placeholder="Что сделал, где просел, сколько заработал, что главное на следующей неделе...">${escapeHtml(state.weeklyNotes || '')}</textarea></div>
        <div class="insight warning">Проверяй не занятость, а результат: деньги, клиенты, капитал, закрытые задачи и принятые решения.</div>
      </section>`;
    bindCommon();
    $('#addGoal').addEventListener('click', () => openGoalModal());
    $('#addHabit').addEventListener('click', () => openHabitModal());
    $('#saveReview').addEventListener('click', () => { state.weeklyNotes = $('#weeklyNotes').value.trim(); saveState(); toast('Недельный разбор сохранён'); });
  }

  function empty(text) {
    return `<div class="empty-state"><div class="empty-icon">＋</div><h3>Пока пусто</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function bindCommon() {
    $$('[data-go]').forEach(btn => btn.addEventListener('click', () => switchScreen(btn.dataset.go)));
    $$('.task-check').forEach(el => el.addEventListener('change', () => {
      const task = state.tasks.find(t => t.id === el.dataset.id); if (!task) return;
      task.done = el.checked; saveState(); render();
    }));
    $$('.habit-check').forEach(el => el.addEventListener('change', () => {
      const habit = state.habits.find(h => h.id === el.dataset.id); if (!habit) return;
      habit.logs ||= {}; habit.logs[todayISO()] = el.checked; saveState(); render();
    }));
    $$('.edit-task').forEach(btn => btn.addEventListener('click', () => openTaskModal(state.tasks.find(x => x.id === btn.dataset.id))));
    $$('.delete-task').forEach(btn => btn.addEventListener('click', () => removeItem('tasks', btn.dataset.id)));
    $$('.edit-finance').forEach(btn => btn.addEventListener('click', () => openFinanceModal(state.transactions.find(x => x.id === btn.dataset.id))));
    $$('.delete-finance').forEach(btn => btn.addEventListener('click', () => removeItem('transactions', btn.dataset.id)));
    $$('.edit-project').forEach(btn => btn.addEventListener('click', () => openProjectModal(state.projects.find(x => x.id === btn.dataset.id))));
    $$('.delete-project').forEach(btn => btn.addEventListener('click', () => removeItem('projects', btn.dataset.id)));
    $$('.edit-goal').forEach(btn => btn.addEventListener('click', () => openGoalModal(state.goals.find(x => x.id === btn.dataset.id))));
    $$('.delete-goal').forEach(btn => btn.addEventListener('click', () => removeItem('goals', btn.dataset.id)));
    $$('.delete-habit').forEach(btn => btn.addEventListener('click', () => removeItem('habits', btn.dataset.id)));
    $$('.habit-day').forEach(btn => btn.addEventListener('click', () => {
      const habit = state.habits.find(h => h.id === btn.dataset.id); if (!habit) return;
      habit.logs ||= {}; habit.logs[btn.dataset.date] = !habit.logs[btn.dataset.date]; saveState(); render();
    }));
  }

  function removeItem(collection, id) {
    if (!confirm('Удалить запись?')) return;
    state[collection] = state[collection].filter(x => x.id !== id);
    saveState(); render();
  }

  function openModal(title, body, action) {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalAction = action;
    modal.showModal();
  }

  function openTaskModal(item = null) {
    openModal(item ? 'Изменить задачу' : 'Новая задача', `
      <div class="field"><label>Задача</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Что нужно сделать"></div>
      <div class="field"><label>Проект</label><input name="project" value="${escapeHtml(item?.project || '')}" placeholder="SenyaMarketing, клиент, работа"></div>
      <div class="form-grid">
        <div class="field"><label>Приоритет</label><select name="priority"><option value="high" ${item?.priority === 'high' ? 'selected' : ''}>Высокий</option><option value="medium" ${!item || item?.priority === 'medium' ? 'selected' : ''}>Средний</option><option value="low" ${item?.priority === 'low' ? 'selected' : ''}>Низкий</option></select></div>
        <div class="field"><label>Срок</label><input name="due" type="date" value="${item?.due || todayISO()}"></div>
      </div>`, form => {
        const data = Object.fromEntries(new FormData(form));
        if (!data.title.trim()) return false;
        if (item) Object.assign(item, data); else state.tasks.push({ id: uid(), ...data, done: false });
        return true;
      });
  }

  function openFinanceModal(item = null) {
    openModal(item ? 'Изменить запись' : 'Новая финансовая запись', `
      <div class="field"><label>Название</label><input name="title" required value="${escapeHtml(item?.title || '')}" placeholder="Деньги на карте, кредит, доход"></div>
      <div class="form-grid">
        <div class="field"><label>Тип</label><select name="type">
          ${[['balance','На карте'],['cash','Наличные'],['income','Ожидаемый доход'],['debt','Долг'],['expense','Расход']].map(([v,t]) => `<option value="${v}" ${item?.type === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div class="field"><label>Сумма, ₽</label><input name="amount" type="number" min="0" step="1" required value="${item?.amount ?? ''}"></div>
      </div>
      <div class="field"><label>Дата</label><input name="date" type="date" value="${item?.date || todayISO()}"></div>`, form => {
        const data = Object.fromEntries(new FormData(form)); data.amount = Number(data.amount || 0);
        if (!data.title.trim()) return false;
        if (item) Object.assign(item, data); else state.transactions.push({ id: uid(), ...data });
        return true;
      });
  }

  function openProjectModal(item = null) {
    openModal(item ? 'Изменить проект' : 'Новый проект', `
      <div class="field"><label>Название</label><input name="name" required value="${escapeHtml(item?.name || '')}" placeholder="Клиент или проект"></div>
      <div class="form-grid">
        <div class="field"><label>Доход в месяц, ₽</label><input name="value" type="number" min="0" value="${item?.value ?? 0}"></div>
        <div class="field"><label>Статус</label><select name="status"><option value="active" ${item?.status === 'active' ? 'selected' : ''}>Активен</option><option value="growth" ${item?.status === 'growth' ? 'selected' : ''}>Развитие</option><option value="paused" ${item?.status === 'paused' ? 'selected' : ''}>Пауза</option></select></div>
      </div>
      <div class="field"><label>Следующий шаг</label><textarea name="next" placeholder="Конкретное действие">${escapeHtml(item?.next || '')}</textarea></div>
      <div class="field"><label>Дата оплаты</label><input name="paymentDate" type="date" value="${item?.paymentDate || ''}"></div>`, form => {
        const data = Object.fromEntries(new FormData(form)); data.value = Number(data.value || 0);
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
      <div class="field"><label>Срок</label><input name="deadline" type="date" value="${item?.deadline || ''}"></div>`, form => {
        const data = Object.fromEntries(new FormData(form)); data.current = Number(data.current || 0); data.target = Number(data.target || 1);
        if (!data.title.trim()) return false;
        if (item) Object.assign(item, data); else state.goals.push({ id: uid(), ...data });
        return true;
      });
  }

  function openHabitModal() {
    openModal('Новая привычка', `<div class="field"><label>Название</label><input name="title" required placeholder="Полезное действие"></div>`, form => {
      const title = new FormData(form).get('title').trim(); if (!title) return false;
      state.habits.push({ id: uid(), title, logs: {} }); return true;
    });
  }

  function switchScreen(screen) {
    currentScreen = screen;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toast(message) {
    const node = document.createElement('div');
    node.textContent = message;
    Object.assign(node.style, { position:'fixed', left:'50%', bottom:'110px', transform:'translateX(-50%)', background:'#f7f9ff', color:'#0a0f1a', padding:'11px 15px', borderRadius:'12px', fontWeight:'700', zIndex:'100', boxShadow:'0 12px 30px rgba(0,0,0,.35)' });
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 1800);
  }

  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => switchScreen(btn.dataset.screen)));

  modalForm.addEventListener('submit', event => {
    const submitter = event.submitter;
    if (!submitter || submitter.value === 'cancel') return;
    event.preventDefault();
    try {
      const ok = modalAction?.(modalForm);
      if (ok === false) return;
      saveState();
      modal.close();
      render();
      toast('Сохранено');
    } catch (error) {
      console.error(error);
      alert('Не удалось сохранить запись. Проверьте данные.');
    }
  });

  $('#settingsButton').addEventListener('click', () => settingsModal.showModal());
  $('#closeSettings').addEventListener('click', () => settingsModal.close());
  $('#installHelp').addEventListener('click', () => {
    alert('На iPhone откройте приложение в Safari, нажмите кнопку «Поделиться», затем «На экран Домой» и «Добавить». Для установки сайт должен быть опубликован по HTTPS.');
  });
  $('#exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `alexander-os-backup-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
  });
  $('#importData').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object') throw new Error('bad');
      state = { ...structuredClone(defaultState), ...parsed };
      saveState(); settingsModal.close(); render(); toast('Данные восстановлены');
    } catch { alert('Файл резервной копии повреждён или имеет неверный формат.'); }
    event.target.value = '';
  });
  $('#resetData').addEventListener('click', () => {
    if (!confirm('Точно удалить все данные и вернуть стартовую версию?')) return;
    state = structuredClone(defaultState); saveState(); settingsModal.close(); render();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
  }

  render();
})();
