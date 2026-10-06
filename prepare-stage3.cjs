const f=require('fs');
const p=JSON.parse(f.readFileSync('ru-team-prose.json','utf8'));
for(const k in p)p[k]=p[k].replaceAll('приказ «Атака» (Engage)','приказ «Бой» (Engage)').replaceAll('приказом «Атака» (Engage)','приказом «Бой» (Engage)');
f.writeFileSync('ru-team-prose.json',JSON.stringify(p,null,2)+'\n');
const b=f.readFileSync('build-stage3-source.cjs','utf8');
f.writeFileSync('build-stage3.cjs',b);
