const fs=require('fs');
const s=JSON.parse(fs.readFileSync('inventory/scripts.json')).filter(x=>x.file.endsWith('.xml'));
const vals=new Set();
for(const x of s){const xml=fs.readFileSync('inventory/'+x.file,'utf8');for(const m of xml.matchAll(/>([^<>]*[A-Za-z][^<>]*)<|(?:text|tooltip)="([^"]+)"/g))vals.add(m[1]||m[2]);}
console.log([...vals].map(x=>JSON.stringify(x)).join('\n'));
