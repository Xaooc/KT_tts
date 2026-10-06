const fs=require('fs'),path=require('path'),crypto=require('crypto');
const source=String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Saves\Saved Objects\Chaos Cult.json`;
const bytes=fs.readFileSync(source),mod=JSON.parse(bytes);
const roots=[];
for(const [i,o]of(mod.ObjectStates||[]).entries()){
  if(o.Name.includes('Bag')&&o.Nickname)roots.push({object:o,path:'/ObjectStates/'+i});
  for(const [k,v]of Object.entries(o.States||{}))if(v.Name.includes('Bag')&&v.Nickname)roots.push({object:v,path:'/ObjectStates/'+i+'/States/'+k});
}
const catalog=[],segments=new Map();
function add(text,context){if(typeof text!=='string'||!text.trim())return;const id=crypto.createHash('sha256').update(text).digest('hex').slice(0,16);const x=segments.get(id)||{id,english:text,russian:null,contexts:[]};if(x.contexts.length<8)x.contexts.push(context);segments.set(id,x);}
function infoWalk(v,loc,team,guid){if(!v||typeof v!=='object')return;for(const[k,x]of Object.entries(v)){if(typeof x==='string'&&['text','description','desc'].includes(k))add(x,{team,guid,kind:'saved-info',path:loc+'/'+k});else if(x&&typeof x==='object')infoWalk(x,loc+'/'+k,team,guid);}}
function scan(v,loc,team,counts){if(!v||typeof v!=='object')return;if(v.GUID){counts.objects++;if(v.Name.includes('Card'))counts.cards++;if(v.Name==='Custom_PDF')counts.pdfs++;if(v.Description?.length>80&&!v.Description.startsWith('{'))add(v.Description,{team,guid:v.GUID,kind:'object-description',path:loc+'/Description'});if(v.LuaScriptState)try{const s=JSON.parse(v.LuaScriptState);if(s.info){counts.operativeInfos++;infoWalk(s.info,loc+'/LuaScriptState/info',team,v.GUID);if(s.info.stats&&('M'in s.info.stats||'DF'in s.info.stats||'GA'in s.info.stats))counts.legacyStatSchemas++;}}catch{}}
  for(const[k,x]of Object.entries(v))if(k!=='States'&&x&&typeof x==='object')scan(x,loc+'/'+k,team,counts);
}
for(const r of roots){const counts={objects:0,cards:0,pdfs:0,operativeInfos:0,legacyStatSchemas:0};scan(r.object,r.path,r.object.Nickname,counts);catalog.push({name:r.object.Nickname,path:r.path,guid:r.object.GUID,status:'inventoried; translation pending',...counts});}
const out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'team-catalog.json'),JSON.stringify({source,sourceSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),scope:'41 local team packs; not verified against the complete current official roster',teams:catalog,segments:segments.size,segmentChars:[...segments.values()].reduce((n,x)=>n+x.english.length,0)},null,2));
fs.writeFileSync(path.join(out,'team-translation-segments.json'),JSON.stringify([...segments.values()],null,2));
console.log('Local teams',catalog.length,'unique translation segments',segments.size,'chars',[...segments.values()].reduce((n,x)=>n+x.english.length,0));
console.log(catalog.map(x=>x.name+' — '+x.cards+' cards, '+x.operativeInfos+' operative data blocks'+(x.legacyStatSchemas?' ('+x.legacyStatSchemas+' legacy stat schemas)':'')).join('\n'));
