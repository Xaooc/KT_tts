const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const library=require('./output/reference-hud-library.json');
const source='https://wahapedia.ru/kill-team3/kill-teams/hierotek-circle/';
const actions={reposition:{name:'Перемещение',english:'Reposition',cost:1},dash:{name:'Рывок',english:'Dash',cost:1},shoot:{name:'Стрельба',english:'Shoot',cost:1,window:true,engage:true},fight:{name:'Ближний бой',english:'Fight',cost:1,window:true},fallback:{name:'Отступление',english:'Fall Back',cost:2}};
const entry=name=>library.teams.hierotekcircle.entries.find(x=>x.english===name);
const catalog={actions,ploys:{lightning:{id:'lightning',team:'hierotekcircle',name:'Живая молния',english:'Living Lightning',cost:1,limit:'round',phase:'firefight',target:true,action:'shoot',weapon:'tesla',keyword:'IMMORTAL',expiry:'action',effect:'Карабин Теслы получает Blast 2″. У Devastating 1 убирается дистанционное условие 2″.',fullText:entry('Living Lightning').text,source},onslaught:{id:'onslaught',team:'hierotekcircle',name:'Неумолимое наступление',english:'Relentless Onslaught',cost:1,limit:'round',phase:'gambit',expiry:'round',effect:'При стрельбе по цели в пределах 8″ от самого стрелка его дальнобойное оружие получает Balanced.',fullText:entry('Relentless Onslaught').text,source},reroll:{id:'reroll',team:'any',name:'Командный переброс',english:'Command Re-roll',cost:1,limit:'repeatable',phase:'firefight'}}};
const unit=(id,owner,name,english,apl,wounds,maxWounds,keywords,weapon)=>({id,owner,name,english,apl,wounds,maxWounds,keywords,weapon,order:'Engage',ready:true,counteracted:false});
const initial={matchId:'design-demo',rulesVersion:'2026-10-06 · Hierotek August 2026',round:2,maxRounds:4,phase:'firefight',initiative:'blue-id',turnOwner:'red-id',opponents:{'red-id':'blue-id','blue-id':'red-id'},players:{'red-id':{name:'Круг Иеротек',team:'hierotekcircle',color:'Red',cp:2,vp:4,host:true},'blue-id':{name:'Культ Хаоса',team:'chaoscult',color:'Blue',cp:3,vp:3}},units:{immortal:unit('immortal','red-id','Бессмертный страж','Immortal Guardian',2,7,10,{IMMORTAL:true},'tesla'),apprentek:unit('apprentek','red-id','Подмастерье','Apprentek',2,11,11,{APPRENTEK:true},'conduit'),devotee:unit('devotee','blue-id','Последователь','Devotee',2,5,7,{DEVOTEE:true},'autogun')}};
const lit=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v==='boolean'?(v?'true':'false'):typeof v==='number'?String(v):Array.isArray(v)?'{'+v.map(lit).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+lit(k)+']='+lit(x)).join(',')+'}';
fs.writeFileSync('output/assistant-demo-data.json',JSON.stringify({initial,catalog,sources:[source,'https://wahapedia.ru/kill-team3/the-rules/core-rules/'],status:'review-prototype',installed:false},null,2));
const scenarios=`
local C=RuAssistantCore
local initial=${lit(initial)}
local catalog=${lit(catalog)}
local count=0
local function clone(x) if type(x)~='table' then return x end;local n={};for k,v in pairs(x) do n[k]=clone(v) end;return n end
local function act(e,event,expected)
 count=count+1;event.owner=event.owner or 'red-id';event.request=event.request or ('test-'..count);event.revision=event.revision or e.state.revision
 local ok,msg=C.apply(e,event);assert(ok==expected,msg);return msg
end
local e=C.new(initial,catalog)
act(e,{type='begin',unit='immortal'},true)
act(e,{type='action',action='reposition'},true)
act(e,{type='action',action='reposition'},false)
act(e,{type='action',action='shoot',weapon='tesla'},true)
assert(e.state.activation.spent==2)
act(e,{type='finish'},false)
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=false},false)
act(e,{type='ploy',ploy='lightning',target='apprentek',confirmed=true},false)
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=true,request='purchase'},true)
assert(e.state.players['red-id'].cp==1 and #e.state.effects==1)
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=true,request='purchase'},true)
assert(e.state.players['red-id'].cp==1,'Duplicate deducted CP')
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=true},false)
act(e,{type='undo',owner='blue-id'},false)
act(e,{type='undo'},true)
assert(e.state.players['red-id'].cp==2 and #e.state.effects==0)
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=true,cost=0},false)
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=true,cost=0,costConfirmed=true},true)
assert(e.state.players['red-id'].cp==2)
act(e,{type='finish_action'},true)
assert(#e.state.effects==0,'Action effect leaked')
act(e,{type='finish'},true)
assert(not e.state.units.immortal.ready and e.state.turnOwner=='blue-id')
act(e,{type='begin',unit='apprentek'},false)
act(e,{type='begin',unit='devotee',owner='blue-id'},true)
act(e,{type='action',action='dash',owner='red-id'},false)
local restored=C.restore(C.export(e),catalog);assert(restored.state.activation.unit=='devotee' and restored.state.turnOwner=='blue-id')
act(restored,{type='finish',owner='blue-id'},true)
act(restored,{type='begin',unit='apprentek'},true)
act(restored,{type='adjust_ap',value=3},true)
act(restored,{type='action',action='reposition'},true)
act(restored,{type='action',action='reposition',exception=true,cost=0,costConfirmed=true},true)
act(restored,{type='finish'},true)
act(restored,{type='next_phase'},true)
act(restored,{type='next_phase'},false)
act(restored,{type='next_phase',confirmed=true,request='round-once'},true)
assert(restored.state.round==3 and restored.state.phase=='initiative')
act(restored,{type='next_phase',confirmed=true,request='round-once'},true)
assert(restored.state.round==3,'Duplicate advanced round')
local rcp,bcp=restored.state.players['red-id'].cp,restored.state.players['blue-id'].cp
act(restored,{type='initiative',winner='red-id',request='init-once'},true)
assert(restored.state.players['red-id'].cp==rcp+1 and restored.state.players['blue-id'].cp==bcp+2)
act(restored,{type='initiative',winner='red-id',request='init-once'},true)
assert(restored.state.players['red-id'].cp==rcp+1,'Duplicate accrued CP')
act(restored,{type='next_phase',confirmed=true},true)
act(restored,{type='ploy',ploy='onslaught',confirmed=true},true)
act(restored,{type='pass_gambit',owner='blue-id'},true)
act(restored,{type='pass_gambit'},true)
assert(restored.state.phase=='firefight')
-- APL modifiers and durations must survive round changes and counteractions.
local x=C.new(initial,catalog)
act(x,{type='add_effect',unit='immortal',title='Ускорение',aplDelta=1,expiry={kind='activation_end'},confirmed=true},true)
act(x,{type='add_effect',unit='immortal',title='Второе усиление',aplDelta=1,expiry={kind='manual'},confirmed=true},true)
assert(C.apl(x.state,'immortal')==3,'Stacked APL exceeds +1')
act(x,{type='begin',unit='immortal'},true);assert(x.state.activation.ap==3)
act(x,{type='finish'},true);assert(#x.state.effects==1,'Next activation expiry wrong')
local y=C.new(initial,catalog)
act(y,{type='add_effect',unit='immortal',title='Подавление',aplDelta=-1,expiry={kind='manual'},confirmed=true},true)
assert(C.apl(y.state,'immortal')==1,'APL reduction incorrectly clamped to 2')
act(y,{type='begin',unit='immortal'},true);act(y,{type='order',order='Conceal'},true)
act(y,{type='action',action='shoot',weapon='tesla'},false)
act(y,{type='action',action='shoot',weapon='tesla',exception=true},true)
local z=C.new(initial,catalog);z.state.units.immortal.ready=false;z.state.units.apprentek.ready=false
act(z,{type='add_effect',unit='immortal',title='Ускорение',aplDelta=1,expiry={kind='activation_end'},confirmed=true},true)
act(z,{type='begin',unit='immortal',mode='counteract'},true)
act(z,{type='action',action='dash'},true);assert(z.state.activation.spent==0)
act(z,{type='action',action='reposition'},false)
act(z,{type='finish'},true);assert(#z.state.effects==1,'Counteraction expired activation effect')
z.state.turnOwner='red-id';act(z,{type='begin',unit='immortal',mode='counteract'},false)
local n=C.new(initial,catalog);n.state.players['red-id'].cp=0
act(n,{type='begin',unit='immortal'},true);act(n,{type='action',action='shoot',weapon='tesla'},true)
act(n,{type='ploy',ploy='lightning',target='immortal',confirmed=true},false);assert(n.state.players['red-id'].cp==0)
act(n,{type='finish_action',revision=0},false)
act(n,{type='finish_action',owner='unknown'},false)
act(n,{type='finish_action'},true)
act(n,{type='action',action='dash',cost=0},false)
act(n,{type='action',action='dash',cost=0,costConfirmed=true},true)
act(n,{type='order',order='Conceal'},false)
local declined=C.new(initial,catalog);declined.state.units.immortal.ready=false;declined.state.units.apprentek.ready=false;declined.state.units.immortal.order='Conceal'
act(declined,{type='pass_counteract'},true);assert(declined.state.turnOwner=='blue-id')
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=true,request='purchase'},false)
act(e,{type='ploy',ploy='lightning',target='immortal',confirmed=true,request='purchase',owner='blue-id'},false)
local malformed=C.export(e);malformed.state.revision=nil;assert(not C.restore(malformed,catalog))
malformed=C.export(e);malformed.state.effects={{id='x',owner='red-id',target='immortal',title='x',expiry={kind='no-such-expiry'}}};assert(not C.restore(malformed,catalog))
malformed=C.export(e);malformed.history[1].owner='unknown';assert(not C.restore(malformed,catalog))
malformed=C.export(e);malformed.state.opponents['red-id']='red-id';assert(not C.restore(malformed,catalog))
malformed=C.export(e);malformed.state.opponents['blue-id']='blue-id';assert(not C.restore(malformed,catalog))
malformed=C.export(e);malformed.state.phase='gambit';malformed.state.activation=nil;malformed.state.gambitPasses=nil;assert(not C.restore(malformed,catalog))
malformed=C.export(e);malformed.state.phase='gambit';malformed.state.activation=nil;malformed.state.gambitOwner='unknown';assert(not C.restore(malformed,catalog))
for _,phase in ipairs({'ready','firefight','scoring'}) do malformed=C.export(e);malformed.state.phase=phase;malformed.state.activation=nil;malformed.state.initiative=nil;assert(not C.restore(malformed,catalog)) end
local trusted=clone(initial.players);trusted['red-id'].host=false
assert(not C.restore(C.export(e),catalog,{['red-id']=trusted['red-id']}))
assert(C.restore(C.export(e),catalog,trusted).state.players['red-id'].host==false)
local free=C.new(initial,catalog);act(free,{type='begin',unit='immortal'},true)
act(free,{type='action',action='dash',cost=0,costConfirmed=true},true)
assert(free.state.activation.spent==0)
act(free,{type='order',order='Conceal'},false)
-- Request receipts are bounded; old requests still fail their stale revisions.
local bounded=C.new(initial,catalog)
for i=1,260 do act(bounded,{type='add_effect',unit='immortal',title='Reminder',expiry={kind='manual'},confirmed=true,request='bounded-'..i},true) end
assert(#bounded.requestOrder==256 and #bounded.history==40)
assert(C.restore(C.export(bounded),catalog))
act(bounded,{type='add_effect',unit='immortal',title='Reminder',expiry={kind='manual'},confirmed=true,request='bounded-1',revision=0},false)
-- Bounded interactive examples: every transition below is calculated by native Lua.
PreviewAssistant={version=1,nodes={},sources=${lit([source,'https://wahapedia.ru/kill-team3/the-rules/core-rules/'])}}
local graph=PreviewAssistant.nodes
local function node(id,engine,edges) graph[id]={state=clone(engine.state),edges=edges or {}} end
local function step(id,from,to,event)
 local engine=C.restore(C.export(from),catalog);event.owner=event.owner or 'red-id';event.revision=engine.state.revision;event.request=id
 local ok,msg=C.apply(engine,event);assert(ok,msg);node(to,engine);return engine
end
local demo=C.new(initial,catalog)
local active=step('demo-begin',demo,'activation',{type='begin',unit='immortal'})
active=step('demo-move',active,'activation',{type='action',action='reposition'})
local shot=step('demo-shoot',active,'shoot',{type='action',action='shoot',weapon='tesla'})
local paid=step('demo-paid',shot,'paid',{type='ploy',ploy='lightning',target='immortal',confirmed=true})
local undone=step('demo-undo',paid,'undo-ploy',{type='undo'})
local resolved=step('demo-resolve',paid,'resolved',{type='finish_action'})
local ended=step('demo-end',resolved,'ended',{type='finish'})
local undoShot=step('demo-undo-shot',shot,'undo-shot',{type='undo'})
local dash=step('demo-dash',active,'dash',{type='action',action='dash'})
step('demo-end-dash',dash,'dash-ended',{type='finish'})
step('demo-end-early',active,'early-ended',{type='finish'})
graph.activation.edges={shoot='shoot',dash='dash',finish='early-ended'};graph.shoot.edges={apply='paid',undo='undo-shot',resolve='resolved-unpaid'};graph.paid.edges={undo='undo-ploy',resolve='resolved'};graph['undo-ploy'].edges={apply='paid',undo='undo-shot',resolve='resolved-unpaid'};graph['undo-shot'].edges={shoot='shoot',dash='dash',finish='early-ended'};graph.resolved.edges={finish='ended'};graph.dash.edges={finish='dash-ended'}
local noPloy=step('demo-unpaid-resolve',shot,'resolved-unpaid',{type='finish_action'})
step('demo-unpaid-end',noPloy,'ended-unpaid',{type='finish'})
graph['resolved-unpaid'].edges={finish='ended-unpaid'}
local round=C.new(initial,catalog)
for _,u in pairs(round.state.units) do u.ready=false end
round.state.effects={{id='old-strategy',owner='red-id',target='team',title='Неумолимое наступление',source='Уловка',text=catalog.ploys.onslaught.effect,expiry={kind='round',round=2},expiryLabel='До конца раунда 2'},{id='next-activation',owner='red-id',target='immortal',title='Ускорение',source='Плазмацит-ускоритель',text='+1 APL до конца следующей активации цели.',aplDelta=1,expiry={kind='activation_end',unit='immortal',after=1},expiryLabel='До конца следующей активации цели'}}
local scoring=step('demo-scoring',round,'round',{type='next_phase'})
local initiative=step('demo-round',scoring,'initiative',{type='next_phase',confirmed=true})
local ready=step('demo-initiative',initiative,'ready',{type='initiative',winner='red-id'})
local readyBlue=step('demo-initiative-blue',initiative,'ready-blue',{type='initiative',winner='blue-id'})
local gambit=step('demo-ready',ready,'gambit',{type='next_phase',confirmed=true})
local strategy=step('demo-strategy',gambit,'strategy',{type='ploy',ploy='onslaught',confirmed=true})
local passBlue=step('demo-pass-blue',strategy,'pass-blue',{type='pass_gambit',owner='blue-id'})
step('demo-pass-red',passBlue,'new-firefight',{type='pass_gambit'})
local gambitBlue=step('demo-ready-blue',readyBlue,'gambit-blue',{type='next_phase',confirmed=true})
local blueFirstPass=step('demo-blue-first-pass',gambitBlue,'blue-first-pass',{type='pass_gambit',owner='blue-id'})
step('demo-red-final-pass',blueFirstPass,'blue-firefight',{type='pass_gambit'})
local redFirstPass=step('demo-red-first-pass',gambit,'red-first-pass',{type='pass_gambit'})
step('demo-blue-final-pass',redFirstPass,'red-firefight',{type='pass_gambit',owner='blue-id'})
graph.round.edges={next='initiative'};graph.initiative.edges={red='ready',blue='ready-blue'};graph.ready.edges={next='gambit'};graph['ready-blue'].edges={next='gambit-blue'};graph.gambit.edges={apply='strategy',pass='red-first-pass'};graph.strategy.edges={pass='pass-blue'};graph['pass-blue'].edges={pass='new-firefight'};graph['gambit-blue'].edges={pass='blue-first-pass'};graph['blue-first-pass'].edges={pass='blue-firefight'};graph['red-first-pass'].edges={pass='red-firefight'}
local graphCount=0;for _,node in pairs(graph) do graphCount=graphCount+1;for _,id in pairs(node.edges) do assert(graph[id],'Dangling preview transition') end end
return count,graphCount
`;
fs.writeFileSync('tmp/assistant-core-test.lua',fs.readFileSync('assistant-core.lua','utf8')+'\n'+scenarios);
console.log({fixture:'tmp/assistant-core-test.lua',catalogPloys:3,previewScenes:3,installed:false});
