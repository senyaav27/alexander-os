import type { AiSnapshot } from './types.js';

const month = (iso: string) => iso.slice(0, 7);
export function financeAnalysis(snapshot: AiSnapshot, now = new Date()) {
  const key = now.toISOString().slice(0, 7);
  const tx = snapshot.finances.transactions.filter(item => month(item.date) === key);
  const income = tx.filter(item => item.amount > 0 && !item.category.includes('expense')).reduce((n,item)=>n+item.amount,0);
  const expenses = tx.filter(item => item.amount < 0 || item.category.includes('expense')).reduce((n,item)=>n+Math.abs(item.amount),0);
  const openObligations = snapshot.finances.obligations.filter(item => item.status !== 'paid').reduce((n,item)=>n+item.amount,0);
  const availableCash = snapshot.finances.accounts.filter(item=>item.purpose !== 'cushion').reduce((n,item)=>n+item.balance,0) - openObligations;
  const budgetVariance = snapshot.finances.monthlyExpenseLimit - expenses;
  const incomeGap = Math.max(0, snapshot.finances.monthlyIncomeTarget - income);
  return { income, expenses, openObligations, availableCash, budgetVariance, incomeGap, overBudget: budgetVariance < 0 };
}

export function projectAnalysis(snapshot: AiSnapshot) {
  const openTasks = snapshot.tasks.filter(t=>t.status !== 'done');
  return snapshot.projects.map(project => ({
    id: project.id, name: project.name, status: project.status, expectedValue: project.expectedValue,
    nextAction: project.nextAction, openTasks: openTasks.filter(t=>t.projectId===project.id).length,
    bottleneck: project.status === 'active' && !project.nextAction ? 'Нет следующего действия' : null
  })).sort((a,b)=>b.expectedValue-a.expectedValue);
}

export function dailyBrief(snapshot: AiSnapshot, now = new Date()) {
  const f = financeAnalysis(snapshot, now); const projects = projectAnalysis(snapshot);
  const blocked = projects.filter(p=>p.bottleneck); const top = projects.find(p=>p.status==='active');
  return [
    'Alexander AI — Daily Brief', '', 'Главное:',
    `1. До цели дохода месяца не хватает ${Math.round(f.incomeGap).toLocaleString('ru-RU')} ₽.`,
    `2. ${blocked.length ? `${blocked.length} активн. проект(а) без next action.` : 'У активных проектов указаны следующие действия.'}`,
    `3. ${f.overBudget ? `Бюджет превышен на ${Math.round(-f.budgetVariance).toLocaleString('ru-RU')} ₽.` : `До лимита расходов остаётся ${Math.round(f.budgetVariance).toLocaleString('ru-RU')} ₽.`}`,
    '', 'Рекомендация:', top ? `• Сфокусироваться на «${top.name}»: ${top.nextAction || 'сформулировать одно измеримое следующее действие'}.` : '• Добавить хотя бы один активный проект и его следующее действие.',
    '', 'Финансы:', `• Доход: ${Math.round(f.income).toLocaleString('ru-RU')} ₽`, `• Расход: ${Math.round(f.expenses).toLocaleString('ru-RU')} ₽`, `• Свободный cash после обязательств: ${Math.round(f.availableCash).toLocaleString('ru-RU')} ₽`,
    '', 'Неопределённость:', snapshot.finances.transactions.length ? 'Расчёт основан на последнем синхронизированном snapshot.' : 'Нет операций: финансовые выводы ограничены.'
  ].join('\n');
}

