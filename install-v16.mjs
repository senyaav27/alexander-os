#!/usr/bin/env node
/** Alexander OS V16.0 installer. Run in repository root after uploading brand-theme.css.
  * Works with upstream v15.8 and applies idempotent replacements; does NOT reset user data.
  */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s,'utf8');
const updated=[];
const replace=(s,a,b,name,required=true)=>{if(s.includes(b))return s;if(s.includes(a))return s.replace(a,b);if(required)throw new Error(`Cannot patch ${name}: expected upstream fragment missing (${a.slice(0,80)}). Aborting.`);return s};
const versions = ['index.html','app.js','sw.js','manifest.webmanifest','brand-theme.css'];
for(const p of versions)assert.ok(fs.existsSync(p),`${p} not found - run from repository root`);
const brand=read('brand-theme.css');
assert.ok(brand.includes('Alexander OS V16.0') && brand.includes('--aos16-canvas:#000000'),'V16 brand-theme.css must be uploaded before running installer');

let index=read('index.html');
assert.ok(index.includes('<link rel="stylesheet" href="brand-theme.css?'),'Expected original V15.8 index structure missing');
if(!index.includes('content="16.0.0-design"')){
  index=index.replace(/(<meta name="alexander-os-build" content=")[^"]+(" \/>)/,(full,lead,tail)=>lead+'16.0.0-design'+tail);
  index=index.replace(/window\.ALEXANDER_OS_BUILD\s*=\s*'[^']*'/,"window.ALEXANDER_OS_BUILD = '16.0.0'");
  index=index.replace(/!key\.includes\('v15-8'\)/g,"!key.includes('v16-0')");
  index=index.replace(/v=15\.8\.0-brand1/g,'v=16.0.0');
  index=index.replace(/v=15\.8\.0/g,'v=16.0.0');
  index=index.replace(/Alexander OS V15\.8/g,'Alexander OS V16.0');
  index=index.replace(/V15\.8/g,'V16.0');
  index=index.replace(/content="#0F0F10"/,'content="#000000"');
  index=index.replace(/html,body \{ background:#0F0F10; \}/,'html,body { background:#000000; }');
  index=index.replace(/background:#0F0F10;color:#fff/,'background:#000000;color:#fff');
  write('index.html',index);updated.push('index.html');
}
assert.ok(index.includes('brand-theme.css?v=16.0.0'));
assert.ok(index.includes('v=16.0.0'));

let app=read('app.js');
const originalApp=app;
// Quick actions reproduce the approved home layout without inventing a transfer ledger.
// "Счета" is used rather than a misleading "Перевод" button until transfers are supported.
if(!app.includes('class="aos16-quicknav"')){
  const heroAnchor='${dashboardHeroMarkup(heroMetric)}';
  const quickMarkup = `
      <section class="aos16-quicknav" aria-label="Быстрые действия">
        <button type="button" id="aos16Add" class="aos16-quicknav-item primary"><span aria-hidden="true">＋</span><small>Добавить</small></button>
        <button type="button" id="aos16Accounts" class="aos16-quicknav-item"><span aria-hidden="true">▣</span><small>Счета</small></button>
        <button type="button" id="aos16Payments" class="aos16-quicknav-item"><span aria-hidden="true">▤</span><small>Платежи</small></button>
        <button type="button" id="aos16Analytics" class="aos16-quicknav-item"><span aria-hidden="true">▥</span><small>Аналитика</small></button>
      </section>`;
  const loc=app.indexOf(heroAnchor,app.indexOf('function renderDashboard()'));
  if(loc<0)throw new Error('Cannot locate dashboard hero insertion point');
  app=app.slice(0,loc+heroAnchor.length)+quickMarkup+app.slice(loc+heroAnchor.length);
  const endAnchor=`    bindFinanceActions();
    bindStrategicModules();
  }

  function taskItem`;
  const endReplacement=`    bindFinanceActions();
    bindStrategicModules();
    $('#aos16Add')?.addEventListener('click', openGlobalAdd);
    $('#aos16Accounts')?.addEventListener('click', () => { financeTab='accounts'; switchScreen('finance'); });
    $('#aos16Payments')?.addEventListener('click', () => { financeTab='obligations'; switchScreen('finance'); });
    $('#aos16Analytics')?.addEventListener('click', () => { financeTab='overview'; switchScreen('finance'); });
  }

  function taskItem`;
  app=replace(app,endAnchor,endReplacement,'dashboard quick actions');
}
// Keep the persisted schema version intact: 14.3 identifies data layout, not UI build.
app=replace(app,'const freeBalance = liquid - upcomingPayments;','const freeBalance = liquid - cushion - upcomingPayments;','freeBalance');
app=app.replaceAll('getFinanceAnalytics().free','getFinanceAnalytics().freeBalance').replace(/\banalytics\.free\b/g,'analytics.freeBalance');
app=app.replace("navigator.serviceWorker.register('./sw.js?v=14.3.0')", "navigator.serviceWorker.register('./sw.js?v=16.0.0')");
app=app.replace('>V14.3</span>','>V16.0</span>');
if(app!==originalApp){write('app.js',app);updated.push('app.js')}

let sw=read('sw.js');const oldSW=sw;
sw=sw.replace(/const CACHE = '[^']+';/,"const CACHE = 'alexander-os-v16-0-design';");
sw=sw.replaceAll('v=15.8.0-brand1','v=16.0.0').replaceAll('v=15.8.0','v=16.0.0');
sw=sw.replaceAll('brand-theme.css?v=15.8.0-brand1','brand-theme.css?v=16.0.0');
if(sw!==oldSW){write('sw.js',sw);updated.push('sw.js')}

const m=JSON.parse(read('manifest.webmanifest'));
m.name='Alexander OS V16.0';m.start_url='./?build=16.0.0';m.background_color='#000000';m.theme_color='#000000';
write('manifest.webmanifest',JSON.stringify(m,null,2)+'\n');updated.push('manifest.webmanifest');

assert.ok(index.includes('<meta name="viewport"'));
assert.ok(app.includes('liquid - cushion - upcomingPayments'));
assert.ok(!app.includes('analytics.free ?'));
assert.ok(sw.includes('alexander-os-v16-0-design'));
console.log('Alexander OS V16.0 installed. Files updated: '+(updated.join(', ')||'none'));
