-- Review candidate. Pure state transitions; no UI, dice rolls or object mutations.
-- Owner keys are stable player identities, never seat colours.
RuAssistantCore = {}
local C=RuAssistantCore
local function copy(v)
    if type(v)~="table" then return v end
    local out={};for k,x in pairs(v) do out[k]=copy(x) end;return out
end
local function integer(n,min,max) return type(n)=="number" and n==math.floor(n) and n>=min and n<=max end
local function reject(message) return false,message end
local function same(a,b)
    if type(a)~=type(b) then return false end
    if type(a)~="table" then return a==b end
    for k,v in pairs(a) do if k~="revision" and not same(v,b[k]) then return false end end
    for k,v in pairs(b) do if k~="revision" and a[k]==nil then return false end end
    return true
end
local function receipt(engine,event,status)
    engine.requests[event.request]={event=copy(event),status=status or "applied"}
    table.insert(engine.requestOrder,event.request)
    if #engine.requestOrder>256 then engine.requests[table.remove(engine.requestOrder,1)]=nil end
end
local function effectLabel(expiry)
    if expiry.kind=="action" then return "До конца текущего действия" end
    if expiry.kind=="round" then return "До конца раунда "..expiry.round end
    if expiry.kind=="activation_end" then return "До конца следующей активации цели" end
    if expiry.kind=="activation_start" then return "До начала следующей активации источника" end
    return "Снять вручную"
end
function C.new(initial,catalog)
    local s=copy(initial);s.revision=0;s.effects=s.effects or {};s.used=s.used or {};s.activation=nil
    for _,p in pairs(s.players) do p.host=p.host==true end
    s.nextActivation=0;s.nextAction=0;s.journal={};s.gambitPasses=0
    return {state=s,catalog=copy(catalog),history={},requests={},requestOrder={}}
end
local function expire(s,kind,unitId,serial)
    local keep={}
    for _,e in ipairs(s.effects) do
        local x=e.expiry;local remove=false
        if x.kind==kind then
            if kind=="round" then remove=x.round<=s.round
            elseif kind=="action" then remove=x.action==serial
            elseif kind=="activation_end" then remove=x.unit==unitId and serial>=(x.after or 0)
            elseif kind=="activation_start" then remove=x.unit==unitId and serial>(x.after or 0) end
        end
        if not remove then table.insert(keep,e) end
    end
    s.effects=keep
end
local function apl(s,u)
    local n=u.apl
    for _,e in ipairs(s.effects) do if e.target==u.id and e.aplDelta then n=n+e.aplDelta end end
    -- APL modifiers are capped at +/-1 in core rules; AP spending remains editable.
    return math.min(u.apl+1,math.max(u.apl-1,n))
end
function C.apl(state,id) return apl(state,state.units[id]) end
local function ployKey(s,owner,rule,target)
    local suffix=rule.limit=="battle" and "battle" or tostring(s.round)
    if rule.limit=="target_battle" then suffix="battle:"..target end
    return owner..":"..rule.id..":"..suffix
end
function C.apply(engine,event)
    if type(event)~="table" or type(event.request)~="string" then return reject("Нет идентификатора операции") end
    local current=engine.state
    local p=current.players[event.owner];if not p then return reject("Игрок не участвует в этой партии") end
    local old=engine.requests[event.request]
    if old then
        if not same(old.event,event) then return reject("Идентификатор уже принадлежит другой операции") end
        if old.status=="undone" then return reject("Эта операция уже отменена") end
        return true,"already-applied"
    end
    if event.revision~=current.revision then return reject("Состояние изменилось. Обновите панель") end
    if event.type=="undo" then
        local last=engine.history[#engine.history]
        if not last then return reject("Нечего отменять") end
        if last.owner~=event.owner and not p.host then return reject("Последнее действие принадлежит другому игроку") end
        local s=copy(last.before);s.revision=current.revision+1
        table.remove(engine.history);engine.state=s
        if engine.requests[last.request] then engine.requests[last.request].status="undone" end
        receipt(engine,event)
        return true,"Отменено: "..last.label
    end
    local s=copy(current);local label="";local u=event.unit and s.units[event.unit]
    if event.type=="begin" then
        if s.phase~="firefight" then return reject("Активация начинается в фазе перестрелки") end
        if s.activation then return reject("Сначала завершите текущее действие и активацию") end
        if s.turnOwner~=event.owner then return reject("Сейчас очередь другого игрока") end
        if not u or u.owner~=event.owner or u.wounds<=0 then return reject("Выберите своего действующего оперативника") end
        local counter=event.mode=="counteract"
        if event.mode and event.mode~="counteract" and event.mode~="activation" then return reject("Неизвестный режим") end
        if counter then
            for _,other in pairs(s.units) do if other.owner==event.owner and other.ready and other.wounds>0 then return reject("Ещё есть готовые оперативники") end end
            local enemyReady=false;for _,other in pairs(s.units) do if other.owner~=event.owner and other.ready and other.wounds>0 then enemyReady=true end end
            if not enemyReady or u.order~="Engage" or u.counteracted then return reject("Контрдействие не отмечено как возможное") end
        elseif not u.ready then return reject("Оперативник уже использован") end
        s.nextActivation=s.nextActivation+1
        if not counter then expire(s,"activation_start",u.id,s.nextActivation) end
        s.activation={unit=u.id,owner=event.owner,serial=s.nextActivation,mode=counter and "counteract" or "activation",ap=counter and 0 or apl(s,u),spent=0,performed={},pending=nil}
        if counter then u.counteracted=true end
        label=(counter and "Контрдействие: " or "Активация: ")..u.name
    elseif event.type=="action" then
        local a=s.activation;local rule=engine.catalog.actions[event.action]
        if not a or a.owner~=event.owner or not rule then return reject("Сначала начните активацию") end
        if a.pending then return reject("Завершите текущее действие") end
        u=s.units[a.unit]
        if u.wounds<=0 or u.unavailable then return reject("Оперативник недоступен. Завершите действие и активацию") end
        local cost=event.cost==nil and rule.cost or event.cost
        if not integer(cost,0,9) then return reject("Некорректная стоимость AP") end
        if cost~=rule.cost and not event.costConfirmed then return reject("Подтвердите изменение стоимости AP") end
        if a.mode=="counteract" and rule.cost>1 then return reject("Контрдействие рассчитано на действие стоимостью 1 AP") end
        if a.mode=="counteract" and next(a.performed) then return reject("Контрдействие уже выполнено") end
        if a.mode=="counteract" then cost=0 end
        if rule.engage and u.order~="Engage" and not event.exception then return reject("Для этого действия нужен приказ Engage") end
        if a.mode~="counteract" and a.performed[event.action] and not event.exception then return reject("Действие уже выполнено. Укажите исключение из правила") end
        if a.mode~="counteract" and not event.exception then
            for _,excluded in ipairs(rule.excludes or {}) do if a.performed[excluded] then return reject("Это действие несовместимо с уже выполненным. Подтвердите исключение из правила") end end
        end
        if cost>a.ap-a.spent then return reject("Недостаточно AP. Проверьте стоимость или измените учёт") end
        s.nextAction=s.nextAction+1;a.spent=a.spent+cost;a.performed[event.action]=(a.performed[event.action] or 0)+1
        if rule.window then a.pending={id=s.nextAction,action=event.action,name=rule.name,weapon=event.weapon,confirmed=event.confirmed==true} end
        label=rule.name.." · "..cost.." AP"..(event.exception and " · исключение подтверждено" or "")
    elseif event.type=="finish_action" then
        local a=s.activation
        if not a or a.owner~=event.owner or not a.pending then return reject("Нет начатого действия") end
        expire(s,"action",a.unit,a.pending.id);label="Завершено: "..a.pending.name;a.pending=nil
    elseif event.type=="finish" then
        local a=s.activation
        if not a or a.owner~=event.owner then return reject("Нет вашей активной модели") end
        if a.pending then return reject("Сначала завершите действие") end
        u=s.units[a.unit]
        if a.mode~="counteract" then u.ready=false;expire(s,"activation_end",u.id,a.serial) end
        s.activation=nil;s.turnOwner=s.opponents[event.owner]
        label=(a.mode=="counteract" and "Завершено контрдействие: " or "Завершена активация: ")..u.name
    elseif event.type=="adjust_ap" then
        local a=s.activation
        if not a or a.owner~=event.owner or not integer(event.value,0,9) or event.value<a.spent then return reject("Некорректный лимит AP") end
        if a.mode=="counteract" then return reject("Контрдействие даёт одно бесплатное действие") end
        a.ap=event.value;a.manualBudget=true;label="Ручная поправка AP: "..event.value
    elseif event.type=="order" then
        local a=s.activation
        if not a or a.owner~=event.owner or a.mode=="counteract" or next(a.performed) or a.pending then return reject("Приказ выбирается в начале активации") end
        if event.order~="Engage" and event.order~="Conceal" then return reject("Неизвестный приказ") end
        s.units[a.unit].order=event.order;s.units[a.unit].guard=false;s.units[a.unit].guardOrder=nil;label="Приказ: "..event.order
    elseif event.type=="ploy" then
        local rule=engine.catalog.ploys[event.ploy]
        if not rule then return reject("Уловка не описана в этой версии правил") end
        local cost=event.cost==nil and rule.cost or event.cost
        if not integer(cost,0,9) then return reject("Некорректная стоимость CP") end
        if cost~=rule.cost and not event.costConfirmed then return reject("Подтвердите изменение стоимости") end
        if p.team~=rule.team and rule.team~="any" then return reject("Уловка другого отряда") end
        if s.phase~=rule.phase then return reject("Неподходящая фаза") end
        if rule.phase=="gambit" and s.gambitOwner~=event.owner then return reject("Сейчас гамбит другого игрока") end
        if not event.confirmed then return reject("Подтвердите условия и момент применения") end
        local target=event.target and s.units[event.target]
        if rule.target and (not target or target.owner~=event.owner or target.wounds<=0) then return reject("Выберите своего оперативника") end
        local a=s.activation
        if rule.action then
            if not a or a.owner~=event.owner or not a.pending or a.pending.action~=rule.action then return reject("Нет нужного текущего действия") end
            if event.target~=a.unit then return reject("Эффект относится к выполняющему действие оперативнику") end
            if rule.weapon~=a.pending.weapon then return reject("Выберите соответствующий профиль оружия") end
            if rule.keyword and not s.units[a.unit].keywords[rule.keyword] then return reject("Неподходящий оперативник") end
        end
        local key=ployKey(s,event.owner,rule,event.target or "team")
        if rule.limit~="repeatable" and s.used[key] and not (rule.generic and event.exception==true) then return reject("Ограничение применения уже исчерпано") end
        if p.cp<cost then return reject("Недостаточно CP") end
        s.players[event.owner].cp=p.cp-cost;s.used[key]=(s.used[key] or 0)+1
        if rule.effect then
            local expiry={kind=rule.expiry}
            if rule.generic then
                expiry=copy(event.expiry or {kind="manual"})
                if expiry.kind=="activation_end" then
                    if not target or target.owner~=event.owner then return reject("Выберите свою цель эффекта") end
                    expiry.unit=target.id;expiry.after=s.nextActivation+1
                elseif expiry.kind=="action" then
                    if not a or not a.pending then return reject("Нет текущего действия") end
                elseif expiry.kind~="round" and expiry.kind~="manual" then return reject("Неизвестный срок эффекта") end
            end
            if expiry.kind=="round" then expiry.round=s.round elseif expiry.kind=="action" then expiry.action=a.pending.id end
            local effectText=rule.generic and type(event.effectText)=="string" and event.effectText~="" and event.effectText or rule.effect
            table.insert(s.effects,{id=event.request,owner=event.owner,target=event.target or "team",title=rule.name,text=effectText,source=rule.name,expiry=expiry,expiryLabel=effectLabel(expiry)})
        end
        if rule.phase=="gambit" then s.gambitOwner=s.opponents[event.owner];s.gambitPasses=0 end
        label=rule.name.." · −"..cost.." CP"
    elseif event.type=="add_effect" then
        if not u or u.owner~=event.owner or type(event.title)~="string" or event.title=="" then return reject("Выберите свою цель и название эффекта") end
        if not event.confirmed or type(event.expiry)~="table" then return reject("Подтвердите срок действия эффекта") end
        local x=copy(event.expiry)
        if x.kind=="round" then x.round=s.round
        elseif x.kind=="activation_end" then x.unit=u.id;x.after=s.nextActivation+1
        elseif x.kind=="activation_start" then
            local source=s.units[event.source]
            if not source or source.owner~=event.owner then return reject("Выберите источник эффекта") end
            x.unit=source.id;x.after=s.nextActivation
        elseif x.kind~="manual" then return reject("Неизвестный срок эффекта") end
        if event.aplDelta and not integer(event.aplDelta,-1,1) then return reject("Некорректное изменение APL") end
        table.insert(s.effects,{id=event.request,owner=event.owner,target=u.id,title=event.title,text=event.text or "",source=event.source or u.id,expiry=x,expiryLabel=effectLabel(x),aplDelta=event.aplDelta})
        label="Эффект: "..event.title
    elseif event.type=="remove_effect" then
        local found=false;local keep={}
        for _,e in ipairs(s.effects) do if e.id==event.effect and e.owner==event.owner then found=true else table.insert(keep,e) end end
        if not found then return reject("Эффект недоступен") end;s.effects=keep;label="Эффект снят вручную"
    elseif event.type=="next_phase" then
        if not p.host then return reject("Переходом партии управляет ведущий") end
        if s.activation then return reject("Сначала завершите активацию") end
        if s.phase=="firefight" then
            for _,unit in pairs(s.units) do if unit.ready and unit.wounds>0 then return reject("На столе ещё есть готовые оперативники") end end
            s.phase="scoring";label="Подсчёт очков"
        elseif s.phase=="scoring" then
            if not event.confirmed then return reject("Подтвердите завершение подсчёта и отложенных правил") end
            if s.round>=s.maxRounds then s.phase="finished";label="Партия завершена"
            else expire(s,"round");s.round=s.round+1;s.phase="initiative";s.initiative=nil;label="Новый раунд · определите инициативу" end
        elseif s.phase=="ready" then
            if not event.confirmed then return reject("Подтвердите разрешение фракционных правил подготовки") end
            s.phase="gambit";s.gambitOwner=s.initiative;s.gambitPasses=0;label="Стратегические гамбиты"
        else return reject("Завершите текущий этап") end
    elseif event.type=="initiative" then
        if not p.host or s.phase~="initiative" or not s.players[event.winner] then return reject("Сначала определите инициативу") end
        s.initiative=event.winner;s.turnOwner=event.winner;s.phase="ready"
        if s.cpAlreadyGrantedRound~=s.round then
            for owner,player in pairs(s.players) do player.cp=player.cp+(s.round>1 and owner~=s.initiative and 2 or 1) end
        end
        s.cpAlreadyGrantedRound=s.round
        for _,unit in pairs(s.units) do unit.ready=unit.wounds>0;unit.counteracted=false end
        label="Инициатива определена · CP начислены · модели готовы"
    elseif event.type=="pass_gambit" then
        if s.phase~="gambit" or s.gambitOwner~=event.owner then return reject("Сейчас гамбит другого игрока") end
        s.gambitPasses=s.gambitPasses+1;s.gambitOwner=s.opponents[event.owner]
        if s.gambitPasses>=2 then s.phase="firefight";s.turnOwner=s.initiative end
        label="Пас стратегического гамбита"
    elseif event.type=="pass_counteract" then
        if s.phase~="firefight" or s.activation or s.turnOwner~=event.owner then return reject("Сейчас нельзя пропустить контрдействие") end
        local enemyReady=false
        for _,unit in pairs(s.units) do
            if unit.ready and unit.wounds>0 then
                if unit.owner==event.owner then return reject("Ещё есть готовые оперативники") end
                enemyReady=true
            end
        end
        if not enemyReady then return reject("Фаза перестрелки завершена") end
        s.turnOwner=s.opponents[event.owner];label="Контрдействие пропущено"
    else return reject("Неизвестная операция") end
    if s.activation and s.activation.mode=="activation" and not s.activation.manualBudget and not s.activation.pending then s.activation.ap=apl(s,s.units[s.activation.unit]) end
    s.revision=current.revision+1
    table.insert(s.journal,{owner=event.owner,label=label,round=s.round});if #s.journal>40 then table.remove(s.journal,1) end
    table.insert(engine.history,{before=copy(current),owner=event.owner,label=label,request=event.request});if #engine.history>40 then table.remove(engine.history,1) end
    engine.state=s;receipt(engine,event);return true,label
end
function C.export(engine) return copy({version=1,state=engine.state,history=engine.history,requests=engine.requests,requestOrder=engine.requestOrder}) end
local function validState(s)
    if type(s)~="table" or not integer(s.revision,0,1000000000) or not integer(s.round,1,100) or not integer(s.maxRounds,s.round,100) then return false end
    if type(s.players)~="table" or type(s.units)~="table" or type(s.opponents)~="table" or type(s.effects)~="table" or type(s.used)~="table" or type(s.journal)~="table" then return false end
    local phases={firefight=true,scoring=true,initiative=true,ready=true,gambit=true,finished=true}
    if not phases[s.phase] or not integer(s.nextActivation,0,1000000000) or not integer(s.nextAction,0,1000000000) then return false end
    local owners=0
    for id,p in pairs(s.players) do
        owners=owners+1
        if type(id)~="string" or type(p)~="table" or not integer(p.cp,0,999) or type(p.host)~="boolean" or type(p.name)~="string" or type(p.team)~="string" or not s.players[s.opponents[id]] or s.opponents[id]==id or s.opponents[s.opponents[id]]~=id then return false end
    end
    if owners~=2 or not s.players[s.turnOwner] or s.initiative and not s.players[s.initiative] then return false end
    if not integer(s.gambitPasses,0,2) or (s.phase=="gambit" and (not s.players[s.gambitOwner] or not s.players[s.initiative])) then return false end
    if (s.phase=="ready" or s.phase=="firefight" or s.phase=="scoring") and not s.players[s.initiative] then return false end
    if s.activation and s.phase~="firefight" then return false end
    for id,u in pairs(s.units) do if type(u)~="table" or u.id~=id or not s.players[u.owner] or type(u.name)~="string" or not integer(u.apl,1,9) or not integer(u.wounds,0,99) or not integer(u.maxWounds,u.wounds,99) or type(u.ready)~="boolean" or type(u.counteracted)~="boolean" or type(u.keywords)~="table" or (u.order~="Engage" and u.order~="Conceal") then return false end end
    for _,e in ipairs(s.effects) do
        if type(e)~="table" or type(e.id)~="string" or not s.players[e.owner] or (e.target~="team" and not s.units[e.target]) or type(e.title)~="string" or type(e.expiry)~="table" then return false end
        local x=e.expiry
        if x.kind=="round" then if not integer(x.round,1,100) then return false end
        elseif x.kind=="action" then if not integer(x.action,1,s.nextAction) then return false end
        elseif x.kind=="activation_end" or x.kind=="activation_start" then if not s.units[x.unit] or not integer(x.after,0,s.nextActivation+1) then return false end
        elseif x.kind~="manual" then return false end
    end
    local a=s.activation
    if a then if type(a)~="table" or not s.units[a.unit] or a.owner~=s.units[a.unit].owner or not integer(a.serial,1,s.nextActivation) or not integer(a.ap,0,9) or not integer(a.spent,0,99) or type(a.performed)~="table" or (a.mode~="activation" and a.mode~="counteract") then return false end;if a.pending and (type(a.pending)~="table" or not integer(a.pending.id,1,s.nextAction) or type(a.pending.action)~="string") then return false end end
    return true
end
function C.restore(saved,catalog,trustedPlayers)
    if type(saved)~="table" or saved.version~=1 or type(saved.state)~="table" then return nil,"Несовместимое сохранение" end
    if not validState(saved.state) or type(saved.history)~="table" or #saved.history>40 or type(saved.requests)~="table" or type(saved.requestOrder)~="table" or #saved.requestOrder>256 then return nil,"Некорректное состояние партии" end
    for _,h in ipairs(saved.history) do if type(h)~="table" or not validState(h.before) or not saved.state.players[h.owner] or type(h.label)~="string" or type(h.request)~="string" then return nil,"Некорректная история" end end
    local requestCount=0
    for id,r in pairs(saved.requests) do requestCount=requestCount+1;if type(id)~="string" or type(r)~="table" or type(r.event)~="table" or r.event.request~=id or not saved.state.players[r.event.owner] or (r.status~="applied" and r.status~="undone") then return nil,"Некорректная операция" end end
    if requestCount~=#saved.requestOrder then return nil,"Некорректный список операций" end
    local seen={};for _,id in ipairs(saved.requestOrder) do if seen[id] or not saved.requests[id] then return nil,"Некорректный список операций" end;seen[id]=true end
    local restored={state=copy(saved.state),history=copy(saved.history),requests=copy(saved.requests),requestOrder=copy(saved.requestOrder),catalog=copy(catalog)}
    if trustedPlayers then
        for id,p in pairs(restored.state.players) do if not trustedPlayers[id] then return nil,"Игрок сохранения не входит в текущую партию" end;p.host=trustedPlayers[id].host==true end
        for _,h in ipairs(restored.history) do for id,p in pairs(h.before.players) do if not trustedPlayers[id] then return nil,"Игрок истории не входит в текущую партию" end;p.host=trustedPlayers[id].host==true end end
    end
    return restored
end
