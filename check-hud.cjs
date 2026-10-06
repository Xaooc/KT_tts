const fs=require('fs');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('./tools/node_modules/fengari');
const hud=fs.readFileSync('output/HUD-preview-2.lua','utf8');
const pack=JSON.parse(fs.readFileSync('output/KT41-RU-preview-2.json','utf8'));
const models=[];
function scan(x){if(!x||typeof x!=='object')return;if(x.LuaScriptState){const state=JSON.parse(x.LuaScriptState);if(state.info)models.push({name:x.Nickname,description:x.Description,state});}for(const v of Object.values(x))if(v&&typeof v==='object')scan(v);}
scan(pack);
function literal(x){if(x===null||x===undefined)return 'nil';if(typeof x==='string')return JSON.stringify(x);if(typeof x==='number'||typeof x==='boolean')return String(x);if(Array.isArray(x))return '{'+x.map(literal).join(',')+'}';return '{'+Object.entries(x).map(([k,v])=>'['+literal(k)+']='+literal(v)).join(',')+'}';}
const driver=`
local nodes, values, root = {}, {}, {}
UI = {}
self = {getGUID = function() return "efa3fe" end}
function UI.getXmlTable(...) return root end
function UI.setXmlTable(xml, ...) 
    nodes, values, root = {}, {}, xml
    local function walk(v)
        if v.attributes and v.attributes.id then nodes[v.attributes.id] = true end
        for _, child in ipairs(v.children or {}) do walk(child) end
    end
    for _, node in ipairs(xml) do walk(node) end
end
function UI.setAttribute(id, attr, value, ...)
    if nodes[id] then values[id] = values[id] or {}; values[id][attr] = value end
end
Wait = {time = function(callback, delay) callback() end}
local tests = 0
`;
const assertions=models.map((model,index)=>`
do
    local state = ${literal(model.state)}
    local operative = {
        hasTag = function(tag) return tag == "Operative" end,
        getName = function() return ${literal(model.name)} end,
        getDescription = function() return ${literal(model.description)} end,
        getTable = function(key) assert(key == "state"); return state end
    }
    onOperativeRandomize({operative, "Red"})
    for i, ability in ipairs(state.info.abilities or {}) do
        local id = "abilityDescriptionText_" .. i .. "_Red"
        assert(values[id], "Missing ability widget model ${index}")
        assert(values[id].tooltip == values[id].text, "Missing complete ability tooltip model ${index}")
        assert(not string.find(values[id].text, "&&", 1, true), "Unconverted shape token model ${index}")
    end
    for i, action in ipairs(state.info.actions or {}) do
        local id = "actionDescriptionText_" .. i .. "_Red"
        assert(values[id], "Missing action widget model ${index}")
        assert(values[id].tooltip == values[id].text, "Missing complete action tooltip model ${index}")
    end
    for i, weapon in ipairs(WeaponCache.Red.weapons) do
        local id = "weaponWRText_" .. i .. "_Red"
        assert(values[id] and values[id].text == weapon.wr, "Weapon key changed model ${index}")
        assert(values[id].tooltip, "Missing weapon reference model ${index}")
    end
    tests = tests + 1
end
`).join('\n');
const edgeCases=`
do
    local state = {stats={}, info={abilities={{name="Тест", text="Кириллица: 2 2&&, 3 2&&, 1&&, 2&&, 3&&, 6&&"}}, actions={}, rules={}}}
    local operative = {hasTag=function() return true end, getName=function() return "Тест" end, getDescription=function() return "Weapons\\nR Test\\nATK 3\\nHIT 4+\\nDMG 2/3\\nWR Test" end, getTable=function() return state end}
    onOperativeRandomize({operative, "Red"})
    assert(values.abilityDescriptionText_1_Red.text == "Кириллица: 4 дюйма, 6 дюймов, 1 дюйм, 2 дюйма, 3 дюйма, 6 дюймов", "Legacy distance conversion failed")
    assert(values.weaponWRText_1_Red.tooltip == "В этой модели нет сохранённой справки по правилам оружия.", "Empty reference failed")
end
return tests
`;
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
const status=lauxlib.luaL_dostring(L,to_luastring(driver+'\n'+hud+'\n'+assertions+'\n'+edgeCases));
if(status!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tolstring(L,-1)));
const result={engine:'Fengari Lua VM with mocked TTS UI and immediate Wait callbacks',modelsExercised:lua.lua_tointeger(L,-1),legacyDistanceAndEmptyRulesPassed:true,nativeTTSRuntimeTested:false};
fs.writeFileSync('output/hud-check-preview-2.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
