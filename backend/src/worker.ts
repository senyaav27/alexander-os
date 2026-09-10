import { pool, withTransaction } from './db.js';
import { config } from './config.js';
import { latestSnapshot } from './repository.js';
import { dailyBrief } from './analysis.js';
import { sendTelegram } from './telegram.js';
import { safeError } from './redact.js';

type Job={id:string;kind:string;payload:any};
async function scheduleDaily(){
  const now=new Date(); const localHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:config.TIMEZONE,hour:'2-digit',hour12:false}).format(now));
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:config.TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  if(localHour===config.DAILY_BRIEF_HOUR) await pool.query("INSERT INTO app_state(key,value) VALUES('daily_brief_day',$1) ON CONFLICT(key) DO NOTHING",[JSON.stringify(day)]).then(async r=>{if(r.rowCount)await pool.query("INSERT INTO jobs(kind) VALUES('daily_brief')")});
  const current=await pool.query("SELECT value FROM app_state WHERE key='daily_brief_day'"); if(current.rows[0]&&current.rows[0].value!==day&&localHour===config.DAILY_BRIEF_HOUR){await pool.query("UPDATE app_state SET value=$1,updated_at=now() WHERE key='daily_brief_day'",[JSON.stringify(day)]);await pool.query("INSERT INTO jobs(kind) VALUES('daily_brief')");}
}
async function claim():Promise<Job|null>{return withTransaction(async c=>{const r=await c.query<Job>("SELECT id,kind,payload FROM jobs WHERE status='pending' AND run_at<=now() ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1");if(!r.rows[0])return null;await c.query("UPDATE jobs SET status='running',locked_at=now(),attempts=attempts+1 WHERE id=$1",[r.rows[0].id]);return r.rows[0];});}
async function run(job:Job){if(job.kind==='telegram_alert')await sendTelegram(job.payload.message);if(job.kind==='daily_brief'){const s=await latestSnapshot();if(s)await sendTelegram(dailyBrief(s));}if(job.kind==='snapshot_review'){/* deterministic rules already ran; LLM review is intentionally quiet in V0.1 */}}
async function tick(){await scheduleDaily();const job=await claim();if(!job)return;try{await run(job);await pool.query("UPDATE jobs SET status='done',completed_at=now() WHERE id=$1",[job.id]);}catch(error){console.error('job failed',safeError(error));await pool.query("UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,run_at=now()+interval '5 minutes',last_error=$2 WHERE id=$1",[job.id,JSON.stringify(safeError(error))]);}}
console.log('Alexander AI worker started'); setInterval(()=>tick().catch(e=>console.error('worker tick failed',safeError(e))),5000); await tick();

