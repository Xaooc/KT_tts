const fs=require('fs'),assert=require('assert');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('./tools/node_modules/fengari');
const working=process.argv.includes('--working');
const file='output/KT41-RU-'+(working||process.argv.includes('--installed')?'working':'preview-3')+'.json';
const hud=process.argv.includes('--candidate')?JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-assistant-candidate.json')).ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript:process.argv.includes('--installed')?JSON.parse(fs.readFileSync('C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json')).ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript:working?JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-working.json')).ObjectStates[126].LuaScript:fs.readFileSync('output/HUD-preview-3.lua','utf8');
const pack=JSON.parse(fs.readFileSync(file)),models=[];
function scan(x){if(!x||typeof x!=='object')return;if(x.LuaScriptState){const state=JSON.parse(x.LuaScriptState);if(state.info)models.push({name:x.Nickname,description:x.Description,state});}Object.values(x).forEach(scan);}scan(pack);
const lit=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v!=='object'?String(v):Array.isArray(v)?'{'+v.map(lit).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+lit(k)+']='+lit(x)).join(',')+'}';
const primus=models.find(x=>x.state.info.name==='Primus'),hierotek=models.find(x=>x.state.info.ktRuTeam==='Hierotek Circle');assert(primus&&hierotek);
const reps=[...new Map(models.map(x=>[x.state.info.ktRuTeam,x])).values()];assert.equal(reps.length,41);
const driver=`
UI={};self={getGUID=function() return "efa3fe" end};local pending={};Wait={time=function(f) f() end,condition=function(f,p) if p() then f() else table.insert(pending,{f,p}) end end};local xml,nodes={},{}
local function ready() UI.loading=false;while #pending>0 do local current=pending;pending={};for _,task in ipairs(current) do assert(task[2]());task[1]() end end end
function UI.getXmlTable() return xml end
function UI.setXmlTable(value) xml=value;nodes={};local function walk(x) if x.attributes and x.attributes.id then assert(not nodes[x.attributes.id],"Duplicate UI ID "..x.attributes.id);nodes[x.attributes.id]=x end;for _,c in ipairs(x.children or {}) do walk(c) end end;for _,x in ipairs(xml) do walk(x) end end
function UI.setAttribute(id,k,v) if nodes[id] then nodes[id].attributes[k]=v end end
local function attrs(id) assert(nodes[id],"Missing UI element "..id);return nodes[id].attributes end
local function visibleText(id) local parts={};local function walk(n) if n.attributes and n.attributes.text then table.insert(parts,n.attributes.text) end;for _,c in ipairs(n.children or {}) do walk(c) end end;walk(nodes[id]);return table.concat(parts) end
local function operative(x) return {hasTag=function() return true end,getName=function() return x.name end,getDescription=function() return x.description end,getTable=function() return x.state end} end
`;
const scenarios=`
local red,blue={color="Red"},{color="Blue"}
local p,h=${lit(primus)},${lit(hierotek)}
onOperativeRandomize({operative(p),"Red"})
assert(RuReferenceCache.Red.team=="broodbrothers")
local short,long
for i,w in ipairs(WeaponCache.Red.weapons) do
 if w.name:lower():find("short range",1,true) then short=i end
 if w.name:lower():find("long range",1,true) then long=i end
end
assert(short and long)
local st=attrs("weaponWRText_"..short.."_Red").tooltip
local lt=attrs("weaponWRText_"..long.."_Red").tooltip
assert(st:find("Range",1,true) and st:find("Lethal",1,true) and st:find("8",1,true))
assert(not st:find("5++",1,true),"Double plus in Lethal parameter")
assert(lt:find("Silent",1,true) and not lt:find("Range",1,true) and not lt:find("Lethal",1,true),"Cross-profile tooltip contamination")
assert(attrs("ruWeapon_"..short.."_Red").onClick=="efa3fe/ruOpenWeaponReference")
ruOpenWeaponReference(red,nil,"ruWeapon_"..short.."_Red")
assert(#RuReferenceCache.Red.visible==3)
local modelName=attrs("statsNameText_Red").text
assert(attrs("ruReference_Red").visibility=="Red")
ruChangeSection(red,nil,"ruTab_team_Red")
assert(#RuReferenceCache.Red.visible>0)
assert(attrs("statsNameText_Red").text==modelName,"Opening reader erased the main HUD")
ruChangeSection(red,nil,"ruTab_weapon_Red")
ruSearchReference(red,"ДАЛЬНОСТЬ","ruSearch_Red")
assert(#RuReferenceCache.Red.visible==1,"Uppercase Cyrillic search")
ruSearchReference(red,"impossible needle banana","ruSearch_Red")
assert(#RuReferenceCache.Red.visible==0 and visibleText("ruDetail_Red"):find("ничего не найдено",1,true))
ruResetReference(red,nil,"ruReset_Red")
assert(#RuReferenceCache.Red.visible>=25)
local pc=ruWeaponTooltip("Red",{name="Test",wr="Piercing Crits 1"})
WeaponCache.Red.weapons={{name="Test",wr="Piercing Crits 1"}}
ruOpenWeaponReference(red,nil,"ruWeapon_1_Red")
assert(#RuReferenceCache.Red.visible==1 and RuReferenceCache.Red.visible[1].english=="Piercing Crits","Piercing Crits contaminated by Piercing")
assert(ruWeaponTooltip("Red",{name="Test",wr="Heavy (Reposition only)"}):find("только Перемещение",1,true),"Heavy restriction omitted")
onOperativeRandomize({operative(h),"Blue"});ruOpenReference(blue,nil,"ruOpen_team_Blue")
assert(RuReferenceCache.Blue.team=="hierotekcircle" and attrs("ruReference_Blue").visibility=="Blue")
assert(nodes.ruReference_Red and nodes.ruReference_Blue,"Opening one reader removed another seat")
local before=RuReferenceCache.Red.section
ruChangeSection(blue,nil,"ruTab_equipment_Red")
assert(RuReferenceCache.Red.section==before,"Cross-seat callback accepted")
ruCloseReference(red,nil,"ruClose_Red")
assert(not nodes.ruReference_Red and nodes.ruReference_Blue,"Closing reader removed another seat")
ruOpenReference(red,nil,"ruOpen_team_Red");onOperativeRandomize({operative(h),"Red"})
assert(RuReferenceCache.Red.team=="hierotekcircle" and nodes.ruReference_Red)
ruSearchReference(red,"РЕАНИМАЦ","ruSearch_Red")
assert(#RuReferenceCache.Red.visible>0,"New operative kept old team references")
PreviewXml=UI.getXmlTable()
local scenarios=14
local profiles=0
for _,model in ipairs(${lit(models)}) do
 ruRememberOperative("Yellow",model.state,operative(model))
 assert(RuReferenceCache.Yellow.currentEdition,"Current pack lacks team metadata")
 for _,weapon in ipairs(model.state.info.weapons or {}) do
  local wr=weapon.stats.WR or ""
  if wr~="" and wr~="-" and wr~="—" then
   local selected=ruRulesForProfile("Yellow",{name=weapon.name,wr=wr})
   local expected=0;for token in (wr..","):gmatch("(.-),") do if token:match("%S") then expected=expected+1 end end
   assert(#selected==expected,model.state.info.name.." / "..weapon.name.." / "..wr..": expected "..expected..", found "..#selected)
  end
  profiles=profiles+1
 end
end
for _,model in ipairs(${lit(reps)}) do
 onOperativeRandomize({operative(model),"Red"})
 assert(RuReferenceCache.Red.team,"Team metadata unavailable")
 for _,section in ipairs({"model","team","ploy","equipment","faq","weapon"}) do
  ruOpenReference(red,nil,"ruOpen_"..section.."_Red")
  assert(nodes.ruDetail_Red and nodes.ruList_Red)
  if section=="team" or section=="ploy" or section=="equipment" then assert(#RuReferenceCache.Red.visible>0,model.state.info.ktRuTeam.." empty "..section) end
  scenarios=scenarios+1
 end
end
-- Old scenario operatives keep their own edition of common rules.
local legacy={name="Scenario model",description="Weapons\\nR Old weapon\\nATK 3 HIT 4+ DMG 2/3\\nWR Blast 2\\n---",state={stats={},info={name="Legacy",categories={"Legionary"},abilities={},actions={},rules={Blast="Старая редакция: проверка источника"}}}}
onOperativeRandomize({operative(legacy),"Red"})
assert(ruWeaponTooltip("Red",{name="Old weapon",wr="Blast 2"}):find("Старая редакция",1,true),"Legacy rule edition overwritten")
assert(not ruWeaponTooltip("Red",{name="Old weapon",wr="Backblast"}):find("Старая редакция",1,true),"Substring trait match")
WeaponCache.Blue.weapons={{name="Test",wr="Seek Light"}}
ruOpenWeaponReference(blue,nil,"ruWeapon_1_Blue")
assert(#RuReferenceCache.Blue.visible==1 and RuReferenceCache.Blue.visible[1].english=="Seek Light","Seek duplicated under Seek Light")
UI.loading=true
onOperativeRandomize({operative(p),"Red"});onOperativeRandomize({operative(h),"Red"})
assert(not RuReferenceCache.Red.currentEdition,"Operative changed before UI readiness")
ready();assert(RuReferenceCache.Red.team=="hierotekcircle","Deferred rapid model selection used stale model")
ruCloseReference(red,nil,"ruClose_Red")
UI.loading=true;ruOpenReference(red,nil,"ruOpen_team_Red")
assert(not nodes.ruReference_Red,"Reader replaced stale UI while loading")
ready();assert(nodes.ruReference_Red,"Queued reader failed to render")
ruChangeSection(red,nil,"ruTab_equipment_Red")
ruSearchReference(red,"ДЫМОВАЯ","ruSearch_Red")
assert(#RuReferenceCache.Red.visible>0 and visibleText("ruDetail_Red"):find("Smoke",1,true),"Universal equipment reverse omitted")
return scenarios,profiles
`;
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
const script=driver+'\n'+hud+'\n'+scenarios;
fs.writeFileSync('tmp/reference-hud-test.lua',script);
if(process.argv.includes('--emit-only')){console.log('Emitted tmp/reference-hud-test.lua');process.exit(0);}
const status=lauxlib.luaL_dostring(L,to_luastring(script));
if(status!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tolstring(L,-1)));
const result={passed:true,interactionScenarios:lua.lua_tointeger(L,-2),weaponProfilesExercised:lua.lua_tointeger(L,-1),teamsExercised:41,profileSpecificTooltips:true,cyrillicSearch:true,perSeatIsolation:true,legacyRuleEditionPreserved:true,mainHUDPreserved:true,nativeTTSRuntimeTested:false};
function value(index){index=lua.lua_absindex(L,index);const kind=lua.lua_type(L,index);if(kind===lua.LUA_TSTRING)return to_jsstring(lua.lua_tolstring(L,index));if(kind===lua.LUA_TNUMBER)return lua.lua_tonumber(L,index);if(kind===lua.LUA_TBOOLEAN)return !!lua.lua_toboolean(L,index);if(kind===lua.LUA_TTABLE){const out={};lua.lua_pushnil(L);while(lua.lua_next(L,index)){const k=value(-2);out[k]=value(-1);lua.lua_pop(L,1);}const keys=Object.keys(out);return keys.length&&keys.every(k=>/^\d+$/.test(k))?keys.sort((a,b)=>a-b).map(k=>out[k]):out;}return null;}
assert(lua.lua_checkstack(L,2048));lua.lua_getglobal(L,to_luastring('PreviewXml'));fs.writeFileSync('output/reference-hud-preview-xml.json',JSON.stringify(value(-1),null,2));lua.lua_pop(L,1);
fs.writeFileSync('output/reference-hud-verification.json',JSON.stringify(result,null,2));console.log(result);
