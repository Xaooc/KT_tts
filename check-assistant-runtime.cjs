const fs=require('fs');const table=JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-assistant-candidate.json'));const board=table.ObjectStates.find(x=>x.GUID==='339b7f').LuaScript;
const lit=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v==='number'?String(v):typeof v==='boolean'?(v?'true':'false'):Array.isArray(v)?'{'+v.map(lit).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+lit(k)+']='+lit(x)).join(',')+'}';
const settings=JSON.parse(board.match(/defaultSettings\s*=\s*\[\[([\s\S]*?)\]\]/)[1]);
const driver=`
local function copy(t) if type(t)~='table' then return t end;local o={};for k,v in pairs(t) do o[k]=copy(v) end;return o end
local encoded={};local serial=0
JSON={encode=function(t) serial=serial+1;local id='json'..serial;encoded[id]=copy(t);return id end,decode=function(s) if encoded[s] then return copy(encoded[s]) end;if type(s)=='string' and s:sub(1,1)=='{' then return ${lit(settings)} end;return nil end}
local function makeUI()
 local xml,values={},{};local obj={loading=false}
 function obj.getXmlTable() return copy(xml) end
 function obj.setXmlTable(t) xml=copy(t) end
 function obj.getAttribute(id,key) local function find(n) if n.attributes and n.attributes.id==id then return n.attributes[key] end;for _,c in ipairs(n.children or {}) do local v=find(c);if v~=nil then return v end end end;for _,n in ipairs(xml) do local v=find(n);if v~=nil then return v end end;return (values[id] or {})[key] end
 function obj.setAttribute(id,k,v) values[id]=values[id] or {};values[id][k]=v end
 function obj.setValue(id,v) obj.setAttribute(id,'text',v) end
 function obj.setAttributes(id,t) for k,v in pairs(t) do obj.setAttribute(id,k,v) end end
 function obj.getCustomAssets() return {} end;function obj.setCustomAssets() end;function obj.show() end;function obj.hide() end
 return obj
end
UI=makeUI();Global={UI=UI};self={UI=makeUI(),getGUID=function() return '339b7f' end,setTags=function() end,addContextMenuItem=function() end}
local scheduled={};local watcher={};Wait={frames=function(f,n) scheduled[#scheduled+1]=f end,condition=function(f,p) if p() then f() else scheduled[#scheduled+1]=f end end,time=function(f) watcher[#watcher+1]=f;return #watcher end,stop=function() end}
Timer={create=function() end};function broadcastToAll() end
local color={lerp=function(s) return s end,toHex=function() return 'ffffff' end};Color=setmetatable({fromString=function() return color end},{__call=function() return color end})
Player={Red={steam_id='red-id',steam_name='Красный',color='Red',host=true,seated=true,broadcast=function() end,promote=function() end,getHandObjects=function() return {} end},Blue={steam_id='blue-id',steam_name='Синий',color='Blue',host=false,seated=true,broadcast=function() end,promote=function() end,getHandObjects=function() return {} end}}
function Player.getPlayers() return {Player.Red,Player.Blue} end;function Player.getColors() return {'Red','Blue'} end
local models={}
local function model(id,owner,name,team,keywords)
 local st={owner=owner,info={name=name,ktRuTeam=team,categories=keywords,weapons={{name='Tesla carbine',stats={WR='Devastating 1'}}}},stats={APL=2,Wounds=10},wounds=7,ready=true,order='Engage'}
 local obj={hasTag=function(tag) return tag=='Operative' end,UI=makeUI(),getGUID=function() return id end,getName=function() return name end,getTable=function(k) if k=='state' then return copy(st) end end,setTable=function(k,v) if k=='state' then st=copy(v) end end,call=function() end}
 models[id]=obj;return obj
end
model('immort','red-id','Immortal Guardian','Hierotek Circle',{'IMMORTAL'});model('devote','blue-id','Devotee','Chaos Cult',{'DEVOTEE'})
function getAllObjects() return {models.immort,models.devote} end
function getObjectFromGUID(id) return models[id] end
Player.Red.getSelectedObjects=function() return {models.immort} end;Player.Blue.getSelectedObjects=function() return {models.devote} end
${board}
RuntimeScenes={};local checked=0;local function check(x,msg) checked=checked+1;assert(x,msg or ('Runtime check '..checked)) end
onLoad('');check(scoring[1].command==3 and scoring[2].command==3)
-- Flush original UI callbacks and assistant render in scheduled order.
for _,f in ipairs(scheduled) do f() end;scheduled={}
ruAssistantClick(Player.Red,nil,'ruAssist_open_0_All')
ruAssistantChange(Player.Red,'True','ruAssist_attachconfirm_0_Red')
ruAssistantClick(Player.Red,nil,'ruAssist_start_0_Red')
check(RuAssistantEngine and RuAssistantEngine.state.phase=='initiative')
check(next(RuAssistantEngine.state.units)==nil,'Start enrolled unselected reserves')
ruAssistantClick(Player.Red,nil,'ruAssist_enroll_0_Red')
ruAssistantClick(Player.Blue,nil,'ruAssist_enroll_'..RuAssistantEngine.state.revision..'_Blue')
check(RuAssistantEngine.state.players['red-id'].team=='hierotekcircle')
check(RuAssistantEngine.state.players['blue-id'].team=='chaoscult')
check(RuAssistantEngine.state.units.immort.owner=='red-id')
local function apply(player,event,want)
 event.revision=RuAssistantEngine.state.revision;local ok,msg=ruAssistantCommit(player,event);check(ok==want,msg);return msg
end
apply(Player.Blue,{type='initiative',winner='blue-id'},false)
apply(Player.Red,{type='initiative',winner='red-id'},true)
check(scoring[1].command==3 and scoring[2].command==3,'First round CP double grant')
check(scoring[1].initiative[1] and not scoring[2].initiative[1])
apply(Player.Red,{type='next_phase',confirmed=true},true)
apply(Player.Red,{type='pass_gambit'},true);apply(Player.Blue,{type='pass_gambit'},true)
apply(Player.Red,{type='begin',unit='immort'},true)
RuntimeScenes.activation=ruAssistantBuildDock(Player.Red)
apply(Player.Red,{type='action',action='shoot',weapon='tesla'},true)
RuAssistantViews['red-id'].tab='ploy';RuAssistantViews['red-id'].ploy='lightning';RuntimeScenes.ploy=ruAssistantBuildDock(Player.Red)
local before=RuAssistantEngine.state.revision
local msg=apply(Player.Red,{type='ploy',ploy='lightning',target='immort',confirmed=true,request='live-ploy'},true)
check(scoring[1].command==2 and RuAssistantEngine.state.players['red-id'].cp==2)
check(#RuAssistantEngine.state.effects==1)
local ok=ruAssistantCommit(Player.Red,{type='ploy',ploy='lightning',target='immort',confirmed=true,request='live-ploy',revision=before});check(ok and scoring[1].command==2,'Duplicate debited')
apply(Player.Blue,{type='undo'},false);apply(Player.Red,{type='undo'},true)
check(scoring[1].command==3 and #RuAssistantEngine.state.effects==0)
ok=ruAssistantCommit(Player.Red,{type='ploy',ploy='lightning',target='immort',confirmed=true,request='live-ploy',revision=before});check(not ok and scoring[1].command==3)
apply(Player.Red,{type='ploy',ploy='lightning',target='immort',confirmed=true},true)
-- Save/reload with pending action and CP. Do not rerun constructor/reset.
local saved=onSave();local savedRevision=RuAssistantEngine.state.revision
RuAssistantEngine=nil;scoring[1].command=999
onLoad(saved)
check(scoring[1].command==2 and RuAssistantEngine.state.players['red-id'].cp==2,'Reload lost authoritative CP')
check(RuAssistantEngine.state.revision==savedRevision and RuAssistantEngine.state.activation.pending.action=='shoot')
check(RuAssistantCPReceipts['live-ploy']~=nil,'CP receipts lost')
apply(Player.Red,{type='finish_action'},true);check(#RuAssistantEngine.state.effects==0)
apply(Player.Red,{type='finish'},true);check(models.immort.getTable('state').ready==false)
apply(Player.Blue,{type='begin',unit='devote'},true);apply(Player.Blue,{type='finish'},true)
apply(Player.Red,{type='add_effect',unit='immort',title='Ускорение',expiry={kind='activation_end'},aplDelta=1,confirmed=true},true)
apply(Player.Red,{type='next_phase'},true);apply(Player.Red,{type='next_phase',confirmed=true},true)
RuAssistantViews['red-id'].tab='match';RuntimeScenes.round=ruAssistantBuildDock(Player.Red)
check(getCurrentRound()==2 and RuAssistantEngine.state.initiative==nil)
apply(Player.Red,{type='initiative',winner='blue-id'},true)
check(scoring[1].command==4 and scoring[2].command==4,'Round2 CP allocation wrong')
check(scoring[2].initiative[2] and not scoring[1].initiative[2])
check(models.immort.getTable('state').ready and models.devote.getTable('state').ready)
check(#RuAssistantEngine.state.effects==1 and RuAssistantCore.apl(RuAssistantEngine.state,'immort')==3)
-- External physical WND changes must survive an undo of an unrelated effect.
local st=models.immort.getTable('state');st.wounds=1;models.immort.setTable('state',st)
apply(Player.Red,{type='undo'},false);check(RuAssistantEngine.state.units.immort.wounds==1 and models.immort.getTable('state').wounds==1)
onCommandPointDownPressed(Player.Blue,nil,'kts__command_player1');check(scoring[1].command==4,'Cross-player CP edit')
onCommandPointDownPressed(Player.Red,nil,'kts__command_player1');check(scoring[1].command==3 and RuAssistantEngine.state.players['red-id'].cp==3)
for i=1,5 do onCommandPointDownPressed(Player.Red,nil,'kts__command_player1') end;check(scoring[1].command==0,'CP underflow')
local rev=RuAssistantEngine.state.revision;ruAssistantClick(Player.Red,nil,'ruAssist_begin_'..(rev-1)..'_Red');check(RuAssistantEngine.state.revision==rev)
-- Private UI seat isolation and native dropdown index wiring.
local function inspect(nodes)
 local seen={};local function walk(n)
  local a=n.attributes or {};if a.id and tostring(a.id):find('ruAssist',1,true) then check(not seen[a.id],'Duplicate XML ID '..a.id);seen[a.id]=true end
  if n.tag=='VerticalScrollView' and tostring(a.id):find('ruAssistant',1,true) then check(a.horizontal=='false' and a.vertical=='true');check(tonumber(n.children[1].attributes.width)<=tonumber(a.width)-14) end
  if n.tag=='Dropdown' and tostring(a.id):find('ruAssist_',1,true) then check(a.onValueChanged:find('(selectedIndex)',1,true) and a.itemTextColor=='#edf2f4') end
  for _,c in ipairs(n.children or {}) do walk(c) end
 end;for _,n in ipairs(nodes) do walk(n) end
end
local view=RuAssistantViews['red-id'];view.tab='match';view.open=true;ruAssistantRender();inspect(Global.UI.getXmlTable())
local last=RuAssistantEngine.state.revision;ruAssistantChange(Player.Blue,'0','ruAssist_team_'..last..'_Red');check(RuAssistantEngine.state.revision==last)
view.tab='ploy';view.ploy='lightning';ruAssistantRender();inspect(Global.UI.getXmlTable())
-- Every team's ploy data is reachable by dropdown, including long labels.
for team in pairs(RuAssistantTeams) do RuAssistantEngine.state.players['red-id'].team=team;view.ploy=nil;view.tab='ploy';view.open=true;ruAssistantRender();check(#view.ploys>0,'No ploys '..team) end
RuAssistantEngine.state.players['red-id'].team='hierotekcircle';view.tab='activation';view.selected='immort';ruAssistantRender()
PreviewAssistantRuntime={scenes=RuntimeScenes,live=Global.UI.getXmlTable()}
-- Native edits of readiness/order are imported and not overwritten by an effect commit.
local physical=models.immort.getTable('state');physical.ready=false;physical.order='Conceal';models.immort.setTable('state',physical)
for _,f in ipairs(watcher) do f() end
apply(Player.Red,{type='add_effect',unit='immort',title='Manual',expiry={kind='manual'},confirmed=true},true)
check(RuAssistantEngine.state.units.immort.order=='Conceal' and not RuAssistantEngine.state.units.immort.ready)
check(models.immort.getTable('state').order=='Conceal' and not models.immort.getTable('state').ready)
-- Generic ploy target/duration and the explicit repeat exception.
RuAssistantEngine.state.phase='firefight';RuAssistantEngine.state.turnOwner='red-id';setCommandPoints(1,5)
local generic;for key,rule in pairs(RuAssistantCatalog.ploys) do if rule.team=='hierotekcircle' and rule.generic and rule.phase=='firefight' then generic=key;break end end
apply(Player.Red,{type='ploy',ploy=generic,confirmed=true,expiry={kind='round'},effectText='Team annotation'},true)
local effect=RuAssistantEngine.state.effects[#RuAssistantEngine.state.effects];check(effect.target=='team' and effect.expiry.kind=='round' and effect.text=='Team annotation')
apply(Player.Red,{type='ploy',ploy=generic,confirmed=true,expiry={kind='manual'}},false)
apply(Player.Red,{type='ploy',ploy=generic,confirmed=true,exception=true,expiry={kind='manual'}},true)
local priorCP=scoring[1].command;view.ploy=generic;view.cost='bad';view.confirmed=true;ruAssistantClick(Player.Red,nil,'ruAssist_useploy_'..RuAssistantEngine.state.revision..'_Red');check(scoring[1].command==priorCP)
-- Reposition and Fall Back cannot be combined; deliberate rule exceptions remain possible.
physical=models.immort.getTable('state');physical.ready=true;physical.order='Engage';models.immort.setTable('state',physical)
for _,f in ipairs(watcher) do f() end
apply(Player.Red,{type='begin',unit='immort'},true);apply(Player.Red,{type='adjust_ap',value=3},true);apply(Player.Red,{type='action',action='reposition'},true);apply(Player.Red,{type='action',action='fallback'},false)
apply(Player.Red,{type='action',action='fallback',exception=true},true);apply(Player.Red,{type='finish'},true)
-- An operative whose owner changed is not usable by its previous owner.
physical=models.immort.getTable('state');physical.owner='blue-id';models.immort.setTable('state',physical)
RuAssistantEngine.state.turnOwner='red-id';apply(Player.Red,{type='begin',unit='immort'},false);check(RuAssistantEngine.state.units.immort.unavailable)
-- Guard undo restores the exact physical guard subtype.
physical=models.devote.getTable('state');physical.owner='blue-id';physical.ready=true;physical.order='GuardConceal';models.devote.setTable('state',physical)
for _,f in ipairs(watcher) do f() end
RuAssistantEngine.state.turnOwner='blue-id';apply(Player.Blue,{type='begin',unit='devote'},true)
apply(Player.Blue,{type='order',order='Engage'},true);check(models.devote.getTable('state').order=='Engage')
apply(Player.Blue,{type='undo'},true);check(models.devote.getTable('state').order=='GuardConceal')
-- An incapacitated active operative may finish bookkeeping but cannot act again.
physical=models.devote.getTable('state');physical.wounds=0;models.devote.setTable('state',physical)
for _,f in ipairs(watcher) do f() end
apply(Player.Blue,{type='action',action='dash'},false);apply(Player.Blue,{type='finish'},true)
local priorRevision=RuAssistantCPRevision;loadGM();check(not RuAssistantEngine and scoring[1].command==3 and RuAssistantCPRevision>priorRevision)

-- Explicit round/phase/turn attach handles CP and turn without guesses.
RuAssistantViews={};ruAssistantClick(Player.Red,nil,'ruAssist_open_0_All')
ruAssistantChange(Player.Red,'2','ruAssist_attachround_0_Red');ruAssistantChange(Player.Red,'4','ruAssist_attachphase_0_Red');ruAssistantChange(Player.Red,'1','ruAssist_attachturn_0_Red');ruAssistantChange(Player.Red,'True','ruAssist_attachconfirm_0_Red');ruAssistantClick(Player.Red,nil,'ruAssist_start_0_Red')
check(RuAssistantEngine.state.round==2 and RuAssistantEngine.state.phase=='initiative' and RuAssistantEngine.state.turnOwner=='blue-id' and RuAssistantEngine.state.cpAlreadyGrantedRound==1)
apply(Player.Red,{type='initiative',winner='blue-id'},true);check(scoring[1].command==5 and scoring[2].command==4)
-- Native cost confirmation must not authorize repetition by itself.
RuAssistantEngine.state.phase='firefight';RuAssistantEngine.state.turnOwner='blue-id'
physical=models.devote.getTable('state');physical.wounds=7;physical.ready=true;physical.order='Engage';models.devote.setTable('state',physical)
ruAssistantClick(Player.Blue,nil,'ruAssist_enroll_'..RuAssistantEngine.state.revision..'_Blue')
for _,f in ipairs(watcher) do f() end
apply(Player.Blue,{type='begin',unit='devote'},true);apply(Player.Blue,{type='action',action='reposition'},true)
local bv=RuAssistantViews['blue-id'];bv.actionCost='0';bv.actionConfirmed=true;bv.actionException=false
ruAssistantClick(Player.Blue,nil,'ruAssist_actionreposition_'..RuAssistantEngine.state.revision..'_Blue')
check(RuAssistantEngine.state.activation.performed.reposition==1 and RuAssistantEngine.state.activation.spent==1)
bv.actionConfirmed=true;bv.actionException=true
ruAssistantClick(Player.Blue,nil,'ruAssist_actionreposition_'..RuAssistantEngine.state.revision..'_Blue')
check(RuAssistantEngine.state.activation.performed.reposition==2 and RuAssistantEngine.state.activation.spent==1)
-- One combined scoring log entry for a CP-changing transaction.
local logCalls=0;dispatchGameLogScoringEvent=function() logCalls=logCalls+1 end
apply(Player.Blue,{type='ploy',ploy='reroll',confirmed=true},true);check(logCalls==1,'Duplicate scoring log')
return checked..' native runtime checks'
`;
fs.writeFileSync('tmp/assistant-runtime-test.lua',driver);console.log('Emitted actual candidate runtime integration test');
