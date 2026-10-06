const fs=require('fs'),assert=require('assert/strict');
const files=['ru-images-vespid-plague-final.json',...Array.from({length:11},(_,i)=>'ru-images-teams-'+String(i+1).padStart(2,'0')+'-final.json'),'ru-images-equipment.json','ru-images-missions.json','ru-images-table-remaining.json','ru-images-supplement.json'].filter(f=>fs.existsSync(f));
const merged={},owners={},duplicates=[];
const norm=v=>String(v??'').replace(/[″”]/g,'"').replace(/[−–—]/g,'-').replace(/\s/g,'').toLowerCase();
const numeric=c=>({stats:c.stats&&Object.fromEntries(Object.entries(c.stats).map(([k,v])=>[k,norm(v)])),weapons:(c.weapons||[]).map(w=>['atk','hit','dmg'].map(k=>norm(w[k])))});
const sharedStats=new Set(['78b06d6155a6a360','edb13cd012fa6e9a','d85d6ab829b14707']);
const sharedExaction=new Set(['c61e244c0f927306','6ad644f344ba5b82','25ef8bf0aa80d6d5','0db06d3365bef07e','241ec729a47ab6d3','fc0740e5d8275174','f4a9494cc76c2c42','5cfd07669b1c0709','e66e9094e783e53a','b1001a2ad47144d1']);
for(const file of files)for(const[id,card]of Object.entries(JSON.parse(fs.readFileSync(file,'utf8')))){
  assert.ok(card.verifiedAgainstPixels,'Unreviewed card '+id);
  if(!merged[id]){merged[id]=structuredClone(card);owners[id]=file;continue;}
  assert.ok(owners[id].includes('teams-04')&&file.includes('teams-06')||owners[id].includes('teams-05')&&file.includes('teams-06')||owners[id].includes('teams-06')&&file.includes('teams-07')&&sharedExaction.has(id),'Unexpected shared image '+id);
  const before=numeric(merged[id]),next=numeric(card);
  if(sharedStats.has(id)&&!before.stats&&next.stats){
    // Root inspected all three original backs: their stats bars must be preserved.
    merged[id].stats=structuredClone(card.stats);before.stats=next.stats;
  }
  assert.deepEqual(before,next,'Conflicting characteristics on shared original '+id);
  duplicates.push({id,selected:owners[id],alternate:file,statsAdded:sharedStats.has(id),reason:'One canonical translation per original image; the owning team translation is used. Source numeric profiles match.'});
}
fs.writeFileSync('ru-images-all-reviewed.json',JSON.stringify(merged,null,2)+'\n');
fs.writeFileSync('inventory/canonical-card-decisions.json',JSON.stringify({files,cards:Object.keys(merged).length,owners,duplicates},null,2)+'\n');
console.log({files:files.length,images:Object.keys(merged).length,sharedImages:duplicates.length});
