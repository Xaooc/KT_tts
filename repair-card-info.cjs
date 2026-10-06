const fs=require('fs'),path=require('path');
const card=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-card-repairs.json'),'utf8'));
const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'ru-rule-texts.json'),'utf8'));
const sourceCards=Object.values(JSON.parse(fs.readFileSync(path.join(__dirname,'ru-images-vespid-plague-final.json'),'utf8'))).filter(c=>c.stats&&c.footerEnglish);
const standard={
  'Accurate x':'Точное x (Accurate x): вы можете сохранить до x кубиков атаки как обычные успехи без броска. Если у оружия несколько экземпляров Accurate x, можно считать, что вместо них у него один экземпляр Accurate 2. Это имеет приоритет над обычными правилами x.',
  'Blast x':rules.c8e1aad54d0dcfbc,'Devastating x':rules['0feaab5b7001c034'],
  'Range x':rules['5954b77490d0fca9'],'Lethal x+':rules.a9512075547a0240,
  'Severe':rules['09066e47b8c4df2b'],'Saturate':rules.e8934d58c9dca63d,
  'Torrent x':'Поток x (Torrent x): выберите допустимую основную цель по обычным правилам. Затем выберите любое количество других допустимых вторичных целей в пределах x от первой, но вне дистанции контроля своих оперативников. Стреляйте этим оружием по всем выбранным целям в любом порядке, отдельно проводя каждую последовательность бросков. Например, Torrent 2 дюйма.','Limited x':rules.ed25d7334d22b3f7,
  'Hot':rules.a79829c9858da8d4,'Piercing x':rules['24557293a41ba3f5'],
  'Heavy':rules['5158f639f940a488'],'Brutal':rules.fae5c509208d28bc,
  'Shock':rules.d8a5dcb437ef10e9,'Stun':rules['5973de204724deed'],
  'Poison':'Яд (Poison): на этапе применения кубиков атаки, если вы наносите урон хотя бы одним успехом, оперативник, против которого используется оружие, получает один ваш жетон Poison, если у него ещё нет такого жетона. При каждой активации оперативника с вашим жетоном Poison нанесите ему 1 урона.'
};
function profileFromDescription(description){
  const clean=description.replace(/\[(?:[0-9a-fA-F]{6}|-)\]/g,'');
  const statLine=clean.split(/\r?\n/)[1];
  const match=statLine?.match(/\bM\s*(\d+)".*\bAPL\s*(\d+).*\bSV\s*(\d+)\+.*\bW\s*(\d+)/);
  if(!match)throw Error('Cannot parse corrected operative profile: '+JSON.stringify(statLine));
  const [M,APL,SV,W]=match.slice(1).map(Number);
  const weapons=[];
  const section=clean.split('Weapons')[1]?.split('---')[0];
  if(!section)throw Error('Missing corrected weapon profiles');
  const pattern=/^([RM])\s+([^\r\n]+)\r?\nATK\s+(\d+)\s+HIT\s+(\d+)\+\s+DMG\s+(\d+\/\d+)(?:\r?\nWR\s*:\s*([^\r\n]+))?/gm;
  for(const weapon of section.matchAll(pattern))weapons.push({name:'('+weapon[1]+') '+weapon[2].trim(),stats:{ATK:Number(weapon[3]),HIT:Number(weapon[4]),DMG:weapon[5],WR:(weapon[6]||'-').trim()}});
  const names=section.match(/^[RM]\s+.+/gm)||[];
  if(!weapons.length||weapons.length!==names.length)throw Error('Incomplete corrected weapon profile');
  return {M,APL,SV,W,weapons};
}
module.exports=function repair(pack){
  const approved=new Map(),changes=[],seen=new Set();
  function walk(v,loc){if(!v||typeof v!=='object')return;
    const spec=card.models[v.GUID];
    if(spec){
      if(seen.has(v.GUID))throw Error('Repeated repair GUID '+v.GUID);seen.add(v.GUID);
      const state=JSON.parse(v.LuaScriptState);
      const set=(key,value)=>{const old=state.info[key];state.info[key]=value;approved.set(loc+'/LuaScriptState/info/'+key,JSON.stringify(value));changes.push({guid:v.GUID,path:loc+'/LuaScriptState/info/'+key,old,new:value});};
      const rows=names=>names.map(name=>({name,text:card.rules[name].russian}));
      set('abilities',rows(spec.abilities));set('actions',rows(spec.actions));set('special',[]);set('psychic',[]);
      const refs={};
      const description=v.Description||'';
      const profile=profileFromDescription(description);
      const weaponRules=profile.weapons.map(w=>w.stats.WR).join(', ');
      for(const [name,text] of Object.entries(standard)){
        if(typeof text!=='string'||!text)throw Error('Missing standard rule '+name);
        const raw=name.replace(/ x\+?$/,'');
        if(new RegExp('\\b'+raw+'\\b').test(weaponRules)||name==='Accurate x'&&spec.abilities.includes('Warrior Instincts'))refs[name]=text;
      }
      for(const name of spec.specialRules)refs[name]=card.rules[name].russian;
      set('rules',refs);
      if(spec.save!==undefined&&spec.save!==profile.SV)throw Error('Card and description Save disagree '+v.GUID);
      set('weapons',profile.weapons);
      const visibleName=description.split(/\r?\n/)[0].trim();
      const actualCard=sourceCards.find(c=>c.titleEnglish.toLowerCase()===(visibleName==='Shadestrain'?'Vespid Shadestrain':visibleName).toLowerCase());
      if(!actualCard)throw Error('Missing verified identity card '+v.GUID);
      const categoryCase={'T\'AU EMPIRE':"T'au Empire",CHAOS:'Chaos','HERETIC ASTARTES':'Heretic Astartes',LEADER:'Leader',PSYKER:'Psyker'};
      const keywords=actualCard.footerEnglish.split(' · ')[0].split(', ').map(k=>categoryCase[k]||k);
      const categories=[...new Set([...keywords,actualCard.titleEnglish,'Operative'])];
      set('name',actualCard.titleEnglish);set('modelType',actualCard.titleEnglish);set('categories',categories);
      set('upgrades',[...new Set(profile.weapons.map(w=>w.name.replace(/^\([RM]\) /,'')))]);
      // Preserve the New Recruit identifier and TTS GUID; only replace copied faction/loadout metadata.
      const tags=[...new Set([...(v.Tags||[]).filter(t=>t===state.info.id||t==='KTUIMini'||/^[0-9a-f]{4}(?:-[0-9a-f]{4}){3}$/.test(t)),...categories])];
      approved.set(loc+'/Tags',JSON.stringify(tags));changes.push({guid:v.GUID,path:loc+'/Tags',old:v.Tags,new:tags,source:'Verified source-card faction keywords'});v.Tags=tags;
      set('stats',{...state.info.stats,M:String(profile.M),APL:String(profile.APL),SV:profile.SV+'+',W:String(profile.W)});
      const correctedStats={...state.stats,M:profile.M,APL:profile.APL,SV:profile.SV,W:profile.W,Move:profile.M,Save:profile.SV,Wounds:profile.W};
      approved.set(loc+'/LuaScriptState/stats',JSON.stringify(correctedStats));
      changes.push({guid:v.GUID,path:loc+'/LuaScriptState/stats',old:state.stats,new:correctedStats,source:'Original visible operative Description; card verified'});
      state.stats=correctedStats;
      v.LuaScriptState=JSON.stringify(state);
    }
    for(const [key,x]of Object.entries(v))if(x&&typeof x==='object')walk(x,loc+'/'+key);
  }
  walk(pack,'');
  if(seen.size!==Object.keys(card.models).length)throw Error('Missing repaired models');
  return {approved,changes};
};
module.exports.profileFromDescription=profileFromDescription;
