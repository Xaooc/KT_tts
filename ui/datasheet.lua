do -- module scope: keeps this module's locals out of the object's main chunk (Lua allows 200 locals per function)
KT.handler = "ruDsClick"
-- R HUD lifecycle. Composer ownership isolates every seat from the hub and other HUDs.
local scenes, pending, awaiting, revisions = {}, {}, {}, {}

local function loading()
    local ok, value = pcall(function() return Global.call("ruUiLoading") end)
    return ok and value == true
end

function ruDeferOperative(params)
    if not loading() then return false end
    local color = params[2]
    pending[color] = params
    if not awaiting[color] then
        awaiting[color] = true
        Wait.condition(function()
            awaiting[color] = nil
            local latest = pending[color]
            pending[color] = nil
            if latest then onOperativeRandomize(latest) end
        end, function() return not loading() end)
    end
    return true
end

local function mount(color)
    local vm = scenes[color]
    if not vm then return end
    if loading() then
        local revision = revisions[color]
        Wait.condition(function() if revisions[color] == revision then mount(color) end end, function() return not loading() end)
        return
    end
    Global.call("ruUiMount", {owner = "datasheet:" .. color, nodes = {KT.ds.view(vm)}})
    local ctx = RuReferenceCache[color]
    if ctx then KT.ref.hub("ruAssistantFocus", {color = color, guid = ctx.identity}) end
end

function onOperativeRandomize(params)
    local operative, color = params[1], params[2]
    if not operative or not KT.ref.player(color) or not operative.hasTag("Operative") then return end
    if ruDeferOperative(params) then return end
    ruRememberOperative(color, operative.getTable("state") or {}, operative)
    local ctx = RuReferenceCache[color]
    WeaponCache[color] = {
        operative = extractOperativeName(operative.getName()),
        stats = {apl = ctx.vm.apl, move = ctx.vm.move, save = ctx.vm.save,
            wounds = (ctx.state.stats or {}).Wounds or (ctx.state.stats or {}).W or ""},
        weapons = ctx.weapons,
    }
    AbilityActionCache[color] = ctx.abilityData
    scenes[color] = ctx.vm
    revisions[color] = (revisions[color] or 0) + 1
    mount(color)
end

function createDatasheetHUD(color, suffix, weaponCount, abilityCount, actionCount) mount(color) end

function updateDatasheetHUD(color, data)
    local vm = scenes[color]
    if not vm then return end
    for _, field in ipairs({"name", "apl", "move", "save", "wounds"}) do
        if data and data[field] ~= nil then vm[field] = field == "name" and KT.ref.display(data[field]) or data[field] end
    end
    mount(color)
end

function deleteDatasheetHUD(player, value)
    local color = type(player) == "string" and player or player and player.color
    if not color then return end
    pending[color] = nil
    revisions[color] = (revisions[color] or 0) + 1
    Global.call("ruUiUnmount", {owner = "datasheet:" .. color})
end

function closePlayerDatasheetHUD(player, value, id)
    local color = tostring(id or ""):match("^closeButton_([A-Za-z]+)$")
    if player and player.color == color then deleteDatasheetHUD(color) end
end

function refreshDatasheetHUD(player)
    local color = type(player) == "string" and player or player and player.color
    local ctx = color and RuReferenceCache[color]
    if ctx and ctx.object then onOperativeRandomize({ctx.object, color}) end
end

function refreshDatasheetHUDAll()
    for color in pairs(scenes) do refreshDatasheetHUD(color) end
end

function ensureDatasheetHUD(color) mount(color) end

function ruDsClick(player, value, id)
    local color, command, arg = tostring(id or ""):match("^kd:([A-Za-z]+):([a-z]+):?(.*)$")
    if not player or not KT.ref.player(color) or player.color ~= color or not scenes[color] then return end
    if command == "close" then deleteDatasheetHUD(color)
    elseif command == "openref" then KT.ref.hub("ruHubOpen", {color = color, tab = "ref", refScope = "model"})
    elseif command == "trait" then
        local i, j = arg:match("^(%d+):(%d+)$")
        local weapon = scenes[color].weapons[tonumber(i)]
        local trait = weapon and weapon.traits[tonumber(j)]
        if trait and trait.key then KT.ref.hub("ruHubOpen", {color = color, tab = "ref", termKey = trait.key}) end
    end
end
end
