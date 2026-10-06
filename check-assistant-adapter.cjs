const fs=require('fs');
const core=fs.readFileSync('assistant-core.lua','utf8'),adapter=fs.readFileSync('assistant-scoreboard-adapter.lua','utf8');
const data=JSON.parse(fs.readFileSync('output/assistant-demo-data.json'));
const lit=v=>v==null?'nil':typeof v==='string'?JSON.stringify(v):typeof v==='number'?String(v):typeof v==='boolean'?(v?'true':'false'):Array.isArray(v)?'{'+v.map(lit).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+lit(k)+']='+lit(x)).join(',')+'}';
const script=`
Player={Red={color='Red',steam_id='red-id',host=true},Blue={color='Blue',steam_id='blue-id',host=false}}
playerNumber={Red=1,Blue=2};scoring={{command=2},{command=3}}
local updates,logs=0,0
function getCurrentRound() return 2 end
function refreshCommandPoints(i) updates=updates+1 end
function dispatchGameLogScoringEvent() logs=logs+1 end
${core}
${adapter}
local commit=ruAssistantBoardCommit
function ruAssistantBoardCommit(player,params) if params.revision==nil then params.revision=params.request=='p1' and 0 or RuAssistantCPRevision end;return commit(player,params) end
local result=ruAssistantBoardCommit(Player.Red,{request='p1',color='Red',owner='red-id',expected={2,3},changes={[1]=1}})
assert(result.ok and scoring[1].command==1 and updates==1 and logs==1)
assert(ruAssistantBoardCommit(Player.Red,{request='p1',color='Red',owner='red-id',expected={2,3},changes={[1]=1}}).duplicate)
assert(scoring[1].command==1 and logs==1)
assert(not ruAssistantBoardCommit(Player.Blue,{request='p1',color='Blue',owner='blue-id',expected={1,3},changes={[1]=1}}).ok)
assert(not ruAssistantBoardCommit(Player.Red,{request='stale',color='Red',owner='red-id',expected={2,3},changes={[1]=0}}).ok)
assert(not ruAssistantBoardCommit(Player.Red,{request='underflow',color='Red',owner='red-id',expected={1,3},changes={[1]=-1}}).ok)
assert(not ruAssistantBoardCommit(Player.Blue,{request='spoof',color='Blue',owner='red-id',expected={1,3},changes={[1]=0}}).ok)
assert(not ruAssistantBoardCommit(Player.Blue,{request='cross',color='Blue',owner='blue-id',expected={1,3},changes={[1]=0}}).ok)
assert(not ruAssistantBoardCommit(Player.Red,{request='partial',color='Red',owner='red-id',expected={1,3},changes={[1]=0,[2]=-1}}).ok)
assert(scoring[1].command==1 and scoring[2].command==3,'Partial batch committed')
assert(not ruAssistantBoardCommit(Player.Red,{request='stale-revision',revision=0,color='Red',owner='red-id',expected={1,3},changes={[1]=0}}).ok)
assert(ruAssistantBoardCommit(Player.Red,{request='next',color='Red',owner='red-id',expected={1,3},changes={[1]=2,[2]=5}}).ok)
assert(scoring[1].command==2 and scoring[2].command==5)
assert(not ruAssistantBoardCommit(Player.Red,{request='next',color='Red',owner='red-id',expected={2,5},changes={[1]=3}}).ok)
local snapshot=ruAssistantBoardSnapshot();assert(snapshot.players[1].owner=='red-id' and snapshot.players[1].cp==2)
-- Retry and seat change must not silently debit the new occupant.
Player.Red.steam_id='new-person';assert(not ruAssistantBoardCommit(Player.Red,{request='p1',color='Red',owner='red-id',expected={2,5},changes={[1]=1}}).ok)
-- Post-commit refresh errors retain authoritative values and request receipts.
Player.Red.steam_id='red-id';function refreshCommandPoints(i) error('UI temporarily unavailable') end
result=ruAssistantBoardCommit(Player.Red,{request='ui-error',color='Red',owner='red-id',expected={2,5},changes={[1]=1}})
assert(result.ok and result.uiPending and scoring[1].command==1)
local initial=${lit(data.initial)};local catalog=${lit(data.catalog)}
local engine=RuAssistantCore.new(initial,catalog)
local trusted=ruAssistantTrustedDispatch(engine,Player.Blue,{owner='red-id',request='spoof-host',revision=0,type='next_phase'},catalog)
assert(not trusted.ok and engine.state.revision==0,'Spoofed host privilege')
trusted=ruAssistantTrustedDispatch(engine,Player.Blue,{owner='red-id',request='spoof-unit',revision=0,type='begin',unit='immortal'},catalog)
assert(not trusted.ok)
trusted=ruAssistantTrustedDispatch(engine,Player.Red,{owner='blue-id',request='actual-owner',revision=0,type='begin',unit='immortal'},catalog)
assert(trusted.ok and trusted.candidate.state.activation.owner=='red-id' and engine.state.revision==0,'Uncommitted candidate mutated live state')
assert(not ruAssistantTrustedDispatch(engine,Player.Red,nil,catalog).ok)
assert(not ruAssistantBoardCommit(Player.Blue,{request='host-pair-spoof',color='Red',owner='red-id',expected={1,5},changes={[1]=0}}).ok)
assert(not ruAssistantBoardCommit({color='Red',steam_id='red-id',host=true},{request='fake-player',expected={1,5},changes={[1]=0}}).ok)
assert(not ruAssistantBoardCommit(Player.Red,{request='p1',revision=0,expected={1,3},changes={[1]=1}}).ok)
assert(not ruAssistantBoardCommit(Player.Red,{request='p1',revision=1,expected={2,3},changes={[1]=1}}).ok)
return '22 adapter and identity checks'
`;
fs.writeFileSync('tmp/assistant-adapter-test.lua',script);console.log('Emitted assistant-adapter-test.lua');
