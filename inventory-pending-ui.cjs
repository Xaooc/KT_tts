const fs=require('fs'),crypto=require('crypto'),{collect}=require('./lua-display.cjs');
const files=['output/KT24-The-Killzone-RU-preview-3.json','output/KT41-RU-preview-3.json'];
const ui={...JSON.parse(fs.readFileSync('ru-ui.json','utf8')),...JSON.parse(fs.readFileSync('ru-ui-extra.json','utf8'))},seen=new Set(),items=new Map(),unparsed=[];
function visit(v,loc,file){if(!v||typeof v!=='object')return;
 if(v.LuaScript&&!seen.has(v.LuaScript)){
  seen.add(v.LuaScript);const found=collect(v.LuaScript);
  if(found.error)unparsed.push({file,path:loc,error:found.error});
  for(const literal of found.literals){if(ui[literal.old.trim()])continue;const id=crypto.createHash('sha256').update(literal.old).digest('hex').slice(0,16);
   const item=items.get(id)||{id,english:literal.old,contexts:[]};item.contexts.push({file,path:loc,role:literal.role,snippet:literal.context});items.set(id,item);
  }
 }
 for(const [k,x]of Object.entries(v))if(x&&typeof x==='object')visit(x,loc+'/'+k,file);
}
for(const file of files)visit(JSON.parse(fs.readFileSync(file,'utf8')),'',file);
fs.writeFileSync('inventory/pending-ui-strings.json',JSON.stringify([...items.values()],null,2));
fs.writeFileSync('inventory/unparsed-ui-scripts.json',JSON.stringify(unparsed,null,2));
console.log(JSON.stringify({uniqueScripts:seen.size,pendingDisplayLiterals:items.size,unparsed:unparsed.length}));
