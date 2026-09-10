import type { AiSnapshot } from './types.js';
export type Rule = { id:string; project_name:string|null; metric:string; operator:'gt'|'gte'|'lt'|'lte'; threshold:number|string };
export const compare = (value:number, op:Rule['operator'], threshold:number) => op==='gt'?value>threshold:op==='gte'?value>=threshold:op==='lt'?value<threshold:value<=threshold;
export function evaluateRule(snapshot:AiSnapshot, rule:Rule) {
  const project = snapshot.projects.find(p=>!rule.project_name || p.name.toLocaleLowerCase('ru').includes(rule.project_name.toLocaleLowerCase('ru')));
  if (!project?.adMetrics) return null;
  const value = project.adMetrics[rule.metric.toLowerCase()];
  if (typeof value !== 'number') return null;
  const threshold=Number(rule.threshold);
  return compare(value, rule.operator, threshold) ? { ruleId:rule.id, project:project.name, metric:rule.metric, value, threshold, message:`⚠️ ${project.name}: ${rule.metric.toUpperCase()} = ${value}, порог ${threshold}.` } : null;
}

export function parseMonitoringRule(text:string) {
  const match=text.match(/(?:следи за\s+)?(cpa|cac|cpm|cpc|spend|budget|roas)(?:\s+проекта)?\s+([\p{L}\d_-]+).*?(выше|больше|ниже|меньше)\s*(\d+(?:[.,]\d+)?)/iu)
    || text.match(/(?:следи за\s+)?(cpa|cac|cpm|cpc|spend|budget|roas).*?(выше|больше|ниже|меньше)\s*(\d+(?:[.,]\d+)?)/iu);
  if(!match) return null;
  const hasProject=match.length===5;
  return { metric:match[1]!.toLowerCase(), projectName:hasProject?(match[2]||'').trim()||null:null, operator:/выше|больше/i.test(match[hasProject?3:2]!)?'gt' as const:'lt' as const, threshold:Number(match[hasProject?4:3]!.replace(',','.')) };
}
