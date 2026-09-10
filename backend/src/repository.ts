import { createHash } from 'node:crypto';
import { pool, withTransaction } from './db.js';
import type { AiSnapshot } from './types.js';
import { evaluateRule, type Rule } from './monitoring.js';

export async function latestSnapshot():Promise<AiSnapshot|null>{const r=await pool.query('SELECT payload FROM ai_snapshots ORDER BY received_at DESC LIMIT 1');return r.rows[0]?.payload||null;}
export async function storeSnapshot(snapshot:AiSnapshot){
  const checksum=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return withTransaction(async client=>{
    const inserted=await client.query('INSERT INTO ai_snapshots(schema_version,source_version,captured_at,checksum,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(checksum) DO NOTHING RETURNING id',[snapshot.schemaVersion,snapshot.sourceVersion,snapshot.capturedAt,checksum,snapshot]);
    if(!inserted.rowCount) return {created:false,id:null,alerts:[]};
    const rules=(await client.query<Rule>('SELECT id,project_name,metric,operator,threshold FROM monitoring_rules WHERE enabled=true AND (last_triggered_at IS NULL OR last_triggered_at < now() - cooldown_minutes * interval \'1 minute\')')).rows;
    const alerts=rules.map(rule=>evaluateRule(snapshot,rule)).filter(Boolean);
    for(const alert of alerts){await client.query('INSERT INTO jobs(kind,payload) VALUES($1,$2)',['telegram_alert',alert]);await client.query('UPDATE monitoring_rules SET last_triggered_at=now() WHERE id=$1',[alert!.ruleId]);}
    await client.query('INSERT INTO jobs(kind,payload) VALUES($1,$2)',['snapshot_review',{snapshotId:inserted.rows[0].id}]);
    return {created:true,id:inserted.rows[0].id,alerts};
  });
}

