const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const {translate,parseSource,decode}=require('./lua-display.cjs');
const dictionary={...JSON.parse(fs.readFileSync('ru-ui.json','utf8')),...JSON.parse(fs.readFileSync('ru-ui-extra.json','utf8'))};
const linked=JSON.parse(fs.readFileSync('inventory/linked-scripts.json','utf8')),scripts={},audit={linked:[],replacements:[]};
for(const item of linked){
 const original=fs.readFileSync(item.path,'utf8');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex'),item.sha256);
 const source=original.replace(/(local function getWoundPanelWidth\(\)[\s\S]*?\r?\nend)/,match=>match.replace('  if wounds <= 10 then','  elseif wounds <= 10 then').replace('  if wounds <= 14 then','  elseif wounds <= 14 then'));
 const translated=translate(source,dictionary,{coordinatedCancel:true});if(translated.error)throw Error(item.url+translated.error);
 scripts[item.url]=translated.text;audit.linked.push({url:item.url,sourceSHA256:item.sha256,sourceRepair:source!==original,displayLiterals:translated.changes.length});
}
const table=JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-working.json','utf8'));
const pack=JSON.parse(fs.readFileSync('output/KT41-RU-working.json','utf8'));
const memo=new Map();
function pin(source){
 if(memo.has(source))return memo.get(source);
 const ast=parseSource(source).ast,patches=[];
 function walk(node){if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.base?.type==='MemberExpression'&&node.base.identifier?.name==='get'&&node.base.base?.name==='WebRequest'&&node.arguments[0]?.type==='StringLiteral'){
   const url=decode(node.arguments[0].raw);
   if(scripts[url]){
    assert.equal(node.arguments.length,2);const callback=node.arguments[1];assert.equal(callback.type,'FunctionDeclaration');
    const body=source.slice(...callback.range);
    // Match the asynchronous original fetch: the final ExtendUI readiness check must run first.
    const replacement='Wait.frames(function() ('+body+')({is_error=false, text=Global.call("ktRuGetScript", {url='+JSON.stringify(url)+'})}) end, 1)';
    patches.push({range:node.range,replacement,url});
   }
  }
  for(const [key,value]of Object.entries(node))if(!['range','loc'].includes(key)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
 }
 walk(ast);let result=source;for(const patch of patches.sort((a,b)=>b.range[0]-a.range[0]))result=result.slice(0,patch.range[0])+patch.replacement+result.slice(patch.range[1]);
 parseSource(result);const entry={text:result,urls:patches.map(x=>x.url)};memo.set(source,entry);return entry;
}
function visit(node,path,file){if(!node||typeof node!=='object')return;
 if(node.LuaScript){const result=pin(node.LuaScript);node.LuaScript=result.text;if(result.urls.length)audit.replacements.push({file,path,urls:result.urls});}
 for(const [key,value]of Object.entries(node))if(value&&typeof value==='object')visit(value,path+'/'+key,file);
}
// Helpers can spawn movement/targeting objects and fetch more scripts themselves.
// Pin those nested fetches too, using the same Global provider.
audit.helperReplacements=[];
for(const[url,source]of Object.entries(scripts)){
 const result=pin(source);scripts[url]=result.text;
 if(result.urls.length)audit.helperReplacements.push({url,urls:result.urls});
}
visit(table,'','table');visit(pack,'','teams');assert.ok(!table.LuaScript.includes('function ktRuGetScript'));
const declaration='\n\n-- Reviewed Russian helper scripts, pinned to the included source snapshots.\nlocal ktRuLinkedScripts = {\n'+Object.entries(scripts).map(([url,script])=>'['+JSON.stringify(url)+']='+JSON.stringify(script)).join(',\n')+'\n}\nfunction ktRuGetScript(params)\n  local script = ktRuLinkedScripts[params.url]\n  if not script then error("Русский вспомогательный скрипт не найден: " .. tostring(params.url)) end\n  return script\nend\n';
table.LuaScript+=declaration;parseSource(table.LuaScript);
fs.writeFileSync('output/KT24-The-Killzone-RU-bundled-working.json',JSON.stringify(table,null,2));
fs.writeFileSync('output/KT41-RU-bundled-working.json',JSON.stringify(pack,null,2));
fs.writeFileSync('output/linked-script-validation.json',JSON.stringify(audit,null,2));
console.log(JSON.stringify({pinnedHelpers:linked.length,helperSourceRepairs:audit.linked.filter(x=>x.sourceRepair).length,scriptOccurrencesUsingHelpers:audit.replacements.length}));
