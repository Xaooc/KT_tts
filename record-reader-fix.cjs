const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const installation=read('output/installation-workshop.json');
assert.equal(installation.scope,'reader-fix');
const installed=fs.readFileSync(installation.files[0].destination);
const hud=JSON.parse(installed).ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript;
const reports={};
for(const [name,fixture] of [['reference','reference-hud'],['ploy','ploy-panel'],['rich-reader','rich-reader']]){
 const report=read('output/moonsharp-'+name+'-verification.json');assert(report.passed);
 const script=fs.readFileSync('tmp/'+fixture+'-test.lua','utf8');assert(script.includes(hud),'Fixture differs from installed HUD: '+name);
 reports[name]={...report,fixtureSHA256:sha(script),installedHUDSHA256:sha(hud)};
}
const result={status:'installed',installedAt:installation.installedAt,installedSHA256:sha(installed),changedObjectGUID:'efa3fe',changedProperty:'LuaScript',cause:'MoonSharp pattern limits and string behavior differ from the previous test interpreter.',fixes:['Literal line splitting and trimming','Unicode-safe case folding and markup stripping','Single-value string helper returns','Invariant numeric UI coordinates'],nativeInterpreterTested:true,inGameUIAutomationTested:false,verification:reports,installationVerification:read('output/final-installation-verification.json')};
fs.writeFileSync('output/reader-fix-verification.json',JSON.stringify(result,null,2));
const path='output/current-progress.json',progress=read(path);progress.updatedAt=new Date().toISOString();progress.readerDesign={...progress.readerDesign,readerFix:result};fs.writeFileSync(path,JSON.stringify(progress,null,2));
const manifestPath='output/design-candidate-manifest.json',manifest=read(manifestPath);manifest.nativeInterpreterTested=true;manifest.nativeInterpreterReport='output/reader-fix-verification.json';fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
const readmePath='output/README.txt';let text=fs.readFileSync(readmePath,'utf8');const heading='ИСПРАВЛЕНИЕ СПРАВОЧНИКА — 05.10.2026\n';if(!text.includes(heading))text=heading+'Исправлено падение pattern too complex при открытии справочника.\nПроверено на MoonSharp из установленного TTS: 41 отряд, 328 уловок, 1612 профилей оружия; сохранность полного текста и кликабельные определения.\nПроверки используют имитацию UI; ручной прогон внутри игры не выполнен.\nЧтобы применить обновление, заново загрузите «KT24 The Killzone — русский перевод» из Saved Games.\n\n'+text;fs.writeFileSync(readmePath,text);
console.log({status:result.status,installedAt:result.installedAt,nativeInterpreterTested:true,inGameUIAutomationTested:false});
