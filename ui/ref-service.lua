-- Read-only reference API for the scoreboard hub. Data tables remain in the HUD's lexical scope.
KT.ref = KT.ref or {}
local R = KT.ref
RuReferenceCache = RuReferenceCache or {}

function ruReplace(s, needle, replacement)
    s = tostring(s or "")
    local parts, pos = {}, 1
    while true do
        local first, last = s:find(needle, pos, true)
        if not first then parts[#parts + 1] = s:sub(pos); break end
        parts[#parts + 1], parts[#parts + 2] = s:sub(pos, first - 1), replacement
        pos = last + 1
    end
    return table.concat(parts)
end

local upper = KT.chars("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ")
local lower = KT.chars("абвгдеёжзийклмнопрстуфхцчшщъыьэюя")
local function fold(s)
    s = tostring(s or ""):lower()
    for i, c in ipairs(upper) do s = ruReplace(s, c, lower[i]) end
    return s
end

function ruTrim(s)
    s = tostring(s or "")
    local chars, first, last = KT.chars(s), 1, nil
    last = #chars
    local function space(c) return c == " " or c == "\t" or c == "\r" or c == "\n" or c == " " end
    while first <= last and space(chars[first]) do first = first + 1 end
    while last >= first and space(chars[last]) do last = last - 1 end
    return table.concat(chars, "", first, last)
end

function ruDelimited(s, delimiter)
    s = tostring(s or "")
    local pos = 1
    return function()
        if pos > #s + 1 then return nil end
        local finish = s:find(delimiter, pos, true)
        if finish then local part = s:sub(pos, finish - 1); pos = finish + #delimiter; return part end
        local part = s:sub(pos); pos = #s + 2; return part
    end
end

function ruLines(s) return ruDelimited(s, "\n") end

local function plain(s)
    return ruReplace(ruReplace(ruReplace(KT.stripTags(tostring(s or "")), "&lt;", "<"), "&gt;", ">"), "&amp;", "&")
end

local function copy(v)
    if type(v) ~= "table" then return v end
    local out = {}
    for k, x in pairs(v) do out[k] = copy(x) end
    return out
end

local function key(s) return tostring(s or ""):lower():gsub("[^a-z0-9]", "") end

-- Port of the reader's distance normalization, without UTF-8/Cyrillic character-class patterns.
function ruCleanRuleText(raw)
    local chars = KT.chars(ruReplace(raw, "**", ""))
    local parts, pos = {}, 1
    local function digit(c) return c and c ~= "" and ("0123456789"):find(c, 1, true) ~= nil end
    while pos <= #chars do
        local c = chars[pos]
        if digit(c) and (c == "1" or c == "2" or c == "3" or c == "6")
            and chars[pos + 1] == "&" and chars[pos + 2] == "&" then
            local number = tonumber(c)
            local before = #parts
            while before > 0 and (parts[before] == " " or parts[before] == "\t") do before = before - 1 end
            if before < #parts and digit(parts[before]) then
                local first = before
                while first > 1 and digit(parts[first - 1]) do first = first - 1 end
                number = tonumber(table.concat(parts, "", first, before)) * number
                while #parts >= first do table.remove(parts) end
            end
            local last, lastTwo, word = number % 10, number % 100, "дюймов"
            if lastTwo < 11 or lastTwo > 14 then
                if last == 1 then word = "дюйм" elseif last >= 2 and last <= 4 then word = "дюйма" end
            end
            parts[#parts + 1] = tostring(number) .. " " .. word
            pos = pos + 3
        else
            parts[#parts + 1] = c
            pos = pos + 1
        end
    end
    return table.concat(parts)
end

local function splitTitle(title)
    title = tostring(title or "")
    local last, depth = nil, 0
    if title:sub(-1) ~= ")" then return title, "" end
    for i = 1, #title do
        local c = title:sub(i, i)
        if c == "(" then if depth == 0 then last = i end; depth = depth + 1
        elseif c == ")" then depth = depth - 1; if depth < 0 then return title, "" end end
    end
    if not last or depth ~= 0 then return title, "" end
    local russian = ruTrim(title:sub(1, last - 1))
    for _, c in ipairs(KT.chars(russian)) do
        if ("абвгдеёжзийклмнопрстуфхцчшщъыьэюя"):find(fold(c), 1, true) then
            return russian, title:sub(last + 1, -2)
        end
    end
    return title, ""
end

local function display(raw) return splitTitle(ruDisplayName(raw or "")) end
local documents, candidates, commonKeys, foldedAliases = {}, {}, {}, {}

local function aliases(title, english)
    local out = {}
    for _, raw in ipairs({title or "", english or ""}) do
        local s = ruTrim(splitTitle(plain(raw)))
        s = s:gsub("%s+[xX]%+?$", ""):gsub("^%*", "")
        if #KT.chars(s) > 2 then out[#out + 1] = s end
    end
    return out
end

local function register(id, title, english, body, termAliases)
    local entry = {key = id, title = title or "", english = english or "", body = tostring(body or "")}
    documents[id] = entry
    if termAliases then
        entry.aliases = termAliases
        for _, alias in ipairs(termAliases) do foldedAliases[alias] = fold(alias) end
        candidates[#candidates + 1] = entry
    end
    return entry
end

for _, e in ipairs(ruCoreGlossary or {}) do
    register("glossary:" .. e.id, e.title, e.english, e.text, e.aliases or aliases(e.title, e.english))
end
for _, e in ipairs(ruReferenceCommon or {}) do
    local id = "common:" .. e.id
    local a = aliases(e.title, e.english)
    if e.english == "Devastating" then a[#a + 1], a[#a + 2] = "Разрушительное", "Разрушительный" end
    register(id, display(e.title), e.english, e.text, a)
    commonKeys[key(e.english)] = id
end
local sharedNames = {}
for name in pairs(ruReferenceShared or {}) do sharedNames[#sharedNames + 1] = name end
table.sort(sharedNames)
for _, name in ipairs(sharedNames) do
    register("shared:" .. name, display(name), name, ruReferenceShared[name], aliases(ruDisplayName(name), name))
end
for teamKey, team in pairs(ruReferenceTeams or {}) do
    for _, e in ipairs(team.entries or {}) do register("team:" .. teamKey .. ":" .. e.id, e.title, e.english, e.text) end
    for name, text in pairs(team.rules or {}) do register("named:" .. teamKey .. ":" .. name, display(name), name, text) end
end
for _, e in ipairs(ruReferenceEquipment or {}) do register("equipment:" .. e.id, e.title, e.english, e.text) end

local function charAt(s, pos)
    if #"Я" == 1 then return s:sub(pos, pos) end
    local b = s:byte(pos)
    if not b then return "" end
    local length = b < 128 and 1 or b < 224 and 2 or b < 240 and 3 or 4
    return s:sub(pos, pos + length - 1)
end

local function previous(s, pos)
    pos = pos - 1
    if #"Я" ~= 1 then while pos > 0 and s:byte(pos) >= 128 and s:byte(pos) < 192 do pos = pos - 1 end end
    return pos > 0 and charAt(s, pos) or ""
end

local function word(c)
    return c ~= "" and (c:match("^[a-z0-9_]$") ~= nil or ("абвгдеёжзийклмнопрстуфхцчшщъыьэюя"):find(c, 1, true))
end

local function termsIn(text)
    text = tostring(text or "")
    local out, seen = {}, {}
    local function scan(chunk)
        local folded, matches = fold(plain(chunk)), {}
        for priority, entry in ipairs(candidates) do
            for _, alias in ipairs(entry.aliases) do
                alias = foldedAliases[alias]
                local pos = 1
                while alias ~= "" and pos <= #folded do
                    local a, b = folded:find(alias, pos, true)
                    if not a then break end
                    if not word(previous(folded, a)) and not word(charAt(folded, b + 1)) then
                        matches[#matches + 1] = {a = a, b = b, entry = entry, priority = priority}
                    end
                    pos = b + 1
                end
            end
        end
        table.sort(matches, function(a, b)
            if a.a ~= b.a then return a.a < b.a end
            if a.b ~= b.b then return a.b > b.b end
            return a.priority < b.priority
        end)
        local finish = 0
        for _, match in ipairs(matches) do
            if match.a > finish then
                finish = match.b
                local e = match.entry
                if not seen[e.key] and #out < 8 then
                    seen[e.key] = true
                    out[#out + 1] = {key = e.key, label = e.title}
                end
            end
        end
    end
    local pos = 1
    while true do
        local a = text:find("<b>", pos, true)
        local b = a and text:find("</b>", a + 3, true)
        if not b then break end
        scan(text:sub(a + 3, b - 1)); pos = b + 4
    end
    scan(text)
    return out
end

local function ruleName(raw)
    local s = ruTrim(raw)
    local wrappers = {['*'] = true, ["'"] = true, ['"'] = true}
    while wrappers[s:sub(1, 1)] do s = s:sub(2) end
    while wrappers[s:sub(-1)] do s = s:sub(1, -2) end
    return ruTrim(s:gsub("%s+[xX]$", ""))
end

local function matchTrait(wr, name)
    name = ruleName(name):lower()
    if name == "" then return false end
    for part in ruDelimited(wr, ",") do
        part = ruReplace(ruReplace(ruleName(part), "″", '"'), "”", '"'):lower()
        local candidate = part:gsub('^%d+"%s+', "")
        if candidate == name or (candidate:sub(1, #name) == name and candidate:sub(#name + 1, #name + 1):match("[^a-z]")) then
            if not (name == "seek" and part:find("seek light", 1, true))
                and not (name == "piercing" and part:find("piercing crits", 1, true)) then return part end
        end
    end
    return false
end

local function findTeam(info)
    if ruReferenceTeams[key(info.ktRuTeam)] then return key(info.ktRuTeam) end
    for _, category in ipairs(info.categories or {}) do
        local k = key(category)
        if ruReferenceTeams[k] then return k end
        for t, v in pairs(ruReferenceTeams) do if key(v.name:gsub("s$", "")) == k then return t end end
    end
end

local function customRules(ctx)
    local unique = {}
    for name, text in pairs(ctx.rules or {}) do
        local id = key(ruleName(name))
        local score = (name:find("*", 1, true) and 1 or 0) + (name:match("%s+[xX]$") and 1 or 0)
        if type(text) == "string" and (not unique[id] or score < unique[id].score) then
            unique[id] = {name = name, text = ruCleanRuleText(text), score = score, key = "saved:" .. ctx.identity .. ":" .. name}
        end
    end
    local team = ctx.currentEdition and ruReferenceTeams[ctx.team]
    if team then
        for name, text in pairs(team.rules or {}) do
            unique[key(ruleName(name))] = {name = name, text = text, score = -1, key = "named:" .. ctx.team .. ":" .. name}
        end
    end
    if ctx.currentEdition then
        for _, name in ipairs(sharedNames) do
            local id = key(ruleName(name))
            if not unique[id] and matchTrait(ctx.weaponRules, name) then
                unique[id] = {name = name, text = ruReferenceShared[name], score = -2, key = "shared:" .. name}
            end
        end
    end
    local out = {}
    for _, e in pairs(unique) do
        register(e.key, display(e.name), e.name, e.text)
        out[#out + 1] = e
    end
    table.sort(out, function(a, b) return a.name < b.name end)
    return out
end

local function rulesForProfile(ctx, w)
    local out, wr = {}, tostring(w.wr or "")
    for _, entry in ipairs(ruReferenceCommon) do
        local matched = ctx.currentEdition and matchTrait(wr, entry.english)
        if matched then
            local e = copy(entry)
            e.key = commonKeys[key(e.english)]
            local parameter = matched:gsub('^%d+"%s+', ""):sub(#entry.english + 1):match('^%s*(%d+%+?"?)')
            if parameter and e.title:find("x", 1, true) then
                e.title = e.title:gsub("x%+", parameter):gsub("x", parameter)
                e.text = "<b>Значение x для этого профиля: " .. parameter .. ".</b>\n\n" .. e.text
            end
            local radius = matched:match('^(%d+)"%s+')
            if radius then e.text = "<b>Радиус для этого профиля: " .. radius .. "″.</b>\n\n" .. e.text end
            if entry.english == "Heavy" then
                local restriction = matched:match("%((.-)%)")
                if restriction then
                    local label = restriction == "dash only" and "только Рывок (Dash)"
                        or restriction == "reposition only" and "только Перемещение (Reposition)" or restriction
                    e.text = "<b>Для этого профиля: " .. label .. ".</b>\n\n" .. e.text
                end
            end
            out[#out + 1] = e
        end
    end
    for _, saved in ipairs(ctx.custom) do
        local clean = ruleName(saved.name)
        if (not ctx.currentEdition or not commonKeys[key(clean)]) and matchTrait(wr, clean) then
            out[#out + 1] = {key = saved.key, title = ruDisplayName(saved.name), english = saved.name, text = saved.text}
        end
    end
    table.sort(out, function(a, b) return a.english < b.english end)
    return out
end

local function shortTip(text)
    local chars = KT.chars(plain(text))
    if #chars <= 300 then return table.concat(chars) end
    return table.concat(chars, "", 1, 299) .. "…"
end

local function traits(ctx, w)
    local out, selected = {}, rulesForProfile(ctx, w)
    for token in ruDelimited(w.wr, ",") do
        token = ruTrim(token)
        if token ~= "" and token ~= "-" and token ~= "—" then
            local chosen
            for _, e in ipairs(selected) do if matchTrait(token, e.english) then chosen = e; break end end
            if not chosen then
                local found = termsIn(token)
                if found[1] then chosen = documents[found[1].key] end
            end
            out[#out + 1] = {
                label = chosen and display(chosen.title) or display(token), key = chosen and chosen.key or nil,
                tip = chosen and shortTip(chosen.text or chosen.body) or nil,
            }
        end
    end
    return out
end

local function buildContext(color, state, operative)
    local info, stats = state.info or {}, state.stats or (state.info or {}).stats or {}
    local english = info.name or extractOperativeName(operative.getName())
    local ctx = {
        team = findTeam(info), currentEdition = info.ktRuTeam ~= nil, rules = info.rules or {}, entries = {},
        identity = operative.getGUID and operative.getGUID() or tostring(color or "model"),
        state = state, object = operative, weaponRules = "", name = ruDisplayName(english),
    }
    ctx.weapons = parseWeapons(cleanDescription(operative.getDescription()))
    for _, w in ipairs(info.weapons or {}) do ctx.weaponRules = ctx.weaponRules .. "," .. ((w.stats or {}).WR or "") end
    for _, w in ipairs(ctx.weapons) do ctx.weaponRules = ctx.weaponRules .. "," .. w.wr end
    ctx.custom = customRules(ctx)
    local team = ruReferenceTeams[ctx.team]
    local maxWounds = stats.Wounds or stats.W or ""
    local wounds = maxWounds
    if tonumber(state.wounds) and tonumber(maxWounds) and tonumber(state.wounds) < tonumber(maxWounds) then
        wounds = tostring(state.wounds) .. "/" .. tostring(maxWounds)
    end
    local vm = {
        color = color, guid = "efa3fe", name = display(english), english = english,
        team = team and display(team.label) or nil, apl = stats.APL or "",
        move = tostring(stats.Move or stats.M or ""):gsub('"$', "") .. '"',
        save = tostring(stats.Save or stats.SV or ""):gsub("%+$", "") .. "+", wounds = wounds, weapons = {}, abilities = {},
    }
    for i, w in ipairs(ctx.weapons) do
        vm.weapons[#vm.weapons + 1] = {
            index = i, name = display(w.name), kind = w.type == "R" and "ranged" or "melee",
            a = w.atk, bs = w.hit, d = w.dmg, traits = traits(ctx, w),
        }
    end
    local seen, abilityData = {}, {abilities = {}, actions = {}}
    local function add(raw, kind)
        local name, ap = raw.name or "Особое правило", nil
        if kind == "actions" then
            local clean, cost = name:match("^(.-)%s*%(([%d/]+)AP%)$")
            if not clean then clean, cost = name:match("^(.-)%s*%(AP(%d+)%)$") end
            name, ap = clean or name, (cost or "1") .. " AP"
        end
        local body = ruCleanRuleText(raw.text)
        local identity = name .. "\n" .. body
        if kind == "extra" and seen[identity] then return end
        seen[identity] = true
        local title = display(name)
        local e = {title = title, english = name, cost = ap, body = body}
        vm.abilities[#vm.abilities + 1] = e
        local id = "model:" .. ctx.identity .. ":" .. #vm.abilities
        register(id, title, name, body)
        ctx.entries[#ctx.entries + 1] = {key = id, title = title, english = name, cost = ap, body = body}
        local target = kind == "actions" and abilityData.actions or abilityData.abilities
        target[#target + 1] = {name = name, apCost = ap, description = body, abilityActionDescriptionPresent = body ~= ""}
    end
    for _, kind in ipairs({"abilities", "actions"}) do for _, e in ipairs(info[kind] or {}) do add(e, kind) end end
    local extra = {}
    local function collect(v)
        if type(v) ~= "table" then return end
        if type(v.text) == "string" and v.text ~= "" then extra[#extra + 1] = v end
        for _, child in pairs(v) do if type(child) == "table" then collect(child) end end
    end
    collect(info.special); collect(info.psychic)
    table.sort(extra, function(a, b) return (a.name or "") < (b.name or "") end)
    for _, e in ipairs(extra) do add(e, "extra") end
    abilityData.abilityCount, abilityData.actionCount = #abilityData.abilities, #abilityData.actions
    ctx.vm, ctx.abilityData = vm, abilityData
    return ctx
end

function ruRememberOperative(color, state, operative)
    RuReferenceCache[color] = buildContext(color, state or {}, operative)
end

function ruRulesForProfile(color, w)
    local ctx = RuReferenceCache[color]
    return ctx and rulesForProfile(ctx, w) or {}
end

function ruWeaponTooltip(color, w)
    local parts = {}
    for _, e in ipairs(ruRulesForProfile(color, w)) do parts[#parts + 1] = e.title .. "\n" .. plain(e.text) end
    return #parts > 0 and table.concat(parts, "\n\n") or "У этого профиля нет сохранённых определений правил."
end

local scopes = {{"model", "Модель"}, {"weapon", "Оружие"}, {"team", "Отряд"},
    {"ploy", "Уловки"}, {"eq", "Снаряжение"}, {"faq", "FAQ"}}

local function article(entry, team)
    local out = copy(entry)
    out.key, out.aliases, out.text = nil, nil, nil
    out.label, out.team = out.label or "Справка", team and display(team.label) or out.team
    out.body = entry.body or entry.text or ""
    out.terms = termsIn(out.body)
    return out
end

local function query(p)
    local ctx = RuReferenceCache[p.color]
    if p.guid then
        local object = getObjectFromGUID(p.guid)
        if not object then return {scopes = copy(scopes), results = {}, count = 0} end
        ctx = buildContext(p.color, object.getTable("state") or {}, object)
    end
    local teamKey = p.team and key(p.team) or ctx and ctx.team
    local team, scope, items = ruReferenceTeams[teamKey], p.scope or "model", {}
    local function push(e) items[#items + 1] = e end
    if scope == "model" and ctx then
        local vm, bodies = ctx.vm, {}
        for _, e in ipairs(vm.abilities) do bodies[#bodies + 1] = "<b>" .. e.title .. "</b>\n" .. e.body end
        push({key = "operative:" .. ctx.identity, label = "Модель", title = vm.name, english = vm.english,
            body = #bodies > 0 and table.concat(bodies, "\n\n") or "У модели нет дополнительных способностей.",
            weapons = copy(vm.weapons), abilities = copy(vm.abilities)})
        for _, e in ipairs(ctx.entries) do if e.body ~= "" then push(e) end end
    elseif scope == "weapon" then
        if ctx then
            local seen = {}
            for i, w in ipairs(ctx.weapons) do
                local definitions, bodies = rulesForProfile(ctx, w), {}
                for _, e in ipairs(definitions) do bodies[#bodies + 1] = e.title .. "\n" .. e.text end
                local vm = ctx.vm.weapons[i]
                push({key = "profile:" .. ctx.identity .. ":" .. i, label = "Оружие", title = vm.name, english = w.name,
                    body = "A " .. w.atk .. " · BS " .. w.hit .. " · D " .. w.dmg .. "\nWR: " .. w.wr
                        .. (#bodies > 0 and ("\n\n" .. table.concat(bodies, "\n\n")) or ""), weapons = {copy(vm)}})
                for _, e in ipairs(definitions) do
                    if not seen[e.key] then push(documents[e.key]); seen[e.key] = true end
                end
            end
        else
            for _, e in ipairs(ruReferenceCommon) do push(documents[commonKeys[key(e.english)]]) end
        end
    else
        if team then
            for _, e in ipairs(team.entries) do
                if e.category == (scope == "eq" and "equipment" or scope) then push(documents["team:" .. teamKey .. ":" .. e.id]) end
            end
        end
        if scope == "eq" then for _, e in ipairs(ruReferenceEquipment) do push(documents["equipment:" .. e.id]) end end
    end
    local q, matched = ruTrim(fold(p.query)), {}
    for i, e in ipairs(items) do
        local titleMatch = q == "" or fold(e.title .. " " .. (e.english or "")):find(q, 1, true) ~= nil
        if titleMatch or fold(plain(e.body)):find(q, 1, true) then
            matched[#matched + 1] = {entry = e, titleMatch = titleMatch, index = i}
        end
    end
    table.sort(matched, function(a, b)
        if a.titleMatch ~= b.titleMatch then return a.titleMatch end
        return a.index < b.index
    end)
    local result = {scopes = copy(scopes), results = {}, count = #matched}
    for i = 1, math.min(60, #matched) do
        local e = matched[i].entry
        result.results[#result.results + 1] = {key = e.key, title = e.title, english = e.english}
    end
    local selected
    if p.key then for _, e in ipairs(items) do if e.key == p.key then selected = e; break end end
    elseif matched[1] then selected = matched[1].entry end
    if selected then result.article = article(selected, team) end
    return result
end

local function safe(fn, p, fallback)
    local ok, result = pcall(fn, p or {})
    return ok and type(result) == "table" and result or fallback or {}
end

function ruRefQuery(p) return safe(query, p, {scopes = copy(scopes), results = {}, count = 0}) end
function ruRefTerm(p)
    return safe(function(args)
        local e = documents[args.key]
        return e and {title = e.title, english = e.english, body = e.body} or {}
    end, p)
end
function ruRefTermsIn(p) return safe(function(args) return termsIn(args.text) end, p) end
function ruRefTeamRules(p)
    return safe(function(args)
        local teamKey, out = key(args.team), {}
        local team = ruReferenceTeams[teamKey]
        for _, e in ipairs(team and team.entries or {}) do
            if e.category == "team" then
                local id = "team:" .. teamKey .. ":" .. e.id
                out[#out + 1] = {key = id, title = e.title, english = e.english, body = e.text, terms = termsIn(e.text)}
            end
        end
        return out
    end, p)
end

local legacyPloys = {}
function ruLoadPloys(saved)
    legacyPloys = {}
    local ok, value = pcall(function() return type(saved) == "table" and saved or JSON.decode(saved or "") end)
    if ok and type(value) == "table" and value.ruPloysVersion == 1 and type(value.seats) == "table" then
        legacyPloys = copy(value)
    end
end
function ruRefLegacyPloys() return safe(function() return copy(legacyPloys) end) end
function onSave() return JSON.encode(next(legacyPloys) and legacyPloys or {ruPloysVersion = 1, seats = {}}) end

function R.hub(method, params)
    pcall(function()
        local board = getObjectFromGUID("339b7f")
        if board then board.call(method, params or {}) end
    end)
end
function ruOpenPloys(p) R.hub("ruHubOpen", {color = p and p.color, tab = "ploys"}) end
function ruOpenPloysUI(player) ruOpenPloys({color = player and player.color}) end
function ruPloysRoundEnd() R.hub("ruHubRoundEnd", {}) end
function ruAssistantRead(p) R.hub("ruHubOpen", {color = p and p.color, tab = "ref"}) end

-- Original builder hooks remain callable, but the replacement datasheet never uses them.
local function emptyPanel() return {tag = "Panel", attributes = {active = "false"}} end
function ruBuildReferenceLauncher(...) return emptyPanel() end
function ruBuildWeaponReferenceButton(...) return emptyPanel() end
function ruBuildCompactRuleGrid(...) return emptyPanel(), 0 end
function ruSetCompactRuleTitle(...) end

function ruOpenReference(player, value, id)
    local color = tostring(id or ""):match("_([A-Za-z]+)$")
    if player and player.color == color then
        local scope = tostring(id):match("^ruOpen_([a-z]+)_") or "model"
        R.hub("ruHubOpen", {color = color, tab = "ref", refScope = scope == "equipment" and "eq" or scope})
    end
end
function ruOpenWeaponReference(player, value, id)
    local color = tostring(id or ""):match("_([A-Za-z]+)$")
    if player and player.color == color then R.hub("ruHubOpen", {color = color, tab = "ref", refScope = "weapon"}) end
end

R.buildContext, R.plain, R.fold, R.display = buildContext, plain, fold, display
