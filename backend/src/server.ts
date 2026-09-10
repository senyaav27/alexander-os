import express from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { snapshotSchema } from './types.js';
import { latestSnapshot, storeSnapshot } from './repository.js';
import { answerQuestion } from './chief.js';
import { parseMonitoringRule } from './monitoring.js';
import { sendTelegram, setWebhook } from './telegram.js';
import { safeError } from './redact.js';

const app=express(); app.disable('x-powered-by'); app.use(express.json({limit:'512kb'}));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type,authorization');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
const syncAuth:express.RequestHandler=(req,res,next)=>{if(req.headers.authorization!==`Bearer ${config.AI_SYNC_TOKEN}`)return res.status(401).json({error:'unauthorized'});next();};

app.get('/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'alexander-ai'});}catch{res.status(503).json({ok:false});}});
app.post('/v1/snapshots',syncAuth,async(req,res)=>{const parsed=snapshotSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'invalid_snapshot',issues:parsed.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});const result=await storeSnapshot(parsed.data);res.status(result.created?201:200).json({ok:true,...result,receivedAt:new Date().toISOString()});});
app.post('/telegram/webhook',async(req,res)=>{
  if(!config.TELEGRAM_WEBHOOK_SECRET||req.header('x-telegram-bot-api-secret-token')!==config.TELEGRAM_WEBHOOK_SECRET)return res.sendStatus(401);
  res.sendStatus(200); const message=req.body?.message; const userId=String(message?.from?.id||''); const text=String(message?.text||'').trim();
  if(!text||userId!==config.TELEGRAM_ALLOWED_USER_ID)return;
  try { const rule=parseMonitoringRule(text); if(rule){await pool.query('INSERT INTO monitoring_rules(project_name,metric,operator,threshold,source_text) VALUES($1,$2,$3,$4,$5)',[rule.projectName,rule.metric,rule.operator,rule.threshold,text]);await sendTelegram(`Правило сохранено: ${rule.metric.toUpperCase()} ${rule.operator==='gt'?'выше':'ниже'} ${rule.threshold}${rule.projectName?` для ${rule.projectName}`:''}.`,userId);return;} const snapshot=await latestSnapshot(); if(!snapshot){await sendTelegram('Пока нет snapshot из Alexander OS. Включите AI Sync в настройках приложения.',userId);return;} await sendTelegram(await answerQuestion(text,snapshot),userId); } catch(error){console.error('telegram update failed',safeError(error));await sendTelegram('Не удалось обработать запрос. Попробуйте позже.',userId).catch(()=>{});}
});
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error('request failed',safeError(error));res.status(500).json({error:'internal_error'});});
app.listen(config.PORT,()=>{console.log(`Alexander AI API listening on ${config.PORT}`);setWebhook().catch(error=>console.error('webhook setup failed',safeError(error)));});

