const fs=require('fs'),assert=require('assert');
const installed=process.argv.includes('--installed');
const hudFile=installed?'C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json':'output/KT24-The-Killzone-RU-'+(process.argv.includes('--working')?'working':'preview-3')+'.json';
const hud=JSON.parse(fs.readFileSync(hudFile)).ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript;
const models=[];function scan(x){if(!x||typeof x!=='object')return;if(x.LuaScriptState){const state=JSON.parse(x.LuaScriptState);if(state.info)models.push({name:x.Nickname,description:x.Description,state});}Object.values(x).forEach(scan);}
scan(JSON.parse(fs.readFileSync('output/KT41-RU-working.json')));
const literal=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v!=='object'?String(v):Array.isArray(v)?'{'+v.map(literal).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+literal(k)+']='+literal(x)).join(',')+'}';
const driver=fs.readFileSync('check-reference-hud.cjs','utf8').match(/const driver=`([\s\S]*?)`;/)[1];
const cases=`
local models=${literal(models)}
local tested,cards=0,0
local function top(a) return -tonumber(a.offsetXY:match(' ([^ ]+)$')) end
local sample
for _,model in ipairs(models) do
 onOperativeRandomize({operative(model),'Red'})
 local cache=AbilityActionCache.Red
 local grid=nodes.abilitiesAndActionsMain_Red
 local rectangles={}
 for _,prefix in ipairs({'ability','action'}) do
  for i,entry in ipairs(prefix=='ability' and cache.abilities or cache.actions) do
   local suffix='_'..i..'_Red';local parent=attrs('datasheetHUD_'..(prefix=='ability' and 'abilities' or 'actions')..suffix)
   local title=attrs(prefix..'NameText'..suffix);local english=attrs(prefix..'EnglishText'..suffix);local scroll=attrs(prefix..'Scroll'..suffix);local body=attrs(prefix..'DescriptionText'..suffix)
   local display=ruDisplayName(entry.name);local russian,original=display,'';if display~=entry.name then russian,original=ruSplitTitle(display) end
   assert(title.text==russian and english.text==original,'Bilingual header mismatch: '..entry.name)
   assert(top(english)>=top(title)+tonumber(title.height)+4,'English title overlaps Russian title: '..entry.name)
   assert(top(scroll)>=top(english)+tonumber(english.height)+10,'Description overlaps header: '..entry.name)
   assert(top(scroll)+tonumber(scroll.height)<=tonumber(parent.height)-8,'Viewport exceeds card: '..entry.name)
   assert(tonumber(body.height)>=tonumber(scroll.height) and tonumber(body.width)<=tonumber(parent.width)-30,'Invalid scroll content: '..entry.name)
   assert(body.text==entry.description,'Incomplete description: '..entry.name)
   assert(body.tooltip=='Полное правило:\\nкнопка «Способности» над карточкой','Oversized body tooltip: '..entry.name)
   assert(body.fontStyle=='Normal','Body is entirely bold')
   assert(scroll.verticalScrollbarVisibility=='Permanent','Missing scrollbar')
   assert(scroll.horizontal=='false' and scroll.horizontalScrollbarVisibility=='AutoHide','Horizontal scrollbar enabled')
   assert(scroll.color=='#00000000','Opaque default scroll background')
   assert(tonumber(body.width)<=tonumber(scroll.width)-tonumber(scroll.verticalScrollbarWidth)-8,'Content clips under vertical scrollbar')
   local x=tonumber(parent.offsetXY:match('^([^ ]+)'));local y=top(parent)
   local rect={x=x,y=y,w=tonumber(parent.width),h=tonumber(parent.height)}
   for _,other in ipairs(rectangles) do assert(rect.x>=other.x+other.w or other.x>=rect.x+rect.w or rect.y>=other.y+other.h or other.y>=rect.y+rect.h,'Compact cards overlap') end
   assert(y+rect.h<=tonumber(grid.attributes.height),'Card outside grid');table.insert(rectangles,rect)
   if entry.name=='Unnatural Regeneration' then sample=model end
   cards=cards+1
  end
 end
 tested=tested+1
end
assert(sample,'Screenshot example absent')
onOperativeRandomize({operative(sample),'Red'})
PreviewCompactXml={nodes.abilitiesAndActionsMain_Red}
-- Stress both a narrow column and a full-width odd row with a long action and AP label.
AbilityActionCache.Red={abilities={{name='Чрезвычайно длинное название способности, которое должно переноситься в несколько строк (An exceptionally long ability name that needs multiple lines)',description=string.rep('Длинное описание правила. ',80)}},actions={{name='Очень длинное название действия, которое переносится в несколько строк (An exceptionally long action name)',description='Полный текст действия.',apCost='1/2AP'},{name='Последнее действие (Last action)',description='Полный текст.',apCost='1AP'}}}
local stress=ruBuildCompactRuleGrid('_Red',600,'#cccccc','#ff8800',50,-100,1,2)
UI.setXmlTable({stress});local first=attrs('datasheetHUD_abilities_1_Red');local second=attrs('datasheetHUD_actions_1_Red');local third=attrs('datasheetHUD_actions_2_Red')
assert(tonumber(third.width)==598,'Odd row does not span available width')
assert(top(third)>=math.max(tonumber(first.height),tonumber(second.height))+2,'Long header overlaps next row')
assert(tonumber(attrs('actionNameText_1_Red').width)+62<=tonumber(second.width)-24,'AP cost overlaps title')
assert(attrs('actionAPCostText_1_Red').text=='1/2AP','AP cost lost')
local russian,original=ruSplitTitle('Синаптическая связь (Synaptic Link (Strategic Gambit))')
assert(russian=='Синаптическая связь' and original=='Synaptic Link (Strategic Gambit)','Nested English qualifier lost')
for _,raw in ipairs({'Synaptic Link (Strategic Gambit)','Disciplinarian (Support)'}) do
 AbilityActionCache.Red={abilities={{name=raw,description='Полный текст.'}},actions={}}
 local panel=ruBuildCompactRulePanel('ability','_1_Red',298,'#cccccc',nil,50);UI.setXmlTable({panel})
 assert(attrs('abilityNameText_1_Red').text==raw and attrs('abilityEnglishText_1_Red').text=='','Untranslated parenthetical title lost: '..raw)
 ruSetCompactRuleTitle('ability','_1_Red',raw,'Red');assert(attrs('abilityNameText_1_Red').text==raw,'Title setter lost qualifier: '..raw)
end
return tested,cards
`;
fs.writeFileSync('tmp/compact-rules-test.lua',driver+'\n'+hud+'\n'+cases);
console.log({fixture:'tmp/compact-rules-test.lua',models:models.length,hudFile});
