const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sources=[String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Mods\Workshop\3573927734.json`,String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Saves\Saved Objects\Chaos Cult.json`];
const assets=new Map();
function walk(v,loc,source){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(['ImageURL','FaceURL','BackURL','PDFUrl'].includes(k)&&typeof x==='string'&&x){const a=assets.get(x)||{id:crypto.createHash('sha256').update(x).digest('hex').slice(0,16),url:x,kind:k==='PDFUrl'?'pdf':'image',contexts:[]};a.contexts.push({source,path:loc+'/'+k,guid:v.GUID||null,name:v.Nickname||null});assets.set(x,a);}else if(x&&typeof x==='object')walk(x,loc+'/'+k,source);}}
for(const source of sources)walk(JSON.parse(fs.readFileSync(source,'utf8')),'',source);
const cache=String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Mods`;
const cacheFiles=['Images','Images Raw','PDF'].flatMap(folder=>fs.readdirSync(path.join(cache,folder)).map(name=>({name,path:path.join(cache,folder,name)})));
for(const a of assets.values()){const key=a.url.replace(/[^a-zA-Z0-9]/g,'');a.cache=cacheFiles.find(x=>path.parse(x.name).name===key)?.path||null;}
fs.writeFileSync('inventory/all-assets.json',JSON.stringify([...assets.values()],null,2));
console.log({unique:assets.size,images:[...assets.values()].filter(x=>x.kind==='image').length,cached:[...assets.values()].filter(x=>x.cache).length});
