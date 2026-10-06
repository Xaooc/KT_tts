const fs=require('fs'),crypto=require('crypto');
const known=new Set(JSON.parse(fs.readFileSync('inventory/all-assets.json','utf8')).map(x=>x.url));const assets=new Map();
function add(url,context){if(known.has(url))return;const a=assets.get(url)||{id:crypto.createHash('sha256').update(url).digest('hex').slice(0,16),url,contexts:[]};a.contexts.push(context);assets.set(url,a);}
function walk(node,path,file){if(!node||typeof node!=='object')return;
 for(const [key,value]of Object.entries(node)){
  if(typeof value==='string'){
   if(/URL$/i.test(key)&&/^https?:\/\//.test(value))add(value,{file,path:path+'/'+key,kind:'structured-url',guid:node.GUID});
   if(['LuaScript','XmlUI'].includes(key))for(const m of value.matchAll(/https?:\/\/[^\s"'<>\\\]\},]+/g))add(m[0],{file,path:path+'/'+key,kind:'embedded-url',snippet:value.slice(Math.max(0,m.index-90),m.index+m[0].length+90)});
  }else if(value&&typeof value==='object')walk(value,path+'/'+key,file);
 }
}
for(const file of ['C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734.json','C:/Users/PC/Documents/My Games/Tabletop Simulator/Saves/Saved Objects/Chaos Cult.json'])walk(JSON.parse(fs.readFileSync(file,'utf8')),'',file);
const list=[...assets.values()];fs.writeFileSync('inventory/extra-assets.json',JSON.stringify(list,null,2));console.log(JSON.stringify({extraURLs:list.length,structured:list.filter(x=>x.contexts.some(c=>c.kind==='structured-url')).length,embedded:list.filter(x=>x.contexts.some(c=>c.kind==='embedded-url')).length,byKey:Object.fromEntries([...new Set(list.flatMap(x=>x.contexts.filter(c=>c.kind==='structured-url').map(c=>c.path.split('/').at(-1))))].map(key=>[key,list.filter(x=>x.contexts.some(c=>c.path.endsWith('/'+key))).length]))}));
