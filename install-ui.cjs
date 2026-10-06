const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto'),os=require('os'),cp=require('child_process');
const {targets,hash,assertOnlyScriptsChanged,atPath}=require('./build-ui.cjs');
const {resolveTtsDir,ttsTargets}=require('./tts-paths.cjs');
const {parseSource}=require('./lua-display.cjs');
const output=path.join(__dirname,'output'),reportFile=path.join(output,'ui-installation-report.json');
const sha=file=>hash(fs.readFileSync(file));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const guard=(file,expected)=>assert.equal(sha(file),expected,'Installed file changed; preserve user edits: '+file);

function stagedWrite(file,bytes,expected,newSHA){
  const staging=file+'.ui-'+process.pid+'-'+crypto.randomUUID()+'.staging';let created=false;
  try{
    fs.writeFileSync(staging,bytes,{flag:'wx'});created=true;
    assert.equal(sha(staging),newSHA,'Staged file hash differs');
    if(expected!==null)guard(file,expected);
    fs.renameSync(staging,file);
  }finally{if(created&&fs.existsSync(staging))fs.unlinkSync(staging);}
}

function writeReport(report){
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');stagedWrite(reportFile,bytes,null,hash(bytes));
}

function runningWarning(force){
  if(os.platform()!=='win32')return;
  const result=cp.spawnSync('tasklist',['/FI','IMAGENAME eq Tabletop Simulator.exe','/NH'],{encoding:'utf8'});
  let processRunning=/Tabletop Simulator\.exe/i.test(result.stdout||'');
  if(result.status!==0){
    assert(/access denied/i.test(result.stdout||result.stderr||''),
      'Could not check whether Tabletop Simulator is running: '+(result.stderr||result.stdout||result.error||''));
    // Some restricted Windows shells deny tasklist; use the same process name query via PowerShell.
    const fallback=cp.spawnSync('powershell.exe',['-NoProfile','-Command',
      "Get-Process -Name 'Tabletop Simulator' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName; exit 0"],
    {encoding:'utf8'});
    assert.equal(fallback.status,0,'Could not check whether Tabletop Simulator is running: '+(fallback.stderr||fallback.error||''));
    processRunning=/Tabletop Simulator/i.test(fallback.stdout||'');
  }
  if(processRunning){
    assert(force,'Tabletop Simulator.exe is running; close TTS before installing or rolling back.');
    console.warn('WARNING: TTS is running. TTS autosave may overwrite the Saves copy.');
  }
}

function targetBaseline(build,target){
  const entry=(build.targetHashes||[]).find(item=>path.resolve(item.target).toLowerCase()===path.resolve(target).toLowerCase());
  return entry?.sha256;
}

function selectTargets(build,selected){
  const requested=selected==='both'?targets:selected==='workshop'?[targets[0]]:[targets[1]];
  const eligible=[],skipped=[];
  for(const target of requested){
    const baseline=targetBaseline(build,target);
    if(!baseline){skipped.push({target,reason:'No pre-build hash recorded for this target.'});continue;}
    const current=sha(target);
    if(current!==baseline){skipped.push({target,reason:'Target changed since build; preserve its current edits.'});continue;}
    if(baseline!==build.sourceSHA256){skipped.push({target,reason:'Target differs from the build source; rebuilding from this copy is required.'});continue;}
    eligible.push({target,expected:baseline,oldBytes:fs.readFileSync(target)});
  }
  return {eligible,skipped};
}

function install(required,{dryRun=false,target='both',force=false}={}){
  if(required.length===0&&!dryRun)assert(false,'At least one verification report is required: --require <report.json>...');
  const checks=required.map(file=>{
    const report=read(file);assert.equal(report.passed,true,'Unpassed verification: '+file);return {path:path.resolve(file),report};
  });
  const buildFile=path.join(output,'ui-build.json'),build=read(buildFile);
  assert.equal(build.status,'candidate','Build report is not a candidate');
  assert(/^[a-f0-9]{64}$/.test(build.sourceSHA256)&&/^[a-f0-9]{64}$/.test(build.candidateSHA256),'Invalid build hashes');
  assert(Array.isArray(build.changedObjects),'Build report has no changedObjects');
  const candidate=path.resolve(build.candidate||path.join(output,'KT24-The-Killzone-RU-ui-candidate.json'));
  const bytes=fs.readFileSync(candidate);assert.equal(hash(bytes),build.candidateSHA256,'Candidate differs from build report');
  runningWarning(force);
  const {eligible,skipped}=selectTargets(build,target);
  assert(eligible.length||dryRun,'No selected target matches the build source hash; see skipped target reasons.');
  const sourceBytes=fs.readFileSync(build.source);assert.equal(hash(sourceBytes),build.sourceSHA256,'Build source changed');
  const before=JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/,''));
  const after=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  assertOnlyScriptsChanged(before,after,build.changedObjects);
  for(const entry of build.changedObjects)parseSource(atPath(after,entry.pathSegments).LuaScript);
  const plan={status:dryRun?'dry-run':'candidate',targets:eligible.map(entry=>entry.target),skipped};
  if(dryRun){console.log(JSON.stringify(plan,null,2));return plan;}
  const installed=[];
  try{
    for(const entry of eligible){
      // Hash is checked inside stagedWrite immediately before the atomic rename.
      stagedWrite(entry.target,bytes,entry.expected,build.candidateSHA256);
      installed.push(entry);assert.equal(sha(entry.target),build.candidateSHA256,'Installed file hash differs: '+entry.target);
    }
    for(const entry of installed)guard(entry.target,build.candidateSHA256);
    const rollback=path.join(output,'KT24-The-Killzone-RU-before-ui-'+build.sourceSHA256.slice(0,8)+'.json');
    const sourceEntry=eligible.find(entry=>path.resolve(entry.target).toLowerCase()===path.resolve(build.source).toLowerCase())||eligible[0];
    assert.equal(hash(sourceEntry.oldBytes),build.sourceSHA256,'Eligible target cannot provide the source rollback copy.');
    if(fs.existsSync(rollback))guard(rollback,build.sourceSHA256);
    else fs.writeFileSync(rollback,sourceEntry.oldBytes,{flag:'wx'});
    const report={status:'installed',installedAt:new Date().toISOString(),buildReport:buildFile,candidate,
      sourceSHA256:build.sourceSHA256,candidateSHA256:build.candidateSHA256,rollback,
      rollbackSHA256:build.sourceSHA256,files:installed.map(entry=>({destination:entry.target,sha256:sha(entry.target)})),
      skipped,verification:checks,counts:build.counts};
    writeReport(report);console.log(JSON.stringify({status:report.status,files:report.files,skipped,rollback},null,2));return report;
  }catch(error){
    for(const entry of installed.reverse())try{stagedWrite(entry.target,entry.oldBytes,build.candidateSHA256,entry.expected);}catch{}
    throw error;
  }
}

function rollback({force=false,dryRun=false,target='both'}={}){
  runningWarning(force);
  const previous=read(reportFile);assert.equal(previous.status,'installed','Last installation report is not an installed release');
  assert.equal(previous.rollbackSHA256,previous.sourceSHA256,'Rollback report source hash differs');
  assert.equal(sha(previous.rollback),previous.rollbackSHA256,'Rollback copy differs from installation report');
  const listed=new Set(previous.files.map(file=>path.resolve(file.destination).toLowerCase()));
  const requested=target==='both'?targets:target==='workshop'?[targets[0]]:[targets[1]];
  const eligible=requested.filter(file=>listed.has(path.resolve(file).toLowerCase())&&sha(file)===previous.candidateSHA256);
  const skipped=requested.filter(file=>!eligible.includes(file)).map(file=>({target:file,reason:'Target is not at the reported installed hash.'}));
  assert(eligible.length||dryRun,'No selected target is safe to roll back.');
  if(dryRun){console.log(JSON.stringify({status:'dry-run',rollback:eligible,skipped},null,2));return;}
  const bytes=fs.readFileSync(previous.rollback),newSHA=previous.rollbackSHA256;
  const originals=eligible.map(file=>({file,bytes:fs.readFileSync(file)})),restored=[];
  try{
    for(const file of eligible){
      stagedWrite(file,bytes,previous.candidateSHA256,newSHA);restored.push(file);
    }
  }catch(error){
    for(const file of restored.reverse())try{
      const original=originals.find(entry=>entry.file===file);
      stagedWrite(file,original.bytes,newSHA,previous.candidateSHA256);
    }catch{}
    throw error;
  }
  const report={...previous,status:'rolled-back',rolledBackAt:new Date().toISOString(),
    files:eligible.map(destination=>({destination,sha256:sha(destination)})),skipped};
  writeReport(report);console.log(JSON.stringify({status:report.status,files:report.files,skipped},null,2));
}

function cli(argv){
  const required=[];let restoring=false,dryRun=false,force=false,target='both';
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--rollback'){assert(!restoring,'Duplicate --rollback');restoring=true;continue;}
    if(argv[i]==='--dry-run'){dryRun=true;continue;}
    if(argv[i]==='--force-while-running'){force=true;continue;}
    if(argv[i]==='--target'){target=argv[++i];assert(['workshop','save','both'].includes(target),'--target must be workshop, save, or both');continue;}
    if(argv[i]==='--tts-dir'){const dir=resolveTtsDir({dir:argv[++i]});targets.splice(0,targets.length,...ttsTargets(dir));continue;}
    assert.equal(argv[i],'--require','Unknown option: '+argv[i]);const start=required.length;
    while(argv[i+1]&&!argv[i+1].startsWith('--'))required.push(argv[++i]);
    assert(required.length>start,'--require needs at least one report path');
  }
  if(!targets.length)targets.push(...ttsTargets(resolveTtsDir()));
  assert(!restoring||required.length===0,'--rollback cannot be combined with --require');
  if(restoring)rollback({force,dryRun,target});else install(required,{dryRun,target,force});
}

if(require.main===module){try{cli(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={install,rollback,selectTargets};
