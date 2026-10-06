-- Ploy use reminders: rules/effects and CP are resolved by players on the existing table.
RuPloySeats = {}
local ruSeatColors={"White","Brown","Red","Orange","Yellow","Green","Teal","Blue","Purple","Pink","Black"}
local ruLauncherWatch
local ruPloyTeams={};for key,team in pairs(ruReferenceTeams) do table.insert(ruPloyTeams,{key=key,label=team.label}) end
table.sort(ruPloyTeams,function(a,b) return a.label<b.label end)
local ruReroll={id="command-reroll",title="Командный переброс (Command Re-roll)",english="Command Re-roll",ployType="firefight",text="<b>Когда применять</b>\nПосле броска кубиков атаки или защиты.\n\n<b>Эффект</b>\nПеребросьте один из этих кубиков. Один кубик нельзя перебрасывать больше одного раза.\n\n<b>Стоимость и ограничение</b>\nОбычно 1 CP. Эту уловку можно применять несколько раз за раунд; проверяйте отдельные ограничения и изменения стоимости.",subtitle="Общая боевая уловка · обычно 1 CP"}
local function ruPloySeat(color)
    for _,c in ipairs(ruSeatColors) do if c==color then
        if not RuPloySeats[color] then RuPloySeats[color]={round=1,used={},pinned={},query="",group="strategy"} end
        return RuPloySeats[color]
    end end
end
local function ruPloyAuth(player,id)
    local color=player and player.color
    local seat=color and ruPloySeat(color)
    return seat and seat.open and tostring(id):match("_([A-Za-z]+)$")==color and color or nil
end
local function ruPloyId(ctx,entry) return entry.id=="command-reroll" and entry.id or (ctx.team or "")..":"..entry.id end
local function ruPloyItems(ctx)
    local entries={}
    if ctx.team and ruReferenceTeams[ctx.team] then for _,e in ipairs(ruReferenceTeams[ctx.team].entries) do if e.category=="ploy" then table.insert(entries,e) end end end
    table.insert(entries,ruReroll)
    return entries
end
local function ruPloyButton(id,text,width,x,y,callback)
    local b=ruButton(id,text,width,callback);b.attributes.rectAlignment="UpperLeft";b.attributes.offsetXY=x.." "..(-y);return b
end
function ruPloyLauncher()
    return {tag="Panel",attributes={id="ruPloyLauncher",width="180",height="40",rectAlignment="UpperLeft",offsetXY="18 -18",visibility=table.concat(ruSeatColors,"|")},children={ruPloyButton("ruPloyLaunch","Уловки",180,0,0,"ruOpenPloysUI")}}
end
function ruEnsurePloyLauncher()
    if UI.loading then return end
    if not UI.getAttribute("ruPloyLauncher","id") then
        local nodes=UI.getXmlTable() or {};table.insert(nodes,ruPloyLauncher());UI.setXmlTable(nodes)
    end
    for color,c in pairs(RuPloySeats) do if c.open and not UI.getAttribute("ruPloys_"..color,"id") then ruRenderPloys(color) end end
end
function ruLoadPloys(saved)
    if type(saved)=="string" and saved~="" then
        local ok,v=pcall(JSON.decode,saved)
        if ok and type(v)=="table" and v.ruPloysVersion==1 and type(v.seats)=="table" then
            for _,color in ipairs(ruSeatColors) do local s=v.seats[color];if type(s)=="table" then
                local c=ruPloySeat(color);c.team=ruReferenceTeams[s.team] and s.team or nil;c.round=math.max(1,tonumber(s.round) or 1)
                c.used=type(s.used)=="table" and s.used or {};c.pinned=type(s.pinned)=="table" and s.pinned or {}
            end end
        end
    end
    Wait.condition(function()
        local nodes=UI.getXmlTable() or {};local keep={}
        for _,node in ipairs(nodes) do local id=(node.attributes or {}).id or "";if id~="ruPloyLauncher" and not id:match("^ruPloys_") then table.insert(keep,node) end end
        table.insert(keep,ruPloyLauncher());UI.setXmlTable(keep)
    end,function() return not UI.loading end)
    if ruLauncherWatch then Wait.stop(ruLauncherWatch) end
    ruLauncherWatch=Wait.time(ruEnsurePloyLauncher,2,-1)
end
function onDestroy() if ruLauncherWatch then Wait.stop(ruLauncherWatch) end end
function onSave()
    local seats={};for color,c in pairs(RuPloySeats) do seats[color]={team=c.team,round=c.round,used=c.used,pinned=c.pinned} end
    return JSON.encode({ruPloysVersion=1,seats=seats})
end
function ruOpenPloysUI(player) if player then ruOpenPloys({color=player.color}) end end
function ruOpenPloys(params)
    local color=params and params.color;local ctx=ruPloySeat(color);if not ctx then return end
    if not ctx.team then local ref=RuReferenceCache[color];if ref and ref.currentEdition then ctx.team=ref.team end end
    ctx.open=true;ctx.picker=not ctx.team;ctx.query="";ctx.selected=1;ruRenderPloys(color)
end
function ruRenderPloys(color)
    local ctx=ruPloySeat(color);if not ctx then return end
    if UI.loading then
        if not ctx.pending then ctx.pending=true;Wait.condition(function() ctx.pending=false;ruRenderPloys(color) end,function() return not UI.loading end) end
        return
    end
    local suffix="_"..color;local nodes=UI.getXmlTable() or {};local root={}
    for _,n in ipairs(nodes) do if (n.attributes or {}).id~="ruPloys"..suffix then table.insert(root,n) end end
    if not ctx.open then UI.setXmlTable(root);return end
    local q=ruFold(ctx.query or "");local items={}
    if ctx.picker then
        for _,t in ipairs(ruPloyTeams) do if q=="" or ruFold(t.label):find(q,1,true) then table.insert(items,{id=t.key,title=t.label,text="Нажмите на отряд слева. Выбор сохраняется для вашего места за столом."}) end end
    else
        for _,e in ipairs(ruPloyItems(ctx)) do
            if (ctx.group==e.ployType or ctx.group=="pinned" and ctx.pinned[ruPloyId(ctx,e)]) and (q=="" or ruFold(e.title.." "..e.english.." "..ruPlain(e.text)):find(q,1,true)) then table.insert(items,e) end
        end
    end
    ctx.visible=items;ctx.selected=math.min(math.max(ctx.selected or 1,1),math.max(1,#items));local entry=items[ctx.selected]
    local list={};for i,e in ipairs(items) do
        table.insert(list,ruNavEntry("ruPloyEntry_"..i..suffix,e.title,e.english,i==ctx.selected,ctx.used[ruPloyId(ctx,e)],ctx.pinned[ruPloyId(ctx,e)],"ruPloySelect"))
    end
    local detail=entry and entry.text or (ctx.group=="pinned" and "Закрепите нужную уловку, чтобы держать её условие и эффект под рукой весь раунд." or "Измените запрос или выберите другой раздел.")
    local team=ruReferenceTeams[ctx.team];local teamRu,teamEn=ruSplitTitle(team and team.label or "Выберите отряд")
    local children,popups=ruReaderFrame("ply",color,ctx,ctx.picker and "Выберите свой отряд" or entry and entry.title or "Нет записей",not ctx.picker and entry and entry.english or "",entry and entry.subtitle or "",ctx.picker and "Нажмите на название слева. Выбор сохраняется для вашего места за столом." or detail,"ruPloyDetail"..suffix,ctx.picker and "ВАШЕ МЕСТО ЗА СТОЛОМ" or ctx.group=="strategy" and "СТРАТЕГИЧЕСКАЯ УЛОВКА  /  ГАМБИТ" or ctx.group=="pinned" and "ЗАКРЕПЛЁННЫЕ ПРАВИЛА" or "БОЕВАЯ УЛОВКА  /  ПО УСЛОВИЮ В ТЕКСТЕ",true)
    local side={
        ruUiText(teamRu,20,92,224,58,20,"#f1f5f8",true),
        ruUiText(teamEn,20,153,224,28,12,"#a7b3bc"),
        ruUiButton("ruPloyTeam"..suffix,"Сменить отряд",20,189,224,32,"ruPloyPickTeam"),
        ruUiButton("ruPloyGroup_strategy"..suffix,"Стратегия",20,241,109,34,"ruPloyGroup",not ctx.picker and ctx.group=="strategy" and "selected"),
        ruUiButton("ruPloyGroup_firefight"..suffix,"Боевые",135,241,109,34,"ruPloyGroup",not ctx.picker and ctx.group=="firefight" and "selected"),
        ruUiButton("ruPloyGroup_pinned"..suffix,"★  Напоминания",20,281,224,32,"ruPloyGroup",not ctx.picker and ctx.group=="pinned" and "selected"),
        {tag="InputField",attributes={id="ruPloySearch"..suffix,text=ctx.query,placeholder="Найти правило…",fontSize="14",textColor="#d4dde4",colors="#2a333a|#35434e|#43535f|#2a333a",width="182",height="34",caretColor="#f6a46e",offsetXY="20 -333",rectAlignment="UpperLeft",onEndEdit=self.getGUID().."/ruPloySearch"}},
        ruUiButton("ruPloyReset"..suffix,"×",208,333,36,34,"ruPloyReset"),
        {tag="VerticalScrollView",attributes=ruScrollStyle({id="ruPloyList"..suffix,width="252",height="310",offsetXY="12 -381",rectAlignment="UpperLeft"}),children={{tag="VerticalLayout",attributes={spacing="3",childForceExpandHeight="false",childForceExpandWidth="false"},children=list}}},
        ruUiText(tostring(#items)..(ctx.picker and " отрядов" or " уловки").."   /   Раунд "..ctx.round,20,713,224,20,13,"#a7b3bc"),
        ruUiButton("ruPloyClose"..suffix,"×",978,24,30,30,"ruPloyClose","light"),
        ruUiText("CP и эффекты — вручную. В конце раунда ✓ сбрасываются, ★ остаются.",300,713,708,20,13,"#a7b3bc")
    }
    for _,node in ipairs(side) do table.insert(children,node) end
    if not ctx.picker and entry then
        table.insert(children,ruUiButton("ruPloyUse"..suffix,ctx.used[ruPloyId(ctx,entry)] and entry.id~="command-reroll" and "✓  Применена · отменить" or "Отметить применение",300,668,284,36,"ruPloyUse","primary"))
        table.insert(children,ruUiButton("ruPloyPin"..suffix,ctx.pinned[ruPloyId(ctx,entry)] and "★  Закреплена · убрать" or "☆  Закрепить",596,668,226,36,"ruPloyPin","light"))
        table.insert(children,ruUiButton("ruPloyRound"..suffix,"Сброс отметок",834,668,174,36,"ruPloyResetMarks","light"))
        if entry.id=="command-reroll" and ctx.used[entry.id] then
            children[#children-2].attributes.width="174";children[#children-2].attributes.text="Применить ещё"
            table.insert(children,ruUiButton("ruPloyUndo"..suffix,"− 1",486,668,98,36,"ruPloyUndoReroll","light"))
        end
    end
    for _,popup in ipairs(popups) do table.insert(children,popup) end
    table.insert(root,{tag="Panel",attributes={id="ruPloys"..suffix,width="1040",height="740",rectAlignment="MiddleCenter",visibility=color,allowDragging="true"},children=children});UI.setXmlTable(root)
end
function ruPloySelect(player,value,id)
    if UI.loading then return end
    local color=ruPloyAuth(player,id);if not color then return end;local c=RuPloySeats[color];local index=tonumber(id:match("^ruPloyEntry_(%d+)_"));if not index or not c.visible or not c.visible[index] then return end
    if c.picker then c.team=c.visible[index].id;c.picker=false;c.query="";c.selected=1 else c.selected=index end;ruRenderPloys(color)
end
function ruPloyGroup(player,value,id)
    local color=ruPloyAuth(player,id);if not color then return end;local g=id:match("^ruPloyGroup_([a-z]+)_");if g~="strategy" and g~="firefight" and g~="pinned" then return end
    local c=RuPloySeats[color];c.group=g;c.picker=not c.team;c.query="";c.selected=1;ruRenderPloys(color)
end
function ruPloyPickTeam(player,value,id) local color=ruPloyAuth(player,id);if color then local c=RuPloySeats[color];c.picker=true;c.query="";c.selected=1;ruRenderPloys(color) end end
function ruPloySearch(player,value,id) local color=ruPloyAuth(player,id);if color then local c=RuPloySeats[color];c.query=tostring(value or "");c.selected=1;ruRenderPloys(color) end end
function ruPloyReset(player,value,id) ruPloySearch(player,"",id) end
function ruPloyUse(player,value,id)
    if UI.loading then return end
    local color=ruPloyAuth(player,id);if not color then return end;local c=RuPloySeats[color];local e=(c.visible or {})[c.selected or 1];if c.picker or not e then return end
    local key=ruPloyId(c,e)
    if e.id=="command-reroll" then c.used[key]=(tonumber(c.used[key]) or 0)+1 else c.used[key]=not c.used[key] or nil end
    ruRenderPloys(color)
end
function ruPloyPin(player,value,id)
    if UI.loading then return end
    local color=ruPloyAuth(player,id);if not color then return end;local c=RuPloySeats[color];local e=(c.visible or {})[c.selected or 1];if c.picker or not e then return end
    local key=ruPloyId(c,e);c.pinned[key]=not c.pinned[key] or nil;ruRenderPloys(color)
end
function ruPloyUndoReroll(player,value,id)
    if UI.loading then return end
    local color=ruPloyAuth(player,id);if not color then return end;local c=RuPloySeats[color];local e=(c.visible or {})[c.selected or 1]
    if not c.picker and e and e.id=="command-reroll" then local n=tonumber(c.used[e.id]) or 0;c.used[e.id]=n>1 and n-1 or nil;ruRenderPloys(color) end
end
function ruPloyResetMarks(player,value,id)
    if UI.loading then return end
    local color=ruPloyAuth(player,id);if color then local c=RuPloySeats[color];c.used={};ruRenderPloys(color) end
end
function ruPloysRoundEnd()
    for color,c in pairs(RuPloySeats) do c.round=c.round+1;c.used={};if c.open then ruRenderPloys(color) end end
end
function ruPloyClose(player,value,id) local color=ruPloyAuth(player,id);if color then RuPloySeats[color].open=false;ruRenderPloys(color) end end
