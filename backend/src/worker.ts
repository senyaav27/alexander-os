import { pool, withTransaction } from './db.js';
import { config } from './config.js';
import { latestSnapshot } from './repository.js';
import { dailyBrief, localDate } from './analysis.js';
import { sendTelegram } from './telegram.js';
import { safeError } from './redact.js';
import { answerQuestion } from './chief.js';
import { parseMonitoringRule } from './monitoring.js';
import { handleMemory, saveRecommendation } from './memory.js';
import { pathToFileURL } from 'node:url';
type Job={id:string;kind:string;payload:any;attempts:number};
export async function scheduleDaily(now=new Date()) {
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:config.TIMEZONE,hour:'2-digit',hourCycle:'h23'}).format(now));
  if(hour<config.DAILY_BRIEF_HOUR)return;
  const day=localDate(now,config.TIMEZONE);
  await withTransaction(async c=>{
    const r=await c.query("INSERT INTO jobs(kind,dedupe_key) VALUES('daily_brief',$1) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id",[`daily:${day}`]);
    return r.rowCount;
  });
}
export async function claim():Promise<Job|null> {
  return withTransaction(async c=>{
    await c.query("UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,locked_at=NULL WHERE status='running' AND locked_at < now()-interval '5 minutes'");
    const r=await c.query<Job>("SELECT id,kind,payload,attempts FROM jobs WHERE status='pending' AND attempts<3 AND run_at<=now() ORDER BY run_at,id FOR UPDATE SKIP LOCKED LIMIT 1");
    if(!r.rows[0])return null;
    const job=r.rows[0];
    await c.query("UPDATE jobs SET status='running',locked_at=now(),attempts=attempts+1 WHERE id=$1",[job.id]);
    return {...job,attempts:job.attempts+1};
  });
}
export async function telegramReply(text:string,updateId:string) {
  const memory=await handleMemory(text,updateId); if(memory)return memory;
  if(/^\/rules$/i.test(text)) {
    const rules=(await pool.query('SELECT project_name,metric,operator,threshold FROM monitoring_rules WHERE enabled=true ORDER BY created_at DESC LIMIT 50')).rows;
    return rules.length?rules.map(r=>`${r.project_name||'Все проекты'}: ${r.metric} ${r.operator} ${r.threshold}`).join('\n'):'Нет правил. Пример: «Следи за CPA RIFT, если выше 700».';
  }
  const rule=parseMonitoringRule(text);
  if(rule) {
    await pool.query('INSERT INTO monitoring_rules(project_name,metric,operator,threshold,source_text) VALUES($1,$2,$3,$4,$5)',[rule.projectName,rule.metric,rule.operator,rule.threshold,text]);
    return `Правило сохранено: ${rule.metric.toUpperCase()} ${rule.operator==='gt'?'выше':'ниже'} ${rule.threshold}${rule.projectName?` для ${rule.projectName}`:' для всех проектов'}.`;
  }
  if(/следи|сообщи.*если|уведомляй/iu.test(text))return 'Это условие не распознано и не сохранено. V0.1 поддерживает один числовой порог: «Следи за CPA RIFT, если выше 700».';
  const snapshot=await latestSnapshot();
  if(!snapshot)return 'Пока нет snapshot из Alexander OS. Включите AI Sync в настройках приложения.';
  return answerQuestion(text,snapshot,updateId);
}
export async function runJob(job:Job,send:typeof sendTelegram=sendTelegram) {
  if(job.payload.reply){await send(job.payload.reply);return;}
  let reply:string|undefined;
  if(job.kind==='telegram_alert')reply=job.payload.message;
  else if(job.kind==='daily_brief') {
    const s=await latestSnapshot(); if(!s)throw new Error('Snapshot unavailable');
    reply=dailyBrief(s,new Date(),config.TIMEZONE);await saveRecommendation(reply,'daily_brief');
  } else if(job.kind==='telegram_message')reply=await telegramReply(job.payload.text,String(job.payload.updateId));
  else if(job.kind!=='snapshot_review')throw new Error('Unknown job');
  if(reply) {
    // Persist result before delivery: a transport retry does not repeat the paid generation.
    await pool.query('UPDATE jobs SET payload=$2 WHERE id=$1',[job.id,{reply}]);
    await send(reply);
  }
}
export async function tick(send:typeof sendTelegram=sendTelegram,now=new Date()) {
  await scheduleDaily(now);const job=await claim();if(!job)return;
  try {await runJob(job,send);await pool.query("UPDATE jobs SET status='done',payload='{}',completed_at=now() WHERE id=$1",[job.id]);}
  catch(error) {console.error('job failed',safeError(error));await pool.query("UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,run_at=now()+interval '5 minutes',last_error=$2 WHERE id=$1",[job.id,JSON.stringify(safeError(error))]);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  console.log('Alexander AI worker started');
  const loop=async()=>{try{await tick();}catch(e){console.error('worker tick failed',safeError(e));}setTimeout(loop,5000);};
  await loop();
}
