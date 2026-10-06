const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {targets,hash,assertOnlyScriptsChanged,atPath}=require('./build-ui.cjs');
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

function transaction(bytes,oldBytes,expected,newSHA,makeReport){
  const installed=[];
  try{
    for(const target of targets){
      guard(target,expected);stagedWrite(target,bytes,expected,newSHA);installed.push(target);
      assert.equal(sha(target),newSHA,'Installed file hash differs: '+target);
    }
    // Include final verification and report publication in the recovery boundary.
    for(const target of targets)guard(target,newSHA);
    const report=makeReport();writeReport(report);return report;
  }catch(error){
    const recovery=[];
    for(const target of installed.reverse()){
      try{stagedWrite(target,oldBytes,newSHA,expected);guard(target,expected);recovery.push({target,restored:true});}
      catch(restoreError){recovery.push({target,restored:false,error:restoreError.message});}
    }
    const failure={status:'failed',failedAt:new Date().toISOString(),error:error.message,recovery};
    // Preserve the last successful report so --rollback remains usable after a failed attempt.
    try{
      const file=path.join(output,'ui-installation-failure.json'),failureBytes=Buffer.from(JSON.stringify(failure,null,2)+'\n');
      stagedWrite(file,failureBytes,null,hash(failureBytes));
    }catch(reportError){error.message+='; failure report: '+reportError.message;}
    if(recovery.some(entry=>!entry.restored))error.message+='; recovery incomplete: '+JSON.stringify(recovery);
    throw error;
  }
}

function install(required){
  assert(required.length>0,'At least one verification report is required: --require <report.json>...');
  const checks=required.map(file=>{
    const report=read(file);assert.equal(report.passed,true,'Unpassed verification: '+file);return {path:path.resolve(file),report};
  });
  const buildFile=path.join(output,'ui-build.json'),build=read(buildFile);
  assert.equal(build.status,'candidate','Build report is not a candidate');
  assert(/^[a-f0-9]{64}$/.test(build.sourceSHA256)&&/^[a-f0-9]{64}$/.test(build.candidateSHA256),'Invalid build hashes');
  assert(Array.isArray(build.changedObjects),'Build report has no changedObjects');
  const candidate=path.resolve(build.candidate||path.join(output,'KT24-The-Killzone-RU-ui-candidate.json'));
  const bytes=fs.readFileSync(candidate);assert.equal(hash(bytes),build.candidateSHA256,'Candidate differs from build report');
  for(const target of targets)guard(target,build.sourceSHA256);
  const oldBytes=fs.readFileSync(targets[0]);assert.equal(hash(oldBytes),build.sourceSHA256,'Installed source changed');
  const before=JSON.parse(oldBytes.toString('utf8').replace(/^\uFEFF/,''));
  const after=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  assertOnlyScriptsChanged(before,after,build.changedObjects);
  for(const entry of build.changedObjects)parseSource(atPath(after,entry.pathSegments).LuaScript);
  const rollback=path.join(output,'KT24-The-Killzone-RU-before-ui-'+build.sourceSHA256.slice(0,8)+'.json');
  if(fs.existsSync(rollback))assert.equal(sha(rollback),build.sourceSHA256,'Existing rollback differs');
  else{
    guard(targets[0],build.sourceSHA256);fs.copyFileSync(targets[0],rollback,fs.constants.COPYFILE_EXCL);
    assert.equal(sha(rollback),build.sourceSHA256,'Rollback copy hash differs');
  }
  const report=transaction(bytes,oldBytes,build.sourceSHA256,build.candidateSHA256,()=>({
    status:'installed',installedAt:new Date().toISOString(),buildReport:buildFile,candidate,
    sourceSHA256:build.sourceSHA256,candidateSHA256:build.candidateSHA256,
    rollback,rollbackSHA256:build.sourceSHA256,files:targets.map(destination=>({destination,sha256:sha(destination)})),
    verification:checks,counts:build.counts,
  }));
  console.log(JSON.stringify({status:report.status,files:report.files,rollback:report.rollback},null,2));
}

function rollback(){
  const previous=read(reportFile);assert.equal(previous.status,'installed','Last installation report is not an installed release');
  assert.equal(previous.rollbackSHA256,previous.sourceSHA256,'Rollback report source hash differs');
  assert.equal(sha(previous.rollback),previous.rollbackSHA256,'Rollback copy differs from installation report');
  for(const target of targets)guard(target,previous.candidateSHA256);
  const oldBytes=fs.readFileSync(targets[0]);assert.equal(hash(oldBytes),previous.candidateSHA256,'Installed candidate changed');
  const bytes=fs.readFileSync(previous.rollback);assert.equal(hash(bytes),previous.rollbackSHA256,'Rollback changed');
  const report=transaction(bytes,oldBytes,previous.candidateSHA256,previous.rollbackSHA256,()=>({
    ...previous,status:'rolled-back',rolledBackAt:new Date().toISOString(),
    files:targets.map(destination=>({destination,sha256:sha(destination)})),
  }));
  console.log(JSON.stringify({status:report.status,files:report.files,rollback:report.rollback},null,2));
}

function cli(argv){
  const required=[];let restoring=false;
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--rollback'){assert(!restoring,'Duplicate --rollback');restoring=true;continue;}
    assert.equal(argv[i],'--require','Unknown option: '+argv[i]);const start=required.length;
    while(argv[i+1]&&!argv[i+1].startsWith('--'))required.push(argv[++i]);
    assert(required.length>start,'--require needs at least one report path');
  }
  assert(!restoring||required.length===0,'--rollback cannot be combined with --require');
  if(restoring)rollback();else install(required);
}

if(require.main===module){try{cli(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
