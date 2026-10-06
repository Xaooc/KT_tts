-- Candidate bridge for the existing Scoreboard SLIM object. Not installed yet.
-- Invoke inside a native UI callback with its trusted Player argument.
-- Not a one-table object.call endpoint: form data cannot establish player identity.
RuAssistantCPReceipts=RuAssistantCPReceipts or {}
RuAssistantCPReceiptOrder=RuAssistantCPReceiptOrder or {}
RuAssistantCPRevision=RuAssistantCPRevision or 0
local function ruCpInteger(n) return type(n)=="number" and n==math.floor(n) and n>=0 and n<=999 end
function ruAssistantBoardSnapshot()
    local out={round=getCurrentRound(),revision=RuAssistantCPRevision,players={}}
    for color,index in pairs(playerNumber) do
        local p=Player[color];local score=scoring[index]
        if p and score then out.players[index]={color=color,owner=tostring(p.steam_id),cp=score.command} end
    end
    return out
end
function ruAssistantBoardCommit(actor,params)
    if type(params)~="table" or type(params.request)~="string" or type(params.expected)~="table" or type(params.changes)~="table" then return {ok=false,error="Некорректная операция CP"} end
    if not actor or not actor.color or Player[actor.color]~=actor then return {ok=false,error="Нет доверенного игрока"} end
    local owner=tostring(actor.steam_id);local index=playerNumber[actor.color]
    if not index or params.owner and params.owner~=owner or params.color and params.color~=actor.color then return {ok=false,error="Игрок сменил место или не участвует в партии"} end
    local fingerprint={owner=owner,revision=params.revision,expected={},changes={}}
    for i,v in pairs(params.expected) do fingerprint.expected[i]=v end
    for i,v in pairs(params.changes) do fingerprint.changes[i]=v end
    local function sameMap(a,b)
        for k,v in pairs(a) do if b[k]~=v then return false end end
        for k,v in pairs(b) do if a[k]~=v then return false end end
        return true
    end
    local receipt=RuAssistantCPReceipts[params.request]
    if receipt then
        if receipt.owner~=owner then return {ok=false,error="Операция другого игрока"} end
        if receipt.revision~=fingerprint.revision or not sameMap(receipt.expected,fingerprint.expected) or not sameMap(receipt.changes,fingerprint.changes) then return {ok=false,error="Идентификатор принадлежит другой операции"} end
        return {ok=true,duplicate=true}
    end
    if params.revision~=RuAssistantCPRevision then return {ok=false,error="Состояние табло изменилось"} end
    local expectedCount=0
    for i,value in pairs(params.expected) do
        expectedCount=expectedCount+1
        if type(i)~="number" or not scoring[i] or scoring[i].command~=value then return {ok=false,error="CP на табло изменились. Обновите панель"} end
    end
    if expectedCount~=2 or params.expected[1]==nil or params.expected[2]==nil then return {ok=false,error="Нужен снимок обоих счётчиков"} end
    local changes={};local changed=false
    for i,value in pairs(params.changes) do
        if not scoring[i] or not ruCpInteger(value) then return {ok=false,error="Некорректное значение CP"} end
        if i~=index and actor.host~=true then return {ok=false,error="Нельзя менять CP другого игрока"} end
        changes[i]=value;changed=true
    end
    if not changed then return {ok=false,error="Нет изменений"} end
    -- Validate the entire batch before assigning anything; no Wait/yield between writes.
    for i,value in pairs(changes) do scoring[i].command=value end
    RuAssistantCPRevision=RuAssistantCPRevision+1
    RuAssistantCPReceipts[params.request]=fingerprint
    table.insert(RuAssistantCPReceiptOrder,params.request)
    if #RuAssistantCPReceiptOrder>256 then RuAssistantCPReceipts[table.remove(RuAssistantCPReceiptOrder,1)]=nil end
    local uiPending=false
    for i in pairs(changes) do if not pcall(refreshCommandPoints,i) then uiPending=true end end
    if not params.deferLog then pcall(dispatchGameLogScoringEvent) end
    return {ok=true,uiPending=uiPending}
end
-- Shared-host session: trusted callbacks stamp player identity and permissions.
function ruAssistantTrustedDispatch(engine,player,event,catalog)
    if not player or not player.steam_id or type(event)~="table" then return {ok=false,error="Нет игрока или операции"} end
    local owners={}
    for id,p in pairs(engine.state.players) do owners[id]={host=false} end
    local id=tostring(player.steam_id)
    if not owners[id] then return {ok=false,error="Игрок не участвует в партии"} end
    owners[id].host=player.host==true
    local candidate,errorText=RuAssistantCore.restore(RuAssistantCore.export(engine),catalog,owners)
    if not candidate then return {ok=false,error=errorText} end
    local trusted={};for k,v in pairs(event) do trusted[k]=v end;trusted.owner=id
    local ok,message=RuAssistantCore.apply(candidate,trusted)
    if not ok then return {ok=false,error=message} end
    if engine.state.revision~=event.revision and message~="already-applied" then return {ok=false,error="Состояние партии изменилось"} end
    -- The owning HUD commits this returned candidate only after the board CAS succeeds.
    return {ok=true,message=message,candidate=candidate,expectedRevision=engine.state.revision}
end
