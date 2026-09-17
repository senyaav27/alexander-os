import type { AiSnapshot } from './types.js';

export function localDate(now:Date, timeZone='Europe/Moscow') {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-');
}
const cents = (n:number) => Math.round(n*100);
const total = (items:number[]) => items.reduce((n,v)=>n+cents(v),0)/100;
export function financeAnalysis(snapshot: AiSnapshot, now = new Date(), timeZone='Europe/Moscow') {
  const day = localDate(now,timeZone), key=day.slice(0,7);
  const tx = snapshot.finances.transactions.filter(item => item.date.slice(0,7) === key && item.date <= day);
  const income = total(tx.filter(item=>item.amount>0).map(item=>item.amount));
  const expenses = total(tx.filter(item=>item.amount<0).map(item=>Math.abs(item.amount)));
  const openObligations = total(snapshot.finances.obligations.filter(item => item.status === 'open' && item.type !== 'expected').map(item=>item.amount));
  const availableCash = (cents(total(snapshot.finances.accounts.filter(item=>item.purpose === 'general').map(item=>item.balance))) - cents(openObligations))/100;
  const budgetVariance = (cents(snapshot.finances.monthlyExpenseLimit) - cents(expenses))/100;
  const incomeGap = snapshot.finances.targetMonth && snapshot.finances.targetMonth!==key ? null : Math.max(0, (cents(snapshot.finances.monthlyIncomeTarget) - cents(income))/100);
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

export function dailyBrief(snapshot: AiSnapshot, now = new Date(), timeZone='Europe/Moscow') {
  const f = financeAnalysis(snapshot, now, timeZone); const projects = projectAnalysis(snapshot);
  const blocked = projects.filter(p=>p.bottleneck); const top = projects.find(p=>p.status==='active');
  return [
    'Alexander AI — Daily Brief', '', 'Главное:',
    f.incomeGap===null ? '1. Цель текущего месяца неизвестна: нужен свежий sync.' : `1. До цели дохода месяца не хватает ${Math.round(f.incomeGap).toLocaleString('ru-RU')} ₽.`,
    `2. ${blocked.length ? `${blocked.length} активн. проект(а) без next action.` : 'У активных проектов указаны следующие действия.'}`,
    `3. ${f.overBudget ? `Бюджет превышен на ${Math.round(-f.budgetVariance).toLocaleString('ru-RU')} ₽.` : `До лимита расходов остаётся ${Math.round(f.budgetVariance).toLocaleString('ru-RU')} ₽.`}`,
    '', 'Рекомендация:', top ? `• Сфокусироваться на «${top.name}»: ${top.nextAction || 'сформулировать одно измеримое следующее действие'}.` : '• Добавить хотя бы один активный проект и его следующее действие.',
    '', 'Финансы:', `• Доход: ${Math.round(f.income).toLocaleString('ru-RU')} ₽`, `• Расход: ${Math.round(f.expenses).toLocaleString('ru-RU')} ₽`, `• Свободный cash после обязательств: ${Math.round(f.availableCash).toLocaleString('ru-RU')} ₽`,
    '', 'Неопределённость:', `Snapshot: ${snapshot.capturedAt}. Это последнее известное состояние, не live-данные. ` + (now.getTime()-Date.parse(snapshot.capturedAt)>86400000 ? 'Snapshot старше суток. ' : '') + 'Расходы исключают закрытые категории и могут быть неполными; свободный cash консервативно исключает резерв, инвестиции и все открытые платежи/долги. ' + (snapshot.finances.targetMonth && snapshot.finances.targetMonth!==localDate(now,timeZone).slice(0,7) ? 'Цель дохода относится к другому месяцу: нужен свежий sync. ' : '') + (!snapshot.finances.transactions.length ? 'Нет операций: финансовые выводы ограничены.' : '')
  ].join('\n');
}

