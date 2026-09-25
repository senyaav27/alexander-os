(() => {
  'use strict';

  const STORAGE_KEY = 'alexander_os_v1';
  const TRANSFER_KEY = 'accountTransfers';
  const money = value => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0))} ₽`;
  const pad = value => String(value).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const uid = () => `tr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' })[char]);

  const EXPENSE_CATEGORIES = [
    ['groceries','Продукты'],['cafes','Кафе и доставка'],['transport','Транспорт'],['taxi','Такси'],
    ['housing','Жильё'],['subscriptions','Подписки'],['health','Здоровье'],['clothing','Одежда'],
    ['entertainment','Развлечения'],['education','Обучение'],['business','Бизнес'],['gifts','Подарки'],
    ['debt_payment','Долги и кредиты'],['travel','Путешествия'],['other_expense','Другое']
  ];
  const INCOME_CATEGORIES = [
    ['salary','Зарплата'],['client','Клиенты'],['project_income','Свои проекты'],['shop','Магазин'],
    ['refund','Возврат'],['gift_income','Подарок'],['other_income','Другой доход']
  ];

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      parsed.accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
      parsed.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      parsed[TRANSFER_KEY] = Array.isArray(parsed[TRANSFER_KEY]) ? parsed[TRANSFER_KEY] : [];
      return parsed;
    } catch (error) {
      console.error('[AOS Finance 15.1] Не удалось прочитать данные', error);
      return null;
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function transactionDelta(tx) {
    return Number(tx?.amount || 0) * (tx?.type === 'income' ? 1 : -1);
  }

  function ledgerDelta(state, accountId) {
    return state.transactions
      .filter(tx => tx.accountId === accountId)
      .reduce((sum, tx) => sum + transactionDelta(tx), 0);
  }

  function ensureBaseBalance(state, account) {
    if (Number.isFinite(Number(account.baseBalance))) {
      account.baseBalance = Number(account.baseBalance || 0);
      return;
    }
    account.baseBalance = Number(account.balance || 0) - ledgerDelta(state, account.id);
  }

  function recalcBalances(state) {
    state.accounts.forEach(account => {
      ensureBaseBalance(state, account);
      account.balance = Number(account.baseBalance || 0) + ledgerDelta(state, account.id);
    });
  }

  function accountOptions(accounts, selectedId = '', excludeId = '') {
    return accounts
      .filter(account => account.id !== excludeId)
      .map(account => `<option value="${escapeHtml(account.id)}" ${account.id === selectedId ? 'selected' : ''}>${escapeHtml(account.name)} · ${money(account.balance)}</option>`)
      .join('');
  }

  function categoryOptions(type, selected = '') {
    const items = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return items.map(([id, label]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${label}</option>`).join('');
  }

  function ensureDialog() {
    let dialog = document.getElementById('aosAccountFlow');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'aosAccountFlow';
    dialog.className = 'aos-account-dialog';
    dialog.innerHTML = `
      <form class="aos-account-sheet" id="aosAccountFlowForm" novalidate>
        <div class="aos-account-sheet-head">
          <div><small>Счета</small><h2 id="aosAccountFlowTitle">Операция</h2></div>
          <button type="button" class="aos-account-close" aria-label="Закрыть">×</button>
        </div>
        <div class="aos-operation-tabs" role="tablist" aria-label="Тип операции">
          <button type="button" data-aos-mode="transfer" class="active">Перевод</button>
          <button type="button" data-aos-mode="expense">Расход</button>
          <button type="button" data-aos-mode="income">Пополнение</button>
        </div>
        <div id="aosAccountFlowFields"></div>
        <p class="aos-account-error" id="aosAccountFlowError" role="alert"></p>
        <button class="aos-account-submit" type="submit">Перевести</button>
      </form>`;
    document.body.append(dialog);
    dialog.querySelector('.aos-account-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
    return dialog;
  }

  let currentMode = 'transfer';
  let currentSourceId = '';

  function renderFlowFields(dialog) {
    const state = loadState();
    if (!state || !state.accounts.length) return;
    recalcBalances(state);
    const source = state.accounts.find(account => account.id === currentSourceId) || state.accounts[0];
    currentSourceId = source.id;
    const fields = dialog.querySelector('#aosAccountFlowFields');
    const title = dialog.querySelector('#aosAccountFlowTitle');
    const submit = dialog.querySelector('.aos-account-submit');
    const isTransfer = currentMode === 'transfer';
    const isExpense = currentMode === 'expense';
    title.textContent = isTransfer ? 'Перевод между счетами' : isExpense ? 'Расход со счёта' : 'Пополнение счёта';
    submit.textContent = isTransfer ? 'Перевести' : isExpense ? 'Сохранить расход' : 'Пополнить';

    const defaultTarget = state.accounts.find(account => account.id !== source.id)?.id || '';
    fields.innerHTML = `
      <label class="aos-field">
        <span>${isTransfer ? 'Списать со счёта' : isExpense ? 'Счёт расхода' : 'Счёт пополнения'}</span>
        <select name="sourceAccountId" id="aosSourceAccount">${accountOptions(state.accounts, source.id)}</select>
        <small>Доступно: <b id="aosSourceBalance">${money(source.balance)}</b></small>
      </label>
      ${isTransfer ? `<label class="aos-field"><span>Зачислить на счёт</span><select name="targetAccountId" id="aosTargetAccount">${accountOptions(state.accounts, defaultTarget, source.id)}</select></label>` : ''}
      <div class="aos-field-grid">
        <label class="aos-field"><span>Сумма, ₽</span><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0" required></label>
        <label class="aos-field"><span>Дата</span><input name="date" type="date" value="${todayISO()}" required></label>
      </div>
      ${!isTransfer ? `<label class="aos-field"><span>Категория</span><select name="category" id="aosOperationCategory">${categoryOptions(currentMode, currentMode === 'income' ? 'other_income' : 'other_expense')}</select></label>` : ''}
      <label class="aos-field"><span>${isTransfer ? 'Комментарий' : 'Название'}</span><input name="title" maxlength="90" placeholder="${isTransfer ? 'Например, в подушку' : isExpense ? 'Например, интернет' : 'Например, перевод от клиента'}"></label>
      ${isExpense ? `<div class="aos-field-grid"><label class="aos-field"><span>Характер</span><select name="necessity"><option value="required">Обязательная</option><option value="optional" selected>Необязательная</option></select></label><label class="aos-field"><span>Контекст</span><select name="scope"><option value="personal" selected>Личная</option><option value="work">Рабочая</option></select></label></div>` : ''}
      <div class="aos-flow-note">${isTransfer ? 'Перевод меняет только остатки счетов и не попадает в доходы или расходы.' : isExpense ? 'Сумма будет списана именно с выбранного счёта.' : 'Сумма будет добавлена именно на выбранный счёт.'}</div>`;

    const sourceSelect = fields.querySelector('#aosSourceAccount');
    sourceSelect?.addEventListener('change', () => {
      currentSourceId = sourceSelect.value;
      if (currentMode === 'transfer') renderFlowFields(dialog);
      else {
        const fresh = loadState();
        if (!fresh) return;
        recalcBalances(fresh);
        const selected = fresh.accounts.find(account => account.id === currentSourceId);
        const balance = fields.querySelector('#aosSourceBalance');
        if (selected && balance) balance.textContent = money(selected.balance);
      }
    });
  }

  function setMode(dialog, mode) {
    currentMode = mode;
    dialog.querySelectorAll('[data-aos-mode]').forEach(button => button.classList.toggle('active', button.dataset.aosMode === mode));
    dialog.querySelector('#aosAccountFlowError').textContent = '';
    renderFlowFields(dialog);
  }

  function openAccountFlow(sourceAccountId = '', mode = 'transfer') {
    const state = loadState();
    if (!state || !state.accounts.length) {
      alert('Сначала добавь хотя бы один счёт.');
      return;
    }
    if (mode === 'transfer' && state.accounts.length < 2) {
      alert('Для перевода нужно минимум два счёта.');
      return;
    }
    currentSourceId = sourceAccountId || state.accounts.find(account => account.isDefault)?.id || state.accounts[0].id;
    const dialog = ensureDialog();
    dialog.querySelectorAll('[data-aos-mode]').forEach(button => {
      button.onclick = () => setMode(dialog, button.dataset.aosMode);
    });
    setMode(dialog, mode);
    if (!dialog.open) dialog.showModal();
    setTimeout(() => dialog.querySelector('input[name="amount"]')?.focus(), 80);
  }

  function saveOperation(form, dialog) {
    const state = loadState();
    const error = dialog.querySelector('#aosAccountFlowError');
    if (!state) { error.textContent = 'Не удалось прочитать данные.'; return false; }
    recalcBalances(state);
    const data = Object.fromEntries(new FormData(form));
    const amount = Number(data.amount || 0);
    const source = state.accounts.find(account => account.id === data.sourceAccountId);
    if (!source || !Number.isFinite(amount) || amount <= 0) {
      error.textContent = 'Укажи корректный счёт и сумму.';
      return false;
    }

    if (currentMode === 'transfer') {
      const target = state.accounts.find(account => account.id === data.targetAccountId);
      if (!target || target.id === source.id) {
        error.textContent = 'Выбери другой счёт для зачисления.';
        return false;
      }
      if (amount > Number(source.balance || 0) + 0.001) {
        error.textContent = `Недостаточно средств. На «${source.name}» сейчас ${money(source.balance)}.`;
        return false;
      }
      ensureBaseBalance(state, source);
      ensureBaseBalance(state, target);
      source.baseBalance -= amount;
      target.baseBalance += amount;
      state[TRANSFER_KEY].unshift({
        id: uid(), amount, date: data.date || todayISO(), fromAccountId: source.id, toAccountId: target.id,
        fromName: source.name, toName: target.name, note: String(data.title || '').trim(), createdAt: new Date().toISOString()
      });
      state[TRANSFER_KEY] = state[TRANSFER_KEY].slice(0, 200);
    } else {
      const type = currentMode;
      const title = String(data.title || '').trim() || (type === 'expense' ? 'Расход' : 'Пополнение');
      state.transactions.push({
        id: uid(), title, type, amount, date: data.date || todayISO(),
        category: data.category || (type === 'income' ? 'other_income' : 'other_expense'), accountId: source.id,
        notes: '', necessity: type === 'expense' ? (data.necessity || 'unknown') : '',
        scope: type === 'expense' ? (data.scope || 'personal') : '', projectId: '', createdAt: new Date().toISOString()
      });
    }

    recalcBalances(state);
    saveState(state);
    dialog.close();
    location.reload();
    return true;
  }

  function reverseTransfer(id) {
    const state = loadState();
    if (!state) return;
    recalcBalances(state);
    const transfer = state[TRANSFER_KEY].find(item => item.id === id);
    if (!transfer) return;
    const source = state.accounts.find(account => account.id === transfer.fromAccountId);
    const target = state.accounts.find(account => account.id === transfer.toAccountId);
    if (!source || !target) {
      alert('Один из счетов этого перевода уже удалён. Автоматическая отмена недоступна.');
      return;
    }
    if (!confirm(`Отменить перевод ${money(transfer.amount)}: ${source.name} → ${target.name}?`)) return;
    ensureBaseBalance(state, source);
    ensureBaseBalance(state, target);
    source.baseBalance += Number(transfer.amount || 0);
    target.baseBalance -= Number(transfer.amount || 0);
    state[TRANSFER_KEY] = state[TRANSFER_KEY].filter(item => item.id !== id);
    recalcBalances(state);
    saveState(state);
    location.reload();
  }

  function injectAccountControls() {
    const addButton = document.getElementById('addAccount');
    if (!addButton) return;

    if (!document.getElementById('aosTransferAccounts')) {
      let actions = addButton.parentElement.querySelector('.aos-account-head-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'aos-account-head-actions';
        addButton.before(actions);
        actions.append(addButton);
      }
      const transferButton = document.createElement('button');
      transferButton.type = 'button';
      transferButton.id = 'aosTransferAccounts';
      transferButton.className = 'link-btn aos-transfer-head-btn';
      transferButton.textContent = 'Перевести';
      transferButton.addEventListener('click', () => openAccountFlow('', 'transfer'));
      actions.prepend(transferButton);
    }

    document.querySelectorAll('.edit-account[data-id]').forEach(editButton => {
      const actions = editButton.closest('.item-actions');
      if (!actions || actions.querySelector('.aos-account-action')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mini-btn aos-account-action';
      button.dataset.accountId = editButton.dataset.id;
      button.setAttribute('aria-label', 'Операции со счётом');
      button.title = 'Перевод, расход или пополнение';
      button.textContent = '↔';
      button.addEventListener('click', () => openAccountFlow(button.dataset.accountId, 'transfer'));
      actions.prepend(button);
    });

    injectTransferHistory(addButton.closest('section'));
  }

  function injectTransferHistory(accountsSection) {
    if (!accountsSection || document.getElementById('aosTransferHistory')) return;
    const state = loadState();
    const transfers = state?.[TRANSFER_KEY] || [];
    if (!transfers.length) return;
    const section = document.createElement('section');
    section.id = 'aosTransferHistory';
    section.className = 'section aos-transfer-history';
    section.innerHTML = `
      <div class="section-head"><h2>Последние переводы</h2><span class="badge">${transfers.length}</span></div>
      <div class="list">${transfers.slice(0, 6).map(transfer => `
        <div class="item aos-transfer-row">
          <div class="account-icon">↔</div>
          <div class="item-main"><div class="item-title">${escapeHtml(transfer.fromName)} → ${escapeHtml(transfer.toName)}</div><div class="item-meta">${escapeHtml(transfer.date)}${transfer.note ? ` · ${escapeHtml(transfer.note)}` : ''}</div></div>
          <div class="amount-block"><strong>${money(transfer.amount)}</strong><div class="item-actions"><button type="button" class="mini-btn aos-reverse-transfer" data-transfer-id="${escapeHtml(transfer.id)}" aria-label="Отменить перевод">↶</button></div></div>
        </div>`).join('')}</div>`;
    accountsSection.after(section);
    section.querySelectorAll('.aos-reverse-transfer').forEach(button => button.addEventListener('click', () => reverseTransfer(button.dataset.transferId)));
  }

  const dialog = ensureDialog();
  dialog.querySelector('#aosAccountFlowForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    saveOperation(event.currentTarget, dialog);
  });

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectAccountControls();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', injectAccountControls, { once: true });
  injectAccountControls();

  window.AlexanderOSFinance151 = { openAccountFlow };
})();
