do -- module scope: keeps this module's locals out of the object's main chunk (Lua allows 200 locals per function)
-- Scoreboard hub: seat-local UI and engine identities, synchronous board/engine commits.
RuAssistantEngine=nil
RuAssistantSerial=0
RuHub={seats={},marks={},cpByRound={},trees={},vms={},pending={},seatSteam={}}
KT.handler="ruHubClick"
local phases={"initiative","ready","gambit","firefight","scoring"}
local phaseLabels={"Стратегия · инициатива","Стратегия · готовность","Стратегия · гамбиты","Перестрелка","Конец раунда · подсчёт очков"}
local phaseNames={initiative="Стратегия · инициатива",ready="Стратегия · готовность",gambit="Стратегия · гамбиты",firefight="Перестрелка",
    scoring="Конец раунда · подсчёт очков",finished="ПАРТИЯ ЗАВЕРШЕНА"}
local phaseEyebrows={initiative="СТРАТЕГИЯ · ИНИЦИАТИВА",ready="СТРАТЕГИЯ · ГОТОВНОСТЬ",gambit="СТРАТЕГИЯ · ГАМБИТЫ",
    firefight="ПЕРЕСТРЕЛКА",scoring="КОНЕЦ РАУНДА · ПОДСЧЁТ ОЧКОВ",finished="ПАРТИЯ ЗАВЕРШЕНА"}
local function copy(x)
    if type(x)~="table" then return x end
    local out={};for k,v in pairs(x) do out[k]=copy(v) end;return out
end
local function integer(x,min,max) return type(x)=="number" and x==math.floor(x) and x>=min and x<=max end
local playerColors={White=true,Brown=true,Red=true,Orange=true,Yellow=true,Green=true,Teal=true,
    Blue=true,Purple=true,Pink=true,Black=true}
local function playerFor(color)
    if type(color)~="string" or not playerColors[color] then return nil end
    local ok,p=pcall(function() return Player[color] end)
    return ok and p or nil
end
local function viewerFor(color,steamId)
    if color~="Grey" then return playerFor(color) end
    for _,p in ipairs(Player.getPlayers()) do
        if p.color==color and (steamId==nil or tostring(p.steam_id)==tostring(steamId)) then return p end
    end
end
local function actor(p)
    if not p or not p.color then return nil end
    local real=viewerFor(p.color,p.steam_id)
    return real and tostring(real.steam_id)==tostring(p.steam_id) and real or nil
end
local function steam(p) return tostring(p.steam_id) end
local function state() return RuAssistantEngine and RuAssistantEngine.state end
local function seatMode()
    local s=state();if not s then return true end
    for id in pairs(s.players) do if id:sub(1,5)~="seat:" then return false end end
    return true
end
local function owner(p) return seatMode() and "seat:"..tostring(playerNumber[p.color]) or steam(p) end
local function virtualActor(p)
    return {steam_id=owner(p),color=p.color,host=p.host,steam_name=p.steam_name}
end
local function boardCommit(p,params)
    if not seatMode() then return ruAssistantBoardCommit(p,params) end
    -- The unchanged adapter also checks Player[color] identity. Scope its lookup to this synchronous call.
    local realPlayers=Player;local virtual=virtualActor(p)
    Player=setmetatable({[p.color]=virtual},{__index=function(_,key) return realPlayers[key] end})
    local ok,result=pcall(ruAssistantBoardCommit,virtual,params);Player=realPlayers
    if not ok then return {ok=false,error=tostring(result)} end
    return result
end
local function hubRound() return math.max(1,getCurrentRound()) end
local function seat(color)
    if not RuHub.seats[color] then
        RuHub.seats[color]={state="rail",tab="turn",ploySeg="strat",ployQuery="",ployExpiry="manual",
            squadSeg="all",enemySeg="ops",logSeg="events",refScope="model",refQuery="",
            advanced={open=false,cost="rule",exception=false},setup={round=hubRound(),phaseIndex=1,turnIndex=1}}
    end
    return RuHub.seats[color]
end
local function seats()
    local out={}
    for color,index in pairs(playerNumber or {}) do
        local p=playerFor(color)
        if (index==1 or index==2) and p and p.seated~=false and tostring(p.steam_id or "")~="" then out[index]=p end
    end
    return out
end
local function seatPlayer(index)
    local p=seats()[index];if p then return p end
    if RuHub.seatSteam[1]~=nil and RuHub.seatSteam[1]==RuHub.seatSteam[2] then
        for color,seatIndex in pairs(playerNumber or {}) do
            local candidate=playerFor(color);if seatIndex==index and candidate then return candidate end
        end
    end
end
local function hotSeat()
    return RuHub.seatSteam[1]~=nil and RuHub.seatSteam[2]~=nil and RuHub.seatSteam[1]==RuHub.seatSteam[2]
end
local function rememberSeatSteam()
    RuHub.seatSteam=type(RuHub.seatSteam)=="table" and RuHub.seatSteam or {}
    for index,p in pairs(seats()) do if not RuHub.seatSteam[index] then RuHub.seatSteam[index]=steam(p) end end
end
local function colors()
    local found={}
    for _,p in pairs(seats()) do found[p.color]=true end
    for _,p in ipairs(Player.getPlayers()) do if p.seated~=false or p.color=="Grey" then found[p.color]=true end end
    local out={};for color in pairs(found) do out[#out+1]=color end;table.sort(out);return out
end
local function authority(p)
    local s=state();local own=s and s.players[owner(p)];local index=playerNumber[p.color]
    return own and own.index==index and scoring[index] and true or false
end
local function spectator(p) return p.color=="Grey" or not playerNumber[p.color] or not seats()[playerNumber[p.color]] end
local function refCall(fn,params)
    local ok,result=pcall(function()
        local hud=getObjectFromGUID("efa3fe");return hud and hud.call(fn,params)
    end)
    return ok and type(result)=="table" and result or nil
end
local function fold(text)
    local upper=KT.chars("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ")
    local lower=KT.chars("абвгдеёжзийклмнопрстуфхцчшщъыьэюя");local map={}
    for i,ch in ipairs(upper) do map[ch]=lower[i] end
    local out={};for _,ch in ipairs(KT.chars(tostring(text or ""))) do out[#out+1]=map[ch] or ch:lower() end
    return table.concat(out)
end
local function request(p)
    RuAssistantSerial=RuAssistantSerial+1;return "live:"..owner(p)..":"..RuAssistantSerial
end
local function clearUndo() if RuAssistantEngine then RuAssistantEngine.history={} end end
local function objectUnit(obj,playersMap)
    if not obj.hasTag or not obj.hasTag("Operative") then return nil end
    local ok,st=pcall(function() return obj.getTable("state") end)
    if not ok or type(st)~="table" or type(st.stats)~="table" or type(st.info)~="table" then return nil end
    if not playersMap[tostring(st.owner)] then return nil end
    local apl=tonumber(st.stats.APL);local wnd=tonumber(st.stats.Wounds or st.stats.W);local wounds=tonumber(st.wounds or wnd)
    if not integer(apl,1,9) or not integer(wnd,0,99) or not integer(wounds,0,wnd) then return nil end
    local info=st.info;local marker=type(st.ktRuAssistant)=="table" and st.ktRuAssistant or {}
    local name=info.name or st.name or obj.getName();local keywords={}
    for _,k in pairs(info.categories or {}) do keywords[tostring(k):upper()]=true end
    if tostring(name):upper():find("IMMORTAL",1,true) then keywords.IMMORTAL=true end
    local weapons={}
    for _,w in ipairs(info.weapons or {}) do
        local stats=w.stats or {};local key=tostring(w.name):lower():find("tesla",1,true) and "tesla" or tostring(w.name)
        local melee=w.type=="melee" or w.type=="M" or tostring(w.name):find("(M)",1,true)~=nil
        local hit=stats.HIT or stats.BS or stats.WS or stats.Hit or "—"
        if type(hit)=="number" then hit=tostring(hit).."+" end
        weapons[#weapons+1]={name=RuAssistantNames[w.name] or w.name or "Оружие",english=w.name,key=key,
            rules=stats.WR or "",kind=melee and "melee" or "ranged",a=stats.ATK or stats.A or "—",
            bs=hit,d=stats.DMG or stats.D or stats.Damage or "—"}
    end
    local order=st.order or marker.order;local team=tostring(info.ktRuTeam or ""):lower():gsub("[^a-z0-9]","")
    if not RuAssistantTeams[team] then
        for _,category in ipairs(info.categories or {}) do
            local key=tostring(category):lower():gsub("[^a-z0-9]","");if RuAssistantTeams[key] then team=key end
        end
    end
    local move=st.stats.Move or st.stats.M or "—";local save=st.stats.Save or st.stats.SV or "—"
    if type(move)=="number" then move=tostring(move)..'"' end
    if type(save)=="number" then save=tostring(save).."+" end
    return {id=obj.getGUID(),owner=tostring(st.owner),name=RuAssistantNames[name] or name,english=name,
        apl=apl,move=move,save=save,
        wounds=wounds,maxWounds=wnd,keywords=keywords,weapons=weapons,team=team,
        order=(order=="Conceal" or order=="GuardConceal") and "Conceal" or "Engage",
        guard=order=="Guard" or order=="GuardConceal",
        guardOrder=(order=="Guard" or order=="GuardConceal") and order or nil,
        ready=st.ready~=nil and st.ready~=false or st.ready==nil and marker.ready~=false,
        counteracted=marker.counteracted==true}
end
local function scan(p)
    local out={};local map={[steam(p)]=true}
    for _,obj in ipairs(getAllObjects()) do local u=objectUnit(obj,map);if u then out[#out+1]=u end end
    return out
end
local function marks(p)
    local m=RuHub.marks[p.color]
    if not m then m={team="",used={},pinned={},round=hubRound()};RuHub.marks[p.color]=m end
    if m.round~=hubRound() then m.used={};m.round=hubRound() end
    return m
end
local function team(p)
    local s=state();local own=s and s.players[owner(p)]
    if own and RuAssistantTeams[own.team] then return own.team end
    local m=marks(p)
    if not RuAssistantTeams[m.team] and not hotSeat() then
        for _,u in ipairs(scan(p)) do if RuAssistantTeams[u.team] then m.team=u.team;break end end
    end
    return m.team or ""
end
local function teamLabel(key) return (RuAssistantTeams[key] or {}).label or "Отряд не выбран" end
local function syncCounters()
    local s=state();if not s then return end;local changed=false
    for _,p in ipairs(Player.getPlayers()) do
        local own=s.players[owner(p)];local index=playerNumber[p.color]
        if own and index==own.index and scoring[index] then
            if own.color~=p.color or own.cp~=scoring[index].command then changed=true end
            own.color=p.color;own.cp=scoring[index].command;own.host=p.host==true
        end
    end
    if changed then s.revision=s.revision+1;clearUndo() end
end
local function syncWounds()
    local s=state();if not s then return end;local changed=false
    for id,u in pairs(s.units) do
        local obj=getObjectFromGUID(id);local physicalOwner=u.modelOwner or u.owner
        local fresh=obj and objectUnit(obj,{[physicalOwner]=true})
        if fresh and fresh.owner==physicalOwner then
            for _,field in ipairs({"wounds","ready","order","guard","guardOrder"}) do
                if u[field]~=fresh[field] then u[field]=fresh[field];changed=true end
            end
            if u.unavailable then u.unavailable=nil;changed=true end
        elseif not u.unavailable then u.wounds=0;u.ready=false;u.unavailable=true;changed=true end
    end
    if changed then s.revision=s.revision+1;clearUndo() end
end
function ruAssistantSyncModels()
    local s=state();if not s then return end
    for id,u in pairs(s.units) do
        local obj=getObjectFromGUID(id)
        if obj then pcall(function()
            local st=obj.getTable("state")
            if type(st)~="table" or tostring(st.owner)~=(u.modelOwner or u.owner) then return end
            st.ktRuAssistant={order=u.order,ready=u.ready,counteracted=u.counteracted};st.ready=u.ready
            st.order=u.guard and (u.guardOrder=="GuardConceal" and "GuardConceal" or "Guard") or u.order
            obj.setTable("state",st);obj.call("saveState");pcall(function() obj.call("refreshWounds") end)
            local keep={}
            for _,n in ipairs(obj.UI.getXmlTable() or {}) do
                if (n.attributes or {}).id~="ruAssistantModelMarker" then keep[#keep+1]=n end
            end
            local tint=u.wounds==0 and KT.c.hurt or u.order=="Engage" and KT.c.accent or KT.c.muted
            local label=u.wounds==0 and "выведен" or u.ready and "готов" or "использован"
            keep[#keep+1]=KT.node("Panel",{id="ruAssistantModelMarker",width="260",height="48",position="0 0 -20",
                rotation="0 0 0",scale="0.16 0.16 0.16",color=KT.c.rail}, {
                KT.node("Text",{text=u.order.." · "..label,fontSize="30",fontStyle="Bold",color=tint,raycastTarget="false"})})
            obj.UI.setXmlTable(keep)
        end) end
    end
end
local function captureCP(round)
    RuHub.cpByRound[round]=RuHub.cpByRound[round] or {}
    for i=1,2 do
        local cp=scoring[i].command;local row=RuHub.cpByRound[round][i]
        if not row then row={start=cp};RuHub.cpByRound[round][i]=row end
        row["end"]=cp
    end
end
local function toast(p,title,body,undo)
    local v=seat(p.color)
    if v.toastTimer then Wait.stop(v.toastTimer) end
    local last=RuAssistantEngine and RuAssistantEngine.history[#RuAssistantEngine.history]
    local t={title=title or "",body=body or "",undo=undo==true,
        undoRequest=undo and last and last.request};v.toast=t;v.toastHidden=false
    v.toastTimer=Wait.time(function()
        if v.toast~=t then return end
        v.toastHidden=true;v.toastTimer=nil
        local id=KT.hub.id(p.color,"toast")
        Global.call("ruUiPatchMany",{{id=id,attrs={active="false"}}})
        local function hide(n)
            if n.attributes.id==id then n.attributes.active="false" end
            for _,child in ipairs(n.children or {}) do hide(child) end
        end
        if RuHub.trees[p.color] then hide(RuHub.trees[p.color]) end
    end,6)
end
function ruAssistantCommit(p,event)
    p=actor(p);if not p or not authority(p) then return false,"Игрок или место не совпадают с участником партии" end
    syncCounters();syncWounds()
    local e=RuAssistantEngine;event.revision=event.revision or e.state.revision;event.request=event.request or request(p)
    if event.type=="undo" then
        local last=e.history[#e.history]
        if last and last.owner~=owner(p) then
            local message="Сначала отмените последнее действие соперника"
            toast(p,message,"",false);ruHubRender(p.color);return false,message
        end
    end
    local proposal=ruAssistantTrustedDispatch(e,virtualActor(p),event,RuAssistantCatalog)
    if not proposal.ok then toast(p,proposal.error,"",false);ruHubRender(p.color);return false,proposal.error end
    if proposal.message=="already-applied" then return true,proposal.message end
    local expected={scoring[1].command,scoring[2].command};local changes={}
    for _,own in pairs(proposal.candidate.state.players) do
        if own.cp~=expected[own.index] then changes[own.index]=own.cp end
    end
    if e.state.revision~=proposal.expectedRevision then return false,"Партия изменилась. Повторите действие" end
    if next(changes) then
        local result=boardCommit(p,{request=event.request,revision=RuAssistantCPRevision,
            expected=expected,changes=changes,deferLog=true})
        if not result.ok then toast(p,result.error,"",false);ruHubRender(p.color);return false,result.error end
    end
    local before=e.state;RuAssistantEngine=proposal.candidate;local s=state()
    if before.round~=s.round then captureCP(before.round) end
    captureCP(s.round)
    if event.type=="initiative" or event.type=="undo" then
        for id,own in pairs(s.players) do
            for r=1,rules.scoring.maxRounds do
                scoring[own.index].initiative[r]=r<s.round and scoring[own.index].initiative[r] or (r==s.round and s.initiative==id)
            end
        end
    end
    pcall(updateInitiativeUI)
    pcall(function()
        setUIValue("kts__round_current","Раунд "..s.round)
        if not s.initiative then hideUI("kts__initiative_display_player1");hideUI("kts__initiative_display_player2") end
    end)
    pcall(dispatchGameLogScoringEvent);ruAssistantSyncModels()
    local title,body=proposal.message,""
    if event.type=="action" then
        local a=s.activation;local cost=a.spent-before.activation.spent
        title=RuAssistantCatalog.actions[event.action].name.." выполнено";body=s.units[a.unit].name.." · −"..cost.." AP"
    elseif event.type=="ploy" then
        title="Применено: "..RuAssistantCatalog.ploys[event.ploy].name;body="−"..(event.cost or 1).." CP"
    end
    local v=seat(p.color);v.advanced.cost="rule";v.advanced.exception=false
    toast(p,title,body,event.type~="undo");ruHubRenderAll();return true,proposal.message
end
local function start(p)
    if p.host~=true then return false,"Партии помощника запускает ведущий" end
    local seated=seats()
    if not seated[1] or not seated[2] then return false,"Нужны два места табло" end
    if owner(p)~=owner(seated[1]) and owner(p)~=owner(seated[2]) then return false,"Ведущий должен занять место табло" end
    if state() then return false,"Партия уже запущена" end
    local setup=seat(p.color).setup;local r=setup.round
    if not integer(r,1,rules.scoring.maxRounds) then return false,"Некорректный раунд" end
    local owners={}
    for i,player in ipairs(seated) do
        local id=owner(player);owners[id]={id=id,index=i,color=player.color,host=player.host==true,
            name=player.steam_name or player.color,team=team(player),cp=scoring[i].command,vp=0}
    end
    local ini=nil;for i,player in ipairs(seated) do if scoring[i].initiative[r] then ini=owner(player) end end
    local requested=phases[setup.phaseIndex] or "initiative";if requested=="initiative" then ini=nil end
    local phase=ini and requested or "initiative";local turn=owner(seated[setup.turnIndex] or seated[1])
    local first,second=owner(seated[1]),owner(seated[2])
    RuAssistantEngine=RuAssistantCore.new({matchId=request(p),rulesVersion="KT3 · RU 06.10.2026",round=r,
        maxRounds=rules.scoring.maxRounds,phase=phase,initiative=ini,turnOwner=turn,gambitOwner=phase=="gambit" and turn or nil,
        cpAlreadyGrantedRound=requested=="initiative" and r>1 and r-1 or r,players=owners,
        opponents={[first]=second,[second]=first},units={}},RuAssistantCatalog)
    RuHub.seatSteam={[1]=steam(seated[1]),[2]=steam(seated[2])}
    for _,player in ipairs(seated) do seat(player.color).state="open";seat(player.color).tab="turn" end
    captureCP(r);return true,"Партия подключена. Добавьте выставленные модели во вкладке «Отряд»"
end
local function enroll(p,all)
    if not authority(p) then return false,"Сначала подключите партию" end
    local s=state();if s.activation then return false,"Завершите активацию перед изменением состава" end
    local own=owner(p);local chosen=team(p)
    if all and hotSeat() then
        local other=s.players[s.opponents[own]]
        if not RuAssistantTeams[chosen] or chosen==other.team then
            return false,'Выделите модели рамкой и нажмите «+ Добавить выделенные»: выберите разные отряды для мест'
        end
    end
    local objects=all and getAllObjects() or p.getSelectedObjects();local n,skipped=0,0
    for _,obj in ipairs(objects) do
        local u=objectUnit(obj,{[steam(p)]=true});local enrolled=u and s.units[u.id]
        local allowed=true
        if u and not all and hotSeat() then
            local seatTeam=s.players[own].team
            if not RuAssistantTeams[seatTeam] then seatTeam=marks(p).team end
            allowed=not RuAssistantTeams[seatTeam] or u.team==seatTeam
        end
        if u and (not enrolled or enrolled.owner==own and enrolled.unavailable)
            and (not all or not hotSeat() or u.team==chosen) and allowed then
            u.modelOwner=u.owner;u.owner=own
            local keep={};for _,effect in ipairs(s.effects) do if effect.target~=u.id then keep[#keep+1]=effect end end
            s.effects=keep;s.units[u.id]=u;n=n+1
            if RuAssistantTeams[u.team] then s.players[u.owner].team=u.team;marks(p).team=u.team end
            seat(p.color).selected=seat(p.color).selected or u.id
        elseif u and not all and hotSeat() and not allowed then
            skipped=skipped+1
        end
    end
    if n==0 then
        if skipped>0 then return false,"Пропущено моделей другого отряда: "..skipped end
        return false,"Новых моделей с вашим владельцем и характеристиками не найдено"
    end
    s.revision=s.revision+1;clearUndo();ruAssistantSyncModels()
    return true,"Добавлено моделей: "..n..(skipped>0 and ". Пропущено моделей другого отряда: "..skipped or "")
end
local function preview(p,event)
    if not authority(p) then return false,"Партия не подключена к вашему месту" end
    event.revision=state().revision;event.request="hub:preview"
    local result=ruAssistantTrustedDispatch(RuAssistantEngine,virtualActor(p),event,RuAssistantCatalog)
    return result.ok,result.error
end
local function actionEvent(v,key)
    return {type="action",action=key,weapon=v.weapon,cost=v.advanced.cost~="rule" and tonumber(v.advanced.cost) or nil,
        exception=v.advanced.exception==true,confirmed=true,costConfirmed=true}
end
local function ployEvent(p,key)
    local v=seat(p.color);local rule=RuAssistantCatalog.ploys[key];local s=state();local target=v.ployTarget or v.selected
    if not target and s and s.activation and s.activation.owner==owner(p) then target=s.activation.unit end
    return {type="ploy",ploy=key,target=rule.target and target or nil,confirmed=true,costConfirmed=true,
        cost=rule.generic and v.openPloy==key and v.ployCost or rule.cost,expiry={kind=v.ployExpiry}}
end
local function vp(index)
    if not scoring[index] then return 0 end
    local ok,total,crit,tac,kill,primary=pcall(calculateScore,index)
    if not ok then return 0 end
    return crit and crit+tac+kill+(primary or 0) or total or 0
end
local function unitVM(u,p)
    local s=state();local active=s and s.activation and s.activation.unit==u.id
    local out=copy(u);out.guid=u.id
    if u.wounds<=0 or u.unavailable then out.state="down"
    else out.state=active and "active" or u.ready and "ready" or "used" end
    out.injured=u.wounds>0 and u.wounds<math.ceil(u.maxWounds/2)
    if out.injured then
        out.injuryNote='Травмирован: −2" к движению, −1 к попаданию. Правило отряда может отменить.'
        local move=tonumber(tostring(u.move):match("[%d.]+"))
        if move then out.move=tostring(math.max(0,move-2))..'"' end
        for _,w in ipairs(out.weapons or {}) do
            local hit=tonumber(tostring(w.bs):match("%d+"))
            if hit then w.bs=tostring(math.min(6,hit+1)).."+";w.tip=out.injuryNote end
        end
    end
    out.canActivate=s and s.phase=="firefight" and not s.activation and s.turnOwner==owner(p)
        and u.owner==owner(p) and u.ready and u.wounds>0 and not u.unavailable or false
    return out
end
local function roster(p)
    local out={};local s=state()
    if s and s.players[owner(p)] then
        for _,u in pairs(s.units) do if u.owner==owner(p) then out[#out+1]=unitVM(u,p) end end
    else for _,u in ipairs(scan(p)) do out[#out+1]=unitVM(u,p) end end
    local rank={active=1,ready=2,used=3,down=4}
    table.sort(out,function(a,b)
        if rank[a.state]~=rank[b.state] then return rank[a.state]<rank[b.state] end
        if a.name~=b.name then return a.name<b.name end;return a.guid<b.guid
    end)
    return out
end
local function statusVM()
    local s=state();local st={sides={}}
    st.eyebrow="РАУНД "..getCurrentRound().." / 4 · "
        ..(s and phaseEyebrows[s.phase] or "ПАРТИЯ НЕ ПОДКЛЮЧЕНА")
    for i,p in pairs(seats()) do
        st.sides[i]={name=teamLabel(team(p)),colorKey=p.color,cp=scoring[i].command,vp=vp(i),
            turn=s and (s.phase=="gambit" and s.gambitOwner or s.turnOwner)==owner(p) or false}
    end
    return st
end
local function turnVM(p,v,units)
    local s=state();local t={foot={}}
    if spectator(p) then t.mode="spectator";return t end
    if not s then
        local labels={};for i,player in pairs(seats()) do labels[i]=player.steam_name or player.color end
        t={mode="setup",isHost=p.host==true,round=v.setup.round,phaseIndex=v.setup.phaseIndex,
            phaseLabels=phaseLabels,turnLabels=labels,turnIndex=v.setup.turnIndex,canStart=seats()[1] and seats()[2]~=nil}
        if hotSeat() then t.hint="Игра за одним компьютером: переключайте цвет места, центр следует за местом" end
        t.foot={{cmd="start",label="Начать партию",kind="primary",flex=true,enabled=p.host==true and t.canStart}}
        return t
    end
    if s.phase=="finished" then t.mode="over";return t end
    local a=s.activation
    if a and a.owner~=owner(p) then
        return {mode="enemy",who=s.players[a.owner].name,unitName=s.units[a.unit].name,
            action=a.pending and a.pending.name,foot={{cmd="tab",arg="ploys",label="Уловки",flex=true}}}
    elseif a then
        local u=s.units[a.unit];v.selected=a.unit;t.mode="activation";t.unit=unitVM(u,p)
        t.injuryNote=t.unit.injuryNote
        t.unit.apl=RuAssistantCore.apl(s,u.id);t.apTotal=a.ap;t.apLeft=math.max(0,a.ap-a.spent)
        t.orderLocked=a.mode=="counteract" or next(a.performed)~=nil or a.pending~=nil
        t.counteract=a.mode=="counteract";t.unavailable=u.wounds<=0 or u.unavailable
        t.advanced=copy(v.advanced);t.advanced.apLimit=a.ap;t.weapons={};t.actions={};t.effects={}
        for i,w in ipairs(t.unit.weapons or {}) do
            v.weapon=v.weapon or w.key;local wp=copy(w);wp.selected=w.key==v.weapon;wp.tip=w.tip or w.rules;t.weapons[i]=wp
        end
        if a.pending then t.pending={label=a.pending.name,weapon=a.pending.weapon} end
        for _,key in ipairs({"reposition","dash","charge","shoot","fight","fallback","mission"}) do
            local rule=RuAssistantCatalog.actions[key]
            if rule then
                local event=actionEvent(v,key);local available,reason=preview(p,event)
                t.actions[#t.actions+1]={key=key,label=rule.name,cost=t.counteract and 0 or event.cost or rule.cost,
                    state=available and "available" or a.performed[key] and "done" or "disabled",tip=reason,wide=key=="mission"}
            end
        end
        for _,effect in ipairs(s.effects) do
            if effect.owner==owner(p) and (effect.target==u.id or effect.target=="team") then
                t.effects[#t.effects+1]={id=effect.id,title=effect.title,expiry=effect.expiryLabel}
            end
        end
        t.foot={{cmd="tab",arg="ploys",label="Уловки"},{cmd=a.pending and "finishaction" or "finish",
            label=a.pending and "Завершить "..a.pending.name or "Завершить активацию",kind="primary",flex=true}}
        return t
    end
    if s.phase~="firefight" then
        t.mode="phase";t.title=phaseNames[s.phase];t.buttons={}
        if s.phase=="initiative" then
            t.text="Определите инициативу и выберите игрока."
            for i,player in pairs(seats()) do
                t.buttons[#t.buttons+1]={cmd="initiative",arg=i,label=player.steam_name or player.color,enabled=p.host==true}
            end
        elseif s.phase=="gambit" then
            t.text="Игроки применяют уловки или пасуют. Два паса подряд начинают перестрелку."
            t.buttons={{cmd="tab",arg="ploys",label="Выбрать уловку",kind="primary"},
                {cmd="passgambit",label="Пас",enabled=s.gambitOwner==owner(p)}}
        else
            t.text=s.phase=="ready" and "Разрешите фракционные правила подготовки." or "Внесите очки на табло."
            t.buttons={{cmd="next",label="Следующий этап",kind="primary",enabled=p.host==true}}
        end
        t.foot={{note="Доступно "..scoring[playerNumber[p.color]].command.." CP"}};return t
    end
    t.mode="idle";t.myTurn=s.turnOwner==owner(p);t.turnOwnerName=s.players[s.turnOwner].name;t.ready={};t.counter={}
    local enemyReady=false
    for _,u in pairs(s.units) do if u.owner~=owner(p) and u.ready and u.wounds>0 then enemyReady=true end end
    for _,u in ipairs(units) do if u.state=="ready" then t.ready[#t.ready+1]=u end end
    if #t.ready==0 and enemyReady and t.myTurn then
        for _,u in ipairs(units) do
            if u.state=="used" and u.order=="Engage" and not u.counteracted then
                local candidate=copy(u);candidate.canActivate=true;t.counter[#t.counter+1]=candidate
            end
        end
    end
    t.canPass=t.myTurn and #t.ready==0 and enemyReady
    if t.myTurn and #t.ready>0 then
        t.foot={{cmd="begin",arg=t.ready[1].guid,label="Начать активацию: "..t.ready[1].name,kind="primary",flex=true}}
    elseif t.canPass then t.foot={{cmd="passcounter",label="Пропустить контрдействие",flex=true}}
    elseif not enemyReady and #t.ready==0 then
        t.foot={{cmd="next",label="К подсчёту очков",kind="primary",flex=true,enabled=p.host==true}}
    else t.foot={{note="Сейчас ход соперника"}} end
    return t
end
local function squadVM(p,v,units)
    local alive,ready=0,0;local filtered={}
    for _,u in ipairs(units) do
        if u.state~="down" then alive=alive+1 end;if u.state=="ready" then ready=ready+1 end
        if v.squadSeg=="all" or v.squadSeg=="ready" and u.state=="ready" or v.squadSeg=="hurt" and u.injured then
            filtered[#filtered+1]=u
        end
    end
    local key=team(p);local t={team=teamLabel(key),summary=alive.." из "..#units.." в строю · "..ready.." готовы",
        units=filtered,seg=v.squadSeg,canEnroll=authority(p) and not state().activation or false}
    if not RuAssistantTeams[key] then
        t.teamOptions={};for id,data in pairs(RuAssistantTeams) do t.teamOptions[#t.teamOptions+1]={id,data.label} end
        table.sort(t.teamOptions,function(a,b) return a[2]<b[2] end)
    end
    return t
end
local function ploysVM(p,v,enemy)
    local key=team(p);local m=marks(p);local s=state();local index=playerNumber[p.color]
    local cp=index and scoring[index] and scoring[index].command or 0
    local out={seg=v.ploySeg,query=v.ployQuery,cp=cp,items={},footNote="Доступно "..cp.." CP"}
    local query=fold(v.ployQuery)
    for id,rule in pairs(RuAssistantCatalog.ploys) do
        local pinned=m.pinned[id]==true
        local segment=enemy or v.ploySeg=="pinned" and pinned or v.ploySeg=="strat" and rule.phase=="gambit"
            or v.ploySeg=="fire" and rule.phase=="firefight"
        if (rule.team==key or rule.team=="any") and segment and (enemy or query==""
            or fold(rule.name.." "..(rule.english or "")):find(query,1,true)) then
            local open=(enemy and v.openEnemyPloy or v.openPloy)==id
            local cost=rule.generic and open and v.ployCost or rule.cost
            local usable,reason=false,nil;local used=m.used[id]==true
            local targets,targetGuid={},nil
            if rule.target and not enemy and s then
                for _,u in pairs(s.units) do
                    if u.owner==owner(p) then
                        local candidate=unitVM(u,p)
                        targets[#targets+1]={guid=u.id,name=u.name,state=candidate.state}
                    end
                end
                table.sort(targets,function(a,b) if a.name~=b.name then return a.name<b.name end;return a.guid<b.guid end)
                local wanted=v.ployTarget or v.selected
                if not wanted and s.activation and s.activation.owner==owner(p) then wanted=s.activation.unit end
                for _,target in ipairs(targets) do if target.guid==wanted then targetGuid=wanted;break end end
                if not targetGuid and s.activation and s.activation.owner==owner(p) then
                    for _,target in ipairs(targets) do if target.guid==s.activation.unit then targetGuid=target.guid;break end end
                end
            end
            if not enemy then
                if s then
                    local event=ployEvent(p,id)
                    if rule.target then event.target=targetGuid end
                    usable,reason=preview(p,event)
                    if rule.target and not targetGuid then usable,reason=false,"Выберите цель" end
                    local suffix=rule.limit=="battle" and "battle" or tostring(s.round)
                    if rule.limit=="target_battle" then suffix="battle:"..tostring(event.target or "team") end
                    used=s.used[owner(p)..":"..rule.id..":"..suffix]~=nil
                else
                    usable=not spectator(p) and cp>=cost and not used
                    reason=used and "Уже применена в раунде" or cp<cost and "Недостаточно CP" or "Займите место табло"
                end
            end
            local body=rule.fullText or rule.effect or ""
            out.items[#out.items+1]={key=id,name=rule.name,english=rule.english,cost=cost,used=used,pinned=pinned,
                open=open,usable=usable,reason=reason,body=open and body or nil,
                terms=open and refCall("ruRefTermsIn",{text=body}) or nil,costEdit=rule.generic==true,
                expiry=rule.generic and v.ployExpiry or nil,needsTarget=rule.target~=nil,
                targetName=targetGuid and s.units[targetGuid] and s.units[targetGuid].name or nil,
                targetGuid=targetGuid,targets=rule.target and targets or nil}
        end
    end
    table.sort(out.items,function(a,b) if a.name~=b.name then return a.name<b.name end;return a.key<b.key end)
    return out
end
local function enemyPlayer(p)
    local s=state();local own=s and s.players[owner(p)]
    if hotSeat() and own then
        local other=s.players[s.opponents[own.id]];return other and playerFor(other.color) or nil
    end
    local index=playerNumber[p.color];return index and seats()[index==1 and 2 or 1] or nil
end
local function enemyVM(p,v)
    local enemy=enemyPlayer(p);if not enemy then return {} end
    local index=playerNumber[enemy.color];local key=team(enemy);local units={}
    -- Only invoked while this seat's enemy tab is open; reserves in bags never enter this scan.
    if hotSeat() then
        for _,u in pairs(state() and state().units or {}) do
            if u.owner==owner(enemy) then units[#units+1]=unitVM(u,enemy) end
        end
    else
        for _,u in ipairs(scan(enemy)) do units[#units+1]=unitVM(u,enemy) end
    end
    table.sort(units,function(a,b) return a.name<b.name end)
    local ev=copy(v);ev.ployQuery="";ev.ploySeg="pinned";ev.ployCost=nil
    local ploys=ploysVM(enemy,ev,true).items
    return {name=teamLabel(key),colorKey=enemy.color,team=key,cp=scoring[index].command,vp=vp(index),
        sub=(enemy.steam_name or enemy.color).." · "..scoring[index].command.." CP · "..vp(index).." VP",
        seg=v.enemySeg,units=units,ploys=ploys,rules=refCall("ruRefTeamRules",{team=key}) or {}}
end
local function roundVP(index,round)
    local total=0
    for _,op in ipairs({"critop","tacop"}) do
        local config=rules.scoring[op];local score=scoring[index][op].score;local before,after=0,0
        for key in pairs(config.VPs) do
            local count=0
            for r=1,round-1 do if score[key][r] then count=count+1 end end
            local nextCount=count+(score[key][round] and 1 or 0)
            before=before+(config.maxEach>0 and math.min(count,config.maxEach) or count)
            after=after+(config.maxEach>0 and math.min(nextCount,config.maxEach) or nextCount)
        end
        total=total+math.min(after,config.max)-math.min(before,config.max)
    end
    return total
end
local function logVM(v)
    local s=state();local out={seg=v.logSeg,groups={},score={rows={},total={rvp=vp(1),bvp=vp(2)},sources={},names={}}}
    local groups={}
    for i=s and #s.journal or 0,1,-1 do
        local event=s.journal[i];local group=groups[event.round]
        if not group then
            group={title="Раунд "..event.round,round=event.round,entries={}};groups[event.round]=group
            out.groups[#out.groups+1]=group
        end
        local own=s.players[event.owner]
        group.entries[#group.entries+1]={side=own.color,title=event.label,sub=own.name}
    end
    table.sort(out.groups,function(a,b) return a.round>b.round end)
    for r=1,rules.scoring.maxRounds do
        local history=RuHub.cpByRound[r] or {}
        local function cp(i)
            local row=history[i];return row and tostring(row.start).." → "..tostring(row["end"]) or "—"
        end
        out.score.rows[#out.score.rows+1]={label=tostring(r),rcp=cp(1),bcp=cp(2),rvp=roundVP(1,r),bvp=roundVP(2,r)}
    end
    local _,rc,rt,rk,rp=calculateScore(1);local _,bc,bt,bk,bp=calculateScore(2)
    out.score.sources={{label="Критическая операция",r=rc,b=bc},{label="Тактическая операция",r=rt,b=bt},
        {label="Убийства",r=rk,b=bk},{label="Основная операция",r=rp,b=bp}}
    local seated=seats();out.score.names={red=seated[1] and seated[1].steam_name,blue=seated[2] and seated[2].steam_name}
    out.note="Убийства и основная операция учтены только в итогах.";return out
end
local function refVM(p,v)
    local ownTeam=nil;if not spectator(p) then ownTeam=team(p) end
    local result=refCall("ruRefQuery",{color=p.color,team=v.refTeam or ownTeam,scope=v.refScope,
        query=v.refQuery,key=v.refKey,guid=v.refGuid}) or {scopes={},results={},count=0}
    result.scope=v.refScope;result.query=v.refQuery
    if v.termKey then result.term=refCall("ruRefTerm",{key=v.termKey}) end
    return result
end
function ruHubBuildVM(color)
    local p=viewerFor(color);if not p then return nil end
    local current=seat(color).toast
    if current then
        local last=RuAssistantEngine and RuAssistantEngine.history[#RuAssistantEngine.history]
        current.undo=last~=nil and last.owner==owner(p) and last.request==current.undoRequest
    end
    local v=seat(color);local vm={color=color,state=v.state,tab=v.tab,status=statusVM(),toast=v.toast}
    if spectator(p) then
        vm.tab="ref";vm.tabs={};vm.turn={mode="spectator"}
        for _,tab in ipairs(KT.hub.TABS) do if tab.key=="ref" then vm.tabs[1]=tab end end
    end
    if vm.tab=="turn" then vm.turn=turnVM(p,v,roster(p));vm.foot=vm.turn.foot
    elseif vm.tab=="squad" then
        local units=roster(p);vm.squad=squadVM(p,v,units)
        if #units==0 then
            vm.foot={{cmd="enrollall",label="+ Добавить все мои со стола",flex=true,enabled=authority(p)}}
        else
            for _,u in ipairs(units) do
                if u.canActivate then
                    vm.foot={{cmd="begin",arg=u.guid,label="Начать активацию: "..u.name,kind="primary",flex=true}};break
                end
            end
        end
    elseif vm.tab=="ploys" then vm.ploys=ploysVM(p,v);vm.foot={{note=vm.ploys.footNote}}
    elseif vm.tab=="enemy" then
        if v.state=="open" then vm.enemy=enemyVM(p,v) else vm.enemy={} end
        vm.foot={{cmd="enemyref",label="Открыть отряд в справочнике",flex=true}}
    elseif vm.tab=="log" then vm.log=logVM(v)
    elseif vm.tab=="ref" then vm.ref=refVM(p,v) end
    return vm
end
-- Rule bodies (body) come from the bundled rules library and keep their rich text; everything a player can edit
-- in TTS (model names, effect notes, Steam names) is escaped.
local displayFields={name=true,english=true,title=true,text=true,label=true,sub=true,who=true,unitName=true,
    action=true,turnOwnerName=true,targetName=true,tip=true,reason=true,expiryLabel=true,hint=true,note=true,
    footNote=true,summary=true,move=true,save=true,bs=true,a=true,d=true,team=true,expiry=true,weapon=true,
    injuryNote=true,
    cost=true,traits=true,emptyHint=true,emptyTitle=true,waiting=true,delta=true}
local function escapeDisplay(value,field)
    if type(value)=="string" then return displayFields[field] and KT.esc(value) or value end
    if type(value)~="table" then return value end
    local out={}
    for key,item in pairs(value) do
        local childField=key
        if field=="turnLabels" or field=="phaseLabels" or field=="names" or field=="traits" then childField="label"
        elseif (field=="terms" or field=="teamOptions" or field=="scopes") and type(key)=="number" then
            out[key]={item[1],KT.esc(item[2])}
        end
        if out[key]==nil then out[key]=escapeDisplay(item,childField) end
    end
    return out
end
local function injuryRows(tree,vm)
    local rows={};local group=vm.squad or vm.enemy
    for _,u in ipairs(group and group.units or {}) do
        if u.injured then
            local base=KT.hub.id(vm.color,vm.squad and "select" or "enemyunit",u.guid)
            local hits={};for _,w in ipairs(u.weapons or {}) do hits[#hits+1]=tostring(w.bs) end
            rows[base.."_n"]={id=base.."_injury",text='MOVE '..tostring(u.move)..' · BS/WS '..table.concat(hits," / ")}
        end
    end
    local function grow(n)
        local attrs=n.attributes or {};local added=0;local beforeMax,afterMax=0,0
        for _,child in ipairs(n.children or {}) do
            beforeMax=math.max(beforeMax,KT.prefH(child));added=added+grow(child)
            afterMax=math.max(afterMax,KT.prefH(child))
        end
        local first=n.children and n.children[1];local row=first and rows[(first.attributes or {}).id]
        if n.tag=="VerticalLayout" and row then
            local caption=KT.text(row.text,{id=row.id,w=tonumber(first.attributes.preferredWidth),size=KT.fs.xs,color=KT.c.hurt})
            n.children[#n.children+1]=caption;added=added+KT.prefH(caption)+(tonumber(attrs.spacing) or 0)
        end
        if n.tag=="VerticalScrollView" then
            if first then first.attributes.height=tostring(KT.prefH(first)) end
            return 0 -- The viewport stays fixed while its content grows.
        end
        if n.tag~="VerticalLayout" then added=afterMax-beforeMax end
        if attrs.preferredHeight and not attrs.height then
            attrs.preferredHeight=tostring(KT.prefH(n)+added);return added
        end
        return 0
    end
    grow(tree)
end
local function ids(node,color,path)
    assert(type(node)=="table","Invalid dock child "..color..":"..path.." ("..tostring(node)..")")
    node.attributes=node.attributes or {};node.attributes.id=node.attributes.id or "khp_"..color.."_"..path
    for i,child in ipairs(node.children or {}) do ids(child,color,path.."_"..i) end
end
local function shape(a,b)
    if not a or a.tag~=b.tag or a.attributes.id~=b.attributes.id then return false end
    if #(a.children or {})~=#(b.children or {}) then return false end
    for i,child in ipairs(b.children or {}) do if not shape(a.children[i],child) then return false end end
    return true
end
local function diff(a,b,patches)
    local attrs={}
    for key,value in pairs(b.attributes) do if a.attributes[key]~=value then attrs[key]=value end end
    for key in pairs(a.attributes) do if b.attributes[key]==nil then attrs[key]="" end end
    if next(attrs) then patches[#patches+1]={id=b.attributes.id,attrs=attrs} end
    for i,child in ipairs(b.children or {}) do diff(a.children[i],child,patches) end
end
local function renderNow(color)
    if RuHub.destroyed then return end
    local v=seat(color);local s=state()
    if v.tab=="ploys" and v.ployAuto then
        local desired=s and (s.phase=="firefight" or s.phase=="activation" or s.activation~=nil) and "fire" or "strat"
        if v.ploySeg~=desired then v.ploySeg=desired end
    end
    local vm=ruHubBuildVM(color);if not vm then return end
    local display=escapeDisplay(vm)
    -- Footer/phase shortcuts share a destination with rail tabs, but must have distinct XmlUI ids.
    for _,buttons in ipairs({display.foot or {},display.turn and display.turn.buttons or {}}) do
        for _,button in ipairs(buttons) do if button.cmd=="tab" then button.cmd="opentab" end end
    end
    -- Keep the toast's button in the tree so another seat's commit can disable it with an attribute patch.
    if display.toast then display.toast.undo=true end
    local tree=KT.hub.dock(display);injuryRows(tree,display);ids(tree,color,"1")
    local function hide(n)
        if n.attributes.id==KT.hub.id(color,"toast") then n.attributes.active=seat(color).toastHidden and "false" or "true" end
        if n.attributes.id==KT.hub.id(color,"undo") then
            local enabled=vm.toast and vm.toast.undo==true
            n.attributes.active=enabled and "true" or "false";n.attributes.interactable=enabled and "true" or "false"
            if not enabled then n.attributes.onClick="" end
        end
        if n.attributes.id and n.attributes.id:find("kh:"..color..":counter:",1,true)==1 then
            n.attributes.tooltip="Контрдействие: один раз за раунд на оперативника"
        end
        for _,child in ipairs(n.children or {}) do hide(child) end
    end
    hide(tree)
    local old=RuHub.trees[color]
    -- Attribute reads fall back to stale real UI during an unmount; inspect the composer's shadow roots instead.
    local present=false
    for _,root in ipairs(Global.call("ruUiLegacy",{owner="hub",op="getXmlTable"}) or {}) do
        if (root.attributes or {}).id==tree.attributes.id then present=true;break end
    end
    if present and shape(old,tree) then
        local patches={};diff(old,tree,patches);Global.call("ruUiPatchMany",patches)
    else
        -- The composer overlays saved patches on mounts. Drop this owner's obsolete patches before changing shape.
        if old then Global.call("ruUiUnmount",{owner="hub:"..color}) end
        Global.call("ruUiMount",{owner="hub:"..color,nodes={tree}})
    end
    RuHub.trees[color]=tree;RuHub.vms[color]=vm
end
function ruHubRender(color)
    if RuHub.destroyed or RuHub.pending[color] then return end
    if RuHub.migrationPending then retryLegacyMigration() end
    RuHub.pending[color]=true
    Wait.frames(function() RuHub.pending[color]=nil;renderNow(color) end,1)
end
function ruHubRenderAll()
    if RuHub.destroyed then return end
    if not RuHub.defaults then Global.call("ruUiMount",{owner="hub:defaults",nodes={KT.defaults()}});RuHub.defaults=true end
    local present={}
    for _,color in ipairs(colors()) do present[color]=true;ruHubRender(color) end
    for color in pairs(RuHub.trees) do
        if not present[color] then
            Global.call("ruUiUnmount",{owner="hub:"..color});RuHub.trees[color]=nil;RuHub.vms[color]=nil
        end
    end
end
function ruAssistantRender() ruHubRenderAll() end
local function openTab(v,key)
    if key=="ploys" and (v.tab~="ploys" or v.state~="open") then
        local s=state()
        v.ploySeg=s and (s.phase=="firefight" or s.activation~=nil) and "fire" or "strat"
        v.ployAuto=true
    end
    v.tab=key;v.state="open"
end
function ruHubOpen(params)
    local p=viewerFor(params.color);if not p then return false end
    if RuHub.migrationPending then retryLegacyMigration() end
    local v=seat(params.color);openTab(v,params.tab or "turn")
    for _,key in ipairs({"refScope","refKey","termKey"}) do if params[key]~=nil then v[key]=params[key] end end
    if params.guid then v.refGuid=params.guid;v.refScope="model" end
    ruHubRender(params.color);return true
end
function ruAssistantFocus(params)
    if not playerFor(params.color) then return false end
    seat(params.color).selected=params.guid;return ruHubOpen({color=params.color,tab="turn"})
end
function ruHubRoundEnd()
    for _,m in pairs(RuHub.marks) do m.used={};m.round=hubRound() end
    ruHubRenderAll()
end
function ruHubLegacyPloys(data)
    for color,old in pairs(type(data)=="table" and data.seats or {}) do
        do
            -- Rendering can create empty marks while efa3fe is still loading; merge into those marks.
            local m=RuHub.marks[color] or {team=old.team or "",used={},pinned={},round=hubRound()}
            if m.team=="" then m.team=old.team or "" end
            local references=nil
            for _,field in ipairs({"used","pinned"}) do
                for id,on in pairs(old[field] or {}) do
                    local key=id=="command-reroll" and "reroll" or id
                    if not RuAssistantCatalog.ploys[key] then
                        local prefix=tostring(old.team)..":"
                        local entry=id:sub(1,#prefix)==prefix and id:sub(#prefix+1) or id
                        -- Structured engine rules replace library entries, whose legacy ids are different.
                        references=references or refCall("ruRefQuery",{color=color,team=old.team,scope="ploy",query=""}) or {}
                        local english=nil
                        for _,item in ipairs(references.results or {}) do
                            if item.key==id or item.key:sub(-#id)==id then english=item.english;break end
                        end
                        for candidate,rule in pairs(RuAssistantCatalog.ploys) do
                            if rule.team==old.team and (rule.id==key or english and rule.english==english) then
                                key=candidate;break
                            end
                        end
                    end
                    if on and RuAssistantCatalog.ploys[key] and (field~="used" or m.round==(old.round or hubRound())) then
                        m[field][key]=true
                    end
                end
            end
            RuHub.marks[color]=m
        end
    end
    ruHubRenderAll();return true
end
function retryLegacyMigration()
    if not RuHub.migrationPending or RuHub.migration then return end
    local token={};RuHub.migrationToken=token;local attempts=0
    local function poll()
        if RuHub.destroyed or RuHub.migrationToken~=token or not RuHub.migrationPending then return end
        attempts=attempts+1
        local ready,value=pcall(function()
            local hud=getObjectFromGUID("efa3fe");return hud and hud.getVar("ruRefLoaded")==true
        end)
        if ready and value==true then
            RuHub.migration=nil;RuHub.migrationPending=false
            ruHubLegacyPloys(refCall("ruRefLegacyPloys",{}) or {})
        elseif attempts>=150 then RuHub.migration=nil
        else RuHub.migration=Wait.time(poll,2,1) end
    end
    poll()
end
local function validTab(key)
    for _,tab in ipairs(KT.hub.TABS) do if tab.key==key then return true end end;return false
end
function ruHubClick(p,value,id)
    p=actor(p);if not p or tostring(value)=="-2" then return false end
    local color,cmd,arg=tostring(id):match("^kh:([^:]+):([^:]+):?(.*)$")
    if color~=p.color or not cmd then return false end
    if arg=="" then arg=nil end
    local v=seat(color);local s=state();local event=nil;local ok,msg=nil,nil
    if spectator(p) and cmd~="tab" and cmd~="opentab" and cmd~="collapse" and cmd~="expand" and cmd~="term" and cmd~="termclose"
        and cmd~="refscope" and cmd~="refsearch" and cmd~="refopen" then return false end
    if cmd=="tab" or cmd=="opentab" then
        if not validTab(arg) or spectator(p) and arg~="ref" then return false end;openTab(v,arg)
    elseif cmd=="collapse" then v.state="rail"
    elseif cmd=="expand" then openTab(v,v.tab)
    elseif cmd=="term" then v.tab="ref";v.termKey=arg;v.state="open"
    elseif cmd=="termclose" then v.termKey=nil
    elseif cmd=="setupround" then if integer(tonumber(arg),1,rules.scoring.maxRounds) then v.setup.round=tonumber(arg) end
    elseif cmd=="setupphase" then if phases[tonumber(arg)] then v.setup.phaseIndex=tonumber(arg) end
    elseif cmd=="setupturn" then if seats()[tonumber(arg)] then v.setup.turnIndex=tonumber(arg) end
    elseif cmd=="start" then ok,msg=start(p)
    elseif cmd=="select" then
        local u=s and s.units[arg];local obj=arg and getObjectFromGUID(arg)
        local fresh=not u and obj and objectUnit(obj,{[steam(p)]=true})
        if not (u and u.owner==owner(p) or fresh) then return false end
        v.selected=arg;if obj then pcall(function() obj.highlightOn(color,3) end) end
    elseif cmd=="begin" or cmd=="counter" then
        v.selected=arg or v.selected;v.tab="turn";v.state="open"
        event={type="begin",unit=v.selected,mode=cmd=="counter" and "counteract" or "activation"}
    elseif cmd=="weapon" then v.weapon=arg
    elseif cmd=="trait" then
        v.tab="ref";v.refScope="weapon";v.refKey=nil;v.refGuid=v.selected;v.refQuery=arg or ""
        local u=s and s.units[v.selected]
        for _,w in ipairs(u and u.weapons or {}) do
            if w.key==arg then
                local terms=refCall("ruRefTermsIn",{text=w.rules}) or {};v.termKey=terms[1] and terms[1][1]
                v.refQuery=w.english or w.name;break
            end
        end
    elseif cmd=="order" then event={type="order",order=arg}
    elseif cmd=="action" then event=actionEvent(v,arg)
    elseif cmd=="finish" then event={type="finish"}
    elseif cmd=="finishaction" then event={type="finish_action"}
    elseif cmd=="passcounter" then event={type="pass_counteract"}
    elseif cmd=="passgambit" then event={type="pass_gambit"}
    elseif cmd=="undo" then event={type="undo"}
    elseif cmd=="advanced" then v.advanced.open=not v.advanced.open
    elseif cmd=="advcost" then if arg=="rule" or integer(tonumber(arg),0,2) then v.advanced.cost=arg end
    elseif cmd=="aplimit" then event={type="adjust_ap",value=tonumber(arg)}
    elseif cmd=="advrepeat" then v.advanced.exception=not v.advanced.exception
    elseif cmd=="removeeffect" then event={type="remove_effect",effect=arg}
    elseif cmd=="initiative" then
        local target=seatPlayer(tonumber(arg));event={type="initiative",winner=target and owner(target),confirmed=true}
    elseif cmd=="next" then event={type="next_phase",confirmed=true}
    elseif cmd=="squadseg" then if arg=="all" or arg=="ready" or arg=="hurt" then v.squadSeg=arg end
    elseif cmd=="enroll" or cmd=="enrollall" then ok,msg=enroll(p,cmd=="enrollall")
    elseif cmd=="team" then
        if not RuAssistantTeams[arg] then return false end
        if s and (not authority(p) or s.activation) then ok,msg=false,"Завершите активацию перед сменой отряда"
        else
            local m=marks(p);if m.team~=arg then m.used={} end;m.team=arg
            if s then s.players[owner(p)].team=arg;s.revision=s.revision+1;clearUndo() end
        end
    elseif cmd=="ployseg" then if arg=="strat" or arg=="fire" or arg=="pinned" then v.ploySeg=arg;v.ployAuto=false end
    elseif cmd=="ploysearch" then v.ployQuery=tostring(value or ""):sub(1,200)
    elseif cmd=="ploy" then
        local rule=RuAssistantCatalog.ploys[arg];if not rule then return false end
        v.openPloy=v.openPloy~=arg and arg or nil;v.ployCost=rule.cost;v.ployExpiry=rule.generic and "manual" or rule.expiry
        if rule.target and not v.ployTarget then v.ployTarget=v.selected end
    elseif cmd=="ploytarget" then
        local valid=false
        for _,u in pairs(s and s.units or {}) do if u.owner==owner(p) and u.id==arg then valid=true;break end end
        if not valid then return false end
        v.ployTarget=arg
    elseif cmd=="ployexpiry" then if arg=="round" or arg=="action" or arg=="manual" then v.ployExpiry=arg end
    elseif cmd=="ploycost" then v.ployCost=math.min(9,math.max(0,(v.ployCost or 1)+(arg=="+" and 1 or -1)))
    elseif cmd=="pin" then
        if not RuAssistantCatalog.ploys[arg] then return false end
        local m=marks(p);m.pinned[arg]=not m.pinned[arg] or nil
    elseif cmd=="useploy" then
        local rule=RuAssistantCatalog.ploys[arg];if not rule then return false end
        if s then event=ployEvent(p,arg)
        else
            local m=marks(p);local index=playerNumber[color]
            local cost=rule.generic and v.openPloy==arg and v.ployCost or rule.cost
            if rule.team~=team(p) and rule.team~="any" then ok,msg=false,"Уловка другого отряда"
            elseif not integer(cost,0,9) then ok,msg=false,"Некорректная стоимость CP"
            elseif m.used[arg] then ok,msg=false,"Уже применена в раунде"
            elseif not index or scoring[index].command<cost then ok,msg=false,"Недостаточно CP"
            else
                setCommandPoints(index,scoring[index].command-cost);m.used[arg]=true
                toast(p,"Применено: "..rule.name,"−"..cost.." CP",false)
            end
        end
    elseif cmd=="enemyseg" then if arg=="ops" or arg=="ploys" or arg=="rules" then v.enemySeg=arg end
    elseif cmd=="enemyploy" then v.openEnemyPloy=v.openEnemyPloy~=arg and arg or nil
    elseif cmd=="enemyunit" then v.tab="ref";v.refScope="model";v.refGuid=arg;v.refKey=nil
    elseif cmd=="enemyref" then
        local enemy=enemyPlayer(p);v.tab="ref";v.refTeam=enemy and team(enemy);v.refScope="team";v.refKey=nil;v.refGuid=nil
    elseif cmd=="logseg" then if arg=="events" or arg=="score" then v.logSeg=arg end
    elseif cmd=="refscope" then v.refScope=arg;v.refKey=nil;v.refGuid=nil;v.refTeam=nil
    elseif cmd=="refsearch" then v.refQuery=tostring(value or ""):sub(1,200);v.refKey=nil
    elseif cmd=="refopen" then v.refKey=arg
    else return false end
    if event then
        event.confirmed=true;event.costConfirmed=true;ok,msg=ruAssistantCommit(p,event)
    elseif msg then toast(p,msg,"",false) end
    ruHubRenderAll();return ok~=false,msg
end
local oldSave=onSave
function onSave()
    local ok,base=pcall(function() return JSON.decode(oldSave()) end)
    if not ok or type(base)~="table" then base={} end
    base.ruAssistant={version=1,serial=RuAssistantSerial,engine=RuAssistantEngine and RuAssistantCore.export(RuAssistantEngine),
        cpRevision=RuAssistantCPRevision,cpReceipts=RuAssistantCPReceipts,cpReceiptOrder=RuAssistantCPReceiptOrder}
    local states={};for color,v in pairs(RuHub.seats) do states[color]=v.state end
    base.ruHub={version=1,marks=RuHub.marks,cpByRound=RuHub.cpByRound,seats=states,
        seatSteam=RuHub.seatSteam,migrationPending=RuHub.migrationPending};return JSON.encode(base)
end
local oldLoadGM=loadGM
function loadGM()
    if RuHub.boardRestore then
        local saved=RuHub.boardRestore;RuHub.boardRestore=nil
        rules=saved.srules;players=saved.splayers or players;playerNumber=saved.splayerNumber or playerNumber
        scoring=saved.sscoring;result=saved.sresult or {};buildUI()
        Timer.create({identifier=self.getGUID(),function_name="checkPlayerHands",delay=1,repetitions=0})
    else
        RuAssistantEngine=nil;RuAssistantCPReceipts={};RuAssistantCPReceiptOrder={}
        RuAssistantCPRevision=RuAssistantCPRevision+1;RuHub.cpByRound={};ruHubRoundEnd();oldLoadGM()
    end
end
local oldLoad=onLoad
function onLoad(saved)
    RuHub.destroyed=false
    local ok,base=pcall(JSON.decode,saved or "");if not ok or type(base)~="table" then base={} end
    if type(base.sscoring)=="table" and base.sscoring[1] and base.sscoring[2] and type(base.srules)=="table" then
        RuHub.boardRestore=base
    end
    RuAssistantEngine=nil;oldLoad(saved)
    local stored=base.ruAssistant
    if type(stored)=="table" and stored.version==1 then
        RuAssistantSerial=integer(stored.serial,0,1000000000) and stored.serial or 0
        RuAssistantCPRevision=integer(stored.cpRevision,0,1000000000) and stored.cpRevision or 0
        RuAssistantCPReceipts={};RuAssistantCPReceiptOrder={}
        for _,rid in ipairs(type(stored.cpReceiptOrder)=="table" and stored.cpReceiptOrder or {}) do
            local r=type(stored.cpReceipts)=="table" and stored.cpReceipts[rid]
            if #RuAssistantCPReceiptOrder<256 and type(rid)=="string" and type(r)=="table" and type(r.owner)=="string"
                and type(r.expected)=="table" and type(r.changes)=="table" and integer(r.revision,0,1000000000) then
                RuAssistantCPReceipts[rid]=r;RuAssistantCPReceiptOrder[#RuAssistantCPReceiptOrder+1]=rid
            end
        end
        if stored.engine then
            local engine,err=RuAssistantCore.restore(stored.engine,RuAssistantCatalog)
            if engine then RuAssistantEngine=engine;syncCounters() else broadcastToAll("Центр KT: "..err) end
        end
    end
    for _,v in pairs(RuHub.seats) do if v.toastTimer then Wait.stop(v.toastTimer) end end
    RuHub.seats={};RuHub.marks={};RuHub.cpByRound={};RuHub.seatSteam={};RuHub.migrationPending=false
    local hub=base.ruHub
    if type(hub)=="table" and hub.version==1 then
        RuHub.marks=type(hub.marks)=="table" and hub.marks or {}
        RuHub.cpByRound=type(hub.cpByRound)=="table" and hub.cpByRound or {}
        RuHub.seatSteam=type(hub.seatSteam)=="table" and hub.seatSteam or {}
        RuHub.migrationPending=hub.migrationPending==true
        for color,mode in pairs(hub.seats or {}) do
            if mode=="open" or mode=="rail" or mode=="hidden" then seat(color).state=mode end
        end
    end
    rememberSeatSteam()
    if RuHub.migration then Wait.stop(RuHub.migration);RuHub.migration=nil end
    if not RuHub.migrationPending and next(RuHub.marks)==nil then RuHub.migrationPending=true end
    if RuHub.migrationPending then retryLegacyMigration() end
    self.addContextMenuItem("Центр Kill Team",function(color) ruHubOpen({color=color,tab="turn"}) end)
    addHotkey("Центр KT: открыть / свернуть",function(color)
        if not viewerFor(color) then return end
        local v=seat(color)
        if v.state=="open" then v.state="rail" else openTab(v,v.tab) end
        ruHubRender(color)
    end)
    addHotkey("Центр KT: справка по модели под курсором",function(color,hovered)
        if hovered then ruHubOpen({color=color,tab="ref",refScope="model",guid=hovered.getGUID()}) end
    end)
    addHotkey("Центр KT: завершить действие или активацию",function(color)
        local s=state();local p=playerFor(color);if not p then return end
        local cmd=s and s.activation and s.activation.pending and "finishaction" or "finish"
        ruHubClick(p,nil,KT.hub.id(color,cmd))
    end)
    if RuHub.watch then Wait.stop(RuHub.watch) end
    RuHub.watch=Wait.time(function() syncCounters();syncWounds();ruHubRenderAll() end,2,-1)
    syncWounds();ruAssistantSyncModels();ruHubRenderAll()
end
local oldSetCP=setCommandPoints
function setCommandPoints(index,value)
    if not scoring[index] or not integer(value,0,999) then return end
    oldSetCP(index,value);RuAssistantCPRevision=RuAssistantCPRevision+1;syncCounters()
    captureCP(hubRound());ruHubRenderAll()
end
function onCommandPointUpPressed(p,value,id)
    p=actor(p);local index=tonumber(tostring(id):match("player(%d+)"))
    if p and scoring[index] and (p.host==true or playerNumber[p.color]==index) then
        setCommandPoints(index,scoring[index].command+1)
    end
end
function onCommandPointDownPressed(p,value,id)
    p=actor(p);local index=tonumber(tostring(id):match("player(%d+)"))
    if p and scoring[index] and (p.host==true or playerNumber[p.color]==index) then
        setCommandPoints(index,math.max(0,scoring[index].command-1))
    end
end
local oldInitiative=onInitiativePressed
function onInitiativePressed(p,value,id)
    p=actor(p);if not p then return end
    if state() then ruHubOpen({color=p.color,tab="turn"}) else oldInitiative(p,value,id) end
end
local oldReset=resetScoring
function resetScoring()
    oldReset();RuAssistantEngine=nil;RuAssistantCPReceipts={};RuAssistantCPReceiptOrder={}
    RuAssistantCPRevision=RuAssistantCPRevision+1;RuHub.cpByRound={};ruHubRoundEnd()
end
local oldRound=getCurrentRound
function getCurrentRound() return state() and state().round or oldRound() end
local oldDestroy=onDestroy
function onDestroy()
    RuHub.destroyed=true
    if RuHub.watch then Wait.stop(RuHub.watch) end
    if RuHub.migration then Wait.stop(RuHub.migration) end;RuHub.migrationToken=nil
    for color,v in pairs(RuHub.seats) do
        if v.toastTimer then Wait.stop(v.toastTimer) end
        Global.call("ruUiUnmount",{owner="hub:"..color})
    end
    Global.call("ruUiUnmount",{owner="hub:defaults"})
    if oldDestroy then pcall(oldDestroy) end
end
end
