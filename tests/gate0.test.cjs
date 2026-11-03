const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function mockServer() {
  return {tables:null,lock:null,writes:0,reads:0,beforeRead:null,beforeWrite:null,loseResponse:false,partialWrite:false};
}
function sheets({remote,local,failWrite=false,corrupt=false,offline=false,expired=false,server=mockServer()}={}) {
  const store=new Map();
  class Storage {getItem(k){return store.get(k)||null} setItem(k,v){store.set(k,String(v))} removeItem(k){store.delete(k)}}
  const storage=new Storage();
  const context={Storage,crypto:require('node:crypto').webcrypto,localStorage:storage,console:{warn(){},error(){}},setTimeout:()=>0,clearTimeout(){},setInterval(){},Event:class{},DOMException,
    window:{addEventListener(){},dispatchEvent(){}},document:{hidden:false,readyState:'loading',addEventListener(){},getElementById(){return null}},confirm:()=>{throw Error('confirmation must not bypass safety')}};
  let source=fs.readFileSync('brand-sheets.js','utf8');
  source=source.replace(/\}\)\(\);\s*$/,`window.test={sync,financePayload,TABS,setup:(s)=>{cfg={spreadsheetId:'synthetic'};accessToken='mock';expiresAt=${expired?'0':'Date.now()+100000'};liveEnabled=true;inMemoryFinance=s;},checkpoint:(v)=>localStorage.setItem('aos_sheets_checkpoint_v1:synthetic',JSON.stringify({verified:v})),status:()=>window.__AOS_SHEETS_STATUS};})();`);
  const ok=body=>({ok:true,json:async()=>body});
  const error=(status,message)=>({ok:false,status,json:async()=>({error:{message}})});
  context.fetch=async(url,options={})=>{
    if(offline)throw Error('offline');
    if(url.includes('fields='))return ok({sheets:[...context.window.test.TABS.map((t,i)=>({properties:{title:t.title,sheetId:i}})),...(server.lock?[{properties:server.lock}]:[])]});
    if(options.method==='POST') {
      const requests=JSON.parse(options.body).requests;
      if(requests[0].addSheet){
        if(server.lock)return error(400,'Sheet title already exists');
        server.lock=structuredClone(requests[0].addSheet.properties);
        return ok({replies:[{addSheet:{properties:server.lock}}]});
      }
      if(requests[0].deleteSheet){
        if(server.lock?.sheetId!==requests[0].deleteSheet.sheetId)return error(400,'Unknown sheet');
        server.lock=null;return ok({});
      }
      server.writes++;
      if(server.beforeWrite)await server.beforeWrite();
      if(failWrite)return error(503,'synthetic uncertain write');
      const updated=requests.map(r=>r.updateCells.rows.map(r=>r.values.map(v=>v.userEnteredValue.numberValue??v.userEnteredValue.stringValue)));
      if(server.partialWrite){server.tables[0]=updated[0];throw Error('synthetic partial service failure');}
      server.tables=updated;
      if(server.corruptHeader)server.tables[0][0][4]='wrong header';
      if(corrupt)server.tables[0][1][4]=999;
      if(server.loseResponse)throw Error('synthetic lost response after commit');
      return ok({});
    }
    server.reads++;
    if(server.beforeRead)await server.beforeRead();
    return ok({valueRanges:structuredClone(server.tables).map(values=>({values}))});
  };
  vm.runInNewContext(source,context);
  const api=context.window.test;
  const state=local||{accounts:[{id:'a',name:'Card',balance:100,baseBalance:100}],transactions:[{id:'t',amount:5,type:'expense',title:'Test'}],accountTransfers:[],obligations:[]};
  api.setup(state);
  server.tables=remote||server.tables||api.TABS.map(t=>[t.headers]);
  return {api,context,store,state,server,writes:()=>server.writes,reads:()=>server.reads,tables:()=>server.tables,recover:()=>{failWrite=false;offline=false;},reviewAndRelease:()=>{server.lock=null;}};
}
test('atomic Sheets request and full readback, idempotent retry',async()=>{const s=sheets();await s.api.sync(true);assert.equal(s.api.status().kind,'success');assert.equal(s.writes(),1);await s.api.sync();assert.equal(s.writes(),1);});
test('correct ID with wrong amount fails verification',async()=>{const s=sheets({corrupt:true});await s.api.sync(true);assert.equal(s.api.status().kind,'error');assert.ok(s.server.lock);assert.equal(s.writes(),1);});
test('ambiguous write retains lock; retry requires explicit reviewed recovery',async()=>{const s=sheets({failWrite:true});await s.api.sync(true);assert.equal(s.api.status().kind,'error');assert.ok(JSON.parse(s.store.get('aos_sheets_checkpoint_v1:synthetic')).pending);assert.equal(s.tables()[0].length,1);s.recover();await s.api.sync(true);assert.equal(s.writes(),1);assert.ok(s.server.lock);s.reviewAndRelease();await s.api.sync(true);assert.equal(s.api.status().kind,'success');});
test('offline and expired OAuth never write',async()=>{for(const option of [{offline:true},{expired:true}]){const s=sheets(option);await s.api.sync(true);assert.equal(s.writes(),0);assert.equal(s.api.status().kind,'error')}});
test('duplicate local IDs block before API writes',async()=>{const s=sheets();s.state.transactions.push({...s.state.transactions[0]});await s.api.sync(true);assert.equal(s.writes(),0);assert.match(s.api.status().message,/ID/)});
test('remote unknown or stale copy never overwritten even with force',async()=>{const s=sheets();await s.api.sync(true);s.tables()[0][1][4]=300;await s.api.sync(true);assert.equal(s.writes(),1);assert.match(s.api.status().message,/Конфликт/)});
test('remote missing local ID and explicit trash do not authorize deletion',async()=>{const s=sheets();await s.api.sync(true);s.state.transactions=[];await s.api.sync(true);assert.equal(s.writes(),1);assert.match(s.api.status().message,/Удаление/)});
test('unsafe persistence blocks all cloud writes',async()=>{const s=sheets();s.context.window.__AOS_STORAGE_UNSAFE=true;await s.api.sync(true);assert.equal(s.writes(),0)});
function appStorage({raw=null,quota=false}={}){
 let value=raw;const nodes=new Map();const context={Map,console:{error(){}},window:{addEventListener(){},localStorage:{getItem:()=>value,setItem:(k,v)=>{if(quota)throw Error('quota');value=v},removeItem(){}}},document:{getElementById:id=>nodes.get(id),createElement:()=>({setAttribute(){},style:{}}),body:{append:n=>nodes.set('aosPersistenceWarning',n)}}};
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

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('two devices cannot pass read/write concurrently; stale retry preserves both copies',{timeout:5000},async()=>{
 const server=mockServer(),a=sheets({server}),b=sheets({server});
 a.state.transactions[0].amount=6;b.state.transactions[0].amount=7;
 const entered=deferred(),resume=deferred();server.beforeRead=async()=>{entered.resolve();await resume.promise;};
 const first=a.api.sync(true);await entered.promise;
 await b.api.sync(true);assert.equal(b.writes(),0);assert.equal(b.api.status().kind,'error');assert.match(b.api.status().message,/блокировк/);
 resume.resolve();await first;assert.equal(a.api.status().kind,'success');assert.equal(server.lock,null);
 await b.api.sync(true);assert.equal(b.api.status().kind,'error');assert.match(b.api.status().message,/Конфликт/);
 assert.equal(server.writes,1);assert.equal(server.tables[0][1][4],6);assert.equal(b.state.transactions[0].amount,7);
});
test('lost write acknowledgement keeps exclusive lock and forbids automatic duplicate',async()=>{
 const s=sheets();s.server.loseResponse=true;await s.api.sync(true);
 assert.equal(s.tables()[0][1][4],5);assert.ok(s.server.lock);assert.equal(s.api.status().kind,'error');
 s.server.loseResponse=false;await s.api.sync(true);assert.equal(s.writes(),1);
 s.reviewAndRelease();await s.api.sync(true);assert.equal(s.api.status().kind,'success');assert.equal(s.tables()[0].length,2);
});
test('defensive partial-service failure keeps lock and never claims success',async()=>{
 const s=sheets();s.server.partialWrite=true;await s.api.sync(true);
 assert.equal(s.api.status().kind,'error');assert.ok(s.server.lock);await s.api.sync(true);assert.equal(s.writes(),1);
});
test('pre-existing lock cannot be stolen, even on force',async()=>{
 const s=sheets();s.server.lock={title:'_AOS_SYNC_LOCK_V1',sheetId:987};await s.api.sync(true);
 assert.equal(s.writes(),0);assert.equal(s.server.lock.sheetId,987);assert.equal(s.api.status().kind,'error');
});
test('checkpoint quota stops data write and releases only the owned temporary lock',async()=>{
 const s=sheets();const original=s.context.Storage.prototype.setItem;
 s.context.Storage.prototype.setItem=function(k,v){if(k.includes('checkpoint'))throw Error('synthetic quota');return original.call(this,k,v);};
 await s.api.sync(true);assert.equal(s.writes(),0);assert.equal(s.server.lock,null);assert.equal(s.api.status().kind,'error');
});

test('legacy direct state writer cannot bypass cross-tab guard',()=>{
 const s=sheets();s.context.localStorage.setItem('alexander_os_v1',JSON.stringify({transactions:[],accounts:[]}));
 const newer=JSON.stringify({transactions:[{id:'new',amount:1}],accounts:[]});s.store.set('alexander_os_v1',newer);
 assert.throws(()=>s.context.localStorage.setItem('alexander_os_v1','{}'),/другой вкладке/);
 assert.equal(s.store.get('alexander_os_v1'),newer);
});
test('a post-commit interceptor exception is verified against actual durable bytes',()=>{
 const s=appStorage({raw:'old'});const native=s.context.window.localStorage.setItem;
 s.context.window.localStorage.setItem=(k,v)=>{native(k,v);throw Error('synthetic observer failure');};
 assert.equal(s.api.safeStorage.setItem('alexander_os_v1','new'),true);assert.equal(s.value(),'new');
});

test('readback with changed headers is not accepted as success',async()=>{
 const s=sheets();s.server.corruptHeader=true;await s.api.sync(true);
 assert.equal(s.api.status().kind,'error');assert.ok(s.server.lock);
});
test('unavailable storage cannot overwrite an existing dataset',()=>{
 const s=appStorage({raw:'original'});s.context.window.localStorage.getItem=()=>{throw Error('synthetic unavailable');};
 assert.equal(s.api.safeStorage.getItem('alexander_os_v1'),null);
 assert.equal(s.api.safeStorage.setItem('alexander_os_v1','{}'),false);assert.equal(s.value(),'original');
});
test('backup rejects invalid account balances and unsupported future wrapper schema',()=>{
 const source=fs.readFileSync('app.js','utf8');const part=source.slice(source.indexOf('  function extractBackupData'),source.indexOf('  function backupSummary'));
 const context={};vm.runInNewContext(part+';this.api={extractBackupData,validateBackupData}',context);
 assert.throws(()=>context.api.extractBackupData({format:'AlexanderOSBackup',schemaVersion:2,data:{profile:{}}}),/Unsupported/);
 const data={profile:{}};for(const k of ['tasks','accounts','transactions','obligations','projects','goals','habits','weeklyReviews','noteFolders','notes','snapshots'])data[k]=[];
 data.accounts=[{id:'a',balance:null}];assert.equal(context.api.validateBackupData(data),false);
 data.accounts=[{id:'a',balance:100,baseBalance:'not a number'}];assert.equal(context.api.validateBackupData(data),false);
});

test('restore with the same IDs cannot roll back newer remote amounts via an old checkpoint',async()=>{
 const s=sheets();await s.api.sync(true);
 s.state.transactions[0].amount=6;await s.api.sync(true);assert.equal(s.writes(),2);
 s.state.transactions[0].amount=5;s.state.persistenceEpoch='synthetic-restored-epoch';
 await s.api.sync(true);assert.equal(s.api.status().kind,'error');assert.match(s.api.status().message,/Конфликт/);
 assert.equal(s.writes(),2);assert.equal(s.tables()[0][1][4],6);assert.equal(s.state.transactions[0].amount,5);
});
test('restored identical content can establish a checkpoint without discarding records',async()=>{
 const s=sheets();await s.api.sync(true);s.state.persistenceEpoch='synthetic-new-epoch';
 await s.api.sync(true);assert.equal(s.api.status().kind,'success');
 assert.equal(JSON.parse(s.store.get('aos_sheets_checkpoint_v1:synthetic')).epoch,'synthetic-new-epoch');
 s.state.transactions[0].amount=7;await s.api.sync(true);assert.equal(s.api.status().kind,'success');assert.equal(s.tables()[0][1][4],7);
});
