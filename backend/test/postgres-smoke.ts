// Optional integration check against the dedicated synthetic Docker test database.
// Never reads DATABASE_URL, .env or owner credentials.
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { fixture } from './fixture.js';
const schema='test_'+randomUUID().replaceAll('-','');
const dsn='postgresql://aos_test:synthetic-local-test-only@127.0.0.1:55432/aos_test';
const admin=new pg.Pool({connectionString:dsn});admin.on('error',()=>{});
await admin.query(`CREATE SCHEMA ${schema}`);
const url=dsn+'?options='+encodeURIComponent('-csearch_path='+schema);
const env={...process.env,NODE_ENV:'test',DATABASE_URL:url,DATABASE_SSL:'false',PORT:'33445',
 AI_SYNC_TOKEN:'synthetic-sync-token-for-tcp-tests',OWNER_API_TOKEN:'synthetic-owner-token-for-tcp-tests-1234',
 OPENAI_API_KEY:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_ALLOWED_USER_ID:'',TELEGRAM_WEBHOOK_SECRET:'',PUBLIC_BASE_URL:'',ENABLE_DAILY_BRIEF:'false'};
const db=new pg.Pool({connectionString:url});db.on('error',()=>{});
let api:ChildProcess|undefined,worker:ChildProcess|undefined;
async function waitFor(check:()=>Promise<boolean>,label:string){
 for(let i=0;i<100;i++){try{if(await check())return;}catch{}await new Promise(r=>setTimeout(r,200));}
 throw new Error('Timed out: '+label);
}
async function stop(child:ChildProcess|undefined){if(child && child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}}
async function startApi(){api=spawn(process.execPath,['backend/dist/server.js'],{env,stdio:'ignore'});await waitFor(async()=>{const r=await fetch('http://127.0.0.1:33445/health');return r.ok;},'API health');}
async function post(path:string,body:unknown,key:string){return fetch('http://127.0.0.1:33445'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.OWNER_API_TOKEN,'idempotency-key':key},body:JSON.stringify(body)});}
try{
 for(let i=0;i<2;i++)execFileSync(process.execPath,['backend/dist/migrate.js'],{env,stdio:'pipe'});
 console.log('PASS real PostgreSQL TCP migrations twice');
 await startApi();
 const source={id:'synthetic',provider:'pwa',scope:'personal',reference:'synthetic://tcp',capturedAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z',approvedForAi:true};
 assert.equal((await post('/v1/owner/sources',source,'tcp_source_1')).status,200);
 const memory={expectedVersion:0,sourceId:'synthetic',scope:'personal',kind:'fact',body:'synthetic durable fact',confirmed:true};
 const result=await (await post('/v1/owner/memory',memory,'tcp_memory_1')).json() as any;
 assert.equal(result.version,1);
 const attempts=await Promise.all(['A','B'].map((value,i)=>post('/v1/owner/memory',{...memory,id:result.id,expectedVersion:1,body:value},'tcp_correction_'+i)));
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
 console.log('PASS HTTP owner records and real concurrent version conflict');
 const response=await fetch('http://127.0.0.1:33445/v1/snapshots',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.AI_SYNC_TOKEN},body:JSON.stringify({...fixture,capturedAt:new Date().toISOString()})});assert.equal(response.status,201);
 worker=spawn(process.execPath,['backend/dist/worker.js'],{env,stdio:'ignore'});
 await waitFor(async()=>Number((await db.query("SELECT count(*) n FROM jobs WHERE status='done'")).rows[0].n)===1,'worker completion');
 await stop(worker);worker=undefined;
 worker=spawn(process.execPath,['backend/dist/worker.js'],{env,stdio:'ignore'});
 await new Promise(r=>setTimeout(r,500));await stop(worker);worker=undefined;
 assert.equal(Number((await db.query('SELECT count(*) n FROM jobs')).rows[0].n),1);
 await stop(api);await startApi();
 assert.equal(Number((await db.query('SELECT count(*) n FROM cos_memory_revisions')).rows[0].n),2);
 console.log('PASS API/worker process restart, snapshot and memory persist, no duplicate job');
 // Restart only the container this test explicitly requires.
 const dockerEnv={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
 execFileSync('docker',['--host=unix:///var/run/docker.sock','restart','aos-gates-postgres-test'],{env:dockerEnv,stdio:'pipe'});
 await waitFor(async()=>{const r=await fetch('http://127.0.0.1:33445/health');return r.ok;},'health after database restart');
 assert.equal(Number((await db.query('SELECT count(*) n FROM cos_memory')).rows[0].n),1);
 assert.equal(Number((await db.query('SELECT count(*) n FROM cos_audit')).rows[0].n),3);
 console.log('PASS database restart with API recovery and durable audit');
 const restored='restore_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE DATABASE ${restored}`);
 const dump=execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','aos-gates-postgres-test','pg_dump','-U','aos_test','-d','aos_test','--schema='+schema,'--no-owner','--no-acl'],{env:dockerEnv});
 execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i','aos-gates-postgres-test','psql','-U','aos_test','-d',restored,'-v','ON_ERROR_STOP=1'],{env:dockerEnv,input:dump,stdio:['pipe','pipe','pipe']});
 const restoreUrl=new URL(dsn);restoreUrl.pathname='/'+restored;restoreUrl.searchParams.set('options','-csearch_path='+schema);
 const restoredPool=new pg.Pool({connectionString:restoreUrl.toString()});
 try{assert.equal(Number((await restoredPool.query('SELECT count(*) n FROM cos_memory_revisions')).rows[0].n),2);assert.equal(Number((await restoredPool.query('SELECT count(*) n FROM cos_audit')).rows[0].n),3);}finally{await restoredPool.end();}
 console.log('PASS real pg_dump/psql restore into separate synthetic database');

}finally{
 await stop(worker);await stop(api);await db.end();
 // Leave the dedicated synthetic schema for inspection; never delete owner data.
 await admin.end();
}
