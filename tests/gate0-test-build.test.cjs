const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
let api;
before(async()=>{api=await import('../scripts/prepare-gate0-test.mjs');});
function temporary(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aos-build-test-'));try{return run(path.join(dir,'site'));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('test origin rejects production hosts, paths, aliases and non-HTTPS',()=>{
 for(const origin of ['https://senyaav27.github.io','https://senyaav27.github.io/alexander-os','https://alexander-os-gate0-test.pages.dev/','https://branch.alexander-os-gate0-test.pages.dev','http://alexander-os-gate0-test.pages.dev','https://example.com','https://u:p@alexander-os-gate0-test.pages.dev'])assert.throws(()=>api.validateOrigin(origin));
 assert.equal(api.validateOrigin(api.PLANNED_ORIGIN),api.PLANNED_ORIGIN);
 assert.throws(()=>api.validateOrigin('http://127.0.0.1:8000'));
 assert.equal(api.validateOrigin('http://127.0.0.1:8000',true),'http://127.0.0.1:8000');
});
test('B0 is deterministic, synthetic and balances match the real ledger representation',()=>{
 const first=api.syntheticB0(),second=api.syntheticB0();assert.deepEqual(first,second);
 const s=first.data;assert.equal(s.profile.name,'GATE0 B0 SYNTHETIC');assert.equal(s.transactions.length,2);assert.equal(s.accountTransfers.length,1);assert.equal(s.tasks.length,1);assert.equal(s.notes.length,1);
 for(const account of s.accounts){const delta=s.transactions.filter(t=>t.accountId===account.id).reduce((total,t)=>total+(t.type==='income'?t.amount:-t.amount),0);assert.equal(account.baseBalance+delta,account.balance);}
 assert.equal(s.accounts[0].balance,10389);assert.equal(s.accounts[1].balance,500);assert.equal(s.accounts.reduce((total,a)=>total+a.balance,0),10889);
});
test('local package uses a minimal whitelist, isolated storage/cache and disabled Google',()=>temporary(out=>{
 const result=api.prepare({out});assert.equal(result.published,false);assert.equal(result.googleEnabled,false);
 const names=fs.readdirSync(out);for(const excluded of ['backend','.git','.github','.env','install-v16.mjs','apply_sync_hotfix.py','node_modules'])assert.ok(!names.includes(excluded));
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.webmanifest')));assert.equal(manifest.short_name,'AOS TEST B0');
 const app=fs.readFileSync(path.join(out,'app.js'),'utf8');assert.ok(app.includes("const STORAGE_KEY = 'gate0_test__alexander_os_v1'"));assert.ok(app.startsWith('if(!window.__AOS_TEST_ALLOWED)'));
 const sw=fs.readFileSync(path.join(out,'sw.js'),'utf8');assert.ok(sw.includes("const CACHE = 'aos-gate0-test-"));assert.ok(sw.includes(api.PLANNED_ORIGIN));
 const headers=fs.readFileSync(path.join(out,'_headers'),'utf8');assert.ok(headers.includes("connect-src 'self';"));assert.ok(!headers.includes('accounts.google.com'));assert.ok(headers.includes('noindex'));
 for(const name of names.filter(n=>n.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(out,name)],{stdio:'pipe'});
}));
test('repeat build is byte-identical and does not overwrite unknown output files',()=>temporary(out=>{
 const first=api.prepare({out});const second=api.prepare({out});assert.deepEqual(first,second);
 fs.writeFileSync(path.join(out,'user-file.txt'),'keep me');assert.throws(()=>api.prepare({out}),/No files overwritten/);assert.equal(fs.readFileSync(path.join(out,'user-file.txt'),'utf8'),'keep me');
}));
test('builder refuses checkout output and incomplete Google configuration',()=>{
 assert.throws(()=>api.prepare({out:path.resolve(__dirname,'..')}),/outside the checkout/);
 const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'aos-link-test-'));
 try{const link=path.join(temporaryRoot,'checkout-link');fs.symlinkSync(path.resolve(__dirname,'..'),link,'dir');assert.throws(()=>api.prepare({out:path.join(link,'forbidden-build')}),/outside the checkout/);}finally{fs.rmSync(temporaryRoot,{recursive:true,force:true});}
 assert.throws(()=>api.prepare({googleEnabled:true}),/required/);
 assert.throws(()=>api.prepare({clientId:'synthetic.apps.googleusercontent.com'}),/disabled mode/);
});
test('Google-enabled package is still restricted to explicit test IDs and contains no OAuth secret',()=>temporary(out=>{
 const result=api.prepare({out,googleEnabled:true,clientId:'synthetic-client.apps.googleusercontent.com',spreadsheetId:'synthetic-test-sheet-1234567'});assert.equal(result.googleEnabled,true);assert.equal(result.published,false);
 const sheets=fs.readFileSync(path.join(out,'brand-sheets.js'),'utf8');assert.ok(sheets.includes('spreadsheetId!==testGoogle.spreadsheetId'));
 const guard=fs.readFileSync(path.join(out,'gate0-test-guard.js'),'utf8');assert.ok(guard.includes('synthetic-test-sheet-1234567'));assert.ok(!guard.includes('client_secret'));
}));

test('enabled-mode runtime guard rejects other spreadsheet IDs and unrelated external hosts',async()=>{
 const vm=require('node:vm');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aos-guard-test-'));
 try{
  const out=path.join(directory,'site');api.prepare({out,googleEnabled:true,clientId:'synthetic-client.apps.googleusercontent.com',spreadsheetId:'synthetic-test-sheet-1234567'});
  const store=new Map(),calls=[];
  const context={URL,location:{origin:api.PLANNED_ORIGIN,href:api.PLANNED_ORIGIN+'/'},window:{fetch:async url=>{calls.push(String(url));return {ok:true};}},localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value))},document:{body:null,addEventListener(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(out,'gate0-test-guard.js'),'utf8'),context);
  assert.equal(context.window.__AOS_TEST_ALLOWED,true);
  await context.window.fetch('https://sheets.googleapis.com/v4/spreadsheets/synthetic-test-sheet-1234567/values:batchGet');
  await context.window.fetch('https://accounts.google.com/gsi/log');
  await assert.rejects(context.window.fetch('https://sheets.googleapis.com/v4/spreadsheets/synthetic-test-sheet-1234567-other/values:batchGet'),/blocked/);
  await assert.rejects(context.window.fetch('https://unrelated.example.test/collect'),/blocked/);
  assert.equal(calls.length,2);assert.ok(store.has(api.STATE_KEY));assert.ok(!store.has('alexander_os_v1'));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
