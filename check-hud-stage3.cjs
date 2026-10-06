const fs=require('fs');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('./tools/node_modules/fengari');
const working=process.argv.includes('--working');
const displayNames=JSON.parse(fs.readFileSync('ru-hud-display-names-complete.json','utf8'));
const hud=working?JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-working.json','utf8')).ObjectStates[126].LuaScript:fs.readFileSync('output/HUD-preview-3.lua','utf8');
const pack=JSON.parse(fs.readFileSync('output/KT41-RU-'+(working?'working':'preview-3')+'.json','utf8'));
const models=[];
let teamModels=0;
function scan(x){if(!x||typeof x!=='object')return;if(x.LuaScriptState){const state=JSON.parse(x.LuaScriptState);if(state.info)models.push({name:x.Nickname,description:x.Description,state});}for(const v of Object.values(x))if(v&&typeof v==='object')scan(v);}
scan(pack);
teamModels=models.length;
if(working)scan(JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-working.json','utf8')));
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
Wait = {time = function(callback, delay) callback() end, condition=function(callback,predicate) assert(predicate());callback() end}
local tests = 0
local expectedNames = ${literal(displayNames)}
local displayLabelsChecked = 0
local missingDisplayNames = {}
local function expectedDisplay(raw)
    local clean = raw:gsub("%[%x+%]", ""):gsub("%[%-%]", ""):gsub("^%*", ""):gsub("%s*%([%d/]+AP%)$", ""):gsub("%s*%(AP%d+%)$", "")
    clean = clean:match("^%s*(.-)%s*$"):gsub("^[RM]%s+", ""):gsub("^%([RM]%)%s*", "")
    local translated = expectedNames[clean] or expectedNames[string.upper(clean)]
    if not translated and clean:find("%a") then
        if ${process.argv.includes('--inventory-missing')?'true':'false'} then missingDisplayNames[clean] = true
        else error("Untranslated visible name: " .. raw) end
    end
    displayLabelsChecked = displayLabelsChecked + 1
    return translated and (translated .. " (" .. raw .. ")") or raw
end
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
    if state.info.name then
        assert(values.statsNameText_Red.text == expectedDisplay(state.info.name), "Operative display name mismatch model ${index}")
    end
    assert(values.statsAPLValue_Red.text == tostring(state.stats.APL or ""), "APL display mismatch model ${index}")
    assert(values.statsMoveValue_Red.text == (tostring(state.stats.Move or state.stats.M or ""):gsub('"$', "") .. '"'), "Move display mismatch model ${index}")
    assert(values.statsSaveValue_Red.text == (tostring(state.stats.Save or state.stats.SV or ""):gsub("%+$", "") .. "+"), "Save display mismatch model ${index}")
    assert(values.statsWoundsValue_Red.text == tostring(state.stats.Wounds or state.stats.W or ""), "Wounds display mismatch model ${index}")
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
        assert(values["weaponNameText_" .. i .. "_Red"].text == expectedDisplay(weapon.name), "Weapon display name mismatch model ${index}")
        local id = "weaponWRText_" .. i .. "_Red"
        assert(values[id] and values[id].text == weapon.wr, "Weapon key changed model ${index}")
        assert(values[id].tooltip, "Missing weapon reference model ${index}")
    end
    local function specialPresent(value)
        if type(value) ~= "table" then return end
        if type(value.text) == "string" and value.text ~= "" then
            local found = false
            for _, entry in ipairs(AbilityActionCache.Red.abilities) do
                if entry.name == (value.name or "Особое правило") then found = true end
            end
            assert(found, "Missing special rule model ${index}")
        end
        for _, child in pairs(value) do if type(child)=="table" then specialPresent(child) end end
    end
    specialPresent(state.info.special)
    specialPresent(state.info.psychic)
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
do
    local state = {stats={M=6,SV=3,W=9,APL=2},info={abilities={{name="Warrior Instincts",text="Инстинкты"}},actions={{name="Optics (AP1)",text="Оптика"}},special={Abilities={{name="Shield",text="Щит"}}},rules={}}}
    local operative={hasTag=function() return true end,getName=function() return "Vespid Warrior" end,getDescription=function() return "Weapons\\nR Test\\nATK 3\\nHIT 4+\\nDMG 2/3\\nWR Test" end,getTable=function() return state end}
    onOperativeRandomize({operative,"Red"})
    assert(values.abilityNameText_1_Red.text=="Инстинкты воина (Warrior Instincts)","Bilingual title failed")
    assert(values.actionAPCostText_1_Red.text=="1AP","Alternative AP notation failed")
    assert(values.actionNameText_1_Red.text=="Оптика (Optics)","Action alias failed")
    assert(values.abilityDescriptionText_2_Red.text=="Щит","Special rule rendering failed")
end
local missingList = {}
for name in pairs(missingDisplayNames) do table.insert(missingList,name) end
return tests, displayLabelsChecked, table.concat(missingList,"\\n")
`;
const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
const status=lauxlib.luaL_dostring(L,to_luastring(driver+'\n'+hud+'\n'+assertions+'\n'+edgeCases));
if(status!==lua.LUA_OK)throw new Error(to_jsstring(lua.lua_tolstring(L,-1)));
const result={engine:'Fengari Lua VM with mocked TTS UI and immediate Wait callbacks',modelsExercised:lua.lua_tointeger(L,-3),bilingualDisplayLabelsChecked:lua.lua_tointeger(L,-2),missingVisibleNames:to_jsstring(lua.lua_tolstring(L,-1)).split('\n').filter(Boolean).sort(),teamModels,tableModels:models.length-teamModels,legacyDistanceAndEmptyRulesPassed:true,nativeTTSRuntimeTested:false};
if(process.argv.includes('--inventory-missing')){fs.writeFileSync('inventory/hud-missing-visible-names.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exit(0);}
fs.writeFileSync('output/hud-check-preview-3.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
