import express from 'express';
import { config } from './config.js';
import { pool, withTransaction } from './db.js';
import { snapshotSchema } from './types.js';
import { storeSnapshot } from './repository.js';
import { setWebhook } from './telegram.js';
import { safeError } from './redact.js';
import { authorizedMessage, secretMatches } from './authorization.js';
import { pathToFileURL } from 'node:url';
export const app=express(); app.disable('x-powered-by'); app.use(express.json({limit:'512kb'}));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type,authorization');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
const syncAuth:express.RequestHandler=(req,res,next)=>{if(!secretMatches(req.headers.authorization,`Bearer ${config.AI_SYNC_TOKEN}`))return res.status(401).json({error:'unauthorized'});next();};
app.get('/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'alexander-ai'});}catch{res.status(503).json({ok:false});}});
app.post('/v1/snapshots',syncAuth,async(req,res)=>{const parsed=snapshotSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'invalid_snapshot'});const result=await storeSnapshot(parsed.data);res.status(result.created?201:200).json({ok:true,created:result.created,receivedAt:new Date().toISOString()});});
app.post('/telegram/webhook',async(req,res)=>{
  if(!secretMatches(req.header('x-telegram-bot-api-secret-token'),config.TELEGRAM_WEBHOOK_SECRET))return res.sendStatus(401);
  const message=authorizedMessage(req.body,config.TELEGRAM_ALLOWED_USER_ID);
  if(!message)return res.sendStatus(200);
  // Acknowledge only after durable, deduplicated enqueue. No LLM work in webhook.
  await withTransaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(41002)');
    const n=(await c.query("SELECT count(*)::int AS n FROM telegram_updates WHERE created_at > now()-interval '1 day'")).rows[0].n;
    if(n>=100)return;
    const inserted=await c.query('INSERT INTO telegram_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id',[message.updateId]);
    if(inserted.rowCount)await c.query("INSERT INTO jobs(kind,payload) VALUES('telegram_message',$1)",[message]);
  });
  res.sendStatus(200);
});
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error('request failed',safeError(error));res.status(500).json({error:'internal_error'});});
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)app.listen(config.PORT,()=>{console.log(`Alexander AI API listening on ${config.PORT}`);setWebhook().catch(error=>console.error('webhook setup failed',safeError(error)));});
