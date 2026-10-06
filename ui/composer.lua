-- Global owns the XML tree; prepend before existing Global code.
local RealUI = UI
RuUi = {roots={}, keys={}, owners={}, patches={}, initialized=false, dirty=false, pending=false, realIds={}}

local function ruUiCopy(value)
    if type(value)~="table" then return value end
    local result={};for key,item in pairs(value) do result[key]=ruUiCopy(item) end;return result
end

local function ruUiReplace(value,needle,replacement)
    local parts,pos={},1
    while true do
        local first,last=value:find(needle,pos,true)
        if not first then parts[#parts+1]=value:sub(pos);break end
        parts[#parts+1]=value:sub(pos,first-1);parts[#parts+1]=replacement;pos=last+1
    end
    return table.concat(parts)
end

local function ruUiDecode(value)
    for _,pair in ipairs({{"&lt;","<"},{"&gt;",">"},{"&quot;",'"'},{"&apos;","'"},{"&amp;","&"}}) do
        value=ruUiReplace(value,pair[1],pair[2])
    end
    return value
end

local function ruUiEncode(value)
    value=tostring(value)
    for _,pair in ipairs({{"&","&amp;"},{"<","&lt;"},{">","&gt;"},{'"',"&quot;"},{"'","&apos;"}}) do
        value=ruUiReplace(value,pair[1],pair[2])
    end
    return value
end

-- XML fragments have multiple roots. Whitespace-only text in containers is formatting;
-- whitespace in leaf nodes (including the baseline's spacer Text nodes) is retained.
local function ruUiParse(xml)
    local roots,stack,pos={},{},1
    local function fail(message) error("RuUi XML at "..pos..": "..message,0) end
    local function whitespace(c) return c==" " or c=="\t" or c=="\r" or c=="\n" end
    local function skip() while whitespace(xml:sub(pos,pos)) do pos=pos+1 end end
    local function name()
        local first=pos
        while pos<=#xml do
            local c=xml:sub(pos,pos)
            if whitespace(c) or c=="/" or c==">" or c=="=" or c=="<" or c=='"' or c=="'" then break end
            pos=pos+1
        end
        if first==pos then fail("expected name") end
        return xml:sub(first,pos-1)
    end
    local function finish(frame)
        local text=table.concat(frame.text)
        if #frame.node.children==0 or text:find("%S") then
            if text~="" then frame.node.value=text end
        end
        if #frame.node.children==0 then frame.node.children=nil end
    end
    if xml:sub(1,3)=="\239\187\191" then pos=4 end
    while pos<=#xml do
        if xml:sub(pos,pos)~="<" then
            local last=xml:find("<",pos,true) or (#xml+1)
            local text=ruUiDecode(xml:sub(pos,last-1));pos=last
            if #stack>0 then stack[#stack].text[#stack[#stack].text+1]=text
            elseif text:find("%S") then fail("text outside root") end
        elseif xml:sub(pos,pos+3)=="<!--" then
            local last=xml:find("-->",pos+4,true)
            if not last then fail("unterminated comment") end
            pos=last+3
        elseif xml:sub(pos,pos+1)=="<?" then
            local last=xml:find("?>",pos+2,true)
            if not last then fail("unterminated processing instruction") end
            pos=last+2
        elseif xml:sub(pos,pos+1)=="</" then
            pos=pos+2;local tag=name();skip()
            if xml:sub(pos,pos)~='>' then fail("expected closing >") end
            local frame=stack[#stack]
            if not frame or frame.node.tag~=tag then fail("mismatched closing tag "..tag) end
            finish(frame);stack[#stack]=nil;pos=pos+1
        else
            pos=pos+1
            if xml:sub(pos,pos)=="!" then fail("unsupported declaration") end
            local node={tag=name(),attributes={},children={}}
            skip()
            while pos<=#xml and xml:sub(pos,pos)~='>' and xml:sub(pos,pos)~='/' do
                local key=name();skip()
                if xml:sub(pos,pos)~='=' then fail("expected attribute =") end
                pos=pos+1;skip();local quote=xml:sub(pos,pos)
                if quote~='"' and quote~="'" then fail("expected quoted attribute") end
                local last=xml:find(quote,pos+1,true)
                if not last then fail("unterminated attribute") end
                node.attributes[key]=ruUiDecode(xml:sub(pos+1,last-1));pos=last+1;skip()
            end
            local closed=xml:sub(pos,pos)=='/'
            if closed then pos=pos+1 end
            if xml:sub(pos,pos)~='>' then fail("expected >") end
            pos=pos+1
            local list=#stack>0 and stack[#stack].node.children or roots;list[#list+1]=node
            if closed then node.children=nil else stack[#stack+1]={node=node,text={}} end
        end
    end
    if #stack>0 then fail("unclosed tag "..stack[#stack].node.tag) end
    return roots
end

local function ruUiSerialize(nodes)
    local parts={}
    local function write(node)
        parts[#parts+1]="<"..node.tag
        local keys={};for key in pairs(node.attributes or {}) do keys[#keys+1]=key end;table.sort(keys)
        for _,key in ipairs(keys) do parts[#parts+1]=' '..key..'="'..ruUiEncode(node.attributes[key])..'"' end
        if node.value==nil and #(node.children or {})==0 then parts[#parts+1]="/>";return end
        parts[#parts+1]=">"
        if node.value~=nil then parts[#parts+1]=ruUiEncode(node.value) end
        for _,child in ipairs(node.children or {}) do write(child) end
        parts[#parts+1]="</"..node.tag..">"
    end
    for _,node in ipairs(nodes) do write(node) end
    return table.concat(parts)
end

local function ruUiWalk(nodes,visit)
    for _,node in ipairs(nodes) do
        if visit(node) then return node end
        local found=ruUiWalk(node.children or {},visit);if found then return found end
    end
end

local function ruUiFind(nodes,id)
    if id==nil then return nil end
    return ruUiWalk(nodes,function(node) return (node.attributes or {}).id==id end)
end

local function ruUiIds(nodes)
    local ids={}
    ruUiWalk(nodes,function(node) local id=(node.attributes or {}).id;if id then ids[id]=true end end)
    return ids
end

-- Structural equality that ignores representation: a node parsed from an XML string has string attribute
-- values and no empty children table, while getXmlTable() may return numbers/booleans and children={}.
local function ruUiScalar(value)
    if value==nil or value=="" then return nil end
    return string.lower(tostring(value))
end
local function ruUiKids(node)
    local out={}
    for _,child in ipairs(node.children or {}) do out[#out+1]=child end
    return out
end
local function ruUiSame(a,b)
    if type(a)~="table" or type(b)~="table" then return ruUiScalar(a)==ruUiScalar(b) end
    if a.tag~=b.tag or ruUiScalar(a.value)~=ruUiScalar(b.value) then return false end
    local aa,ba=a.attributes or {},b.attributes or {}
    for key,value in pairs(aa) do if ruUiScalar(value)~=ruUiScalar(ba[key]) then return false end end
    for key,value in pairs(ba) do if ruUiScalar(value)~=ruUiScalar(aa[key]) then return false end end
    local ak,bk=ruUiKids(a),ruUiKids(b)
    if #ak~=#bk then return false end
    for i=1,#ak do if not ruUiSame(ak[i],bk[i]) then return false end end
    return true
end

local ruUiDirty
local function ruUiAppendBaseline(nodes)
    local added=false;local existingCount=#RuUi.roots;local used={}
    for index,node in ipairs(nodes) do
        local id=(node.attributes or {}).id;local key=id or ("Global#"..index);local present=false
        if not id then
            for i=1,existingCount do
                local old=RuUi.roots[i]
                if not used[i] and RuUi.owners[RuUi.keys[i]]=="Global" and not (old.attributes or {}).id
                    and ruUiSame(old,node) then
                    present=true;used[i]=true;break
                end
            end
        end
        if not present and not RuUi.owners[key] and not (RuUi.touched or {})[key] then
            RuUi.roots[#RuUi.roots+1]=ruUiCopy(node);RuUi.keys[#RuUi.keys+1]=key;RuUi.owners[key]="Global";added=true
        end
    end
    return added
end

local function ruUiInit()
    if RuUi.initialized then return end
    RuUi.initialized=true;RuUi.touched={}
    local nodes=RealUI.getXmlTable() or {};ruUiAppendBaseline(nodes);RuUi.realIds=ruUiIds(nodes)
    if RealUI.loading then
        RuUi.reconciling=true
        Wait.condition(function()
            local latest=RealUI.getXmlTable() or {};RuUi.realIds=ruUiIds(latest)
            local added=ruUiAppendBaseline(latest);RuUi.reconciling=false
            if added then ruUiDirty() end
        end,function() return not RealUI.loading end)
    end
end

local function ruUiFlush()
    if RealUI.loading or RuUi.reconciling then
        Wait.condition(ruUiFlush,function() return not RealUI.loading and not RuUi.reconciling end)
        return
    end
    local payload=ruUiCopy(RuUi.roots)
    RuUi.dirty=false;RuUi.pending=false
    RealUI.setXmlTable(payload);RuUi.realIds=ruUiIds(payload)
end

ruUiDirty=function()
    RuUi.dirty=true
    if RuUi.pending then return end
    RuUi.pending=true;Wait.frames(ruUiFlush,1)
end

local function ruUiOverlay(node)
    ruUiWalk({node},function(item)
        local patch=RuUi.patches[(item.attributes or {}).id]
        if patch then
            item.attributes=item.attributes or {}
            for key,value in pairs(patch.attrs or {}) do item.attributes[key]=ruUiCopy(value) end
            if patch.hasValue then item.value=ruUiCopy(patch.value) end
        end
    end)
end

local function ruUiReplaceOwner(owner,nodes)
    ruUiInit()
    local incoming,order,used={},{},{}
    for index,node in ipairs(nodes) do
        local id=(node.attributes or {}).id;local key=id;local foreign=false
        if not id then
            -- Anonymous roots in a legacy snapshot have no ownership metadata. Match
            -- equal live roots first, so a foreign Defaults block is neither stolen nor copied.
            for i,old in ipairs(RuUi.roots) do
                local oldKey=RuUi.keys[i]
                if not (old.attributes or {}).id and not used[oldKey] and ruUiSame(old,node) then
                    key=oldKey;foreign=RuUi.owners[key]~=owner;used[key]=true;break
                end
            end
            key=key or (owner.."#"..index)
        end
        if not foreign and (not RuUi.owners[key] or RuUi.owners[key]==owner) then
            if not incoming[key] then order[#order+1]=key end
            incoming[key]=ruUiCopy(node);ruUiOverlay(incoming[key])
        end
    end
    local roots,keys,owners={},{},{}
    for index,node in ipairs(RuUi.roots) do
        local key=RuUi.keys[index];local oldOwner=RuUi.owners[key]
        if oldOwner~=owner or incoming[key] then
            roots[#roots+1]=oldOwner==owner and incoming[key] or node;keys[#keys+1]=key;owners[key]=oldOwner
            incoming[key]=nil
        end
        if oldOwner==owner then RuUi.touched[key]=true end
    end
    for _,key in ipairs(order) do
        if incoming[key] then
            roots[#roots+1]=incoming[key];keys[#keys+1]=key;owners[key]=owner;RuUi.touched[key]=true
        end
    end
    RuUi.roots=roots;RuUi.keys=keys;RuUi.owners=owners
    local ids=ruUiIds(roots);for id in pairs(RuUi.patches) do if not ids[id] then RuUi.patches[id]=nil end end
    ruUiDirty()
end

local function ruUiPoint(op,args,unknownReal)
    ruUiInit()
    local id=args[1];local node=ruUiFind(RuUi.roots,id)
    if not node and not unknownReal then return false end
    if node then
        local patch=RuUi.patches[id] or {attrs={}};RuUi.patches[id]=patch
        local attrs={}
        if op=="setAttribute" then attrs[args[2]]=args[3]
        elseif op=="setAttributes" then attrs=args[2] or {}
        elseif op=="setClass" then attrs.class=args[2]
        elseif op=="show" then attrs.active="true"
        elseif op=="hide" then attrs.active="false"
        elseif op=="setValue" then node.value=ruUiCopy(args[2]);patch.value=ruUiCopy(args[2]);patch.hasValue=true end
        node.attributes=node.attributes or {}
        for key,value in pairs(attrs) do node.attributes[key]=ruUiCopy(value);patch.attrs[key]=ruUiCopy(value) end
    end
    if not RuUi.pending or RuUi.realIds[id] then RealUI[op](table.unpack(args)) end
    return node~=nil
end

-- Public cross-script API. Mutations return true (patch/value return false for unknown IDs).
function ruUiMount(params) ruUiReplaceOwner(params.owner,params.nodes or {});return true end
function ruUiUnmount(params) ruUiReplaceOwner(params.owner,{});return true end
function ruUiPatch(params) return ruUiPoint("setAttributes",{params.id,params.attrs or {}},false) end
function ruUiPatchMany(params)
    local count=0
    for _,patch in ipairs(params) do
        if ruUiPatch({id=patch.id or patch[1],attrs=patch.attrs or patch[2]}) then count=count+1 end
    end
    return count
end
function ruUiValue(params) return ruUiPoint("setValue",{params.id,params.value},false) end
function ruUiLoading() ruUiInit();return RuUi.pending or RuUi.reconciling==true or RealUI.loading==true end

function ruUiLegacy(params)
    ruUiInit()
    local op,args=params.op,params.args or {}
    if op=="getXmlTable" then return ruUiCopy(RuUi.roots)
    elseif op=="getXml" then return ruUiSerialize(RuUi.roots)
    elseif op=="setXmlTable" then ruUiReplaceOwner(params.owner,args[1] or {});return true
    elseif op=="setXml" then ruUiReplaceOwner(params.owner,ruUiParse(args[1]));return true
    elseif op=="getAttribute" or op=="getAttributes" or op=="getValue" then
        local node=ruUiFind(RuUi.roots,args[1])
        if not node then return RealUI[op](table.unpack(args)) end
        if op=="getValue" then return ruUiCopy(node.value) end
        if op=="getAttributes" then return ruUiCopy(node.attributes or {}) end
        return ruUiCopy((node.attributes or {})[args[2]])
    elseif op=="setAttribute" or op=="setAttributes" or op=="setValue" or op=="setClass" or op=="show" or op=="hide" then
        return ruUiPoint(op,args,true)
    end
    error("RuUi unknown legacy operation: "..tostring(op),0)
end

local ruUiProxy={}
for _,op in ipairs({"setXmlTable","getXmlTable","setXml","getXml","setAttribute","setAttributes","getAttribute",
    "getAttributes","setValue","getValue","setClass","show","hide"}) do
    local operation=op
    ruUiProxy[operation]=function(...) return ruUiLegacy({owner="Global",op=operation,args={...}}) end
end
UI=setmetatable(ruUiProxy,{__index=function(_,key)
    if key=="loading" then return ruUiLoading() end
    return RealUI[key] -- Custom assets are independent of the XML tree.
end})
ruUiComposerReady=true -- A boolean can be inspected across TTS script boundaries with getVar.
