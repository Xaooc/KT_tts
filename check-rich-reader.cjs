const fs=require('fs'),assert=require('assert');const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('./tools/node_modules/fengari');
const hudFile=process.argv.includes('--installed')?'C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json':'output/KT24-The-Killzone-RU-'+(process.argv.includes('--working')?'working':'preview-3')+'.json';
const hud=JSON.parse(fs.readFileSync(hudFile)).ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript;
const driver=fs.readFileSync('check-ploy-panel.cjs','utf8').match(/const driver=`([\s\S]*?)`;/)[1];
const cases=`
local setCount=0;local nativeSet=UI.setXmlTable;UI.setXmlTable=function(v) setCount=setCount+1;nativeSet(v) end
assert(ruPlain('<b>Для этого профиля: только Перемещение (Reposition).</b>')=='Для этого профиля: только Перемещение (Reposition).','Markup stripping lost Cyrillic text')
local alphabet='абвгдеёжзийклмнопрстуфхцчшщъыьэюя АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ <>& ЖЖЪЪ'
assert(ruPlain(ruEscape(alphabet))==alphabet,'XML escaping corrupts Cyrillic')
assert(ruEscape('<>&')=='&lt;&gt;&amp;','Literal XML escaping failed')
assert(ruCleanRuleText('ЖЖЪЪ бЦЦ вЦЦ гЦЦ жЦЦ')=='ЖЖЪЪ бЦЦ вЦЦ гЦЦ жЦЦ','Legacy formatting corrupts Cyrillic')
assert(ruCleanRuleText('**Тест**: 2 2&&, 3 2&&, 1&&, 2&&, 3&&, 6&&')=='Тест: 4 дюйма, 6 дюймов, 1 дюйм, 2 дюйма, 3 дюйма, 6 дюймов','Legacy distances failed')
assert(ruMatchTrait('Devastating 3','Devastating')=='devastating 3','WR parameter 3 corrupted by quote normalization')
assert(ruMatchTrait('Lethal 3+, Heavy (Dash only)','Lethal')=='lethal 3+','Lethal parameter corrupted')
local tooltip=ruWrapTooltip(string.rep('Полный текст правила оружия. ',80),60,18,'Полный текст — кнопка «?» у оружия.');local tipLines=0;for line in ruLines(tooltip) do assert(ruLength(line)<=60,'Tooltip wider than limit');tipLines=tipLines+1 end;assert(tipLines==19 and tooltip:find('Полный текст — кнопка «?» у оружия.',1,true),'Tooltip missing full-rule navigation')
for _,raw in ipairs({'Synaptic Link (Strategic Gambit)','Disciplinarian (Support)'}) do
 local nav=ruNavEntry('testNav',raw,raw,false,false,false,'test');local navText='';for _,panel in ipairs(nav.children) do for _,node in ipairs(panel.children or {}) do navText=navText..(node.attributes.text or '') end end;assert(navText==raw,'Untranslated navigation heading duplicated')
 local frame=ruReaderFrame('ref','Red',{currentEdition=true,open=true},raw,raw,'','Текст','duplicateBody','СПРАВОЧНИК',false)
 local headings='';for _,panel in ipairs(frame) do if panel.attributes.offsetXY=='300 -80' or panel.attributes.width=='692' then for _,node in ipairs(panel.children or {}) do headings=headings..(node.attributes.text or '') end end end
 assert(headings==raw,'Untranslated reader heading duplicated')
end
local psychic='Омерзительный поток (Heinous Deluge): психическое действие (Psychic). Выберите одного вражеского оперативника на линии обзора (Line of Sight) этого оперативника. Уменьшите его APL на 1. Это действие нельзя выполнять в пределах дистанции ближнего боя этого вражеского оперативника.'
assert(ruPlain(ruEscape(psychic))==psychic,'Mindwitch body changed during XML escaping')
assert(ruFold('1 CP. APL 3. Balanced. Заслонение.')=='1 cp. apl 3. balanced. заслонение.','Case folding changed punctuation or spaces')
local lineCount=0;for line in ruLines('a\\n\\nb\\n') do lineCount=lineCount+1 end;assert(lineCount==4,'Blank/trailing line lost')
local function chars(s) return ruPlain(s):gsub('%s','') end
local function text(n) local out='';if n.tag=='Text' or n.tag=='Button' then out=(n.attributes or {}).text or '' end;for _,c in ipairs(n.children or {}) do out=out..text(c) end;return out end
local tested,longest=0,0
local stress=string.rep('Длинное правило без переносов. ',160)..'1 CP.'
local stressCtx={currentEdition=true,open=true};local stressArticle=ruArticle('ply','Red',stressCtx,'Тест','','<b>Эффект</b>\\n'..stress,'stressBody')
local stressBody;for _,n in ipairs(stressArticle.children) do if n.attributes.id=='stressBody' then stressBody=n end end
assert(chars(text(stressBody))==chars('Эффект'..stress),'Long unbroken paragraph lost text')
for key,team in pairs(ruReferenceTeams) do for _,e in ipairs(team.entries) do if e.category=='ploy' then
 local ctx={team=key,currentEdition=true,open=true};local article,popups=ruArticle('ply','Red',ctx,e.title,e.subtitle,e.text,'body',648,e.english)
 local body;for _,n in ipairs(article.children) do if n.attributes.id=='body' then body=n end end
 assert(chars(text(body))==chars(e.text),key..' / '..e.english..' lost rule text')
 local endNode=article.children[#article.children];local y=-tonumber(endNode.attributes.offsetXY:match(' (-?%d+)$'));assert(y+25<=tonumber(article.attributes.height),'End marker outside content')
 for _,paragraph in ipairs(body.children) do for _,n in ipairs(paragraph.children) do local a=n.attributes;local x=tonumber(a.offsetXY:match('^([^ ]+)'));assert(x+tonumber(a.width)<=649.0001,key..' / '..e.english..' inline overflow '..tostring(x+tonumber(a.width))..' '..(a.text or '')) end end
 longest=math.max(longest,tonumber(article.attributes.height));tested=tested+1
end end end
assert(tested==328 and longest>524,'Long rules do not have scrollable content')
local ctx={team='hierotekcircle',currentEdition=true,open=true};local article,popups=ruArticle('ply','Red',ctx,'Тест','', '1 CP. APL 3. Balanced. Заслонение.','body')
UI.setXmlTable({article,table.unpack(popups)});local count=setCount;local doc=RuTermDocuments.ply_Red
local cp,balanced
for id,n in pairs(nodes) do if id:match('^ruTerm_') then if n.attributes.text=='CP' then cp=id end;if n.attributes.text=='Balanced' then balanced=id end end end
assert(cp and balanced,'Clickable CP/Balanced absent');assert(nodes[cp].attributes.fontStyle=='Bold')
nodes.bodyContent.attributes.testScroll='315';ruOpenTerm({color='Blue'},nil,cp);assert(not doc.open,'Cross-seat term click accepted')
ruOpenTerm({color='Red'},nil,balanced);assert(doc.open and doc.entries[doc.open].id=='weapon-Balanced');assert(nodes['ruTermPopup_ply_'..doc.revision..'_'..doc.open..'_Red'].attributes.active=='true')
ruCloseTerm({color='Red'},nil,'ruTermClose_ply_'..doc.revision..'_'..doc.open..'_Red');assert(setCount==count and nodes.bodyContent.attributes.testScroll=='315','Definition rebuilt reader tree')
UI.loading=true;ruOpenTerm({color='Red'},nil,cp);ctx.open=false;ready();assert(not doc.open,'Queued click reopened closed reader')
local newCtx={team='hierotekcircle',currentEdition=true,open=true};local newer,newPopups=ruArticle('ply','Red',newCtx,'Тест','','AP CP','body');UI.setXmlTable({newer,table.unpack(newPopups)});ruOpenTerm({color='Red'},nil,cp);assert(not RuTermDocuments.ply_Red.open,'Old render term ID accepted')
local spans=ruMatches('APL AP APC',ruCoreGlossary);local ap,apl=0,0;for _,s in ipairs(spans) do if s.entry then if s.entry.id=='core-ap' then ap=ap+1 end;if s.entry.id=='core-apl' then apl=apl+1 end end end;assert(ap==1 and apl==1,'AP boundary collision')
local merged=ruGlossary({currentEdition=true,entries={{title='Тест',english='Test',text='Часть один'},{title='Тест',english='Test',text='Часть два'},{title='Тест',english='Test',text='Часть один'}}})
local defs=0;for _,e in ipairs(merged) do if e.id=='model-Test' then defs=defs+1;assert(e.text:find('Часть один',1,true) and e.text:find('Часть два',1,true) and #e.variants==2) end end;assert(defs==1,'Ability variants lost or duplicated')
return tested,longest
`;
const script=driver+'\n'+hud+'\n'+cases;fs.writeFileSync('tmp/rich-reader-test.lua',script);
if(process.argv.includes('--emit-only')){console.log('Emitted tmp/rich-reader-test.lua');process.exit(0);}
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);const status=lauxlib.luaL_dostring(L,to_luastring(script));if(status!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tolstring(L,-1)));
const report={passed:true,ployArticles:lua.lua_tointeger(L,-2),longestContentHeight:lua.lua_tointeger(L,-1),fullTextPreserved:true,inlineBounds:true,clickableDefinitions:true,termOpeningPreservesTree:true,seatIsolation:true,staleCallbacksRejected:true,abilityVariantsCombined:true,nativeTTSRuntimeTested:false};fs.writeFileSync('output/rich-reader-verification.json',JSON.stringify(report,null,2));console.log(report);
