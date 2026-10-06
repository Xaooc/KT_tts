const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const {parseSource,decode}=require('./lua-display.cjs');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('./tools/node_modules/fengari');
const table=JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-bundled-working.json','utf8'));
const pack=JSON.parse(fs.readFileSync('output/KT41-RU-bundled-working.json','utf8'));
const linked=JSON.parse(fs.readFileSync('inventory/linked-scripts.json','utf8'));
const audit=JSON.parse(fs.readFileSync('output/linked-script-validation.json','utf8'));
assert.equal(audit.linked.length,linked.length);
for(const item of linked)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex'),item.sha256);
function structure(a,b,path=''){
 if(path.endsWith('/LuaScript'))return;
 if(JSON.stringify(a)===JSON.stringify(b))return;
 assert.ok(a&&b&&typeof a==='object'&&typeof b==='object','Unexpected data mutation '+path);
 assert.deepEqual(Object.keys(a),Object.keys(b),'Topology '+path);
 for(const k of Object.keys(a))structure(a[k],b[k],path+'/'+k);
}
structure(JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-working.json','utf8')),table);
structure(JSON.parse(fs.readFileSync('output/KT41-RU-working.json','utf8')),pack);
const prefix=table.LuaScript.lastIndexOf('local ktRuLinkedScripts = {');assert.ok(prefix>0);
const provider=table.LuaScript.slice(prefix),ast=parseSource(provider).ast;
const scripts={};for(const field of ast.body[0].init[0].fields)scripts[decode(field.key.raw)]=decode(field.value.raw);
assert.deepEqual(Object.keys(scripts).sort(),linked.map(x=>x.url).sort());
const functions=new Set(),seen=new Set();
function visit(v){if(!v||typeof v!=='object')return;
 if(v.LuaScript&&!seen.has(v.LuaScript)){
  seen.add(v.LuaScript);const ast=parseSource(v.LuaScript).ast;
  for(const n of ast.body)if(n.type==='FunctionDeclaration'&&n.identifier?.name==='ExtendUI')functions.add(v.LuaScript.slice(...n.range));
 }
 for(const x of Object.values(v))if(x&&typeof x==='object')visit(x);
}
visit(table);visit(pack);
let nested=0;
for(const [url,source]of Object.entries(scripts)){
 parseSource(source);
 assert.ok(!source.includes('WebRequest.get('),'Nested script still fetches network code '+url);
 nested+=(source.match(/Global.call\("ktRuGetScript"/g)||[]).length;
}
assert.ok(nested>=7);assert.equal(functions.size,3);
function run(source){const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 let status=lauxlib.luaL_loadstring(L,to_luastring(source));if(status===lua.LUA_OK)status=lua.lua_pcall(L,0,0,0);
 if(status!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));lua.lua_close(L);
}
const harness=provider+'\nlocal jobs={}\nWait={frames=function(fn,n) assert(n==1);jobs[#jobs+1]=fn end}\nGlobal={call=function(name,p) assert(name=="ktRuGetScript");return ktRuGetScript(p) end}\nlog=function(x) error(x) end\n';
let scenarios=0;
for(const fn of functions){
 if(fn.includes('if not oldScript'))run(harness+fn+`\nlocal calls=0
extendUIForAllModels=function(player) assert(player=="Blue");assert(oldScript and kt24Script);calls=calls+1 end
ExtendUI("Blue");assert(#jobs==2 and calls==0)
jobs[1]();assert(calls==0);jobs[2]();assert(calls==1)
ExtendUI("Blue");assert(calls==2 and #jobs==2)`);
 else if(fn.includes('object.setLuaScript'))run(harness+fn+`\nlocal updated=0;local reloaded=0;local obj
obj={setLuaScript=function(s) assert(s:find("function "));updated=updated+1 end,reload=function()reloaded=reloaded+1;return obj end}
ExtendUI(obj);assert(#jobs==1 and updated==0 and reloaded==0)
jobs[1]();assert(updated==1 and reloaded==1)`);
 else run(harness+fn+`\nlocal updated=0;local a={};local b={}
detectItemOnTop=function()return {{hit_object=a},{hit_object=b}} end
UpdateModelScript=function(player,obj,s)assert(player=="Blue");assert(obj==a or obj==b);assert(s:find("function "));updated=updated+1 end
ExtendUI("Blue");assert(#jobs==1 and updated==0);jobs[1]();assert(updated==2)`);
 scenarios++;
}
console.log(JSON.stringify({pinnedHelpers:linked.length,nestedFetchesPinned:nested,asynchronousExtenderScenarios:scenarios,dataAndIdentifiers:'preserved',nativeTTSRuntimeTested:false}));
