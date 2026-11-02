const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function sheets({remote,local,failWrite=false,corrupt=false,offline=false,expired=false}={}) {
  const store=new Map();
  class Storage {getItem(k){return store.get(k)||null} setItem(k,v){store.set(k,String(v))}}
  const storage=new Storage();
  const context={Storage,localStorage:storage,console:{warn(){},error(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},Event:class{},DOMException,
    window:{addEventListener(){},dispatchEvent(){}},document:{hidden:false,readyState:'loading',addEventListener(){},getElementById(){return null}},confirm:()=>{throw Error('confirmation must not bypass safety')}};
  let source=fs.readFileSync('brand-sheets.js','utf8');
  source=source.replace(/\}\)\(\);\s*$/,`window.test={sync,financePayload,TABS,setup:(s)=>{cfg={spreadsheetId:'synthetic'};accessToken='mock';expiresAt=${expired?'0':'Date.now()+100000'};liveEnabled=true;inMemoryFinance=s;},checkpoint:(v)=>localStorage.setItem('aos_sheets_checkpoint_v1:synthetic',JSON.stringify({verified:v})),status:()=>window.__AOS_SHEETS_STATUS};})();`);
  let tables, writes=0, reads=0;
  context.fetch=async(url,options={})=>{
    if(offline)throw Error('offline');
    if(url.includes('fields='))return {ok:true,json:async()=>({sheets:context.window.test.TABS.map((t,i)=>({properties:{title:t.title,sheetId:i}}))})};
    if(options.method==='POST') {
      writes++;
      if(failWrite)return {ok:false,status:503,json:async()=>({})};
      const requests=JSON.parse(options.body).requests;
      tables=requests.map(r=>r.updateCells.rows.map(r=>r.values.map(v=>v.userEnteredValue.numberValue??v.userEnteredValue.stringValue)));
      if(corrupt)tables[0][1][4]=999;
      return {ok:true,json:async()=>({})};
    }
    reads++;
    return {ok:true,json:async()=>({valueRanges:tables.map(values=>({values}))})};
  };
  vm.runInNewContext(source,context);
  const api=context.window.test;
  const state=local||{accounts:[{id:'a',name:'Card',balance:100,baseBalance:100}],transactions:[{id:'t',amount:5,type:'expense',title:'Test'}],accountTransfers:[],obligations:[]};
  api.setup(state);
  tables=remote||api.TABS.map(t=>[t.headers]);
  return {api,context,store,state,writes:()=>writes,reads:()=>reads,tables:()=>tables,recover:()=>{failWrite=false;offline=false;}};
}
test('atomic Sheets request and full readback, idempotent retry',async()=>{const s=sheets();await s.api.sync(true);assert.equal(s.api.status().kind,'success');assert.equal(s.writes(),1);await s.api.sync();assert.equal(s.writes(),1);});
test('correct ID with wrong amount fails verification',async()=>{const s=sheets({corrupt:true});await s.api.sync(true);assert.equal(s.api.status().kind,'error');assert.match(s.api.status().message,/не совпало/);});
test('failed atomic write retains pending checkpoint and succeeds on retry',async()=>{const s=sheets({failWrite:true});await s.api.sync(true);assert.equal(s.api.status().kind,'error');assert.ok(JSON.parse(s.store.get('aos_sheets_checkpoint_v1:synthetic')).pending);assert.equal(s.tables()[0].length,1);s.recover();await s.api.sync(true);assert.equal(s.api.status().kind,'success');});
test('offline and expired OAuth never write',async()=>{for(const option of [{offline:true},{expired:true}]){const s=sheets(option);await s.api.sync(true);assert.equal(s.writes(),0);assert.equal(s.api.status().kind,'error')}});
test('duplicate local IDs block before API writes',async()=>{const s=sheets();s.state.transactions.push({...s.state.transactions[0]});await s.api.sync(true);assert.equal(s.writes(),0);assert.match(s.api.status().message,/ID/)});
test('remote unknown or stale copy never overwritten even with force',async()=>{const s=sheets();await s.api.sync(true);s.tables()[0][1][4]=300;await s.api.sync(true);assert.equal(s.writes(),1);assert.match(s.api.status().message,/Конфликт/)});
test('remote missing local ID and explicit trash do not authorize deletion',async()=>{const s=sheets();await s.api.sync(true);s.state.transactions=[];await s.api.sync(true);assert.equal(s.writes(),1);assert.match(s.api.status().message,/Удаление/)});
test('unsafe persistence blocks all cloud writes',async()=>{const s=sheets();s.context.window.__AOS_STORAGE_UNSAFE=true;await s.api.sync(true);assert.equal(s.writes(),0)});
function appStorage({raw=null,quota=false}={}){
 let value=raw;const nodes=new Map();const context={Map,console:{error(){}},window:{localStorage:{getItem:()=>value,setItem:(k,v)=>{if(quota)throw Error('quota');value=v},removeItem(){}}},document:{getElementById:id=>nodes.get(id),createElement:()=>({setAttribute(){},style:{}}),body:{append:n=>nodes.set('aosPersistenceWarning',n)}}};
 let source=fs.readFileSync('app.js','utf8');source=source.slice(source.indexOf('  const STORAGE_KEY'),source.indexOf('  function loadSecurity'));
 vm.runInNewContext(source+';window.test={safeStorage,setObserved:v=>observedStateRaw=v,block:()=>storageBlocked=true};',context);
 return {api:context.window.test,nodes,context,value:()=>value,set:v=>value=v};
}
test('quota keeps latest session readable and visibly warns',()=>{const s=appStorage({raw:'old',quota:true});assert.equal(s.api.safeStorage.setItem('alexander_os_v1','latest'),false);assert.equal(s.value(),'old');assert.equal(s.api.safeStorage.getItem('alexander_os_v1'),'latest');assert.ok(s.nodes.has('aosPersistenceWarning'))});
test('stale browser tab cannot overwrite another tab',()=>{const s=appStorage({raw:'old'});s.api.setObserved('old');s.set('newer');assert.equal(s.api.safeStorage.setItem('alexander_os_v1','stale'),false);assert.equal(s.value(),'newer')});
test('corrupt state lock preserves original bytes',()=>{const s=appStorage({raw:'{broken'});s.api.block();assert.equal(s.api.safeStorage.setItem('alexander_os_v1','{}'),false);assert.equal(s.value(),'{broken')});

test('remote duplicate IDs block atomic update',async()=>{const s=sheets();await s.api.sync(true);s.tables()[0].push([...s.tables()[0][1]]);await s.api.sync(true);assert.equal(s.writes(),1);assert.match(s.api.status().message,/ID/)});
test('online recovery retries pending local state',async()=>{const s=sheets({offline:true});await s.api.sync(true);s.recover();await s.api.sync(true);assert.equal(s.api.status().kind,'success');assert.equal(s.writes(),1)});
test('previously populated remote unexpectedly emptied is a conflict',async()=>{const s=sheets();await s.api.sync(true);s.tables().forEach(t=>t.splice(1));await s.api.sync(true);assert.equal(s.writes(),1);assert.match(s.api.status().message,/Конфликт/)});
test('backup validation rejects duplicate IDs and non-finite money',()=>{
 const source=fs.readFileSync('app.js','utf8');const part=source.slice(source.indexOf('  function validateBackupData'),source.indexOf('  function backupSummary'));
 const context={};vm.runInNewContext(part+';this.validate=validateBackupData',context);
 const backup={profile:{}};for(const k of ['tasks','accounts','transactions','obligations','projects','goals','habits','weeklyReviews','noteFolders','notes','snapshots'])backup[k]=[];
 assert.equal(context.validate(backup),true);backup.tasks=[{id:'x'},{id:'x'}];assert.equal(context.validate(backup),false);backup.tasks=[];backup.transactions=[{id:'t',amount:NaN}];assert.equal(context.validate(backup),false);
});
