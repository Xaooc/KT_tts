const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const dir='C:/Users/PC/Documents/My Games/Tabletop Simulator';
const targets=[dir+'/Mods/Workshop/3573927734_RU.json',dir+'/Saves/KT24-The-Killzone-RU.json'];
const pack=dir+'/Saves/Saved Objects/KT41-RU.json',original=dir+'/Mods/Workshop/3573927734.json';
const candidate='output/KT24-The-Killzone-RU-assistant-candidate.json',build=read('output/assistant-runtime-build.json');
const reports=['moonsharp-assistant-runtime-verification.json','moonsharp-assistant-core-verification.json','moonsharp-assistant-adapter-verification.json','moonsharp-weapon-fallback-verification.json','moonsharp-assistant-reader-regression.json','moonsharp-assistant-reader-integrity.json','assistant-native-layout-verification.json'];
const checks=Object.fromEntries(reports.map(p=>[p,read('output/'+p)]));for(const r of Object.values(checks))assert(r.passed,'Unpassed verification');
assert.equal(sha(candidate),build.candidateSHA256);
for(const target of targets)assert.equal(sha(target),build.sourceSHA256,'Installed file changed; preserve user edits: '+target);
const before=read(targets[0]),after=read(candidate);const cleaned=structuredClone(after);
for(const guid of build.changedObjects){const old=before.ObjectStates.find(x=>x.GUID===guid),current=cleaned.ObjectStates.find(x=>x.GUID===guid);assert(old&&current);current.LuaScript=old.LuaScript;}
assert.deepStrictEqual(cleaned,before,'Unexpected mod mutation beyond two scripts');
const originalHash=sha(original),packHash=sha(pack);
const rollback='output/KT24-The-Killzone-RU-before-assistant.json';
if(fs.existsSync(rollback))assert.equal(sha(rollback),build.sourceSHA256,'Existing rollback differs');else fs.copyFileSync(targets[0],rollback,fs.constants.COPYFILE_EXCL);
const bytes=fs.readFileSync(candidate);const installed=[];
try{
 for(const target of targets){
  assert.equal(sha(target),build.sourceSHA256);
  const staging=target+'.assistant-'+process.pid+'-'+Date.now()+'.staging';let created=false;
  try{fs.writeFileSync(staging,bytes,{flag:'wx'});created=true;assert.equal(sha(staging),build.candidateSHA256);assert.equal(sha(target),build.sourceSHA256);fs.renameSync(staging,target);installed.push(target);assert.equal(sha(target),build.candidateSHA256);}
  finally{if(created&&fs.existsSync(staging))fs.unlinkSync(staging);}
 }
}catch(error){for(const target of installed)if(sha(target)===build.candidateSHA256)fs.copyFileSync(rollback,target);throw error;}
assert.equal(sha(original),originalHash);assert.equal(sha(pack),packHash);
const report={status:'installed',installedAt:new Date().toISOString(),approvedStyle:'Справочник / compact assistant',files:targets.map(destination=>({destination,sha256:sha(destination)})),rollback,rollbackSHA256:sha(rollback),unchanged:[{path:original,sha256:originalHash},{path:pack,sha256:packHash}],teams:build.teams,ploys:build.ploys,structuredPloys:build.structuredPloys,manualPloys:build.ploys-build.structuredPloys,verification:checks,criticSwarm:{model:'gpt-6-luna',effort:'max',roles:['rules and interface','state and transaction integrity'],addressed:['explicit roster enrollment','host seat identity','physical readiness/order and ownership synchronization','single CP log','round/phase/turn attachment','dead active unit cannot act','exact Guard undo','AP cost and rule exception separate','sticky completion controls','WR fallback with saved-definition priority']},nativeTTSUIRendered:false,computerUse:false,usage:'assistant-usage-ru.md',limitations:['Native TTS graphical gameplay not exercised','Most team ploys require manual confirmation of timing, cost and effect duration','Two scoreboard participants required; host occupies one seat','Geometry, targets, dice and WND healing remain manual']};
fs.writeFileSync('output/assistant-installation-report.json',JSON.stringify(report,null,2));
const progress=read('output/current-progress.json');progress.assistantIntegration={status:'installed',report:'output/assistant-installation-report.json',teams:build.teams,ploys:build.ploys,WRFallback:true,CPConnected:true,nativeTTSRuntimeTested:false};progress.assistantPrototype.status='approved-and-integrated';progress.assistantPrototype.runtimeReport='output/assistant-installation-report.json';fs.writeFileSync('output/current-progress.json',JSON.stringify(progress,null,2));
const old=read('output/installation-workshop.json');old.installedAt=report.installedAt;old.scope='assistant-and-weapon-reference';old.files=report.files.map(x=>({...x,source:candidate}));old.assistantReport='output/assistant-installation-report.json';fs.writeFileSync('output/installation-workshop.json',JSON.stringify(old,null,2));
console.log({status:report.status,files:report.files,teams:report.teams,ploys:report.ploys,nativeTTSUIRendered:false});
