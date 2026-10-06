const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto');
const {parseSource}=require('./lua-display.cjs');
const root=__dirname;
const {resolveTtsDir,ttsTargets}=require('./tts-paths.cjs');
const targets=[];
try{targets.push(...ttsTargets(resolveTtsDir()));}catch{}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const anchors=[
  '-- Russian references, per-seat state, no changes to attacks/CP/activation state.',
  '-- Real inline Buttons; Text/HTML links cannot send click events in TTS.',
  '-- Ploy use reminders: rules/effects and CP are resolved by players on the existing table.',
  '-- Read-only bridge: gameplay state is owned by the scoreboard assistant.',
];
// Installed 339b7f line 2912: cut BEFORE the runtime's state declarations and arText helpers.
const runtimeAnchor='-- Native assistant lives on the existing scoreboard. No remote service or dice automation.';
const dataNames=['ruReferenceTeams','ruReferenceCommon','ruReferenceEquipment','ruReferenceShared','ruCoreGlossary','ruFontMetrics'];
const methods='setXmlTable|getXmlTable|setXml|getXml|setAttribute|setAttributes|getAttribute|getAttributes';
const uiCall=new RegExp('(?:Global\\s*\\.\\s*)?UI\\s*\\.\\s*('+methods+'|setValue|getValue|setClass|show|hide|loading)\\b','g');

function markerParts(script){
  const token=/^--\[\[RU-UI:([\w./-]+):(BEGIN|END)\]\][ \t]*(?:\r?\n|$)/gm;
  const parts=[];let open=null,cursor=0,match;
  while((match=token.exec(script))){
    if(match[2]==='BEGIN'){
      assert(!open,'Nested RU-UI marker: '+match[1]);
      if(match.index>cursor)parts.push({text:script.slice(cursor,match.index)});
      open={name:match[1],start:match.index,contentStart:token.lastIndex};
    }else{
      assert(open&&open.name===match[1],'Unmatched RU-UI END marker: '+match[1]);
      parts.push({name:open.name,text:script.slice(open.start,token.lastIndex),content:script.slice(open.contentStart,match.index)});
      cursor=token.lastIndex;open=null;
    }
  }
  assert(!open,'Unclosed RU-UI marker: '+open?.name);
  if(cursor<script.length)parts.push({text:script.slice(cursor)});
  return parts;
}

function removeBlocks(script,predicate){
  return markerParts(script).filter(part=>!part.name||!predicate(part.name)).map(part=>part.text).join('');
}

function replaceBlock(script,name,content,position){
  assert(/^[\w./-]+$/.test(name),'Invalid RU-UI block name');
  assert(position==='top'||position==='bottom','Invalid RU-UI block position');
  const parts=markerParts(content),wrapped=parts.filter(part=>part.name);
  if(wrapped.length){
    assert(wrapped.length===1&&wrapped[0].name===name&&parts.every(part=>part.name||!part.text.trim()),
      'Injected content must be plain Lua or one matching RU-UI block: '+name);
    content=wrapped[0].content;
  }
  const body=content.replace(/\r\n/g,'\n').replace(/^[\r\n]+|[\r\n]+$/g,'');
  const block='--[[RU-UI:'+name+':BEGIN]]\n'+body+'\n--[[RU-UI:'+name+':END]]\n';
  const base=removeBlocks(script,existing=>existing===name);
  if(position==='top')return block+base.replace(/^[\r\n]+/,'');
  return base.replace(/[\r\n]+$/,'')+(base.replace(/[\r\n]+$/,'')?'\n':'')+block;
}

// Mask strings/comments without changing offsets. Rewrites must never alter literal XML, text, or comments.
function luaCode(script){
  const excluded=/--\[(=*)\[[\s\S]*?\]\1\]|--[^\r\n]*|\[(=*)\[[\s\S]*?\]\2\]|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g;
  return script.replace(excluded,text=>' '.repeat(text.length));
}

function validPrefix(code,index){return !/\w/.test(code[index-1]||'')&&!/\.$/.test(code.slice(0,index).trimEnd());}

function isGlobalUIWriter(script){
  for(const part of markerParts(script)){
    if(part.name)continue;
    const code=luaCode(part.text);uiCall.lastIndex=0;let match;
    while((match=uiCall.exec(code))){
      if(validPrefix(code,match.index)&&(match[1]==='loading'||/^\s*\(/.test(code.slice(uiCall.lastIndex))))return true;
    }
  }
  return false;
}

function rewriteGlobalUI(script){
  let rewrites=0;
  const text=markerParts(script).map(part=>{
    if(part.name)return part.text;
    const code=luaCode(part.text),matches=[...code.matchAll(/\bGlobal\s*\.\s*UI\s*\.[ \t]*/g)];
    let result=part.text;
    for(const match of matches.reverse()){
      if(!validPrefix(code,match.index))continue;
      if(!/^Global\s*\.\s*UI\s*\.[ \t]*$/.test(part.text.slice(match.index,match.index+match[0].length)))continue;
      result=result.slice(0,match.index)+'UI.'+result.slice(match.index+match[0].length);rewrites++;
    }
    return result;
  }).join('');
  return {text,rewrites};
}

function cutHudLegacy(script){
  const parts=markerParts(script),outside=parts.filter(part=>!part.name).map(part=>part.text).join('');
  const lines=outside.split(/\r?\n/),indices=anchors.map(anchor=>{
    const found=lines.flatMap((line,i)=>line.startsWith(anchor)?[i]:[]);
    assert(found.length<=1,'Duplicate HUD legacy anchor: '+anchor);return found[0]??-1;
  });
  if(indices.every(index=>index<0)){
    const data=parts.filter(part=>part.name==='data');
    assert(data.length===1,'HUD legacy anchors missing and no existing RU-UI:data block');
    return {script,data:data[0].content,alreadyBuilt:true};
  }
  assert(indices.every((index,i)=>index>=0&&(i===0||index>indices[i-1])),
    'HUD legacy anchors missing or out of order; expected all four A/B/C/D anchors');
  assert(!parts.some(part=>part.name&&part.name!=='shim'),'Unexpected blocks alongside HUD legacy anchors');
  const removed=lines.slice(indices[0]);
  // The installed save uses local declarations; preserve their exact lines and lexical scope.
  const dataExpression=new RegExp('^\\s*(?:local\\s+)?('+dataNames.join('|')+')\\s*=');
  const data=removed.filter(line=>dataExpression.test(line));
  for(const name of dataNames){
    const expression=new RegExp('^\\s*(?:local\\s+)?'+name+'\\s*=');
    const count=data.filter(line=>expression.test(line)).length;
    assert(count<=1&&(!dataNames.slice(0,4).includes(name)||count===1),'Missing or duplicate HUD data: '+name);
  }
  const shim=parts.filter(part=>part.name==='shim').map(part=>part.text).join('');
  return {script:shim+lines.slice(0,indices[0]).join('\n'),data:data.join('\n'),alreadyBuilt:false};
}

function cutScoreboardLegacy(script){
  const parts=markerParts(script),outside=parts.filter(part=>!part.name).map(part=>part.text).join('');
  const lines=outside.split(/\r?\n/),found=lines.flatMap((line,i)=>line===runtimeAnchor?[i]:[]);
  if(found.length===0){
    assert(parts.some(part=>part.name==='hub-migration'),'Scoreboard assistant runtime anchor missing: '+runtimeAnchor);
    return script;
  }
  assert(found.length===1,'Duplicate scoreboard assistant runtime anchor');
  assert(!parts.some(part=>part.name&&part.name!=='shim'),'Unexpected blocks alongside scoreboard legacy runtime');
  assert(lines.slice(found[0]+1).some(line=>/^local function arText\(/.test(line)),'Scoreboard runtime arText anchor missing');
  const shim=parts.filter(part=>part.name==='shim').map(part=>part.text).join('');
  return shim+lines.slice(0,found[0]).join('\n');
}

function walkObjects(save,visit){
  function walk(object,segments){
    assert(object&&typeof object==='object'&&!Array.isArray(object),'Invalid save object at '+displayPath(segments));
    visit(object,segments);
    for(const [i,child] of (object.ContainedObjects||[]).entries())walk(child,[...segments,'ContainedObjects',i]);
    for(const [key,child] of Object.entries(object.States||{}))walk(child,[...segments,'States',key]);
  }
  assert(Array.isArray(save.ObjectStates),'Save has no ObjectStates array');
  save.ObjectStates.forEach((object,i)=>walk(object,['ObjectStates',i]));
}

function displayPath(segments){
  return '$'+segments.map(key=>{
    if(typeof key==='number')return '['+key+']';
    return /^\w+$/.test(key)&&!/^\d/.test(key)?'.'+key:'['+JSON.stringify(key)+']';
  }).join('');
}

function atPath(save,segments){return segments.reduce((value,key)=>value?.[key],save);}

function assertOnlyScriptsChanged(source,candidate,changed){
  assert.equal(candidate.ObjectStates.length,source.ObjectStates.length,'ObjectStates count changed');
  let beforeCount=0,afterCount=0;walkObjects(source,()=>beforeCount++);walkObjects(candidate,()=>afterCount++);
  assert.equal(afterCount,beforeCount,'Recursive object count changed');
  const allowed=new Set(['[]']);walkObjects(source,(_,segments)=>allowed.add(JSON.stringify(segments)));
  const restore=[],seen=new Set();
  try{
    for(const entry of changed){
      assert(Array.isArray(entry.pathSegments),'Changed script requires pathSegments');
      const key=JSON.stringify(entry.pathSegments);assert(!seen.has(key),'Duplicate changed script path');seen.add(key);
      assert(allowed.has(key),'Changed script path is not a save object');
      const before=atPath(source,entry.pathSegments),after=atPath(candidate,entry.pathSegments);
      assert(before&&after,'Changed script path missing');
      assert(entry.pathSegments.length===0||entry.pathSegments[0]==='ObjectStates','Invalid changed script path');
      assert.equal(before.GUID,after.GUID,'Changed script GUID differs');
      restore.push({after,had:Object.hasOwn(after,'LuaScript'),script:after.LuaScript});
      if(Object.hasOwn(before,'LuaScript'))after.LuaScript=before.LuaScript;else delete after.LuaScript;
    }
    assert.deepStrictEqual(candidate,source,'Unexpected mutation outside intended LuaScript fields');
  }finally{
    for(const {after,had,script} of restore){if(had)after.LuaScript=script;else delete after.LuaScript;}
  }
}

function buildSave(source,{composer,shim,mode='platform',modules={}}){
  assert(typeof composer==='string'&&typeof shim==='string','Composer and shim Lua sources are required');
  assert(['platform','hub'].includes(mode),'Mode must be platform or hub');
  if(mode==='hub')assert(Array.isArray(modules.efa3fe)&&Array.isArray(modules['339b7f']),'Hub manifest must list both GUIDs');
  const candidate=structuredClone(source),changedObjects=[],hubCounts={efa3fe:0,'339b7f':0};let writers=0,totalRewrites=0;
  function change(object,segments,global=false){
    const old=object.LuaScript??'';assert(typeof old==='string','LuaScript must be a string at '+displayPath(segments));
    let script=old,rewrites=0;const blocks=[];
    let writer=!global&&(isGlobalUIWriter(old)||markerParts(old).some(part=>part.name==='shim'));
    if(global){script=replaceBlock(script,'composer',composer,'bottom');blocks.push('composer');}
    if(!global&&mode==='hub'&&Object.hasOwn(hubCounts,object.GUID)){
      hubCounts[object.GUID]++;
      if(object.GUID==='efa3fe'){
        const cut=cutHudLegacy(script);script=replaceBlock(cut.script,'data',cut.data,'bottom');blocks.push('data');
      }else{
        script=cutScoreboardLegacy(script);
        script=replaceBlock(script,'hub-migration','-- Legacy assistant UI removed; core, adapter and metadata retained.','bottom');
        blocks.push('hub-migration');
      }
      script=removeBlocks(script,name=>/^(hub-|view-|datasheet-)/.test(name)&&name!=='hub-migration'||name==='kit');
      for(const module of modules[object.GUID]){
        script=replaceBlock(script,module.name,module.content,'bottom');blocks.push(module.name);
        writer=writer||isGlobalUIWriter(module.content);
      }
    }
    if(writer){
      writers++;const result=rewriteGlobalUI(script);script=result.text;rewrites=result.rewrites;totalRewrites+=rewrites;
      script=replaceBlock(script,'shim',shim,'top');blocks.unshift('shim');
    }
    if(script!==old){
      try{parseSource(script);}catch(error){
        throw Error('Lua syntax failed at '+displayPath(segments)+' ('+(object.GUID||'Global')+'): '+error.message);
      }
      object.LuaScript=script;
      changedObjects.push({guid:global?'Global':object.GUID??null,path:displayPath(segments),pathSegments:segments,
        nickname:global?'Global':object.Nickname??'',blocks,rewrites});
    }
  }
  change(candidate,[],true);walkObjects(candidate,(object,segments)=>change(object,segments));
  if(mode==='hub')for(const [guid,count] of Object.entries(hubCounts))assert(count>0,'Hub target not found: '+guid);
  assertOnlyScriptsChanged(source,candidate,changedObjects);
  let objects=0;walkObjects(candidate,()=>objects++);
  return {candidate,changedObjects,counts:{changedObjects:changedObjects.length,writers,rewrites:totalRewrites,
    objectStates:candidate.ObjectStates.length,recursiveObjects:objects}};
}

function detectFormatting(text,save){
  const bom=text.startsWith('\uFEFF')?'\uFEFF':'',body=text.slice(bom.length);
  const newline=body.includes('\r\n')?'\r\n':'\n';
  const match=body.match(/\r?\n([ \t]+)"/),indent=match?match[1]:'';
  const trailing=body.match(/[ \t\r\n]*$/)[0],format={bom,newline,indent,trailing};
  assert.equal(serializeSave(save,format),text,'Unsupported source JSON formatting; refusing to reformat save');
  return format;
}

function serializeSave(save,format){
  let text=JSON.stringify(save,null,format.indent);
  if(format.newline==='\r\n')text=text.replace(/\n/g,'\r\n');
  return format.bom+text+format.trailing;
}

function existingTargetHashes(files=targets){
  return files.filter(target=>fs.existsSync(target)).map(target=>({target,sha256:hash(fs.readFileSync(target))}));
}
function defaultBuildSource(files=targets){return files.find(target=>fs.existsSync(target))||files[0];}
function readBuildSource(file){
  assert(fs.existsSync(file),'Missing build source: '+file);return fs.readFileSync(file);
}

function loadSources(options){
  const readLua=(file,label)=>{
    assert(fs.existsSync(file),'Missing '+label+' Lua source: '+file);return fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  };
  const result={mode:options.mode,composer:readLua(options.composer,'composer'),shim:readLua(options.shim,'shim'),modules:{}};
  const missingModules=[];
  if(options.mode==='hub'){
    const file=path.join(root,'ui','manifest.json');assert(fs.existsSync(file),'Missing hub manifest: '+file);
    const manifest=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    for(const guid of ['efa3fe','339b7f']){
      assert(Array.isArray(manifest[guid]),'Hub manifest must contain an array for '+guid);
      const seen=new Set();result.modules[guid]=[];
      for(const listed of manifest[guid]){
        assert(typeof listed==='string','Invalid manifest filename');
        const relative=listed.replace(/^ui\//,'');
        assert(/^[\w-]+\.lua$/.test(relative)&&!/^(?:composer|shim)\.lua$/.test(relative),'Unsupported hub module: '+listed);
        const name=relative.slice(0,-4);assert(!seen.has(name),'Duplicate manifest module: '+listed);seen.add(name);
        const moduleFile=path.join(root,'ui',relative);
        if(!fs.existsSync(moduleFile)){missingModules.push({guid,file:listed});continue;}
        result.modules[guid].push({name,content:readLua(moduleFile,'module')});
      }
    }
  }
  return {sources:result,missingModules};
}

function cli(argv){
  const options={source:undefined,out:path.join(root,'output','KT24-The-Killzone-RU-ui-candidate.json'),
    mode:'platform',composer:path.join(root,'ui','composer.lua'),shim:path.join(root,'ui','shim.lua'),verifyIdempotent:false};
  let sourceExplicit=false;
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--verify-idempotent'){options.verifyIdempotent=true;continue;}
    const key={'--source':'source','--out':'out','--mode':'mode','--composer':'composer','--shim':'shim','--tts-dir':'ttsDir'}[arg];
    assert(key,'Unknown option: '+arg);assert(argv[i+1]&&!argv[i+1].startsWith('--'),'Missing value for '+arg);
    options[key]=argv[++i];
    if(key==='source')sourceExplicit=true;
  }
  assert(['platform','hub'].includes(options.mode),'Mode must be platform or hub');
  if(options.ttsDir){const resolved=ttsTargets(resolveTtsDir({dir:options.ttsDir}));targets.splice(0,targets.length,...resolved);
  }else if(!targets.length)targets.push(...ttsTargets(resolveTtsDir()));
  if(!sourceExplicit)options.source=defaultBuildSource();
  options.source=path.resolve(options.source);options.out=path.resolve(options.out);
  assert(options.out.toLowerCase()!==options.source.toLowerCase(),'Candidate must not overwrite its source');
  const installedOut=targets.some(target=>path.resolve(target).toLowerCase()===options.out.toLowerCase());
  assert(!installedOut,'Candidate cannot overwrite installed files');
  const targetHashes=existingTargetHashes();
  const {sources,missingModules}=loadSources(options),bytes=readBuildSource(options.source),text=bytes.toString('utf8');
  const source=JSON.parse(text.replace(/^\uFEFF/,'')),format=detectFormatting(text,source),result=buildSave(source,sources);
  const candidateBytes=Buffer.from(serializeSave(result.candidate,format));
  if(options.verifyIdempotent){
    const second=buildSave(result.candidate,sources),again=Buffer.from(serializeSave(second.candidate,format));
    assert(candidateBytes.equals(again),'UI build is not byte-idempotent');
  }
  const report={status:'candidate',builtAt:new Date().toISOString(),source:options.source,candidate:options.out,
    sourceSHA256:hash(bytes),candidateSHA256:hash(candidateBytes),targetHashes,mode:options.mode,format,
    changedObjects:result.changedObjects,counts:result.counts,missingModules,verifiedIdempotent:options.verifyIdempotent};
  fs.mkdirSync(path.dirname(options.out),{recursive:true});fs.writeFileSync(options.out,candidateBytes);
  fs.mkdirSync(path.join(root,'output'),{recursive:true});
  fs.writeFileSync(path.join(root,'output','ui-build.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,mode:report.mode,...result.counts,
    verifiedIdempotent:report.verifiedIdempotent,sourceSHA256:report.sourceSHA256,candidateSHA256:report.candidateSHA256},null,2));
}

module.exports={replaceBlock,markerParts,isGlobalUIWriter,rewriteGlobalUI,cutHudLegacy,cutScoreboardLegacy,
  walkObjects,atPath,assertOnlyScriptsChanged,buildSave,detectFormatting,serializeSave,existingTargetHashes,defaultBuildSource,
  readBuildSource,
  anchors,runtimeAnchor,targets,hash};
if(require.main===module){try{cli(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
