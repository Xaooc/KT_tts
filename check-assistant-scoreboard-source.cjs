const fs=require('fs');
const source=JSON.parse(fs.readFileSync('C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json')).ObjectStates.find(x=>x.GUID==='339b7f').LuaScript;
const adapter=fs.readFileSync('assistant-scoreboard-adapter.lua','utf8');
const script=`
local text={};UI={getAttribute=function() return true end,setAttribute=function(id,key,value) text[id]=value end,setValue=function(id,value) text[id]=value end}
self={UI=UI};JSON={encode=function() return '{}' end};Player={Red={color='Red',steam_id='red-id',host=true},Blue={color='Blue',steam_id='blue-id',host=false}}
getObjectFromGUID=function() return nil end
local function loadOriginalBoard()
${source}
end
loadOriginalBoard()
playerNumber={Red=1,Blue=2};rules={scoring={maxRounds=4}}
scoring={{command=2,initiative={false,true,false,false}},{command=3,initiative={false,false,false,false}}}
${adapter}
assert(ruAssistantBoardSnapshot().round==2)
local result=ruAssistantBoardCommit(Player.Red,{request='real-board',revision=0,color='Red',owner='red-id',expected={2,3},changes={[1]=1}})
assert(result.ok and not result.uiPending and scoring[1].command==1)
assert(text['kts__command_player1']=='1 CP','Original scoreboard UI not refreshed')
assert(ruAssistantBoardCommit(Player.Red,{request='real-board',revision=0,color='Red',owner='red-id',expected={2,3},changes={[1]=1}}).duplicate)
assert(scoring[1].command==1)
assert(not ruAssistantBoardCommit(Player.Red,{request='race',revision=0,color='Red',owner='red-id',expected={1,3},changes={[1]=0}}).ok)
return 'Original installed scoreboard source + CP bridge passed'
`;
fs.writeFileSync('tmp/assistant-scoreboard-source-test.lua',script);console.log('Emitted original-scoreboard fixture');
