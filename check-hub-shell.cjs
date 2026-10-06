'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(file, 'utf8');
function lit(value) {
  if (value == null) return 'nil';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return '{' + value.map(lit).join(',') + '}';
  return '{' + Object.entries(value).map(([key, item]) => '[' + lit(key) + ']=' + lit(item)).join(',') + '}';
}

// Generate the same metadata as build-assistant-runtime.cjs without touching an installed table.
const library = JSON.parse(read('output/reference-hud-library.json'));
const catalog = JSON.parse(read('output/assistant-demo-data.json')).catalog;
catalog.actions.mission = { name: 'Особое / миссионное действие', english: 'Mission action', cost: 1 };
catalog.actions.charge = { name: 'Натиск', english: 'Charge', cost: 1, engage: true, excludes: ['reposition', 'dash', 'fallback'] };
catalog.actions.reposition.excludes = ['fallback', 'charge'];
catalog.actions.fallback.excludes = ['reposition', 'charge'];
catalog.actions.dash.excludes = ['charge'];
for (const [team, data] of Object.entries(library.teams)) {
  for (const entry of data.entries.filter(item => item.category === 'ploy')) {
    if (Object.values(catalog.ploys).some(rule => rule.team === team && rule.english === entry.english)) continue;
    const id = team + ':' + entry.id;
    catalog.ploys[id] = { id, team, name: entry.title, english: entry.english, cost: 1, limit: 'round',
      phase: entry.ployType === 'strategy' ? 'gambit' : 'firefight', effect: 'Условия и эффект: ' + entry.title,
      expiry: 'manual', generic: true, fullText: entry.text };
  }
}
const teams = Object.fromEntries(Object.entries(library.teams).map(([key, data]) => [key, { name: data.name, label: data.label }]));
const names = Object.assign({}, ...[
  'ru-display-names.json', 'ru-hud-additional-display-names.json', 'ru-hud-display-names-complete.json'
].map(file => JSON.parse(read(file))));
const board = read('inventory/3375-LuaScript.lua').replace(/return __bundle_require\("Scoreboard\.339b7f\.lua"\)\s*$/,
  '__bundle_require("Scoreboard.339b7f.lua")');
const settings = JSON.parse(board.match(/defaultSettings\s*=\s*\[\[([\s\S]*?)\]\]/)[1]);
const sources = ['assistant-core.lua', 'assistant-scoreboard-adapter.lua', 'ui/font-metrics.lua',
  'ui/kit.lua', 'ui/hub-views.lua', 'ui/hub-shell.lua'];
const metadata = 'RuAssistantCatalog=' + lit(catalog) + '\nRuAssistantTeams=' + lit(teams) + '\nRuAssistantNames=' + lit(names);
const generic = Object.keys(catalog.ploys).find(key => catalog.ploys[key].team === 'hierotekcircle'
  && catalog.ploys[key].generic && catalog.ploys[key].phase === 'firefight');
assert(generic, 'Fixture needs a generic firefight ploy');

const mocks = `
local function copy(t)
    if type(t)~='table' then return t end
    local out={};for k,v in pairs(t) do out[k]=copy(v) end;return out
end
local encoded,serial={},0
JSON={encode=function(t) serial=serial+1;local id='json'..serial;encoded[id]=copy(t);return id end,
    decode=function(s)
        if encoded[s] then return copy(encoded[s]) end
        if type(s)=='string' and s:sub(1,1)=='{' then return ${lit(settings)} end
    end}
local realWrites,realPatches,mounts,patchCalls=0,0,{},0
local function makeUI()
    local xml,values={},{};local ui={loading=false}
    local function find(nodes,id)
        for _,n in ipairs(nodes) do
            if (n.attributes or {}).id==id then return n end
            local child=find(n.children or {},id);if child then return child end
        end
    end
    function ui.getXmlTable() return copy(xml) end
    function ui.setXmlTable(t) realWrites=realWrites+1;xml=copy(t) end
    function ui.getAttribute(id,key)
        local n=find(xml,id);return n and (n.attributes or {})[key] or (values[id] or {})[key]
    end
    function ui.setAttributes(id,attrs)
        realPatches=realPatches+1;values[id]=values[id] or {};local n=find(xml,id)
        for key,value in pairs(attrs) do values[id][key]=value;if n then n.attributes[key]=value end end
    end
    function ui.setAttribute(id,key,value) ui.setAttributes(id,{[key]=value}) end
    function ui.setValue(id,value) ui.setAttribute(id,'text',value) end
    function ui.getCustomAssets() return {} end
    function ui.setCustomAssets() end
    function ui.show(id) ui.setAttribute(id,'active','true') end
    function ui.hide(id) ui.setAttribute(id,'active','false') end
    return ui
end
UI=makeUI();local realUI=UI
Global={UI=UI};local menus={}
self={UI=makeUI(),getGUID=function() return '339b7f' end,setTags=function() end,
    addContextMenuItem=function(label,fn) menus[label]=fn end}
local scheduled,timers,nextTimer={},{},0
Wait={frames=function(fn) scheduled[#scheduled+1]=fn;return #scheduled end,
    condition=function(fn,predicate) if predicate() then fn() else scheduled[#scheduled+1]=fn end end,
    time=function(fn,seconds,repetitions)
        nextTimer=nextTimer+1;timers[nextTimer]={fn=fn,seconds=seconds,repetitions=repetitions};return nextTimer
    end,stop=function(id) timers[id]=nil end}
local function flush()
    local cycles=0
    while #scheduled>0 do
        cycles=cycles+1;assert(cycles<100,'Unbounded frame queue')
        local queue=scheduled;scheduled={};for _,fn in ipairs(queue) do fn() end
    end
end
Timer={create=function() end}
function broadcastToAll() end
local tint={lerp=function(s) return s end,toHex=function() return 'ffffff' end}
Color=setmetatable({fromString=function() return tint end},{__call=function() return tint end})
local hotkeys={};function addHotkey(label,fn) hotkeys[label]=fn end
Player={}
for _,data in ipairs({{'Red','red-id',true},{'Blue','blue-id',false},{'Grey','grey-id',false}}) do
    Player[data[1]]={color=data[1],steam_id=data[2],steam_name=data[1],host=data[3],seated=data[1]~='Grey',
        broadcast=function() end,promote=function() end,getHandObjects=function() return {} end}
end
function Player.getPlayers() return {Player.Red,Player.Blue,Player.Grey} end
function Player.getColors() return {'Red','Blue','Grey'} end
local models={};local highlights={}
local function model(id,own,name,team)
    local st={owner=own,info={name=name,ktRuTeam=team,categories={'IMMORTAL'},weapons={
        {name='Tesla carbine',stats={ATK=4,HIT=3,DMG='5/2',WR='Devastating 1'}}}},
        stats={APL=2,Wounds=10,Move=5,Save=3},wounds=7,ready=true,order='Engage'}
    local obj={UI=makeUI(),hasTag=function(tag) return tag=='Operative' end,getGUID=function() return id end,
        getName=function() return name end,getTable=function(key) if key=='state' then return copy(st) end end,
        setTable=function(key,value) if key=='state' then st=copy(value) end end,call=function() end,
        highlightOn=function(color,seconds) highlights[id]={color,seconds} end}
    models[id]=obj;return obj
end
model('immort','red-id','Immortal Guardian','Hierotek Circle')
model('despot','red-id','Immortal Despotek','Hierotek Circle')
model('reserve','red-id','Immortal Guardian','Hierotek Circle') -- Inside a bag, not a top-level object.
model('devote','blue-id','Devotee','Chaos Cult')
local physical=models.devote.getTable('state');physical.wounds=3;physical.order='Conceal';models.devote.setTable('state',physical)
local scans=0
function getAllObjects() scans=scans+1;return {models.immort,models.despot,models.devote} end
local refAvailable=true;local refThrows=false;local refCalls={};local legacy={seats={}}
local hud={call=function(fn,params)
    if refThrows then error('Reference service offline') end
    refCalls[#refCalls+1]={fn=fn,params=copy(params)}
    if fn=='ruRefLegacyPloys' then return copy(legacy) end
    if fn=='ruRefTermsIn' then return {{'devastating','Убойное'}} end
    if fn=='ruRefTerm' then return {title='Убойное',english='Devastating',body='Полное определение'} end
    if fn=='ruRefTeamRules' then return {{key='rule',title='Правило отряда',body='Текст',terms={}}} end
    if fn=='ruRefQuery' then
        if params.scope=='ploy' then
            return {scopes={{'ploy','Уловки'}},count=1,
                results={{key='team:hierotekcircle:96538a3d548cbd0e',title='Живая молния',english='Living Lightning'}}}
        end
        return {scopes={{'model','Модель'},{'team','Отряд'},{'weapon','Оружие'}},count=1,
            results={{key='ref-one',title='Справка',on=params.key=='ref-one'}},
            article=params.guid and {title='Модель '..params.guid,body='Карточка модели'} or nil}
    end
end}
function getObjectFromGUID(id) if id=='efa3fe' then return refAvailable and hud or nil end;return models[id] end
Player.Red.getSelectedObjects=function() return {models.immort} end
Player.Blue.getSelectedObjects=function() return {models.devote} end
`;

const scenarios = `
local checked=0
local function check(value,message) checked=checked+1;assert(value,message or ('Hub check '..checked)) end
local function click(p,cmd,arg,value)
    local ok,msg=ruHubClick(p,value,KT.hub.id(p.color,cmd,arg));flush();return ok,msg
end
local function success(p,cmd,arg,value)
    local ok,msg=click(p,cmd,arg,value);check(ok,msg or cmd);return msg
end
local function vm(color) return RuHub.vms[color or 'Red'] end
local function mounted(color)
    for i,key in ipairs(RuUi.keys) do if RuUi.owners[key]=='hub:'..color then return RuUi.roots[i] end end
end
local function findNode(n,id)
    if n.attributes.id==id then return n end
    for _,child in ipairs(n.children or {}) do
        local found=findNode(child,id);if found then return found end
    end
end
local function allIds(n,seen)
    seen=seen or {};check(n.attributes.id~=nil,'Anonymous dock node')
    check(not seen[n.attributes.id],'Duplicate id '..n.attributes.id);seen[n.attributes.id]=true
    for _,child in ipairs(n.children or {}) do allIds(child,seen) end
end
local function liveMatches(expected,actual)
    check(expected.tag==actual.tag,'Mounted tag differs')
    for key,value in pairs(expected.attributes) do
        check(actual.attributes[key]==value,'Stale composer attribute '..expected.attributes.id..':'..key)
    end
    check(#(expected.children or {})==#(actual.children or {}),'Mounted child count differs')
    for i,child in ipairs(expected.children or {}) do liveMatches(child,actual.children[i]) end
end
PreviewHubShellScenes={}
onLoad('');flush()
check(not RuAssistantEngine,'Unexpected engine on load')
for _,color in ipairs({'Red','Blue'}) do
    check(mounted(color)~=nil,'Missing owner hub:'..color)
    check(mounted(color).attributes.visibility==color,'Seat visibility')
    check(vm(color).state=='rail','Default is not rail')
end
check(mounts['hub:defaults']==1,'Defaults mounted repeatedly')
check(vm('Grey').turn.mode=='spectator' and #vm('Grey').tabs==1 and vm('Grey').tabs[1].key=='ref')
success(Player.Red,'tab','turn');check(vm().turn.mode=='setup' and vm().turn.isHost)
check(vm().turn.phaseLabels[1]=='Стратегия · инициатива' and vm().turn.phaseLabels[5]=='Конец раунда · подсчёт очков','Setup phase labels')
PreviewHubShellScenes.setup={copy(mounted('Red'))}
success(Player.Red,'setupround','2');success(Player.Red,'setupphase','4');success(Player.Red,'setupturn','2')
check(vm().turn.round==2 and vm().turn.phaseIndex==4 and vm().turn.turnIndex==2,'Setup fields')
check(not click(Player.Blue,'start'),'Non-host start')
success(Player.Red,'setupround','1');success(Player.Red,'setupturn','1')
scoring[1].initiative[1]=true
success(Player.Red,'start');check(RuAssistantEngine.state.phase=='firefight')
check(vm().status.eyebrow=='РАУНД 1 / 4 · ПЕРЕСТРЕЛКА','KT3 phase eyebrow')
check(vm().turn.mode=='idle' and vm('Blue').turn.mode=='idle','Seats not activation-ready')
check(next(RuAssistantEngine.state.units)==nil,'Start enrolled reserves')
success(Player.Red,'enrollall');success(Player.Blue,'enroll')
check(RuAssistantEngine.state.units.immort and RuAssistantEngine.state.units.despot)
check(not RuAssistantEngine.state.units.reserve,'Bag reserve enrolled')
check(RuAssistantEngine.state.players['red-id'].team=='hierotekcircle')
do
    local s=RuAssistantEngine.state
    s.turnOwner='red-id';s.units.immort.ready=false;s.units.immort.counteracted=true
    s.units.despot.ready=false;s.units.despot.counteracted=false;s.units.devote.ready=true
    s.revision=s.revision+1;ruHubRenderAll();flush()
    check(#vm().turn.counter==1 and vm().turn.counter[1].guid=='despot','Counteracted operative offered counteract')
    check(findNode(mounted('Red'),'kh:Red:counter:despot').attributes.tooltip~=nil,'Counteract tooltip')
    s.units.immort.ready=true;s.units.immort.counteracted=false;s.units.despot.ready=true
    s.revision=s.revision+1;ruHubRenderAll();flush()
end
success(Player.Red,'select','immort');check(highlights.immort[1]=='Red' and highlights.immort[2]==3)
success(Player.Red,'begin','immort');check(vm().turn.mode=='activation' and vm().turn.apLeft==2)
check(vm().turn.unit.move=='5"' and vm().turn.unit.save=='3+','Native model stats')
check(vm().turn.weapons[1].a==4 and vm().turn.weapons[1].bs=='3+' and vm().turn.weapons[1].d=='5/2','Native weapon stats')
success(Player.Red,'action','reposition')
check(vm().turn.apLeft==1 and vm().toast.undo and vm().toast.body:find('−1 AP',1,true),'Action/AP/toast')
local invalid=click(Player.Red,'action','invalid-action')
check(not invalid and vm().toast.undo==false,'Engine error toast offered undo')
check(vm('Blue').turn.mode=='enemy','Other seat did not rerender for activation revision')
PreviewHubShellScenes.turn={copy(mounted('Red'))}
local redMounts=mounts['hub:Red'];local patchBefore=patchCalls
ruHubRender('Red');ruHubRender('Red');flush()
check(mounts['hub:Red']==redMounts and patchCalls==patchBefore+1,'Render not coalesced/diffed')
success(Player.Red,'undo');check(vm().turn.apLeft==2,'Undo did not restore AP')
local revision=RuAssistantEngine.state.revision
check(not ruHubClick(Player.Blue,nil,'kh:Red:action:dash'),'Cross-seat click accepted')
check(not ruHubClick({color='Red',steam_id='spoof'},nil,'kh:Red:action:dash'),'Spoofed identity accepted')
check(not ruHubClick(Player.Red,'-2','kh:Red:action:dash'),'Right click accepted')
check(RuAssistantEngine.state.revision==revision,'Rejected input changed engine')
success(Player.Red,'advanced');success(Player.Red,'advcost','0');success(Player.Red,'action','reposition')
check(vm().turn.apLeft==2,'Explicit cost not applied')
local ok=click(Player.Red,'action','reposition');check(not ok,'Cost confirmation allowed repetition')
success(Player.Red,'advrepeat');success(Player.Red,'advcost','0');success(Player.Red,'action','reposition')
check(RuAssistantEngine.state.activation.performed.reposition==2,'Repeat exception missing')
success(Player.Red,'aplimit','3');check(vm().turn.apTotal==3)
success(Player.Red,'tab','ploys');success(Player.Red,'ployseg','fire')
do
    local rule=RuAssistantCatalog.ploys.reroll
    local activation=RuAssistantEngine.state.activation
    RuAssistantEngine.state.activation=nil
    rule.target='operative';RuHub.seats.Red.selected=nil;RuHub.seats.Red.ployTarget=nil
    success(Player.Red,'ploy','reroll')
    local targeted
    for _,item in ipairs(vm().ploys.items) do if item.key=='reroll' then targeted=item end end
    check(targeted.needsTarget and #targeted.targets==2 and not targeted.usable and targeted.reason=='Выберите цель',
        'Target ploy default/availability: '..tostring(targeted.needsTarget)..'/'..tostring(targeted.targets and #targeted.targets)..'/'
            ..tostring(targeted.usable)..'/'..tostring(targeted.reason))
    success(Player.Red,'ploytarget','despot')
    for _,item in ipairs(vm().ploys.items) do if item.key=='reroll' then targeted=item end end
    check(targeted.targetGuid=='despot' and targeted.usable,'Ploy target selection')
    RuHub.seats.Red.openPloy=nil;rule.target=nil
    RuAssistantEngine.state.activation=activation
end
success(Player.Red,'ploy','reroll')
local cp=scoring[1].command;success(Player.Red,'useploy','reroll')
check(scoring[1].command==cp-1 and RuAssistantEngine.state.players['red-id'].cp==cp-1,'CP adapter commit')
check(vm().status.sides[1].cp==cp-1,'Status CP stale')
check(vm('Blue').status.sides[1].cp==cp-1,'Other seat status did not rerender after CP change')
success(Player.Red,'undo');check(scoring[1].command==cp,'Undo CP')
local generic=${lit(generic)}
success(Player.Red,'ploy',generic);success(Player.Red,'ploycost','+');success(Player.Red,'ployexpiry','round')
check(RuHub.seats.Red.ployCost==2,'Generic cost editor')
success(Player.Red,'useploy',generic);check(scoring[1].command==cp-2,'Edited CP debit')
check(RuAssistantEngine.state.effects[#RuAssistantEngine.state.effects].expiry.kind=='round','Generic expiry')
PreviewHubShellScenes.ploys={copy(mounted('Red'))}
success(Player.Red,'ploysearch','', 'УЛОВКА');check(vm().ploys.query=='УЛОВКА')
success(Player.Red,'ploysearch','', '');success(Player.Red,'tab','squad')
liveMatches(RuHub.trees.Red,mounted('Red'))
check(#vm().squad.units==2 and vm().squad.units[1].state=='active','Squad order')
check(vm().squad.summary=='2 из 2 в строю · 1 готовы','Squad summary')
PreviewHubShellScenes.squad={copy(mounted('Red'))}
success(Player.Red,'squadseg','hurt');check(#vm().squad.units==0,'Hurt filter')
success(Player.Red,'squadseg','all');success(Player.Red,'tab','enemy')
check(vm().enemy.colorKey=='Blue' and #vm().enemy.units==1)
check(vm().enemy.units[1].wounds==3 and vm().enemy.units[1].order=='Conceal','Enemy physical state')
check(#vm().enemy.ploys>0 and vm().enemy.team=='chaoscult','Enemy ploys')
PreviewHubShellScenes.enemy={copy(mounted('Red'))}
success(Player.Red,'enemyseg','rules');check(vm().enemy.rules[1].title=='Правило отряда')
success(Player.Red,'enemyunit','devote');check(vm().ref.article.title=='Модель devote')
check(refCalls[#refCalls].params.guid=='devote' and refCalls[#refCalls].params.scope=='model')
success(Player.Red,'tab','log');check(#vm().log.groups==1 and #vm().log.groups[1].entries>0,'Journal grouping')
scoring[1].critop.score[1][1]=true;scoring[1].tacop.score[1][2]=true
scoring[1].killop.score=2;scoring[1].primary.score=1
success(Player.Red,'logseg','score')
check(vm().log.score.rows[1].rvp==1 and vm().log.score.rows[2].rvp==1,'Per-round VP')
check(vm().log.score.total.rvp==5 and vm().status.sides[1].vp==5,'Grand total excludes a source')
PreviewHubShellScenes.log={copy(mounted('Red'))}
success(Player.Red,'tab','turn')
local timeout=RuHub.seats.Red.toastTimer;local writes=realWrites
timers[timeout].fn();flush()
check(realUI.getAttribute('kh:Red:toast','active')=='false','Toast not hidden by patch')
check(realWrites==writes,'Toast timeout remounted UI')
success(Player.Red,'action','shoot')
check(vm().turn.pending and vm().turn.foot[2].cmd=='finishaction','Pending foot')
check(vm('Blue').turn.mode=='enemy','Enemy activation mode')
hotkeys['Центр KT: завершить действие или активацию']('Red');flush()
check(not RuAssistantEngine.state.activation.pending,'Finish-action hotkey')
hotkeys['Центр KT: завершить действие или активацию']('Red');flush()
check(not RuAssistantEngine.state.activation,'Finish hotkey')
physical=models.immort.getTable('state');physical.wounds=1;physical.order='GuardConceal';physical.ready=false
models.immort.setTable('state',physical)
local beforeScans=scans;timers[RuHub.watch].fn();flush()
check(scans==beforeScans,'Polling scanned closed enemy roster')
check(RuAssistantEngine.state.units.immort.wounds==1 and RuAssistantEngine.state.units.immort.order=='Conceal')
check(not RuAssistantEngine.state.units.immort.ready and RuAssistantEngine.state.units.immort.guard,'Native state sync')
check(not click(Player.Red,'undo'),'Physical changes left stale undo history')
hotkeys['Центр KT: открыть / свернуть']('Red');flush();check(vm().state=='rail')
hotkeys['Центр KT: открыть / свернуть']('Red');flush();check(vm().state=='open')
hotkeys['Центр KT: справка по модели под курсором']('Red',models.immort);flush()
check(vm().tab=='ref' and vm().ref.article.title=='Модель immort','Hovered model hotkey')
success(Player.Grey,'tab','ref');check(not click(Player.Grey,'tab','turn'),'Spectator turn tab')
success(Player.Red,'term','devastating');check(vm().ref.term.title=='Убойное')
success(Player.Red,'termclose');check(not vm().ref.term)
refAvailable=false;ruHubRender('Red');flush();check(vm().ref.count==0 and #vm().ref.results==0,'Missing reference HUD')
refAvailable=true;refThrows=true;ruHubRender('Red');flush();check(vm().ref.count==0,'Reference exception not guarded')
refThrows=false
success(Player.Red,'tab','ploys');success(Player.Red,'pin',generic)
local storedRevision=RuAssistantEngine.state.revision;local saved=onSave()
RuAssistantEngine=nil;RuHub.marks={};RuHub.cpByRound={};scoring[1].command=999
onLoad(saved);flush()
check(RuAssistantEngine and RuAssistantEngine.state.revision==storedRevision,'Engine round-trip')
check(RuHub.marks.Red.pinned[generic] and RuHub.cpByRound[1][1].start==3,'Hub round-trip')
check(scoring[1].command==1 and RuHub.seats.Red.state=='open','Scoreboard/state round-trip')
check(RuHub.seats.Red.tab=='turn' and not RuHub.seats.Red.selected,'Transient seat state persisted')
local old=JSON.decode(saved);old.ruHub=nil;onLoad(JSON.encode(old));flush()
check(RuAssistantEngine~=nil,'Legacy assistant-only save')
-- Phase transitions record CP history and preserve journal round grouping.
local s=RuAssistantEngine.state;s.activation=nil;s.phase='scoring'
success(Player.Red,'next');check(RuAssistantEngine.state.round==2)
success(Player.Red,'initiative','2');check(RuHub.cpByRound[2][1]['end']==scoring[1].command,'CP phase history')
success(Player.Red,'tab','log');check(#vm().log.groups==2 and vm().log.groups[1].round==2,'Newest round first')
-- Old non-engine ploys migrate once; clearing marks never clears pins.
RuAssistantEngine=nil;RuHub.marks={}
legacy={seats={Red={team='hierotekcircle',used={[generic]=true,['hierotekcircle:96538a3d548cbd0e']=true},
    pinned={['command-reroll']=true},round=1}}}
onLoad('');flush();check(not RuAssistantEngine)
check(RuHub.marks.Red.used[generic] and RuHub.marks.Red.pinned.reroll,
    'Legacy migration: used='..tostring(RuHub.marks.Red.used[generic])..', pin='..tostring(RuHub.marks.Red.pinned.reroll)
        ..', round='..tostring(RuHub.marks.Red.round)..', current='..getCurrentRound())
check(RuHub.marks.Red.used.lightning,'Structured legacy ploy id was not mapped')
success(Player.Red,'tab','ploys');success(Player.Red,'ployseg','fire')
check(not click(Player.Red,'useploy',generic),'Migrated used mark ignored')
ruHubRoundEnd();flush();check(not next(RuHub.marks.Red.used) and RuHub.marks.Red.pinned.reroll,'Round-end marks')
success(Player.Red,'ploy',generic);success(Player.Red,'ploycost','-')
cp=scoring[1].command;success(Player.Red,'useploy',generic)
check(scoring[1].command==cp and RuHub.marks.Red.used[generic],'Free generic pre-session ploy')
success(Player.Red,'useploy','reroll')
check(scoring[1].command==cp-1 and RuHub.marks.Red.used.reroll,'Non-engine CP debit')
check(RuHub.seats.Red.toast.undo==false,'Non-engine toast offered engine undo')
local nonEngine=onSave();onLoad(nonEngine);flush()
check(RuHub.marks.Red.used.reroll and RuHub.marks.Red.pinned.reroll,'Non-engine marks not persisted')
success(Player.Red,'tab','ploys');success(Player.Red,'ployseg','fire')
success(Player.Red,'ploysearch','', 'КОМАНДНЫЙ')
check(#vm().ploys.items==1 and vm().ploys.items[1].key=='reroll','Russian uppercase search')
check(menus['Центр Kill Team'] and not menus['Помощник партии'],'Legacy context menu')
menus['Центр Kill Team']('Red');flush();check(vm().tab=='turn' and vm().state=='open')
allIds(mounted('Red'));allIds(mounted('Blue'));allIds(mounted('Grey'))
local immutable=mounts['hub:defaults'];ruHubRenderAll();flush();check(mounts['hub:defaults']==immutable)
ruHubRender('Red') -- Pending callbacks must not resurrect the dock after destruction.
onDestroy();flush();check(not mounted('Red') and not mounted('Blue'),'Destroy did not unmount')
return checked..' hub shell checks passed; 13 required scenarios; '..patchCalls..' composer patch batches'
`;

const composer = read('ui/composer.lua');
const globalProxy = `
Global.UI=UI
Global.call=function(fn,params)
    if fn=='ruUiMount' then mounts[params.owner]=(mounts[params.owner] or 0)+1 end
    if fn=='ruUiPatchMany' then patchCalls=patchCalls+1 end
    return _G[fn](params)
end
`;
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/hub-shell-test.lua', [mocks, composer, globalProxy, board, metadata,
  ...sources.map(read), scenarios].join('\n'));
console.log('PASS: emitted tmp/hub-shell-test.lua with actual scoreboard, composer, metadata and 13 hub scenarios');
