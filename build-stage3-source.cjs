const fs=require('fs'),path=require('path'),crypto=require('crypto');
const lua=require('./tools/node_modules/luaparse');
const out=path.join(__dirname,'output');
const teamSource=String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Saves\Saved Objects\Chaos Cult.json`;
const tableSource=path.join(out,'KT24-The-Killzone-RU-preview-1.json');
const originalWorkshop=String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Mods\Workshop\3573927734.json`;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const originalBytes=fs.readFileSync(teamSource),original=JSON.parse(originalBytes);
if(sha(originalBytes)!==JSON.parse(fs.readFileSync(path.join(out,'team-catalog.json'),'utf8')).sourceSHA256)throw new Error('Team source changed since inventory');
const tableBytes=fs.readFileSync(tableSource),table=JSON.parse(tableBytes);
const workshopHash=sha(fs.readFileSync(originalWorkshop));
if(workshopHash!==JSON.parse(fs.readFileSync(path.join(out,'validation.json'),'utf8')).sourceSHA256)throw new Error('Workshop source changed since preview 1');
const originalTable=JSON.parse(tableBytes);
const pack=JSON.parse(originalBytes);
const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-rule-texts.json'),'utf8'));
const prose=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-team-prose.json'),'utf8'));
const translations={...rules,...prose};
const currentProse=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-current-prose-overrides.json'),'utf8'));
const currentTeamKey=team=>team.toLowerCase().replace(/[^a-z0-9]/g,'');
const sourceSegments=JSON.parse(fs.readFileSync(path.join(__dirname,'inventory/prose-source.json'),'utf8'));
const expected=new Map(sourceSegments.map(x=>[x.id,x]));
for(const [id,text]of Object.entries(translations)){
  if(!expected.has(id))throw new Error('Unknown source segment '+id);
  if(typeof text!=='string'||!text.trim())throw new Error('Empty translation '+id);
}
const ruleSegments=sourceSegments.filter(x=>x.contexts.some(c=>c.category==='weapon-rule'));
if(ruleSegments.some(x=>!rules[x.id]))throw new Error('Missing weapon rule translation');
const audit={stage:'preview-3',runtimeTested:false,teamSource,teamSourceSHA256:sha(originalBytes),tableSource,tableSourceSHA256:sha(tableBytes),workshopSHA256:workshopHash,changes:[],teams:[],hudChanges:[]};
const ruTeamNames=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-team-names.json'),'utf8'));
const allowedStateLeaves=new Set();
const perTeam=new Map();
function translateLeaf(owner,key,loc,team,guid,category,title){
  const old=owner[key];if(typeof old!=='string'||!old.trim())return;
  const id=sha(old).slice(0,16),translated=currentProse[currentTeamKey(team)]?.[id]||translations[id];
  const record=perTeam.get(team);
  record.total++;record.ids.add(id);
  if(!translated)return;
  owner[key]=translated;allowedStateLeaves.add(loc);
  record.translated++;record.translatedIds.add(id);
  audit.changes.push({path:loc,id,team,guid,category,title});
}
function bodyWalk(v,loc,team,guid,category){if(!v||typeof v!=='object')return;
  for(const [key,x]of Object.entries(v)){
    if(typeof x==='string'&&['text','description','desc'].includes(key))translateLeaf(v,key,loc+'/'+key,team,guid,category,v.name||'');
    else if(x&&typeof x==='object')bodyWalk(x,loc+'/'+key,team,guid,category);
  }
}
function visitObjects(v,loc,team){if(!v||typeof v!=='object')return;
  if(v.LuaScriptState){const state=JSON.parse(v.LuaScriptState);
    if(state.info){
      const stateLoc=loc+'/LuaScriptState';
      for(const category of ['abilities','actions','psychic','special'])bodyWalk(state.info[category],stateLoc+'/info/'+category,team,v.GUID,category);
      for(const key of Object.keys(state.info.rules||{}))translateLeaf(state.info.rules,key,stateLoc+'/info/rules/'+key,team,v.GUID,'weapon-rule',key);
      if(audit.changes.some(x=>x.path.startsWith(stateLoc+'/')))v.LuaScriptState=JSON.stringify(state);
    }
  }
  for(const [key,x]of Object.entries(v))if(key!=='States'&&x&&typeof x==='object')visitObjects(x,loc+'/'+key,team);
}
function teamRoot(root,loc){const team=root.Nickname;if(!team){if(root.LuaScriptState||root.ContainedObjects?.length)throw new Error('Unexpected unnamed team contents '+loc);return;}perTeam.set(team,{name:team,total:0,translated:0,ids:new Set(),translatedIds:new Set()});visitObjects(root,loc,team);}
for(const [i,root]of pack.ObjectStates.entries()){
  teamRoot(root,'/ObjectStates/'+i);
  for(const [stateId,state]of Object.entries(root.States||{}))teamRoot(state,'/ObjectStates/'+i+'/States/'+stateId);
}
// Deep semantic verification, including JSON stored inside LuaScriptState strings.
const repairs=require("./repair-card-info.cjs")(pack);
audit.cardDataRepairs=repairs.changes;
const operativeCards=require('./sync-operative-cards.cjs')(pack);
for(const [key,value]of operativeCards.approved)repairs.approved.set(key,value);
audit.operativeCardSynchronization=operativeCards.changes;
const currentRepairs=require('./sync-current-models.cjs')(pack);
for(const [key,value]of currentRepairs.approved)repairs.approved.set(key,value);
audit.currentRuleModelChanges=currentRepairs.changes;
const nativeDescriptions=require('./localize-model-descriptions.cjs')(pack);
for(const [key,value]of nativeDescriptions.approved)repairs.approved.set(key,value);
audit.nativeModelDescriptions=nativeDescriptions.changes;
const tableProse=require('./localize-table-prose.cjs')(table);
const tableDescriptions=require('./localize-model-descriptions.cjs')(table);
audit.tableProseChanges=tableProse.changes;
function verifyState(a,b,loc){
  if(repairs.approved.has(loc)){if(JSON.stringify(b)!==repairs.approved.get(loc))throw new Error("Unapproved repair "+loc);return;}
  if(JSON.stringify(a)===JSON.stringify(b))return;
  if(allowedStateLeaves.has(loc)){if(typeof a!=='string'||typeof b!=='string')throw new Error('Wrong translation type '+loc);return;}
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')throw new Error('Unexpected state change '+loc);
  if(Array.isArray(a)!==Array.isArray(b)||Object.keys(a).join('|')!==Object.keys(b).join('|'))throw new Error('State topology changed '+loc);
  for(const key of Object.keys(a))verifyState(a[key],b[key],loc+'/'+key);
}
function verifyPack(a,b,loc){
  if(repairs.approved.has(loc)){if(JSON.stringify(b)!==repairs.approved.get(loc))throw new Error('Unapproved object repair '+loc);return;}
  if(JSON.stringify(a)===JSON.stringify(b))return;
  if(loc.endsWith('/LuaScriptState')){verifyState(JSON.parse(a),JSON.parse(b),loc);return;}
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')throw new Error('Unexpected object change '+loc);
  if(Array.isArray(a)!==Array.isArray(b)||Object.keys(a).join('|')!==Object.keys(b).join('|'))throw new Error('Object topology changed '+loc);
  for(const key of Object.keys(a))verifyPack(a[key],b[key],loc+'/'+key);
}
verifyPack(original,pack,'');
// Presentation-only distance conversion; the original shape tokens remain in stored rule bodies.
function inches(n){const last=n%10,lastTwo=n%100;return n+' '+(lastTwo>=11&&lastTwo<=14?'дюймов':last===1?'дюйм':last>=2&&last<=4?'дюйма':'дюймов');}
function readable(text){return text.replace(/\*\*/g,'').replace(/\b(\d+)\s+([1236])&&/g,(_,count,unit)=>inches(Number(count)*Number(unit))).replace(/([1236])&&/g,(_,unit)=>inches(Number(unit)));}
if(sourceSegments.some(x=>!translations[x.id]))throw Error("Incomplete saved prose");
const addedTabIds=new Set();
function addTab(title,body){const id=Math.max(-1,...Object.keys(table.TabStates).map(Number))+1;table.TabStates[String(id)]={title,body,color:'Grey',visibleColor:{r:0.5,g:0.5,b:0.5},id};addedTabIds.add(String(id));}
table.SaveName='KT24 The Killzone — русский перевод';
const aboutEntry=Object.entries(table.TabStates).find(([id,x])=>x.title==='RU — о переводе');
const aboutId=aboutEntry?.[0],about=aboutEntry?.[1];
if(!about)throw new Error('Missing existing translation notebook');
about.body='Русская сборка стола и 41 отряда. Карточки, описания моделей и справочники переведены в согласованном стиле. Характеристики сохраняют сокращения APL, MOVE, SAVE, WOUNDS, ATK, HIT, DMG и WR. Правила отрядов сверены с полными официальными документами и Wahapedia на 05.10.2026; зачёркнутые изменения не применяются. Материалы старых наборов миссий сохраняют собственную редакцию.\n\nДля чтения способностей выберите модель и нажмите R. Наведите мышь на способность, действие либо WR: подсказка содержит полный русский текст.\n\nЗагрузите набор KT41-RU вместе с русским столом. Изображения и PDF установлены в Mods/KT-RU. Проверки структуры сохранений и Lua пройдены; игровые действия внутри самого Tabletop Simulator ещё не проверялись.';
const completed=[];
for(const t of perTeam.values()){
  const totalProse=sourceSegments.filter(x=>x.contexts.some(c=>c.team===t.name&&c.category!=='weapon-rule')).map(x=>x.id);
  const translatedProse=totalProse.filter(id=>translations[id]);
  audit.teams.push({name:t.name,totalTextOccurrences:t.total,translatedTextOccurrences:t.translated,totalUniqueTexts:t.ids.size,translatedUniqueTexts:t.translatedIds.size,uniqueNonWeaponTexts:totalProse.length,translatedNonWeaponTexts:translatedProse.length,allSavedProseTranslated:totalProse.length>0&&translatedProse.length===totalProse.length});
  if(totalProse.length&&translatedProse.length===totalProse.length)completed.push(t.name);
}
about.body=about.body.replace('в 12 найденных наборах','в '+completed.length+' найденных наборах');
addTab('RU — отряды: состав сборки',audit.teams.map(t=>(ruTeamNames[t.name]||t.name)+' ('+t.name+')').join('\n'));
const cardDefinitions=JSON.parse(fs.readFileSync('ru-images-all-reviewed.json'));
const cardAssets=JSON.parse(fs.readFileSync('inventory/card-assets.json'));
const supplementManifest=JSON.parse(fs.readFileSync('inventory/supplement-card-manifest.json'));
for(const team of completed){
  const roots=pack.ObjectStates.flatMap(root=>[root,...Object.values(root.States||{})]);
  const root=roots.find(x=>x.Nickname===team);
  const entries=new Map();
  function collectBodies(v){if(!v||typeof v!=='object')return;
    if(v.LuaScriptState){const state=JSON.parse(v.LuaScriptState);if(state.info){
      function collect(x){if(!x||typeof x!=='object')return;
        if(typeof x.text==='string'&&x.text.trim()){const name=x.name||'(без названия)';entries.set(name+'\n'+x.text,{name,text:x.text});}
        for(const value of Object.values(x))if(value&&typeof value==='object')collect(value);
      }
      for(const type of ['abilities','actions','special','psychic'])collect(state.info[type]);
    }}
    for(const [key,x] of Object.entries(v))if(key!=='States'&&x&&typeof x==='object')collectBodies(x);
  }
  collectBodies(root);
  const ids=new Set(cardAssets.filter(x=>currentTeamKey(x.team||'')===currentTeamKey(team)).flatMap(x=>[x.face?.id,x.back?.id]).filter(id=>cardDefinitions[id]));
  for(const item of supplementManifest)if(currentTeamKey(item.team)===currentTeamKey(team))ids.add(item.id);
  const fullCards=[...ids].map(id=>cardDefinitions[id]).filter(c=>!c.decorativeSource&&!/CARD BACK/.test(c.categoryEnglish||''));
  const body='Полные правила, способности и действия. Сверка источников: 05.10.2026.\n\n'+fullCards.map(c=>c.titleRussian+'\n'+(c.stats?Object.entries(c.stats).map(([k,v])=>k+': '+v).join(' · ')+'\n':'')+(c.weapons||[]).map(w=>w.russian+' · ATK '+w.atk+' HIT '+w.hit+' DMG '+w.dmg+' · '+w.wrRussian).join('\n')+'\n'+(c.blocks||[]).map(b=>(b.headingRussian||'')+'\n'+(b.russian||'')).join('\n\n')).join('\n\n────────────────────\n\n')+'\n\n'+[...entries.values()].map(x=>x.name+'\n'+readable(x.text)).join('\n\n');
  addTab('RU — '+(ruTeamNames[team]||team),body);
}
const currentWeaponRules=JSON.parse(fs.readFileSync('ru-current-weapon-rules.json'));
addTab('RU — оружие: справочник',Object.entries(currentWeaponRules).map(([key,value])=>key+'\n'+value.russian).join('\n\n'));
const hud=table.ObjectStates[126];
if(!hud.LuaScript.includes('function onOperativeRandomize(params)'))throw new Error('Unexpected HUD source');
const oldHud=hud.LuaScript;
function replaceExactly(anchor,replacement,count=1){const n=hud.LuaScript.split(anchor).length-1;if(n!==count)throw new Error('HUD anchor count '+n+' expected '+count+' '+anchor);hud.LuaScript=hud.LuaScript.split(anchor).join(replacement);audit.hudChanges.push({anchor,replacement,count});}
const displayNames=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-hud-display-names-complete.json'),'utf8'));
function displayName(name){const clean=(name||'').replace(/^\*/,'').replace(/\s*\((?:\d+AP|AP\d+)\)$/,'').trim();return displayNames[clean]?displayNames[clean]+' ('+name+')':name;}
for(const segment of sourceSegments)for(const context of segment.contexts)if(context.category!=='weapon-rule'&&context.title&&!displayNames[context.title.replace(/^\*/,'').replace(/\s*\((?:\d+AP|AP\d+)\)$/,'').trim()])throw Error('Missing display title '+context.title);
replaceExactly('AbilityActionCache = {}',`local ruDisplayNames = {${Object.entries(displayNames).map(([en,ru])=>'['+JSON.stringify(en)+']='+JSON.stringify(ru)).join(',')}}
local function ruDisplayName(raw)
    if type(raw) ~= "string" then return raw end
    local clean = raw:gsub("%[%x+%]", ""):gsub("%[%-%]", ""):gsub("^%*", ""):gsub("%s*%([%d/]+AP%)$", ""):gsub("%s*%(AP%d+%)$", "")
    clean = clean:match("^%s*(.-)%s*$")
    clean = clean:gsub("^[RM]%s+", ""):gsub("^%([RM]%)%s*", "")
    local translated = ruDisplayNames[clean] or ruDisplayNames[string.upper(clean)]
    return translated and (translated .. " (" .. raw .. ")") or raw
end
AbilityActionCache = {}`);
for(const [prefix,item]of [['ability','a'],['action','act']])replaceExactly(`safeSetAttribute("${prefix}NameText"..suffix, "text", ${item}.name, playerColor)`,`safeSetAttribute("${prefix}NameText"..suffix, "text", ruDisplayName(${item}.name), playerColor)`,2);
replaceExactly('safeSetAttribute("weaponNameText"..suffix, "text", w.name, playerColor)','safeSetAttribute("weaponNameText"..suffix, "text", ruDisplayName(w.name), playerColor)');
replaceExactly('name      = operativeName,','name      = ruDisplayName((objState.info or {}).name or operativeName),');
// Descriptions may repeat stat lines after a weapon section. Such lines are not weapon profiles.
replaceExactly('    return weapons',`    local validWeapons = {}
    for _, weapon in ipairs(weapons) do
        if weapon.atk ~= "-" and weapon.hit ~= "-" and weapon.dmg ~= "-" then
            table.insert(validWeapons,weapon)
        end
    end
    return validWeapons`);
replaceExactly('rawName:match("^(.-)%s*%((%d+AP)%)$")','rawName:match("^(.-)%s*%(([%d/]+AP)%)$")');
replaceExactly('if not cleanName then cleanName, apCost = rawName, "" end',`if not cleanName then
                local alternateName, alternateCost = rawName:match("^(.-)%s*%(AP(%d+)%)$")
                if alternateName then cleanName, apCost = alternateName, alternateCost .. "AP"
                else cleanName, apCost = rawName, "" end
            end`);
replaceExactly('    AbilityActionCache[playerColor] = {',`    local seenSpecial = {}
    for _, ability in ipairs(abilities) do seenSpecial[ability.name .. "\\n" .. ability.description] = true end
    local extra = {}
    local function collectSpecial(value)
        if type(value) ~= "table" then return end
        if type(value.text) == "string" and value.text ~= "" then
            local name, text = value.name or "Особое правило", cleanDescriptionText(value.text)
            local key = name .. "\\n" .. text
            if not seenSpecial[key] then
                table.insert(extra, {name=name, description=text, abilityActionDescriptionPresent=true})
                seenSpecial[key] = true
            end
        end
        for _, child in pairs(value) do if type(child) == "table" then collectSpecial(child) end end
    end
    collectSpecial(info.special)
    collectSpecial(info.psychic)
    table.sort(extra, function(a,b) return a.name < b.name end)
    for _, ability in ipairs(extra) do table.insert(abilities, ability) end
    AbilityActionCache[playerColor] = {`);
replaceExactly('local move   = (stats.Move or "") .. \'"\'','local move   = tostring(stats.Move or stats.M or ""):gsub(\'"$\', "") .. \'"\'');
replaceExactly('local save   = (stats.Save or "") .. \'+\'','local save   = tostring(stats.Save or stats.SV or ""):gsub("%+$", "") .. "+"');
replaceExactly('local wounds = stats.Wounds or ""','local wounds = stats.Wounds or stats.W or ""');
// Stat abbreviations stay as printed on the source cards.
for(const tab of Object.values(table.TabStates))if(tab.title.startsWith('RU — ')&&tab.title!=='RU — оружие: справочник'){
  const lines=tab.body.split('\n');
  tab.body=lines.map(line=>displayNames[line.replace(/^\*/,'').replace(/\s*\((?:\d+AP|AP\d+)\)$/,'').trim()]?displayName(line):line).join('\n');
}
replaceExactly('return text:gsub("%*%*", "")',`local readable = text:gsub("%*%*", "")
    local function formatInches(distance)
        local number = tonumber(distance)
        local last, lastTwo = number % 10, number % 100
        local word = "дюймов"
        if not (lastTwo >= 11 and lastTwo <= 14) then
            if last == 1 then word = "дюйм"
            elseif last >= 2 and last <= 4 then word = "дюйма" end
        end
        return tostring(number) .. " " .. word
    end
    readable = readable:gsub("(%d+)%s+([1236])&&", function(count, unit)
        return formatInches(tonumber(count) * tonumber(unit))
    end)
    return readable:gsub("([1236])&&", formatInches)`);
const parseAnchor='local stats    = objState.stats or {}';
replaceExactly(parseAnchor,parseAnchor+`
        local ruleEntries = {}
        for name, text in pairs((objState.info or {}).rules or {}) do
            if type(text) == "string" and text ~= "" then
                table.insert(ruleEntries, {name = name, text = cleanDescriptionText(text)})
            end
        end
        table.sort(ruleEntries, function(a, b) return a.name < b.name end)
        local ruleParts = {"Правила оружия этой модели (все профили). Используйте правило выбранного профиля."}
        for _, entry in ipairs(ruleEntries) do
            table.insert(ruleParts, ruDisplayName(entry.name) .. "\\n" .. entry.text)
        end
        local rulesReference = #ruleEntries > 0 and table.concat(ruleParts, "\\n\\n") or "В этой модели нет сохранённой справки по правилам оружия."`);
const weaponAnchor='safeSetAttribute("weaponWRText"..suffix, "text", w.wr, playerColor)';
replaceExactly(weaponAnchor,weaponAnchor+'\n                safeSetAttribute("weaponWRText"..suffix, "tooltip", rulesReference, playerColor)');
for(const [prefix,item]of [['ability','a'],['action','act']]){
  const anchor=`safeSetAttribute("${prefix}DescriptionText"..suffix, "text", ${item}.description, playerColor)`;
  replaceExactly(anchor,anchor+`\n        safeSetAttribute("${prefix}DescriptionText"..suffix, "tooltip", ${item}.description, playerColor)`,2);
}
audit.referenceHUD=require('./extend-reference-hud.cjs')(hud,pack);
audit.ployPanel=require('./extend-ploy-table.cjs')(table);
lua.parse(oldHud,{luaVersion:'5.2'});lua.parse(hud.LuaScript,{luaVersion:'5.2'});
fs.writeFileSync(path.join(out,'HUD-preview-3.lua'),hud.LuaScript);
// The main table changes only its display HUD, notebook and save title relative to preview 1.
function verifyTable(a,b,loc){if(JSON.stringify(a)===JSON.stringify(b))return;
  if(tableDescriptions.approved.has(loc)){if(JSON.stringify(b)!==tableDescriptions.approved.get(loc))throw Error('Unexpected native tooltip '+loc);return;}
  if(['/SaveName','/TabStates/'+aboutId+'/body','/ObjectStates/126/LuaScript','/ObjectStates/137/LuaScript'].includes(loc))return;
  if(loc.endsWith('/LuaScript') && a===originalTable.ObjectStates.find(o=>o.GUID==='d2682e').LuaScript)return;
  if(loc.endsWith('/LuaScriptState')){
    function verifySaved(x,y,at){
      if(JSON.stringify(x)===JSON.stringify(y))return;
      if(tableProse.approved.has(at)){if(y!==tableProse.approved.get(at)||typeof x!=='string')throw Error('Unexpected table translation '+at);return;}
      if(!x||!y||typeof x!=='object'||typeof y!=='object'||Object.keys(x).join('|')!==Object.keys(y).join('|'))throw Error('Unexpected table state change '+at);
      for(const key of Object.keys(x))verifySaved(x[key],y[key],at+'/'+key);
    }
    verifySaved(JSON.parse(a),JSON.parse(b),loc);return;
  }
  if(loc==='/TabStates'){
    for(const [id,oldTab]of Object.entries(a)){if(!Object.hasOwn(b,id))throw new Error('Removed old notebook tab '+id);verifyTable(oldTab,b[id],loc+'/'+id);}
    const newIds=Object.keys(b).filter(id=>!Object.hasOwn(a,id));
    if(newIds.length!==addedTabIds.size||newIds.some(id=>!addedTabIds.has(id)||!b[id].title.startsWith('RU — ')))throw new Error('Unexpected added notebook tabs');
    return;
  }
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Object.keys(a).join('|')!==Object.keys(b).join('|'))throw new Error('Unexpected table change '+loc);
  for(const key of Object.keys(a))verifyTable(a[key],b[key],loc+'/'+key);
}
verifyTable(originalTable,table,'');
const tableOutput=path.join(out,'KT24-The-Killzone-RU-preview-3.json');
const packOutput=path.join(out,'KT41-RU-preview-3.json');
fs.writeFileSync(tableOutput,JSON.stringify(table,null,2));fs.writeFileSync(packOutput,JSON.stringify(pack,null,2));
JSON.parse(fs.readFileSync(tableOutput,'utf8'));JSON.parse(fs.readFileSync(packOutput,'utf8'));
if(sha(fs.readFileSync(teamSource))!==audit.teamSourceSHA256||sha(fs.readFileSync(tableSource))!==audit.tableSourceSHA256||sha(fs.readFileSync(originalWorkshop))!==workshopHash)throw new Error('Source file changed');
audit.completedSavedProseTeams=completed;
audit.uniqueWeaponRuleTranslations=Object.keys(rules).length;
audit.uniqueOtherTranslations=Object.keys(prose).length;
audit.stats={savedTextOccurrencesChanged:audit.changes.length,uniqueTranslatedSourceTexts:new Set(audit.changes.map(x=>x.id)).size,sourceUniqueTexts:sourceSegments.length,teamCount:perTeam.size};
audit.outputs={table:tableOutput,pack:packOutput,tableSHA256:sha(fs.readFileSync(tableOutput)),packSHA256:sha(fs.readFileSync(packOutput))};
fs.writeFileSync(path.join(out,'validation-preview-3.json'),JSON.stringify(audit,null,2));
const progress=sourceSegments.map(x=>({...x,russian:translations[x.id]||null,status:translations[x.id]?'translated':'pending'}));
fs.writeFileSync(path.join(out,'prose-translation-progress.json'),JSON.stringify(progress,null,2));
console.log(JSON.stringify({stats:audit.stats,completedSavedProseTeams:completed,outputs:audit.outputs},null,2));
