import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture } from './fixture.js';
import { financeAnalysis, dailyBrief } from '../src/analysis.js';
import { snapshotSchema } from '../src/types.js';
import { authorizedMessage, secretMatches } from '../src/authorization.js';
import { parseMonitoringRule, evaluateRuleAlerts } from '../src/monitoring.js';
import { safeError } from '../src/redact.js';
const at=new Date('2026-09-10T12:00:00Z');
test('cash excludes investments and expected/received obligations; cents are exact',()=>{
  const s=structuredClone(fixture);
  s.finances.accounts.push({id:'investment',purpose:'investment',balance:90000});
  s.finances.obligations.push({id:'expected',title:'Expected income',amount:5000,type:'expected',status:'open',dueDate:'2026-09-20'},{id:'received',title:'Received',amount:4000,type:'expected',status:'received',dueDate:'2026-09-01'});
  s.finances.transactions=[{id:'a',title:'a',amount:-0.1,date:'2026-09-01',category:'business'},{id:'b',title:'b',amount:-0.2,date:'2026-09-01',category:'business'}];
  const f=financeAnalysis(s,at);assert.equal(f.availableCash,35000);assert.equal(f.expenses,0.3);assert.equal(f.budgetVariance,69999.7);
});
test('month boundaries follow timezone and exclude future transactions',()=>{
  const s=structuredClone(fixture);s.finances.transactions=[{id:'a',title:'a',amount:10,date:'2026-09-01',category:'salary'},{id:'b',title:'b',amount:100,date:'2026-09-02',category:'salary'}];
  assert.equal(financeAnalysis(s,new Date('2026-08-31T22:00:00Z'),'Europe/Moscow').income,10);
  assert.equal(financeAnalysis(s,new Date('2026-08-31T22:00:00Z'),'UTC').income,0);
});
test('brief identifies stale data, missing transactions and stale monthly target',()=>{
  const s=structuredClone(fixture);s.finances.transactions=[];s.finances.targetMonth='2026-08';
  const b=dailyBrief(s,new Date('2026-09-12T10:00:00Z'));assert.match(b,/старше суток/);assert.match(b,/Нет операций/);assert.match(b,/другому месяцу/);assert.equal(financeAnalysis(s,at).incomeGap,null);
});
test('Telegram authorization rejects wrong sender, group, malformed ID and oversized text',()=>{
  const valid={update_id:42,message:{from:{id:123456,is_bot:false},chat:{id:123456,type:'private'},text:'/brief'}};
  assert.deepEqual(authorizedMessage(valid,'123456'),{updateId:42,text:'/brief'});
  for(const mutate of [(x:any)=>x.message.from.id=1,(x:any)=>x.message.chat.type='group',(x:any)=>x.message.chat.id=1,(x:any)=>x.message.from.id='123456',(x:any)=>x.update_id='42',(x:any)=>x.message.text='x'.repeat(2001),(x:any)=>x.message.from.is_bot=true]){const x=structuredClone(valid);mutate(x);assert.equal(authorizedMessage(x,'123456'),null);}
  assert.equal(secretMatches(undefined,'secret'),false);assert.equal(secretMatches('x','secret'),false);assert.equal(secretMatches('secret','secret'),true);
});
test('ingress rejects sensitive fields, health category, invalid dates and arbitrary metrics',()=>{
  for(const mutate of [(s:any)=>s.finances.accounts[0].card='secret',(s:any)=>s.aiNotes.push({id:'x',title:'x',body:'x',updatedAt:'',private:true}),(s:any)=>s.finances.transactions[0].category='health',(s:any)=>s.finances.transactions[0].date='2026-02-31',(s:any)=>s.projects[0].adMetrics={password:1},(s:any)=>s.goals.push({id:'x',title:'x'.repeat(4001),current:0,target:0,deadline:'',unit:'',nextAction:''})]){const s=structuredClone(fixture);mutate(s);assert.equal(snapshotSchema.safeParse(s).success,false);}
});
test('monitoring uses exact project names and checks all matching projects',()=>{
  const s=structuredClone(fixture);s.projects.unshift({...s.projects[0]!,id:'other',name:'RIFT OLD',adMetrics:{cpa:1000}});
  const rule={id:'r',project_name:'RIFT',metric:'cpa',operator:'gt' as const,threshold:700};
  assert.deepEqual(evaluateRuleAlerts(s,rule).map(x=>x.project),['RIFT']);assert.equal(evaluateRuleAlerts(s,{...rule,project_name:null}).length,2);
  assert.equal(parseMonitoringRule('Что значит CPA RIFT выше 700?'),null);
  assert.equal(parseMonitoringRule('Следи за spend RIFT выше 80% бюджета и purchases ниже 5'),null);
  assert.equal(parseMonitoringRule('Следи за CPA RIFT. Если CPA выше 700 рублей - сообщи.')?.projectName,'RIFT');
  assert.equal(parseMonitoringRule('Следи за CPA выше 700')?.projectName,null);
});
// Execute the actual frontend snapshot function, without exporting or changing the PWA runtime.
const appSource=readFileSync(new URL('../../app.js',import.meta.url),'utf8');
function frontend(state:any){
  const start=appSource.indexOf('  function aiSyncToken()'),end=appSource.indexOf('\n  function applyTheme()',start);
  const target=appSource.slice(appSource.indexOf('  function getIncomeTargetForMonth('),appSource.indexOf('\n  function ',appSource.indexOf('  function getIncomeTargetForMonth(')+5));
  const storage=new Map();const ctx=vm.createContext({state,URL,AbortSignal,Date,clearTimeout,setTimeout,aiSyncTimer:null,safeStorage:{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},monthKey:(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,isCushionAccount:(a:any)=>a.purpose==='cushion',fetch:async()=>{throw new Error('Unexpected network');}});
  vm.runInContext(target+'\n'+appSource.slice(start,end)+'\nglobalThis.api={aiSnapshot,aiSyncToken,setAiSyncToken,syncAlexanderAi};',ctx);
  return ctx;
}
function osState(){return {version:14.1,profile:{monthlyIncomeTarget:1,monthlyIncomeTargets:{[`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`]:23456},monthlyExpenseLimit:100,cushionTarget:200,aiSyncEnabled:false,aiSyncEndpoint:'https://api.example.test'},goals:[],projects:[],tasks:[],accounts:[{id:'a',purpose:'general',type:'investment',balance:300}],transactions:[{id:'health',type:'expense',category:'health',amount:99},{id:'normal',type:'expense',title:'Business',category:'business',amount:10,date:'2026-09-01'}],obligations:[{id:'expected',title:'Expected',amount:500,type:'expected',status:'open',dueDate:''}],notes:[{id:'ai',title:'AI',body:'permitted',tags:'ai'},{id:'private',title:'PRIVATE',body:'private',tags:'ai,private'},{id:'health',title:'HEALTH',body:'health',tags:'ai,health'},{id:'other',title:'OTHER',body:'other',tags:'daily'}],pin:'private-pin',history:[{secret:'private-history'}],workoutProfile:{secret:'private-health'}};}
test('actual frontend DTO excludes private state and uses monthly override and obligation type',()=>{
  const state=osState(),ctx=frontend(state);const dto=JSON.parse(JSON.stringify(ctx.api.aiSnapshot()));
  assert.equal(snapshotSchema.safeParse(dto).success,true);assert.equal(dto.finances.monthlyIncomeTarget,23456);assert.equal(dto.finances.accounts[0].purpose,'investment');assert.equal(dto.finances.obligations[0].type,'expected');assert.equal(dto.finances.transactions.length,1);assert.deepEqual(dto.aiNotes.map((n:any)=>n.id),['ai']);assert.doesNotMatch(JSON.stringify(dto),/private-pin|private-history|private-health|PRIVATE|HEALTH|OTHER/);
  assert.equal(state.transactions.length,2);assert.equal(state.notes.length,4);
});
test('disabled sync does not fetch and token is bound to the configured endpoint',async()=>{
  const state=osState(),ctx=frontend(state);ctx.api.setAiSyncToken('synthetic-token');assert.equal(ctx.api.aiSyncToken(),'synthetic-token');assert.equal(await ctx.api.syncAlexanderAi(false),false);state.profile.aiSyncEndpoint='https://different.example.test';assert.equal(ctx.api.aiSyncToken(),'');
});
test('error logging never includes raw exception credentials or snapshot values',()=>{
  assert.deepEqual(safeError(new Error('postgresql://user:pass@db financial_data token=abc')),{message:'operation_failed'});
});
test('advertising input values cannot inject HTML from an imported project',()=>{
  const escapeSource=appSource.match(/const escapeHtml =[^\n]+/)![0];
  const lines=appSource.split('\n').filter(line=>/<input name="(?:adSpend|adBudget|impressions|clicks|leads|purchases|cpa|adRevenue)"/.test(line));
  assert.equal(lines.length,8);
  const item=Object.fromEntries(['adSpend','adBudget','impressions','clicks','leads','purchases','cpa','adRevenue'].map(k=>[k,'"><svg onload="alert(1)">']));
  for(const line of lines){const rendered=vm.runInNewContext(escapeSource+'\n`'+line+'`',{item});assert.doesNotMatch(rendered,/<svg/);assert.match(rendered,/&quot;&gt;&lt;svg/);}
});
