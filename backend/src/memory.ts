import { pool, withTransaction } from './db.js';
import { config } from './config.js';
import { redact } from './redact.js';
export async function memoryContext() {
  const [recommendations,decisions,feedback,facts]=await Promise.all([
    pool.query("SELECT id,body,status FROM recommendations ORDER BY created_at DESC LIMIT 5"),
    pool.query("SELECT summary,status FROM decisions ORDER BY created_at DESC LIMIT 5"),
    pool.query("SELECT recommendation_id,value FROM user_feedback ORDER BY created_at DESC LIMIT 5"),
    pool.query("SELECT fact,provenance_type,provenance_id FROM important_facts ORDER BY created_at DESC LIMIT 5")
  ]);
  return {recommendations:recommendations.rows,decisions:decisions.rows,feedback:feedback.rows,facts:facts.rows};
}
export async function saveRecommendation(body:string,kind:string) {
  await pool.query('INSERT INTO recommendations(body,context) VALUES($1,$2)',[String(redact(body)).slice(0,4000),{kind}]);
}
export async function handleMemory(text:string,provenance:string):Promise<string|null> {
  const feedback=text.toLowerCase().replace(/[.!?]+$/,'').trim();
  if(['полезно','не полезно','сделал','отклоняю','почему'].includes(feedback)) {
    return withTransaction(async c=>{
      const r=(await c.query('SELECT id,body FROM recommendations ORDER BY created_at DESC LIMIT 1')).rows[0];
      if(!r)return 'Пока нет сохранённой рекомендации.';
      if(feedback==='почему')return `Последняя рекомендация и её обоснование:\n${r.body}`;
      await c.query('INSERT INTO user_feedback(recommendation_id,value) VALUES($1,$2)',[r.id,feedback]);
      if(['сделал','отклоняю'].includes(feedback)) {
        await c.query('UPDATE recommendations SET status=$2 WHERE id=$1',[r.id,feedback==='сделал'?'done':'rejected']);
        await c.query('INSERT INTO decisions(summary,status,rationale) VALUES($1,$2,$3)',[r.body,feedback==='сделал'?'done':'rejected','Explicit Telegram feedback']);
      }
      return 'Feedback сохранён для последней рекомендации.';
    });
  }
  const fact=text.match(/^запомни[:\s]+(.+)$/isu);
  if(fact){await pool.query('INSERT INTO important_facts(fact,provenance_type,provenance_id) VALUES($1,$2,$3)',[String(redact(fact[1])).slice(0,2000),'telegram_user',provenance]);return 'Факт сохранён с источником Telegram. Он не меняет правила безопасности.';}
  return null;
}
// Atomic database budget: survives restarts and concurrent workers. Failed calls also consume a slot.
export async function reserveAiRun(inputRef:string) {
  return withTransaction(async c=>{
    await c.query("SELECT pg_advisory_xact_lock(41001)");
    const count=(await c.query("SELECT count(*)::int AS n FROM agent_runs WHERE kind='question' AND started_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'")).rows[0].n;
    if(count>=config.OPENAI_DAILY_REQUEST_LIMIT)return null;
    const r=await c.query("INSERT INTO agent_runs(kind,status,input_ref) VALUES('question','running',$1) RETURNING id",[inputRef]);
    return r.rows[0].id as string;
  });
}
