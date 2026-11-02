#!/usr/bin/env node
// Builds a local review package only. No provider CLI, upload, OAuth or network calls.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const VERSION='15.8.8-gate0-review';
export const PLANNED_ORIGIN='https://alexander-os-gate0-test.pages.dev';
export const PREFIX='gate0_test__';
export const STATE_KEY=PREFIX+'alexander_os_v1';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=s=>createHash('sha256').update(s).digest('hex');
const namespace=s=>s.replace(/\b(alexander_os_|aos_gsheets_|aos_sheets_|senyaav_ai_)/g,PREFIX+'$1');
export function validateOrigin(value,allowLoopback=false){
  const u=new URL(value);
  if(u.origin!==value || u.username || u.password)throw new Error('Use an exact origin without path, trailing slash, credentials, query or fragment');
  const loopback=allowLoopback && u.protocol==='http:' && u.hostname==='127.0.0.1';
  const pages=u.protocol==='https:' && /^[a-z0-9-]*gate0[a-z0-9-]*\.pages\.dev$/.test(u.hostname) && !u.port;
  if(!loopback && !pages)throw new Error('Only a separate gate0 Pages project origin is allowed; github.io and production origins are forbidden');
  return value;
}
export function syntheticB0(){
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const start=source.indexOf('  function freshState()');
  const end=source.indexOf('  function ensureAccountIntegrity',start);
  if(start<0 || end<0)throw new Error('freshState signature changed; review the fixture generator');
  let sequence=0;
  const context={uid:()=>`b0-unused-default-${++sequence}`,todayISO:()=> '2026-11-02'};
  vm.runInNewContext(source.slice(start,end)+';this.fixture=freshState();',context);
  const data=JSON.parse(JSON.stringify(context.fixture));
  const at='2026-11-02T09:00:00.000Z';
  data.version=14.3;data.testDataset='B0-synthetic/v1';
  Object.assign(data.profile,{name:'GATE0 B0 SYNTHETIC',monthlyIncomeTarget:0,monthlyIncomeTargets:{},monthlyExpenseLimit:0,capitalTarget:0,cushionTarget:0});
  data.workoutProfile={height:170,age:30,weight:70,targetWeight:70,startWeight:70,goal:'general',level:'none',days:0,equipment:'none',savedAt:null};
  data.accounts=[
    {id:'b0-account-a',name:'B0 A',type:'card',purpose:'general',baseBalance:9500,balance:10389,isDefault:true},
    {id:'b0-account-b',name:'B0 B',type:'cash',purpose:'general',baseBalance:500,balance:500,isDefault:false}
  ];
  data.transactions=[
    {id:'b0-expense-111',title:'B0 synthetic expense',type:'expense',amount:111,date:'2026-11-02',category:'groceries',accountId:'b0-account-a',necessity:'required',scope:'personal',notes:'Synthetic only',createdAt:at},
    {id:'b0-income-1000',title:'B0 synthetic income',type:'income',amount:1000,date:'2026-11-02',category:'salary',accountId:'b0-account-a',notes:'Synthetic only',createdAt:at}
  ];
  data.accountTransfers=[{id:'b0-transfer-500',amount:500,date:'2026-11-02',fromAccountId:'b0-account-a',toAccountId:'b0-account-b',fromName:'B0 A',toName:'B0 B',note:'B0 synthetic transfer',createdAt:at}];
  data.tasks=[{id:'b0-task',title:'G0-task',projectId:'',project:'',priority:'medium',due:'',dueTime:'',status:'todo',notes:'Synthetic only',repeat:'none',reminder:'none',createdAt:at,completedAt:null}];
  data.notes=[{id:'b0-note',title:'G0-note',body:'Synthetic B0 only. No personal data.',folderId:'inbox',tags:'gate0,test',createdAt:at,updatedAt:at}];
  data.goals=[];data.habits=[];data.history=[];data.snapshots=[];
  data.noteFolders=[{id:'inbox',name:'B0 Inbox',createdAt:at}];
  return {format:'AlexanderOSBackup',schemaVersion:1,appVersion:VERSION,exportedAt:at,data};
}
function guardCode(config,b0){
  return `'use strict';\n(() => {
  const config=Object.freeze(${JSON.stringify({...config,google:undefined})});
  const google=Object.freeze(${JSON.stringify(config.google)});
  window.__AOS_TEST_ALLOWED=false;
  if(location.origin!==config.origin){
    const blocked=()=>{const h=document.createElement('h1');h.id='gate0OriginBlocked';h.textContent='Тестовая сборка заблокирована: неверный origin';document.body.replaceChildren(h);};
    if(document.body)blocked();else document.addEventListener('DOMContentLoaded',blocked,{once:true});
    return;
  }
  window.__AOS_TEST_CONFIG=Object.freeze({...config,google});
  window.__AOS_TEST_B0=${JSON.stringify(b0.data)};
  window.__AOS_TEST_GOOGLE_ENABLED=google.enabled;
  const nativeFetch=window.fetch.bind(window);
  window.fetch=(input,options)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
    if(url.origin===location.origin)return nativeFetch(input,options);
    const base='/v4/spreadsheets/'+google.spreadsheetId;
    const gis=google.enabled && url.origin==='https://accounts.google.com' && url.pathname.startsWith('/gsi/');
    const allowed=google.enabled && url.origin==='https://sheets.googleapis.com' &&
      (url.pathname===base || url.pathname.startsWith(base+'/') || url.pathname===base+':batchUpdate');
    if(!allowed && !gis)return Promise.reject(new Error('TEST B0: external request blocked'));
    return nativeFetch(input,options);
  };
  try {
    if(localStorage.getItem('${STATE_KEY}')===null)localStorage.setItem('${STATE_KEY}',JSON.stringify(${JSON.stringify(b0.data)}));
    if(google.enabled)localStorage.setItem('${PREFIX}aos_gsheets_sync_v1',JSON.stringify({clientId:google.clientId,spreadsheetId:google.spreadsheetId}));
    window.__AOS_TEST_ALLOWED=true;
  }catch(_){
    const blocked=()=>{const h=document.createElement('h1');h.id='gate0StorageBlocked';h.textContent='TEST B0: тестовое хранилище недоступно';document.body.replaceChildren(h);};
    document.addEventListener('DOMContentLoaded',blocked,{once:true});
  }
})();\n`;
}
export function prepare({origin=PLANNED_ORIGIN,out,allowLoopback=false,googleEnabled=false,clientId=null,spreadsheetId=null}={}){
  validateOrigin(origin,allowLoopback);
  if(googleEnabled && (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId||'') || !/^[\w-]{15,200}$/.test(spreadsheetId||'')))throw new Error('Approved test OAuth client and spreadsheet IDs are required to build Google-enabled mode');
  if(!googleEnabled && (clientId || spreadsheetId))throw new Error('Do not supply Google IDs in disabled mode');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  if(!html.includes('app.js?v='+VERSION) || !fs.readFileSync(path.join(root,'brand-sheets.js'),'utf8').includes(`const VERSION = '${VERSION}'`))throw new Error('Expected the reviewed GATE 0 version; do not package stale GATE 1/2 frontend');
  const assets=new Set(['index.html','sw.js']);
  const references=[...html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)].map(match=>match[1]);
  const rawManifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  references.push(...rawManifest.icons.map(icon=>icon.src));
  const swSource=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const precache=swSource.slice(swSource.indexOf('const ASSETS = ['),swSource.indexOf('];',swSource.indexOf('const ASSETS = [')));
  references.push(...[...precache.matchAll(/'([^']+)'/g)].map(match=>match[1]));
  for(const reference of references){
    const asset=reference.split('?')[0].replace(/^\.\//,'');
    if(!asset)continue;
    if(/^[a-zA-Z]+:/.test(asset)||asset.startsWith('/')||asset.includes('..')||!/^[-\w.]+\.(?:js|css|png|html|webmanifest)$/.test(asset))throw new Error('Unexpected asset reference: '+asset);
    assets.add(asset);
  }
  const sourceFiles=Object.fromEntries([...assets].sort().map(file=>{
    const full=path.join(root,file);
    if(!fs.realpathSync(full).startsWith(root+path.sep))throw new Error('Asset escapes repository');
    return [file,fs.readFileSync(full)];
  }));
  const b0=syntheticB0();
  const config={origin,version:VERSION,prefix:PREFIX,google:{enabled:googleEnabled,clientId,spreadsheetId}};
  const sourceHashes=Object.fromEntries(Object.entries(sourceFiles).map(([name,body])=>[name,digest(body)]));
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('Cannot identify source commit; no review package can be produced');
  const buildId=digest(JSON.stringify({config,sourceCommit,sourceHashes,builder:digest(fs.readFileSync(fileURLToPath(import.meta.url)))})).slice(0,16);
  const output=path.resolve(out||`/tmp/aos-gate0-test-${buildId}/site`);
  if(output===root||output.startsWith(root+path.sep))throw new Error('Build output must be outside the checkout; never overwrite the live application');
  let ancestor=output;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const resolvedAncestor=fs.realpathSync(ancestor);
  if(resolvedAncestor===root||resolvedAncestor.startsWith(root+path.sep))throw new Error('Build output must remain outside the checkout after resolving symlinks');
  const files=new Map();
  for(const [name,body] of Object.entries(sourceFiles)){
    if(name.endsWith('.png')){files.set(name,body);continue;}
    let text=namespace(body.toString('utf8'));
    if(name==='index.html'){
      text=text.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,(whole,attrs,code)=>/\bsrc=/.test(attrs)?whole:`<script${attrs}>if(window.__AOS_TEST_ALLOWED){\n${code}\n}</script>`);
      text=text.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow,noarchive">\n<script src="gate0-test-guard.js?v='+buildId+'"></script>');
      text=text.replace('<body>','<body>\n<p id="gate0TestBanner" class="settings-help-card" role="status">TEST B0 · '+VERSION+' · Google '+(googleEnabled?'разрешён только для тестовой таблицы':'ОТКЛЮЧЁН')+'</p>');
      text=text.replace(/<title>.*?<\/title>/,'<title>AOS GATE0 TEST — '+VERSION+'</title>').replace('Alexander OS <span>V15.8</span>','AOS TEST B0 <span>15.8.8</span>');
    }else if(name==='manifest.webmanifest'){
      const manifest=JSON.parse(text);Object.assign(manifest,{id:'./gate0-test',name:'AOS GATE0 TEST '+VERSION,short_name:'AOS TEST B0',start_url:'./?testbuild='+buildId});text=JSON.stringify(manifest,null,2)+'\n';
    }else if(name==='sw.js'){
      text=text.replace(/const CACHE = '[^']+';/,`const CACHE = 'aos-gate0-test-${buildId}';`);
      text=text.replace("const ASSETS = [",`const ASSETS = [\n  './gate0-test-guard.js?v=${buildId}',\n  './B0.json',`);
      text=`(() => {if(self.location.origin!==${JSON.stringify(origin)}){self.addEventListener('install',e=>e.waitUntil(Promise.reject(new Error('Wrong test origin'))));return;}\n${text}\n})();\n`;
    }else if(name.endsWith('.js')){
      if(name==='brand-sheets.js'){
        text=text.replace('  async function login() {',"  async function login() {\n    if(!window.__AOS_TEST_GOOGLE_ENABLED)throw new Error('TEST B0: Google отключён до подтверждения размещения и тестовых ресурсов.');");
        text=text.replace('    const spreadsheetId = match ? match[1] : rawId;',"    const spreadsheetId = match ? match[1] : rawId;\n    const testGoogle=window.__AOS_TEST_CONFIG.google;\n    if(!testGoogle.enabled || clientId!==testGoogle.clientId || spreadsheetId!==testGoogle.spreadsheetId)throw new Error('TEST B0: разрешены только утверждённые тестовые Client ID и Spreadsheet ID.');");
      }
      text="if(!window.__AOS_TEST_ALLOWED)throw new Error('Isolated test origin check failed');\n"+text;
      if(name==='app.js'){
        text=text.replace('./sw.js?v='+VERSION,'./sw.js?testbuild='+buildId);
        text=text.replace('      const backupData = extractBackupData(parsed);', "      const backupData = extractBackupData(parsed);\n      if(backupData.testDataset!=='B0-synthetic/v1')throw new Error('TEST B0: разрешены только синтетические резервные копии B0');");
        text=text.replace('      state = freshState();','      state = clone(window.__AOS_TEST_B0);');
        text=text.replace('Сбросить все данные<small>Действие нельзя отменить','Вернуть B0<small>Только тестовые данные');
        text=text.replace('Точно удалить все данные и вернуть стартовую версию?','Вернуть локальный синтетический набор B0? Google Таблица не очищается.');
      }
    }
    files.set(name,text);
  }
  files.set('gate0-test-guard.js',guardCode(config,b0));
  files.set('B0.json',JSON.stringify(b0,null,2)+'\n');
  files.set('404.html','<!doctype html><html lang="ru"><meta charset="utf-8"><title>AOS TEST</title><h1>Тестовая страница не найдена</h1></html>\n');
  const googleSources=googleEnabled?' https://accounts.google.com https://sheets.googleapis.com':'';
  const csp=`default-src 'self'; script-src 'self' 'unsafe-inline'${googleEnabled?' https://accounts.google.com':''}; style-src 'self' 'unsafe-inline'${googleEnabled?' https://accounts.google.com':''}; img-src 'self' data:; connect-src 'self'${googleSources}; frame-src ${googleEnabled?'https://accounts.google.com':"'none'"}; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  files.set('_headers',`/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Cache-Control: no-store\n  Content-Security-Policy: ${csp}\n`);
  const manifest={tool:'aos-gate0-local-package/v1',version:VERSION,buildId,sourceCommit,origin,googleEnabled,published:false,sourceHashes,files:Object.fromEntries([...files].map(([name,body])=>[name,digest(body)]))};
  files.set('_aos-build.json',JSON.stringify(manifest,null,2)+'\n');
  if(fs.existsSync(output)){
    const names=fs.readdirSync(output).sort();
    if(JSON.stringify(names)!==JSON.stringify([...files.keys()].sort()) || [...files].some(([name,body])=>!fs.readFileSync(path.join(output,name)).equals(Buffer.from(body))))throw new Error('Output exists and differs; choose a fresh --out. No files overwritten.');
  }else{
    fs.mkdirSync(output,{recursive:true});
    for(const [name,body] of files)fs.writeFileSync(path.join(output,name),body,{flag:'wx'});
  }
  return {...manifest,output,fileCount:files.size};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2), options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--allow-loopback-for-tests')options.allowLoopback=true;
    else if(key==='--enable-google')options.googleEnabled=true;
    else if(['--origin','--out','--client-id','--spreadsheet-id'].includes(key)){
      const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Missing argument for '+key);
      options[{'--origin':'origin','--out':'out','--client-id':'clientId','--spreadsheet-id':'spreadsheetId'}[key]]=value;
    }else throw new Error('Unknown option '+key);
  }
  const result=prepare(options);
  console.log(JSON.stringify({output:result.output,origin:result.origin,version:result.version,buildId:result.buildId,fileCount:result.fileCount,googleEnabled:result.googleEnabled,published:false},null,2));
}
