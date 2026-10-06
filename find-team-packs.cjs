const fs=require('fs'),path=require('path');
const roots=[String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Mods\Workshop`,String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Saves\Saved Objects`];
const reports=[];
function inspect(file){if(path.basename(file)==='WorkshopFileInfos.json'||path.basename(file)==='3573927734.json')return;try{const m=JSON.parse(fs.readFileSync(file,'utf8'));const names=new Set();let objects=0;function walk(v){if(!v||typeof v!=='object')return;if(v.GUID){objects++;if(v.Nickname)names.add(v.Nickname.replace(/\[[\dA-Fa-f]{6}\]|\[-\]/g,''));}for(const x of Object.values(v))if(x&&typeof x==='object')walk(x);}walk(m);reports.push({file,name:m.SaveName,objects,names:[...names].slice(0,100)});}catch(e){reports.push({file,error:e.message});}}
function directory(p){if(!fs.existsSync(p))return;for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())directory(f);else if(e.name.endsWith('.json'))inspect(f);}}
roots.forEach(directory);
fs.writeFileSync('inventory/team-packs.json',JSON.stringify(reports,null,2));
for(const r of reports)console.log(JSON.stringify({...r,names:r.names?.slice(0,18)}));
