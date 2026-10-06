// One self-contained, offline reference reader; rules come from the reviewed card definitions.
const fs=require('fs'),assert=require('assert');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const key=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const trait=s=>String(s||'').trim().replace(/^\d+"\s+/,'').replace(/^\*/,'').replace(/\*$/,'').replace(/\s*\([^)]*\)\s*$/,'').replace(/\s+(?:\d+[+"″]?|x[+]?)$/i,'').trim();
const literal=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v!=='object'?String(v):Array.isArray(v)?'{'+v.map(literal).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+literal(k)+']='+literal(x)).join(',')+'}';
const escaped=s=>String(s||'').replace(/\*\*/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows=value=>Array.isArray(value)?value.map(row=>Array.isArray(row)?row.join(' · '):typeof row==='object'?Object.values(row).join(' · '):row).join('\n'):'';
function body(c){
 const isPloy=/PLOY/.test(c.categoryEnglish||'');
 const weapons=(c.weapons||[]).map(w=>'<b>'+escaped(w.russian||w.english)+'</b> · ATK '+w.atk+' · HIT '+w.hit+' · DMG '+w.dmg+'\n'+escaped(w.wrRussian||'')).join('\n\n');
 const blocks=(c.blocks||[]).map(b=>{let heading=b.headingRussian||b.headingEnglish||'';if(isPloy&&(b.headingEnglish===c.titleEnglish||heading==='Правило'))heading='Эффект';return '<b>'+escaped(heading)+'</b>\n'+escaped(b.russian||'')+(b.fullRULegend?'\n\n'+escaped(b.fullRULegend):'')+(b.rowsRussian?'\n'+escaped(rows(b.rowsRussian)):'');}).join('\n\n');
 return weapons+(weapons?'\n\n':'')+blocks+(c.rowsRussian?'\n\n'+escaped(rows(c.rowsRussian)):'')+(c.flavorRussian?'\n\n<b>Описание</b>\n'+escaped(c.flavorRussian):'');
}
module.exports=function extend(hud,pack){
 const cards=read('ru-images-all-reviewed.json'),assets=read('inventory/card-assets.json'),supp=read('inventory/supplement-card-manifest.json'),names=read('ru-team-names.json'),rules=read('ru-current-weapon-rules.json');
 const roots=pack.ObjectStates.flatMap(x=>[x,...Object.values(x.States||{})]),teams={};
 for(const root of roots){
  if(!root.Nickname || !Object.hasOwn(names,root.Nickname))continue;
  const ids=new Set(assets.filter(x=>x.source==='teams'&&key(x.team)===key(root.Nickname)).flatMap(x=>[x.face?.id,x.back?.id]));
  for(const x of supp)if(key(x.team)===key(root.Nickname))ids.add(x.id);
  const all=[...ids].map(id=>cards[id]).filter(Boolean),traitKeys=new Set(all.flatMap(c=>(c.weapons||[]).flatMap(w=>(w.wrEnglish||'').split(','))).map(x=>key(trait(x))));
  const namedRules={};
  for(const c of all)for(const b of c.blocks||[]){const name=String(b.headingEnglish||'').replace(/\s*·.*$/,'').replace(/^\*|\*$/g,'').replace(/\s*\(weapon rule\)\s*$/i,'').trim();
   if(b.russian&&traitKeys.has(key(trait(name)))&&!Object.keys(rules).some(x=>key(x)===key(trait(name))))namedRules[trait(name)]=b.russian;
  }
  const entries=[];
  for(const id of ids){const c=cards[id];if(!c||c.stats||c.decorativeSource||/CARD BACK|DECK BACK|TEAM TITLE/.test(c.categoryEnglish||''))continue;
   const text=body(c);if(!text.trim())continue;
   // These four original card labels say FACTION RULE; current rules place them under Strategy Ploys.
   // Verified 2026-10-05: https://wahapedia.ru/kill-team3/kill-teams/corsair-voidscarred/#Strategy-Ploys
   const corsairStrategy=key(root.Nickname)==='corsairvoidscarred'&&['Plunderers','Outcasts','Mobile Engagement','Piratical Profiteers'].includes(c.titleEnglish);
   const category=corsairStrategy||/PLOY/.test(c.categoryEnglish)?'ploy':/EQUIP/.test(c.categoryEnglish)?'equipment':/COMMENTARY|FAQ/.test(c.categoryEnglish)?'faq':'team';
   entries.push({id,title:c.titleRussian||c.titleEnglish,english:c.titleEnglish||'',category,ployType:category==='ploy'?(corsairStrategy||/STRATEGY PLOY/.test(c.categoryEnglish)?'strategy':'firefight'):undefined,text,subtitle:corsairStrategy?'Корсары · Стратегическая уловка (Strategy Ploy)':c.categoryRussian||'',search:(c.titleRussian||'')+' '+(c.titleEnglish||'')+' '+text});
  }
  // Card backs and targeting diagrams are continuations of one ploy, not separately usable ploys.
  const merged=[];for(const e of entries){const name=e.english.split(' · ')[0];const prior=e.category==='ploy'&&merged.find(x=>x.category==='ploy'&&x.english===name);if(prior){prior.text+='\n\n'+e.text;prior.search+=' '+e.search;}else merged.push(e);}
  entries.splice(0,entries.length,...merged);
  assert.equal(entries.filter(e=>e.category==='ploy'&&e.ployType==='strategy').length,4,root.Nickname+' strategy ploys');
  assert.equal(entries.filter(e=>e.category==='ploy'&&e.ployType==='firefight').length,4,root.Nickname+' firefight ploys');
  assert(entries.length,root.Nickname);teams[key(root.Nickname)]={name:root.Nickname,label:(names[root.Nickname]||root.Nickname)+' ('+root.Nickname+')',entries,rules:namedRules};
 }
 assert.equal(Object.keys(teams).length,41);
 const ruleVariants=new Map();
 for(const t of Object.values(teams))for(const [name,text]of Object.entries(t.rules)){const id=key(name);if(!ruleVariants.has(id))ruleVariants.set(id,new Map());ruleVariants.get(id).set(text,{name,text});}
 const sharedRules={};for(const variants of ruleVariants.values())if(variants.size===1){const value=[...variants.values()][0];sharedRules[value.name]=value.text;}
 const common=Object.entries(rules).map(([name,x])=>({id:name,title:x.russian.split(':')[0],english:name,category:'weapon',text:escaped(x.russian),subtitle:'Общее правило оружия',search:name+' '+x.russian}));
 const equipment=Object.values(cards).filter(c=>c.kind==='atlas'&&c.titleEnglish==='Universal Equipment').flatMap(c=>Object.values(c.tiles));
 const backs=Object.values(cards).filter(c=>c.kind==='atlas'&&c.titleEnglish==='Universal Equipment — reverse').flatMap(c=>Object.values(c.tiles));
 const universal=equipment.map((c,i)=>({id:'universal-'+i,title:c.titleRussian,english:c.titleEnglish,category:'equipment',text:body(c),subtitle:'Универсальное снаряжение'}));
 for(const c of backs){const target=universal.find(e=>/Portable Barricade/.test(c.titleEnglish)?/Portable Barricade/.test(e.english):c.titleEnglish==='Smoke Grenade'&&e.english==='Utility Grenades');assert(target);target.text+='\n\n'+body(c);}
 assert.equal(universal.length,10);
 let source=fs.readFileSync('reference-hud.lua','utf8').replace('--@TEAM_LIBRARY@','local ruReferenceTeams = '+literal(teams)).replace('--@COMMON_RULES@','local ruReferenceCommon = '+literal(common)).replace('--@UNIVERSAL_EQUIPMENT@','local ruReferenceEquipment = '+literal(universal)).replace('--@SHARED_NAMED_RULES@','local ruReferenceShared = '+literal(sharedRules));
 const replace=(a,b)=>{assert.equal(hud.LuaScript.split(a).length-1,1,a);hud.LuaScript=hud.LuaScript.replace(a,b);};
 replace('    -- Stats Panel','    table.insert(children, ruBuildReferenceLauncher(suffix, bodyWidth))\n\n    -- Stats Panel');
 replace('        local objState = operative.getTable(\'state\') or {}',"        local objState = operative.getTable('state') or {}\n        ruRememberOperative(playerColor, objState, operative)\n        local ruContext = RuReferenceCache[playerColor]");
 replace('    if operative and operative.hasTag("Operative") then','    if ruDeferOperative(params) then return end\n    if operative and operative.hasTag("Operative") then');
 replace('safeSetAttribute("weaponWRText"..suffix, "tooltip", rulesReference, playerColor)','safeSetAttribute("weaponWRText"..suffix, "tooltip", ruWeaponTooltip(playerColor, w), playerColor)\n                safeSetAttribute("ruWeapon"..suffix, "tooltip", ruWeaponTooltip(playerColor, w), playerColor)');
 // Separate sibling buttons receive reference clicks without triggering the weapon attack Button.
 const anchor='{id="weaponWRText"..suffix, text=" ", fontSize="15", fontStyle="Bold", color="#000000", alignment="MiddleLeft", position="10 0 0"}';
 replace(anchor,'{id="weaponWRText"..suffix, text=" ", width="162", fontSize="15", fontStyle="Bold", color="#000000", alignment="MiddleLeft", position="10 0 0", horizontalOverflow="Wrap", tooltipFontSize="17", tooltipBackgroundColor="#191b1c", tooltipTextColor="#ffffff"}');
 replace('    -- Bottom Separator','    for i=1,weaponCount do table.insert(children, ruBuildWeaponReferenceButton(suffix,i,bodyWidth,weaponsPanelHeight,-(90+weaponsPanelHeight*(i-1)))) end\n\n    -- Bottom Separator');
 replace('        Wait.time(function()', '        Wait.condition(function()\n            if RuReferenceCache[playerColor] ~= ruContext then return end');
 replace('        end, 0.05)', '            if RuReferenceCache[playerColor] and RuReferenceCache[playerColor].open then ruRenderReference(playerColor) end\n        end, function() return not UI.loading end)');
 // The UI API is global; the original second "player" arguments were actually mistaken custom-assets arguments.
 hud.LuaScript=hud.LuaScript.replace(/UI\.getXmlTable\((?:\{player=(?:playerColor|player)\}|player\.color)\)/g,'UI.getXmlTable()')
  .replace(/UI\.setXmlTable\((filtered|\{\}), (?:\{player=(?:playerColor|player|color)\}|player\.color)\)/g,'UI.setXmlTable($1)')
  .replace('UI.setAttribute(id, attr, value, {player=playerColor})','UI.setAttribute(id, attr, value)');
 // Compact R cards reserve the measured bilingual header before their scroll viewport.
 const gridStart=hud.LuaScript.indexOf('    -- Abilities and Actions Grid');
 const gridEnd=hud.LuaScript.indexOf('    table.insert(children, buildAbilitiesAndActionsGrid(',gridStart);
 assert(gridStart>=0 && gridEnd>gridStart,'Compact rule grid anchor missing');
 hud.LuaScript=hud.LuaScript.slice(0,gridStart)+`    -- Abilities and Actions Grid
    local function buildAbilitiesAndActionsGrid(...)
        return ruBuildCompactRuleGrid(...)
    end

`+hud.LuaScript.slice(gridEnd);
 for(const [prefix,item]of [['ability','a'],['action','act']]){
  const anchor=`safeSetAttribute("${prefix}NameText"..suffix, "text", ruDisplayName(${item}.name), playerColor)`;
  assert.equal(hud.LuaScript.split(anchor).length-1,2,'Compact title update count');
  hud.LuaScript=hud.LuaScript.split(anchor).join(`ruSetCompactRuleTitle("${prefix}", suffix, ${item}.name, playerColor)`);
 }
 const rich=fs.readFileSync('rich-rule-reader.lua','utf8').replace('--@CORE_GLOSSARY@','local ruCoreGlossary = '+literal(require('./ru-core-glossary.cjs'))).replace('--@FONT_METRICS@','local ruFontMetrics = '+literal(read('ui-font-metrics.json')));
 hud.LuaScript+='\n'+source+'\n'+rich+'\n'+fs.readFileSync('ploy-panel.lua','utf8');
 replace('function onLoad()','function onLoad(saved)\n    ruLoadPloys(saved)');
 fs.writeFileSync('output/reference-hud-library.json',JSON.stringify({teams,common,universal},null,2));
 return {teams:Object.keys(teams).length,teamEntries:Object.values(teams).reduce((n,t)=>n+t.entries.length,0),commonWeaponRules:common.length,universalEquipment:universal.length,profileSpecificTooltips:true,perPlayerReader:true};
};
