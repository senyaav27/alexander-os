import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool, withTransaction } from './db.js';

const text = z.string().trim().min(1).max(2000);
export const scopeSchema = z.enum(['personal','work','senyamarketing','tvoe','rift']);
export const sourceSchema = z.object({
  id:z.string().regex(/^[a-z0-9_-]{1,80}$/),
  provider:z.enum(['pwa','google_calendar','google_sheets','finance','senyamarketing','tvoe','rift','telegram']),
  scope:scopeSchema, reference:text, capturedAt:z.iso.datetime(), expiresAt:z.iso.datetime(),
  approvedForAi:z.boolean().default(false)
}).strict().refine(s=>Date.parse(s.expiresAt)>Date.parse(s.capturedAt) && Date.parse(s.capturedAt)<=Date.now()+60000,'Invalid source time interval');
export const memorySchema = z.object({
  id:z.uuid().optional(), expectedVersion:z.number().int().nonnegative(), sourceId:text, scope:scopeSchema,
  kind:z.enum(['preference','fact','decision','hypothesis','principle','procedure']),
  body:text, confirmed:z.boolean(), status:z.enum(['active','retracted']).default('active')
}).strict();
export const decisionSchema = z.object({sourceId:text,summary:text,expectation:text,choice:text,reviewAt:z.iso.datetime()}).strict();
export const reviewSchema = z.object({expectedVersion:z.number().int().positive(),outcome:text}).strict();
export const actionSchema = z.object({sourceId:text,kind:z.enum(['calendar_write','message','project_update']),proposal:text}).strict();
export const approvalSchema = z.object({expectedVersion:z.number().int().positive(),transition:z.enum(['approve','reject','confirm']),evidence:text.optional()}).strict();
export class RecordError extends Error { constructor(public status:number, message:string){super(message);} }
type Result = Record<string,unknown>;
// Shared deduplication for all owner mutations. A key cannot be reused for new content.
export async function recordMutation(key:string,input:unknown,work:(c:PoolClient)=>Promise<Result>) {
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return withTransaction(async c=>{
    const inserted=await c.query('INSERT INTO cos_requests(request_key,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING request_key',[key,hash]);
    if(!inserted.rowCount){
      const old=(await c.query('SELECT payload_hash,result FROM cos_requests WHERE request_key=$1',[key])).rows[0];
      if(old?.payload_hash!==hash || !old.result)throw new RecordError(409,'idempotency_conflict');
      return old.result as Result;
    }
    const result=await work(c);
    await c.query('UPDATE cos_requests SET result=$2 WHERE request_key=$1',[key,result]);
    return result;
  });
}
async function audit(c:PoolClient,key:string,event:string,id:string,version=1){
  await c.query('INSERT INTO cos_audit(request_key,event,entity_id,version) VALUES($1,$2,$3,$4)',[key,event,id,version]);
}
async function source(c:PoolClient,id:string,scope?:string){
  const row=(await c.query('SELECT * FROM cos_sources WHERE id=$1 FOR SHARE',[id])).rows[0];
  if(!row)throw new RecordError(404,'source_not_found');
  if(scope && row.scope!==scope)throw new RecordError(403,'source_scope_denied');
  return row;
}
export function registerSource(key:string,body:z.infer<typeof sourceSchema>){
  return recordMutation(key,{operation:'source',body},async c=>{
    // Refresh uses a separate reviewed source version/ID; silent scope changes forbidden.
    const r=await c.query('INSERT INTO cos_sources(id,provider,scope,reference,captured_at,expires_at,approved_for_ai) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id',[body.id,body.provider,body.scope,body.reference,body.capturedAt,body.expiresAt,body.approvedForAi]);
    if(!r.rowCount)throw new RecordError(409,'source_exists');
    await audit(c,key,'source_registered',body.id);return {id:body.id};
  });
}
export function reviseMemory(key:string,body:z.infer<typeof memorySchema>){
  return recordMutation(key,{operation:'memory',body},async c=>{
    await source(c,body.sourceId,body.scope);
    let id=body.id;
    if(!id){
      if(body.expectedVersion!==0)throw new RecordError(409,'version_conflict');
      id=(await c.query('INSERT INTO cos_memory(source_id,scope,kind) VALUES($1,$2,$3) RETURNING id',[body.sourceId,body.scope,body.kind])).rows[0].id as string;
    }
    const current=(await c.query('SELECT * FROM cos_memory WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!current)throw new RecordError(404,'memory_not_found');
    if(current.scope!==body.scope || current.source_id!==body.sourceId || current.kind!==body.kind)throw new RecordError(403,'memory_scope_denied');
    if(current.version!==body.expectedVersion)throw new RecordError(409,'version_conflict');
    const version=current.version+1;
    await c.query('INSERT INTO cos_memory_revisions(memory_id,version,body,confirmed,status) VALUES($1,$2,$3,$4,$5)',[id,version,body.body,body.confirmed,body.status]);
    await c.query('UPDATE cos_memory SET version=$2 WHERE id=$1',[id,version]);
    await audit(c,key,body.status==='retracted'?'memory_retracted':'memory_revised',id!,version);
    return {id,version};
  });
}
export async function currentMemory(scope='personal'){
  return (await pool.query(`SELECT m.id,m.kind,m.scope,m.source_id,m.version,r.body,r.confirmed,r.created_at,s.captured_at,s.expires_at,s.provider AS provenance_type,s.reference AS provenance_id
    FROM cos_memory m JOIN cos_memory_revisions r ON r.memory_id=m.id AND r.version=m.version
    JOIN cos_sources s ON s.id=m.source_id WHERE m.scope=$1 AND s.approved_for_ai=true
    AND s.expires_at>now() AND r.confirmed=true AND r.status='active' ORDER BY r.created_at DESC LIMIT 20`,[scope])).rows;
}
export function createDecision(key:string,body:z.infer<typeof decisionSchema>){
  return recordMutation(key,{operation:'decision',body},async c=>{
    await source(c,body.sourceId);
    const id=(await c.query('INSERT INTO cos_decisions(source_id,summary,expectation,choice,review_at) VALUES($1,$2,$3,$4,$5) RETURNING id',[body.sourceId,body.summary,body.expectation,body.choice,body.reviewAt])).rows[0].id as string;
    await audit(c,key,'decision_recorded',id);return {id,version:1};
  });
}
export function reviewDecision(key:string,id:string,body:z.infer<typeof reviewSchema>){
  return recordMutation(key,{operation:'review',id,body},async c=>{
    const r=await c.query("UPDATE cos_decisions SET outcome=$3,status='reviewed',version=version+1 WHERE id=$1 AND version=$2 AND status='open' RETURNING version",[id,body.expectedVersion,body.outcome]);
    if(!r.rowCount)throw new RecordError(409,'version_conflict');
    await audit(c,key,'decision_reviewed',id,r.rows[0].version);return {id,version:r.rows[0].version};
  });
}
export function proposeAction(key:string,body:z.infer<typeof actionSchema>){
  return recordMutation(key,{operation:'action',body},async c=>{
    await source(c,body.sourceId);
    const id=(await c.query('INSERT INTO cos_actions(source_id,kind,proposal) VALUES($1,$2,$3) RETURNING id',[body.sourceId,body.kind,body.proposal])).rows[0].id as string;
    await audit(c,key,'action_proposed',id);return {id,version:1,status:'waiting_approval'};
  });
}
export function transitionAction(key:string,id:string,body:z.infer<typeof approvalSchema>){
  return recordMutation(key,{operation:'transition',id,body},async c=>{
    const expected=body.transition==='confirm'?'approved':'waiting_approval';
    const status={approve:'approved',reject:'rejected',confirm:'user_confirmed'}[body.transition];
    if(body.transition==='confirm' && !body.evidence)throw new RecordError(400,'evidence_required');
    const r=await c.query('UPDATE cos_actions SET status=$3,evidence=$4,version=version+1 WHERE id=$1 AND version=$2 AND status=$5 RETURNING version',[id,body.expectedVersion,status,body.evidence||null,expected]);
    if(!r.rowCount)throw new RecordError(409,'transition_conflict');
    await audit(c,key,'action_'+status,id,r.rows[0].version);return {id,version:r.rows[0].version,status};
  });
}

export function rememberTelegram(key:string,body:string,provenance:string){
  return recordMutation('telegram_'+createHash('sha256').update(key).digest('hex'),{operation:'telegram_fact',body,provenance},async c=>{
    const sourceId='telegram_'+createHash('sha256').update(provenance).digest('hex');
    await c.query("INSERT INTO cos_sources(id,provider,scope,reference,captured_at,expires_at,approved_for_ai) VALUES($1,'telegram','personal',$2,now(),now()+interval '1 year',true) ON CONFLICT DO NOTHING",[sourceId,provenance]);
    const id=(await c.query("INSERT INTO cos_memory(source_id,scope,kind,version) VALUES($1,'personal','fact',1) RETURNING id",[sourceId])).rows[0].id as string;
    await c.query("INSERT INTO cos_memory_revisions(memory_id,version,body,confirmed,status) VALUES($1,1,$2,true,'active')",[id,body]);
    await audit(c,key,'memory_revised',id);return {id,version:1};
  });
}
