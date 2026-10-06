const fs=require('fs'),assert=require('assert');
const pack=JSON.parse(fs.readFileSync('output/KT41-RU-preview-3.json'));
const report=JSON.parse(fs.readFileSync('inventory/operative-card-synchronization.json'));
const cards=JSON.parse(fs.readFileSync('ru-images-all-reviewed.json'));
const byGuid=new Map(),byPath=new Map();function scan(x,path=''){if(!x||typeof x!=='object')return;if(x.GUID&&x.LuaScriptState&&JSON.parse(x.LuaScriptState).info){byPath.set(path,x);byGuid.set(x.GUID,x);}for(const [key,v]of Object.entries(x))if(v&&typeof v==='object')scan(v,path+'/'+key);}scan(pack);
assert.equal(report.models,726);assert.equal(report.matched,726);let stats=0,weapons=0;
const clean=s=>s.replace(/\[(?:[0-9a-f]+|-)\]/gi,'').replace(/^\s*(?:\[[RM]\]|\(?[RM]\)?)\s*/,'').trim();
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const family=s=>norm(clean(s).replace(/\s*\((?:short range|long range|standard|supercharge|supercharged|mobile|stationary|frag|krak|focused|dispersed|offensive|defensive|sweep|strike|glide arrow|fused arrow|rending arrow)\)\s*$/i,''));
for(const row of report.report){
 const obj=byPath.get(row.path),st=JSON.parse(obj.LuaScriptState);const defs=row.cardIds.map(id=>cards[id]);const profile=defs.find(x=>x.weapons?.length)||defs[0];
 for(const [key,field]of Object.entries({APL:'APL',Move:'Move',Save:'Save',Wounds:'Wounds'})){assert.equal(st.stats[field],parseInt(profile.stats[key]),row.guid+' '+field);stats++;}
 assert(st.wounds<=st.stats.Wounds,row.guid+' over maximum wounds');
 assert(/\[84E680\]APL\[-\]\s*\[ffffff\]/.test(obj.Description),row.guid+' stat-description contract');
 for(const w of st.info.weapons){
  const type=w.name.replace(/\[(?:[0-9a-f]+|-)\]/gi,'').match(/^\s*(?:\[|\()?([RM])/)?.[1];
  const candidates=[...new Map(defs.flatMap(x=>x.weapons||[]).filter(x=>(!type||x.type===type)&&norm(x.english)===norm(clean(w.name))).map(x=>[x.type+'/'+norm(x.english),x])).values()];assert.equal(candidates.length,1,row.guid+' unmatched or ambiguous '+w.name);const current=candidates[0];
  assert.equal(w.stats.ATK,Number(current.atk));assert.equal(w.stats.HIT,parseInt(current.hit));assert.equal(w.stats.DMG,current.dmg);weapons++;
 }
 for(const a of st.info.actions||[])assert(!/\d+AP.*\d+AP/.test(a.name),'Duplicated AP cost '+a.name);
 for(const w of st.info.weapons){
  const type=w.name.replace(/\[(?:[0-9a-f]+|-)\]/gi,'').match(/^\s*(?:\[|\()?([RM])/)?.[1];
  for(const mode of defs.flatMap(x=>x.weapons||[]).filter(x=>(!type||x.type===type)&&family(x.english)===family(w.name)))
   assert(st.info.weapons.some(x=>norm(clean(x.name))===norm(mode.english)),row.guid+' missing selected weapon mode '+mode.english);
 }
}
for(const guid of ['5389b6','54db0a']){const st=JSON.parse(byGuid.get(guid).LuaScriptState);assert(st.info.actions.some(a=>/Omniscanner|Gaze of the Omnissiah/.test(a.name)),'Missing reconstructed Battleclade action');}
const result={models:726,currentStatValuesChecked:stats,currentWeaponProfilesChecked:weapons,fullWoundsWithinMaximum:true,allOperativesMatched:true,sourceSpecialActionsReconciled:true,nativeTTSRuntimeTested:false};
fs.writeFileSync('output/current-model-verification.json',JSON.stringify(result,null,2));console.log(result);
