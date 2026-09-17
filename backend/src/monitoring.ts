import type { AiSnapshot } from './types.js';
export type Rule = { id:string; project_name:string|null; metric:string; operator:'gt'|'gte'|'lt'|'lte'; threshold:number|string };
export const compare = (value:number, op:Rule['operator'], threshold:number) => op==='gt'?value>threshold:op==='gte'?value>=threshold:op==='lt'?value<threshold:value<=threshold;
export function evaluateRuleAlerts(snapshot:AiSnapshot, rule:Rule) {
  return snapshot.projects.filter(p=>!rule.project_name || p.name.toLocaleLowerCase('ru')===rule.project_name.toLocaleLowerCase('ru')).flatMap(project=>{
    const value=project.adMetrics?.[rule.metric.toLowerCase() as keyof NonNullable<typeof project.adMetrics>];
    const threshold=Number(rule.threshold);
    if(typeof value!=='number'||!Number.isFinite(threshold)||!compare(value,rule.operator,threshold))return [];
    return [{ruleId:rule.id,project:project.name,metric:rule.metric,value,threshold,message:`⚠️ ${project.name}: ${rule.metric.toUpperCase()} = ${value}, порог ${threshold}.`}];
  });
}
export function evaluateRule(snapshot:AiSnapshot,rule:Rule){return evaluateRuleAlerts(snapshot,rule)[0]||null;}
export function parseMonitoringRule(text:string) {
  // Only an explicit instruction creates a rule. Compound conditions must not silently become a simple rule.
  if(!/^следи за\s/iu.test(text)||/%|\b(?:and|or)\b|\s[иа]\s/iu.test(text))return null;
  const match=text.match(/^следи за\s+(cpa|cac|cpm|cpc|spend|budget|roas)(?:\s+проекта)?(?:\s+([\p{L}\d_-]+))?[.,]?\s*(?:если\s+(?:он\s+(?:станет\s+)?)?(?:(?:cpa|cac|cpm|cpc|spend|budget|roas)\s+)?)?(выше|больше|ниже|меньше)\s*(\d+(?:[.,]\d+)?)(?:\s+рублей)?[.!]?(?:\s*[-—]\s*сообщи\.?)?$/iu);
  if(!match)return null;
  const projectName=match[2]||null;
  const threshold=Number(match[4]!.replace(',','.'));
  if(!Number.isFinite(threshold)||threshold>1e9)return null;
  return {metric:match[1]!.toLowerCase(),projectName,operator:/выше|больше/i.test(match[3]!)?'gt' as const:'lt' as const,threshold};
}
