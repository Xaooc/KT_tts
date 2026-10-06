const fs=require('fs'),crypto=require('crypto');
const {collect,translate,parseSource}=require('./lua-display.cjs');
const dictionary={...JSON.parse(fs.readFileSync('ru-ui.json','utf8')),...JSON.parse(fs.readFileSync('ru-ui-extra.json','utf8'))};
const audit={scripts:[],sourceRepairs:[],xmlChanges:[],pending:[]};
const memo=new Map(),pending=new Map();
const repairTargets=new Map(JSON.parse(fs.readFileSync('inventory/npo-script-repair-targets.json','utf8')).map(x=>[x.path,x.guid]));
function repairSource(src,loc,file){
 const broken=/local function getWoundPanelWidth\(\)\r?\n  local wounds = state.stats and state.stats.Wounds or 0\r?\n  if wounds <= 7 then\r?\n    return 60\r?\n  if wounds <= 10 then\r?\n    return 80\r?\n  if wounds <= 14 then\r?\n    return 100/;
 if(broken.test(src)){
  const count=[...src.matchAll(new RegExp(broken.source,'g'))].length;
  if(count!==1||!repairTargets.has(loc)||!file.startsWith('KT24-'))throw Error('Unexpected source repair location '+loc);
  src=src.replace(broken,match=>match.replace('  if wounds <= 10 then','  elseif wounds <= 10 then').replace('  if wounds <= 14 then','  elseif wounds <= 14 then'));
  audit.sourceRepairs.push({file,path:loc,reason:'Two missing elseif branches prevented the NPO wound panel script from parsing.'});
 }
 return src;
}
function escapeXML(text){return text.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function unescapeXML(text){return text.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
function xml(text,loc,file){
 return text.replace(/\b(text|tooltip)="([^"]*)"/g,(raw,key,value)=>{
  const old=unescapeXML(value),ru=dictionary[old.trim()];if(!ru||ru===old.trim())return raw;
  audit.xmlChanges.push({file,path:loc,key,old,russian:ru});return key+'="'+escapeXML(old.replace(old.trim(),ru))+'"';
 });
}
function visit(node,loc,file){if(!node||typeof node!=='object')return;
 if(node.LuaScript){
  const repaired=repairSource(node.LuaScript,loc,file);
  let result=memo.get(repaired);
  if(!result){
   result=translate(repaired,dictionary,{coordinatedCancel:true});
   if(result.error)throw Error(file+loc+': '+result.error);
   // XML declarations inside Lua strings are rendered UI, not scripting keys.
   // Translate them as XML and then independently parse the complete script.
   result.text=xml(result.text,loc+'/LuaScript',file);
   parseSource(result.text);
   memo.set(repaired,result);
  }
  node.LuaScript=result.text;
  if(result.changes.length)audit.scripts.push({file,path:loc,changes:result.changes.map(x=>({old:x.old,russian:x.new,role:x.role}))});
  for(const literal of collect(result.text).literals){const key=literal.old.trim();if(!dictionary[key]&&!/^@[a-z]+$/i.test(key)&&!/^[\d\s]*(?:APL|AP|D6|S|X|R|M)[\d\s]*$/.test(key)&&/[a-z]{3}/i.test(key)&&!/[А-Яа-яЁё]/.test(key)){
    if(!pending.has(key))pending.set(key,{english:key,contexts:[]});pending.get(key).contexts.push({file,path:loc,role:literal.role});
  }}
 }
 if(node.XmlUI)node.XmlUI=xml(node.XmlUI,loc+'/XmlUI',file);
 for(const [key,value]of Object.entries(node))if(value&&typeof value==='object')visit(value,loc+'/'+key,file);
}
function invariant(a,b,loc){if(JSON.stringify(a)===JSON.stringify(b))return;
 if(['/LuaScript','/XmlUI'].some(s=>loc.endsWith(s)))return;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Object.keys(a).join('|')!==Object.keys(b).join('|'))throw Error('Unexpected change '+loc);
 for(const key of Object.keys(a))invariant(a[key],b[key],loc+'/'+key);
}
for(const file of ['KT24-The-Killzone-RU-preview-3.json','KT41-RU-preview-3.json']){
 const input='output/'+file,src=JSON.parse(fs.readFileSync(input,'utf8')),data=structuredClone(src);visit(data,'',file);invariant(src,data,'');
 const output='output/'+file.replace('preview-3','working');fs.writeFileSync(output,JSON.stringify(data,null,2));
}
audit.pending=[...pending.values()];audit.uniqueScripts=memo.size;
fs.writeFileSync('output/display-validation.json',JSON.stringify(audit,null,2));
console.log(JSON.stringify({uniqueScripts:memo.size,changedScriptOccurrences:audit.scripts.length,sourceRepairs:audit.sourceRepairs.length,xmlChanges:audit.xmlChanges.length,pending:audit.pending}));
