const fs = require('fs');
const path = require('path');
const source = process.argv[2];
const mod = JSON.parse(fs.readFileSync(source, 'utf8'));
const out = path.join(__dirname, 'inventory');
fs.mkdirSync(out, {recursive:true});
const fields = new Map(), scripts = [], texts = [], assets = new Map(), objects = [];
function walk(value, loc) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && value.GUID) objects.push({path:loc,guid:value.GUID,type:value.Name,nickname:value.Nickname,description:value.Description});
  for (const [key,v] of Object.entries(value)) {
    const p = loc + '/' + key;
    if (typeof v === 'string' && v.trim()) {
      const stat = fields.get(key) || {count:0,chars:0}; stat.count++; stat.chars+=v.length; fields.set(key,stat);
      if (['Nickname','Description','GMNotes','Note','title','body','Text','SaveName'].includes(key)) texts.push({path:p,key,text:v});
      if (['LuaScript','XmlUI'].includes(key)) {
        const file = String(scripts.length).padStart(4,'0') + '-' + key + (key==='LuaScript'?'.lua':'.xml');
        fs.writeFileSync(path.join(out,file),v);
        scripts.push({path:p,file,chars:v.length});
      }
      for (const url of v.match(/https?:\/\/[^\s"'<>\\)]+/g) || []) {
        const a = assets.get(url) || {url,paths:[]}; if(a.paths.length<5)a.paths.push(p); assets.set(url,a);
      }
    } else if (v && typeof v === 'object') walk(v,p);
  }
}
walk(mod,'');
const unique = new Map();
for(const t of texts){const x=unique.get(t.text)||{text:t.text,keys:new Set(),count:0,paths:[]};x.count++;x.keys.add(t.key);if(x.paths.length<3)x.paths.push(t.path);unique.set(t.text,x);}
const uniqueTexts=[...unique.values()].map(x=>({...x,keys:[...x.keys]}));
fs.writeFileSync(path.join(out,'texts.json'),JSON.stringify(uniqueTexts,null,2));
fs.writeFileSync(path.join(out,'scripts.json'),JSON.stringify(scripts,null,2));
fs.writeFileSync(path.join(out,'assets.json'),JSON.stringify([...assets.values()],null,2));
fs.writeFileSync(path.join(out,'objects.json'),JSON.stringify(objects,null,2));
const summary={saveName:mod.SaveName,topLevel:Object.keys(mod),objects:objects.length,fields:Object.fromEntries([...fields].sort((a,b)=>b[1].chars-a[1].chars)),uniqueTexts:unique.size,textChars:uniqueTexts.reduce((n,x)=>n+x.text.length,0),scripts:scripts.length,scriptChars:scripts.reduce((n,x)=>n+x.chars,0),urls:assets.size,largestScripts:[...scripts].sort((a,b)=>b.chars-a.chars).slice(0,20)};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
