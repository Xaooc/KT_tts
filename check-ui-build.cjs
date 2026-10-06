const {test}=require('node:test'),assert=require('node:assert/strict');
const {replaceBlock,markerParts,isGlobalUIWriter,rewriteGlobalUI,cutHudLegacy,cutScoreboardLegacy,
  buildSave,assertOnlyScriptsChanged,detectFormatting,serializeSave,anchors,runtimeAnchor}=require('./build-ui.cjs');
const {resolveTtsDir,ttsCandidates,ttsTargets}=require('./tts-paths.cjs');
const {targets:installTargets,hash}=require('./build-ui.cjs');
const {selectTargets}=require('./install-ui.cjs');

test('TTS path resolution honors CLI, environment, and existing Documents fallbacks',()=>{
  const home='C:/Users/example',paths=ttsCandidates(home);
  assert.equal(resolveTtsDir({dir:'C:/custom/tts',home,exists:()=>false}),'C:\\custom\\tts');
  assert.equal(resolveTtsDir({env:{KT_TTS_DIR:'C:/env/tts'},home,exists:()=>false}),'C:\\env\\tts');
  assert.equal(resolveTtsDir({home,exists:file=>file===paths[1]}),paths[1]);
  assert.equal(resolveTtsDir({home,exists:file=>file===paths[2]}),paths[2]);
  assert.throws(()=>resolveTtsDir({home,exists:()=>false}),error=>paths.every(file=>error.message.includes(file)));
  assert.equal(ttsTargets(paths[0])[0],require('path').join(paths[0],'Mods','Workshop','3573927734_RU.json'));
});

test('installer selects only targets unchanged from their recorded source baseline',()=>{
  const entries=installTargets.map(target=>({target,sha256:hash(require('node:fs').readFileSync(target))}));
  const source=entries[0].sha256;
  const selected=selectTargets({sourceSHA256:source,targetHashes:entries},'both');
  assert(selected.eligible.some(entry=>entry.target===entries[0].target));
  for(const entry of selected.eligible)assert.equal(entry.expected,source);
  for(const entry of selected.skipped)assert.match(entry.reason,/changed since build|differs from the build source/);
});

const sources={composer:'function ruCompose() end',shim:'local UI = Global.UI'};
const data=[
  'ruReferenceTeams={}',
  '  ruReferenceCommon = {}',
  'local ruReferenceEquipment = {}',
  'ruReferenceShared={}',
  'local ruCoreGlossary = {}',
  'ruFontMetrics={}',
];
const hud=()=>['UI.show("base")',anchors[0],...data.slice(0,4),'function legacyA() end',anchors[1],
  ...data.slice(4),'function legacyB() end',anchors[2],'function legacyC() end',anchors[3],'function legacyD() end'].join('\n');
const board=()=>['RuAssistantCatalog={}', 'RuAssistantCore={}', 'function ruAssistantBoardCommit() end',runtimeAnchor,
  'RuAssistantEngine=nil','local function arText() end','UI.show("assistant")'].join('\n');
const modules={efa3fe:[{name:'hub-main',content:'function newHub() UI.show("hub") end'},
  {name:'view-main',content:'function newView() end'}],'339b7f':[{name:'kit',content:'function newKit() end'}]};
const save=()=>({LuaScript:'function onLoad() end',XmlUI:'<Panel />',ObjectStates:[
  {GUID:'efa3fe',Nickname:'HUD',LuaScript:hud(),XmlUI:''},
  {GUID:'339b7f',Nickname:'Scoreboard',LuaScript:board(),XmlUI:''},
]});

test('replaceBlock replaces duplicate blocks and is idempotent at top and bottom',()=>{
  for(const position of ['top','bottom']){
    const once=replaceBlock('\nfunction base() end\n','test','local x=1\n',position);
    assert.equal(replaceBlock(once,'test','local x=1\n',position),once);
    const replaced=replaceBlock(once+'\n'+once,'test','local x=2',position);
    assert.equal(markerParts(replaced).filter(part=>part.name==='test').length,1);
    assert(!replaced.includes('local x=1'));assert(replaced.includes('local x=2'));
  }
});

test('malformed or nested markers fail instead of deleting unrelated Lua',()=>{
  assert.throws(()=>replaceBlock('--[[RU-UI:shim:BEGIN]]\n','shim','', 'top'),/Unclosed/);
  assert.throws(()=>markerParts('--[[RU-UI:x:END]]\n'),/Unmatched/);
  assert.throws(()=>markerParts('--[[RU-UI:x:BEGIN]]\n--[[RU-UI:y:BEGIN]]\n'),/Nested/);
});

test('already wrapped Lua sources produce one matching block without nesting',()=>{
  const wrapped=replaceBlock('','shim','local UI = Global.UI','top');
  const result=replaceBlock('UI.show("x")','shim',wrapped,'top');
  assert.equal(markerParts(result).filter(part=>part.name==='shim').length,1);
  assert.equal(replaceBlock(result,'shim',wrapped,'top'),result);
  assert.throws(()=>replaceBlock('','composer',wrapped,'bottom'),/one matching RU-UI block/);
});

test('writer detection recognizes Global UI calls and loading, excluding object UI',()=>{
  for(const script of ['UI.setXmlTable({})','Global.UI.setXml("")','return UI.loading',
    'UI.getAttributes("x")','Global . UI . hide("x")'])assert(isGlobalUIWriter(script),script);
  for(const script of ['self.UI.setAttribute("a","b","c")','obj.UI.show("x")','x. UI.hide("x")',
    'obj.Global.UI.show("x")','fooUI.show("x")','UI.showcase()','local x="UI.setXml"',
    '-- UI.setXml("")\nlocal x = [=[Global.UI.show("x")]=]'])assert(!isGlobalUIWriter(script),script);
});

test('rewrites only code outside markers, preserving literals, comments and object members',()=>{
  const outside='Global.UI.setXml("Global.UI.setXml")\n-- Global.UI.show("x")\nobj.Global.UI.hide("x")';
  const script=replaceBlock(outside,'shim','local UI = Global.UI\nGlobal.UI.show("inside")','top');
  const result=rewriteGlobalUI(script);assert.equal(result.rewrites,1);
  assert(result.text.includes('UI.setXml("Global.UI.setXml")'));
  assert(result.text.includes('Global.UI.show("inside")'));assert(result.text.includes('-- Global.UI.show("x")'));
  assert(result.text.includes('obj.Global.UI.hide("x")'));assert.equal(rewriteGlobalUI(result.text).rewrites,0);
});

test('long strings, escaped quotes and long comments are never rewritten',()=>{
  const script='local x=[==[Global.UI.show("x")]==]\n--[=[ Global.UI.hide("x") ]=]\n'
    +'local y="escaped \\" Global.UI.setXml"\nGlobal . UI . show("real")';
  const result=rewriteGlobalUI(script);assert.equal(result.rewrites,1);
  assert.equal(result.text,script.replace('Global . UI . show("real")','UI.show("real")'));
});

test('HUD cutting removes all four legacy segments and preserves exact data lines',()=>{
  const cut=cutHudLegacy(hud());assert.equal(cut.script,'UI.show("base")');
  assert.deepEqual(cut.data.split('\n'),data);assert(!cut.script.includes('legacy'));
  const built=replaceBlock(cut.script,'data',cut.data,'bottom');
  const again=cutHudLegacy(built);assert(again.alreadyBuilt);assert.equal(again.script,built);
  assert.equal(again.data.trimEnd(),cut.data);
});

test('missing, partial, reordered and duplicate legacy anchors fail clearly',()=>{
  assert.throws(()=>cutHudLegacy('function base() end'),/anchors missing/);
  assert.throws(()=>cutHudLegacy(hud().replace(anchors[2],'')),/missing or out of order/);
  assert.throws(()=>cutHudLegacy(hud().replace(anchors[0],anchors[1])),/Duplicate/);
  assert.throws(()=>cutHudLegacy(hud().replace('ruReferenceTeams={}','')),/Missing or duplicate HUD data/);
  assert.throws(()=>cutScoreboardLegacy('local function arText() end'),/runtime anchor missing/);
  assert.throws(()=>cutScoreboardLegacy(runtimeAnchor+'\nRuAssistantEngine=nil'),/arText anchor missing/);
});

test('scoreboard cutting preserves core, adapter and metadata before exact runtime opening comment',()=>{
  const cut=cutScoreboardLegacy(board());assert(cut.includes('RuAssistantCatalog={}'));
  assert(cut.includes('RuAssistantCore={}'));assert(cut.includes('function ruAssistantBoardCommit() end'));
  assert(!cut.includes('RuAssistantEngine'));assert(!cut.includes('arText'));assert(!cut.includes('assistant")'));
});

test('platform builds walk ContainedObjects and States without modifying XML or other fields',()=>{
  const source=save();source.ObjectStates.push({GUID:'pack',LuaScript:'self.UI.show("x")',ContainedObjects:[
    {GUID:'nested',LuaScript:'Global.UI.setXml("x")',States:{'2':{
      GUID:'variant',LuaScript:'UI.setValue("x","y")',ContainedObjects:[{GUID:'leaf',LuaScript:'self.UI.hide("x")'}],
    }}},
  ]});
  source.ObjectStates.push({GUID:'local',LuaScript:'local literal="UI.setXml";obj.UI.show("x")'});
  const result=buildSave(source,sources);assert.equal(result.counts.changedObjects,5);assert.equal(result.counts.rewrites,1);
  assert.equal(result.counts.recursiveObjects,7);assert.equal(result.counts.writers,4);
  assert.deepEqual(result.changedObjects.find(entry=>entry.guid==='variant').pathSegments,
    ['ObjectStates',2,'ContainedObjects',0,'States','2']);
  assert(result.candidate.ObjectStates[0].LuaScript.includes('legacyD'));
  assert(result.candidate.ObjectStates[1].LuaScript.includes('RuAssistantEngine=nil'));
  assert.equal(result.candidate.ObjectStates[3].LuaScript,source.ObjectStates[3].LuaScript);
  assert.equal(result.candidate.ObjectStates[2].ContainedObjects[0].States['2'].ContainedObjects[0].LuaScript,'self.UI.hide("x")');
  const again=buildSave(result.candidate,sources);assert.equal(again.changedObjects.length,0);
  assert.deepEqual(again.candidate,result.candidate);
});

test('hub builds migrate, preserve local data scope, append manifest order and rerun byte-identically',()=>{
  const source=save(),options={...sources,mode:'hub',modules};const result=buildSave(source,options);
  const script=result.candidate.ObjectStates[0].LuaScript;
  assert(!script.includes('legacyA'));assert(script.includes('local ruReferenceEquipment = {}'));
  assert(script.indexOf('RU-UI:data:BEGIN')<script.indexOf('RU-UI:hub-main:BEGIN'));
  assert(script.indexOf('RU-UI:hub-main:BEGIN')<script.indexOf('RU-UI:view-main:BEGIN'));
  const again=buildSave(result.candidate,options);assert.equal(JSON.stringify(again.candidate),JSON.stringify(result.candidate));
  assert.equal(again.changedObjects.length,0);
  const changed=buildSave(result.candidate,{...options,modules:{...modules,efa3fe:[{name:'view-new',content:'function newView() end'}]}});
  assert(!changed.candidate.ObjectStates[0].LuaScript.includes('RU-UI:hub-main:BEGIN'));
  assert(!changed.candidate.ObjectStates[0].LuaScript.includes('RU-UI:view-main:BEGIN'));
});

test('hub mode requires manifest entries and both targets',()=>{
  assert.throws(()=>buildSave(save(),{...sources,mode:'hub'}),/manifest/);
  const source=save();source.ObjectStates.pop();assert.throws(()=>buildSave(source,{...sources,mode:'hub',modules}),/339b7f/);
});

test('syntax checking rejects an invalid changed script',()=>{
  assert.throws(()=>buildSave(save(),{...sources,composer:'function broken('}),/Lua syntax failed.*Global/);
});

test('deep equality guard catches unexpected mutations and always restores candidate scripts',()=>{
  const source=save(),result=buildSave(source,sources),candidate=result.candidate;
  const script=candidate.LuaScript;candidate.XmlUI='<Wrong />';
  assert.throws(()=>assertOnlyScriptsChanged(source,candidate,result.changedObjects),/Unexpected mutation/);
  assert.equal(candidate.LuaScript,script);candidate.XmlUI=source.XmlUI;
  candidate.ObjectStates[0].Nickname='changed';
  assert.throws(()=>assertOnlyScriptsChanged(source,candidate,result.changedObjects),/Unexpected mutation/);
  candidate.ObjectStates[0].Nickname=source.ObjectStates[0].Nickname;
  assertOnlyScriptsChanged(source,candidate,result.changedObjects);assert.equal(candidate.LuaScript,script);
  candidate.ObjectStates.push({GUID:'extra'});
  assert.throws(()=>assertOnlyScriptsChanged(source,candidate,result.changedObjects),/ObjectStates count/);
});

test('source JSON formatting, BOM and final newline survive idempotent serialization',()=>{
  for(const newline of ['\n','\r\n']){
    const source=save(),text='\uFEFF'+JSON.stringify(source,null,2).replace(/\n/g,newline)+newline;
    const format=detectFormatting(text,source);assert.equal(format.indent,'  ');assert.equal(format.newline,newline);
    assert.equal(serializeSave(source,format),text);
    const first=buildSave(source,sources),second=buildSave(first.candidate,sources);
    assert.equal(serializeSave(first.candidate,format),serializeSave(second.candidate,format));
  }
});
