'use strict';

// Execute the built save, never reconstructed ui/*.lua modules, in the TTS MoonSharp DLL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = __dirname;
const candidatePath = path.join(root, 'output/KT24-The-Killzone-RU-ui-candidate.json');
const operativePath = 'C:/Users/PC/Documents/My Games/Tabletop Simulator/Saves/TS_AutoSave_2.json';
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
function quote(text) {
  let level = '=';
  while (text.includes(']' + level + ']')) level += '=';
  return '[' + level + '[' + text + ']' + level + ']';
}
function lua(value) {
  if (value == null) return 'nil';
  if (typeof value === 'string') return quote(value);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return '{' + value.map(lua).join(',') + '}';
  return '{' + Object.entries(value).map(([key, item]) => '[ ' + quote(key) + ' ]=' + lua(item)).join(',') + '}';
}
function walk(objects, visit) {
  for (const object of objects || []) {
    visit(object);
    walk(object.ContainedObjects, visit);
    walk(Object.values(object.States || {}), visit);
  }
}
function descriptor(object) {
  return { guid: object.GUID, name: object.Nickname || '', description: object.Description || '',
    tags: object.Tags || [], state: object.LuaScriptState || '', xml: object.XmlUI || '',
    source: object.LuaScript || '', transform: object.Transform || {}, gmnotes: object.GMNotes || '',
    contents: (object.ContainedObjects || []).map(child => ({ guid: child.GUID, name: child.Nickname || '',
      description: child.Description || '', lua_script_state: child.LuaScriptState || '', tags: child.Tags || [] })) };
}

const harness = String.raw`
local Report={passed=true,checks=0,failures={},runs={}}
local currentRun,currentStep="harness","boot"
local function copy(v,seen)
    if type(v)~="table" or v.__ttsObject or v.__ttsPlayer then return v end
    seen=seen or {};if seen[v] then return seen[v] end
    local out={};seen[v]=out;for k,x in pairs(v) do out[copy(k,seen)]=copy(x,seen) end;return out
end
local function check(ok,label,expected,actual,evidence)
    Report.checks=Report.checks+1
    if ok then return true end
    Report.passed=false
    Report.failures[#Report.failures+1]={run=currentRun,step=currentStep,assertion=label,
        expected=tostring(expected or "true"),actual=tostring(actual),evidence=tostring(evidence or "")}
    return false
end
local function attempt(label,fn)
    local ok,result=pcall(fn)
    check(ok,label,"no syntax/runtime error",ok and "ok" or result,ok and "" or result)
    return ok,result
end
-- Real JSON strings support save/reload without retaining an encode-token registry between harnesses.
local JSON={}
function JSON.encode(value)
    local function escape(s)
        local substitutions={['"']='\\"',['\\']='\\\\',['\n']='\\n',['\r']='\\r',['\t']='\\t'}
        for i=0,31 do local c=string.char(i);substitutions[c]=substitutions[c] or string.format('\\u%04x',i) end
        s=tostring(s);local out={'"'}
        for i=1,#s do local c=s:sub(i,i);out[#out+1]=substitutions[c] or c end
        out[#out+1]='"';return table.concat(out)
    end
    local function encode(v)
        if v==nil then return "null" end
        if type(v)=="string" then return escape(v) end
        if type(v)=="boolean" or type(v)=="number" then return tostring(v) end
        assert(type(v)=="table","JSON cannot encode "..type(v))
        local n,array=0,true;for k in pairs(v) do n=n+1;if type(k)~="number" then array=false end end
        array=array and n>0 and n==#v
        local out={}
        if array then for i=1,n do out[i]=encode(v[i]) end;return '['..table.concat(out,',')..']' end
        local keys={};for k in pairs(v) do keys[#keys+1]=k end;table.sort(keys,function(a,b) return tostring(a)<tostring(b) end)
        for _,k in ipairs(keys) do out[#out+1]=escape(k)..':'..encode(v[k]) end
        return '{'..table.concat(out,',')..'}'
    end
    return encode(value)
end
function JSON.decode(s)
    if not s or s=="" then return nil end
    local pos=1
    local function skip() local _,last=s:find('^%s*',pos);pos=(last or pos-1)+1 end
    local function utf8(n)
        if n<128 then return string.char(n) end
        if n<2048 then return string.char(192+math.floor(n/64),128+n%64) end
        if n<65536 then return string.char(224+math.floor(n/4096),128+math.floor(n/64)%64,128+n%64) end
        return string.char(240+math.floor(n/262144),128+math.floor(n/4096)%64,128+math.floor(n/64)%64,128+n%64)
    end
    local function str()
        assert(s:sub(pos,pos)=='"');pos=pos+1;local out={}
        while pos<=#s do
            local c=s:sub(pos,pos);pos=pos+1
            if c=='"' then return table.concat(out) end
            if c=='\\' then
                c=s:sub(pos,pos);pos=pos+1
                if c=='u' then
                    local n=tonumber(s:sub(pos,pos+3),16);pos=pos+4;assert(n,"Invalid JSON unicode")
                    if n>=55296 and n<=56319 and s:sub(pos,pos+1)=='\\u' then
                        local low=tonumber(s:sub(pos+2,pos+5),16);pos=pos+6;n=65536+(n-55296)*1024+low-56320
                    end
                    c=utf8(n)
                else c=({n='\n',r='\r',t='\t',b='\b',f='\f',['\\']='\\',['/']='/', ['"']='"'})[c];assert(c) end
            end
            out[#out+1]=c
        end
        error("Unterminated JSON string")
    end
    local value
    value=function()
        skip();local c=s:sub(pos,pos)
        if c=='"' then return str() end
        if c=='{' or c=='[' then
            local object=c=='{';local ending=object and '}' or ']';pos=pos+1;skip();local out={};local i=1
            if s:sub(pos,pos)==ending then pos=pos+1;return out end
            while true do
                local key=i
                if object then skip();key=str();skip();assert(s:sub(pos,pos)==':');pos=pos+1 end
                out[key]=value();i=i+1;skip();c=s:sub(pos,pos);pos=pos+1
                if c==ending then return out end;assert(c==',',"Invalid JSON delimiter at "..pos)
            end
        end
        for _,token in ipairs({'true','false','null'}) do
            if s:sub(pos,pos+#token-1)==token then pos=pos+#token
                if token=='null' then return nil end;return token=='true'
            end
        end
        local number=s:match('^-?%d+%.?%d*[eE]?[+-]?%d*',pos);assert(number,"Invalid JSON at "..pos)
        pos=pos+#number;return assert(tonumber(number))
    end
    local out=value();skip();assert(pos>#s,"Trailing JSON");return out
end
local function find(nodes,id)
    for _,node in ipairs(nodes or {}) do
        if (node.attributes or {}).id==id then return node end
        local child=find(node.children,id);if child then return child end
    end
end
local function count(nodes) local n=0;for _,node in ipairs(nodes or {}) do n=n+1+count(node.children) end;return n end
local function replace(s,needle,value)
    local out,pos={},1
    while true do
        local first,last=s:find(needle,pos,true)
        if not first then out[#out+1]=s:sub(pos);return table.concat(out) end
        out[#out+1]=s:sub(pos,first-1);out[#out+1]=value;pos=last+1
    end
end
local function unescape(s)
    for _,p in ipairs({{'&lt;','<'},{'&gt;','>'},{'&quot;','"'},{'&apos;',"'"},{'&amp;','&'}}) do s=replace(s,p[1],p[2]) end
    return s
end
local function escape(s)
    s=tostring(s)
    for _,p in ipairs({{'&','&amp;'},{'<','&lt;'},{'>','&gt;'},{'"','&quot;'}}) do s=replace(s,p[1],p[2]) end
    return s
end
-- Independent fake XmlUI parser: initialization must not call the production composer parser.
local function parseXML(s)
    local roots,stack,pos={},{},1
    for _,p in ipairs({{'<!--','-->'},{'<?','?>'}}) do
        while true do
            local first=s:find(p[1],1,true);if not first then break end
            local last=assert(s:find(p[2],first,true));s=s:sub(1,first-1)..s:sub(last+#p[2])
        end
    end
    while pos<=#s do
        local first=s:find('<',pos,true)
        if not first then break end
        local last=assert(s:find('>',first,true));local body=s:sub(first+1,last-1)
        if first>pos and #stack>0 then
            local text=s:sub(pos,first-1);if text:find('%S') then stack[#stack].value=unescape(text) end
        end
        if body:sub(1,1)=='/' then stack[#stack]=nil
        else
            local tag=body:match('^%s*([^%s/]+)');local node={tag=tag,attributes={},children={}}
            for key,q,v in body:gmatch('([%w_:.-]+)%s*=%s*(["\'])(.-)%2') do node.attributes[key]=unescape(v) end
            local parent=stack[#stack];local list=parent and parent.children or roots;list[#list+1]=node
            if not body:match('/%s*$') then stack[#stack+1]=node end
        end
        pos=last+1
    end
    assert(#stack==0,"Unclosed fake UI XML: "..tostring(stack[#stack] and stack[#stack].tag)..' at '..pos..'/'..#s
        ..' suffix '..s:sub(-80));return roots
end
local function xmlText(nodes)
    local out={}
    for _,node in ipairs(nodes or {}) do
        local attrs={};for key,v in pairs(node.attributes or {}) do attrs[#attrs+1]=' '..key..'="'..escape(v)..'"' end
        out[#out+1]='<'..node.tag..table.concat(attrs)..'>'..escape(node.value or '')..xmlText(node.children)..'</'..node.tag..'>'
    end
    return table.concat(out)
end
local function newHarness(order,saved,physical)
    currentRun=order;currentStep="load"
    local globalFirst=order:find('global-first',1,true)==1
    local h={objects={},envs={},frame=0,queue={},nextId=0,context="Global",writes=0,patches=0,
        rolls={},calls={},stack={},loads=0}
    local function schedule(fn,delay,repetitions,predicate,timeout,onTimeout)
        h.nextId=h.nextId+1;local id=h.nextId
        h.queue[id]={fn=fn,due=h.frame+math.max(1,delay or 1),interval=math.max(1,delay or 1),
            repetitions=repetitions or 1,predicate=predicate,timeout=timeout and h.frame+timeout,
            onTimeout=onTimeout,owner=h.context};return id
    end
    function h.invoke(guid,name,params,...)
        local env=assert(h.envs[guid],"Unknown script "..guid)
        local fn=rawget(env,name)
        if type(fn)~="function" then
            local message="Missing cross-object function "..guid.."/"..tostring(name)
            check(false,message,'existing real function',type(fn),'caller '..h.context);error(message)
        end
        local old=h.context;h.context=guid
        h.calls[#h.calls+1]={from=old,to=guid,name=name,frame=h.frame}
        h.stack[#h.stack+1]=old..' -> '..guid..'/'..name
        local result=table.pack(pcall(fn,copy(params),...));h.context=old
        local trace=table.concat(h.stack,'\n');h.stack[#h.stack]=nil
        if not result[1] then error(guid.."/"..name..": "..tostring(result[2])..'\nTTS call stack:\n'..trace,0) end
        return copy(result[2]),copy(result[3])
    end
    function h.pump(n)
        for frame=1,n do
            h.frame=h.frame+1
            local ids={};for id,task in pairs(h.queue) do if task.due<=h.frame then ids[#ids+1]=id end end;table.sort(ids)
            for _,id in ipairs(ids) do
                local task=h.queue[id]
                if task then
                    local old=h.context;h.context=task.owner
                    local ready=true
                    if task.predicate then
                        local ok,result=attempt(task.owner.." Wait.condition predicate",task.predicate);ready=ok and result
                    end
                    if ready then
                        if task.repetitions==1 then h.queue[id]=nil
                        else if task.repetitions>1 then task.repetitions=task.repetitions-1 end;task.due=h.frame+task.interval end
                        local ok=attempt(task.owner.." scheduled callback",task.fn);if not ok then h.queue[id]=nil end
                    elseif task.timeout and h.frame>=task.timeout then
                        h.queue[id]=nil;if task.onTimeout then attempt(task.owner.." condition timeout",task.onTimeout) end
                    else task.due=h.frame+1 end
                    h.context=old
                end
            end
        end
    end
    local function makeUI(initial,global)
        local nodes=parseXML(initial or '');local ui={loading=false};local assets={}
        function ui.setXmlTable(t)
            nodes=copy(t or {});ui.loading=true
            if global then h.writes=h.writes+1 end
            schedule(function() ui.loading=false end,1)
        end
        function ui.getXmlTable() return copy(nodes) end
        function ui.getXml() return xmlText(nodes) end
        function ui.setXml(s) ui.setXmlTable(parseXML(s or '')) end
        function ui.setAttributes(id,attrs)
            if global then h.patches=h.patches+1 end
            local node=find(nodes,id)
            if node then for key,v in pairs(attrs) do node.attributes[key]=tostring(v) end end
        end
        function ui.setAttribute(id,key,v) ui.setAttributes(id,{[key]=v}) end
        function ui.getAttribute(id,key) local node=find(nodes,id);return node and node.attributes[key] end
        function ui.getAttributes(id) local node=find(nodes,id);return node and copy(node.attributes) end
        function ui.setValue(id,v)
            local node=find(nodes,id);if node then node.value=tostring(v) end;ui.setAttribute(id,'text',v)
        end
        function ui.getValue(id) local node=find(nodes,id);return node and (node.attributes.text or node.value) end
        function ui.show(id) ui.setAttribute(id,'active','true') end
        function ui.hide(id) ui.setAttribute(id,'active','false') end
        function ui.setClass(id,v) ui.setAttribute(id,'class',v) end
        function ui.getCustomAssets() return copy(assets) end
        function ui.setCustomAssets(t) assets=copy(t) end
        return ui
    end
    h.ui=makeUI(CandidateGlobal.xml,true)
    local api=setmetatable({JSON=JSON,UI=h.ui,Turns={enable=false},Time={time=0}}, {__index=_G})
    local function noop() end
    local function vector(x,y,z)
        if type(x)=='table' then y=x.y or x[2];z=x.z or x[3];x=x.x or x[1] end
        return {x=x or 0,y=y or 0,z=z or 0,[1]=x or 0,[2]=y or 0,[3]=z or 0}
    end
    api.Vector=setmetatable({},{__call=function(_,...) return vector(...) end})
    local function tint(r,g,b)
        local t={r=r or 1,g=g or 1,b=b or 1};t.toHex=function() return 'ffffff' end;t.lerp=function() return t end;return t
    end
    api.Color=setmetatable({fromString=function() return tint() end},{__call=function(_,...) return tint(...) end})
    api.Player={};local connected={}
    for _,color in ipairs({'Red','Blue','Grey','Black','White','Yellow','Teal','Green','Orange','Purple','Pink','Brown'}) do
        local p={__ttsPlayer=true,color=color,steam_id=color=='Red' and 'red-id' or color=='Blue' and 'blue-id' or color..'-id',
            steam_name=color,host=color=='Red',seated=color=='Red' or color=='Blue',team='None',lift_height=0.5}
        for _,key in ipairs({'broadcast','promote','clearSelectedObjects','setPointerPosition','showMemoDialog','showConfirmDialog'}) do
            p[key]=noop
        end
        p.getHandObjects=function() return {} end
        p.getSelectedObjects=function() return {h.objects[color=='Red' and 'red001' or 'blu001']} end
        if color=='Red' or color=='Blue' then connected[#connected+1]=p end
        p.changeColor=function(target)
            local previous=p.color
            if api.Player[previous]==p then
                local empty={color=previous,steam_id='',steam_name='',seated=false,host=false,promote=noop,
                    getHandObjects=function() return {} end}
                api.Player[previous]=empty;api.Player[previous:lower()]=empty
            end
            p.color=target;p.seated=target~='Grey';api.Player[target]=p;api.Player[target:lower()]=p
        end
        api.Player[color]=p;api.Player[color:lower()]=p
    end
    function api.Player.getPlayers() return connected end
    function api.Player.getColors()
        return {'Red','Blue','Grey','Black','White','Yellow','Teal','Green','Orange','Purple','Pink','Brown'}
    end
    function api.Player.getAvailableColors() return {'Grey','Yellow','Teal'} end
    api.Wait={frames=function(fn,n) return schedule(fn,n) end,
        time=function(fn,seconds,reps) return schedule(fn,math.ceil((seconds or 0)*60),reps) end,
        condition=function(fn,predicate,timeout,onTimeout)
            return schedule(fn,1,1,predicate,timeout and math.ceil(timeout*60),onTimeout)
        end,stop=function(id) h.queue[id]=nil end,stopAll=function() h.queue={} end}
    local timerIds={}
    api.Timer={create=function(p)
        local owner=p.function_owner and p.function_owner.getGUID() or h.context
        if timerIds[p.identifier] then h.queue[timerIds[p.identifier]]=nil end
        timerIds[p.identifier]=schedule(function() h.invoke(owner,p.function_name,p.parameters) end,
            math.ceil((p.delay or 0)*60),p.repetitions==0 and -1 or p.repetitions)
    end,destroy=function(id) h.queue[timerIds[id]]=nil;timerIds[id]=nil end}
    for _,key in ipairs({'broadcastToAll','printToAll','printToColor','broadcastToColor','log','print','addHotkey','clearHotkeys'}) do
        api[key]=noop
    end
    api.Physics={cast=function() return {} end};api.Lighting={};api.Notes={};api.MusicPlayer={}
    api.WebRequest={get=function(url,fn) schedule(function() fn({is_error=true,error='Offline harness',text=''}) end,1) end}
    local function makeObject(d)
        local guid=d.guid;local tags=copy(d.tags or {});local tables={};local env
        local obj={__ttsObject=true,resting=true,interactable=true,script_state=d.state or '',tag='Generic',
            buttons={},menus={},position=vector(),rotation=vector(),scale=vector(1,1,1)}
        local ok,ui=pcall(makeUI,d.xml,false);assert(ok,guid..' initial object XML: '..tostring(ui));obj.UI=ui
        env=setmetatable({self=obj,UI=h.ui}, {__index=api});env._G=env;h.envs[guid]=env;h.objects[guid]=obj
        function obj.getGUID() return guid end
        function obj.getName() return d.name or '' end
        function obj.setName(v) d.name=v end
        function obj.getDescription() return d.description or '' end
        function obj.setDescription(v) d.description=v end
        function obj.getGMNotes() return d.gmnotes or '' end
        function obj.setGMNotes(v) d.gmnotes=v end
        function obj.getTags() return copy(tags) end
        function obj.setTags(v) tags=copy(v) end
        function obj.addTag(v) tags[#tags+1]=v end
        function obj.hasTag(v) for _,t in ipairs(tags) do if t==v then return true end end;return false end
        function obj.getVar(key) return rawget(env,key) end
        function obj.setVar(key,v) env[key]=v end
        function obj.getTable(key) return copy(rawget(env,key) or tables[key]) end
        function obj.setTable(key,v) env[key]=copy(v);tables[key]=copy(v) end
        function obj.getPosition() return copy(obj.position) end
        function obj.setPosition(v) obj.position=vector(v) end
        obj.setPositionSmooth=obj.setPosition
        function obj.getRotation() return copy(obj.rotation) end
        function obj.setRotation(v) obj.rotation=vector(v) end
        obj.setRotationSmooth=obj.setRotation
        function obj.getScale() return copy(obj.scale) end
        function obj.setScale(v) obj.scale=vector(v) end
        function obj.getTransformForward() return vector(0,0,1) end
        function obj.getBounds() return {center=vector(),size=vector(1,1,1),offset=vector()} end
        obj.getBoundsNormalized=obj.getBounds
        function obj.positionToWorld(v) return vector(v) end
        obj.positionToLocal=obj.positionToWorld
        function obj.getColorTint() return tint() end
        local component={set=noop,get=function() return nil end}
        local child={getComponents=function() return {component,component} end}
        local parent={getChildren=function() return {child,child} end}
        function obj.getChildren() return {parent,parent} end
        function obj.getObjects() return copy(d.contents or {}) end
        function obj.getStates() return {} end
        function obj.getStateId() return 1 end
        function obj.getAttachments() return {} end
        function obj.getButtons() return copy(obj.buttons) end
        function obj.createButton(p) obj.buttons[#obj.buttons+1]=copy(p) end
        function obj.editButton(p) for k,v in pairs(p) do if obj.buttons[(p.index or 0)+1] then obj.buttons[p.index+1][k]=v end end end
        function obj.clearButtons() obj.buttons={} end
        function obj.addContextMenuItem(label,fn) obj.menus[label]=fn end
        function obj.getLuaScript() return d.source or '' end
        function obj.setLuaScript(source) d.source=source end
        function obj.getJSON() return '{}' end
        function obj.call(name,p) return h.invoke(guid,name,p) end
        for _,key in ipairs({'highlightOn','highlightOff','setLock','setColorTint','setVectorLines','setInvisibleTo',
            'setCustomObject','addToPlayerSelection','removeFromPlayerSelection','setVelocity','setAngularVelocity',
            'clearContextMenu','setSnapPoints','setDecals','destruct','reload','registerCollisions',
            'setLightRange','setLightAngle','setLightIntensity','setLightEnabled'}) do obj[key]=noop end
        function obj.getLock() return false end
        function obj.takeObject(p)
            local spawned=makeObject({guid='spawn'..tostring(h.nextId),name='Spawn stub',tags={}})
            if p and p.callback_function then schedule(function() p.callback_function(spawned) end,1) end;return spawned
        end
        return obj
    end
    for _,d in ipairs(CandidateObjects) do makeObject(copy(d)) end
    for _,color in ipairs({'Red','Blue'}) do for i=1,4 do
        local original=OperativeSamples[(i-1)%#OperativeSamples+1];local st=copy(original.state)
        st.owner=color=='Red' and 'red-id' or 'blue-id';st.ready=true;st.order='Engage'
        local id=(color=='Red' and 'red' or 'blu')..string.format('%03d',i)
        if physical and physical[id] then st=copy(physical[id]) end
        local obj=makeObject({guid=id,name=original.name,description=original.description,tags={'Operative'}})
        obj.setTable('state',st)
        -- Operative native callback used by the real adapter after setTable; persist the fake physical state.
        h.envs[id].saveState=function() obj.script_state=JSON.encode(obj.getTable('state')) end
        h.envs[id].refreshWounds=function()
            local state=obj.getTable('state');obj.UI.setValue('ktcnid-status-wounds',state.wounds..'/'..state.stats.Wounds)
        end
        h.envs[id].refreshUI=function()
            local state=obj.getTable('state');obj.UI.setValue('ktcnid-status-order',state.order)
        end
    end end
    api.Global={UI=h.ui,getVar=function(key) return h.envs.Global and rawget(h.envs.Global,key) end,
        setVar=function(key,v) h.envs.Global[key]=v end,call=function(name,p) return h.invoke('Global',name,p) end}
    function api.getObjectFromGUID(guid) return h.objects[guid] end
    function api.getAllObjects()
        local out={};for _,d in ipairs(CandidateObjects) do out[#out+1]=h.objects[d.guid] end
        for _,color in ipairs({'red','blu'}) do for i=1,4 do out[#out+1]=h.objects[color..string.format('%03d',i)] end end
        return out
    end
    function api.getObjectsWithTag(tag)
        local out={};for _,obj in ipairs(api.getAllObjects()) do if obj.hasTag(tag) then out[#out+1]=obj end end;return out
    end
    api.spawnObject=function(p) return makeObject({guid='spawn'..tostring(h.nextId),name='Spawn stub'}) end
    api.spawnObjectJSON=api.spawnObject;api.destroyObject=noop
    h.api=api
    makeObject(copy(CandidateGlobal));h.envs.Global.UI=h.ui
    local function execute(d)
        if d.source=='' then return end
        h.context=d.guid
        local ok=attempt(d.guid..' compile/chunk',function()
            local fn,err=load(d.source,'@'..d.guid,'t',h.envs[d.guid]);assert(fn,err);fn()
        end)
        if ok then h.loads=h.loads+1 end
    end
    if globalFirst then execute(CandidateGlobal) end
    for _,d in ipairs(CandidateObjects) do execute(d) end
    if not globalFirst then execute(CandidateGlobal) end
    local function onLoad(d)
        if rawget(h.envs[d.guid],'onLoad') then
            attempt(d.guid..'/onLoad',function() h.invoke(d.guid,'onLoad',saved and saved[d.guid] or d.state) end)
        end
        if d.guid=='Global' then
            -- Empty seating save sends users to Grey; take real seats before subsequent object load callbacks.
            for i,color in ipairs({'Red','Blue'}) do
                if connected[i].color~=color then
                    attempt('Global seating '..color,function()
                        h.invoke('Global','assignColor',connected[i],'-1',color..'Btn')
                        h.invoke('Global','onPlayerChangeColor',color)
                    end)
                end
            end
        end
    end
    if globalFirst then onLoad(CandidateGlobal) end
    for _,d in ipairs(CandidateObjects) do onLoad(d) end
    if not globalFirst then onLoad(CandidateGlobal) end
    h.context='scenario'
    h.pump(120)
    function h.node(id) return find(h.ui.getXmlTable(),id) end
    function h.click(color,id,value)
        local node=assert(h.node(id),'Missing real UI click target '..id)
        local a=node.attributes or {};assert(a.interactable~='false','Disabled real UI target '..id)
        local handler=assert(a.onClick,'No real onClick on '..id)
        local guid,fn=handler:match('^([^/]+)/(.+)$');if not guid then guid='Global';fn=handler end
        local ok,msg=h.invoke(guid,fn,api.Player[color],value or '-1',id);h.pump(4)
        check(ok~=false,'click '..id,'accepted',msg or ok,handler);return ok,msg
    end
    function h.hub(color,cmd,arg,value)
        return h.click(color,'kh:'..color..':'..cmd..(arg and ':'..arg or ''),value)
    end
    function h.state() local e=h.envs['339b7f'].RuAssistantEngine;return e and e.state end
    return h
end
local function panels(h,rail)
    for _,id in ipairs({'seaterMain','gamelogGlobalUI','ChsStpPanel1','ChsStpPanel2','khDock_Red','khDock_Blue'}) do
        check(h.node(id)~=nil,'coexistence '..id,'present',h.node(id) and 'present' or 'missing')
    end
    check(h.node('kts__hud_panel') or h.node('scoreBoardGUI'),'scoreboard HUD','present','missing if false')
    if rail then for _,color in ipairs({'Red','Blue'}) do
        local seats=h.envs['339b7f'].RuHub and h.envs['339b7f'].RuHub.seats
        check(seats and seats[color] and seats[color].state=='rail','initial '..color..' rail','rail',
            seats and seats[color] and seats[color].state)
    end end
end
local function step(name,fn) currentStep=name;attempt(name,fn) end
PreviewCandidateUI={}
for _,order in ipairs({'global-last','global-first'}) do
    local h=newHarness(order)
    step('initial UI coexistence',function() panels(h,true) end)
    local initialCP
    step('expand/setup/start/enroll/activation',function()
        local board=h.envs['339b7f'];initialCP={board.scoring[1].command,board.scoring[2].command}
        h.hub('Red','expand','rail');h.hub('Red','tab','turn')
        h.hub('Red','setupround','1');h.hub('Red','setupphase','4');h.hub('Red','setupturn','1');h.hub('Red','start')
        if h.state() and h.state().phase=='initiative' then
            -- No initiative is saved in the candidate. Resolve it through the real hub phase controls.
            h.hub('Red','initiative','1');h.hub('Red','next')
            h.hub('Red','passgambit');h.hub('Blue','passgambit')
        end
        check(h.state() and h.state().phase=='firefight','engine current phase','firefight',h.state() and h.state().phase)
        h.hub('Red','tab','squad');h.hub('Red','enrollall');h.hub('Red','tab','turn')
        h.hub('Blue','tab','squad');h.hub('Blue','enrollall');h.hub('Blue','tab','turn')
        check(h.state() and countUnits(h.state().units)==8,'enrolled real-shape units',8,h.state() and countUnits(h.state().units))
        h.hub('Red','begin','red001');h.hub('Red','action','reposition')
        local a=h.state().activation
        check(a and a.ap-a.spent==h.state().units.red001.apl-1,'reposition spends one AP',
            h.state().units.red001.apl-1,a and a.ap-a.spent)
        h.hub('Red','finish')
        local st=h.state();check(not st.activation,'activation finished','nil',st.activation)
        check(st.turnOwner=='blue-id','Blue receives turn','blue-id',st.turnOwner)
        check(board.RuHub.vms.Blue.turn.mode=='idle','Blue UI turn ready','idle',board.RuHub.vms.Blue.turn.mode)
        check(board.RuHub.vms.Blue.turn.myTurn==true,'Blue UI owns next turn',true,board.RuHub.vms.Blue.turn.myTurn)
        check(board.scoring[1].command==initialCP[1] and board.scoring[2].command==initialCP[2],
            'activation preserves scoreboard CP',JSON.encode(initialCP),JSON.encode({board.scoring[1].command,board.scoring[2].command}))
    end)
    step('real ploy debit and undo',function()
        local board=h.envs['339b7f'];h.hub('Red','tab','ploys');h.hub('Red','ployseg','fire')
        local choice
        for _,p in ipairs(board.RuHub.vms.Red.ploys.items) do if p.usable and p.cost>0 then choice=p;break end end
        assert(choice,'No usable current-phase ploy');h.hub('Red','ploy',choice.key)
        local cp=board.scoring[1].command;h.hub('Red','useploy',choice.key)
        check(board.scoring[1].command==cp-choice.cost,'ploy scoreboard CP debit',cp-choice.cost,board.scoring[1].command)
        h.hub('Red','undo');check(board.scoring[1].command==cp,'ploy undo CP restore',cp,board.scoring[1].command)
    end)
    step('datasheet and real weapon callback',function()
        -- Only dice spawning is stubbed; the built roller script was compiled and loaded above.
        local roller=h.objects['8afa65'];local realCall=roller.call
        roller.call=function(name,p)
            if name=='askSpawn' then h.rolls[#h.rolls+1]=copy(p);return end;return realCall(name,p)
        end
        h.invoke('efa3fe','onOperativeRandomize',{h.objects.red001,'Red'});h.pump(20)
        local panel=h.node('datasheetHUD_body_Red')
        check(panel and panel.attributes.visibility=='Red','datasheet seat visibility','Red',panel and panel.attributes.visibility)
        panels(h,false);h.click('Red','weaponButton_1_Red','-1');h.pump(10)
        local ctx=h.envs.efa3fe.RuReferenceCache.Red
        local expected=tonumber(ctx.vm.weapons[1].a)
        local roll=h.rolls[#h.rolls]
        check(roll and roll.number==expected,'weapon reaches askSpawn attack count',expected,roll and roll.number)
        check(roll and roll.player.color=='Red' and roll.auto==0,'weapon spawn seat and click mode','Red/0',
            roll and roll.player.color..'/'..tostring(roll.auto))
    end)
    step('datasheet trait reference bridge',function()
        local target
        local function visit(nodes) for _,node in ipairs(nodes or {}) do
            local id=(node.attributes or {}).id or ''
            if id:match('^kd:Red:trait:') then target=target or id end;visit(node.children)
        end end
        local panel=h.node('datasheetHUD_body_Red');visit(panel and {panel} or {})
        assert(target,'No real datasheet trait ? button');h.click('Red',target)
        local hub=h.envs['339b7f'].RuHub;local vm=hub.vms.Red
        check(hub.seats.Red.state=='open' and vm.tab=='ref','trait opens reference dock','open/ref',hub.seats.Red.state..'/'..vm.tab)
        local article=vm.ref and (vm.ref.term or vm.ref.article)
        check(article and (article.body or article.text or '')~='','reference term/article content','non-empty',JSON.encode(article))
    end)
    step('table ploys button and legacy roundEnd',function()
        local obj=h.objects.bc18b1;local button
        for _,b in ipairs(obj.buttons) do if b.click_function=='ruTablePloys' then button=b end end
        assert(button,'Table did not create ruTablePloys button')
        local owner=button.function_owner or obj;h.envs[owner.getGUID()][button.click_function](obj,'Red',false);h.pump(8)
        local hub=h.envs['339b7f'].RuHub
        check(hub.seats.Red.state=='open' and hub.seats.Red.tab=='ploys','table button opens ploys','open/ploys',hub.seats.Red.tab)
        local before=#h.calls
        attempt('d2682e/roundEnd legacy body',function() h.envs.d2682e.roundEnd(h.objects.d2682e,'Red') end);h.pump(8)
        local reached=false
        for i=before+1,#h.calls do if h.calls[i].to=='339b7f' and h.calls[i].name=='ruHubRoundEnd' then reached=true end end
        check(reached,'roundEnd reaches hub','339b7f/ruHubRoundEnd',reached)
    end)
    step('legacy UI updates and hub batching',function()
        h.invoke('bafa93','toggleGameLog');h.invoke('f4ee71','DisplayClock',1,65);h.pump(8);panels(h,false)
        local board=h.envs['339b7f'];local before=h.writes
        for i=1,10 do h.invoke('339b7f','ruHubRenderAll') end;h.pump(8)
        check(h.writes-before<=1,'ten hub renders batched','<=1 setXmlTable',h.writes-before)
        check(h.node('gamelogGlobalUI')~=nil,'hub render retains game log','present',h.node('gamelogGlobalUI')~=nil)
        check(h.writes<=60,'scenario XML write budget','<=60',h.writes)
    end)
    local result={order=order,loadedScripts=h.loads,setXmlTable=h.writes,attributePatches=h.patches,
        finalElements=count(h.ui.getXmlTable()),frames=h.frame,crossObjectCalls=#h.calls}
    Report.runs[#Report.runs+1]=result
    PreviewCandidateUI[order]=h.ui.getXmlTable()
    step('onSave/fresh-environment reload',function()
        local saved={};for _,guid in ipairs({'339b7f','efa3fe','Global'}) do saved[guid]=h.invoke(guid,'onSave') end
        local state=h.state();assert(state,'Engine unavailable for restoration check')
        local expected={round=state.round,units=copy(state.units),cp=copy(h.envs['339b7f'].scoring),
            engineCP={state.players['red-id'].cp,state.players['blue-id'].cp},
            redMode=h.envs['339b7f'].RuHub.seats.Red.state,blueMode=h.envs['339b7f'].RuHub.seats.Blue.state}
        local physical={};for _,color in ipairs({'red','blu'}) do for i=1,4 do
            local id=color..string.format('%03d',i);physical[id]=h.objects[id].getTable('state')
        end end
        local restored=newHarness(order..'-reload',saved,physical);currentStep='reload assertions'
        local st=restored.state();check(st and st.round==expected.round,'restored round',expected.round,st and st.round)
        check(st and JSON.encode(st.units)==JSON.encode(expected.units),'restored units',JSON.encode(expected.units),
            st and JSON.encode(st.units))
        check(JSON.encode(restored.envs['339b7f'].scoring)==JSON.encode(expected.cp),'restored scoreboard/CP',
            JSON.encode(expected.cp),JSON.encode(restored.envs['339b7f'].scoring))
        local engineCP=st and {st.players['red-id'].cp,st.players['blue-id'].cp}
        check(JSON.encode(engineCP)==JSON.encode(expected.engineCP),'restored engine CP',
            JSON.encode(expected.engineCP),JSON.encode(engineCP))
        local hub=restored.envs['339b7f'].RuHub
        check(hub and hub.seats.Red.state==expected.redMode and hub.seats.Blue.state==expected.blueMode,
            'restored dock states',expected.redMode..'/'..expected.blueMode,hub and JSON.encode(hub.seats))
        panels(restored,false);PreviewCandidateUI[order..'-reload']=restored.ui.getXmlTable()
        Report.runs[#Report.runs+1]={order=currentRun,loadedScripts=restored.loads,setXmlTable=restored.writes,
            finalElements=count(restored.ui.getXmlTable()),frames=restored.frame,crossObjectCalls=#restored.calls}
    end)
end
return JSON.encode(Report)
`;

function main() {
  const candidate = readJSON(candidatePath);
  const operativeSave = readJSON(operativePath);
  const samples = [];
  const sampleObject = object => {
    if (samples.length >= 3 || !object.Tags?.includes('Operative') || !object.LuaScriptState) return;
    if (samples.some(sample => sample.guid === object.GUID)) return;
    const state = JSON.parse(object.LuaScriptState);
    if (state.info?.weapons?.length && state.stats?.APL && state.stats?.Wounds) {
      samples.push({ guid: object.GUID, name: object.Nickname, description: object.Description || '', state });
    }
  };
  operativeSave.ObjectStates.forEach(sampleObject);
  walk(operativeSave.ObjectStates, sampleObject);
  if (samples.length < 2) throw new Error('Need at least two real operative state shapes from the read-only autosave');
  const global = descriptor({ ...candidate, GUID: 'Global' });
  const objects = candidate.ObjectStates.map(descriptor);
  const header = 'CandidateGlobal=' + lua(global) + '\nCandidateObjects=' + lua(objects)
    + '\nOperativeSamples=' + lua(samples)
    + '\nfunction countUnits(t) local n=0;for _ in pairs(t or {}) do n=n+1 end;return n end\n';
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tmp/ui-candidate-test.lua'), header + harness);
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '.\\check-moonsharp.ps1',
    '-Path', '.\\tmp\\ui-candidate-test.lua', '-ReportPath', '.\\output\\moonsharp-ui-candidate-verification.json',
    '-SnapshotPath', '.\\tmp\\ui-candidate-scenes.json', '-SnapshotGlobal', 'PreviewCandidateUI'];
  const execution = spawnSync('powershell.exe', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  let report;
  if (execution.status === 0) {
    const runner = readJSON(path.join(root, 'output/moonsharp-ui-candidate-verification.json'));
    // DynValue.ToString adds literal outer quotes to string results without JSON escaping.
    const result = runner.result.startsWith('"{') ? runner.result.slice(1, -1) : runner.result;
    report = JSON.parse(result);
    if (!Array.isArray(report.failures) && Object.keys(report.failures).length === 0) report.failures = [];
    report.runner = { engine: runner.engine, library: runner.library, passed: runner.passed };
  } else {
    report = { passed: false, checks: 0, failures: [{ assertion: 'MoonSharp harness execution',
      expected: 'exit 0 with soft-assert report', actual: execution.status, evidence: execution.stdout + execution.stderr }], runs: [] };
  }
  report.candidate = candidatePath;
  report.candidateSHA256 = crypto.createHash('sha256').update(fs.readFileSync(candidatePath)).digest('hex');
  report.operativeSamples = samples.map(sample => ({ guid: sample.guid, name: sample.name }));
  report.scope = { activeObjects: objects.length, scripts: objects.filter(object => object.source).length + 1,
    dormantContentsAndAlternateStates: 'Not loaded: TTS does not execute bag contents or inactive object states',
    diceSpawning: '8afa65 loaded; askSpawn intercepted only during weapon scenario', framesPerSecond: 60 };
  const scripts = new Map([['Global', global.source], ...objects.map(object => [object.guid, object.source])]);
  for (const failure of report.failures) {
    const frames = [...failure.evidence.matchAll(/(?:@?)(Global|[a-f0-9]{6})[^\d\r\n]*(\d+)[:,]/g)];
    failure.sourceFrames = frames.map(([, guid, number]) => {
      const line = Number(number), lines = (scripts.get(guid) || '').split(/\r?\n/);
      let block = 'legacy';
      for (const text of lines.slice(0, line)) {
        const marker = text.match(/^--\[\[RU-UI:([\w./-]+):(BEGIN|END)\]\]/);
        if (marker) block = marker[2] === 'BEGIN' ? marker[1] : 'legacy';
      }
      return { guid, line, block, text: lines[line - 1] || '' };
    });
  }
  fs.writeFileSync(path.join(root, 'output/ui-candidate-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failures: report.failures.length,
    runs: report.runs, report: 'output/ui-candidate-verification.json' }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
try { main(); } catch (error) { console.error(error.stack); process.exitCode = 1; }
