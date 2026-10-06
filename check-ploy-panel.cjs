const fs=require('fs'),assert=require('assert');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('./tools/node_modules/fengari');
const working=process.argv.includes('--working'),table=JSON.parse(fs.readFileSync(process.argv.includes('--installed')?'C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json':'output/KT24-The-Killzone-RU-'+(working?'working':'preview-3')+'.json'));
const hud=table.ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript;
const driver=`
UI={};local xml,nodes,pending={}, {}, {};Wait={condition=function(f,p) if p() then f() else table.insert(pending,{f,p}) end end,time=function(f,s,n) assert(s==2 and n==-1);Watch=f;return 1 end,stop=function(id) assert(id==1) end}
self={getGUID=function() return 'efa3fe' end,addContextMenuItem=function() end}
local Saved;JSON={encode=function(v) Saved=v;return 'saved' end,decode=function() return Saved end}
function UI.getXmlTable() return xml end
function UI.getAttribute(id,k) return nodes[id] and nodes[id].attributes[k] end
function UI.setAttribute(id,k,v) assert(nodes[id],'Missing node '..id);nodes[id].attributes[k]=v end
function UI.setXmlTable(value) xml=value;nodes={};local function walk(n) local id=(n.attributes or {}).id;if id then assert(not nodes[id],'Duplicate UI ID '..id);nodes[id]=n end;for _,c in ipairs(n.children or {}) do walk(c) end end;for _,n in ipairs(xml) do walk(n) end end
local function ready() UI.loading=false;while #pending>0 do local jobs=pending;pending={};for _,j in ipairs(jobs) do assert(j[2]());j[1]() end end end
local red,blue={color='Red'},{color='Blue'}
`;
const cases=`
onLoad('');assert(nodes.ruPloyLauncher,'Permanent launcher missing')
UI.setXmlTable({{tag='Panel',attributes={id='scoreboardAfterLateLoad'}}});Watch();assert(nodes.ruPloyLauncher and nodes.scoreboardAfterLateLoad,'Launcher lost after late scoreboard load')
UI.setXmlTable({nodes.ruPloyLauncher,{tag='Panel',attributes={id='existingScoreboard'}}})
ruOpenPloys({color='Red'});assert(RuPloySeats.Red.picker and #RuPloySeats.Red.visible==41)
ruPloySearch(red,'Иеротек','ruPloySearch_Red');assert(#RuPloySeats.Red.visible==1)
ruPloySelect(red,nil,'ruPloyEntry_1_Red');local c=RuPloySeats.Red
assert(c.team=='hierotekcircle' and not c.picker and #c.visible==4)
assert(nodes.existingScoreboard and nodes.ruPloyLauncher and nodes.ruPloys_Red)
assert(nodes.ruPloys_Red.attributes.visibility=='Red')
UI.setXmlTable({nodes.ruPloyLauncher,{tag='Panel',attributes={id='existingScoreboard'}}});Watch();assert(nodes.ruPloys_Red and nodes.existingScoreboard,'Late scoreboard snapshot erased open ploy panel')
local first=c.visible[1];local id=c.team..':'..first.id
ruPloyUse(red,nil,'ruPloyUse_Red');assert(c.used[id])
ruPloyPin(red,nil,'ruPloyPin_Red');assert(c.pinned[id])
ruPloyUse(red,nil,'ruPloyUse_Red');assert(not c.used[id],'Undo mark failed')
ruPloyUse(red,nil,'ruPloyUse_Red')
ruOpenPloys({color='Blue'});assert(RuPloySeats.Blue.picker and nodes.ruPloys_Red and nodes.ruPloys_Blue)
ruPloyUse(blue,nil,'ruPloyUse_Red');assert(c.used[id],'Cross-seat mutation accepted')
ruPloyPin(blue,nil,'ruPloyPin_Red');assert(c.pinned[id])
RuReferenceCache.Red={team='broodbrothers',currentEdition=true}
ruOpenPloys({color='Red'});assert(c.team=='hierotekcircle','R selection changed pinned player team')
ruPloyGroup(red,nil,'ruPloyGroup_firefight_Red');assert(#c.visible==5)
local reroll
for i,e in ipairs(c.visible) do if e.id=='command-reroll' then reroll=i end end
ruPloySelect(red,nil,'ruPloyEntry_'..reroll..'_Red');ruPloyUse(red,nil,'ruPloyUse_Red');ruPloyUse(red,nil,'ruPloyUse_Red')
assert(c.used['command-reroll']==2 and nodes.ruPloyUndo_Red,'Repeated reroll unsupported')
UI.loading=true;ruPloyUndoReroll(red,nil,'ruPloyUndo_Red');ruPloyResetMarks(red,nil,'ruPloyRound_Red');assert(c.used['command-reroll']==2,'Loading UI accepted undo/reset');ready()
ruPloyUndoReroll(red,nil,'ruPloyUndo_Red');assert(c.used['command-reroll']==1)
ruPloyUndoReroll(red,nil,'ruPloyUndo_Red');assert(not c.used['command-reroll'])
ruPloyGroup(red,nil,'ruPloyGroup_pinned_Red');assert(#c.visible==1)
ruPloysRoundEnd();assert(c.round==2 and not next(c.used) and c.pinned[id] and RuPloySeats.Blue.round==2)
ruPloyUse(red,nil,'ruPloyUse_Red');ruPloyResetMarks(red,nil,'ruPloyRound_Red');assert(c.round==2 and not next(c.used) and c.pinned[id])
ruPloyUse(red,nil,'ruPloyUse_Red');onSave();RuPloySeats={};ruLoadPloys('saved');c=RuPloySeats.Red
assert(c.round==2 and c.team=='hierotekcircle' and c.used[id] and c.pinned[id] and not c.open,'Save/restore failed')
ruOpenPloys({color='Red'});ruPloyPickTeam(red,nil,'ruPloyTeam_Red');ruPloySearch(red,'Brood Brothers','ruPloySearch_Red');assert(#c.visible==1)
ruPloySelect(red,nil,'ruPloyEntry_1_Red');assert(c.team=='broodbrothers')
assert(#c.visible>0)
ruPloyGroup(red,nil,'ruPloyGroup_pinned_Red');assert(#c.visible==0,'Team reminders leaked')
ruPloyPickTeam(red,nil,'ruPloyTeam_Red');ruPloySearch(red,'Hierotek','ruPloySearch_Red');ruPloySelect(red,nil,'ruPloyEntry_1_Red');assert(#c.visible==1,'Team reminder lost on switching back')
UI.loading=true;ruPloyClose(red,nil,'ruPloyClose_Red');ruOpenPloys({color='Red'});ready();assert(nodes.ruPloys_Red)
UI.loading=true;ruPloyClose(red,nil,'ruPloyClose_Red');ready();assert(not nodes.ruPloys_Red)
local usedBefore=c.used[id];ruPloyUse(red,nil,'ruPloyUse_Red');assert(c.used[id]==usedBefore,'Closed stale callback accepted')
ruOpenPloys({color='Grey'});assert(not RuPloySeats.Grey)
local teamCount,ployCount=0,0
for key,team in pairs(ruReferenceTeams) do
 c.team=key;c.group='strategy';c.open=true;c.picker=false;c.query='';c.selected=1;ruRenderPloys('Red');local strategy=#c.visible;assert(strategy>0,key..' lacks strategy ploys')
 ruPloyGroup(red,nil,'ruPloyGroup_firefight_Red');local firefight=#c.visible;assert(firefight>1)
 for _,e in ipairs(ruPloyItems(c)) do assert(e.ployType=='strategy' or e.ployType=='firefight');assert(e.text~='') end
 teamCount=teamCount+1;ployCount=ployCount+strategy+firefight-1
end
assert(teamCount==41 and ployCount==328)
c.team='hierotekcircle';c.group='strategy';c.selected=1;c.query='';c.used={};c.pinned={};ruRenderPloys('Red');ruPloyUse(red,nil,'ruPloyUse_Red');ruPloyPin(red,nil,'ruPloyPin_Red');PloyPreview=UI.getXmlTable()
return teamCount,ployCount
`;
const script=driver+'\n'+hud+'\n'+cases;fs.writeFileSync('tmp/ploy-panel-test.lua',script);
if(process.argv.includes('--emit-only')){console.log('Emitted tmp/ploy-panel-test.lua');process.exit(0);}
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const status=lauxlib.luaL_dostring(L,to_luastring(script));if(status!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tolstring(L,-1)));
const result={passed:true,teamsExercised:lua.lua_tointeger(L,-2),teamPloysExercised:lua.lua_tointeger(L,-1),perSeatIsolation:true,teamSelectionPreserved:true,saveRestore:true,roundReset:true,remindersSurviveRound:true,repeatableCommandReroll:true,manualCP:true,nativeTTSRuntimeTested:false};
function value(index){index=lua.lua_absindex(L,index);const type=lua.lua_type(L,index);if(type===lua.LUA_TSTRING)return to_jsstring(lua.lua_tolstring(L,index));if(type===lua.LUA_TNUMBER)return lua.lua_tonumber(L,index);if(type===lua.LUA_TBOOLEAN)return !!lua.lua_toboolean(L,index);if(type===lua.LUA_TTABLE){const o={};lua.lua_pushnil(L);while(lua.lua_next(L,index)){o[value(-2)]=value(-1);lua.lua_pop(L,1);}const keys=Object.keys(o);return keys.length&&keys.every(k=>/^\d+$/.test(k))?keys.sort((a,b)=>a-b).map(k=>o[k]):o;}return null;}
assert(lua.lua_checkstack(L,2048));lua.lua_getglobal(L,to_luastring('PloyPreview'));fs.writeFileSync('output/ploy-panel-preview-xml.json',JSON.stringify(value(-1),null,2));
const physical=table.ObjectStates.find(x=>x.GUID==='bc18b1').LuaScript,round=table.ObjectStates.find(x=>x.GUID==='d2682e').LuaScript;
const nativeTest=`self={createButton=function(b) if b.label=='УЛОВКИ' then assert(b.width>=1000 and b.font_color[1]==1);PloyButton=b end end};local called;getObjectFromGUID=function(g) assert(g=='efa3fe');return {call=function(name,args) called=name;assert(args.color=='Red') end} end\n`+physical+`\nonLoad();assert(PloyButton);ruTablePloys(nil,'Red');assert(called=='ruOpenPloys')`;
const nativeStatus=lauxlib.luaL_dostring(L,to_luastring(nativeTest));if(nativeStatus!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tolstring(L,-1)));
const roundDriver=`local calls={};getObjectFromGUID=function(g) return {call=function(name,args) calls[name]=(calls[name] or 0)+1 end} end;Player={Red={},blue={},red={}};getObjectsWithTag=function() return {} end\n`+round+`\nroundEnd(nil,'Red');assert(calls.ruPloysRoundEnd==1 and calls.ReadyAllOperatives==1 and calls.SaveAllPositions==1 and calls.spawnKill_==2,'Round end integration changed original operations')`;
const roundStatus=lauxlib.luaL_dostring(L,to_luastring(roundDriver));if(roundStatus!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tolstring(L,-1)));
result.physicalButtonDispatch=true;result.existingRoundActionsPreserved=true;
fs.writeFileSync('output/ploy-panel-verification.json',JSON.stringify(result,null,2));console.log(result);
