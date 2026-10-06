const fs=require('fs'),{collect}=require('./lua-display.cjs');
const dictionary={...JSON.parse(fs.readFileSync('ru-ui.json','utf8')),...JSON.parse(fs.readFileSync('ru-ui-extra.json','utf8'))};
const linked=JSON.parse(fs.readFileSync('inventory/linked-scripts.json','utf8')),items=new Map();
for(const script of linked){let src=fs.readFileSync(script.path,'utf8');
 src=src.replace(/(local function getWoundPanelWidth\(\)[\s\S]*?\r?\nend)/,match=>match.replace('  if wounds <= 10 then','  elseif wounds <= 10 then').replace('  if wounds <= 14 then','  elseif wounds <= 14 then'));
 const found=collect(src);if(found.error)throw Error(script.url+': '+found.error);
 for(const literal of found.literals)if(!dictionary[literal.old.trim()]){const item=items.get(literal.old)||{english:literal.old,contexts:[]};item.contexts.push({url:script.url,role:literal.role,snippet:literal.context});items.set(literal.old,item);}
}
fs.writeFileSync('inventory/pending-linked-ui.json',JSON.stringify([...items.values()],null,2));console.log(JSON.stringify({scripts:linked.length,missing:items.size}));
