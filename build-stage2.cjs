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
const sourceSegments=JSON.parse(fs.readFileSync(path.join(__dirname,'inventory/prose-source.json'),'utf8'));
const expected=new Map(sourceSegments.map(x=>[x.id,x]));
for(const [id,text]of Object.entries(translations)){
  if(!expected.has(id))throw new Error('Unknown source segment '+id);
  if(typeof text!=='string'||!text.trim())throw new Error('Empty translation '+id);
}
const ruleSegments=sourceSegments.filter(x=>x.contexts.some(c=>c.category==='weapon-rule'));
if(ruleSegments.some(x=>!rules[x.id]))throw new Error('Missing weapon rule translation');
const audit={stage:'preview-2',runtimeTested:false,teamSource,teamSourceSHA256:sha(originalBytes),tableSource,tableSourceSHA256:sha(tableBytes),workshopSHA256:workshopHash,changes:[],teams:[],hudChanges:[]};
const ruTeamNames={'Chaos Cult':'Культ Хаоса','Goremongers':'Кровопускатели','Hernkyn Yaegirs':'Яэгиры Хернкинов','Brood Brothers':'Братья выводка','Fellgor Ravager':'Разорители Феллгора','Kommandos':'Коммандос','Gellerpox Infected':'Заражённые Геллера','Angels of Death':'Ангелы смерти','Plague Marines':'Чумные десантники','Legionary':'Легионеры','Nemesis Claw':'Коготь Немезиды','DEATHWATCH':'Караул Смерти'};
const allowedStateLeaves=new Set();
const perTeam=new Map();
function translateLeaf(owner,key,loc,team,guid,category,title){
  const old=owner[key];if(typeof old!=='string'||!old.trim())return;
  const id=sha(old).slice(0,16),translated=translations[id];
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
function verifyState(a,b,loc){
  if(JSON.stringify(a)===JSON.stringify(b))return;
  if(allowedStateLeaves.has(loc)){if(typeof a!=='string'||typeof b!=='string')throw new Error('Wrong translation type '+loc);return;}
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')throw new Error('Unexpected state change '+loc);
  if(Array.isArray(a)!==Array.isArray(b)||Object.keys(a).join('|')!==Object.keys(b).join('|'))throw new Error('State topology changed '+loc);
  for(const key of Object.keys(a))verifyState(a[key],b[key],loc+'/'+key);
}
function verifyPack(a,b,loc){
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
const addedTabIds=new Set();
function addTab(title,body){const id=Math.max(-1,...Object.keys(table.TabStates).map(Number))+1;table.TabStates[String(id)]={title,body,color:'Grey',visibleColor:{r:0.5,g:0.5,b:0.5},id};addedTabIds.add(String(id));}
table.SaveName='KT24 The Killzone Mod — русский перевод, тестовая версия 2';
const aboutEntry=Object.entries(table.TabStates).find(([id,x])=>x.title==='RU — о переводе');
const aboutId=aboutEntry?.[0],about=aboutEntry?.[1];
if(!about)throw new Error('Missing existing translation notebook');
about.body='Тестовая русская сборка 2. Переведена часть интерфейса и описаний стола, текст кратких правил и руководства.\n\nОтдельный сохранённый объект KT41-RU-preview-2.json содержит 41 набор отряда из локального исходника. Переведены все 83 разных текста правил оружия этого набора. Способности и действия полностью переведены в 12 найденных наборах; ещё часть общих текстов переведена в других наборах. Список и справки находятся на вкладках RU. Это перевод сохранённых данных, а не подтверждение актуальности правил. Некоторые наборы содержат старые или смешанные профили.\n\nДля чтения способностей выберите модель и нажмите R. Наведите мышь на текст способности или действия, чтобы прочитать полный текст во всплывающей подсказке. Наведение на WR показывает справку по всем правилам оружия этой модели; применяйте только правило, указанное у выбранного профиля.\n\nОригинальные Nickname, названия действий, AP-стоимости и служебные Description сохранены: скрипты используют их как идентификаторы и разбирают характеристики. Карты, PDF и другие изображения пока остаются в исходном виде.\n\nЯвное обновление или пересоздание моделей через исходные инструменты может заменить русский текст английским. Испытания загрузки и игровых сценариев в TTS ещё не выполнены.';
const completed=[];
for(const t of perTeam.values()){
  const totalProse=sourceSegments.filter(x=>x.contexts.some(c=>c.team===t.name&&c.category!=='weapon-rule')).map(x=>x.id);
  const translatedProse=totalProse.filter(id=>translations[id]);
  audit.teams.push({name:t.name,totalTextOccurrences:t.total,translatedTextOccurrences:t.translated,totalUniqueTexts:t.ids.size,translatedUniqueTexts:t.translatedIds.size,uniqueNonWeaponTexts:totalProse.length,translatedNonWeaponTexts:translatedProse.length,allSavedProseTranslated:totalProse.length>0&&translatedProse.length===totalProse.length});
  if(totalProse.length&&translatedProse.length===totalProse.length)completed.push(t.name);
}
about.body=about.body.replace('в 12 найденных наборах','в '+completed.length+' найденных наборах');
addTab('RU — отряды: прогресс','Перевод относится только к найденным сохранённым текстам, не к картинкам карт или всей книге правил отряда.\n\nСправка по оружию: переведены 83 из 83 разных текстов из info.rules, используемых 41 найденным отрядом. Формулировки с одинаковым названием сохранены отдельно.\n\nСпособности и действия в сохранённых данных:\n'+audit.teams.map(t=>`${ruTeamNames[t.name]||t.name}${ruTeamNames[t.name]?' ('+t.name+')':''}: ${t.translatedNonWeaponTexts}/${t.uniqueNonWeaponTexts} уникальных текстов.`).join('\n')+'\n\nСтарые расстояния в форме 2 2&& означают два отрезка по 2 дюйма. В справке и панели они показаны как 4 дюйма; в служебных данных сохранена исходная запись. В записи HY-Pex Mines исходник содержит обрыв условия; он отмечен в переводе.');
for(const team of completed){
  const entries=sourceSegments.filter(x=>x.contexts.some(c=>c.team===team&&c.category!=='weapon-rule'));
  const body='Перевод текстов из локального сохранённого набора '+team+'. Названия и AP-стоимость сохранены для сверки с моделью. Карты на изображениях не переведены. Редакция правил автоматически не обновлялась.\n\n'+entries.map(x=>{
    const contexts=x.contexts.filter(c=>c.team===team&&c.category!=='weapon-rule');
    return [...new Set(contexts.map(c=>c.title||'(без названия)'))].join(' / ')+'\n'+readable(translations[x.id]);
  }).join('\n\n');
  addTab('RU — '+(ruTeamNames[team]||team),body);
}
addTab('RU — оружие: справочник','Все 83 варианта из сохранённого набора. Если одно правило имеет несколько вариантов, сверяйтесь с подсказкой WR своей модели: там приведён её сохранённый вариант. Ни один вариант не объявляется актуальнее другого.\n\n'+ruleSegments.map(x=>'['+[...new Set(x.contexts.filter(c=>c.category==='weapon-rule').map(c=>c.title))].join(' / ')+']\n'+readable(rules[x.id])+'\nИсточник: '+[...new Set(x.contexts.map(c=>c.team))].join(', ')).join('\n\n'));
const hud=table.ObjectStates[126];
if(!hud.LuaScript.includes('function onOperativeRandomize(params)'))throw new Error('Unexpected HUD source');
const oldHud=hud.LuaScript;
function replaceExactly(anchor,replacement,count=1){const n=hud.LuaScript.split(anchor).length-1;if(n!==count)throw new Error('HUD anchor count '+n+' expected '+count+' '+anchor);hud.LuaScript=hud.LuaScript.split(anchor).join(replacement);audit.hudChanges.push({anchor,replacement,count});}
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
            table.insert(ruleParts, entry.name .. "\\n" .. entry.text)
        end
        local rulesReference = #ruleEntries > 0 and table.concat(ruleParts, "\\n\\n") or "В этой модели нет сохранённой справки по правилам оружия."`);
const weaponAnchor='safeSetAttribute("weaponWRText"..suffix, "text", w.wr, playerColor)';
replaceExactly(weaponAnchor,weaponAnchor+'\n                safeSetAttribute("weaponWRText"..suffix, "tooltip", rulesReference, playerColor)');
for(const [prefix,item]of [['ability','a'],['action','act']]){
  const anchor=`safeSetAttribute("${prefix}DescriptionText"..suffix, "text", ${item}.description, playerColor)`;
  replaceExactly(anchor,anchor+`\n        safeSetAttribute("${prefix}DescriptionText"..suffix, "tooltip", ${item}.description, playerColor)`,2);
}
lua.parse(oldHud,{luaVersion:'5.2'});lua.parse(hud.LuaScript,{luaVersion:'5.2'});
fs.writeFileSync(path.join(out,'HUD-preview-2.lua'),hud.LuaScript);
// The main table changes only its display HUD, notebook and save title relative to preview 1.
function verifyTable(a,b,loc){if(JSON.stringify(a)===JSON.stringify(b))return;if(['/SaveName','/TabStates/'+aboutId+'/body','/ObjectStates/126/LuaScript'].includes(loc))return;
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
const tableOutput=path.join(out,'KT24-The-Killzone-RU-preview-2.json');
const packOutput=path.join(out,'KT41-RU-preview-2.json');
fs.writeFileSync(tableOutput,JSON.stringify(table,null,2));fs.writeFileSync(packOutput,JSON.stringify(pack,null,2));
JSON.parse(fs.readFileSync(tableOutput,'utf8'));JSON.parse(fs.readFileSync(packOutput,'utf8'));
if(sha(fs.readFileSync(teamSource))!==audit.teamSourceSHA256||sha(fs.readFileSync(tableSource))!==audit.tableSourceSHA256||sha(fs.readFileSync(originalWorkshop))!==workshopHash)throw new Error('Source file changed');
audit.completedSavedProseTeams=completed;
audit.uniqueWeaponRuleTranslations=Object.keys(rules).length;
audit.uniqueOtherTranslations=Object.keys(prose).length;
audit.stats={savedTextOccurrencesChanged:audit.changes.length,uniqueTranslatedSourceTexts:new Set(audit.changes.map(x=>x.id)).size,sourceUniqueTexts:sourceSegments.length,teamCount:perTeam.size};
audit.outputs={table:tableOutput,pack:packOutput,tableSHA256:sha(fs.readFileSync(tableOutput)),packSHA256:sha(fs.readFileSync(packOutput))};
fs.writeFileSync(path.join(out,'validation-preview-2.json'),JSON.stringify(audit,null,2));
const progress=sourceSegments.map(x=>({...x,russian:translations[x.id]||null,status:translations[x.id]?'translated':'pending'}));
fs.writeFileSync(path.join(out,'prose-translation-progress.json'),JSON.stringify(progress,null,2));
console.log(JSON.stringify({stats:audit.stats,completedSavedProseTeams:completed,outputs:audit.outputs},null,2));
