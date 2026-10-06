const fs=require('fs'),path=require('path'),crypto=require('crypto');
const lua=require('./tools/node_modules/luaparse');
const source=process.argv[2];
if(!source)throw new Error('Pass the source TTS JSON path');
const input=fs.readFileSync(source,'utf8'), mod=JSON.parse(input);
const sourceHash=crypto.createHash('sha256').update(input).digest('hex');
const original=JSON.parse(input);
const ui=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-ui.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(__dirname,'inventory/texts.json'),'utf8'));
const descById=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-descriptions.json'),'utf8'));
const descriptions=new Map(Object.entries(descById).map(([id,text])=>[inventory[Number(id)].text,text]));
const out=path.join(__dirname,'output'); fs.mkdirSync(out,{recursive:true});
const audit={source,sourceSHA256:sourceHash,stage:'preview-1',runtimeTested:false,scriptChanges:[],descriptionChanges:[],xmlChanges:[],unparsedOriginalScripts:[]};
const stats={scripts:0,scriptCopies:0,luaStrings:0,xmlFields:0,descriptions:0};
function translate(s){const trimmed=s.trim();if(trimmed==='Cancel')return s;const ru=ui[trimmed];return ru?s.slice(0,s.indexOf(trimmed))+ru+s.slice(s.indexOf(trimmed)+trimmed.length):s;}
function translateXml(s){
  // Only presentation attributes and leaf contents of Text/Button. Never IDs or handlers.
  return s.replace(/\b(text|tooltip)=(['"])([\s\S]*?)\2/g,(all,key,q,value)=>{const v=translate(value);if(v!==value)stats.xmlFields++;return key+'='+q+v+q;})
  .replace(/(<(?:Text|Button)\b[^>]*>)([^<>]*)(<\/(?:Text|Button)>)/g,(all,start,value,end)=>{let v=translate(value);if(v===value){for(const [en,ru]of Object.entries(ui)){if(en.includes('\n')&&value.includes(en)){v=value.replace(en,ru);break;}}}if(v!==value)stats.xmlFields++;return start+v+end;});
}
function decodeLua(raw){
  const long=raw.match(/^\[(=*)\[([\s\S]*)\]\1\]$/);if(long)return long[2].replace(/^\r?\n/,'');
  return raw.slice(1,-1).replace(/\\(\d{1,3}|x[\da-fA-F]{2}|z\s*|\r?\n|.)/g,(_,x)=>{
    if(/^\d/.test(x))return String.fromCharCode(Number(x));if(x.startsWith('x'))return String.fromCharCode(parseInt(x.slice(1),16));if(x.startsWith('z'))return '';
    return ({a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\x0b','\n':'\n','\r\n':'\n'})[x]??x;
  });
}
function encodeLua(text){return JSON.stringify(text);}
const scriptCache=new Map();
function translateLua(src,loc){
  if(scriptCache.has(src)){const c=scriptCache.get(src);if(c.text!==src){stats.scriptCopies++;c.auditEntry.copyPaths.push(loc);}return c.text;}
  let ast;
  try{ast=lua.parse(src,{luaVersion:'5.2',ranges:true,comments:false});}
  catch(e){audit.unparsedOriginalScripts.push({path:loc,error:e.message});scriptCache.set(src,{text:src});return src;}
  const patches=[];
  function visit(node,parent){
    if(!node||typeof node!=='object')return;
    if(node.type==='StringLiteral'){
      const old=decodeLua(node.raw);let translated=old;let role='';
      if(parent?.type==='TableKeyString'&&['label','tooltip'].includes(parent.key.name)){translated=translate(old);role=parent.key.name;}
      if(parent?.type==='CallExpression'&&parent.arguments[0]===node&&parent.base?.type==='MemberExpression'&&parent.base.identifier.name==='addContextMenuItem'){translated=translate(old);role='context-menu';}
      if(old.includes('<Text')||old.includes('<Button')){translated=translateXml(old);role='embedded-xml';}
      if(translated!==old)patches.push({range:node.range,text:encodeLua(translated),old,translated,role});
    }
    for(const [key,v]of Object.entries(node)){if(key==='range'||key==='loc')continue;if(Array.isArray(v))v.forEach(x=>visit(x,node));else if(v&&typeof v==='object')visit(v,node);}
  }
  visit(ast,null);
  let result=src;for(const p of [...patches].sort((a,b)=>b.range[0]-a.range[0]))result=result.slice(0,p.range[0])+p.text+result.slice(p.range[1]);
  let auditEntry;
  if(patches.length){
    const next=lua.parse(result,{luaVersion:'5.2',ranges:true,comments:false});
    // Structural proof: only whitelisted display literals may change.
    function shape(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(shape);const r={};for(const [k,v]of Object.entries(n)){if(['range','loc','raw','value'].includes(k)&&n.type==='StringLiteral')continue;if(['range','loc'].includes(k))continue;r[k]=shape(v);}return r;}
    if(JSON.stringify(shape(ast))!==JSON.stringify(shape(next)))throw new Error('Lua structure changed at '+loc);
    stats.scripts++;stats.scriptCopies++;stats.luaStrings+=patches.length;
    auditEntry={path:loc,copyPaths:[loc],instances:patches.map(({old,translated,role})=>({old,translated,role}))};
    audit.scriptChanges.push(auditEntry);
  }
  scriptCache.set(src,{text:result,auditEntry});return result;
}
const tokenTags=new Set(['KTUITokenOrder','KTUITokenSimple','KTUITokenEquipment','KTUIStackable','KTUITokenAdvanced']);
function walk(v,loc){if(!v||typeof v!=='object')return;
  for(const [key,value]of Object.entries(v)){
    const p=loc+'/'+key;
    if(key==='LuaScript'&&typeof value==='string'&&value)v[key]=translateLua(value,p);
    else if(key==='XmlUI'&&typeof value==='string'&&value){const translated=translateXml(value);if(translated!==value){v[key]=translated;audit.xmlChanges.push(p);}}
    else if(key==='Description'&&typeof value==='string'&&descriptions.has(value)&&!value.includes('[84E680]APL')&&!Object.keys(v.Tags||{}).some(k=>tokenTags.has(v.Tags[k]))){v[key]=descriptions.get(value);stats.descriptions++;audit.descriptionChanges.push({path:p,old:value,translated:v[key]});}
    else if(value&&typeof value==='object')walk(value,p);
  }
}
walk(mod,'');
mod.SaveName='KT24 The Killzone Mod — русский перевод, тестовая версия 1';
const titles={Rules:'Правила',White:'Белый',Brown:'Коричневый',Red:'Красный',Orange:'Оранжевый',Yellow:'Жёлтый',Green:'Зелёный',Blue:'Синий',Teal:'Бирюзовый',Purple:'Фиолетовый',Pink:'Розовый',Black:'Чёрный',"What's New?":'Что нового?'};
for(const t of Object.values(mod.TabStates||{}))if(titles[t.title])t.title=titles[t.title];
for(const t of Object.values(mod.TabStates||{}))if(descriptions.has(t.body))t.body=descriptions.get(t.body);
function tab(title,body){const id=Math.max(-1,...Object.keys(mod.TabStates).map(Number))+1;mod.TabStates[String(id)]={title,body,color:'Grey',visibleColor:{r:0.5,g:0.5,b:0.5},id};}
tab('RU — о переводе','Тестовая русская сборка 1. Переведена часть интерфейса и текстовых описаний. Во вкладках рядом доступны русские тексты кратких правил и руководства.\n\nПолная локализация ещё не завершена: большинство названий, динамических панелей, карточки и прочие PDF остаются на английском. Изображения и схемы двух переведённых документов смотрите в оригинальных PDF.\n\nАнглийские Nickname и служебные Description сохранены, поскольку скрипты используют их как идентификаторы и считывают из них характеристики. Cancel — функциональный маркер; в первом выпуске подпись не переведена.\n\nKTUI Extender загружает исходные скрипты из сети и может вернуть английский интерфейс моделям. Испытания в самой TTS ещё не выполнены. Перевод передаёт тексты этой копии мода и не обновляет её правила.');
tab('RU — краткие правила',fs.readFileSync(path.join(__dirname,'ru-lite-rules.txt'),'utf8'));
tab('RU — руководство',fs.readFileSync(path.join(__dirname,'ru-manual.txt'),'utf8'));
tab('RU — термины','Оперативник — Operative\nОтряд — Kill Team\nЗона боя — Killzone\nРаунд — Turning Point\nАктивация — Activation\nСтратегическая фаза — Strategy Phase\nФаза перестрелки — Firefight Phase\nПриказ «Бой» — Engage\nПриказ «Скрытность» — Conceal\nГотов / использован — Ready / Expended\nКонтрдействие — Counteract\nОчко действий — Action Point, AP (ОД)\nЛимит очков действий — Action Point Limit, APL\nКомандное очко — Command Point, CP\nПобедное очко — Victory Point, VP\nПриём — Ploy\nСтратегический приём — Strategy Ploy\nПриём перестрелки — Firefight Ploy\nСтратегический гамбит — Strategic Gambit\nМаркер цели — Objective Marker\nМаркер миссии — Mission Marker\nУниверсальное снаряжение — Universal Equipment\nНеигровой оперативник — Non-Player Operative, NPO\nУкрытие — Cover\nЗаслонён — Obscured\nВидимый — Visible\nДистанция контроля — Control Range\nВыведен из строя — Incapacitated\nТяжёлый / лёгкий террейн — Heavy / Light\nВысотная позиция — Vantage\nДоступный террейн — Accessible\nНезначительный террейн — Insignificant\nОткрытый террейн — Exposed\nБлокирующий террейн — Blocking\n\nМетки характеристик в служебных описаниях оставлены английскими: APL — лимит очков действий; MOVE — перемещение; SAVE — спасбросок; WOUNDS — раны; ATK — атаки; HIT — попадание; DMG — урон; WR — правила оружия.');
// Validate every mutation, including invariant object fields, URLs, stats, tags and saved state.
const allowed=new Set(['Description','LuaScript','XmlUI']);let changed=0;
function verify(a,b,loc){if(JSON.stringify(a)===JSON.stringify(b))return;if(loc==='/SaveName'||loc==='/TabStates'||loc.startsWith('/TabStates/'))return;
  if(typeof a!==typeof b||a===null||b===null)throw new Error('Illegal change at '+loc);
  if(typeof a!=='object'){if(!allowed.has(loc.split('/').pop()))throw new Error('Illegal change at '+loc);changed++;return;}
  if(Object.keys(a).join('|')!==Object.keys(b).join('|'))throw new Error('Object topology changed at '+loc);for(const k of Object.keys(a))verify(a[k],b[k],loc+'/'+k);
}
verify(original,mod,'');
audit.stats={...stats,changedFields:changed,uniqueOriginalScripts:scriptCache.size};
const output=path.join(out,'KT24-The-Killzone-RU-preview-1.json');
fs.writeFileSync(output,JSON.stringify(mod,null,2));JSON.parse(fs.readFileSync(output,'utf8'));
if(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')!==sourceHash)throw new Error('Original changed');
fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(audit,null,2));
// List actual resources and local cache availability, rather than inferring textual coverage.
const pdfs=[],images=new Map();
const cacheRoot=path.dirname(path.dirname(source));
function resourceWalk(v,loc,owner){if(!v||typeof v!=='object')return;if(v.GUID)owner=v;for(const [k,x]of Object.entries(v)){const p=loc+'/'+k;if(k==='PDFUrl'&&typeof x==='string'){const cache=path.join(cacheRoot,'PDF',x.replace(/[^A-Za-z0-9]/g,'')+'.pdf');pdfs.push({path:p,guid:owner?.GUID,name:owner?.Nickname,url:x,cache:fs.existsSync(cache)?cache:null,translationStatus:'pending'});}else if(['ImageURL','FaceURL','BackURL'].includes(k)&&typeof x==='string'&&x){const a=images.get(x)||{url:x,fields:[],owners:[]};if(a.fields.length<5)a.fields.push(p);if(a.owners.length<5)a.owners.push({guid:owner?.GUID,name:owner?.Nickname});images.set(x,a);}else if(x&&typeof x==='object')resourceWalk(x,p,owner);}}
resourceWalk(original,'',null);
for(const p of pdfs)if(p.path==='/ObjectStates/58/CustomPDF/PDFUrl'||p.path==='/ObjectStates/127/CustomPDF/PDFUrl')p.translationStatus='text translated in Notebook; original PDF unchanged';
fs.writeFileSync(path.join(out,'remaining-assets.json'),JSON.stringify({pdfObjects:pdfs,imageAssets:[...images.values()]},null,2));
console.log(JSON.stringify({output,stats:audit.stats,originalParseFailures:audit.unparsedOriginalScripts,pdfs:pdfs.length,uniquePDFs:new Set(pdfs.map(x=>x.url)).size,uniqueImageAssets:images.size,sourceUnchanged:true},null,2));
