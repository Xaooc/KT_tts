const fs=require('fs'),assert=require('assert');
const installed=process.argv.includes('--installed');
const tableFile=process.argv.includes('--candidate')?'output/KT24-The-Killzone-RU-assistant-candidate.json':installed?'C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json':'output/KT24-The-Killzone-RU-'+(process.argv.includes('--working')?'working':'preview-3')+'.json';
const hud=JSON.parse(fs.readFileSync(tableFile)).ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript;
const models=[],seen=new Set();
const inches=n=>{const last=n%10,lastTwo=n%100;return n+' '+(lastTwo>=11&&lastTwo<=14?'дюймов':last===1?'дюйм':last>=2&&last<=4?'дюйма':'дюймов');};
const normalize=s=>s.replace(/\*\*/g,'').replace(/(\d+)\s+([1236])&&/g,(_,n,u)=>inches(Number(n)*Number(u))).replace(/([1236])&&/g,(_,n)=>inches(Number(n)));
function bodies(info){const out=new Set();function visit(x){if(!x||typeof x!=='object')return;if(typeof x.text==='string'&&x.text)out.add(normalize(x.text));Object.values(x).forEach(visit);}for(const key of ['abilities','actions','special','psychic'])visit(info[key]);return [...out];}
function scan(x){if(!x||typeof x!=='object')return;if(x.LuaScriptState){const state=JSON.parse(x.LuaScriptState);if(state.info){const key=JSON.stringify([x.Nickname,x.Description,state]);if(!seen.has(key)){seen.add(key);models.push({name:x.Nickname,description:x.Description,state,expected:bodies(state.info)});}}}Object.values(x).forEach(scan);}
scan(JSON.parse(fs.readFileSync('output/KT41-RU-working.json')));
scan(JSON.parse(fs.readFileSync('C:/Users/PC/Documents/My Games/Tabletop Simulator/Saves/Saved Objects/KT41-RU.json')));
const literal=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v!=='object'?String(v):Array.isArray(v)?'{'+v.map(literal).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+literal(k)+']='+literal(x)).join(',')+'}';
const driver=fs.readFileSync('check-reference-hud.cjs','utf8').match(/const driver=`([\s\S]*?)`;/)[1];
const cases=`
local models=${literal(models)}
local modelCount,bodyCount=0,0
local function text(node) local s=(node.tag=='Text' or node.tag=='Button') and (node.attributes.text or '') or '';for _,child in ipairs(node.children or {}) do s=s..text(child) end;return s end
local function withoutSpaces(s) local pieces={};for i=1,#s do local c=s:sub(i,i);if c~=' ' and c~='\\t' and c~='\\n' and c~='\\r' then table.insert(pieces,c) end end;return table.concat(pieces) end
for _,model in ipairs(models) do
 local object=operative(model)
 ruRememberOperative('Red',model.state,object)
 local ctx=RuReferenceCache.Red
 for _,expected in ipairs(model.expected) do
  local found
  for _,entry in ipairs(ctx.entries) do if ruPlain(entry.text)==expected then found=entry;break end end
  assert(found,'Source body changed: '..model.name..' / '..expected:sub(1,90))
  -- Check the actual painted reader nodes against source text, not the transformed input.
  local article=ruArticle('ref','Red',ctx,found.title,found.subtitle,found.text,'integrityBody',668,found.english,true)
  local body;for _,node in ipairs(article.children) do if node.attributes.id=='integrityBody' then body=node end end
  assert(withoutSpaces(text(body))==withoutSpaces(expected),'Painted body differs from source: '..model.name)
  bodyCount=bodyCount+1
 end
 modelCount=modelCount+1
end
local mindwitch
for _,model in ipairs(models) do if model.state.info.name=='Mindwitch' and model.state.info.ktRuTeam then mindwitch=model;break end end
assert(mindwitch,'Mindwitch example absent')
onOperativeRandomize({operative(mindwitch),'Red'})
ruOpenReference({color='Red'},nil,'ruOpen_model_Red')
PreviewReaderIntegrityXml=UI.getXmlTable()
local function styles(node)
 if node.tag=='VerticalScrollView' then
  local a=node.attributes;assert(a.horizontal=='false' and a.vertical=='true' and a.horizontalScrollbarVisibility=='AutoHide','Horizontal scrolling in reader');assert(a.color=='#00000000','Default gray scroll background')
  assert(a.horizontalScrollbarHeight=='0' and a.verticalScrollbarWidth=='14','Scrollbar geometry missing')
  for _,child in ipairs(node.children or {}) do if child.attributes.width then assert(tonumber(child.attributes.width)<=tonumber(a.width)-14,'Content wider than native viewport') else for _,item in ipairs(child.children or {}) do assert(tonumber(item.attributes.width)<=tonumber(a.width)-14,'List item wider than native viewport') end end end
 end
 for _,child in ipairs(node.children or {}) do styles(child) end
end
for _,node in ipairs(UI.getXmlTable()) do styles(node) end
return modelCount,bodyCount
`;
fs.writeFileSync('tmp/reader-integrity-test.lua',driver+'\n'+hud+'\n'+cases);
console.log({fixture:'tmp/reader-integrity-test.lua',models:models.length,tableFile});
