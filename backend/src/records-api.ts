import express from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { secretMatches } from './authorization.js';
import { withTransaction } from './db.js';
import { RecordError,sourceSchema,memorySchema,decisionSchema,reviewSchema,actionSchema,approvalSchema,
  registerSource,reviseMemory,createDecision,reviewDecision,proposeAction,transitionAction } from './records.js';
export const recordsApi=express.Router();
recordsApi.use((req,res,next)=>{
  if(!config.OWNER_API_TOKEN)return res.status(503).json({error:'owner_api_disabled'});
  if(!secretMatches(req.header('authorization'),`Bearer ${config.OWNER_API_TOKEN}`))return res.status(401).json({error:'unauthorized'});
  next();
});
const mutation=(schema:z.ZodType,run:(key:string,body:any,id:string)=>Promise<unknown>):express.RequestHandler=>async(req,res,next)=>{
  const key=req.header('idempotency-key');
  if(!key || !/^[A-Za-z0-9_-]{8,100}$/.test(key))return res.status(400).json({error:'idempotency_key_required'});
  const parsed=schema.safeParse(req.body);
  const id=String(req.params.id||'');
  if(!parsed.success || (id && !z.uuid().safeParse(id).success))return res.status(400).json({error:'invalid_record'});
  try {res.json(await run(key,parsed.data,id));}catch(error){if(error instanceof RecordError)return res.status(error.status).json({error:error.message});next(error);}
};
recordsApi.post('/sources',mutation(sourceSchema,(k,b)=>registerSource(k,b)));
recordsApi.post('/memory',mutation(memorySchema,(k,b)=>reviseMemory(k,b)));
recordsApi.post('/decisions',mutation(decisionSchema,(k,b)=>createDecision(k,b)));
recordsApi.post('/decisions/:id/review',mutation(reviewSchema,(k,b,id)=>reviewDecision(k,id,b)));
recordsApi.post('/actions',mutation(actionSchema,(k,b)=>proposeAction(k,b)));
recordsApi.post('/actions/:id/transition',mutation(approvalSchema,(k,b,id)=>transitionAction(k,id,b)));
// Bounded owner export; includes revisions/retractions. No generic SQL or external writes.
recordsApi.get('/export',async(_req,res)=>{
  try {
    const data=await withTransaction(async c=>{
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const output:Record<string,unknown>={};
      for(const table of ['cos_sources','cos_memory','cos_memory_revisions','cos_decisions','cos_actions','cos_audit']) {
        const rows=(await c.query(`SELECT * FROM ${table} LIMIT 10001`)).rows;
        if(rows.length>10000)throw new RecordError(413,'export_requires_database_backup');
        output[table]=rows;
      }
      return output;
    });
    res.setHeader('Cache-Control','no-store');res.json(data);
  }catch(error){if(error instanceof RecordError)return res.status(error.status).json({error:error.message});throw error;}
});
