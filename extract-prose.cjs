const fs=require('fs'),crypto=require('crypto');
const source=String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Saves\Saved Objects\Chaos Cult.json`;
const mod=JSON.parse(fs.readFileSync(source,'utf8'));
const all=new Map();
function add(english,ctx){if(typeof english!=='string'||!english.trim())return;const id=crypto.createHash('sha256').update(english).digest('hex').slice(0,16);const entry=all.get(id)||{id,english,contexts:[],count:0};entry.count++;if(!entry.contexts.some(x=>x.team===ctx.team&&x.title===ctx.title))entry.contexts.push(ctx);all.set(id,entry);}
function proseWalk(value,loc,team,guid,category){if(!value||typeof value!=='object')return;for(const [key,x]of Object.entries(value)){if(typeof x==='string'&&['text','description','desc'].includes(key))add(x,{team,guid,category,title:value.name||'',path:loc+'/'+key});else if(x&&typeof x==='object')proseWalk(x,loc+'/'+key,team,guid,category);}}
function scan(v,loc,team){if(!v||typeof v!=='object')return;if(v.LuaScriptState){let s;try{s=JSON.parse(v.LuaScriptState);}catch(e){throw new Error('Malformed saved state at '+loc+': '+e.message);}if(s.info){for(const category of ['abilities','actions','psychic','special'])proseWalk(s.info[category],loc+'/LuaScriptState/info/'+category,team,v.GUID,category);for(const [name,text]of Object.entries(s.info.rules||{}))add(text,{team,guid:v.GUID,category:'weapon-rule',title:name,path:loc+'/LuaScriptState/info/rules/'+name});}}
  for(const [k,x]of Object.entries(v))if(k!=='States'&&x&&typeof x==='object')scan(x,loc+'/'+k,team);
}
for(const [i,root]of(mod.ObjectStates||[]).entries()){scan(root,'/ObjectStates/'+i,root.Nickname);for(const [id,state]of Object.entries(root.States||{}))scan(state,'/ObjectStates/'+i+'/States/'+id,state.Nickname);}
const prose=[...all.values()];fs.writeFileSync('inventory/prose-source.json',JSON.stringify(prose,null,2));
console.log('Prose segments',prose.length,'chars',prose.reduce((n,x)=>n+x.english.length,0),'weapon rule segments',prose.filter(x=>x.contexts.some(c=>c.category==='weapon-rule')).length);
const batch=process.argv[2]||'summary';
if(batch==='rules')console.log(prose.filter(x=>x.contexts.some(c=>c.category==='weapon-rule')).map(x=>x.id+' ['+[...new Set(x.contexts.map(c=>c.title))].join('/')+'] '+JSON.stringify(x.english)).join('\n'));
else if(batch!=='summary')console.log(prose.filter(x=>x.contexts.some(c=>c.team===batch&&c.category!=='weapon-rule')).map(x=>x.id+' ['+[...new Set(x.contexts.map(c=>c.title))].join('/')+'] '+JSON.stringify(x.english)).join('\n'));
