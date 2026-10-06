const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const {parseSource}=require('./lua-display.cjs');
const lit=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v==='number'?String(v):typeof v==='boolean'?(v?'true':'false'):Array.isArray(v)?'{'+v.map(lit).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+lit(k)+']='+lit(x)).join(',')+'}';
const library=JSON.parse(fs.readFileSync('output/reference-hud-library.json'));
const catalog=JSON.parse(fs.readFileSync('output/assistant-demo-data.json')).catalog;
catalog.actions.mission={name:'Особое / миссионное действие',english:'Mission action',cost:1};
catalog.actions.charge={name:'Натиск',english:'Charge',cost:1,engage:true,excludes:['reposition','dash','fallback']};
catalog.actions.reposition.excludes=['fallback','charge'];catalog.actions.fallback.excludes=['reposition','charge'];catalog.actions.dash.excludes=['charge'];
for(const [team,t] of Object.entries(library.teams))for(const e of t.entries.filter(e=>e.category==='ploy')){
 const structured=Object.values(catalog.ploys).find(p=>p.team===team&&p.english===e.english);if(structured)continue;
 const id=team+':'+e.id;catalog.ploys[id]={id,team,name:e.title,english:e.english,cost:1,limit:'round',phase:e.ployType==='strategy'?'gambit':'firefight',effect:'Условия и эффект: '+e.title,expiry:'manual',generic:true,fullText:e.text};
}
const teams=Object.fromEntries(Object.entries(library.teams).map(([k,t])=>[k,{name:t.name,label:t.label}]));
const names=Object.assign({},...['ru-display-names.json','ru-hud-additional-display-names.json','ru-hud-display-names-complete.json'].map(p=>JSON.parse(fs.readFileSync(p))));
const metadata='RuAssistantCatalog='+lit(catalog)+'\nRuAssistantTeams='+lit(teams)+'\nRuAssistantNames='+lit(names)+'\n';
fs.writeFileSync('output/assistant-runtime-metadata.lua',metadata);
const installed='C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json';
const before=fs.readFileSync(installed),table=JSON.parse(before);const board=table.ObjectStates.find(o=>o.GUID==='339b7f'),hud=table.ObjectStates.find(o=>o.GUID==='efa3fe');assert(board&&hud);
const base=board.LuaScript;assert(!base.includes('RuAssistantEngine=nil'),'Base already contains runtime; use recorded pre-assistant file');
board.LuaScript=base.replace(/return __bundle_require\("Scoreboard\.339b7f\.lua"\)\s*$/,'__bundle_require("Scoreboard.339b7f.lua")')+'\n'+metadata+'\n'+fs.readFileSync('assistant-core.lua','utf8')+'\n'+fs.readFileSync('assistant-scoreboard-adapter.lua','utf8')+'\n'+fs.readFileSync('assistant-runtime.lua','utf8');
const profilePatch=`local matched=ruMatchTrait(wr,entry.english)
        -- Preserve saved legacy definitions; fill missing traits from the KT3 glossary.
        if not ctx.currentEdition then
            for _,saved in ipairs(ruCustomRules(ctx)) do if ruKey(ruRuleName(saved.name))==ruKey(entry.english) then matched=false;break end end
        end`;
assert(hud.LuaScript.includes('local matched=ctx.currentEdition and ruMatchTrait(wr,entry.english)'));
hud.LuaScript=hud.LuaScript.replace('local matched=ctx.currentEdition and ruMatchTrait(wr,entry.english)',profilePatch);
hud.LuaScript=hud.LuaScript.replace('local candidate=part:gsub',`part=part:gsub("^rng%s*%((%d+)%)",'range %1"'):gsub("^rng%s+", "range ")
        local candidate=part:gsub`);
hud.LuaScript=hud.LuaScript.replace('if ctx.currentEdition then for _,x in ipairs(ruReferenceCommon) do table.insert(items,ruCopy(x)) end end','for _,x in ipairs(ruReferenceCommon) do local savedMatch=false;if not ctx.currentEdition then for _,saved in ipairs(ruCustomRules(ctx)) do if ruKey(ruRuleName(saved.name))==ruKey(x.english) then savedMatch=true end end end;if not savedMatch then table.insert(items,ruCopy(x)) end end');
hud.LuaScript+='\n'+fs.readFileSync('assistant-reader-bridge.lua','utf8');
parseSource(board.LuaScript);parseSource(hud.LuaScript);
fs.writeFileSync('output/KT24-The-Killzone-RU-assistant-candidate.json',JSON.stringify(table,null,2));fs.writeFileSync('output/assistant-scoreboard-installed-candidate.lua',board.LuaScript);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync('output/assistant-runtime-build.json',JSON.stringify({status:'candidate',sourceSHA256:hash(before),candidateSHA256:hash(fs.readFileSync('output/KT24-The-Killzone-RU-assistant-candidate.json')),changedObjects:['339b7f','efa3fe'],teams:Object.keys(teams).length,ploys:Object.keys(catalog.ploys).length,structuredPloys:Object.values(catalog.ploys).filter(x=>!x.generic).length,nativeUIRendered:false},null,2));
console.log({teams:Object.keys(teams).length,ploys:Object.keys(catalog.ploys).length,candidate:true});
