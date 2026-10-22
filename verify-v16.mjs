import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const get=p=>fs.readFileSync(p,'utf8');
const html=get('index.html'),css=get('brand-theme.css'),app=get('app.js'),sw=get('sw.js');
const manifest=JSON.parse(get('manifest.webmanifest'));
let checks=0;
function check(ok,msg){assert.ok(ok,msg);checks++;console.log('OK:',msg)}
check(html.includes('brand-theme.css?v=16.0.0'),'design CSS versioned');
check(html.includes('Alexander OS V16.0'),'visible version consistent');
check(html.includes('viewport-fit=cover'),'iOS safe area enabled');
check(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'5 equal bottom nav columns');
check(css.includes('--aos16-canvas:#000000'),'full black theme');
check(css.includes('--aos16-accent:#B9FD50'),'brand lime');
check(css.includes(':root[data-theme="light"]'),'separate light theme');
check(css.includes('font-size:16px!important'),'iOS input no autofocus zoom');
check(app.includes('aos16-quicknav'),'dashboard quick actions added');
check(css.includes('.bottom-nav .nav-item small'),'bottom nav captions');
check(css.includes('.aos-sync-dialog'),'Google Sheets dialog themed');
check(css.includes('.aos152-field input'),'feature form themed');
check(css.includes('.senyaav-ai-dialog'),'AI modal themed');
check(app.includes('liquid - cushion - upcomingPayments'),'cushion excluded from spendable money');
check(!/\banalytics\.free\b/.test(app),'missing analytics.free reference fixed');
check(sw.includes('alexander-os-v16-0-design'),'new offline cache');
check(manifest.start_url.includes('16.0.0'),'PWA start URL updated');
check(manifest.theme_color==='#000000','PWA black status bar background');
check(get('app.js').includes('state.version = 14.3;'),'financial state schema preserved');
for(const name of ['app.js','sw.js','brand-sheets.js','senyaav-ai-v157.js','runtime-v155.js']){
  if(fs.existsSync(name)){execFileSync('node',['--check',name],{stdio:'pipe'});checks++;console.log('OK: syntax '+name)}
}
console.log(`Verified ${checks} checks. Note: does not replace on-device iPhone test or GitHub deploy validation.`);
