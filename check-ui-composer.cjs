const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const composer = read('ui/composer.lua');
const shim = read('ui/shim.lua');
const baseline = read('inventory/0001-XmlUI.xml');
const gameLog = read('inventory/0023-XmlUI.xml');
const literal = value => {
  let equals = '';
  while (value.includes(`]${equals}]`)) equals += '=';
  return `[${equals}[${value}]${equals}]`;
};
for (const [name, source] of [['composer', composer], ['shim', shim], ['fixture generator', read('check-ui-composer.cjs')]]) {
  source.split(/\r?\n/).forEach((line, i) => {
    if (line.length > 140) throw new Error(`${name}:${i + 1}: line exceeds 140 characters`);
  });
}
for (const marker of ['--[[RU-UI:shim:BEGIN]]', '--[[RU-UI:shim:END]]']) {
  if (!shim.includes(marker)) throw new Error(`Missing marker ${marker}`);
}

const fixture = `
local baselineXml=${literal(baseline)}
local gameLogXml=${literal(gameLog)}
local checks,cases=0,0
local function check(value,message)
    checks=checks+1;assert(value,message or ("Check "..checks))
end
local function equal(a,b,message) check(a==b,(message or "Equality")..": "..tostring(a).." ~= "..tostring(b)) end
local function copy(value)
    if type(value)~="table" then return value end
    local result={};for key,item in pairs(value) do result[key]=copy(item) end;return result
end
local function find(nodes,id)
    for _,node in ipairs(nodes) do
        if (node.attributes or {}).id==id then return node end
        local child=find(node.children or {},id);if child then return child end
    end
end
local function panel(id,children) return {tag="Panel",attributes={id=id},children=children} end
local function installComposer()
${composer}
end
local function installShim()
${shim}
end
local function runtime(seed,loading,withoutComposer,withoutGetVar)
    local state={tree=copy(seed or {}),sets={},points={},calls={},frame=0,frames={},conditions={},assets={}}
    local real={loading=loading or false}
    function real.getXmlTable() return copy(state.tree) end
    function real.setXmlTable(nodes)
        state.sets[#state.sets+1]=copy(nodes);state.tree=copy(nodes)
    end
    function real.getXml() return state.xml or "<Panel id='fallback'/>" end
    function real.setXml(xml) state.xml=xml end
    function real.getAttribute(id,key) local node=find(state.tree,id);return node and (node.attributes or {})[key] end
    function real.getAttributes(id) local node=find(state.tree,id);return node and copy(node.attributes or {}) end
    function real.getValue(id) local node=find(state.tree,id);return node and node.value end
    function real.setAttribute(id,key,value)
        state.points[#state.points+1]={op="setAttribute",id=id,key=key,value=value}
        local node=find(state.tree,id)
        if node then node.attributes=node.attributes or {};node.attributes[key]=value end
    end
    function real.setAttributes(id,attrs) for key,value in pairs(attrs) do real.setAttribute(id,key,value) end end
    function real.setValue(id,value)
        state.points[#state.points+1]={op="setValue",id=id,value=value}
        local node=find(state.tree,id);if node then node.value=value end
    end
    function real.setClass(id,value) real.setAttribute(id,"class",value) end
    function real.show(id) real.setAttribute(id,"active","true") end
    function real.hide(id) real.setAttribute(id,"active","false") end
    function real.getCustomAssets() return copy(state.assets) end
    function real.setCustomAssets(assets) state.assets=copy(assets) end
    UI=real;RuUi=nil;ruUiComposerReady=nil;self=nil
    for _,name in ipairs({"ruUiLegacy","ruUiMount","ruUiUnmount","ruUiPatch","ruUiPatchMany","ruUiValue","ruUiLoading"}) do
        _G[name]=nil
    end
    Wait={}
    function Wait.frames(callback,count) state.frames[#state.frames+1]={callback=callback,due=state.frame+(count or 1)} end
    function Wait.condition(callback,predicate)
        state.conditions[#state.conditions+1]={callback=callback,predicate=predicate}
    end
    local function conditions()
        local prior=state.conditions;state.conditions={}
        for _,job in ipairs(prior) do
            if job.predicate() then job.callback() else state.conditions[#state.conditions+1]=job end
        end
    end
    function state.pump()
        state.frame=state.frame+1;conditions()
        local prior=state.frames;state.frames={}
        for _,job in ipairs(prior) do
            if job.due<=state.frame then job.callback() else state.frames[#state.frames+1]=job end
        end
        conditions()
    end
    Global={UI=real}
    function Global.call(name,params)
        state.calls[#state.calls+1]={name=name,params=copy(params)}
        assert(type(_G[name])=="function","Composer unavailable: "..name)
        return copy(_G[name](copy(params)))
    end
    if not withoutGetVar then function Global.getVar(name) return _G[name] end end
    if not withoutComposer then installComposer();state.globalUI=UI end
    state.real=real
    function state.owner(guid)
        -- The block must load successfully even before self is available.
        self=nil;installShim();self={getGUID=function() return guid end,UI=real}
        return UI
    end
    function state.legacy(owner,op,...)
        return Global.call("ruUiLegacy",{owner=owner,op=op,args={...}})
    end
    function state.has(id) return find(RuUi.roots,id)~=nil end
    function state.node(id) return find(RuUi.roots,id) end
    return state
end

-- 1: Parse both installed XML fixtures, then seed lazily from the parsed static tree.
local state=runtime()
UI.setXml(baselineXml);local parsed=UI.getXmlTable();local canonical=UI.getXml()
equal(#parsed,11,"Static roots");check(find(parsed,"seaterMain"));check(find(parsed,"RedBtn"))
UI.setXml(canonical);equal(UI.getXml(),canonical,"Baseline stable round trip")
equal(find(parsed,"seaterMain").children[2].children[4].value,"  ","Leaf whitespace")
UI.setXml(gameLogXml);canonical=UI.getXml();UI.setXml(canonical)
equal(UI.getXml(),canonical,"Game log stable round trip");check(state.has("gamelog-controller"))
state=runtime(parsed);equal(RuUi.initialized,false,"Lazy init")
equal(state.globalUI.getXml(),state.legacy("A","getXml"),"Shared shadow serialization")
equal(#state.sets,0,"Seed does not rebuild");equal(RuUi.owners.seaterMain,"Global")
local defaultsKey
for i,node in ipairs(RuUi.roots) do if node.tag=="Defaults" then defaultsKey=RuUi.keys[i] end end
equal(RuUi.owners[defaultsKey],"Global");cases=cases+1

-- 2: Filtering one's own root cannot remove another owner's root or baseline.
state=runtime(parsed)
state.legacy("A","setXmlTable",{panel("a"),panel("a2")});state.legacy("B","setXmlTable",{panel("b")})
local snapshot=state.legacy("A","getXmlTable");local filtered={}
for _,node in ipairs(snapshot) do if (node.attributes or {}).id~="a" then filtered[#filtered+1]=node end end
state.legacy("A","setXmlTable",filtered)
check(not state.has("a"));check(state.has("a2"));check(state.has("b"));check(state.has("seaterMain"))
equal(RuUi.owners.b,"B");snapshot[1].attributes.active="poison"
equal(RuUi.roots[1].attributes.active,"false","Getter deep copy");cases=cases+1

-- 3: The scoreboard's delayed stale snapshot cannot erase A's live roots.
state=runtime(parsed);state.legacy("B","setXmlTable",{panel("b")})
snapshot=state.legacy("B","getXmlTable")
Wait.frames(function()
    snapshot[#snapshot+1]=panel("scoreboard");state.legacy("B","setXmlTable",snapshot)
end,1)
state.legacy("A","setXmlTable",{panel("late")});state.pump()
check(state.has("late"));check(state.has("scoreboard"));equal(#state.sets,1,"Stale write batched")
check(find(state.sets[1],"late"));snapshot=state.legacy("B","getXmlTable")
state.legacy("A","setXmlTable",{});state.legacy("B","setXmlTable",snapshot)
check(state.has("late"),"Removed IDs may be newly claimed by a later writer")
equal(RuUi.owners.late,"B");cases=cases+1

-- 4: A full clear is scoped to the caller.
state=runtime(parsed);state.legacy("A","setXmlTable",{panel("a")});state.legacy("B","setXmlTable",{panel("b")})
state.legacy("A","setXmlTable",{});check(not state.has("a"));check(state.has("b"));check(state.has("seaterMain"))
cases=cases+1

-- 5: String append preserves foreign nodes, Defaults, quoted attributes and entities.
local old=state.legacy("log","getXml")
local extra=[[<!-- ignored > --><Panel id='g' tooltip="a > b &quot;q&quot; &apos;p&apos; &amp;lt;">
<Text id="gText">&lt;tag&gt; &amp; &quot;q&quot; &apos;p&apos;</Text></Panel>]]
state.legacy("log","setXml",old..extra)
check(state.has("g"));check(state.has("b"));check(state.has("seaterMain"))
equal(state.node("g").attributes.tooltip,[[a > b "q" 'p' &lt;]])
equal(state.node("gText").value,[[<tag> & "q" 'p']])
local encoded=state.legacy("log","getXml");state.legacy("log","setXml",encoded)
equal(state.legacy("log","getXml"),encoded,"Entity round trip")
state.legacy("log","setXml",state.legacy("log","getXml")..gameLogXml)
check(state.has("gamelog-menu"));check(state.has("b"));cases=cases+1

-- 6: Point writes survive another owner's rebuild and one's own stale snapshot.
state=runtime(parsed);state.legacy("A","setXmlTable",{panel("a",{{tag="Text",attributes={id="child"},value="old"}})})
state.pump();snapshot=state.legacy("A","getXmlTable")
local pointCount=#state.points
state.legacy("A","setAttribute","child","color","purple")
equal(#state.points,pointCount+1,"Immediate point write")
state.legacy("A","setValue","child","new text");state.legacy("A","setClass","child","newClass")
state.legacy("A","setAttributes","child",{fontSize="30",tooltip="updated"})
state.legacy("B","setXmlTable",{panel("b")});state.legacy("A","setXmlTable",snapshot);state.pump()
local child=find(state.sets[#state.sets],"child")
equal(child.attributes.color,"purple");equal(child.value,"new text");equal(child.attributes.class,"newClass")
equal(child.attributes.fontSize,"30");equal(child.attributes.tooltip,"updated")
equal(state.legacy("B","getValue","child"),"new text")
local attrs=state.legacy("B","getAttributes","child");attrs.color="poison"
equal(state.legacy("B","getAttribute","child","color"),"purple");cases=cases+1

-- 7: Five structural writes produce one real set; a loading UI blocks that flush.
state=runtime(parsed)
for index=1,5 do state.legacy("writer"..index,"setXmlTable",{panel("root"..index)}) end
equal(#state.sets,0);equal(#state.frames,1);equal(ruUiLoading(),true);state.pump()
equal(#state.sets,1);equal(ruUiLoading(),false)
state.real.loading=true
for index=1,5 do state.legacy("writer"..index,"setXmlTable",{panel("root"..index)}) end
state.pump();equal(#state.sets,1);equal(#state.conditions,1);state.pump();equal(#state.sets,1)
state.real.loading=false;state.pump();equal(#state.sets,2);equal(ruUiLoading(),false);cases=cases+1

-- 8: Both show and hide update the live UI immediately and the shadow.
state=runtime(parsed);state.globalUI.hide("seaterMain")
equal(state.node("seaterMain").attributes.active,"false");equal(#state.points,1)
state.globalUI.show("seaterMain");equal(state.node("seaterMain").attributes.active,"true")
equal(state.real.getAttribute("seaterMain","active"),"true");equal(#state.points,2);cases=cases+1
state.real.setAttribute("seaterMain","active","live-only")
equal(ruUiRealAttribute({id="seaterMain",name="active"}),"live-only","Real UI attribute bypasses shadow")
cases=cases+1

-- 9: Namespace mounts, explicit unknown-ID no-ops, patch batching and stable ordering.
state=runtime(parsed)
equal(ruUiMount({owner="hub:Red",nodes={panel("red"),panel("red2")}}),true)
ruUiMount({owner="hub:Blue",nodes={panel("blue")}})
equal(ruUiPatchMany({{id="red",attrs={color="red"}},{"blue",{color="blue"}},{id="missing",attrs={active="true"}}}),2)
equal(#state.points,0,"Unflushed IDs only update shadow")
equal(ruUiPatch({id="missing",attrs={active="false"}}),false)
equal(ruUiValue({id="missing",value="ignored"}),false);equal(#state.points,0)
equal(ruUiValue({id="red",value="hello"}),true)
ruUiMount({owner="hub:Blue",nodes={panel("red"),panel("blue")}})
equal(RuUi.owners.red,"hub:Red","Foreign ID cannot be stolen")
ruUiMount({owner="hub:Red",nodes={panel("red2"),panel("red"),panel("red3")}})
equal(RuUi.roots[12].attributes.id,"red","Existing order kept")
equal(RuUi.roots[13].attributes.id,"red2");equal(RuUi.roots[14].attributes.id,"blue")
equal(RuUi.roots[15].attributes.id,"red3","New roots appended")
state.pump();equal(find(state.sets[1],"red").value,"hello")
equal(ruUiUnmount({owner="hub:Red"}),true);check(not state.has("red"));check(state.has("blue"))
cases=cases+1

-- 10: Unpatched Global falls back for every documented method, including loading.
state=runtime({panel("fallback")},false,true);local proxy=state.owner("fallbackOwner")
equal(proxy.loading,false);state.real.loading=true;equal(proxy.loading,true)
proxy.setXmlTable({panel("fallback")});equal(#state.sets,1);equal(#proxy.getXmlTable(),1)
proxy.setXml("<Panel/>");equal(proxy.getXml(),"<Panel/>")
proxy.setAttribute("fallback","color","red");equal(proxy.getAttribute("fallback","color"),"red")
proxy.setAttributes("fallback",{fontSize="20"});equal(proxy.getAttributes("fallback").fontSize,"20")
proxy.setValue("fallback","text");equal(proxy.getValue("fallback"),"text")
proxy.setClass("fallback","demo");equal(proxy.getAttribute("fallback","class"),"demo")
proxy.hide("fallback");equal(proxy.getAttribute("fallback","active"),"false")
proxy.show("fallback");equal(proxy.getAttribute("fallback","active"),"true")
proxy.setCustomAssets({{name="test"}});equal(proxy.getCustomAssets()[1].name,"test")
equal(#state.calls,0,"No composer calls with unavailable marker");cases=cases+1

-- 11: Foreign Defaults are never dropped or duplicated by legacy snapshots.
state=runtime(parsed);snapshot=state.legacy("A","getXmlTable")
state.legacy("A","setXmlTable",snapshot);state.legacy("A","setXmlTable",{})
local count=0
for _,node in ipairs(RuUi.roots) do if node.tag=="Defaults" then count=count+1 end end
equal(count,1);equal(#RuUi.roots,11)
state.legacy("A","setXmlTable",{{tag="Defaults",children={{tag="Text",attributes={color="orange"}}}}})
state.legacy("B","setXmlTable",{});count=0
for _,node in ipairs(RuUi.roots) do if node.tag=="Defaults" then count=count+1 end end
equal(count,2,"Each owner's Defaults retained");state.legacy("A","setXmlTable",{});equal(#RuUi.roots,11)
cases=cases+1

-- 12: Shim resolves GUID at call time, uses copied calls, and leaves self.UI alone.
state=runtime(parsed);proxy=state.owner("A");local ownUI=self.UI
proxy.setXmlTable({panel("shimA")});self={getGUID=function() return "B" end,UI=ownUI}
proxy.setXmlTable({panel("shimB")});equal(RuUi.owners.shimA,"A");equal(RuUi.owners.shimB,"B")
equal(proxy.loading,true);equal(self.UI,ownUI);proxy.setAttribute("shimA","color","cyan")
proxy.setValue("shimA","new");proxy.setClass("shimA","test");proxy.hide("shimA");proxy.show("shimA")
proxy.setAttributes("shimA",{width="100"});equal(proxy.getAttribute("shimA","width"),"100")
equal(proxy.getAttributes("shimA").class,"test");equal(proxy.getValue("shimA"),"new")
proxy.setXml(proxy.getXml().."<Panel id='shimString'/>");check(state.has("shimString"))
local returned=proxy.getXmlTable();returned[1].attributes.active="poison"
equal(state.node("keepSplash01").attributes.active,"false")
state.pump();equal(proxy.loading,false);equal(#state.sets,1)
local ok=pcall(function() proxy.setXml("<Panel><Text></Panel>") end)
equal(ok,false,"Parser errors must not fall back");equal(#state.sets,1)
state=runtime(parsed,false,false,true);proxy=state.owner("probe")
proxy.setXmlTable({panel("probed")});equal(RuUi.owners.probed,"probe")
state=runtime({panel("fallback")},false,true,true);proxy=state.owner("probeFallback")
proxy.show("fallback");equal(state.real.getAttribute("fallback","active"),"true")
cases=cases+1

-- 13: Loading-time lazy seed reconciles missing baseline without losing queued writes.
state=runtime({parsed[1]},true);proxy=state.owner("early")
proxy.setXmlTable({panel("early")});proxy.setAttribute("early","color","pink")
equal(#state.points,0);state.globalUI.setAttribute("keepSplash01","active","true")
equal(#state.points,1);state.pump();equal(#state.sets,0)
state.tree=copy(parsed);state.real.loading=false;state.pump()
equal(#state.sets,1);check(state.has("seaterMain"));check(state.has("early"))
equal(find(state.sets[1],"early").attributes.color,"pink")
equal(find(state.sets[1],"keepSplash01").attributes.active,"true","Late baseline preserves point writes")
equal(ruUiLoading(),false)
-- A partially loaded Defaults root may move index when the full tree becomes available.
state=runtime({parsed[10]},true);state.globalUI.getXmlTable()
state.tree=copy(parsed);state.real.loading=false;state.pump();state.pump()
local defaultsCount=0
for _,node in ipairs(RuUi.roots) do if node.tag=="Defaults" then defaultsCount=defaultsCount+1 end end
equal(defaultsCount,1,"Late baseline must not duplicate anonymous Defaults");check(state.has("seaterMain"))
-- A Global deletion during loading is intentional and must not be reintroduced.
state=runtime({parsed[1]},true);state.globalUI.setXmlTable({})
state.tree=copy(parsed);state.real.loading=false;state.pump()
check(not state.has("keepSplash01"));check(state.has("seaterMain"));equal(#state.sets,1)
-- Unknown legacy getters fall back to live nodes that have not yet reconciled.
state=runtime({},true);state.globalUI.getXmlTable();state.tree={panel("liveOnly")}
state.real.setValue("liveOnly","live");state.real.setAttribute("liveOnly","color","gold")
equal(state.globalUI.getAttribute("liveOnly","color"),"gold")
equal(state.globalUI.getAttributes("liveOnly").color,"gold");equal(state.globalUI.getValue("liveOnly"),"live")
cases=cases+1
return cases.." cases passed; "..checks.." assertions passed; 0 failed"
`;

fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(root, 'tmp/ui-composer-test.lua'), fixture);
console.log('PASS: generated tmp/ui-composer-test.lua (13 MoonSharp scenarios; execution required)');
