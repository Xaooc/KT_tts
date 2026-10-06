// Match physical source operatives to their current card profiles, with explicit legacy aliases.
const fs=require('fs');
const cards=JSON.parse(fs.readFileSync('ru-images-all-reviewed.json','utf8'));
const assets=JSON.parse(fs.readFileSync('inventory/card-assets.json','utf8'));
const genericRules=JSON.parse(fs.readFileSync('ru-current-weapon-rules.json','utf8'));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\[(?:[0-9a-f]+|-)\]/gi,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const strip=s=>String(s||'').replace(/\[(?:[0-9a-f]+|-)\]/gi,'').replace(/^[CE]\s*\{[^}]+\}\s*/,'').replace(/^\[\d+\/\d+\]\s*/,'').replace(/\s+(?:w\/|with) .*/i,'').replace(/\s*·.*$/,'').replace(/\s+reverse$/i,'').replace(/\s+\([^)]*\)$/,'').trim();
const weaponName=s=>String(s||'').replace(/\[(?:[0-9a-f]+|-)\]/gi,'').replace(/^\s*(?:\[[RM]\]|\(?[RM]\)?)\s*/,'').trim();
const weaponType=s=>String(s||'').replace(/\[(?:[0-9a-f]+|-)\]/gi,'').match(/^\s*(?:\[|\()?([RM])/)?.[1];
const weaponFamily=s=>norm(weaponName(s).replace(/\s*\((?:short range|long range|standard|supercharge|supercharged|mobile|stationary|frag|krak|focused|dispersed|offensive|defensive|sweep|strike|glide arrow|fused arrow|rending arrow)\)\s*$/i,''));
const groups=new Map();
for(const a of assets)if(a.source==='teams'&&a.team&&cards[a.face.id]?.stats){
 const key=norm(a.team);if(!groups.has(key))groups.set(key,new Map());
 const title=cards[a.face.id].titleEnglish.replace(/\s*·.*$/,'').replace(/\s+reverse$/i,'');
 if(!groups.get(key).has(norm(title)))groups.get(key).set(norm(title),{title,cards:new Map()});
 const item=groups.get(key).get(norm(title));item.cards.set(a.face.id,cards[a.face.id]);
 const back=cards[a.back?.id];if(back&&!/CARD BACK/.test(back.categoryEnglish||'')&&!back.decorativeSource)item.cards.set(a.back.id,back);
}
const aliases={
 'Sergeant Veteran':'Death Korps Watchmaster','Trooper Veteran':'Death Korps Trooper','Gunner Veteran':'Death Korps Gunner','Bruiser Veteran':'Death Korps Bruiser','Zealot Veteran':'Death Korps Zealot','Medic Veteran':'Death Korps Medic','Sniper Veteran':'Death Korps Sniper','Confidant Veteran':'Death Korps Confidant','Comms Veteran':'Death Korps Vox-Operator','Demolition Veteran':'Death Korps Sapper','Spotter Veteran':'Death Korps Spotter','Hardened Veteran':'Death Korps Veteran',
 'Communications Specialist Pathfinder':'Comms Specialist Pathfinder','Boss Nob':'Kommando Nob','Kommando Boss Nob':'Kommando Nob','Legionary Annointed':'Legionary Anointed','Starstorm Duellist':'Voidscarred Starstorm Duelist','Novitiate Duelist':'Novitiate Duellist','Novitiate Hospitaller':'Novitiate Hospitaller',
 'Neophyte Brood Adept':'Neophyte Warrior','Neophyte Brood-Adept':'Neophyte Warrior','Sicarian Ruststalker Assassin':'Sicarian Ruststalker Warrior','Sicarian Infiltrator Tracker':'Sicarian Infiltrator Warrior','Tzaangor Fighter':'Tzaangor Warrior',
};
module.exports=function sync(pack,options={}){
 const approved=new Map(),report=[];
 function visit(v,loc,faction){
  if(!v||typeof v!=='object')return;
  if(v.LuaScriptState){const st=JSON.parse(v.LuaScriptState),info=st.info;
   if(info){const available=[...(groups.get(norm(faction))?.values()||[])];
    const candidateNames=[strip(v.Nickname),strip(info.name),strip(info.modelType)].filter(Boolean).map(n=>n==='Gunner'&&faction==='Corsair Voidscarred'?'Voidscarred Gunner':n==='Gunner'&&faction==='Nemesis Claw'?'Night Lord Gunner':aliases[n]||n);
    let found;
    for(const raw of candidateNames){const n=norm(raw);const exact=available.filter(x=>norm(x.title)===n);if(exact.length===1){found=exact[0];break;}}
    if(!found)for(const raw of candidateNames){const n=norm(raw);const suffix=available.filter(x=>norm(x.title).endsWith(n)||n.endsWith(norm(x.title)));if(suffix.length===1){found=suffix[0];break;}}
    report.push({guid:v.GUID,path:loc,team:faction,name:strip(v.Nickname),sourceName:info.name,modelType:info.modelType,matchedTitle:found?.title||null,cardIds:found?[...found.cards.keys()]:[]});
    if(found&&!options.inventoryOnly){
     const before=JSON.stringify(info),beforeStats=JSON.stringify(st.stats),beforeDesc=v.Description,beforeWounds=st.wounds,beforeNickname=v.Nickname;
     const oldMax=Number(st.stats?.Wounds||st.stats?.W||info.stats?.W);
     const definitions=[...found.cards.values()],profile=definitions.find(x=>x.weapons?.length)||definitions[0];
     const relevantText=definitions.flatMap(x=>[...(x.weapons||[]).map(w=>w.wrEnglish),...(x.blocks||[]).map(b=>b.english)]).join('\n');
     info.rules=Object.fromEntries(Object.entries(info.rules||{}).filter(([name])=>!Object.keys(genericRules).some(k=>norm(k)===norm(name))&&norm(name).length>2&&norm(relevantText).includes(norm(name.replace(/^\*/,'').replace(/\s*x$/,'')))));
     for(const [name,rule]of Object.entries(genericRules))if(relevantText.includes(name))info.rules[name]=rule.russian;
     const stats=profile.stats;
     st.stats||={};info.stats||={};
     for(const [key,field]of Object.entries({APL:'APL',Move:'M',Save:'SV',Wounds:'W'}))if(stats[key]!==undefined){
      const num=parseInt(stats[key]);st.stats[key]=num;if(Object.hasOwn(st.stats,field))st.stats[field]=num;info.stats[field]=key==='Save'?num+'+':String(num);
     }
     if(typeof st.wounds==='number')st.wounds=st.wounds>=oldMax?st.stats.Wounds:Math.min(st.wounds,st.stats.Wounds);
     if(typeof st.wounds==='number')v.Nickname=v.Nickname.replace(/\{\d+\/\d+\}/,'{'+st.wounds+'/'+st.stats.Wounds+'}');
     // Source display names can describe a different copied operative (notably the Deathwatch pack).
     info.name=found.title;info.modelType=found.title;info.ktRuTeam=faction;
     const blocks=[...new Map(definitions.flatMap(x=>x.blocks||[]).filter(b=>b.russian&&b.type!=='diagram'&&!/diagram|Rules Commentary|^Rule$|TORCH ZONE|^Allegory/i.test(b.headingEnglish||'')).map(b=>[(b.headingEnglish||'')+'\n'+b.russian,b])).values()];
     info.abilities=[];info.actions=[];info.special=[];info.psychic=[];
     for(const b of blocks){let name=(b.headingEnglish||'').replace(/\s*·.*$/,'').replace(/\s*\(\d+\s*AP\).*$/,'').replace(/:.*$/,'').replace(/^\*|\*$/g,'');
      const ap=(b.headingEnglish||'').match(/(\d+(?:\/\d+)?)\s*AP/)||String(b.english||'').match(/^\s*(\d+(?:\/\d+)?)\s*AP/);
      name=name.replace(/\s*[—–-]?\s*\d+(?:\/\d+)?\s*AP\s*$/,'').trim();
      const weaponRule=/weapon rule|^\*|\*$/.test(b.headingEnglish||'')||profile.weapons?.some(w=>(w.wrEnglish||'').includes(name));
      if(weaponRule){info.rules||={};info.rules[name]=b.russian;}
      else info[ap?'actions':'abilities'].push({name:ap?name+' ('+ap[1]+'AP)':name,text:b.russian});
     }
     const currentWeapons=[...new Map(definitions.flatMap(x=>x.weapons||[]).map(w=>[w.type+'/'+norm(w.english),w])).values()];
     const previousWeapons=info.weapons||[];
     const matchedWeapons=previousWeapons.map(w=>({old:w,current:currentWeapons.find(x=>norm(x.english)===norm(weaponName(w.name))&&x.type===(weaponType(w.name)||x.type))})).filter(x=>x.current);
     // Preserve the selected loadout if it matches a current card; replace copied foreign loadouts by the card.
     const dropped=previousWeapons.filter(w=>!matchedWeapons.some(m=>m.old===w));
     const use=matchedWeapons.length?matchedWeapons:currentWeapons.map(w=>({current:w}));
     report[report.length-1].unmatchedSourceWeapons=dropped.map(w=>w.name);
     // A copied loadout can partly match (e.g. fists), while its primary weapon belongs to another unit.
     for(const w of currentWeapons)if(dropped.length&&!use.some(x=>x.current.type===w.type))use.push({current:w});
     const hint=String(v.Nickname).split(/\s+(?:w\/|with)\s+/i)[1];
     if(hint){const named=currentWeapons.filter(w=>norm(hint).includes(norm(w.english.replace(/\s*\([^)]*\)$/,''))));
      if(named.length)for(let i=use.length-1;i>=0;i--)if(named.some(w=>w.type===use[i].current.type)&&!named.includes(use[i].current))use.splice(i,1);
     }
     // Selecting a weapon includes all of its current firing/attack modes, even when an old mode name was misspelled.
     const selectedFamilies=new Set(use.map(x=>x.current.type+'/'+weaponFamily(x.current.english)));
     for(const w of currentWeapons)if(selectedFamilies.has(w.type+'/'+weaponFamily(w.english))&&!use.some(x=>x.current===w))use.push({current:w});
     info.weapons=use.map(({old,current:w})=>({...(old||{}),name:old?.name||'('+w.type+') '+w.english,stats:{ATK:Number(w.atk),HIT:parseInt(w.hit),DMG:w.dmg,WR:w.wrEnglish==='—'?'':w.wrEnglish||''}}));
     const rows=info.weapons.map((w,i)=>{const name=weaponName(w.name),card=use[i].current;return card.type+' '+name+'\nATK '+w.stats.ATK+' HIT '+w.stats.HIT+'+ DMG '+w.stats.DMG+'\nWR: '+(w.stats.WR||'—');});
     v.Description=['APL','MOVE','SAVE','WOUNDS'].map((key,i)=>'[84E680]'+key+'[-] [ffffff] '+st.stats[['APL','Move','Save','Wounds'][i]]+(key==='MOVE'?'"':key==='SAVE'?'+':'')+'[-]').join('\n')+'\nWeapons\n'+rows.join('\n')+'\n---';
     v.LuaScriptState=JSON.stringify(st);
     if(before!==JSON.stringify(info))approved.set(loc+'/LuaScriptState/info',JSON.stringify(info));
     if(beforeStats!==JSON.stringify(st.stats))approved.set(loc+'/LuaScriptState/stats',JSON.stringify(st.stats));
     if(beforeWounds!==st.wounds)approved.set(loc+'/LuaScriptState/wounds',JSON.stringify(st.wounds));
     if(beforeNickname!==v.Nickname)approved.set(loc+'/Nickname',JSON.stringify(v.Nickname));
     if(beforeDesc!==v.Description)approved.set(loc+'/Description',JSON.stringify(v.Description));
    }
   }
  }
  for(const [k,x]of Object.entries(v))if(k!=='States'&&x&&typeof x==='object')visit(x,loc+'/'+k,faction);
 }
 for(const [i,root]of pack.ObjectStates.entries()){
  visit(root,'/ObjectStates/'+i,root.Nickname);for(const [k,x]of Object.entries(root.States||{}))visit(x,'/ObjectStates/'+i+'/States/'+k,x.Nickname);
 }
 fs.writeFileSync('inventory/operative-card-synchronization.json',JSON.stringify({models:report.length,matched:report.filter(x=>x.matchedTitle).length,report},null,2));return {approved,changes:report};
};
if(require.main===module)module.exports(JSON.parse(fs.readFileSync('output/KT41-RU-preview-3.json','utf8')),{inventoryOnly:true});
