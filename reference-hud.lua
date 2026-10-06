-- Russian references, per-seat state, no changes to attacks/CP/activation state.
--@TEAM_LIBRARY@
--@COMMON_RULES@
--@UNIVERSAL_EQUIPMENT@
--@SHARED_NAMED_RULES@
RuReferenceCache = {}
local ruPendingOperatives,ruAwaitingOperatives={},{}
function ruDeferOperative(params)
    if not UI.loading then return false end
    local color=params[2];ruPendingOperatives[color]=params
    if not ruAwaitingOperatives[color] then
        ruAwaitingOperatives[color]=true
        Wait.condition(function()
            ruAwaitingOperatives[color]=nil
            local latest=ruPendingOperatives[color];ruPendingOperatives[color]=nil
            if latest then onOperativeRandomize(latest) end
        end,function() return not UI.loading end)
    end
    return true
end
local ruSections = {{"model","Модель"},{"weapon","Оружие"},{"team","Отряд"},{"ploy","Уловки"},{"equipment","Снаряжение"},{"faq","FAQ"}}
function ruReplace(s,needle,replacement)
    s=tostring(s or "");local parts,pos={},1
    while true do
        local first,last=s:find(needle,pos,true)
        if not first then table.insert(parts,s:sub(pos));break end
        table.insert(parts,s:sub(pos,first-1));table.insert(parts,replacement);pos=last+1
    end
    return table.concat(parts)
end
local function ruKey(s) local value=tostring(s or ""):lower():gsub("[^a-z0-9]", "");return value end
local function ruFold(s)
    s=tostring(s or ""):lower()
    local upper={"А","Б","В","Г","Д","Е","Ё","Ж","З","И","Й","К","Л","М","Н","О","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Ъ","Ы","Ь","Э","Ю","Я"}
    local lower={"а","б","в","г","д","е","ё","ж","з","и","й","к","л","м","н","о","п","р","с","т","у","ф","х","ц","ч","ш","щ","ъ","ы","ь","э","ю","я"}
    for i,c in ipairs(upper) do
        local parts,pos={},1
        while true do
            local first,last=s:find(c,pos,true)
            if not first then table.insert(parts,s:sub(pos));break end
            table.insert(parts,s:sub(pos,first-1));table.insert(parts,lower[i]);pos=last+1
        end
        s=table.concat(parts)
    end
    return s
end
local function ruPlain(s)
    s=tostring(s or "");local parts,pos={},1
    while pos<=#s do
        local first=s:find("<",pos,true)
        if not first then table.insert(parts,s:sub(pos));break end
        local last=s:find(">",first+1,true)
        if not last then table.insert(parts,s:sub(pos));break end
        table.insert(parts,s:sub(pos,first-1));pos=last+1
    end
    return ruReplace(ruReplace(ruReplace(table.concat(parts),"&lt;","<"),"&gt;",">"),"&amp;","&")
end
local function ruLength(s) local plain=ruPlain(s);if #"Я"==1 then return #plain end;local _,n=plain:gsub("[^\128-\191]", "");return n end
local function ruHeight(s,width,font)
    local lines=0
    for line in ruLines(ruPlain(s)) do lines=lines+math.max(1,math.ceil(ruLength(line)/math.floor(width/(font*.62)))) end
    return math.max(30,lines*(font+7)+12)
end
local function ruEscape(s) return ruReplace(ruReplace(ruReplace(s,"&","&amp;"),"<","&lt;"),">","&gt;") end
local function ruCopy(v)
    if type(v)~="table" then return v end
    local t={};for k,x in pairs(v) do t[k]=ruCopy(x) end;return t
end
local function ruAuthorized(player,id)
    local kind=type(player)
    local color=(kind=="table" or kind=="userdata") and player.color or nil
    local target=tostring(id or ""):match("_([A-Za-z]+)$")
    return color and color==target and RuReferenceCache[color] and color or nil
end
local function ruFindTeam(info)
    if ruReferenceTeams[ruKey(info.ktRuTeam)] then return ruKey(info.ktRuTeam) end
    for _,category in ipairs(info.categories or {}) do
        local k=ruKey(category);if ruReferenceTeams[k] then return k end
        for t,v in pairs(ruReferenceTeams) do if ruKey(v.name:gsub("s$",""))==k then return t end end
    end
end
function ruRememberOperative(color,state,operative)
    local old=RuReferenceCache[color] or {}
    local info=state.info or {}
    local context={team=ruFindTeam(info),currentEdition=info.ktRuTeam~=nil,name=ruDisplayName(info.name or operative.getName()),entries={},rules=info.rules or {},query="",section=old.section or "model",open=old.open or false}
    context.weaponRules="";for _,w in ipairs(info.weapons or {}) do context.weaponRules=context.weaponRules..","..((w.stats or {}).WR or "") end
    for _,kind in ipairs({"abilities","actions"}) do
        for _,a in ipairs(info[kind] or {}) do if type(a.text)=="string" and a.text~="" then
            table.insert(context.entries,{title=ruDisplayName(a.name or "Способность"),english=a.name or "",text=ruEscape(cleanDescriptionText(a.text)),subtitle=kind=="actions" and "Действие модели" or "Способность модели",category="model"})
        end end
    end
    local seen={};for _,e in ipairs(context.entries) do seen[e.title..e.text]=true end
    local function extra(v)
        if type(v)~="table" then return end
        if type(v.text)=="string" and v.text~="" then
            local e={title=ruDisplayName(v.name or "Особое правило"),english=v.name or "",text=ruEscape(cleanDescriptionText(v.text)),subtitle="Особое правило модели",category="model"}
            if not seen[e.title..e.text] then table.insert(context.entries,e);seen[e.title..e.text]=true end
        end
        for _,x in pairs(v) do if type(x)=="table" then extra(x) end end
    end
    extra(info.special);extra(info.psychic)
    RuReferenceCache[color]=context
end
local function ruRuleName(raw)
    local value=tostring(raw or "");local wrappers={['*']=true,["'"]=true,['"']=true}
    while wrappers[value:sub(1,1)] do value=value:sub(2) end
    while wrappers[value:sub(-1)] do value=value:sub(1,-2) end
    if (value:sub(-1)=='x' or value:sub(-1)=='X') and value:sub(-2,-2)==' ' then value=ruTrim(value:sub(1,-2)) end
    return value
end
local ruMatchTrait
local function ruCustomRules(ctx)
    local unique={}
    for name,text in pairs(ctx.rules or {}) do
        local id=ruKey(ruRuleName(name))
        local score=(name:find("*",1,true) and 1 or 0)+(name:match("%s+[xX]$") and 1 or 0)
        if not unique[id] or score<unique[id].score then unique[id]={name=name,text=text,score=score} end
    end
    local team=ctx.currentEdition and ruReferenceTeams[ctx.team]
    if team then for name,text in pairs(team.rules or {}) do unique[ruKey(ruRuleName(name))]={name=name,text=text,score=-1} end end
    if ctx.currentEdition then for name,text in pairs(ruReferenceShared) do
        local id=ruKey(ruRuleName(name));if not unique[id] and ruMatchTrait(ctx.weaponRules,name) then unique[id]={name=name,text=text,score=-2} end
    end end
    local result={};for _,e in pairs(unique) do table.insert(result,e) end
    table.sort(result,function(a,b) return a.name<b.name end);return result
end
ruMatchTrait=function(wr,name)
    name=ruRuleName(name):lower()
    for part in ruDelimited(wr,",") do
        part=ruTrim(part);if part:sub(1,1)=="*" then part=part:sub(2) end
        part=ruReplace(ruReplace(part,"″","\""),"”","\""):lower()
        local candidate=part:gsub("^%d+\"%s+", "")
        if candidate==name or (candidate:sub(1,#name)==name and candidate:sub(#name+1,#name+1):match("[^a-z]")) then
            if not(name=="seek" and part:find("seek light",1,true)) and not(name=="piercing" and part:find("piercing crits",1,true)) then return part end
        end
    end
    return false
end
local function ruRulesForProfile(color,w)
    local ctx=RuReferenceCache[color] or {};local wr=tostring(w.wr or "")
    local selected={}
    for _,entry in ipairs(ruReferenceCommon) do
        local matched=ctx.currentEdition and ruMatchTrait(wr,entry.english)
        if matched then
            local e=ruCopy(entry)
            e.subtitle="WR: "..matched.." · выбранный профиль"
            local parameter=matched:gsub("^%d+\"%s+", ""):sub(#entry.english+1):match("^%s*(%d+%+?\"?)")
            if parameter and e.title:find("x",1,true) then e.title=e.title:gsub("x%+",parameter):gsub("x",parameter);e.text="<b>Значение x для этого профиля: "..parameter..".</b>\n\n"..e.text end
            local radius=matched:match("^(%d+)\"%s+")
            if radius then e.text="<b>Радиус для этого профиля: "..radius.."″.</b>\n\n"..e.text end
            if entry.english=="Heavy" then
                local restriction=matched:match("%((.-)%)")
                if restriction then e.text="<b>Для этого профиля: "..(restriction=="dash only" and "только Рывок (Dash)" or restriction=="reposition only" and "только Перемещение (Reposition)" or restriction)..".</b>\n\n"..e.text end
            end
            table.insert(selected,e)
        end
    end
    for _,saved in ipairs(ruCustomRules(ctx)) do
        local name,text=saved.name,saved.text
        local clean=ruRuleName(name);local generic=false
        for _,entry in ipairs(ruReferenceCommon) do if ruKey(entry.english)==ruKey(clean) then generic=true end end
        if (not ctx.currentEdition or not generic) and clean~="" and ruMatchTrait(wr,clean) then
            table.insert(selected,{title=ruDisplayName(name),english=name,text=ruEscape(cleanDescriptionText(text)),subtitle="Особое правило оружия",category="weapon"})
        end
    end
    table.sort(selected,function(a,b) return a.english<b.english end)
    return selected
end
function ruWeaponTooltip(color,w)
    local entries=ruRulesForProfile(color,w)
    if #entries==0 then
        local ctx=RuReferenceCache[color]
        if ctx and next(ctx.rules)==nil and tostring(w.wr or "")~="" and w.wr~="—" and w.wr~="-" then return "В этой модели нет сохранённой справки по правилам оружия." end
        local raw=ruTrim(tostring(w.wr or ""))
        if raw~="" and raw~="—" and raw~="-" then return "Для правил этого профиля не найдено сохранённое описание: "..raw end
        return "У этого профиля нет дополнительных правил оружия."
    end
    local parts={"Правила выбранного профиля: "..ruDisplayName(w.name),"WR: "..tostring(w.wr or "")}
    for _,e in ipairs(entries) do table.insert(parts,e.title.."\n"..e.subtitle.."\n"..ruPlain(e.text)) end
    return ruWrapTooltip(table.concat(parts,"\n\n"),60,18,"Полный текст — кнопка «?» у оружия.")
end
local function ruEntryList(ctx)
    local items={}
    if ctx.section=="model" then for _,x in ipairs(ctx.entries) do table.insert(items,ruCopy(x)) end
    elseif ctx.section=="weapon" then
        if ctx.profile then items=ctx.profile else
            if ctx.currentEdition then for _,x in ipairs(ruReferenceCommon) do table.insert(items,ruCopy(x)) end end
            for _,saved in ipairs(ruCustomRules(ctx)) do
                local name,text=saved.name,saved.text
                local known=false;for _,x in ipairs(ruReferenceCommon) do if ruKey(x.english)==ruKey(ruRuleName(name)) then known=true end end
                if not ctx.currentEdition or not known then table.insert(items,{title=ruDisplayName(name),english=name,text=ruEscape(cleanDescriptionText(text)),subtitle=ctx.currentEdition and "Особое правило оружия" or "Сохранённое правило модели · редакция сценария",category="weapon"}) end
            end
        end
    else
        local t=ruReferenceTeams[ctx.team]
        if t then for _,x in ipairs(t.entries) do if x.category==ctx.section then table.insert(items,ruCopy(x)) end end end
        if ctx.section=="equipment" then for _,x in ipairs(ruReferenceEquipment) do table.insert(items,ruCopy(x)) end end
    end
    local filtered={};local q=ruTrim(ruFold(ctx.query))
    for _,e in ipairs(items) do if q=="" or ruFold(e.title.." "..(e.english or "").." "..ruPlain(e.text)):find(q,1,true) then table.insert(filtered,e) end end
    return filtered
end
local function ruButton(id,text,width,callback)
    return {tag="Button",attributes={id=id,text=text,fontSize="16",fontStyle="Bold",textColor="#ffffff",colors="#303639|#465157|#d34b0b|#555555",width=tostring(width),preferredWidth=tostring(width),minWidth=tostring(width),height="32",preferredHeight="32",onClick=self.getGUID().."/"..callback,textAlignment="MiddleCenter",horizontalOverflow="Wrap"}}
end
function ruBuildReferenceLauncher(suffix,width)
    return {tag="HorizontalLayout",attributes={id="ruLauncher"..suffix,width=tostring(width),height="32",rectAlignment="UpperLeft",offsetXY="0 36",spacing="3",childForceExpandWidth="false",childForceExpandHeight="false"},children={
        ruButton("ruOpen_model"..suffix,"Способности",180,"ruOpenReference"),
        ruButton("ruOpen_weapon"..suffix,"Трейты оружия",200,"ruOpenReference"),
        ruButton("ruOpen_team"..suffix,"Справочник отряда",214,"ruOpenReference")}}
end
function ruBuildWeaponReferenceButton(suffix,index,width,height,y)
    local b=ruButton("ruWeapon_"..index..suffix,"?",28,"ruOpenWeaponReference")
    b.attributes.height=tostring(height-4);b.attributes.rectAlignment="UpperLeft";b.attributes.offsetXY=tostring(width-30).." "..tostring(y-2)
    b.attributes.colors="#d34b0b|#e3652d|#bb4108|#555555";b.attributes.tooltip="Открыть правила этого профиля";b.attributes.tooltipFontSize="17"
    return b
end
function ruRenderReference(color)
    local ctx=RuReferenceCache[color];if not ctx then return end
    if UI.loading then
        if not ctx.pending then
            ctx.pending=true
            Wait.condition(function() ctx.pending=false;if RuReferenceCache[color]==ctx then ruRenderReference(color) end end,function() return not UI.loading end)
        end
        return
    end
    local suffix="_"..color;local root=UI.getXmlTable() or {};local filtered={}
    for _,node in ipairs(root) do if not(node.attributes and node.attributes.id=="ruReference"..suffix) then table.insert(filtered,node) end end
    if not ctx.open then UI.setXmlTable(filtered);return end
    ctx.visible=ruEntryList(ctx)
    ctx.selected=math.min(math.max(ctx.selected or 1,1),math.max(#ctx.visible,1))
    local selected=ctx.visible[ctx.selected]
    local title=selected and selected.title or "Здесь пока нет записей"
    local detail=selected and selected.text or (ctx.query~="" and "По этому запросу ничего не найдено. Измените поиск или нажмите «Сброс»." or "Для этой модели нет записей в выбранном разделе. Выберите другой раздел.")
    local buttons={};for i,e in ipairs(ctx.visible) do table.insert(buttons,ruNavEntry("ruEntry_"..i..suffix,e.title,e.english,i==ctx.selected,false,false,"ruChooseReference")) end
    local team=ruReferenceTeams[ctx.team];local nameRu,nameEn=ruSplitTitle(ctx.name)
    local children,popups=ruReaderFrame("ref",color,ctx,title,selected and selected.english or "",selected and selected.subtitle or "",detail,"ruDetail"..suffix,"СПРАВОЧНИК  /  "..(team and ruSplitTitle(team.label) or "ОБЩИЕ ПРАВИЛА"),false)
    local side={
        ruUiText(nameRu,20,92,224,58,20,"#f1f5f8",true,"ruRefName"..suffix),
        ruUiText(nameEn,20,153,224,40,12,"#a7b3bc"),
        {tag="InputField",attributes={id="ruSearch"..suffix,text=ctx.query,placeholder="Найти правило…",fontSize="14",textColor="#d4dde4",colors="#2a333a|#35434e|#43535f|#2a333a",width="182",height="34",caretColor="#f6a46e",offsetXY="20 -333",rectAlignment="UpperLeft",onEndEdit=self.getGUID().."/ruSearchReference"}},
        ruUiButton("ruReset"..suffix,"×",208,333,36,34,"ruResetReference"),
        {tag="VerticalScrollView",attributes=ruScrollStyle({id="ruList"..suffix,width="252",height="310",offsetXY="12 -381",rectAlignment="UpperLeft"}),children={{tag="VerticalLayout",attributes={spacing="3",childForceExpandHeight="false",childForceExpandWidth="false"},children=buttons}}},
        ruUiText(tostring(#ctx.visible).." записей",20,713,224,20,13,"#a7b3bc",false,"ruCount"..suffix),
        ruUiButton("ruClose"..suffix,"×",978,24,30,30,"ruCloseReference","light")
    }
    for _,node in ipairs(side) do table.insert(children,node) end
    for i,section in ipairs(ruSections) do
        local x=i%2==1 and 20 or 135;local y=207+math.floor((i-1)/2)*36
        table.insert(children,ruUiButton("ruTab_"..section[1]..suffix,section[2],x,y,109,30,"ruChangeSection",ctx.section==section[1] and "selected"))
    end
    for _,popup in ipairs(popups) do table.insert(children,popup) end
    table.insert(filtered,{tag="Panel",attributes={id="ruReference"..suffix,width="1040",height="740",rectAlignment="MiddleCenter",visibility=color,allowDragging="true"},children=children})
    UI.setXmlTable(filtered)
end
function ruOpenReference(player,value,id)
    local color=ruAuthorized(player,id);if not color then return end
    local ctx=RuReferenceCache[color];ctx.section=id:match("^ruOpen_([a-z]+)_") or "team";ctx.profile=nil;ctx.query="";ctx.selected=1;ctx.open=true;ruRenderReference(color)
end
function ruOpenWeaponReference(player,value,id)
    local color=ruAuthorized(player,id);if not color then return end
    local index=tonumber(id:match("^ruWeapon_(%d+)_") or id:match("^weaponWRText_(%d+)_"));local w=(WeaponCache[color] or {}).weapons
    if not index or not w or not w[index] then return end
    local ctx=RuReferenceCache[color];ctx.section="weapon";ctx.profile=ruRulesForProfile(color,w[index]);ctx.query="";ctx.selected=1;ctx.open=true;ruRenderReference(color)
end
function ruChangeSection(player,value,id)
    local color=ruAuthorized(player,id);if not color then return end
    local ctx=RuReferenceCache[color];ctx.section=id:match("^ruTab_([a-z]+)_") or "team";ctx.profile=nil;ctx.query="";ctx.selected=1;ruRenderReference(color)
end
function ruChooseReference(player,value,id)
    if UI.loading then return end
    local color=ruAuthorized(player,id);if not color then return end
    RuReferenceCache[color].selected=tonumber(id:match("^ruEntry_(%d+)_")) or 1;ruRenderReference(color)
end
function ruSearchReference(player,value,id)
    local color=ruAuthorized(player,id);if not color then return end
    RuReferenceCache[color].query=tostring(value or "");RuReferenceCache[color].selected=1;ruRenderReference(color)
end
function ruResetReference(player,value,id)
    local color=ruAuthorized(player,id);if not color then return end
    RuReferenceCache[color].query="";RuReferenceCache[color].selected=1;ruRenderReference(color)
end
function ruCloseReference(player,value,id)
    local color=ruAuthorized(player,id);if not color then return end
    RuReferenceCache[color].open=false;ruRenderReference(color)
end
