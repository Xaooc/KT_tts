-- Native assistant lives on the existing scoreboard. No remote service or dice automation.
RuAssistantEngine=nil
RuAssistantViews={}
RuAssistantSerial=0
local arColors={"White","Brown","Red","Orange","Yellow","Green","Teal","Blue","Purple","Pink","Black"}
local arPhase={firefight="Перестрелка",scoring="Подсчёт очков",initiative="Инициатива",ready="Подготовка",gambit="Стратегические гамбиты",finished="Партия завершена"}
local function arCopy(x) if type(x)~="table" then return x end;local out={};for k,v in pairs(x) do out[k]=arCopy(v) end;return out end
local function arInt(x,min,max) return type(x)=="number" and x==math.floor(x) and x>=min and x<=max end
local function arPlayer(p) return p and p.color and Player[p.color] and tostring(Player[p.color].steam_id)==tostring(p.steam_id) and Player[p.color] or nil end
local function arId(p) return tostring(p.steam_id) end
local function arPlain(s) return tostring(s or ""):gsub("<[^>]*>",""):gsub("&quot;",'"'):gsub("&amp;","&") end
local function arText(text,x,y,w,h,size,bold,color)
    return {tag="Text",attributes={text=text or "",width=tostring(w),height=tostring(h),offsetXY=x.." "..-y,rectAlignment="UpperLeft",alignment="UpperLeft",fontSize=tostring(size or 16),fontStyle=bold and "Bold" or "Normal",color=color or "#edf2f4",horizontalOverflow="Wrap",verticalOverflow="Truncate",raycastTarget="false"}}
end
local function arButton(id,text,x,y,w,h,primary,enabled)
    return {tag="Button",attributes={id=id,text=text,width=tostring(w),height=tostring(h),offsetXY=x.." "..-y,rectAlignment="UpperLeft",fontSize="16",fontStyle="Bold",textColor=primary and "#172027" or "#edf2f4",colors=primary and "#f09a60|#ffb783|#d48046|#6b594b" or "#29343b|#354650|#43555e|#242c31",interactable=enabled~=false and "true" or "false",onClick=self.getGUID().."/ruAssistantClick",horizontalOverflow="Wrap"}}
end
local function arLine(y) return {tag="Image",attributes={width="370",height="1",offsetXY="16 "..-y,rectAlignment="UpperLeft",color="#35424a",raycastTarget="false"}} end
local function arView(p)
    local id=arId(p);local v=RuAssistantViews[id]
    if not v then v={open=false,tab="activation",selected=nil,confirmed=false,cost="1",expiry="manual",exception=false};RuAssistantViews[id]=v end
    return v
end
local function arMessage(p,text) arView(p).message=text;pcall(function() p.broadcast(text,{r=.94,g=.67,b=.43}) end) end
local function arSeats()
    local out={}
    for color,index in pairs(playerNumber or {}) do local p=Player[color];if (index==1 or index==2) and p and p.seated~=false and tostring(p.steam_id or "")~="" then out[index]=p end end
    return out
end
local function arObjectUnit(obj,playersMap)
    if not obj.hasTag or not obj.hasTag("Operative") then return nil end
    local ok,st=pcall(function() return obj.getTable("state") end)
    if not ok or type(st)~="table" or type(st.stats)~="table" or type(st.info)~="table" or not playersMap[tostring(st.owner)] then return nil end
    local apl=tonumber(st.stats.APL);local wnd=tonumber(st.stats.Wounds or st.stats.W);local wounds=tonumber(st.wounds or wnd)
    if not arInt(apl,1,9) or not arInt(wnd,0,99) or not arInt(wounds,0,wnd) then return nil end
    local info=st.info;local marker=type(st.ktRuAssistant)=="table" and st.ktRuAssistant or {}
    local guid=obj.getGUID();local name=info.name or st.name or obj.getName();local keywords={}
    for _,k in pairs(info.categories or {}) do keywords[tostring(k):upper()]=true end
    if tostring(name):upper():find("IMMORTAL",1,true) then keywords.IMMORTAL=true end
    local weapons={};for _,w in ipairs(info.weapons or {}) do weapons[#weapons+1]={name=w.name or "Оружие",key=tostring(w.name):lower():find("tesla",1,true) and "tesla" or tostring(w.name),rules=(w.stats or {}).WR or ""} end
    local order=st.order or marker.order;local team=tostring(info.ktRuTeam or ""):lower():gsub("[^a-z0-9]","")
    if not RuAssistantTeams[team] then for _,category in ipairs(info.categories or {}) do local key=tostring(category):lower():gsub("[^a-z0-9]","");if RuAssistantTeams[key] then team=key end end end
    return {id=guid,owner=tostring(st.owner),name=RuAssistantNames[name] or name,english=name,apl=apl,wounds=wounds,maxWounds=wnd,keywords=keywords,weapons=weapons,order=(order=="Conceal" or order=="GuardConceal") and "Conceal" or "Engage",guard=order=="Guard" or order=="GuardConceal",guardOrder=(order=="Guard" or order=="GuardConceal") and order or nil,ready=st.ready~=nil and st.ready~=false or st.ready==nil and marker.ready~=false,counteracted=marker.counteracted==true,team=team}
end
local function arTrustedOwners()
    local out={};for _,p in ipairs(Player.getPlayers()) do out[arId(p)]={host=p.host==true} end;return out
end
local function arClearUndo() if RuAssistantEngine then RuAssistantEngine.history={} end end
local function arSyncCounters()
    local e=RuAssistantEngine;if not e then return end;local changed=false
    for _,p in ipairs(Player.getPlayers()) do
        local owned=e.state.players[arId(p)];local idx=playerNumber[p.color]
        if owned and idx and idx==owned.index and scoring[idx] then
            if owned.color~=p.color or owned.cp~=scoring[idx].command then changed=true end
            owned.color=p.color;owned.cp=scoring[idx].command;owned.host=p.host==true
        end
    end
    if changed then e.state.revision=e.state.revision+1;arClearUndo() end
end
local function arSyncWounds()
    local e=RuAssistantEngine;if not e then return end;local changed=false
    for id,u in pairs(e.state.units) do
        local obj=getObjectFromGUID(id);local fresh=obj and arObjectUnit(obj,e.state.players)
        if fresh and fresh.owner==u.owner then
            for _,field in ipairs({"wounds","ready","order","guard","guardOrder"}) do if u[field]~=fresh[field] then u[field]=fresh[field];changed=true end end
            if u.unavailable then u.unavailable=nil;changed=true end
        elseif not u.unavailable then u.wounds=0;u.ready=false;u.unavailable=true;changed=true end
    end
    if changed then e.state.revision=e.state.revision+1;arClearUndo() end
end
function ruAssistantSyncModels()
    local e=RuAssistantEngine;if not e then return end
    for id,u in pairs(e.state.units) do
        local obj=getObjectFromGUID(id)
        if obj then pcall(function()
            local st=obj.getTable("state");if type(st)~="table" or tostring(st.owner)~=u.owner then return end
            st.ktRuAssistant={order=u.order,ready=u.ready,counteracted=u.counteracted};st.ready=u.ready
            st.order=u.guard and (u.guardOrder=="GuardConceal" and "GuardConceal" or "Guard") or u.order
            obj.setTable("state",st);obj.call("saveState");pcall(function() obj.call("refreshWounds") end)
            local nodes=obj.UI.getXmlTable() or {};local keep={}
            for _,n in ipairs(nodes) do if (n.attributes or {}).id~="ruAssistantModelMarker" then keep[#keep+1]=n end end
            keep[#keep+1]={tag="Panel",attributes={id="ruAssistantModelMarker",width="260",height="48",position="0 0 -20",rotation="0 0 0",scale="0.16 0.16 0.16"},children={{tag="Text",attributes={text=u.order.." · "..(u.wounds==0 and "выведен" or u.ready and "готов" or "использован"),fontSize="30",fontStyle="Bold",color=u.ready and "#f0ad74" or "#a9bdc8",raycastTarget="false"}}}}
            obj.UI.setXmlTable(keep)
        end) end
    end
end
local function arRevisionId(p)
    RuAssistantSerial=RuAssistantSerial+1
    return "live:"..arId(p)..":"..RuAssistantSerial
end
local function arAuthority(p)
    local e=RuAssistantEngine;local own=e and e.state.players[arId(p)];local i=playerNumber[p.color]
    return own and own.index==i and scoring[i] and true or false
end
function ruAssistantCommit(p,event)
    p=arPlayer(p);if not p or not arAuthority(p) then return false,"Игрок или место не совпадают с участником партии" end
    arSyncCounters();arSyncWounds()
    local e=RuAssistantEngine;local revision=e.state.revision;event.revision=event.revision or revision;event.request=event.request or arRevisionId(p)
    local proposal=ruAssistantTrustedDispatch(e,p,event,RuAssistantCatalog)
    if not proposal.ok then return false,proposal.error end
    if proposal.message=="already-applied" then return true,proposal.message end
    local expected={scoring[1].command,scoring[2].command};local changes={}
    for id,own in pairs(proposal.candidate.state.players) do if own.cp~=expected[own.index] then changes[own.index]=own.cp end end
    if e.state.revision~=proposal.expectedRevision then return false,"Партия изменилась. Повторите действие" end
    -- Synchronous on the same object: validate both candidates before committing either.
    if next(changes) then
        local result=ruAssistantBoardCommit(p,{request=event.request,revision=RuAssistantCPRevision,expected=expected,changes=changes,deferLog=true})
        if not result.ok then return false,result.error end
    end
    RuAssistantEngine=proposal.candidate
    for _,view in pairs(RuAssistantViews) do view.confirmed=false;view.actionConfirmed=false;view.actionException=false end
    local s=RuAssistantEngine.state
    if event.type=="initiative" or event.type=="undo" then
        for owner,own in pairs(s.players) do for r=1,rules.scoring.maxRounds do scoring[own.index].initiative[r]=r<s.round and scoring[own.index].initiative[r] or (r==s.round and s.initiative==owner) end end
    end
    pcall(updateInitiativeUI);pcall(function() setUIValue("kts__round_current","Раунд "..s.round);if not s.initiative then hideUI("kts__initiative_display_player1");hideUI("kts__initiative_display_player2") end end);pcall(dispatchGameLogScoringEvent)
    ruAssistantSyncModels()
    return true,proposal.message
end
local function arTeamLabel(key) return (RuAssistantTeams[key] or {}).label or key or "Выберите отряд" end
local function arRosterChoices(s,owner)
    local out={};for id,u in pairs(s.units) do if u.owner==owner then out[#out+1]=id end end
    table.sort(out,function(a,b) return s.units[a].name<s.units[b].name end);return out
end
local function arStart(p)
    if p.host~=true then return false,"Партии помощника запускает ведущий" end
    local seats=arSeats();if not seats[1] or not seats[2] or arId(seats[1])==arId(seats[2]) then return false,"Нужны два игрока на местах табло" end
    if arId(p)~=arId(seats[1]) and arId(p)~=arId(seats[2]) then return false,"Ведущий должен занять одно из двух мест табло" end
    if not arView(p).attachConfirmed then return false,"Подтвердите этап и подключение между активациями" end
    if RuAssistantEngine then return false,"Партия уже запущена" end
    local owners={};for i,player in ipairs(seats) do local id=arId(player);owners[id]={id=id,index=i,color=player.color,host=player.host==true,name=player.steam_name or player.color,team="",cp=scoring[i].command,vp=0} end
    -- Each player explicitly selects deployed models; reserves elsewhere stay out.
    local units={}
    local first,second=arId(seats[1]),arId(seats[2]);local r=tonumber(arView(p).attachRound) or math.max(1,getCurrentRound());local ini=nil
    if not arInt(r,1,rules.scoring.maxRounds) then return false,"Введите текущий раунд от 1 до "..rules.scoring.maxRounds end
    for i,player in ipairs(seats) do if r>0 and scoring[i].initiative[r] then ini=arId(player) end end
    local requested=arView(p).attachPhase or "firefight";if requested=="initiative" then ini=nil end
    local phase=ini and requested or "initiative";local cpRound=requested=="initiative" and r>1 and r-1 or r
    local turn=arId(seats[arView(p).attachTurnIndex or 1])
    RuAssistantEngine=RuAssistantCore.new({matchId=arRevisionId(p),rulesVersion="KT3 · RU 06.10.2026",round=r,maxRounds=rules.scoring.maxRounds,phase=phase,initiative=ini,turnOwner=turn,gambitOwner=phase=="gambit" and turn or nil,cpAlreadyGrantedRound=cpRound,players=owners,opponents={[first]=second,[second]=first},units=units},RuAssistantCatalog)
    for _,player in ipairs(seats) do local v=arView(player);v.open=true;v.selected=arRosterChoices(RuAssistantEngine.state,arId(player))[1] end
    return true,"Партия подключена. Выделите выставленные модели рамкой и добавьте их во вкладке «Партия». CP взяты из табло"
end
local function arEnroll(p)
    if not arAuthority(p) then return false,"Сначала подключите партию" end
    local e=RuAssistantEngine;if e.state.activation then return false,"Завершите активацию перед изменением состава" end
    local objects=p.getSelectedObjects();if #objects==0 then return false,"Выделите свои модели рамкой на столе" end
    local n=0
    for _,obj in ipairs(objects) do local u=arObjectUnit(obj,e.state.players);if u and u.owner==arId(p) and (not e.state.units[u.id] or e.state.units[u.id].unavailable) then
        local keep={};for _,effect in ipairs(e.state.effects) do if effect.target~=u.id then keep[#keep+1]=effect end end;e.state.effects=keep
        e.state.units[u.id]=u;n=n+1;if RuAssistantTeams[u.team] then e.state.players[u.owner].team=u.team end
    end end
    if n==0 then return false,"Новых моделей с вашим владельцем и характеристиками не найдено" end
    e.state.revision=e.state.revision+1;arClearUndo();arView(p).selected=arRosterChoices(e.state,arId(p))[1];ruAssistantSyncModels();return true,"Добавлено моделей: "..n
end
local function arDropdown(id,choices,selected,x,y,w)
    local kids={};for i,label in ipairs(choices) do kids[#kids+1]={tag="Option",attributes={selected=i==selected and "true" or "false"},value=label} end
    return {tag="Dropdown",attributes={id=id,width=tostring(w),height="36",offsetXY=x.." "..-y,rectAlignment="UpperLeft",fontSize="15",value=tostring(selected-1),textColor="#edf2f4",itemTextColor="#edf2f4",itemBackgroundColors="#29343b|#354650|#43555e|#242c31",dropdownBackgroundColor="#1b2328",arrowColor="#f09a60",checkColor="#f09a60",dropdownHeight="250",itemHeight="36",colors="#29343b|#354650|#43555e|#242c31",onValueChanged=self.getGUID().."/ruAssistantChange(selectedIndex)"},children=kids}
end
local function arInput(id,value,x,y,w,placeholder)
    return {tag="InputField",attributes={id=id,text=tostring(value or ""),placeholder=placeholder,width=tostring(w),height="36",offsetXY=x.." "..-y,rectAlignment="UpperLeft",fontSize="15",textColor="#edf2f4",colors="#29343b|#354650|#43555e|#242c31",onEndEdit=self.getGUID().."/ruAssistantChange"}}
end
local function arCheckbox(id,text,checked,y)
    return {tag="Toggle",attributes={id=id,isOn=checked and "true" or "false",text=text,width="370",height="58",offsetXY="16 "..-y,rectAlignment="UpperLeft",fontSize="14",textColor="#b0bec5",onValueChanged=self.getGUID().."/ruAssistantChange"}}
end
function ruAssistantBuildDock(p)
    local v=arView(p);local e=RuAssistantEngine;local s=e and e.state;local owner=arId(p);local own=s and s.players[owner];local revision=s and s.revision or 0
    local function id(cmd) return "ruAssist_"..cmd.."_"..revision.."_"..p.color end
    local content={};local y=16
    local function text(t,h,size,bold,color) content[#content+1]=arText(t,16,y,370,h,size,bold,color);y=y+h+8 end
    local function btn(cmd,t,h,primary,enabled) content[#content+1]=arButton(id(cmd),t,16,y,370,h or 40,primary,enabled);y=y+(h or 40)+8 end
    local function line() content[#content+1]=arLine(y);y=y+16 end
    local function dropdown(cmd,labels,selected) content[#content+1]=arDropdown(id(cmd),labels,selected,16,y,370);y=y+44 end
    local function check(cmd,t,value) content[#content+1]=arCheckbox(id(cmd),t,value,y);y=y+66 end
    if not s then
        text("Подключить помощника",34,24,true);text("CP и очки останутся на табло. После подключения каждый игрок добавляет выставленные модели выделением рамкой.",96,16)
        text("Оба игрока должны занять места табло. Если матч уже идёт, подключение сохраняет текущий раунд и инициативу.",100,16)
        content[#content+1]=arInput(id("attachround"),v.attachRound or math.max(1,getCurrentRound()),16,y,90,"Раунд");content[#content+1]=arText("Текущий раунд 1–4",118,y+7,245,36,15);y=y+48
        text("Текущий этап при подключении к начатому матчу",50,16,true)
        dropdown("attachphase",{"Перестрелка — CP уже учтены","Подготовка — CP уже учтены","Гамбиты — CP уже учтены","Подсчёт очков — CP уже учтены","Инициатива (раунд 1: CP сохраняются)"},({firefight=1,ready=2,gambit=3,scoring=4,initiative=5})[v.attachPhase] or 1)
        local seats=arSeats();if seats[1] and seats[2] then text("Кто сейчас действует (активация / гамбит)",44,15,true);dropdown("attachturn",{seats[1].steam_name or seats[1].color,seats[2].steam_name or seats[2].color},v.attachTurnIndex or 1) end
        check("attachconfirm","Раунд, этап и очередь проверены; незавершённой активации сейчас нет",v.attachConfirmed)
        btn("start","Подключить текущую партию",48,true,p.host==true and v.attachConfirmed)
    elseif not own or not arAuthority(p) then text("Это место не связано с участником партии. Вернитесь на своё место табло.",110,18,true)
    else
        text("Раунд "..s.round.." / "..s.maxRounds.." · "..arPhase[s.phase],30,18,true,"#f09a60")
        local ini=s.initiative and s.players[s.initiative].name or "ещё не определена"
        local vp=0;pcall(function() vp=calculateScore(own.index) end)
        text(own.cp.." CP · "..tostring(vp).." очков · "..own.name,30,20,true)
        if v.tab=="match" then text("Инициатива: "..ini.." · "..arTeamLabel(own.team),58,14,false,"#b0bec5") end
        line()
        local ro=arRosterChoices(s,owner);v.roster=ro
        if not s.units[v.selected] or s.units[v.selected].owner~=owner then v.selected=ro[1] end
        local selectedIndex=1;local labels={};for i,guid in ipairs(ro) do local u=s.units[guid];labels[i]=u.name.." · "..u.wounds.."/"..u.maxWounds.." WND";if guid==v.selected then selectedIndex=i end end
        if #labels>0 and not (s.activation and v.tab=="activation") then dropdown("unit",labels,selectedIndex) end
        local a=s.activation;local u=s.units[v.selected]
        if v.tab=="activation" then
            if a then
                local active=s.units[a.unit];text(active.name,38,24,true);text(active.english,22,14,false,"#b0bec5")
                text("WND "..active.wounds.."/"..active.maxWounds.."    APL "..RuAssistantCore.apl(s,a.unit).."    AP "..math.max(0,a.ap-a.spent),38,23,true)
                text("Приказ: "..active.order..(active.guard and " · Guard — вручную" or "")..(a.mode=="counteract" and " · Контрдействие" or ""),30,16,true)
                if active.wounds<=0 or active.unavailable then text("Оперативник недоступен. Завершите текущее действие и активацию.",76,16,true,"#f8ae9d") end
                if a.mode=="counteract" then text("Контрдействие: только одно действие 1 AP бесплатно. Перемещение / установка — не более 2″; проверьте на поле.",94,15,false,"#f09a60") end
                if a.owner~=owner then text("Действует соперник. Ваши ответные уловки доступны во вкладке «Уловки».",76,16)
                elseif a.pending then
                    text("В процессе: "..a.pending.name.." · "..tostring(a.pending.weapon or ""),58,18,true,"#f09a60")
                    btn("finishaction","Завершить действие",44,true);btn("tabploy","Уловки для этого момента",40)
                else
                    if not next(a.performed) and a.mode~="counteract" then content[#content+1]=arButton(id("engage"),"Engage",16,y,181,36);content[#content+1]=arButton(id("conceal"),"Conceal",205,y,181,36);y=y+44 end
                    v.weapons=active.weapons or {};local names={};local wi=1
                    for i,w in ipairs(v.weapons) do names[i]=w.name;if w.key==v.weapon then wi=i end end
                    if #names>0 then v.weapon=v.weapons[wi].key;dropdown("weapon",names,wi) else v.weapon=nil end
                    for index,key in ipairs({"reposition","dash","charge","shoot","fight","fallback","mission"}) do local rule=RuAssistantCatalog.actions[key];local cost=v.actionConfirmed and tonumber(v.actionCost) or rule.cost;local available=active.wounds>0 and not active.unavailable and (not a.performed[key] or v.actionException) and (a.mode=="counteract" and rule.cost==1 or a.mode~="counteract" and (cost or rule.cost)<=a.ap-a.spent)
                        for _,excluded in ipairs(rule.excludes or {}) do if a.performed[excluded] and not v.actionException then available=false end end
                        local column=(index-1)%2;content[#content+1]=arButton(id("action"..key),rule.name.." · "..(a.mode=="counteract" and "бесплатно" or (cost or rule.cost).." AP"),16+column*189,y,key=="mission" and 370 or 181,44,false,available)
                        if column==1 or key=="mission" then y=y+52 end
                    end
                    text("Можно закончить с неиспользованными AP.",42,14,false,"#b0bec5")
                    btn("advanced",v.advanced and "Скрыть особые правила AP" or "Особая стоимость AP / повтор ↗",38)
                    if v.advanced then
                        content[#content+1]=arInput(id("actioncost"),v.actionCost,16,y,90,"AP");content[#content+1]=arText("Стоимость следующего действия",118,y+7,250,40,14);y=y+48
                        check("actionconfirm","Эта стоимость AP разрешена правилом",v.actionConfirmed)
                        check("actionexception","Правило отдельно разрешает повтор / сочетание",v.actionException)
                        content[#content+1]=arInput(id("ap"),a.ap,16,y,90,"AP");content[#content+1]=arText("Лимит AP при особом правиле",118,y+7,260,40,14);y=y+48
                    end
                end
            elseif u then
                text(u.name,72,24,true);text("WND "..u.wounds.."/"..u.maxWounds.."    APL "..RuAssistantCore.apl(s,u.id).."    "..u.order,38,21,true)
                text(u.unavailable and "Модель отсутствует или сменила владельца" or u.guard and "Guard — охрана разрешается вручную" or u.ready and "Готов к активации" or "Использован в этом раунде",58,16,true,"#aed7b2")
                text("Очередь: "..s.players[s.turnOwner].name,44,16)
                btn("begin","Начать активацию",44,true,s.phase=="firefight" and s.turnOwner==owner and u.ready and u.wounds>0)
                btn("counter","Контрдействие (Counteract)",42,false,s.phase=="firefight" and s.turnOwner==owner and not u.ready and u.wounds>0)
                btn("passcounter","Пропустить контрдействие",40)
            else text("Нет моделей. Выделите свои модели на столе рамкой, затем нажмите «Добавить модели».",100,17,true) end
        elseif v.tab=="ploy" then
            text(s.phase=="gambit" and "Стратегические уловки" or "Боевые уловки",36,23,true)
            text(s.phase=="gambit" and "Гамбит: "..s.players[s.gambitOwner].name or "Подтвердите условия и момент по полному правилу.",55,15,false,"#b0bec5")
            local choices={};for key,rule in pairs(RuAssistantCatalog.ploys) do if (rule.team==own.team or rule.team=="any") and rule.phase==(s.phase=="gambit" and "gambit" or "firefight") then choices[#choices+1]=key end end
            table.sort(choices,function(x,z) return RuAssistantCatalog.ploys[x].name<RuAssistantCatalog.ploys[z].name end);v.ploys=choices
            local pi=1;for i,key in ipairs(choices) do if key==v.ploy then pi=i end end;v.ploy=choices[pi]
            local plabels={};for i,key in ipairs(choices) do plabels[i]=RuAssistantCatalog.ploys[key].name end
            if #plabels>0 then
                dropdown("ploy",plabels,pi);local rule=RuAssistantCatalog.ploys[v.ploy]
                text(rule.english or "",38,14,false,"#b0bec5");text(rule.generic and "Стоимость, исключения и срок отметьте по тексту правила. Эффект напомнит помощник; броски и цели разрешают игроки." or rule.effect or "Переброс разрешается вручную.",110,16)
                btn("readploy","Полное правило и термины ↗",40)
                content[#content+1]=arInput(id("cost"),v.cost,16,y,90,"CP");content[#content+1]=arText("Стоимость CP",118,y+7,240,28,15);y=y+48
                if rule.generic then
                    dropdown("target",{"Эффект отряда / без цели","Выбранный оперативник"},v.targetMode=="unit" and 2 or 1)
                    dropdown("expiry",{"Снять вручную","До конца раунда","До конца действия","До конца следующей активации цели"},({manual=1,round=2,action=3,activation_end=4})[v.expiry] or 1)
                    content[#content+1]=arInput(id("effectnote"),v.effectNote,16,y,370,"Заметка об эффекте (необязательно)");y=y+44
                    check("exception","Правило разрешает повторное применение",v.exception)
                end
                check("confirm","Условия, стоимость и момент применения проверены",v.confirmed)
                btn("useploy","Применить · "..v.cost.." CP",48,true,v.confirmed and (s.phase==rule.phase))
            else text("Выберите свой отряд во вкладке «Партия».",65,16) end
            if s.phase=="gambit" then btn("passgambit","Пас стратегического гамбита",42,false,s.gambitOwner==owner) end
        else
            text("Партия и подготовка",40,24,true)
            if s.phase=="initiative" then text(s.cpAlreadyGrantedRound==s.round and "Определите инициативу. CP текущего раунда уже учтены на табло и сохранятся (по умолчанию 3 CP в раунде 1)." or "Определите инициативу. CP будут начислены один раз: +1 с инициативой, +2 сопернику.",110,16);for id2,pl in pairs(s.players) do btn("initiative"..pl.index,pl.name,44,true,p.host==true) end
            elseif s.phase=="ready" then text("Модели готовы. Разрешите фракционные правила подготовки, включая восстановление WND, вручную.",100,16);check("confirm","Все правила подготовки разрешены",v.confirmed);btn("next","Перейти к гамбитам",44,true,p.host==true and v.confirmed)
            elseif s.phase=="gambit" then text("Гамбиты применяются по очереди. Два последовательных паса начинают перестрелку.",90,16);btn("tabploy","Выбрать стратегическую уловку",44,true);btn("passgambit","Пас",42,false,s.gambitOwner==owner)
            elseif s.phase=="scoring" then text("Подсчитайте очки на табло и разрешите правила конца раунда. Эффекты с другими сроками сохранятся.",106,16);check("confirm","Очки и правила конца раунда разрешены",v.confirmed);btn("next",s.round==s.maxRounds and "Завершить партию" or "Начать раунд "..(s.round+1),44,true,p.host==true and v.confirmed)
            elseif s.phase=="firefight" then text("Перед концом фазы завершите все активации. Добавьте отсутствующие модели до перехода.",90,16);btn("next","Перейти к подсчёту очков",44,true,p.host==true and not s.activation)
            else text("Партия завершена",45,21,true) end
            line();btn("enroll","Добавить выделенные модели",42)
            local teams={};local ti=1;v.teams={};for key in pairs(RuAssistantTeams) do v.teams[#v.teams+1]=key end;table.sort(v.teams,function(x,z) return arTeamLabel(x)<arTeamLabel(z) end)
            for i,key in ipairs(v.teams) do teams[i]=arTeamLabel(key);if own.team==key then ti=i end end
            text("Ваш отряд",28,16,true);dropdown("team",teams,ti)
            if u then
                text("Напоминание для: "..u.name,58,16,true);content[#content+1]=arInput(id("effecttitle"),v.effectTitle,16,y,370,"Название эффекта");y=y+44
                dropdown("effectexpiry",{"Снять вручную","До конца раунда","До конца следующей активации цели"},({manual=1,round=2,activation_end=3})[v.effectExpiry] or 1)
                content[#content+1]=arInput(id("apldelta"),v.aplDelta or "0",16,y,90,"APL ±1");content[#content+1]=arText("Изменение APL: −1 / 0 / +1",118,y+7,250,38,14);y=y+48
                btn("addeffect","Добавить подтверждённый эффект",44,false,v.effectTitle and v.effectTitle~="")
            end
        end
        line();text("Временные эффекты",30,18,true)
        local shown=0;v.effects={}
        for _,effect in ipairs(s.effects) do if effect.owner==owner then
            shown=shown+1;v.effects[shown]=effect.id;text(effect.title,48,17,true);text(effect.expiryLabel,52,14,false,"#b0bec5")
            if effect.text then text(arPlain(effect.text),90,14,false,"#b0bec5") end
            btn("remove"..shown,"Снять вручную",34)
        end end
        if shown==0 then text("Нет отмеченных эффектов",28,14,false,"#b0bec5") end
        line();btn("undo","Отменить последнее действие",42,false,#e.history>0)
        local last=s.journal[#s.journal];if last then text(last.label,60,14,false,"#b0bec5") end
        btn("reference","Справочник отряда и термины ↗",40)
    end
    if v.message then line();text(v.message,110,15,false,"#f8ae9d") end
    text("Геометрия, цели и броски проверяются на поле",54,13,false,"#b0bec5")
    local children={{tag="Image",attributes={color="#1b2328",raycastTarget="true"}},arText("KILL TEAM · Помощник партии",16,12,324,28,19,true),arButton(id("close"),"×",360,10,32,32)}
    for i,tab in ipairs({{"activation","Активация"},{"ploy","Уловки"},{"match","Партия"}}) do children[#children+1]=arButton(id("tab"..tab[1]),tab[2],16+(i-1)*128,50,122,36,v.tab==tab[1]) end
    children[#children+1]={tag="VerticalScrollView",attributes={id="ruAssistantScroll_"..p.color,width="402",height="516",offsetXY="0 -96",rectAlignment="UpperLeft",horizontal="false",vertical="true",horizontalScrollbarVisibility="AutoHide",horizontalScrollbarHeight="0",verticalScrollbarVisibility="Permanent",verticalScrollbarWidth="14",color="#00000000",scrollbarBackgroundColor="#303b43",scrollbarColors="#e58b50|#f6a46e|#bc6535|#657988",scrollSensitivity="28",movementType="Clamped"},children={{tag="Panel",attributes={width="388",height=tostring(y+20),rectAlignment="UpperLeft"},children=content}}}
    children[#children+1]=arLine(616)
    if own and v.tab=="ploy" and v.ploy and RuAssistantCatalog.ploys[v.ploy] then
        local rule=RuAssistantCatalog.ploys[v.ploy];children[#children+1]=arButton(id("stickyuseploy"),"Применить · "..v.cost.." CP",16,628,370,40,true,v.confirmed and s.phase==rule.phase)
    elseif own and s.activation and s.activation.owner==owner then
        local pending=s.activation.pending;children[#children+1]=arButton(id(pending and "stickyfinishaction" or "stickyfinish"),pending and "Завершить действие" or "Завершить активацию",16,628,370,40,true)
    else children[#children+1]=arText("Правила и история — ниже в прокрутке",16,637,370,30,13,false,"#b0bec5") end
    return {tag="Panel",attributes={id="ruAssistantDock_"..p.color,width="402",height="680",rectAlignment="UpperLeft",offsetXY="18 -70",visibility=p.color},children=children}
end
function ruAssistantRender()
    if Global.UI.loading then
        if not RuAssistantRenderWaiting then RuAssistantRenderWaiting=true;Wait.condition(function() RuAssistantRenderWaiting=false;ruAssistantRender() end,function() return not Global.UI.loading end) end
        return
    end
    local nodes=Global.UI.getXmlTable() or {};local keep={}
    for _,n in ipairs(nodes) do if not tostring((n.attributes or {}).id or ""):match("^ruAssistant") then keep[#keep+1]=n end end
    local s=RuAssistantEngine and RuAssistantEngine.state;local summary=s and ("Раунд "..s.round.." · "..arPhase[s.phase]) or "Помощник партии"
    keep[#keep+1]={tag="Panel",attributes={id="ruAssistantToolbar",width="402",height="40",rectAlignment="UpperLeft",offsetXY="18 -18",visibility=table.concat(arColors,"|")},children={arButton("ruAssist_open_0_All",summary.." ↗",0,0,402,40,true)}}
    for _,p in ipairs(Player.getPlayers()) do if arView(p).open and p.color~="Grey" then keep[#keep+1]=ruAssistantBuildDock(p) end end
    Global.UI.setXmlTable(keep)
end
function ruAssistantFocus(params)
    local p=Player[params.color];local s=RuAssistantEngine and RuAssistantEngine.state;local u=s and s.units[params.guid]
    if p and u and u.owner==arId(p) and arAuthority(p) then arView(p).selected=u.id;if arView(p).open then ruAssistantRender() end end
end
local function arAuthCallback(p,id)
    p=arPlayer(p);if not p then return nil end
    local cmd,revision,color=tostring(id):match("^ruAssist_(%w+)_(%d+)_([A-Za-z]+)$")
    if not cmd or color~=p.color then return nil end
    local s=RuAssistantEngine and RuAssistantEngine.state
    if tonumber(revision)~=(s and s.revision or 0) then arMessage(p,"Состояние изменилось. Панель обновлена");ruAssistantRender();return nil end
    return p,cmd,arView(p)
end
local function arRead(p,ploy)
    local hud=getObjectFromGUID("efa3fe");if hud then hud.call("ruAssistantRead",{color=p.color,team=RuAssistantEngine and RuAssistantEngine.state.players[arId(p)].team,english=ploy and ploy.english or nil}) end
    arView(p).open=false
end
function ruAssistantClick(p,value,id)
    p=arPlayer(p);if not p then return end
    if id=="ruAssist_open_0_All" then arView(p).open=not arView(p).open;arSyncCounters();arSyncWounds();ruAssistantRender();return end
    local cmd,v;p,cmd,v=arAuthCallback(p,id);if not p then return end
    if cmd:sub(1,6)=="sticky" then cmd=cmd:sub(7) end
    if cmd=="close" then v.open=false;ruAssistantRender();return end
    if cmd=="advanced" then v.advanced=not v.advanced;if not v.advanced then v.actionConfirmed=false;v.actionException=false;v.actionCost=nil end;ruAssistantRender();return end
    if cmd:sub(1,3)=="tab" then v.tab=cmd:sub(4);v.confirmed=false;v.message=nil;ruAssistantRender();return end
    local ok,msg;local s=RuAssistantEngine and RuAssistantEngine.state
    if cmd=="start" then ok,msg=arStart(p)
    elseif cmd=="enroll" then ok,msg=arEnroll(p)
    elseif not s or not arAuthority(p) then ok,msg=false,"Партия не подключена к вашему месту"
    elseif cmd=="reference" then arRead(p)
    elseif cmd=="readploy" then arRead(p,RuAssistantCatalog.ploys[v.ploy])
    else
        local event={unit=v.selected}
        if cmd=="begin" or cmd=="counter" then event.type="begin";event.mode=cmd=="counter" and "counteract" or "activation"
        elseif cmd:sub(1,6)=="action" then
            event.type="action";event.action=cmd:sub(7);event.weapon=v.weapon;event.exception=v.actionException==true
            if v.actionConfirmed then if not arInt(tonumber(v.actionCost),0,9) then arMessage(p,"Введите стоимость AP от 0 до 9");ruAssistantRender();return end;event.cost=tonumber(v.actionCost);event.costConfirmed=true end
        elseif cmd=="finish" then event.type="finish"
        elseif cmd=="finishaction" then event.type="finish_action"
        elseif cmd=="engage" or cmd=="conceal" then event.type="order";event.order=cmd=="engage" and "Engage" or "Conceal"
        elseif cmd=="passcounter" then event.type="pass_counteract"
        elseif cmd=="passgambit" then event.type="pass_gambit"
        elseif cmd=="useploy" then
            if not arInt(tonumber(v.cost),0,9) then arMessage(p,"Введите целую стоимость CP от 0 до 9");ruAssistantRender();return end
            event.type="ploy";event.ploy=v.ploy;event.target=v.selected;if RuAssistantCatalog.ploys[v.ploy].generic and v.targetMode~="unit" then event.target=nil end;event.effectText=v.effectNote;event.confirmed=v.confirmed;event.cost=tonumber(v.cost);event.costConfirmed=v.confirmed;event.exception=v.exception;event.expiry={kind=v.expiry}
        elseif cmd=="next" then event.type="next_phase";event.confirmed=v.confirmed
        elseif cmd:sub(1,10)=="initiative" then event.type="initiative";for owner,pl in pairs(s.players) do if pl.index==tonumber(cmd:sub(11)) then event.winner=owner end end
        elseif cmd=="undo" then event.type="undo"
        elseif cmd=="addeffect" then event.type="add_effect";event.title=v.effectTitle;event.expiry={kind=v.effectExpiry or "manual"};event.aplDelta=tonumber(v.aplDelta or "0");event.confirmed=true
        elseif cmd:sub(1,6)=="remove" then event.type="remove_effect";event.effect=v.effects[tonumber(cmd:sub(7))]
        end
        event.revision=s.revision
        if event.type then ok,msg=ruAssistantCommit(p,event) else ok,msg=false,"Неизвестная кнопка" end
    end
    if msg then arMessage(p,msg) end;v.confirmed=false;v.actionConfirmed=false;v.actionException=false;if cmd=="useploy" then v.exception=false end;ruAssistantRender()
end
function ruAssistantChange(p,value,id)
    local cmd,v;p,cmd,v=arAuthCallback(p,id);if not p then return end
    local bool=value=="True" or value=="true" or value==true;local i=tonumber(value);if i then i=i+1 end
    if cmd=="confirm" then v.confirmed=bool
    elseif cmd=="actionconfirm" then v.actionConfirmed=bool
    elseif cmd=="actionexception" then v.actionException=bool
    elseif cmd=="actioncost" then v.actionCost=tostring(value);v.actionConfirmed=false
    elseif cmd=="attachphase" then v.attachPhase=({"firefight","ready","gambit","scoring","initiative"})[i]
    elseif cmd=="attachround" then v.attachRound=tostring(value)
    elseif cmd=="attachturn" then v.attachTurnIndex=i;v.attachConfirmed=false
    elseif cmd=="attachconfirm" then v.attachConfirmed=bool
    elseif cmd=="target" then v.targetMode=i==2 and "unit" or "team";v.confirmed=false
    elseif cmd=="effectnote" then v.effectNote=tostring(value):sub(1,1000);v.confirmed=false
    elseif cmd=="exception" then v.exception=bool;v.confirmed=false
    elseif cmd=="unit" then v.selected=(v.roster or {})[i];v.confirmed=false
    elseif cmd=="weapon" then v.weapon=((v.weapons or {})[i] or {}).key;v.confirmed=false
    elseif cmd=="ploy" then v.ploy=(v.ploys or {})[i];v.cost="1";v.confirmed=false;v.exception=false;v.effectNote="";v.expiry="manual";v.targetMode="team"
    elseif cmd=="cost" then v.cost=tostring(value);v.confirmed=false
    elseif cmd=="expiry" then v.expiry=({"manual","round","action","activation_end"})[i];v.confirmed=false
    elseif cmd=="effectexpiry" then v.effectExpiry=({"manual","round","activation_end"})[i]
    elseif cmd=="effecttitle" then v.effectTitle=tostring(value):sub(1,180)
    elseif cmd=="apldelta" then v.aplDelta=tostring(value)
    elseif cmd=="team" and arAuthority(p) then
        local e=RuAssistantEngine;if e.state.activation then arMessage(p,"Завершите активацию перед сменой отряда") else e.state.players[arId(p)].team=(v.teams or {})[i] or "";e.state.revision=e.state.revision+1;arClearUndo() end
    elseif cmd=="ap" then local ok,msg=ruAssistantCommit(p,{type="adjust_ap",value=tonumber(value)});arMessage(p,msg) end
    ruAssistantRender()
end
local arOldOnSave=onSave
function onSave()
    local ok,base=pcall(JSON.decode,arOldOnSave());if not ok or type(base)~="table" then base={} end
    base.ruAssistant={version=1,serial=RuAssistantSerial,engine=RuAssistantEngine and RuAssistantCore.export(RuAssistantEngine),cpRevision=RuAssistantCPRevision,cpReceipts=RuAssistantCPReceipts,cpReceiptOrder=RuAssistantCPReceiptOrder}
    return JSON.encode(base)
end
local arOldLoadGM=loadGM
function loadGM()
    if RuAssistantBoardRestore then
        local saved=RuAssistantBoardRestore;RuAssistantBoardRestore=nil
        rules=saved.srules;players=saved.splayers or players;playerNumber=saved.splayerNumber or playerNumber;scoring=saved.sscoring;result=saved.sresult or {}
        buildUI();Timer.create({identifier=self.getGUID(),function_name="checkPlayerHands",delay=1,repetitions=0})
    else
        RuAssistantEngine=nil;RuAssistantCPReceipts={};RuAssistantCPReceiptOrder={};RuAssistantCPRevision=RuAssistantCPRevision+1
        arOldLoadGM()
    end
end
local arOldOnLoad=onLoad
function onLoad(saved)
    local ok,base=pcall(JSON.decode,saved or "");if not ok or type(base)~="table" then base={} end
    if type(base.sscoring)=="table" and base.sscoring[1] and base.sscoring[2] and type(base.srules)=="table" then RuAssistantBoardRestore=base end
    arOldOnLoad(saved)
    local stored=base.ruAssistant
    if type(stored)=="table" and stored.version==1 then
        RuAssistantSerial=arInt(stored.serial,0,1000000000) and stored.serial or 0
        RuAssistantCPRevision=arInt(stored.cpRevision,0,1000000000) and stored.cpRevision or 0
        -- CP retry receipts are accepted only with their complete fingerprint and bounded order.
        RuAssistantCPReceipts={};RuAssistantCPReceiptOrder={}
        for _,rid in ipairs(type(stored.cpReceiptOrder)=="table" and stored.cpReceiptOrder or {}) do
            local r=type(stored.cpReceipts)=="table" and stored.cpReceipts[rid]
            if #RuAssistantCPReceiptOrder<256 and type(rid)=="string" and type(r)=="table" and type(r.owner)=="string" and type(r.expected)=="table" and type(r.changes)=="table" and arInt(r.revision,0,1000000000) then RuAssistantCPReceipts[rid]=r;RuAssistantCPReceiptOrder[#RuAssistantCPReceiptOrder+1]=rid end
        end
        if stored.engine then
            -- Stable IDs persist across reconnect; host permissions are replaced on every dispatch.
            local engine,err=RuAssistantCore.restore(stored.engine,RuAssistantCatalog)
            if engine then RuAssistantEngine=engine;arSyncCounters() else broadcastToAll("Помощник: "..err) end
        end
    end
    self.addContextMenuItem("Помощник партии",function(color) local p=Player[color];if p then arView(p).open=true;ruAssistantRender() end end)
    Wait.frames(ruAssistantRender,45)
    if RuAssistantWatch then Wait.stop(RuAssistantWatch) end
    RuAssistantWatch=Wait.time(function()
        local changed=false
        if RuAssistantEngine then local old=RuAssistantEngine.state.revision;arSyncCounters();arSyncWounds();changed=old~=RuAssistantEngine.state.revision end
        if changed or not Global.UI.getAttribute("ruAssistantToolbar","id") then ruAssistantRender() end
    end,2,-1)
    Wait.frames(function() arSyncWounds();ruAssistantSyncModels() end,50)
end
local arOldSetCP=setCommandPoints
function setCommandPoints(index,value)
    if not arInt(value,0,999) then return end
    arOldSetCP(index,value);RuAssistantCPRevision=RuAssistantCPRevision+1;arSyncCounters();ruAssistantRender()
end
function onCommandPointUpPressed(p,value,id)
    p=arPlayer(p);local index=tonumber(tostring(id):match("player(%d+)"));if p and index and (p.host==true or playerNumber[p.color]==index) then setCommandPoints(index,scoring[index].command+1) end
end
function onCommandPointDownPressed(p,value,id)
    p=arPlayer(p);local index=tonumber(tostring(id):match("player(%d+)"));if p and index and (p.host==true or playerNumber[p.color]==index) then setCommandPoints(index,math.max(0,scoring[index].command-1)) end
end
local arOldInitiative=onInitiativePressed
function onInitiativePressed(p,value,id)
    p=arPlayer(p);if not p then return end
    if RuAssistantEngine then arMessage(p,"Инициатива и раунд теперь выбираются во вкладке «Партия»");arView(p).open=true;arView(p).tab="match";ruAssistantRender() else arOldInitiative(p,value,id) end
end
local arOldReset=resetScoring
function resetScoring()
    arOldReset();RuAssistantEngine=nil;RuAssistantCPReceipts={};RuAssistantCPReceiptOrder={};RuAssistantCPRevision=RuAssistantCPRevision+1
end
local arOldRound=getCurrentRound
function getCurrentRound() return RuAssistantEngine and RuAssistantEngine.state.round or arOldRound() end
local arOldDestroy=onDestroy
function onDestroy()
    if RuAssistantWatch then Wait.stop(RuAssistantWatch) end
    if arOldDestroy then pcall(arOldDestroy) end
    local nodes=Global.UI.getXmlTable() or {};local keep={};for _,n in ipairs(nodes) do if not tostring((n.attributes or {}).id or ""):match("^ruAssistant") then keep[#keep+1]=n end end;Global.UI.setXmlTable(keep)
end
