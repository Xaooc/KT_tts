// Keep current numeric profiles and newly added rules consistent between cards, saved state and HUD source descriptions.
const fs=require('fs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const cards=read('ru-images-all-reviewed.json');
const patches=fs.readdirSync('.').filter(n=>/^ru-current-updates-.*\.json$/.test(n)).flatMap(read);
const norm=s=>String(s||'').replace(/\[(?:[0-9a-f]+|-)\]/gi,'').replace(/^\(?[RM]\)?\s+/,'').replace(/\s+·.*$/,'').replace(/\s+reverse$/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const team=s=>norm({'Hearthkyn Salvagers':'Hearthkyn Salvager','Fellgor Ravagers':'Fellgor Ravager','Vespid Stingwings':'Vespids Stingwing'}[s]||s);
function operativeKey(name,faction){
 let n=norm(String(name).split(/ w\/ | with /i)[0]);
 if(team(faction)==='kommandos'){n=n.replace(/^kommando/,'');if(n==='bossnob')n='nob';}
 if(team(faction)==='handofthearchon')n=n.replace(/^kabalite/,'');
 if(team(faction)==='hunterclade')n=n.replace(/(?:warrior|marksman|shocktrooper|assassin|tracker)$/,'');
 if(team(faction)==='warpcoven'&&n.startsWith('sorcerer'))n='sorcerer';
 if(team(faction)==='kasrkin')n=n.replace(/^kasrkin/,'');
 return n;
}
module.exports=function sync(pack){
 const approved=new Map(),changes=[],seen=new Map(),targets=new Map();
 for(const patch of patches){
  const card=cards[patch.id];
  if(!card.stats)continue;
  const newRules=(patch.blocks||[]).filter(b=>b.heading!=='Rules Commentary'&&b.heading!=='Rule'&&!/torrent/i.test(b.heading));
  if(!patch.stats&&!patch.weapons&&!patch.keyword&&!newRules.length)continue;
  const key=team(patch.team)+'/'+operativeKey(card.originalTitleEnglish||card.titleEnglish,patch.team);
  if(!targets.has(key))targets.set(key,[]);targets.get(key).push({...patch,newRules});
 }
 function visit(v,loc,faction){
  if(!v||typeof v!=='object')return;
  if(v.LuaScriptState){
   const state=JSON.parse(v.LuaScriptState),info=state.info;
   if(info){
    const candidates=[operativeKey(info.modelType,faction),operativeKey(info.name,faction)];
    const matched=[...new Set(candidates.flatMap(n=>targets.get(team(faction)+'/'+n)||[]))];
    if(matched.length){
     const beforeInfo=JSON.stringify(info),beforeStats=JSON.stringify(state.stats),beforeDescription=v.Description;
     for(const patch of matched){
      seen.set(patch.id,(seen.get(patch.id)||0)+1);const card=cards[patch.id];
      if(patch.stats){
       const aliases={Wounds:['Wounds','W'],Save:['Save','SV'],Move:['Move','M'],APL:['APL']};
       for(const [field,value] of Object.entries(patch.stats)){
        const numeric=Number(String(value).replace(/["+]/g,''));
        state.stats||={};info.stats||={};
        for(const name of aliases[field]){
         if(name===aliases[field][0]||Object.hasOwn(state.stats,name))state.stats[name]=numeric;
         if(Object.hasOwn(info.stats,name))info.stats[name]=typeof info.stats[name]==='string'?String(numeric)+(field==='Save'?'+':''):numeric;
        }
        const short={Wounds:'W',Save:'SV',Move:'M',APL:'APL'}[field];
        v.Description=v.Description.replace(new RegExp('(\\b'+short+'\\s*(?:\\[[^\\]]+\\]\\s*)?)(\\d+)(["+]?)','g'),(_,prefix,old,suffix)=>prefix+numeric+suffix);
       }
      }
      for(const change of patch.weapons||[]){
       const profile=card.weapons.find(w=>w.english===change.name);if(!profile)throw Error('Current card weapon missing '+patch.id);
       const desired={ATK:Number(profile.atk),HIT:Number(String(profile.hit).replace('+','')),DMG:profile.dmg,WR:profile.wrEnglish==='—'?'':profile.wrEnglish||''};
       const matching=(info.weapons||[]).filter(w=>norm(w.name)===norm(change.name));
       for(const w of matching){
        w.stats||={};for(const [k,val]of Object.entries(desired))w.stats[k]=typeof w.stats[k]==='string'&&typeof val==='number'?String(val):val;
       }
       let descriptions=0;
       const lines=v.Description.split(/\r?\n/);
       for(let i=0;i<lines.length;i++){
        const clean=lines[i].replace(/\[(?:[0-9a-f]+|-)\]/gi,'');
        const found=clean.match(/^\s*([RM])\s+(.+)$/);
        if(!found||norm(found[2])!==norm(change.name))continue;
        const end=lines.findIndex((line,j)=>j>i&&(/^[RM]\s+/.test(line.replace(/\[(?:[0-9a-f]+|-)\]/gi,''))||/^---/.test(line)));
        const stop=end===-1?lines.length:end;
        let hadWR=false;
        for(let j=i+1;j<stop;j++){
         if(/\bATK\b/.test(lines[j]))lines[j]=lines[j].replace(/(ATK\s*(?:\[[^\]]+\]\s*)?)\d+/,(_,s)=>s+desired.ATK).replace(/(HIT\s*(?:\[[^\]]+\]\s*)?)\d+\+/,(_,s)=>s+desired.HIT+'+').replace(/(DMG\s*(?:\[[^\]]+\]\s*)?)\d+\/\d+/,(_,s)=>s+desired.DMG);
         if(/\bWR\b/.test(lines[j])){lines[j]='WR: '+(desired.WR||'—');hadWR=true;}
        }
        if(!hadWR&&desired.WR)lines.splice(stop,0,'WR: '+desired.WR);
        descriptions++;
       }
       v.Description=lines.join('\n');
       if(change.append&&!descriptions){
        const rawName='('+profile.type+') '+change.name;info.weapons||=[];
        if(!matching.length)info.weapons.push({name:rawName,stats:desired});
        const label=profile.type+' '+change.name+'\nATK '+desired.ATK+' HIT '+desired.HIT+'+ DMG '+desired.DMG+'\nWR: '+(desired.WR||'—')+'\n';
        const start=v.Description.indexOf('Weapons');const end=v.Description.indexOf('---',start);
        if(start<0||end<0)throw Error('No bounded weapon section '+v.GUID);
        v.Description=v.Description.slice(0,end)+label+v.Description.slice(end);
       }else if(!change.append&&!descriptions&&!matching.length){
        // A different loadout can legitimately lack this weapon; record its unchanged identity.
        changes.push({guid:v.GUID,card:patch.id,weaponNotInLoadout:change.name});
       }
      }
      for(const rule of patch.newRules){
       const category=rule.moveCategory||(/\d+\s*AP/.test(rule.heading)?'actions':'abilities');info[category]||=[];
       const name=rule.heading.replace(/\s*·.*$/,'').replace(/\s*\(\d+AP\)$/,'').replace(/:.*$/,'');
       if(rule.moveCategory)for(const group of ['abilities','actions'])if(group!==category)info[group]=(info[group]||[]).filter(x=>norm(x.name.replace(/\s*\((?:AP\d+|\d+AP)\)$/,''))!==norm(name));
       let found=false;
       for(const group of ['abilities','actions','special','psychic']){
        function update(v){if(!v||typeof v!=='object')return;
         if(typeof v.name==='string'&&norm(v.name.replace(/^\*/,'').replace(/\s*\((?:AP\d+|\d+AP)\)$/,''))===norm(name)&&typeof v.text==='string'){v.text=rule.russian;found=true;}
         for(const child of Object.values(v))if(child&&typeof child==='object')update(child);
        }
        update(info[group]);
       }
       if(!found&&(rule.append||rule.moveCategory))info[category].push({name,text:rule.russian});
      }
      if(patch.keyword){info.categories||=[];if(!info.categories.some(k=>norm(k)===norm(patch.keyword[0])))info.categories.push(patch.keyword[0]);}
     }
     const stateLoc=loc+'/LuaScriptState';
     if(JSON.stringify(info)!==beforeInfo)approved.set(stateLoc+'/info',JSON.stringify(info));
     if(JSON.stringify(state.stats)!==beforeStats)approved.set(stateLoc+'/stats',JSON.stringify(state.stats));
     if(v.Description!==beforeDescription)approved.set(loc+'/Description',JSON.stringify(v.Description));
     v.LuaScriptState=JSON.stringify(state);
     changes.push({guid:v.GUID,team:faction,cards:[...new Set(matched.map(x=>x.id))],infoChanged:JSON.stringify(info)!==beforeInfo,statsChanged:JSON.stringify(state.stats)!==beforeStats,descriptionChanged:v.Description!==beforeDescription});
    }
   }
  }
  for(const [k,x]of Object.entries(v))if(k!=='States'&&x&&typeof x==='object')visit(x,loc+'/'+k,faction);
 }
 for(const [i,root]of pack.ObjectStates.entries()){
  visit(root,'/ObjectStates/'+i,root.Nickname);
  for(const [id,state]of Object.entries(root.States||{}))visit(state,'/ObjectStates/'+i+'/States/'+id,state.Nickname);
 }
 const unmatched=[...targets.values()].flat().filter(p=>!seen.has(p.id)).map(p=>({id:p.id,team:p.team,title:p.expectedTitle}));
 fs.writeFileSync('inventory/current-model-synchronization.json',JSON.stringify({changes,unmatched,sourceIdentitiesPreserved:true,nativeTTSRuntimeTested:false},null,2));
 return {approved,changes};
};
