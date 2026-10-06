-- Real inline Buttons; Text/HTML links cannot send click events in TTS.
--@CORE_GLOSSARY@
--@FONT_METRICS@
RuTermDocuments={}
local ruTermRevision=0
local ruFoldedAliases={}
local ruUnicodeStrings=(#"Я"==1)
local function ruChar(s,i)
    if ruUnicodeStrings then return s:sub(i,i),i+1 end
    local n=s:byte(i);if not n then return "",i end
    local length=n<128 and 1 or n<224 and 2 or n<240 and 3 or 4
    return s:sub(i,i+length-1),i+length
end
local function ruPrevious(s,i)
    if ruUnicodeStrings then return i>1 and s:sub(i-1,i-1) or "" end
    local p=i-1;while p>0 and s:byte(p)>=128 and s:byte(p)<192 do p=p-1 end;return p>0 and ruChar(s,p) or ""
end
local function ruWord(c)
    return c~="" and (c:match("^[a-z0-9_]$")~=nil or ("абвгдеёжзийклмнопрстуфхцчшщъыьэюя"):find(c,1,true)~=nil)
end
local function ruSpace(c) return c==" " or c=="\t" or c=="\r" or c=="\n" or c=="\f" or c=="\v" or c==" " end
function ruTrim(s)
    local a,b=1,#s
    while a<=b do local c,nextPos=ruChar(s,a);if not ruSpace(c) then break end;a=nextPos end
    while b>=a do local c=ruPrevious(s,b+1);if not ruSpace(c) then break end;b=b-#c end
    return s:sub(a,b)
end
function ruDelimited(s,delimiter)
    s=tostring(s or "");local pos=1
    return function()
        if pos>#s+1 then return nil end
        local finish=s:find(delimiter,pos,true)
        if finish then local line=s:sub(pos,finish-1);pos=finish+#delimiter;return line end
        local line=s:sub(pos);pos=#s+2;return line
    end
end
function ruLines(s) return ruDelimited(s,"\n") end
function ruCleanRuleText(raw)
    local s=ruReplace(raw,"**","");local parts,pos={},1
    local function digit(c) return c~="" and ("0123456789"):find(c,1,true)~=nil end
    local function inches(number)
        local last,lastTwo=number%10,number%100;local word="дюймов"
        if not (lastTwo>=11 and lastTwo<=14) then if last==1 then word="дюйм" elseif last>=2 and last<=4 then word="дюйма" end end
        return tostring(number).." "..word
    end
    while true do
        local marker=s:find("&&",pos,true)
        if not marker then table.insert(parts,s:sub(pos));break end
        local unit=s:sub(marker-1,marker-1)
        if marker>pos and (unit=="1" or unit=="2" or unit=="3" or unit=="6") then
            local first=marker-1;local value=tonumber(unit);local before=first
            while before>pos do local c=ruPrevious(s,before);if not ruSpace(c) then break end;before=before-#c end
            if before<first then
                local countStart=before
                while countStart>pos and digit(s:sub(countStart-1,countStart-1)) do countStart=countStart-1 end
                if countStart<before then value=tonumber(s:sub(countStart,before-1))*value;first=countStart end
            end
            table.insert(parts,s:sub(pos,first-1));table.insert(parts,inches(value))
        else table.insert(parts,s:sub(pos,marker+1)) end
        pos=marker+2
    end
    return table.concat(parts)
end
local function ruWithoutParentheses(s)
    local parts,pos={},1
    while pos<=#s do
        local first=s:find("(",pos,true);local last=first and s:find(")",first+1,true)
        if not last then table.insert(parts,s:sub(pos));break end
        local prefix=s:sub(pos,first-1)
        while #prefix>0 do local c=ruPrevious(prefix,#prefix+1);if not ruSpace(c) then break end;prefix=prefix:sub(1,#prefix-#c) end
        table.insert(parts,prefix);pos=last+1
    end
    return table.concat(parts)
end
local function ruTokens(s)
    local pos=1
    return function()
        if pos>#s then return nil end
        local first=pos
        while pos<=#s do local c,nextPos=ruChar(s,pos);if not ruSpace(c) then break end;pos=nextPos end
        while pos<=#s do local c,nextPos=ruChar(s,pos);if ruSpace(c) then break end;pos=nextPos end
        while pos<=#s do local c,nextPos=ruChar(s,pos);if not ruSpace(c) then break end;pos=nextPos end
        return s:sub(first,pos-1)
    end
end
local function ruIsHeading(raw)
    local s=ruTrim(raw);return s:sub(1,3)=="<b>" and s:sub(-4)=="</b>"
end
local function ruPunctuation(raw)
    local parts,pos,previous={},1,"";local closing={[","]=true,["."]=true,[";"]=true,[":"]=true,["!"]=true,["?"]=true,[")"]=true,["»"]=true}
    while pos<=#raw do
        local c,nextPos=ruChar(raw,pos)
        if ruSpace(c) then
            local first=pos;pos=nextPos
            while pos<=#raw do local space,after=ruChar(raw,pos);if not ruSpace(space) then break end;pos=after end
            local following=ruChar(raw,pos)
            if not closing[following] and previous~="(" and previous~="«" then table.insert(parts,raw:sub(first,pos-1)) end
        else table.insert(parts,c);previous=c;pos=nextPos end
    end
    return table.concat(parts)
end
local function ruWidth(s,font,bold)
    local metrics=ruFontMetrics[bold and "bold" or "normal"];local total,i=0,1
    while i<=#s do local c,j=ruChar(s,i);total=total+(metrics[c] or 11);i=j end
    return total*font/18*1.01
end
function ruWrapTooltip(text,columns,maxLines,tail)
    local lines={}
    for source in ruLines(text) do
        local current=""
        for token in ruTokens(source) do
            local word=ruTrim(token)
            if word~="" then
                if current~="" and ruLength(current.." "..word)>columns then table.insert(lines,current);current="" end
                while ruLength(word)>columns do
                    local pos,count=1,0
                    while count<columns and pos<=#word do local _,nextPos=ruChar(word,pos);pos=nextPos;count=count+1 end
                    table.insert(lines,word:sub(1,pos-1));word=word:sub(pos)
                end
                current=current=="" and word or current.." "..word
            end
        end
        table.insert(lines,current)
    end
    if #lines>maxLines then
        while #lines>maxLines do table.remove(lines) end
        if tail then table.insert(lines,tail) end
    end
    return table.concat(lines,"\n")
end
local function ruAliases(title,english)
    local result={};for _,s in ipairs({title or "",english or ""}) do
        s=ruTrim(ruWithoutParentheses(ruPlain(s)))
        local parameter=(s:sub(-2)=="x+" or s:sub(-2)=="X+") and 2 or (s:sub(-1)=="x" or s:sub(-1)=="X") and 1 or 0
        if parameter>0 and ruSpace(ruPrevious(s,#s-parameter+1)) then s=ruTrim(s:sub(1,#s-parameter)) end
        while s:sub(1,1)=="*" or s:sub(1,1)=="'" do s=s:sub(2) end
        if ruLength(s)>2 then table.insert(result,s) end
    end;return result
end
local function ruGlossary(ctx)
    if ctx.readerGlossary and ctx.readerGlossaryTeam==ctx.team and ctx.readerGlossaryEdition==ctx.currentEdition then return ctx.readerGlossary end
    local result={};for _,e in ipairs(ruCoreGlossary) do table.insert(result,e) end
    if ctx.currentEdition~=false then for _,e in ipairs(ruReferenceCommon) do
        local aliases=ruAliases(e.title,e.english)
        if e.english=="Devastating" then table.insert(aliases,"Разрушительное");table.insert(aliases,"Разрушительный") end
        table.insert(result,{id="weapon-"..e.english,title=e.title,aliases=aliases,text=e.text,subtitle=e.title:find("x",1,true) and "Правило оружия · x берите из выбранного профиля" or "Правило оружия"})
    end end
    local team=ruReferenceTeams[ctx.team]
    local teamDefinitions={}
    if team then for _,e in ipairs(team.entries) do if e.category=="team" then
        local key=ruFold(e.english or e.title);local group=teamDefinitions[key]
        if not group then
            group={id="team-"..key,title=e.title,aliases=ruAliases(e.title,e.english),text=e.text,subtitle=e.subtitle,variants={e.text}};teamDefinitions[key]=group;table.insert(result,group)
        else
            local duplicate=false;for _,text in ipairs(group.variants) do if text==e.text then duplicate=true end end
            if not duplicate then table.insert(group.variants,e.text);group.text=table.concat(group.variants,"\n\n<b>Продолжение правила</b>\n") end
            for _,alias in ipairs(ruAliases(e.title,e.english)) do local exists=false;for _,old in ipairs(group.aliases) do if alias==old then exists=true end end;if not exists then table.insert(group.aliases,alias) end end
        end
    end end end
    local named={};for name,text in pairs(ctx.rules or {}) do named[name]=text end
    if ctx.currentEdition~=false and team then for name,text in pairs(team.rules or {}) do named[name]=text end end
    for name,text in pairs(named) do
        local generic=false;for _,e in ipairs(ruReferenceCommon) do if ruKey(e.english)==ruKey(ruRuleName(name)) then generic=true end end
        if ctx.currentEdition==false or not generic then table.insert(result,{id="saved-"..name,title=ruDisplayName(name),aliases=ruAliases(ruDisplayName(name),name),text=ruEscape(cleanDescriptionText(text)),subtitle=ctx.currentEdition==false and "Сохранённое правило модели · редакция сценария" or "Особое правило оружия отряда"}) end
    end
    local abilities={}
    for _,e in ipairs(ctx.entries or {}) do
        local key=e.english or e.title;local group=abilities[key]
        if not group then group={id="model-"..key,title=e.title,aliases=ruAliases(e.title,e.english),text=e.text,subtitle=e.subtitle,variants={e.text}};abilities[key]=group;table.insert(result,group)
        else
            local duplicate=false;for _,text in ipairs(group.variants) do if text==e.text then duplicate=true end end
            if not duplicate then table.insert(group.variants,e.text);group.text=table.concat(group.variants,"\n\n<b>Дополнительная часть правила</b>\n") end
        end
    end
    ctx.readerGlossary=result;ctx.readerGlossaryTeam=ctx.team;ctx.readerGlossaryEdition=ctx.currentEdition;return result
end
local function ruMatches(text,glossary)
    local folded=ruFold(text);local matches={}
    for priority,e in ipairs(glossary or {}) do for _,alias in ipairs(e.aliases) do
        if not ruFoldedAliases[alias] then ruFoldedAliases[alias]=ruFold(alias) end
        alias=ruFoldedAliases[alias];local start=1
        while start<=#folded do local a,b=folded:find(alias,start,true);if not a then break end
            local prev=ruPrevious(folded,a);local after=ruChar(folded,b+1)
            if (not ruWord(prev) or prev:match("^%d$") and alias:match("^[a-z]+$")) and not ruWord(after) then table.insert(matches,{a=a,b=b,entry=e,priority=priority}) end
            start=b+1
        end
    end end
    table.sort(matches,function(a,b) if a.a~=b.a then return a.a<b.a end;if a.b~=b.b then return a.b>b.b end;return a.priority>b.priority end)
    local segments,pos={},1
    for _,m in ipairs(matches) do if m.a>=pos then
        if m.a>pos then table.insert(segments,{text=text:sub(pos,m.a-1)}) end
        table.insert(segments,{text=text:sub(m.a,m.b),entry=m.entry});pos=m.b+1
    end end
    if pos<=#text then table.insert(segments,{text=text:sub(pos)}) end;return segments
end
local function ruInlineNodes(raw,width,font,baseBold,color,glossary,registry)
    local plain=ruPlain(raw);local segments=ruMatches(plain,glossary);local nodes={};local x,y=0,0;local lineHeight=font+8
    if plain=="" then return nodes,0,plain end
    local function paint(text,entry,bold)
        if text=="" then return end
        local w=ruWidth(text,font,bold)
        if x>0 and x+w>width then x=0;y=y+lineHeight end
        if w>width then
            local part="";local i=1
            while i<=#text do local c,j=ruChar(text,i);if part~="" and ruWidth(part..c,font,bold)>width then paint(part,entry,bold);part="" end;part=part..c;i=j end
            if part~="" then paint(part,entry,bold) end;return
        end
        local a={text=text,fontSize=tostring(font),fontStyle=bold and "Bold" or "Normal",width=tostring(w+1),height=tostring(lineHeight),rectAlignment="UpperLeft",offsetXY=tostring(x).." "..tostring(-y),horizontalOverflow="Overflow",verticalOverflow="Truncate"}
        if entry and registry then
            local number=registry.byId[entry.id]
            if not number then number=#registry.entries+1;registry.byId[entry.id]=number;registry.entries[number]=entry end
            registry.serial=(registry.serial or 0)+1
            a.id="ruTerm_"..registry.owner.."_"..registry.revision.."_"..number.."_"..registry.serial.."_"..registry.color
            a.onClick=self.getGUID().."/ruOpenTerm";a.colors="#FFFFFF00|#354655|#445969|#FFFFFF00";a.textColor="#f2f5f7";a.textAlignment="MiddleLeft";a.padding="0 0 0 0"
            a.tooltip=ruWrapTooltip("Нажмите: "..entry.title,52,4);a.tooltipFontSize="16";a.tooltipBackgroundColor="#191b1c";a.tooltipTextColor="#ffffff"
            table.insert(nodes,{tag="Button",attributes=a})
        else
            a.color=color or "#d4dde4";a.alignment="MiddleLeft"
            local previous=nodes[#nodes]
            if previous and previous.tag=="Text" and previous.attributes.fontStyle==a.fontStyle and previous.attributes.color==a.color and previous.attributes.offsetXY:match(" (-?%d+)$")==tostring(-y) then
                previous.attributes.text=previous.attributes.text..text;previous.attributes.width=tostring(tonumber(previous.attributes.width)+w)
            else table.insert(nodes,{tag="Text",attributes=a}) end
        end
        x=x+w
    end
    for _,s in ipairs(segments) do
        if s.entry then
            -- Keep short multi-word terms together. Longer terms wrap as independently clickable words.
            if ruWidth(s.text,font,true)<=width then paint(s.text,s.entry,true) else for token in ruTokens(s.text) do paint(token,s.entry,true) end end
        elseif not s.text:match("%S") then paint(s.text,nil,baseBold)
        else for token in ruTokens(s.text) do local number=ruTrim(token);paint(token,nil,baseBold or (#number<=20 and number:match("^%d+[+/]?%d*$")~=nil)) end end
    end
    return nodes,y+lineHeight,plain
end
local function ruFlowParagraphs(text,width,glossary,registry)
    local children,y={},0;local narrative=false
    for raw in ruLines(text) do
        raw=ruPunctuation(raw)
        if raw=="" then y=y+12 else
            local heading=ruIsHeading(raw)
            if ruPlain(raw)=="Описание" then narrative=true end
            local lines,h=ruInlineNodes(raw,width,narrative and 16 or 18,heading,narrative and "#a7b3bc" or heading and "#f6a46e" or "#d4dde4",heading and {} or glossary,heading and nil or registry)
            table.insert(children,{tag="Panel",attributes={width=tostring(width),height=tostring(h),rectAlignment="UpperLeft",offsetXY="0 "..(-y)},children=lines});y=y+h+(heading and 6 or 0)
        end
    end
    return children,y
end
function ruScrollStyle(attributes)
    attributes.horizontal="false";attributes.vertical="true"
    attributes.horizontalScrollbarVisibility="AutoHide";attributes.verticalScrollbarVisibility="Permanent"
    attributes.verticalScrollbarWidth="14";attributes.horizontalScrollbarHeight="0"
    attributes.color="#00000000";attributes.noScrollbars="false";attributes.scrollbarBackgroundColor="#303b43";attributes.scrollbarColors="#e58b50|#f6a46e|#bc6535|#657988";attributes.scrollSensitivity="28";attributes.movementType="Clamped";return attributes
end
local function ruTermDialog(entry,index,owner,color,glossary,revision)
    local width=660;local bodyWidth=600;local _,h=ruFlowParagraphs(entry.text,bodyWidth,glossary,nil)
    local lines={};for raw in ruLines(entry.text) do
        local plain=ruPlain(raw);if ruIsHeading(raw) then table.insert(lines,"<b>"..ruEscape(plain).."</b>") else
            local parts={};for _,s in ipairs(ruMatches(plain,glossary)) do table.insert(parts,s.entry and "<b>"..ruEscape(s.text).."</b>" or ruEscape(s.text)) end;table.insert(lines,table.concat(parts))
        end
    end
    local content={{tag="Text",attributes={text=table.concat(lines,"\n"),fontSize="18",width=tostring(bodyWidth),height=tostring(h+20),alignment="UpperLeft",color="#d4dde4",horizontalOverflow="Wrap",verticalOverflow="Overflow"}}}
    local heading,headingHeight=ruInlineNodes(entry.title,width-40,22,true,"#ffffff",{},nil)
    local dialogHeight=math.min(560,math.max(240,headingHeight+h+166));local scrollY=headingHeight+76;local scrollHeight=dialogHeight-scrollY-76
    local close=ruUiButton("ruTermClose_"..owner.."_"..revision.."_"..index.."_"..color,"← Вернуться к правилу",18,dialogHeight-54,250,34,"ruCloseTerm","light")
    return {tag="Panel",attributes={id="ruTermPopup_"..owner.."_"..revision.."_"..index.."_"..color,active="false",width="1040",height="740",rectAlignment="MiddleCenter",visibility=color},children={
        {tag="Image",attributes={color="#00000099",raycastTarget="true"}},
        {tag="Panel",attributes={width=tostring(width),height=tostring(dialogHeight),rectAlignment="MiddleCenter"},children={
            {tag="Image",attributes={color="#22292e",raycastTarget="true"}},
            {tag="Image",attributes={color="#ed874a",height="3",rectAlignment="UpperLeft"}},
            {tag="Panel",attributes={width=tostring(width-40),height=tostring(headingHeight),offsetXY="18 -16",rectAlignment="UpperLeft"},children=heading},
            {tag="Text",attributes={text=entry.subtitle or "Определение и правило",fontSize="13",color="#a7b3bc",width=tostring(width-40),height="38",rectAlignment="UpperLeft",offsetXY="18 "..(-(headingHeight+34)),horizontalOverflow="Wrap",alignment="UpperLeft"}},
            {tag="VerticalScrollView",attributes=ruScrollStyle({width=tostring(width-24),height=tostring(scrollHeight),offsetXY="12 "..(-scrollY),rectAlignment="UpperLeft"}),children={{tag="Panel",attributes={width="612",height=tostring(h+20),rectAlignment="UpperLeft"},children={{tag="Panel",attributes={width=tostring(bodyWidth),height=tostring(h),rectAlignment="UpperLeft",offsetXY="8 -8"},children=content}}}}},
            close
        }}
    }}
end
function ruArticle(owner,color,ctx,title,subtitle,text,contentId,articleWidth,english,bodyOnly)
    ruTermRevision=ruTermRevision+1
    local registry={owner=owner,color=color,entries={},byId={},ctx=ctx,revision=ruTermRevision};RuTermDocuments[owner.."_"..color]=registry
    local width=articleWidth or 648;local glossary=ruGlossary(ctx)
    local russian,original=ruSplitTitle(title);english=english or original;if english==russian then english="" end
    local titleNodes,titleHeight=ruInlineNodes(russian,width,26,true,"#202b30",{},nil)
    local englishNodes,englishHeight=ruInlineNodes(english,width,15,false,"#637076",{},nil)
    subtitle=subtitle or "";local separator=subtitle:find("·",1,true);if separator then subtitle=ruTrim(subtitle:sub(separator+#"·")) end
    local subtitleNodes,subtitleHeight=ruInlineNodes(subtitle,width,12,false,"#637076",{},nil)
    local body,bodyHeight=ruFlowParagraphs(text,width,glossary,registry);local start=bodyOnly and 10 or titleHeight+englishHeight+subtitleHeight+36
    local children={
        {tag="Panel",attributes={id=contentId.."Title",width=tostring(width),height=tostring(titleHeight),rectAlignment="UpperLeft",offsetXY="10 -10"},children=titleNodes},
        {tag="Panel",attributes={width=tostring(width),height=tostring(englishHeight),rectAlignment="UpperLeft",offsetXY="10 "..(-(titleHeight+14))},children=englishNodes},
        {tag="Panel",attributes={width=tostring(width),height=tostring(subtitleHeight),rectAlignment="UpperLeft",offsetXY="10 "..(-(titleHeight+englishHeight+24))},children=subtitleNodes},
        {tag="Panel",attributes={id=contentId,width=tostring(width),height=tostring(bodyHeight),rectAlignment="UpperLeft",offsetXY="10 "..(-start)},children=body},
        {tag="Text",attributes={text="Конец правила",fontSize="12",color="#a7b3bc",width=tostring(width),height="25",rectAlignment="UpperLeft",offsetXY="10 "..(-(start+bodyHeight+16)),alignment="MiddleCenter"}}
    }
    if bodyOnly then table.remove(children,1);table.remove(children,1);table.remove(children,1) end
    local popups={};for i,e in ipairs(registry.entries) do table.insert(popups,ruTermDialog(e,i,owner,color,glossary,registry.revision)) end
    return {tag="Panel",attributes={id=contentId.."Content",width=tostring(width+24),height=tostring(start+bodyHeight+54),rectAlignment="UpperLeft"},children=children},popups
end
function ruNavEntry(id,title,english,selected,used,pinned,callback)
    local ru,original=ruSplitTitle(title);english=english or original;if english==ru then english="" end
    local titleNodes,titleHeight=ruInlineNodes(ru,204,16,true,"#edf2f5",{},nil)
    local englishWidth=(used or pinned) and 168 or 204
    local englishNodes,englishHeight=ruInlineNodes(english or "",englishWidth,12,false,"#a7b3bc",{},nil);local h=math.max(62,titleHeight+englishHeight+22)
    local b=ruButton(id,"",228,callback);b.attributes.height=tostring(h);b.attributes.preferredHeight=tostring(h);b.attributes.minHeight=tostring(h);b.attributes.colors=selected and "#303d46|#304554|#43535f|#303d46" or "#101316|#1c2a34|#303d46|#101316";b.attributes.padding="0 0 0 0"
    b.children={
        {tag="Image",attributes={color=selected and "#ed874a" or "#101316",width="3",height="100%",rectAlignment="UpperLeft",raycastTarget="false"}},
        {tag="Panel",attributes={width="204",height=tostring(titleHeight),rectAlignment="UpperLeft",offsetXY="14 -8",raycastTarget="false"},children=titleNodes},
        {tag="Panel",attributes={width=tostring(englishWidth),height=tostring(englishHeight),rectAlignment="UpperLeft",offsetXY="14 "..(-(titleHeight+12)),raycastTarget="false"},children=englishNodes}
    }
    if used then table.insert(b.children,ruUiText("✓",194,h-25,14,20,14,"#96c7a5",true)) end
    if pinned then table.insert(b.children,ruUiText("★",212,h-25,14,20,13,"#f6a46e",true)) end
    return b
end
function ruUiText(text,x,y,width,height,size,color,bold,id)
    return {tag="Text",attributes={id=id,text=text,fontSize=tostring(size),fontStyle=bold and "Bold" or "Normal",color=color or "#202b30",alignment="UpperLeft",width=tostring(width),height=tostring(height),offsetXY=tostring(x).." "..tostring(-y),rectAlignment="UpperLeft",horizontalOverflow="Wrap",raycastTarget="false"}}
end
function ruUiButton(id,text,x,y,width,height,callback,style)
    local b=ruButton(id,text,width,callback);local a=b.attributes
    a.height=tostring(height);a.rectAlignment="UpperLeft";a.offsetXY=tostring(x).." "..tostring(-y);a.fontSize="14"
    a.colors=style=="primary" and "#e58045|#f4965a|#bc5f2f|#777777" or style=="selected" and "#493323|#59412e|#69503a|#493323" or "#2a333a|#35434e|#43535f|#2a333a"
    a.textColor=style=="primary" and "#141b21" or style=="selected" and "#f6a46e" or "#e6edf2"
    return b
end
function ruSplitTitle(title)
    title=tostring(title or "");local last,depth=nil,0
    if title:sub(-1)~=")" then return title,"" end
    for i=1,#title do
        local c=title:sub(i,i)
        if c=="(" then if depth==0 then last=i end;depth=depth+1
        elseif c==")" then depth=depth-1;if depth<0 then return title,"" end end
    end
    if not last or depth~=0 then return title,"" end
    local russian=ruTrim(title:sub(1,last-1));local pos,hasRussian=1,false
    while pos<=#russian do
        local c,nextPos=ruChar(russian,pos)
        if ("абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"):find(c,1,true) then hasRussian=true;break end
        pos=nextPos
    end
    if not hasRussian then return title,"" end
    return russian,title:sub(last+1,-2)
end
-- Compact abilities/actions below the operative's R datasheet.
-- Every header and scroll viewport has explicit bounds; long names grow the row.
local function ruCompactTitleParts(raw)
    local display=ruDisplayName(raw)
    if display==raw then return display,"" end
    return ruSplitTitle(display)
end
function ruSetCompactRuleTitle(prefix,suffix,raw,color)
    local russian,english=ruCompactTitleParts(raw)
    safeSetAttribute(prefix.."NameText"..suffix,"text",russian,color)
    safeSetAttribute(prefix.."EnglishText"..suffix,"text",english,color)
end
local function ruCompactTextHeight(text,width,font,bold)
    if text=="" then return 0 end
    local height=0
    for line in ruLines(text) do local _,h=ruInlineNodes(line,width,font,bold,"#000000",{},nil);height=height+h end
    return height
end
local function ruCompactEntry(prefix,suffix)
    local index,color=suffix:match("^_(%d+)_([A-Za-z]+)$")
    local cache=color and AbilityActionCache[color]
    return cache and (prefix=="ability" and cache.abilities or cache.actions)[tonumber(index)] or {}
end
function ruBuildCompactRulePanel(prefix,suffix,width,bg,orange,baseHeight)
    local entry=ruCompactEntry(prefix,suffix)
    local russian,english=ruCompactTitleParts(entry.name or (prefix=="ability" and "Способность" or "Действие"));local isAction=prefix=="action"
    local titleWidth=width-24-(isAction and 62 or 0)
    local titleHeight=math.max(25,ruCompactTextHeight(russian,titleWidth-8,17,true))
    local englishHeight=ruCompactTextHeight(english,width-32,13,false)
    local englishY=10+titleHeight+4;local bodyY=englishY+englishHeight+12
    local scrollHeight=108;local panelHeight=math.max(baseHeight*3,bodyY+scrollHeight+10)
    local bodyWidth=width-44
    local bodyText=entry.description or ""
    local contentHeight=math.max(scrollHeight,ruCompactTextHeight(bodyText,bodyWidth-8,15,false)+12)
    local headerColor=isAction and "#ffffff" or "#171b1e"
    local children={
        {tag="Image",attributes={color=bg,width=tostring(width),height=tostring(panelHeight),rectAlignment="UpperLeft",raycastTarget="false"}},
        {tag="Text",attributes={id=prefix.."NameText"..suffix,text=russian,fontSize="17",fontStyle="Bold",color=headerColor,width=tostring(titleWidth),height=tostring(titleHeight),rectAlignment="UpperLeft",offsetXY="10 -10",alignment="UpperLeft",horizontalOverflow="Wrap",verticalOverflow="Truncate"}},
        {tag="Text",attributes={id=prefix.."EnglishText"..suffix,text=english,fontSize="13",fontStyle="Normal",color=isAction and "#fff0dc" or "#4c535a",width=tostring(width-24),height=tostring(englishHeight),rectAlignment="UpperLeft",offsetXY="10 "..tostring(-englishY),alignment="UpperLeft",horizontalOverflow="Wrap",verticalOverflow="Truncate"}},
        {tag="VerticalScrollView",attributes=ruScrollStyle({id=prefix.."Scroll"..suffix,width=tostring(width-20),height=tostring(scrollHeight),rectAlignment="UpperLeft",offsetXY="10 "..tostring(-bodyY)}),children={
            {tag="Panel",attributes={width=tostring(bodyWidth),height=tostring(contentHeight),rectAlignment="UpperLeft"},children={
                {tag="Text",attributes={id=prefix.."DescriptionText"..suffix,text=bodyText,fontSize="15",fontStyle="Normal",color="#171b1e",width=tostring(bodyWidth),height=tostring(contentHeight),rectAlignment="UpperLeft",alignment="UpperLeft",horizontalOverflow="Wrap",verticalOverflow="Truncate"}}
            }}
        }}
    }
    if isAction then
        table.insert(children,2,{tag="Image",attributes={color=orange,width=tostring(width),height=tostring(bodyY-8),rectAlignment="UpperLeft",raycastTarget="false"}})
        table.insert(children,{tag="Text",attributes={id="actionAPCostText"..suffix,text=entry.apCost or "",fontSize="15",fontStyle="Bold",color="#ffffff",width="56",height="25",rectAlignment="UpperRight",offsetXY="-10 -10",alignment="UpperRight",horizontalOverflow="Wrap",verticalOverflow="Truncate"}})
    end
    return {tag="Panel",attributes={id="datasheetHUD_"..(isAction and "actions" or "abilities")..suffix,width=tostring(width),height=tostring(panelHeight),rectAlignment="UpperLeft"},children=children}
end
function buildAbilitiesPanel(suffix,width,bg,baseHeight) return ruBuildCompactRulePanel("ability",suffix,width,bg,nil,baseHeight) end
function buildActionsPanel(suffix,width,bg,orange,baseHeight) return ruBuildCompactRulePanel("action",suffix,width,bg,orange,baseHeight) end
function ruBuildCompactRuleGrid(suffix,bodyWidth,bg,orange,baseHeight,bottomOffset,abilityCount,actionCount)
    local total=abilityCount+actionCount;local children={};local y=0;local index=1
    while index<=total do
        local count=math.min(2,total-index+1);local rowHeight=0;local row={}
        for col=1,count do
            local n=index+col-1;local isAction=n>abilityCount
            local item=isAction and n-abilityCount or n
            local width=count==1 and bodyWidth-2 or bodyWidth/2-2
            local panel=ruBuildCompactRulePanel(isAction and "action" or "ability","_"..item..suffix,width,bg,orange,baseHeight)
            panel.attributes.offsetXY=tostring((col-1)*(bodyWidth/2)).." "..tostring(-y)
            rowHeight=math.max(rowHeight,tonumber(panel.attributes.height));table.insert(row,panel)
        end
        for _,panel in ipairs(row) do table.insert(children,panel) end
        y=y+rowHeight+2;index=index+count
    end
    return {tag="Panel",attributes={id="abilitiesAndActionsMain"..suffix,width=tostring(bodyWidth),height=tostring(math.max(0,y-2)),rectAlignment="UpperLeft",offsetXY="0 "..tostring(bottomOffset-5)},children=children}
end
function ruReaderFrame(owner,color,ctx,title,english,subtitle,detail,contentId,kicker,ploy)
    local titleRu,original=ruSplitTitle(title);english=english or original;if english==titleRu then english="" end
    local titleNodes,titleHeight=ruInlineNodes(titleRu,ploy and 592 or 692,30,true,"#f1f5f8",{},nil)
    local englishNodes,englishHeight=ruInlineNodes(english or "",692,15,false,"#a7b3bc",{},nil)
    local bodyY=90+titleHeight+englishHeight+20;local bodyHeight=(ploy and 625 or 674)-bodyY
    local article,popups=ruArticle(owner,color,ctx,title,subtitle,detail,contentId,652,english,true)
    local slash=kicker:find("/",1,true);local badge=slash and ruTrim(kicker:sub(1,slash-1)) or kicker;local context=slash and ruTrim(kicker:sub(slash+1)) or ""
    local badgeWidth=math.min(350,ruWidth(badge,12,true)+24)
    local children={
        {tag="Image",attributes={color="#1a1e22",raycastTarget="true"}},
        {tag="Panel",attributes={width="268",height="740",rectAlignment="UpperLeft"},children={{tag="Image",attributes={color="#101316",raycastTarget="true"}}}},
        {tag="Image",attributes={color="#343c43",width="1",height="740",offsetXY="268 0",rectAlignment="UpperLeft"}},
        {tag="Panel",attributes={width="36",height="36",offsetXY="20 -24",rectAlignment="UpperLeft"},children={{tag="Image",attributes={color="#ed874a"}},ruUiText("KT",4,5,30,28,20,"#101316",true)}},
        ruUiText("KILL TEAM",68,25,176,22,16,"#f1f5f8",true),
        ruUiText(ploy and "Уловки и напоминания" or "Игровой справочник",68,47,176,20,12,"#a7b3bc"),
        {tag="Panel",attributes={width=tostring(badgeWidth),height="26",offsetXY="300 -29",rectAlignment="UpperLeft"},children={{tag="Image",attributes={color="#3b2c21"}},ruUiText(badge,12,5,badgeWidth-24,20,12,"#f6a46e",true)}},
        ruUiText(context,316+badgeWidth,34,650-badgeWidth,24,13,"#a7b3bc"),
        {tag="Panel",attributes={width=ploy and "592" or "692",height=tostring(titleHeight),offsetXY="300 -80",rectAlignment="UpperLeft"},children=titleNodes},
        {tag="Panel",attributes={width="692",height=tostring(englishHeight),offsetXY="300 "..(-(84+titleHeight)),rectAlignment="UpperLeft"},children=englishNodes},
        {tag="Panel",attributes={width="716",height=tostring(math.min(bodyHeight+12,tonumber(article.attributes.height)+16)),offsetXY="292 "..(-(bodyY-12)),rectAlignment="UpperLeft"},children={{tag="Image",attributes={color="#22292e"}}}},
        {tag="VerticalScrollView",attributes=ruScrollStyle({id=(ploy and "ruPloyScroll_" or "ruDetailScroll_")..color,width="700",height=tostring(bodyHeight),offsetXY="298 "..(-bodyY),rectAlignment="UpperLeft"}),children={article}},
        {tag="Image",attributes={color="#343c43",width="708",height="1",offsetXY="300 "..(-(ploy and 651 or 701)),rectAlignment="UpperLeft"}},
        ruUiText("Жирный термин → справка     ·     Колёсико / полоса справа → прокрутка",300,ploy and 631 or 712,708,22,13,"#a7b3bc")
    }
    if ploy and not ctx.picker then table.insert(children,{tag="Panel",attributes={width="84",height="66",offsetXY="924 -80",rectAlignment="UpperLeft"},children={{tag="Image",attributes={color="#2a333a"}},ruUiText("ОБЫЧНО",12,8,62,18,10,"#a7b3bc",true),ruUiText("1 CP",12,27,62,32,24,"#f6a46e",true)}}) end
    return children,popups
end
local function ruTermAuthorized(player,id,pattern)
    local owner,revision,index,color=tostring(id or ""):match(pattern)
    local doc=owner and RuTermDocuments[owner.."_"..color]
    return player and player.color==color and doc and doc.revision==tonumber(revision) and doc.ctx.open and doc.entries[tonumber(index)] and doc or nil,tonumber(index)
end
function ruOpenTerm(player,value,id)
    local doc,index=ruTermAuthorized(player,id,"^ruTerm_([a-z]+)_(%d+)_(%d+)_%d+_([A-Za-z]+)$");if not doc then return end
    local function open()
        if RuTermDocuments[doc.owner.."_"..doc.color]~=doc or not doc.ctx.open then return end
        if doc.open then UI.setAttribute("ruTermPopup_"..doc.owner.."_"..doc.revision.."_"..doc.open.."_"..doc.color,"active","false") end
        doc.open=index;UI.setAttribute("ruTermPopup_"..doc.owner.."_"..doc.revision.."_"..index.."_"..doc.color,"active","true")
    end
    if UI.loading then Wait.condition(open,function() return not UI.loading end) else open() end
end
function ruCloseTerm(player,value,id)
    local doc,index=ruTermAuthorized(player,id,"^ruTermClose_([a-z]+)_(%d+)_(%d+)_([A-Za-z]+)$");if not doc or doc.open~=index then return end
    UI.setAttribute("ruTermPopup_"..doc.owner.."_"..doc.revision.."_"..index.."_"..doc.color,"active","false");doc.open=nil
end
