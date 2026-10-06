const fs=require('fs'),crypto=require('crypto');
const scripts=JSON.parse(fs.readFileSync('inventory/scripts.json'));
const hashes=new Map(),ui=new Map();
for(const s of scripts){if(!s.file.endsWith('.lua'))continue;const src=fs.readFileSync('inventory/'+s.file,'utf8');const h=crypto.createHash('sha256').update(src).digest('hex');if(hashes.has(h)){hashes.get(h).count++;continue;}hashes.set(h,{file:s.file,count:1,chars:s.chars});
for(const m of src.matchAll(/(?:\b(?:label|tooltip)\s*=\s*|\.addContextMenuItem\(\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)){const raw=m[1];let text=raw.slice(1,-1).replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\(["'\\])/g,'$1');const x=ui.get(text)||{text,count:0,files:[]};x.count++;if(x.files.length<3)x.files.push(s.file);ui.set(text,x);}}
fs.writeFileSync('inventory/unique-scripts.json',JSON.stringify([...hashes.values()],null,2));
fs.writeFileSync('inventory/ui-strings.json',JSON.stringify([...ui.values()],null,2));
console.log('Unique Lua scripts:',hashes.size,'UI strings:',ui.size);console.log([...ui.values()].map((x,i)=>i+' '+JSON.stringify(x.text)).join('\n'));
