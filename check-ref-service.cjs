// Read-only installed-data fixture, exercised in Fengari and emitted for native MoonSharp verification.
const fs = require('fs');
const assert = require('node:assert/strict');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('./tools/node_modules/fengari');
const tts = 'C:/Users/PC/Documents/My Games/Tabletop Simulator';
const installed = JSON.parse(fs.readFileSync(tts + '/Mods/Workshop/3573927734_RU.json', 'utf8'));
const hud = installed.ObjectStates.find(o => o.GUID === 'efa3fe').LuaScript;
const anchor = '--[[RU-UI:ref-service:BEGIN]]';
assert(hud.includes(anchor), 'Installed legacy HUD anchor missing');
const original = hud.slice(0, hud.indexOf(anchor));
const names = ['ruReferenceTeams', 'ruReferenceCommon', 'ruReferenceEquipment', 'ruReferenceShared',
  'ruCoreGlossary', 'ruFontMetrics'];
const data = names.map(name => {
  const lines = hud.split(/\r?\n/).filter(line => new RegExp('^\\s*(?:local\\s+)?' + name + '\\s*=').test(line));
  assert.equal(lines.length, 1, 'Missing/duplicate installed data: ' + name);
  return lines[0];
}).join('\n');

const inches = n => {
  const last = n % 10, two = n % 100;
  return n + ' ' + (two >= 11 && two <= 14 ? 'дюймов' : last === 1 ? 'дюйм' : last >= 2 && last <= 4 ? 'дюйма' : 'дюймов');
};
const normalize = s => s.replace(/\*\*/g, '').replace(/(\d+)\s+([1236])&&/g, (_, n, u) => inches(Number(n) * Number(u)))
  .replace(/([1236])&&/g, (_, n) => inches(Number(n)));
function bodies(info) {
  const out = new Set();
  function visit(x) {
    if (!x || typeof x !== 'object') return;
    if (typeof x.text === 'string' && x.text) out.add(normalize(x.text));
    Object.values(x).forEach(visit);
  }
  for (const k of ['abilities', 'actions', 'special', 'psychic']) visit(info[k]);
  return [...out];
}
function modelsFrom(file) {
  const models = [];
  function scan(x) {
    if (!x || typeof x !== 'object') return;
    if (x.LuaScriptState) {
      const state = JSON.parse(x.LuaScriptState);
      if (state.info) models.push({name: x.Nickname, description: x.Description, state, guid: x.GUID, expected: bodies(state.info)});
    }
    Object.values(x).forEach(scan);
  }
  scan(JSON.parse(fs.readFileSync(file, 'utf8')));
  return models;
}
const catalog = modelsFrom('output/KT41-RU-working.json');
assert.equal(catalog.reduce((n, x) => n + (x.state.info.weapons || []).length, 0), 1612);
assert.equal(new Set(catalog.map(x => x.state.info.ktRuTeam)).size, 41);
const autosave = modelsFrom(tts + '/Saves/TS_AutoSave_2.json');
const real = ['Primus', 'Chronomancer', 'Mindwitch'].map(name => {
  const model = autosave.find(x => x.state.info.name === name);
  assert(model, 'Real operative missing: ' + name);
  return model;
});
function lit(v) {
  if (v == null) return 'nil';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return '{' + v.map(lit).join(',') + '}';
  return '{' + Object.entries(v).map(([k, x]) => '[' + lit(k) + ']=' + lit(x)).join(',') + '}';
}
const legacy = {ruPloysVersion: 1, seats: {
  Red: {team: 'hierotekcircle', round: 3, used: {'hierotekcircle:sample': true}, pinned: {'command-reroll': true}},
  Blue: {team: 'broodbrothers', round: 2, used: {}, pinned: {'broodbrothers:sample': true}},
}};
const saved = JSON.stringify(legacy);
const driver = `
local mounts, hubCalls, objects, waits, menus = {}, {}, {}, {}, {}
local uiLoading, broadcasts, rolls = false, {}, {}
local checks, teams, ploys, profiles, bodyCount = 0, 0, 0, 0, 0
local function check(value, message) checks = checks + 1; assert(value, message) end
local function clone(x)
    if type(x) ~= "table" then return x end
    local out = {}; for k, v in pairs(x) do out[k] = clone(v) end; return out
end
local function same(a, b)
    if type(a) ~= type(b) then return false end
    if type(a) ~= "table" then return a == b end
    for k, v in pairs(a) do if not same(v, b[k]) then return false end end
    for k in pairs(b) do if a[k] == nil then return false end end
    return true
end
UI = setmetatable({}, {__index = function(_, k) error("Direct legacy UI access: " .. k) end})
self = {getGUID = function() return "efa3fe" end,
    addContextMenuItem = function(label, fn) menus[#menus + 1] = {label, fn} end}
Global = {call = function(method, p)
    if method == "ruUiLoading" then return uiLoading end
    if method == "ruUiMount" then mounts[p.owner] = clone(p.nodes); return true end
    if method == "ruUiUnmount" then mounts[p.owner] = nil; return true end
    error("Unexpected Global call: " .. method)
end}
local board = {call = function(method, p) hubCalls[#hubCalls + 1] = {method = method, params = clone(p)} end}
function getObjectFromGUID(guid) if guid == "339b7f" then return board end; return objects[guid] end
local roller = {hasTag = function(tag) return tag == "KTUIDiceRoller" end,
    call = function(method, p) rolls[#rolls + 1] = {method = method, number = p.number, auto = p.auto} end}
function getAllObjects() return {roller} end
Wait = {time = function(f) f() end, frames = function(f) f() end,
    condition = function(f, p) if p() then f() else waits[#waits + 1] = {f, p} end end}
local function ready()
    uiLoading = false
    local current = waits; waits = {}
    for _, task in ipairs(current) do assert(task[2]()); task[1]() end
end
local validColors = {White = true, Brown = true, Red = true, Orange = true, Yellow = true, Green = true,
    Teal = true, Blue = true, Purple = true, Pink = true, Black = true}
local playerObjects = {}
Player = setmetatable({getColors = function() return {"Red", "Blue"} end}, {__index = function(_, color)
    if type(color) == "string" and not validColors[color] then
        local canon = color:sub(1, 1):upper() .. color:sub(2):lower()
        if validColors[canon] then color = canon end
    end
    if not validColors[color] then error("cannot access field " .. tostring(color) .. " of userdata<LuaGlobalPlayer>") end
    if not playerObjects[color] then
        playerObjects[color] = {broadcast = function(msg) broadcasts[#broadcasts + 1] = msg end}
    end
    return playerObjects[color]
end})
local red, blue = {color = "Red", clearSelectedObjects = function() end}, {color = "Blue"}
local function operative(x)
    local o = {hasTag = function(tag) return tag == "Operative" end, getName = function() return x.name end,
        getDescription = function() return x.description end, getTable = function() return x.state end,
        getGUID = function() return x.guid end}
    objects[x.guid] = o; return o
end
-- JSON mock uses real JSON serialization, and the source save string is registered independently.
local decoded = {[${lit(saved)}] = ${lit(legacy)}}
JSON = {}
function JSON.decode(s) if decoded[s] then return clone(decoded[s]) end; error("Invalid JSON") end
function JSON.encode(value)
    local function quote(s)
        local out = {'"'}
        for i = 1, #s do
            local c = s:sub(i, i)
            if c == '"' or c == '\\\\' then out[#out + 1] = '\\\\' .. c
            elseif c == "\\n" then out[#out + 1] = "\\\\n"
            elseif c == "\\r" then out[#out + 1] = "\\\\r"
            elseif c == "\\t" then out[#out + 1] = "\\\\t"
            else out[#out + 1] = c end
        end
        out[#out + 1] = '"'; return table.concat(out)
    end
    local function encode(v)
        if type(v) == "string" then return quote(v) end
        if type(v) ~= "table" then return tostring(v) end
        local out = {}
        for k, x in pairs(v) do out[#out + 1] = quote(tostring(k)) .. ":" .. encode(x) end
        table.sort(out); return "{" .. table.concat(out, ",") .. "}"
    end
    local result = encode(value); decoded[result] = clone(value); return result
end
`;
const cases = `
local real, catalog = ${lit(real)}, ${lit(catalog)}
local quoteProbe = ruReplace('1″ Devastating 1', "″", '"')
check(quoteProbe == '1" Devastating 1', "Literal quote replacement: " .. quoteProbe)
local tokenProbe, radiusProbe = RuRefInternal.profileParts(quoteProbe)
check(tokenProbe == "Devastating 1" and radiusProbe == "1", "Radius token: " .. tokenProbe .. " / " .. tostring(radiusProbe))
check(select("#", ruBuildCompactRuleGrid()) == 1, "Legacy grid hook must return one node")
local function resolve(terms, tuples)
    for _, term in ipairs(terms or {}) do
        local e = ruRefTerm({key = term.key})
        check(type(e.body) == "string" and e.body ~= "", "Unresolved term: " .. tostring(term.key))
        if tuples then check(term[1] == term.key and term[2] == term.label, "Hub term tuple compatibility") end
    end
end
local function articleKeys(a)
    resolve(a.terms, true)
    for _, w in ipairs(a.weapons or {}) do
        for _, trait in ipairs(w.traits) do check(type(trait) == "string" and trait ~= "", "Article trait must be a label") end
    end
end
for teamKey, team in pairs(ruReferenceTeams) do
    teams = teams + 1
    for _, scope in ipairs({"team", "ploy", "eq", "faq"}) do
        local q = ruRefQuery({team = teamKey, scope = scope})
        if scope ~= "faq" then check(q.count > 0, teamKey .. " empty " .. scope) end
        if scope == "ploy" then ploys = ploys + q.count end
        for _, result in ipairs(q.results) do
            local article = ruRefQuery({team = teamKey, scope = scope, key = result.key}).article
            check(article and article.body ~= "", "Unreadable article: " .. result.key)
            local source
            for _, e in ipairs(team.entries) do if result.key == "team:" .. teamKey .. ":" .. e.id then source = e.text end end
            for _, e in ipairs(ruReferenceEquipment) do if result.key == "equipment:" .. e.id then source = e.text end end
            check(source == article.body, "Reference body changed: " .. result.key)
            articleKeys(article)
            local term = ruRefTerm({key = result.key})
            check(term.body == article.body, "Selected key does not resolve")
        end
    end
    local rules = ruRefTeamRules({team = teamKey})
    check(#rules == ruRefQuery({team = teamKey, scope = "team"}).count, "Team rule API differs")
    for _, rule in ipairs(rules) do resolve(rule.terms, true); resolve({rule}) end
    local book, sectionByKey, bookKeys = ruRefTeamBook({team = teamKey}), {}, {}
    for _, section in ipairs(book.sections) do
        sectionByKey[section.key] = section
        local sectionKeys = {}
        for _, item in ipairs(section.items) do
            check(item.title ~= "" and item.body ~= "", "Incomplete team book item: " .. teamKey .. "/" .. item.key)
            check(not sectionKeys[item.key] and not bookKeys[item.key], "Duplicate team book key: " .. teamKey .. "/" .. item.key)
            sectionKeys[item.key], bookKeys[item.key] = true, true
            resolve(item.terms)
        end
    end
    local libraryPloys = ruRefQuery({team = teamKey, scope = "ploy"}).count
    check(#(sectionByKey.strat and sectionByKey.strat.items or {})
        + #(sectionByKey.fire and sectionByKey.fire.items or {}) == libraryPloys, "Team book ploy coverage: " .. teamKey)
    check(sectionByKey.rules and sectionByKey.eq and sectionByKey.strat and sectionByKey.fire,
        "Missing team book section: " .. teamKey)
end
check(teams == 41, "Expected 41 teams")
check(ploys == 328, "Expected 328 readable ploys")
local unknownBook = ruRefTeamBook({team = "missing-team"})
check(type(unknownBook.sections) == "table" and #unknownBook.sections == 0, "Unknown team book")
local examples = {}
for _, teamKey in ipairs({"hierotekcircle", "broodbrothers", "legionary"}) do
    local book, counts = ruRefTeamBook({team = teamKey}), {}
    for _, section in ipairs(book.sections) do counts[section.key] = #section.items end
    examples[#examples + 1] = teamKey .. "=" .. table.concat({counts.rules or 0, counts.strat or 0,
        counts.fire or 0, counts.eq or 0, counts.faq or 0}, "/")
end
local ru = ruRefQuery({team = "hierotekcircle", scope = "team", query = "РЕАНИМ"})
local en = ruRefQuery({team = "Hierotek Circle", scope = "team", query = "reanim"})
check(ru.count > 0 and en.count > 0, "Cyrillic/English search")
check(ruRefQuery({team = "hierotekcircle", scope = "team"}).count >= ru.count, "Empty query")
check(ruRefQuery({scope = "weapon"}).count == 25, "Common rule catalog without operative")
local terms = ruRefQuery({scope = "terms"})
check(terms.count == 119 and terms.scopes[1][1] == "terms", "Complete terms catalog/scope ordering")
check(ruRefQuery({}).count == 119, "Terms scope must be the no-context default")
local previousTitle
for _, result in ipairs(terms.results) do
    if previousTitle then check(KT.ref.fold(previousTitle) <= KT.ref.fold(result.title), "Terms must be alphabetically sorted") end
    previousTitle = result.title
    local article = ruRefQuery({scope = "terms", key = result.key}).article
    check(article and article.title ~= "" and article.english ~= "" and article.body ~= "" and type(article.terms) == "table",
        "Term article incomplete: " .. result.key)
end
local covered = ruRefQuery({scope = "terms", query = "укрыт"})
local lethalSearch = ruRefQuery({scope = "terms", query = "Lethal"})
check(covered.count > 0, "Cyrillic cover search")
local lethalTitle
for _, result in ipairs(lethalSearch.results) do
    if result.title:find("Смертоносное", 1, true) then lethalTitle = result.title end
end
check(lethalTitle ~= nil, "English Lethal search: " .. (lethalSearch.results[1] and lethalSearch.results[1].title or "none"))
local boldTerms = ruRefTermsIn({text = "AP APL <b>Дистанция контроля</b> Cover"})
check(#boldTerms > 0 and #boldTerms <= 8, "Term cap")
check(boldTerms[1].key == "glossary:core-control", "Bold terms must come first")
resolve(boldTerms, true)
check(#ruRefTermsIn({text = "backblast superAPLary"}) == 0, "Substring glossary contamination")
check(next(ruRefTerm({key = "missing"})) == nil, "Unknown term")
check(ruRefQuery({guid = "missing"}).count == 0, "Missing model")
for _, api in ipairs({ruRefQuery, ruRefTerm, ruRefTermsIn, ruRefTeamRules}) do
    check(type(api(false)) == "table" and type(api("invalid")) == "table", "API must not throw")
end

PreviewDatasheetScenes = {}
local function nodes(tree)
    local out = {}
    local function walk(n)
        local a = n.attributes or {}
        if a.id then check(not out[a.id], "Duplicate id: " .. a.id); out[a.id] = n end
        for _, c in ipairs(n.children or {}) do walk(c) end
    end
    for _, n in ipairs(tree) do walk(n) end
    return out
end
for n, model in ipairs(real) do
    local o = operative(model)
    onOperativeRandomize({o, "Red"})
    local tree = mounts["datasheet:Red"]
    check(tree and tree[1].attributes.id == "datasheetHUD_body_Red", "Datasheet composer owner/root")
    check(tree[1].attributes.visibility == "Red", "Datasheet visibility")
    check(hubCalls[#hubCalls].method == "ruAssistantFocus" and hubCalls[#hubCalls].params.guid == model.guid, "Focus hook")
    local indexed = nodes(tree)
    check(#WeaponCache.Red.weapons == #model.state.info.weapons, "Real weapons missing from cache")
    for i, w in ipairs(WeaponCache.Red.weapons) do
        local button = indexed["weaponButton_" .. i .. "_Red"]
        check(button and button.attributes.onClick == "efa3fe/onWeaponAttack", "Attack button/handler changed")
        local before = #rolls
        onWeaponAttack(red, "-1", "weaponButton_" .. i .. "_Red")
        onWeaponAttack(red, "-2", "weaponButton_" .. i .. "_Red")
        check(#rolls == before + 2 and rolls[#rolls].number == tonumber(w.atk), "Attack cache lookup")
        check(rolls[#rolls].auto == 1 and rolls[#rolls - 1].auto == 0, "Left/right attack semantics")
        check(broadcasts[#broadcasts]:find(w.name, 1, true), "Attack weapon identity")
    end
    articleKeys(ruRefQuery({color = "Red", scope = "model"}).article)
    local vm = RuReferenceCache.Red.vm
    for i, w in ipairs(vm.weapons) do for j, trait in ipairs(w.traits) do
        if trait.key then
            resolve({trait})
            check(#KT.chars(trait.tip) <= 300, "Trait tooltip too long")
            check(indexed["kd:Red:trait:" .. i .. ":" .. j].attributes.onClick == "efa3fe/ruDsClick", "Trait click handler")
            local before = #hubCalls
            ruDsClick(blue, nil, "kd:Red:trait:" .. i .. ":" .. j)
            check(#hubCalls == before, "Cross-seat trait click")
            ruDsClick(red, nil, "kd:Red:trait:" .. i .. ":" .. j)
            check(hubCalls[#hubCalls].method == "ruHubOpen" and hubCalls[#hubCalls].params.termKey == trait.key, "Trait forwarding")
        end
    end end
    PreviewDatasheetScenes["ds" .. n] = clone(tree)
end
local greyObject = operative(real[1])
onOperativeRandomize({greyObject, "Grey"})
local greyMount = mounts["datasheet:Grey"]
ruDsClick({color = "Grey"}, nil, "kd:Grey:close")
check(greyMount == nil and mounts["datasheet:Grey"] == nil, "Grey spectator must not affect datasheets")

for _, model in ipairs(catalog) do
    local object = operative(model)
    ruRememberOperative("Yellow", model.state, object)
    local ctx = RuReferenceCache.Yellow
    check(ctx.currentEdition and ctx.team, "Current catalog team metadata")
    for _, expected in ipairs(model.expected) do
        local found
        for _, entry in ipairs(ctx.entries) do if KT.ref.plain(entry.body) == expected then found = entry; break end end
        check(found ~= nil, "Source body changed: " .. model.state.info.name .. " / " .. expected:sub(1, 60))
        local a = ruRefQuery({color = "Yellow", scope = "model", key = found.key}).article
        check(KT.ref.plain(a.body) == expected, "Query body changed")
        bodyCount = bodyCount + 1
    end
    for _, weapon in ipairs(model.state.info.weapons or {}) do
        local wr, expected = weapon.stats.WR or "", 0
        if wr ~= "" and wr ~= "-" and wr ~= "—" then
            for token in ruDelimited(wr, ",") do if ruTrim(token) ~= "" then expected = expected + 1 end end
            local selected = ruRulesForProfile("Yellow", {name = weapon.name, wr = wr})
            local names = {}; for _, entry in ipairs(selected) do names[#names + 1] = entry.english end
            check(#selected == expected, model.state.info.name .. " / " .. wr .. ": expected " .. expected
                .. ", found " .. #selected .. " (" .. table.concat(names, ", ") .. ")")
            for _, entry in ipairs(selected) do
                resolve({entry})
                for token in entry.title:gmatch("%S+") do
                    token = token:gsub("^[%p]+", ""):gsub("[%p]+$", "")
                    check(token ~= "x" and token ~= "X" and token ~= "x+" and token ~= "X+",
                        "Weapon label placeholder: " .. entry.title .. " / " .. wr)
                end
            end
        end
        profiles = profiles + 1
    end
    for _, weapon in ipairs(ctx.vm.weapons) do
        local source = ctx.weapons[weapon.index]
        local sourceCount, labelCount = 0, #weapon.traits
        for token in ruDelimited(source.wr, ",") do
            local clean = ruTrim(token)
            if clean ~= "" and clean ~= "-" and clean ~= "—" then sourceCount = sourceCount + 1 end
        end
        check(labelCount == sourceCount, "Weapon chip coverage: " .. model.state.info.name .. " / " .. source.wr)
        for _, trait in ipairs(weapon.traits) do
            for token in trait.label:gmatch("%S+") do
                token = token:gsub("^[%p]+", ""):gsub("[%p]+$", "")
                check(token ~= "x" and token ~= "X" and token ~= "x+" and token ~= "X+",
                    "Datasheet chip placeholder: " .. trait.label)
            end
            if trait.key then resolve({trait}) end
        end
    end
end
check(profiles == 1612, "Expected 1612 catalog profiles")

local previous = RuReferenceCache.Red
local modelArticle = ruRefQuery({color = "Red", guid = real[1].guid, scope = "model"}).article
check(modelArticle.english == "Primus" and RuReferenceCache.Red == previous, "GUID query changed selected operative")
articleKeys(modelArticle)
local object = operative(real[1])
onOperativeRandomize({object, "Blue"})
mounts["hub:Red"] = {{tag = "Panel", attributes = {id = "hub_Red"}}}
local before = #hubCalls
ruDsClick(blue, nil, "kd:Red:close")
check(mounts["datasheet:Red"] and #hubCalls == before, "Cross-seat close")
ruDsClick(red, nil, "kd:Red:openref")
check(same(hubCalls[#hubCalls], {method = "ruHubOpen", params = {color = "Red", tab = "ref", refScope = "model"}}), "Openref")
ruDsClick(red, nil, "kd:Red:close")
check(not mounts["datasheet:Red"] and mounts["datasheet:Blue"] and mounts["hub:Red"], "Composer close isolation")
refreshDatasheetHUD("Red")
check(mounts["datasheet:Red"] ~= nil, "Refresh remount")
refreshDatasheetHUDAll()
check(mounts["datasheet:Red"] and mounts["datasheet:Blue"] and mounts["hub:Red"], "Refresh-all isolation")
onLoad(${lit(saved)})
check(ruRefLoaded == true, "Reference HUD readiness flag")
check(#menus == 2, "Original context menu lost")
menus[1][2]("Red"); check(not mounts["datasheet:Red"], "Delete menu")
menus[2][2]("Red"); check(mounts["datasheet:Red"] ~= nil, "Refresh menu")
real[3].state.wounds = 7
onOperativeRandomize({operative(real[3]), "Red"})
check(RuReferenceCache.Red.vm.wounds == "7/8", "Current/max wounds")
updateDatasheetHUD("Red", {wounds = "6/8"})
check(RuReferenceCache.Red.vm.wounds == "6/8", "Update HUD compatibility")

local legacyModel = {name = "Legacy scenario", description = "Weapons\\nR Old weapon\\nATK 3 HIT 4+ DMG 2/3\\nWR Blast 2\\n---",
    guid = "legacy", state = {stats = {}, info = {name = "Legacy", categories = {"Legionary"}, rules = {Blast = "Старая редакция"}}}}
onOperativeRandomize({operative(legacyModel), "Red"})
check(ruWeaponTooltip("Red", {name = "Old weapon", wr = "Blast 2"}):find("Старая редакция", 1, true), "Legacy edition lost")
check(not ruWeaponTooltip("Red", {name = "Old weapon", wr = "Backblast"}):find("Старая редакция", 1, true), "Substring trait")
resolve({RuReferenceCache.Red.vm.weapons[1].traits[1]})
uiLoading = true
onOperativeRandomize({operative(real[1]), "Red"})
onOperativeRandomize({operative(real[2]), "Red"})
check(RuReferenceCache.Red.currentEdition == false, "Operative processed while composer loading")
ready()
check(RuReferenceCache.Red.vm.english == "Chronomancer", "Deferred selection was stale")
uiLoading = true
onOperativeRandomize({operative(real[1]), "Red"})
deleteDatasheetHUD("Red"); ready()
check(not mounts["datasheet:Red"], "Close resurrected deferred HUD")

local current = catalog[1]
ruRememberOperative("Yellow", current.state, operative(current))
local piercing = ruRulesForProfile("Yellow", {wr = "Piercing Crits 1"})
check(#piercing == 1 and piercing[1].english == "Piercing Crits", "Piercing Crits contamination")
local seek = ruRulesForProfile("Yellow", {wr = "Seek Light"})
check(#seek == 1 and seek[1].english == "Seek Light", "Seek Light contamination")
check(ruWeaponTooltip("Yellow", {wr = "Heavy (Reposition only)"}):find("только Перемещение", 1, true), "Heavy restriction")
local lethal = ruRulesForProfile("Yellow", {wr = "Lethal 5+"})
check(#lethal == 1 and lethal[1].title:find("Смертоносное 5+", 1, true) and not lethal[1].title:find("5++", 1, true),
    "Lethal parameterized label")
local range = ruRulesForProfile("Yellow", {wr = "Rng 6\\\""})
check(#range == 1 and range[1].key == "common:Range" and range[1].title:find("Дистанция 6\\\"", 1, true),
    "Rng must link to the Range rule")
local accurate = ruRulesForProfile("Yellow", {wr = "Accurate 1"})
check(#accurate == 1 and accurate[1].title:find("Точность 1", 1, true), "Accurate parameterized translation")
local piercing = ruRulesForProfile("Yellow", {wr = "Piercing 1"})
check(#piercing == 1 and piercing[1].title:find("Пробивание 1", 1, true), "Piercing parameterized translation")
local psychic = ruRulesForProfile("Yellow", {wr = "PSYCHIC"})
check(#psychic == 1 and psychic[1].title:find("Психическое", 1, true), "Psychic title case")
local radius = ruRulesForProfile("Yellow", {wr = "1″ Devastating 1"})
check(#radius == 1 and radius[1].text:find("1″", 1, true), "Weapon rule radius lost")
for _, call in ipairs({{ruOpenPloys, "ruHubOpen", {color = "Red", tab = "ploys"}},
    {ruPloysRoundEnd, "ruHubRoundEnd", {}}, {ruAssistantRead, "ruHubOpen", {color = "Red", tab = "ref"}}}) do
    call[1]({color = "Red"})
    check(same(hubCalls[#hubCalls], {method = call[2], params = call[3]}), "Legacy forwarder")
end
local saved = ${lit(saved)}
ruLoadPloys(saved)
check(same(ruRefLegacyPloys(), ${lit(legacy)}), "Legacy ploy capture")
local detached = ruRefLegacyPloys(); detached.seats.Red.round = 99
check(ruRefLegacyPloys().seats.Red.round == 3, "Legacy state leaked a mutable reference")
check(same(JSON.decode(onSave()), ${lit(legacy)}), "Legacy save roundtrip")
ruLoadPloys("invalid"); check(next(ruRefLegacyPloys()) == nil, "Invalid saved state")
ruLoadPloys(saved)
return checks .. " assertions; " .. teams .. " teams; " .. ploys .. " ploys; " .. profiles .. " profiles; "
    .. bodyCount .. " full bodies; 3 datasheet scenes; books " .. table.concat(examples, ", ")
`;
const modules = ['ui/kit.lua', 'ui/rich.lua', 'ui/datasheet-view.lua', 'ui/ref-service.lua', 'ui/datasheet.lua'];
const script = [driver, original, data, ...modules.map(file => fs.readFileSync(file, 'utf8')), cases].join('\n');
fs.mkdirSync('tmp', {recursive: true});
fs.mkdirSync('output', {recursive: true});
fs.writeFileSync('tmp/ref-service-test.lua', script);
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const status = lauxlib.luaL_dostring(L, to_luastring(script));
if (status !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tolstring(L, -1)));
const result = to_jsstring(lua.lua_tolstring(L, -1));
lua.lua_pop(L, 1);
lua.lua_getglobal(L, to_luastring('onSave'));
assert.equal(lua.lua_pcall(L, 0, 1, 0), lua.LUA_OK);
assert.deepEqual(JSON.parse(to_jsstring(lua.lua_tolstring(L, -1))), legacy, 'onSave must return real legacy JSON');
console.log({passed: true, runtime: 'Fengari', result, fixture: 'tmp/ref-service-test.lua'});
