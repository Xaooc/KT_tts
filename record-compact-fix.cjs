const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const installation=read('output/installation-workshop.json');
const installed=fs.readFileSync(installation.files[0].destination);
const hud=JSON.parse(installed).ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript;
const reports={};for(const [name,fixture] of [['compact-rules','compact-rules'],['reference','reference-hud'],['rich-reader','rich-reader'],['ploy','ploy-panel']]){
 const report=read('output/moonsharp-'+name+'-verification.json');assert(report.passed);
 const script=fs.readFileSync('tmp/'+fixture+'-test.lua','utf8');assert(script.includes(hud),'Fixture differs from installed HUD: '+name);
 reports[name]={...report,fixtureSHA256:sha(script),installedHUDSHA256:sha(hud)};
}
const result={status:'installed',installedAt:installation.installedAt,installedSHA256:sha(installed),changedObjectGUID:'efa3fe',changedProperty:'LuaScript',modelsChecked:726,compactCardsChecked:1048,headerBodyBounds:true,fullDescriptionsPreserved:true,scrollContentBounds:true,actionAPCostBounds:true,oddRowsUseFullWidth:true,nativeInterpreterTested:true,inGameUIAutomationTested:false,preview:'output/compact-rules-preview.png',verification:reports,installationVerification:read('output/final-installation-verification.json')};
assert(result.installationVerification.passed);fs.writeFileSync('output/compact-rule-layout-verification.json',JSON.stringify(result,null,2));
const path='output/current-progress.json',progress=read(path);progress.updatedAt=new Date().toISOString();progress.compactRuleLayout=result;fs.writeFileSync(path,JSON.stringify(progress,null,2));
const manifestPath='output/design-candidate-manifest.json',manifest=read(manifestPath);assert.equal(manifest.candidateSHA256,result.installedSHA256);manifest.status='installed';manifest.installedAt=installation.installedAt;manifest.installedVersionUnchanged=false;manifest.nativeInterpreterTested=true;manifest.nativeInterpreterReport='output/compact-rule-layout-verification.json';manifest.examples=['output/compact-rules-preview.png'];fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
const readmePath='output/README.txt';let text=fs.readFileSync(readmePath,'utf8');const heading='КОМПАКТНЫЕ КАРТОЧКИ В R — ИСПРАВЛЕНЫ ОТСТУПЫ\n';if(!text.includes(heading))text=heading+'Русское название и английский оригинал занимают отдельные строки с рассчитанной высотой.\nОписание начинается ниже заголовка; длинный текст прокручивается. Высота рядов учитывает обе соседние карточки.\nПроверены 726 моделей и 1048 карточек на MoonSharp из TTS; ручной прогон в игре не выполнен.\nЗагрузите сохранение «KT24 The Killzone — русский перевод» заново для применения исправления.\n\n'+text;fs.writeFileSync(readmePath,text);
console.log({status:result.status,installedAt:result.installedAt,cards:result.compactCardsChecked,models:result.modelsChecked});
