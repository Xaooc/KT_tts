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
  'ui/kit.lua', 'ui/rich.lua', 'ui/hub-views.lua', 'ui/hub-shell.lua'];
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
local scheduled,timers,conditions,nextTimer={},{},{},0
Wait={frames=function(fn) scheduled[#scheduled+1]=fn;return #scheduled end,
    condition=function(fn,predicate,timeout,onTimeout)
        nextTimer=nextTimer+1;local id=nextTimer
        if predicate() then fn() else conditions[id]={fn=fn,predicate=predicate,timeout=timeout,onTimeout=onTimeout} end
        return id
    end,
    time=function(fn,seconds,repetitions)
        nextTimer=nextTimer+1;timers[nextTimer]={fn=fn,seconds=seconds,repetitions=repetitions};return nextTimer
    end,stop=function(id) timers[id]=nil;conditions[id]=nil end}
local function flush()
    for id,condition in pairs(conditions) do
        if condition.predicate() then conditions[id]=nil;condition.fn() end
    end
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
local validColors={'White','Brown','Red','Orange','Yellow','Green','Teal','Blue','Purple','Pink','Black'}
local validPlayers={}
local function emptyPlayer(color)
    return {color=color,steam_id='',steam_name='',host=false,seated=false,
        broadcast=function() end,promote=function() end,getHandObjects=function() return {} end}
end
Player=setmetatable({},{__index=function(t,key)
    local canon=type(key)=='string' and key:sub(1,1):upper()..key:sub(2):lower() or key
    if canon~=key and validPlayers[canon] then return t[canon] end
    if validPlayers[key] then local p=emptyPlayer(key);rawset(t,key,p);return p end
    error('cannot access field '..tostring(key)..' of userdata<LuaGlobalPlayer>')
end})
for _,color in ipairs(validColors) do validPlayers[color]=true;Player[color]=emptyPlayer(color) end
for _,data in ipairs({{'Red','red-id',true},{'Blue','blue-id',false}}) do
    local p=Player[data[1]];p.steam_id=data[2];p.steam_name=data[1];p.host=data[3];p.seated=true
end
local grey=emptyPlayer('Grey');grey.steam_id='grey-id';grey.steam_name='Grey'
function Player.getPlayers()
    local out={};for _,color in ipairs(validColors) do if Player[color].seated then out[#out+1]=Player[color] end end
    out[#out+1]=grey;return out
end
function Player.getSpectators() return {grey} end
function Player.getColors() return validColors end
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
local scans=0;local extraModels={}
function getAllObjects()
    scans=scans+1;local out={models.immort,models.despot,models.devote}
    for _,obj in ipairs(extraModels) do out[#out+1]=obj end;return out
end
local refAvailable=true;local refThrows=false;local refLoaded=true;local refCalls={};local legacy={seats={}}
local hud={getVar=function(key)
    if refThrows then error('Reference service offline') end
    if key=='ruRefLoaded' then return refLoaded end
end,call=function(fn,params)
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
    local ok,msg=click(p,cmd,arg,value);check(ok,cmd..': '..tostring(msg));return msg
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
    check(n~=nil,'Missing dock node')
    seen=seen or {};check(n.attributes and n.attributes.id~=nil,'Anonymous dock node')
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
check(Player['red']==Player.Red,'lower-case Player colour resolves like TTS')
for _,key in ipairs({'Grey','NotAPlayer',17}) do
    local ok,err=pcall(function() return Player[key] end)
    check(not ok and tostring(err):find('userdata<LuaGlobalPlayer>',1,true),'Player mock accepted '..tostring(key))
end
check(Player.White and Player.White.seated==false,'Empty valid colour must return a player')
onLoad('');flush()
check(not RuAssistantEngine,'Unexpected engine on load')
check(vm().status.eyebrow=='ПАРТИЯ НЕ ПОДКЛЮЧЕНА','No-session eyebrow')
for _,color in ipairs({'Red','Blue'}) do
    check(mounted(color)~=nil,'Missing owner hub:'..color)
    check(mounted(color).attributes.visibility==color,'Seat visibility')
    check(vm(color).state=='rail','Default is not rail')
end
check(mounts['hub:defaults']==1,'Defaults mounted repeatedly')
check(vm('Grey').turn.mode=='spectator' and #vm('Grey').tabs==1 and vm('Grey').tabs[1].key=='ref')
success(grey,'tab','ref');check(not click(grey,'tab','turn'),'Grey spectator entered turn tab')
do
    Player.Blue.seated=false;onLoad('');flush()
    check(mounted('Red') and mounted('Grey') and not mounted('Blue'),'One-seat render included an empty seat')
    check(vm().turn.mode=='setup' and not vm().turn.canStart,'One-seat setup allowed starting')
    success(grey,'tab','ref');check(vm('Grey').turn.mode=='spectator','One-seat spectator render failed')
    for _,color in ipairs({false,17,'NotAPlayer','red'}) do
        check(ruHubBuildVM(color)==nil,'Invalid viewer accepted')
        check(not ruHubOpen({color=color}),'Invalid hub open accepted')
        check(not ruAssistantFocus({color=color}),'Invalid focus accepted')
    end
    check(ruHubBuildVM(nil)==nil,'Nil viewer accepted')
    check(not ruHubClick({color='NotAPlayer',steam_id='fake'},nil,'kh:NotAPlayer:tab:ref'),'Invalid actor accepted')
    Player.Blue.seated=true;onLoad('');flush()
end
do
    local original=realUI.getAttribute('khDock_Red','offsetXY')
    realUI.setAttribute('khDock_Red','offsetXY','321 -222')
    check(ruHubDragEnd(Player.Red,'','khDock_Red'),'Drag-end rejected current seat')
    check(RuHub.seats.Red.dock.x==321 and RuHub.seats.Red.dock.y==222,'Drag position not stored')
    check(realUI.getAttribute('khDock_Red','offsetXY')=='321 -222','Drag position not patched to shadow')
    check(not ruHubDragEnd(Player.Red,'','khDock_Red'),'Unchanged drag attribute was not a no-op')
    check(not ruHubDragEnd(Player.Blue,'','khDock_Red'),'Foreign seat drag accepted')
    local dockSaved=onSave();onLoad(dockSaved);flush()
    check(RuHub.seats.Red.dock.x==321 and RuHub.seats.Red.dock.y==222,'Dock position did not survive save/load')
    check(mounted('Red').attributes.offsetXY=='321 -222','Remount ignored saved dock position')
    success(Player.Red,'dockreset')
    check(RuHub.seats.Red.dock==nil and mounted('Red').attributes.offsetXY=='64 -128','Dock reset failed')
    check(original=='64 -128','Unexpected default dock fixture')
end
success(Player.Red,'tab','turn');check(vm().turn.mode=='setup' and vm().turn.isHost)
check(vm().turn.phaseLabels[1]=='Стратегия · инициатива' and vm().turn.phaseLabels[5]=='Конец раунда · подсчёт очков','Setup phase labels')
PreviewHubShellScenes.setup={copy(mounted('Red'))}
success(Player.Red,'setupround','2');success(Player.Red,'setupphase','4');success(Player.Red,'setupturn','2')
check(vm().turn.round==2 and vm().turn.phaseIndex==4 and vm().turn.turnIndex==2,'Setup fields')
success(Player.Red,'tab','squad')
success(Player.Red,'teamsearch','', '  hierarchy  ')
check(vm().squad.teamQuery=='hierarchy','Team search query was not trimmed/passed through')
success(Player.Red,'team','hierotekcircle')
check(vm().squad.teamQuery=='','Team selection did not clear search')
success(Player.Red,'tab','turn')
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
check(RuAssistantEngine.state.players['seat:1'].team=='hierotekcircle')
check(RuAssistantEngine.state.players['seat:2'].team=='chaoscult','Online seat identities')
check(models.immort.getTable('state').owner=='red-id' and models.devote.getTable('state').owner=='blue-id',
    'Online enrollment rewrote physical owners')
do
    local s=RuAssistantEngine.state
    s.turnOwner='seat:1';s.units.immort.ready=false;s.units.immort.counteracted=true
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
do
    local st=models.immort.getTable('state');st.wounds=4;models.immort.setTable('state',st)
    timers[RuHub.watch].fn();flush()
    check(vm().turn.unit.injured and vm().turn.unit.move=='3"','Injured Move at 4/10 wounds')
    check(vm().turn.weapons[1].bs=='4+' and vm().turn.unit.apl==2 and vm().turn.apTotal==2,
        'Injured Hit/APL/AP budget')
    check(vm().turn.injuryNote and vm().turn.weapons[1].tip==vm().turn.injuryNote,
        'Injury override note missing from activation and weapon')
    local weapon=RuAssistantEngine.state.units.immort.weapons[1];weapon.bs='6+'
    ruHubRender('Red');flush();check(vm().turn.weapons[1].bs=='6+','Injured Hit cap');weapon.bs='3+'
    success(Player.Red,'tab','squad')
    check(vm().squad.units[1].injured and vm().squad.units[1].move=='3"'
        and vm().squad.units[1].weapons[1].bs=='4+' and vm().squad.units[1].injuryNote,
        'Injured squad values/note')
    check(findNode(mounted('Red'),'kh:Red:select:immort_injury').attributes.text=='MOVE 3" · BS/WS 4+',
        'Injured squad row omitted effective stats')
    success(Player.Red,'tab','turn');st.wounds=5;models.immort.setTable('state',st)
    timers[RuHub.watch].fn();flush();check(not vm().turn.unit.injured and vm().turn.unit.move=='5"','Half wounds boundary')
    st.wounds=7;models.immort.setTable('state',st);timers[RuHub.watch].fn();flush()
end
success(Player.Red,'action','reposition')
check(vm().turn.apLeft==1 and vm().toast.undo and vm().toast.body:find('−1 AP',1,true),'Action/AP/toast')
do
    local beforeMounts=mounts['hub:Red'];local blueCP=scoring[2].command
    success(Player.Blue,'useploy','reroll')
    check(not vm().toast.undo and findNode(mounted('Red'),'kh:Red:undo').attributes.active=='false',
        'Opponent reaction left stale Undo')
    check(mounts['hub:Red']==beforeMounts,'Undo invalidation remounted Red toast instead of patching')
    local rev=RuAssistantEngine.state.revision;local spent=RuAssistantEngine.state.activation.spent
    local accepted,message=click(Player.Red,'undo')
    check(not accepted and message=='Сначала отмените последнее действие соперника','Host undid opponent reaction')
    check(RuAssistantEngine.state.revision==rev and RuAssistantEngine.state.activation.spent==spent
        and scoring[2].command==blueCP-1,'Rejected undo mutated state')
    success(Player.Blue,'undo');check(scoring[2].command==blueCP,'Blue reaction undo failed')
end
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
success(Player.Red,'tab','ploys');check(vm().ploys.seg=='fire','Tab opening hid firefight ploys')
success(Player.Red,'ployseg','strat');ruHubRenderAll();flush()
check(vm().ploys.seg=='strat','Manual ploy segment overwritten by rendering')
ruHubOpen({color='Red',tab='ploys'});flush();check(vm().ploys.seg=='strat','Open tab lost manual segment')
success(Player.Red,'collapse');success(Player.Red,'expand','rail')
check(vm().ploys.seg=='fire','Reopening collapsed ploys did not choose firefight')
success(Player.Red,'tab','turn');ruHubOpen({color='Red',tab='ploys'});flush()
check(vm().ploys.seg=='fire','ruHubOpen did not choose firefight')
success(Player.Red,'tab','turn')
check(findNode(mounted('Red'),'kh:Red:opentab:ploys')~=nil,'Footer shortcut shares rail tab id')
success(Player.Red,'opentab','ploys')
check(vm().ploys.seg=='fire','Foot ploys command did not choose firefight');success(Player.Red,'ployseg','fire')
do
    local s=RuAssistantEngine.state;local activation=s.activation;s.activation=nil;s.phase='gambit';success(Player.Red,'tab','turn')
    success(Player.Red,'tab','ploys');check(vm().ploys.seg=='strat','Gambit auto segment')
    s.phase='firefight';ruHubRenderAll();flush();check(vm().ploys.seg=='fire','Open tab did not follow phase')
    success(Player.Red,'ployseg','strat');s.phase='gambit';ruHubRenderAll();flush()
    check(vm().ploys.seg=='strat','Manual segment did not remain selected')
    success(Player.Red,'tab','turn');success(Player.Red,'tab','ploys')
    check(vm().ploys.seg=='strat','Re-enter did not reset auto segment')
    s.phase='firefight';s.activation=activation;ruHubRenderAll();flush();check(vm().ploys.seg=='fire','Re-entered tab missed firefight')
end
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
check(scoring[1].command==cp-1 and RuAssistantEngine.state.players['seat:1'].cp==cp-1,'CP adapter commit')
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
do
    local units=RuAssistantEngine.state.units;RuAssistantEngine.state.units={}
    ruHubRender('Red');flush();check(vm().squad.summary==nil,'Empty squad summary was shown')
    RuAssistantEngine.state.units=units;ruHubRender('Red');flush()
end
PreviewHubShellScenes.squad={copy(mounted('Red'))}
success(Player.Red,'squadseg','hurt');check(#vm().squad.units==0,'Hurt filter')
success(Player.Red,'squadseg','all');success(Player.Red,'tab','enemy')
check(vm().enemy.colorKey=='Blue' and #vm().enemy.units==1)
check(vm().enemy.units[1].wounds==3 and vm().enemy.units[1].order=='Conceal','Enemy physical state')
check(vm().enemy.units[1].injured and vm().enemy.units[1].move=='3"' and vm().enemy.units[1].weapons[1].bs=='4+',
    'Injured enemy values')
check(findNode(mounted('Red'),'kh:Red:enemyunit:devote_injury').attributes.text=='MOVE 3" · BS/WS 4+',
    'Injured enemy row omitted effective stats')
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
success(grey,'tab','ref');check(not click(grey,'tab','turn'),'Spectator turn tab')
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
success(Player.Red,'tab','ploys');check(vm().ploys.seg=='strat','Strategy phase default segment')
success(Player.Red,'next');success(Player.Red,'tab','turn');ruHubOpen({color='Red',tab='ploys'});flush()
check(vm().ploys.seg=='strat','Gambit phase default segment')
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
-- Delayed reference readiness must not lose legacy marks to UI-created defaults.
do
    local migration={seats={Red={team='hierotekcircle',used={[generic]=true},pinned={['command-reroll']=true},round=1}}}
    refLoaded=nil;legacy={seats={}};onLoad('');flush()
    local id=RuHub.migration
    check(id and timers[id] and timers[id].seconds==2,'Migration did not poll readiness every two seconds')
    legacy=migration;flush();check(not RuHub.marks.Red.used[generic],'Migration ran before reference readiness')
    refThrows=true;timers[id].fn();id=RuHub.migration
    check(timers[id]~=nil,'Readiness exception escaped pcall');refThrows=false
    for _=1,6 do timers[RuHub.migration].fn() end
    check(RuHub.migration~=nil and RuHub.migrationPending,'Migration stopped after the old 10 second timeout')
    refLoaded=true;timers[RuHub.migration].fn();flush()
    check(RuHub.marks.Red.used[generic] and RuHub.marks.Red.pinned.reroll,'Hub-first legacy migration lost marks')
    legacy={seats={}};flush();check(RuHub.marks.Red.used[generic],'Migration repeated after completion')
    refLoaded=nil;onLoad('');flush()
    legacy={seats={Red={team='hierotekcircle',used={[generic]=true},pinned={['command-reroll']=true},round=2}}}
    refLoaded=true;timers[RuHub.migration].fn();flush()
    check(not RuHub.marks.Red.used[generic] and RuHub.marks.Red.pinned.reroll,'Delayed migration revived another round usage')
    refAvailable=false;refLoaded=nil;onLoad('');flush();id=RuHub.migration
    check(timers[id]~=nil,'Absent reference HUD did not wait')
    for _=1,6 do timers[RuHub.migration].fn() end
    check(RuHub.migration~=nil,'Absent reference HUD stopped before the five minute cap')
    Wait.stop(RuHub.migration);RuHub.migration=nil
    refAvailable=true;refLoaded=true;ruHubOpen({color='Red',tab='turn'});flush()
    check(not RuHub.migrationPending,'Opening hub did not retry pending migration')
end
-- A restored Steam-ID engine keeps its original authority and physical ownership.
do
    legacy={seats={}};onLoad('');flush()
    local unit={id='immort',owner='red-id',name='Old operative',apl=2,move='5"',save='3+',wounds=7,maxWounds=10,
        keywords={},weapons={{name='Legacy gun',key='legacy',kind='ranged',a=4,bs='3+',d='5/2'}},
        order='Engage',ready=true,counteracted=false}
    local oldEngine=RuAssistantCore.new({round=1,maxRounds=4,phase='firefight',initiative='red-id',turnOwner='red-id',
        cpAlreadyGrantedRound=1,players={['red-id']={index=1,color='Red',name='Old Red',host=true,team='hierotekcircle',cp=3},
            ['blue-id']={index=2,color='Blue',name='Old Blue',host=false,team='chaoscult',cp=3}},
        opponents={['red-id']='blue-id',['blue-id']='red-id'},units={immort=unit}},RuAssistantCatalog)
    local base=JSON.decode(onSave());base.ruAssistant.engine=RuAssistantCore.export(oldEngine)
    base.sscoring[1].command=3;base.sscoring[2].command=3;onLoad(JSON.encode(base));flush()
    check(RuAssistantEngine.state.players['red-id'] and not RuAssistantEngine.state.players['seat:1'],'Old identity migrated')
    success(Player.Red,'tab','turn');success(Player.Red,'begin','immort');success(Player.Red,'action','reposition')
    check(RuAssistantEngine.state.activation.owner=='red-id' and vm().turn.apLeft==1,'Old authority failed')
    success(Player.Red,'useploy','reroll');success(Player.Red,'undo')
    check(scoring[1].command==3 and models.immort.getTable('state').owner=='red-id','Old CP/physical owner bridge failed')
    check(not click(Player.Blue,'action','dash'),'Old-save opponent acted for Red')
end
-- One Steam ID controls both places; the same clicking Player changes colour between actions.
do
    RuAssistantEngine=nil;legacy={seats={}}
    local shared=copy(Player.Red);shared.steam_id='shared-id';shared.steam_name='<color=red>One'
    Player.Red=shared;Player.Blue=copy(shared);Player.Blue.color='Blue'
    local function switch(color)
        local previous=shared.color;Player[previous]=copy(shared)
        Player[previous].seated=false;shared.color=color;shared.seated=true;Player[color]=shared
    end
    for _,id in ipairs({'immort','despot','devote'}) do
        local st=models[id].getTable('state');st.owner='shared-id';st.ready=true;st.order='Engage'
        st.wounds=id=='devote' and 4 or 7;st.ktRuAssistant=nil;models[id].setTable('state',st)
    end
    onLoad('');flush();success(shared,'tab','turn')
    check(vm().turn.hint=='Игра за одним компьютером: переключайте цвет места, центр следует за местом','Hot-seat hint')
    local setupTree=mounted('Red')
    check(findNode(setupTree,'kh:Red:setupturn:1').attributes.text=='‹color=red>One','Steam name rich-text injection')
    success(shared,'tab','enemy');check(#vm().enemy.units==0,'Pre-session hot-seat enemy scanned shared Steam models')
    success(shared,'tab','turn')
    success(shared,'setupphase','4');scoring[1].initiative[1]=true;success(shared,'start')
    check(RuAssistantEngine.state.players['seat:1'] and RuAssistantEngine.state.players['seat:2'],'Hot-seat player collision')
    local accepted,message=click(shared,'enrollall')
    check(not accepted and message:find('+ Добавить выделенные',1,true),'Unselected hot-seat teams silently enrolled all')
    success(shared,'team','hierotekcircle');switch('Blue');success(shared,'team','hierotekcircle')
    accepted,message=click(shared,'enrollall')
    check(not accepted and message:find('рамкой',1,true),'Same-team hot-seat enrollall did not require selection')
    success(shared,'team','chaoscult');success(shared,'enrollall')
    check(not RuAssistantEngine.state.units.immort and RuAssistantEngine.state.units.devote.owner=='seat:2',
        'Hot-seat Blue enrollall included the unseated Red seat team')
    check(Player.Red.seated==false and RuHub.seatSteam[1]=='shared-id' and RuHub.seatSteam[2]=='shared-id',
        'Hot-seat identity depended on current seating')
    switch('Red');shared.getSelectedObjects=function() return {models.immort,models.devote} end
    local selectedOk,selectedMessage=click(shared,'enroll')
    check(selectedOk and selectedMessage:find('Пропущено моделей другого отряда: 1',1,true),
        'Selected hot-seat enrollment omitted skipped-team count')
    check(RuAssistantEngine.state.units.immort.owner=='seat:1','Box enrollment failed with shared Steam ID/same teams')
    success(shared,'enrollall')
    check(RuAssistantEngine.state.units.immort.owner=='seat:1' and RuAssistantEngine.state.units.devote.owner=='seat:2',
        'Hot-seat team enrollment mixed sides')
    check(models.immort.getTable('state').owner=='shared-id' and models.devote.getTable('state').owner=='shared-id',
        'Hot-seat physical owner changed')
    shared.getSelectedObjects=function() return {models.devote} end
    RuAssistantEngine.state.units.devote.unavailable=true
    check(not click(shared,'enroll'),'Other seat model was enrolled again')
    check(not click(shared,'select','devote'),'Other seat enrolled model was selectable as own')
    RuAssistantEngine.state.units.devote.unavailable=nil
    model('loose','shared-id','Loose operative','Chaos Cult');extraModels={models.loose}
    success(shared,'tab','enemy')
    check(#vm().enemy.units==1 and vm().enemy.units[1].guid=='devote','Hot-seat enemy included unenrolled own models')
    check(vm().enemy.units[1].injured and vm().enemy.units[1].move=='3"','Hot-seat enemy injured Move')
    shared.getSelectedObjects=function() return {models.immort} end
    success(shared,'begin','immort');success(shared,'action','reposition');success(shared,'action','dash');success(shared,'finish')
    check(RuAssistantEngine.state.turnOwner=='seat:2','Hot-seat Red finish did not transfer turn')
    switch('Blue');success(shared,'begin','devote')
    check(vm('Blue').turn.unit.move=='3"' and vm('Blue').turn.weapons[1].bs=='4+' and vm('Blue').turn.apLeft==2,
        'Hot-seat injured activation stats/AP')
    success(shared,'action','reposition');success(shared,'action','dash');success(shared,'finish')
    switch('Red');success(shared,'begin','despot');success(shared,'action','reposition');success(shared,'action','dash')
    success(shared,'finish');success(shared,'next');check(RuAssistantEngine.state.phase=='scoring','Hot-seat TP did not finish')
    success(shared,'next');success(shared,'initiative','2')
    check(RuAssistantEngine.state.round==2 and RuAssistantEngine.state.initiative=='seat:2','Hot-seat second TP/initiative')
    local hotSaved=onSave();onLoad(hotSaved);flush()
    check(RuAssistantEngine and RuAssistantEngine.state.units.devote.owner=='seat:2','Hot-seat restore failed')
    check(RuHub.seatSteam[1]=='shared-id' and RuHub.seatSteam[2]=='shared-id','Hot-seat seat identities were not persisted')
    -- Saved engine text is escaped only in the display copy, leaving dispatch identifiers intact.
    local engine=RuAssistantEngine
    engine.state.phase='firefight';engine.state.turnOwner='seat:1';engine.state.initiative='seat:1'
    engine.state.units.immort.name='<size=99>Saved';engine.state.units.immort.weapons[1].name='<b>Gun'
    success(shared,'begin','immort')
    engine=RuAssistantEngine
    engine.state.effects[#engine.state.effects+1]={id='free-text',owner='seat:1',target='immort',
        title='<color=red>Saved effect',text='<b>Body',expiry={kind='manual'},expiryLabel='<i>Until removed'}
    ruHubRenderAll();flush()
    local function noInjectedText(n)
        local text=(n.attributes or {}).text or ''
        check(not text:find('<color=red>',1,true) and not text:find('<size=99>',1,true)
            and not text:find('<b>Gun',1,true) and not text:find('<i>Until removed',1,true),'Unescaped saved UI text')
        for _,child in ipairs(n.children or {}) do noInjectedText(child) end
    end
    Player.Red.seated=true;Player.Blue.seated=true;ruHubRenderAll();flush()
    noInjectedText(mounted('Red'));noInjectedText(mounted('Blue'))
    check(RuAssistantEngine.state.units.immort.name=='<size=99>Saved','Escaping changed saved engine text')
    check(mounted('Red')~=nil,'Red hub missing after restoring both hot-seat seats')
    check(mounted('Blue')~=nil,'Blue hub missing after restoring both hot-seat seats')
    allIds(mounted('Red'));allIds(mounted('Blue'))
    success(shared,'tab','log');success(shared,'logseg','score');noInjectedText(mounted('Red'))
    switch('Blue');success(shared,'tab','log');success(shared,'logseg','score')
    noInjectedText(mounted('Blue'))
    Player.Red.seated=true;Player.Blue.seated=true;ruHubRenderAll();flush()
    extraModels={}
end
-- Recover an externally unmounted dock in the very next poll, even before the real UI flushes.
do
    local beforeMounts=mounts['hub:Blue']
    Global.call('ruUiUnmount',{owner='hub:Blue'})
    check(not mounted('Blue'),'External unmount fixture failed')
    timers[RuHub.watch].fn();flush()
    check(mounted('Blue') and mounts['hub:Blue']==beforeMounts+1,'Polling did not recover externally unmounted dock')
    liveMatches(RuHub.trees.Blue,mounted('Blue'))
end
allIds(mounted('Red'));allIds(mounted('Blue'));allIds(mounted('Grey'))
local immutable=mounts['hub:defaults'];ruHubRenderAll();flush();check(mounts['hub:defaults']==immutable)
ruHubRender('Red') -- Pending callbacks must not resurrect the dock after destruction.
onDestroy();flush();check(not mounted('Red') and not mounted('Blue'),'Destroy did not unmount')
return checked..' hub shell checks passed; 20 required scenarios; '..patchCalls..' composer patch batches'
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
console.log('PASS: emitted tmp/hub-shell-test.lua with actual scoreboard, composer, metadata and 20 hub scenarios');
