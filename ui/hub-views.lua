-- KT hub views: pure functions view-model -> XmlUI nodes. No game state is read here.
-- The shell (ui/hub-shell.lua) builds the view-model (contract documented above each view) and mounts the result.
-- Click ids: "kh:<color>:<cmd>[:<arg>]"; every interactive element routes to KT.handler (ruHubClick).
KT.hub = KT.hub or {}
local H = KT.hub
local c, fs = KT.c, KT.fs

H.geo = {
    x = 12, y = 52, h = 760, rail = 64, panel = 388, wide = 900,
    head = 112, foot = 64, pad = 16, scrollbar = 10,
}
local G = H.geo

function H.id(color, cmd, arg)
    return "kh:" .. color .. ":" .. cmd .. (arg ~= nil and (":" .. tostring(arg)) or "")
end

local function inner(panelW) return panelW - G.scrollbar - G.pad * 2 end

local function btn(color, cmd, arg, label, o)
    o = o or {}
    o.id = H.id(color, cmd, arg)
    return KT.button(label, o)
end

------------------------------------------------------------------------------------------------------------------------
-- Status header
-- vm.status = { eyebrow = "РАУНД 2 / 4 · ПЕРЕСТРЕЛКА", sides = { {name, colorKey="Red", cp, vp, turn=bool}, {...} } }
------------------------------------------------------------------------------------------------------------------------
-- "Круг Иеротек (Hierotek Circle)" -> "Круг Иеротек" for tight headers.
function H.shortName(name)
    if not name then return nil end
    local cut = name:find(" (", 1, true)
    return cut and cut > 1 and name:sub(1, cut - 1) or name
end

local function side(s, w, color, idx)
    local turn = s.turn == true
    local base = H.id(color, "side", idx)
    local iw = w - 4 - 8 - 8
    local flagW = turn and 34 or 0
    local nameRow = KT.hstack({
        KT.node("Text", { id = base .. "_name", text = H.shortName(s.name) or "—", fontSize = "12", fontStyle = "Bold", color = c.fg,
            alignment = "MiddleLeft", preferredWidth = tostring(iw - flagW), horizontalOverflow = "Wrap",
            verticalOverflow = "Truncate", raycastTarget = "false" }),
        (turn and KT.chip("ХОД", "acc", { size = 9, h = 15 }) or nil),
    }, { h = 16, gap = 4 })
    local nums = KT.node("Text", { id = base .. "_score",
        text = tostring(s.cp or 0) .. " <size=10><color=" .. c.muted .. ">CP</color></size>   " .. tostring(s.vp or 0)
            .. " <size=10><color=" .. c.muted .. ">VP</color></size>",
        fontSize = "14", fontStyle = "Bold", color = c.fg, alignment = "MiddleLeft", preferredHeight = "18", raycastTarget = "false" })
    return KT.hstack({
        KT.stripe(c[s.colorKey] or c.muted, 4),
        KT.vstack({ nameRow, nums }, { gap = 2, w = iw, pad = { 0, 0, 5, 5 } }),
    }, { h = 46, gap = 8, pad = { 0, 8, 0, 0 }, bg = turn and c.accentLo or c.s1, outline = turn and c.accent or c.line,
        id = base, w = w })
end

function H.head(vm, w)
    local st = vm.status or {}
    local iw = w - G.pad * 2
    local top = KT.hstack({
        KT.node("Text", { id = H.id(vm.color, "eyebrow"), text = st.eyebrow or "KILL TEAM", fontSize = "12", fontStyle = "Bold",
            color = c.accent, alignment = "MiddleLeft", flexibleWidth = "1", raycastTarget = "false" }),
        btn(vm.color, "collapse", nil, "‹", { kind = "secondary", w = 28, h = 28, size = 14 }),
    }, { h = 28, gap = 8 })
    local sides = {}
    for i, s in ipairs(st.sides or {}) do sides[#sides + 1] = side(s, (iw - 6) / 2, vm.color, i) end
    return KT.vstack({
        top,
        #sides > 0 and KT.hstack(sides, { h = 46, gap = 6 }) or nil,
    }, { w = w, pad = { G.pad, G.pad, 14, 12 }, gap = 10, bg = c.bg, h = G.head })
end

------------------------------------------------------------------------------------------------------------------------
-- Shared row / unit pieces
------------------------------------------------------------------------------------------------------------------------
local ORDER = { Engage = { "БОЙ", "neutral" }, Conceal = { "СКРЫТНОСТЬ", "mute" } }
local STATE = {
    ready = { "ГОТОВ", "ok", c.ok }, used = { "ИСПОЛЬЗОВАН", "mute", c.s3 }, active = { "АКТИВЕН", "acc", c.accent },
    down = { "ВЫВЕДЕН", "hurt", c.hurt }, guard = { "ОХРАНА", "acc", c.warn },
}
H.ORDER, H.STATE = ORDER, STATE

local function unitChips(u, w)
    local list = {}
    local o = ORDER[u.order]
    if o then list[#list + 1] = { o[1], o[2] } end
    local s = STATE[u.state]
    if s then list[#list + 1] = { s[1], s[2] } end
    if u.injured and u.state ~= "down" then list[#list + 1] = { "РАНЕН", "hurt" } end
    return KT.chips(list, w)
end

-- u = { guid, name, wounds, maxWounds, order, state, injured, canActivate }
-- opts = { color, cmd (row click), actionCmd, actionLabel, stripeReady (colour for ready stripe), readOnly }
local function unitRow(u, w, o)
    local base = H.id(o.color, o.cmd, u.guid)
    local actionW = (o.actionLabel and u.canActivate) and (12 + 64) or 0
    local mainW = w - 3 - 12 - 12 - actionW      -- stripe, gap, right padding, optional action column
    local barW = mainW - 8 - 50
    local stripe = u.state == "active" and c.accent or u.state == "ready" and (o.stripeReady or c.ok)
        or u.state == "down" and c.hurt or c.s3
    local nameColor = (u.state == "used" or u.state == "down") and c.muted or c.fg
    local main = KT.vstack({
        KT.text(u.name, { w = mainW, size = fs.m, bold = true, color = nameColor, lines = 1, id = base .. "_n" }),
        KT.hstack({
            KT.bar(u.wounds or 0, u.maxWounds or 1, { w = barW, h = 6, id = base .. "_bar" }),
            KT.node("Text", { id = base .. "_w", text = tostring(u.wounds or 0) .. "/" .. tostring(u.maxWounds or 0),
                fontSize = "12", fontStyle = "Bold", color = c.fg, alignment = "MiddleRight", preferredWidth = "50",
                raycastTarget = "false" }),
        }, { h = 16, gap = 8 }),
        unitChips(u, mainW),
    }, { gap = 5, flex = 1 })
    local kids = { KT.stripe(stripe, 3), main }
    if o.actionLabel and u.canActivate then
        kids[#kids + 1] = KT.vstack({ btn(o.color, o.actionCmd, u.guid, o.actionLabel, { w = 64, h = 30, size = 12 }) },
            { w = 64, align = "MiddleCenter" })
    end
    local row = KT.hstack(kids, { gap = 12, pad = { 0, 12, 10, 10 }, bg = c.s2, outline = c.line, stretch = true })
    -- Whole-row click target behind the content.
    return KT.node("Panel", { preferredHeight = tostring(KT.prefH(row)), color = c.clear }, {
        KT.node("Button", { id = base, onClick = KT.clickTarget(), colors = c.s2 .. "|" .. c.s3 .. "|" .. c.s3 .. "|" .. c.s2,
            outline = c.line, outlineSize = "1 1", text = "" }),
        (function() row.attributes.color = c.clear; row.attributes.outline = nil; return row end)(),
    })
end
H.unitRow = unitRow

------------------------------------------------------------------------------------------------------------------------
-- Tab: Ход (turn)
-- vm.turn.mode: "setup" | "activation" | "idle" | "enemy" | "phase" | "spectator" | "over"
--   setup  = { isHost, round, phaseLabels={...}, phaseIndex, turnLabels={...}, turnIndex, canStart, hint }
--   activation = { unit={name,english,order,state,apl,move,save,wounds,maxWounds}, apTotal, apLeft,
--       orderLocked, weapons={{key,name,english,kind,a,bs,d,selected,tip}}, actions={{key,label,cost,state,tip}},
--       pending={label, weapon}|nil, effects={{id,title,expiry}}, counteract=bool, unavailable=bool,
--       advanced={open, cost, apLimit, exception} }
--   idle   = { turnOwnerName, myTurn, ready={units...}, counter={units...} (for counteract), canPass }
--   enemy  = { who, unitName, action, hint }
--   phase  = { title, text, buttons={{cmd,arg,label,kind,enabled}} }
-- vm.turn.foot = { {cmd,arg,label,kind,enabled,flex} ... }
------------------------------------------------------------------------------------------------------------------------
local function weaponRow(color, wp, w)
    local base = H.id(color, "weapon", wp.key)
    local statText = "<b>" .. tostring(wp.a) .. "</b> A  ·  <b>" .. tostring(wp.bs) .. "</b>  ·  <b>" .. tostring(wp.d) .. "</b>"
    local statW = math.ceil(KT.textWidth(KT.stripTags(statText), 12, true)) + 8
    local iconW = math.ceil(13 * (KT.iconRatio[wp.kind == "melee" and "MELEE" or "RANGED"] or 1))
    local nameW = w - 20 - 3 * 10 - iconW - statW - 22 - 2
    local row = KT.hstack({
        KT.icon(wp.kind == "melee" and "MELEE" or "RANGED", 13),
        KT.vstack({
            KT.text(wp.name, { w = nameW, size = 13, bold = true, lines = 2 }),
            wp.english and KT.text(wp.english, { w = nameW, size = fs.xs, color = c.muted, lines = 1 }) or nil,
        }, { gap = 2, flex = 1 }),
        KT.node("Text", { text = statText, fontSize = "12", color = c.muted, alignment = "MiddleRight",
            preferredWidth = tostring(statW), minWidth = tostring(statW), raycastTarget = "false" }),
        btn(color, "trait", wp.key, "?", { w = 22, h = 22, size = 11, tooltip = wp.tip }),
    }, { gap = 10, pad = { 10, 10, 8, 8 } })
    local on = wp.selected == true
    return KT.node("Panel", { preferredHeight = tostring(KT.prefH(row)), color = c.clear }, {
        KT.node("Button", { id = base, onClick = KT.clickTarget(), text = "",
            colors = on and (c.s3 .. "|" .. c.s3 .. "|" .. c.s3 .. "|" .. c.s3) or (c.s1 .. "|" .. c.s2 .. "|" .. c.s3 .. "|" .. c.s1),
            outline = on and c.accent or c.line, outlineSize = "1 1" }),
        row,
    })
end

local function actionTile(color, a)
    local enabled = a.state == "available"
    local done = a.state == "done"
    local costColor = done and c.ok or enabled and c.accentHi or c.dim
    local cost = tostring(a.cost) .. " AP"
    return KT.node("Panel", { preferredHeight = "44", flexibleWidth = "1", color = c.clear }, {
        KT.node("Button", { id = H.id(color, "action", a.key), onClick = enabled and KT.clickTarget() or nil,
            interactable = enabled and "true" or "false", text = "",
            colors = c.s2 .. "|" .. c.s3 .. "|" .. "#343C44" .. "|" .. c.s1, outline = c.line, outlineSize = "1 1",
            tooltip = a.tip or (done and "Выполнено в этой активации" or nil), tooltipPosition = "Right" }),
        KT.hstack({
            KT.stripe(done and c.ok or c.clear, 3),
            KT.node("Text", { text = a.label, fontSize = "13", fontStyle = "Bold", alignment = "MiddleLeft",
                color = enabled and c.fg or c.muted, flexibleWidth = "1", raycastTarget = "false" }),
            KT.node("Text", { text = cost, fontSize = "11", fontStyle = "Bold", alignment = "MiddleRight",
                color = costColor, preferredWidth = "40", raycastTarget = "false" }),
        }, { h = 44, gap = 8, pad = { 0, 10, 0, 0 } }),
    })
end

local function actionGrid(color, actions, w)
    local rows, row = {}, {}
    for _, a in ipairs(actions) do
        if a.wide then
            if #row > 0 then rows[#rows + 1] = KT.hstack(row, { h = 44, gap = 6 }); row = {} end
            rows[#rows + 1] = KT.hstack({ actionTile(color, a) }, { h = 44 })
        else
            row[#row + 1] = actionTile(color, a)
            if #row == 2 then rows[#rows + 1] = KT.hstack(row, { h = 44, gap = 6 }); row = {} end
        end
    end
    if #row > 0 then row[#row + 1] = KT.node("Panel", { flexibleWidth = "1", color = c.clear }); rows[#rows + 1] = KT.hstack(row, { h = 44, gap = 6 }) end
    return KT.vstack(rows, { w = w, gap = 6 })
end

local function unitCard(color, t, w)
    local u = t.unit
    local iw = w - 24
    local sw = math.floor((iw - 3) / 4)
    local stats = KT.hstack({
        KT.stat("APL", "APL", u.apl, { id = H.id(color, "stat", "apl"), w = sw }),
        KT.stat("MOVE", "MOVE", u.move, { w = sw }),
        KT.stat("SAVE", "SAVE", u.save, { w = sw }),
        KT.stat("WOUNDS", "WND", tostring(u.wounds) .. "<size=13><color=" .. c.muted .. ">/" .. tostring(u.maxWounds) .. "</color></size>",
            { id = H.id(color, "stat", "wnd"), w = iw - 3 - sw * 3 }),
    }, { h = 52, gap = 1, bg = c.line, outline = c.line })
    local apRow = KT.hstack({
        KT.node("Text", { text = "AP", fontSize = "12", fontStyle = "Bold", color = c.muted, preferredWidth = "22",
            alignment = "MiddleLeft", raycastTarget = "false" }),
        KT.pips(t.apTotal or 0, (t.apTotal or 0) - (t.apLeft or 0), { id = H.id(color, "pip") }),
        KT.node("Text", { id = H.id(color, "apleft"), text = "осталось " .. tostring(t.apLeft or 0) .. " из " .. tostring(t.apTotal or 0),
            fontSize = "13", fontStyle = "Bold", color = c.fg, alignment = "MiddleRight", flexibleWidth = "1", raycastTarget = "false" }),
    }, { h = 18, gap = 10 })
    return KT.card({
        KT.vstack({
            KT.text(u.name, { w = iw, size = fs.xl, bold = true }),
            u.english and KT.text(u.english, { w = iw, size = fs.s, color = c.muted }) or nil,
        }, { gap = 2, w = iw }),
        unitChips(u, iw),
        stats,
        KT.bar(u.wounds, u.maxWounds, { w = iw, h = 6, id = H.id(color, "wndbar") }),
        apRow,
    }, { w = w })
end

local function turnSetup(color, s, w)
    local list = {
        KT.text("Подключить помощника", { w = w, size = fs.xl, bold = true }),
        KT.text(s.hint or "Оба игрока занимают места табло. CP и очки остаются на табло. Если партия уже идёт, укажите текущий момент.",
            { w = w, size = fs.m, color = c.muted }),
    }
    if s.isHost then
        list[#list + 1] = KT.section("Раунд", w)
        local rounds = {}
        for i = 1, 4 do rounds[#rounds + 1] = { tostring(i), tostring(i) } end
        list[#list + 1] = KT.seg(rounds, tostring(s.round or 1), { prefix = H.id(color, "setupround") .. ":", w = w })
        list[#list + 1] = KT.section("Этап", w)
        for i, label in ipairs(s.phaseLabels or {}) do
            list[#list + 1] = btn(color, "setupphase", i, label, { kind = i == s.phaseIndex and "rowOn" or "row", h = 36,
                size = 13, align = "MiddleLeft", bold = i == s.phaseIndex })
        end
        if s.turnLabels and #s.turnLabels > 0 then
            list[#list + 1] = KT.section("Сейчас действует", w)
            local opts = {}
            for i, label in ipairs(s.turnLabels) do opts[#opts + 1] = { tostring(i), label } end
            list[#list + 1] = KT.seg(opts, tostring(s.turnIndex or 1), { prefix = H.id(color, "setupturn") .. ":", w = w })
        end
    else
        list[#list + 1] = KT.empty("Ждём ведущего", "Ведущий запускает помощника. Справочник и уловки уже доступны.", w)
    end
    return KT.vstack(list, { w = w, gap = 12 })
end

local function turnActivation(color, t, w)
    local list = { unitCard(color, t, w) }
    if t.unavailable then
        list[#list + 1] = KT.card({ KT.text("Оперативник выведен из строя или недоступен. Завершите действие и активацию.",
            { w = w - 24, size = fs.m, bold = true, color = c.hurt }) }, { w = w, bg = c.hurtLo, outline = c.hurt })
    end
    if t.counteract then
        list[#list + 1] = KT.card({ KT.text("Контрдействие: одно действие стоимостью 1 AP бесплатно. Перемещение не больше 2\".",
            { w = w - 24, size = fs.s, color = c.accentHi }) }, { w = w, bg = c.accentLo, outline = c.accent, pad = 10 })
    end
    if t.pending then
        list[#list + 1] = KT.card({
            KT.text("Идёт действие", { w = w - 24, size = fs.xs, bold = true, color = c.accentHi }),
            KT.text(t.pending.label .. (t.pending.weapon and (" · " .. t.pending.weapon) or ""), { w = w - 24, size = fs.l, bold = true }),
            KT.text("Ответные и атакующие уловки доступны сейчас во вкладке «Уловки».", { w = w - 24, size = fs.s, color = c.muted }),
        }, { w = w, bg = c.accentLo, outline = c.accent })
        return KT.vstack(list, { w = w, gap = 12 })
    end
    if not t.orderLocked then
        list[#list + 1] = KT.seg({ { "Engage", "Бой · Engage" }, { "Conceal", "Скрытность · Conceal" } }, t.unit.order,
            { prefix = H.id(color, "order") .. ":", w = w })
    end
    if t.weapons and #t.weapons > 0 then
        list[#list + 1] = KT.section("Оружие", w)
        for _, wp in ipairs(t.weapons) do list[#list + 1] = weaponRow(color, wp, w) end
    end
    list[#list + 1] = KT.section("Действия", w)
    list[#list + 1] = actionGrid(color, t.actions or {}, w)
    local adv = t.advanced or {}
    list[#list + 1] = btn(color, "advanced", nil, adv.open and "Скрыть особые правила AP" or "Особая стоимость AP или повтор действия…",
        { kind = "ghost", h = 30, size = 12, align = "MiddleLeft", bold = false })
    if adv.open then
        list[#list + 1] = KT.card({
            KT.text("Стоимость следующего действия", { w = w - 24, size = fs.s, color = c.muted }),
            KT.seg({ { "0", "0 AP" }, { "1", "1 AP" }, { "2", "2 AP" }, { "rule", "По правилу" } }, tostring(adv.cost or "rule"),
                { prefix = H.id(color, "advcost") .. ":", w = w - 24 }),
            KT.text("Лимит AP на активацию", { w = w - 24, size = fs.s, color = c.muted }),
            KT.seg({ { "1", "1" }, { "2", "2" }, { "3", "3" }, { "4", "4" } }, tostring(adv.apLimit or t.apTotal or 2),
                { prefix = H.id(color, "aplimit") .. ":", w = w - 24 }),
            btn(color, "advrepeat", nil, adv.exception and "Повтор действия разрешён правилом" or "Разрешить повтор действия по правилу",
                { kind = adv.exception and "rowOn" or "row", h = 34, size = 12 }),
        }, { w = w, pad = 12, gap = 8 })
    end
    list[#list + 1] = KT.section("Эффекты на модели", w)
    if t.effects and #t.effects > 0 then
        for _, e in ipairs(t.effects) do
            list[#list + 1] = KT.hstack({
                KT.vstack({
                    KT.text(e.title, { w = w - 110, size = 13, bold = true }),
                    KT.text(e.expiry or "", { w = w - 110, size = fs.xs, color = c.muted }),
                }, { gap = 2, flex = 1 }),
                btn(color, "removeeffect", e.id, "Снять", { w = 70, h = 28, size = 12 }),
            }, { gap = 10, pad = { 10, 10, 8, 8 }, bg = c.s1, outline = c.line })
        end
    else
        list[#list + 1] = KT.text("Нет отмеченных эффектов. Уловки с целью добавляют их автоматически.", { w = w, size = fs.s, color = c.dim })
    end
    return KT.vstack(list, { w = w, gap = 12 })
end

local function turnIdle(color, t, w)
    local list = {}
    if t.myTurn then
        list[#list + 1] = KT.text("Ваш ход", { w = w, size = fs.xl, bold = true })
        list[#list + 1] = KT.text("Выберите готового оперативника. Кнопка «Ход ›» начинает активацию.", { w = w, size = fs.m, color = c.muted })
        list[#list + 1] = KT.section("Готовы", w, #(t.ready or {}))
        if t.ready and #t.ready > 0 then
            for _, u in ipairs(t.ready) do
                list[#list + 1] = unitRow(u, w, { color = color, cmd = "select", actionCmd = "begin", actionLabel = "Ход ›" })
            end
        else
            list[#list + 1] = KT.empty("Готовых оперативников нет", "Можно выполнить контрдействие использованным оперативником.", w)
        end
        if t.counter and #t.counter > 0 then
            list[#list + 1] = KT.section("Контрдействие", w, #t.counter)
            for _, u in ipairs(t.counter) do
                list[#list + 1] = unitRow(u, w, { color = color, cmd = "select", actionCmd = "counter", actionLabel = "Контр ›" })
            end
        end
    else
        list[#list + 1] = KT.text("Ход соперника", { w = w, size = fs.xl, bold = true })
        list[#list + 1] = KT.text((t.turnOwnerName or "Соперник") .. " активирует оперативника. Ответные уловки доступны во вкладке «Уловки».",
            { w = w, size = fs.m, color = c.muted })
        if t.enemyUnit then
            list[#list + 1] = KT.card({
                KT.text("Сейчас действует", { w = w - 24, size = fs.xs, bold = true, color = c.muted }),
                KT.text(t.enemyUnit, { w = w - 24, size = fs.l, bold = true }),
                t.enemyAction and KT.text(t.enemyAction, { w = w - 24, size = fs.s, color = c.accentHi }) or nil,
            }, { w = w })
        end
    end
    return KT.vstack(list, { w = w, gap = 12 })
end

local function turnPhase(color, t, w)
    local list = {
        KT.text(t.title or "", { w = w, size = fs.xl, bold = true }),
        t.text and KT.text(t.text, { w = w, size = fs.m, color = c.muted }) or nil,
    }
    for _, b in ipairs(t.buttons or {}) do
        list[#list + 1] = btn(color, b.cmd, b.arg, b.label, { kind = b.kind or "secondary", h = 44, enabled = b.enabled })
    end
    if t.waiting then list[#list + 1] = KT.text(t.waiting, { w = w, size = fs.s, color = c.dim }) end
    return KT.vstack(list, { w = w, gap = 12 })
end

function H.viewTurn(vm, w)
    local t = vm.turn or {}
    if t.mode == "setup" then return turnSetup(vm.color, t, w) end
    if t.mode == "activation" then return turnActivation(vm.color, t, w) end
    if t.mode == "idle" then return turnIdle(vm.color, t, w) end
    if t.mode == "enemy" then
        return turnIdle(vm.color, { myTurn = false, turnOwnerName = t.who, enemyUnit = t.unitName, enemyAction = t.action }, w)
    end
    if t.mode == "phase" then return turnPhase(vm.color, t, w) end
    if t.mode == "spectator" then
        return KT.empty("Вы наблюдатель", "Справочник доступен всем. Ход и уловки доступны игрокам за табло.", w)
    end
    return KT.empty(t.title or "Партия завершена", t.text, w)
end

------------------------------------------------------------------------------------------------------------------------
-- Tab: Отряд (squad)
-- vm.squad = { team, summary, seg="all|ready|hurt", canEnroll, teamOptions={{key,label}}|nil (team picker when unset),
--              units={unit...}, emptyHint }
------------------------------------------------------------------------------------------------------------------------
function H.viewSquad(vm, w)
    local s = vm.squad or {}
    local color = vm.color
    local list = {
        KT.hstack({
            KT.vstack({
                KT.text(s.team or "Отряд не выбран", { w = w - 170, size = 18, bold = true }),
                s.summary and KT.text(s.summary, { w = w - 170, size = fs.s, color = c.muted }) or nil,
            }, { gap = 2, flex = 1 }),
            s.canEnroll ~= false and btn(color, "enroll", nil, "+ Добавить выделенные", { w = 160, h = 34, size = 12 }) or nil,
        }, { gap = 10, stretch = false, align = "MiddleLeft" }),
    }
    if s.teamOptions then
        list[#list + 1] = KT.section("Выберите свой отряд", w)
        for _, opt in ipairs(s.teamOptions) do
            list[#list + 1] = btn(color, "team", opt[1], opt[2], { kind = "row", h = 34, size = 13, align = "MiddleLeft" })
        end
        return KT.vstack(list, { w = w, gap = 10 })
    end
    list[#list + 1] = KT.seg({ { "all", "Все" }, { "ready", "Готовы" }, { "hurt", "Ранены" } }, s.seg or "all",
        { prefix = H.id(color, "squadseg") .. ":", w = w })
    if s.units and #s.units > 0 then
        for _, u in ipairs(s.units) do
            list[#list + 1] = unitRow(u, w, { color = color, cmd = "select", actionCmd = "begin", actionLabel = "Ход ›" })
        end
        list[#list + 1] = KT.text("Клик по карточке подсвечивает модель на столе. «Ход ›» сразу начинает активацию.",
            { w = w, size = fs.s, color = c.dim })
    else
        list[#list + 1] = KT.empty(s.emptyTitle or "Моделей пока нет",
            s.emptyHint or "Выделите свои модели на столе рамкой и нажмите «+ Добавить выделенные».", w)
    end
    return KT.vstack(list, { w = w, gap = 10 })
end

------------------------------------------------------------------------------------------------------------------------
-- Rule text with glossary chips (used by ploys, enemy rules and reference)
-- body: rich text (supports <b>); terms = {{key,label}} -> clickable chips below the text.
------------------------------------------------------------------------------------------------------------------------
function H.ruleBlock(color, body, terms, w, size)
    local list = { KT.text(body or "", { w = w, size = size or fs.m, color = "#D5DADD" }) }
    if terms and #terms > 0 then
        local row, rows, rowW = {}, {}, 0
        for _, t in ipairs(terms) do
            local label = t[2]
            local bw = math.ceil(KT.textWidth(label, 12, true) + 18)
            if #row > 0 and rowW + 6 + bw > w then rows[#rows + 1] = KT.hstack(row, { h = 26, gap = 6 }); row, rowW = {}, 0 end
            row[#row + 1] = btn(color, "term", t[1], label, { w = bw, h = 26, size = 12, kind = "secondary" })
            rowW = rowW + (rowW > 0 and 6 or 0) + bw
        end
        if #row > 0 then rows[#rows + 1] = KT.hstack(row, { h = 26, gap = 6 }) end
        list[#list + 1] = KT.text("Термины", { w = w, size = fs.xs, bold = true, color = c.muted })
        list[#list + 1] = KT.vstack(rows, { w = w, gap = 6 })
    end
    return KT.vstack(list, { w = w, gap = 8 })
end

------------------------------------------------------------------------------------------------------------------------
-- Tab: Уловки (ploys)
-- vm.ploys = { seg="strat|fire|pinned", query, cp, note, footNote,
--   items={{key,name,english,cost,used,pinned,open,usable,reason, body, terms, costEdit=bool,
--           expiry="round|action|manual"|nil, needsTarget=bool, targetName}} }
------------------------------------------------------------------------------------------------------------------------
local function ployRow(color, p, w)
    local chipsList = {}
    if p.used then chipsList[#chipsList + 1] = { "ПРИМЕНЕНА В РАУНДЕ", "ok" } end
    if p.pinned then chipsList[#chipsList + 1] = { "ЗАКРЕПЛЕНА", "acc" } end
    local costChip = KT.chip(tostring(p.cost or 1) .. " CP", "cost", { size = 12, h = 24 })
    local textW = w - 24 - 60
    local headRow = KT.hstack({
        KT.vstack({
            KT.text(p.name, { w = textW, size = fs.m, bold = true, color = p.used and c.muted or c.fg }),
            p.english and KT.text(p.english, { w = textW, size = fs.s, color = c.muted }) or nil,
            #chipsList > 0 and KT.chips(chipsList, textW) or nil,
        }, { gap = 4, flex = 1 }),
        KT.vstack({ costChip }, { w = 50, align = "UpperRight", stretch = false }),
    }, { gap = 10, stretch = false, align = "UpperLeft" })
    if not p.open then
        local inside = KT.vstack({ headRow }, { pad = 12 })
        return KT.node("Panel", { preferredHeight = tostring(KT.prefH(inside)), color = c.clear }, {
            KT.node("Button", { id = H.id(color, "ploy", p.key), onClick = KT.clickTarget(), text = "",
                colors = c.s2 .. "|" .. c.s3 .. "|" .. c.s3 .. "|" .. c.s2, outline = c.line, outlineSize = "1 1" }),
            inside,
        })
    end
    local iw = w - 24
    local list = { headRow, H.ruleBlock(color, p.body, p.terms, iw) }
    if p.expiry then
        list[#list + 1] = KT.text("Эффект действует", { w = iw, size = fs.xs, bold = true, color = c.muted })
        list[#list + 1] = KT.seg({ { "round", "До конца раунда" }, { "action", "До конца действия" }, { "manual", "Сниму сам" } },
            p.expiry, { prefix = H.id(color, "ployexpiry") .. ":", w = iw, h = 30 })
    end
    if p.needsTarget then
        list[#list + 1] = KT.text(p.targetGuid and "Цель" or "Выберите цель уловки", { w = iw, size = fs.xs, bold = true,
            color = p.targetGuid and c.muted or c.accentHi })
        local rows, row = {}, {}
        for _, t in ipairs(p.targets or {}) do
            local on = t.guid == p.targetGuid
            row[#row + 1] = btn(color, "ploytarget", t.guid, t.name, { kind = on and "rowOn" or "row", h = 32, size = 12, flex = 1,
                bold = on, enabled = t.state ~= "down" })
            if #row == 2 then rows[#rows + 1] = KT.hstack(row, { h = 32, gap = 6 }); row = {} end
        end
        if #row > 0 then
            row[#row + 1] = KT.node("Panel", { flexibleWidth = "1", color = c.clear })
            rows[#rows + 1] = KT.hstack(row, { h = 32, gap = 6 })
        end
        if #rows > 0 then list[#list + 1] = KT.vstack(rows, { w = iw, gap = 6 }) end
    end
    local apply = btn(color, "useploy", p.key, p.usable and ("Применить  −" .. tostring(p.cost or 1) .. " CP") or (p.reason or "Сейчас нельзя"),
        { kind = "primary", h = 40, flex = 1, enabled = p.usable })
    local row = { apply }
    if p.costEdit then
        row[#row + 1] = btn(color, "ploycost", "-", "−", { w = 34, h = 40 })
        row[#row + 1] = btn(color, "ploycost", "+", "+", { w = 34, h = 40 })
    end
    row[#row + 1] = btn(color, "pin", p.key, p.pinned and "Открепить" or "Закрепить", { w = 96, h = 40, size = 12 })
    list[#list + 1] = KT.hstack(row, { h = 40, gap = 6 })
    list[#list + 1] = btn(color, "ploy", p.key, "Свернуть", { kind = "ghost", h = 26, size = 12 })
    return KT.vstack(list, { w = w, pad = 12, gap = 10, bg = c.s2, outline = c.accent })
end

function H.viewPloys(vm, w)
    local p = vm.ploys or {}
    local color = vm.color
    local list = {
        KT.seg({ { "strat", "Стратегия" }, { "fire", "Перестрелка" }, { "pinned", "Закреплённые" } }, p.seg or "strat",
            { prefix = H.id(color, "ployseg") .. ":", w = w }),
        KT.search(H.id(color, "ploysearch"), p.query, "Найти уловку…", { w = w }),
    }
    if p.note then list[#list + 1] = KT.text(p.note, { w = w, size = fs.s, color = c.accentHi }) end
    if p.items and #p.items > 0 then
        for _, item in ipairs(p.items) do list[#list + 1] = ployRow(color, item, w) end
    else
        list[#list + 1] = KT.empty(p.emptyTitle or "Ничего не найдено", p.emptyHint, w)
    end
    if p.seg == "pinned" then
        list[#list + 1] = KT.text("Закреплённые остаются между раундами. Отметки «применена» сбрасываются в начале раунда.",
            { w = w, size = fs.s, color = c.dim })
    end
    return KT.vstack(list, { w = w, gap = 10 })
end

------------------------------------------------------------------------------------------------------------------------
-- Tab: Враг (enemy)
-- vm.enemy = { name, colorKey, sub, seg="ops|ploys|rules", units={...}, ploys={{key,name,english,cost,open,body,terms}},
--              rules={{key,title,english,body,terms,open}}, emptyHint }
------------------------------------------------------------------------------------------------------------------------
function H.viewEnemy(vm, w)
    local e = vm.enemy or {}
    local color = vm.color
    if not e.name then return KT.empty("Соперник не подключён", e.emptyHint or "Отряд соперника появится, когда он займёт место табло.", w) end
    local list = {
        KT.hstack({
            KT.stripe(c[e.colorKey] or c.muted, 4),
            KT.vstack({
                KT.text(e.name, { w = w - 14, size = 18, bold = true }),
                e.sub and KT.text(e.sub, { w = w - 14, size = fs.s, color = c.muted }) or nil,
            }, { gap = 2, flex = 1 }),
        }, { gap = 10 }),
        KT.seg({ { "ops", "Оперативники" }, { "ploys", "Уловки" }, { "rules", "Правила" } }, e.seg or "ops",
            { prefix = H.id(color, "enemyseg") .. ":", w = w }),
    }
    if (e.seg or "ops") == "ops" then
        if e.units and #e.units > 0 then
            for _, u in ipairs(e.units) do
                list[#list + 1] = unitRow(u, w, { color = color, cmd = "enemyunit", stripeReady = c[e.colorKey] or c.ok })
            end
            list[#list + 1] = KT.text("Только просмотр. Клик открывает карточку модели в справочнике.", { w = w, size = fs.s, color = c.dim })
        else
            list[#list + 1] = KT.empty("Модели соперника не найдены", "Они появятся, когда соперник выставит отряд на стол.", w)
        end
    elseif e.seg == "ploys" then
        if not e.ploys or #e.ploys == 0 then
            list[#list + 1] = KT.empty("Уловки неизвестны", "Отряд соперника ещё не определён: он выбирает его в своей вкладке «Отряд».", w)
        end
        for _, p in ipairs(e.ploys or {}) do
            if p.open then
                list[#list + 1] = KT.vstack({
                    KT.hstack({
                        KT.vstack({
                            KT.text(p.name, { w = w - 84, size = fs.m, bold = true }),
                            p.english and KT.text(p.english, { w = w - 84, size = fs.s, color = c.muted }) or nil,
                        }, { gap = 2, flex = 1 }),
                        KT.vstack({ (KT.chip(tostring(p.cost or 1) .. " CP", "cost", { size = 12, h = 24 })) }, { w = 50, stretch = false }),
                    }, { gap = 10, stretch = false, align = "UpperLeft" }),
                    H.ruleBlock(color, p.body, p.terms, w - 24),
                    btn(color, "enemyploy", p.key, "Свернуть", { kind = "ghost", h = 26, size = 12 }),
                }, { w = w, pad = 12, gap = 10, bg = c.s2, outline = c.accent })
            else
                local inside = KT.hstack({
                    KT.vstack({
                        KT.text(p.name, { w = w - 84, size = fs.m, bold = true }),
                        p.english and KT.text(p.english, { w = w - 84, size = fs.s, color = c.muted }) or nil,
                    }, { gap = 2, flex = 1 }),
                    KT.vstack({ (KT.chip(tostring(p.cost or 1) .. " CP", "cost", { size = 12, h = 24 })) }, { w = 50, stretch = false }),
                }, { gap = 10, pad = 12, stretch = false, align = "UpperLeft" })
                list[#list + 1] = KT.node("Panel", { preferredHeight = tostring(KT.prefH(inside)), color = c.clear }, {
                    KT.node("Button", { id = H.id(color, "enemyploy", p.key), onClick = KT.clickTarget(), text = "",
                        colors = c.s2 .. "|" .. c.s3 .. "|" .. c.s3 .. "|" .. c.s2, outline = c.line, outlineSize = "1 1" }),
                    inside,
                })
            end
        end
    else
        if not e.rules or #e.rules == 0 then
            list[#list + 1] = KT.empty("Правила недоступны", "Справочник отряда соперника появится, когда известен его отряд.", w)
        end
        for _, r in ipairs(e.rules or {}) do
            list[#list + 1] = KT.card({
                KT.text(r.title, { w = w - 24, size = 15, bold = true }),
                r.english and KT.text(r.english, { w = w - 24, size = fs.s, color = c.muted }) or nil,
                H.ruleBlock(color, r.body, r.terms, w - 24, 13),
            }, { w = w })
        end
    end
    return KT.vstack(list, { w = w, gap = 10 })
end

------------------------------------------------------------------------------------------------------------------------
-- Tab: Журнал (log)
-- vm.log = { seg="events|score", groups={{title, entries={{side="Red", title, sub, delta, neg}}}},
--            score={rows={{label, rcp, rvp, bcp, bvp}}, total={rvp,bvp}, sources={{label,r,b}}, names={red,blue}}, note }
------------------------------------------------------------------------------------------------------------------------
local function cell(text, w, o)
    o = o or {}
    return KT.node("Text", { text = tostring(text or ""), fontSize = tostring(o.size or 13), fontStyle = o.bold and "Bold" or "Normal",
        color = o.color or c.fg, alignment = o.align or "MiddleRight", preferredWidth = tostring(w), flexibleWidth = o.flex and "1" or nil,
        raycastTarget = "false" })
end

function H.viewLog(vm, w)
    local l = vm.log or {}
    local color = vm.color
    local list = { KT.seg({ { "events", "События" }, { "score", "Счёт по раундам" } }, l.seg or "events",
        { prefix = H.id(color, "logseg") .. ":", w = w }) }
    if (l.seg or "events") == "events" then
        if not l.groups or #l.groups == 0 then
            list[#list + 1] = KT.empty("Журнал пуст", "Здесь появятся действия, уловки и изменения CP.", w)
        end
        for _, g in ipairs(l.groups or {}) do
            list[#list + 1] = KT.section(g.title, w)
            for _, e in ipairs(g.entries) do
                local deltaW = e.delta and math.ceil(KT.textWidth(e.delta, 12, true) + 6) or 0
                local tw = w - 4 - 10 - deltaW - 10
                list[#list + 1] = KT.hstack({
                    KT.stripe(c[e.side] or c.muted, 4),
                    KT.vstack({
                        KT.text(e.title, { w = tw, size = 13 }),
                        e.sub and KT.text(e.sub, { w = tw, size = fs.xs, color = c.muted }) or nil,
                    }, { gap = 2, flex = 1 }),
                    e.delta and cell(e.delta, deltaW, { bold = true, size = 12, color = e.neg and c.hurt or c.accentHi,
                        align = "UpperRight" }) or nil,
                }, { gap = 10, pad = { 0, 0, 7, 7 }, stretch = true, align = "UpperLeft" })
            end
        end
    else
        local s = l.score or {}
        local col = math.floor((w - 70) / 4)
        local names = s.names or {}
        local function header()
            return KT.hstack({
                cell("РАУНД", 70, { size = 10, bold = true, color = c.muted, align = "MiddleLeft" }),
                cell("CP", col, { size = 10, bold = true, color = c.Red }), cell("VP", col, { size = 10, bold = true, color = c.Red }),
                cell("CP", col, { size = 10, bold = true, color = c.Blue }), cell("VP", col, { size = 10, bold = true, color = c.Blue }),
            }, { h = 26, pad = { 6, 6, 0, 0 } })
        end
        list[#list + 1] = KT.hstack({
            cell(names.red or "Красный", (w - 6) / 2, { bold = true, color = c.Red, align = "MiddleLeft" }),
            cell(names.blue or "Синий", (w - 6) / 2, { bold = true, color = c.Blue, align = "MiddleRight" }),
        }, { h = 22, gap = 6 })
        list[#list + 1] = header()
        for _, r in ipairs(s.rows or {}) do
            list[#list + 1] = KT.hstack({
                cell(r.label, 70, { align = "MiddleLeft" }), cell(r.rcp, col), cell(r.rvp, col), cell(r.bcp, col), cell(r.bvp, col),
            }, { h = 32, pad = { 6, 6, 0, 0 }, bg = c.s1 })
        end
        local t = s.total or {}
        list[#list + 1] = KT.hstack({
            cell("Итого", 70, { bold = true, align = "MiddleLeft" }), cell("", col), cell(t.rvp, col, { bold = true, color = c.Red }),
            cell("", col), cell(t.bvp, col, { bold = true, color = c.Blue }),
        }, { h = 34, pad = { 6, 6, 0, 0 }, bg = c.s3 })
        if s.sources and #s.sources > 0 then
            list[#list + 1] = KT.section("Источники VP", w)
            for _, r in ipairs(s.sources) do
                list[#list + 1] = KT.hstack({
                    cell(r.label, w - 2 * 70 - 12, { align = "MiddleLeft", flex = true }),
                    cell(r.r, 70, { bold = true, color = c.Red }), cell(r.b, 70, { bold = true, color = c.Blue }),
                }, { h = 30, pad = { 6, 6, 0, 0 }, bg = c.s1 })
            end
        end
    end
    if l.note then list[#list + 1] = KT.text(l.note, { w = w, size = fs.s, color = c.dim }) end
    return KT.vstack(list, { w = w, gap = 8 })
end

------------------------------------------------------------------------------------------------------------------------
-- Tab: Справка (reference, wide two-pane)
-- vm.ref = { scope, scopes={{key,label}}, query, count, results={{key,title,english,on}},
--   article={label, team, title, english, cost, body, terms, weapons={{kind,name,a,bs,d,traits={...}}}, abilities={{title,english,cost,body}}}|nil,
--   term={title, english, body}|nil, emptyHint }
------------------------------------------------------------------------------------------------------------------------
local LIST_W = 320

local function refList(color, r, h)
    local w = LIST_W - G.scrollbar - 28
    local scopes, row = {}, {}
    for _, s in ipairs(r.scopes or {}) do
        local on = s[1] == r.scope
        row[#row + 1] = btn(color, "refscope", s[1], s[2], { kind = on and "rowOn" or "row", h = 30, size = 12, flex = 1 })
        if #row == 3 then scopes[#scopes + 1] = KT.hstack(row, { h = 30, gap = 4 }); row = {} end
    end
    if #row > 0 then scopes[#scopes + 1] = KT.hstack(row, { h = 30, gap = 4 }) end
    local items = {}
    for _, it in ipairs(r.results or {}) do
        local inside = KT.vstack({
            KT.text(it.title, { w = w - 20, size = 13, bold = true }),
            it.english and KT.text(it.english, { w = w - 20, size = fs.xs, color = c.muted }) or nil,
        }, { pad = { 10, 10, 9, 9 }, gap = 3 })
        items[#items + 1] = KT.node("Panel", { preferredHeight = tostring(KT.prefH(inside)), color = c.clear }, {
            KT.node("Button", { id = H.id(color, "refopen", it.key), onClick = KT.clickTarget(), text = "",
                colors = it.on and (c.s3 .. "|" .. c.s3 .. "|" .. c.s3 .. "|" .. c.s3) or (c.s1 .. "|" .. c.s2 .. "|" .. c.s3 .. "|" .. c.s1) }),
            it.on and KT.node("Image", { ignoreLayout = "true", rectAlignment = "MiddleLeft", width = "3", height = "100%",
                color = c.accent, raycastTarget = "false" }) or nil,
            inside,
        })
    end
    if #items == 0 then items[1] = KT.text(r.emptyHint or "Ничего не найдено. Попробуйте часть слова.", { w = w, size = fs.s, color = c.dim }) end
    local content = KT.vstack({
        KT.vstack(scopes, { w = w, gap = 4 }),
        KT.search(H.id(color, "refsearch"), r.query, "Поиск по правилам…", { w = w }),
        KT.section("Найдено", w, r.count or #(r.results or {})),
        KT.vstack(items, { w = w, gap = 2 }),
    }, { w = w + G.scrollbar, pad = { 14, 4, 14, 14 }, gap = 10 })
    return KT.scroll(content, { w = LIST_W, h = h, id = H.id(color, "reflistscroll") })
end

local function weaponTable(color, weapons, w)
    local rows = {
        KT.hstack({
            cell("ОРУЖИЕ", w - 4 * 58, { size = 10, bold = true, color = c.muted, align = "MiddleLeft" }),
            cell("A", 58, { size = 10, bold = true, color = c.muted, align = "MiddleCenter" }),
            cell("BS/WS", 58, { size = 10, bold = true, color = c.muted, align = "MiddleCenter" }),
            cell("D", 58, { size = 10, bold = true, color = c.muted, align = "MiddleCenter" }),
            cell("", 58),
        }, { h = 26 }),
    }
    for _, wp in ipairs(weapons) do
        local nameW = w - 20 - 3 * 58 - 46 - 5 * 8   -- icon, three stat columns, spare column, gaps
        local traitList = {}
        for _, t in ipairs(wp.traits or {}) do traitList[#traitList + 1] = { t, "neutral" } end
        rows[#rows + 1] = KT.hstack({
            KT.icon(wp.kind == "melee" and "MELEE" or "RANGED", 12),
            KT.vstack({
                KT.text(wp.name, { w = nameW, size = 13, bold = true }),
                #traitList > 0 and KT.chips(traitList, nameW, 4) or nil,
            }, { gap = 4, w = nameW }),
            cell(wp.a, 58, { align = "MiddleCenter", bold = true }), cell(wp.bs, 58, { align = "MiddleCenter", bold = true }),
            cell(wp.d, 58, { align = "MiddleCenter", bold = true }), cell("", 58 - 12),
        }, { gap = 8, pad = { 0, 0, 8, 8 }, bg = c.s1, align = "MiddleLeft" })
    end
    return KT.vstack(rows, { w = w, gap = 1, bg = c.line })
end

local function refArticle(color, r, w, h)
    local a = r.article
    local iw = w - G.scrollbar - 52
    local list = {}
    if not a then
        list[1] = KT.empty("Выберите статью", "Слева список правил текущего отряда. Поиск понимает часть слова на русском и английском.", iw)
    else
        list[#list + 1] = KT.hstack({
            KT.chip(a.label or "СПРАВКА", "acc"),
            a.team and KT.node("Text", { text = a.team, fontSize = "12", color = c.muted, alignment = "MiddleLeft", flexibleWidth = "1",
                raycastTarget = "false" }) or nil,
        }, { h = 21, gap = 8 })
        local costW = a.cost and 80 or 0
        list[#list + 1] = KT.hstack({
            KT.vstack({
                KT.text(a.title, { w = iw - costW - 12, size = fs.xxl, bold = true }),
                a.english and KT.text(a.english, { w = iw - costW - 12, size = fs.m, color = c.muted }) or nil,
            }, { gap = 4, flex = 1 }),
            a.cost and KT.vstack({ (KT.chip(a.cost, "cost", { size = 14, h = 30 })) }, { w = costW, align = "UpperRight", stretch = false }) or nil,
        }, { gap = 12, stretch = false, align = "UpperLeft" })
        if a.body and a.body ~= "" then list[#list + 1] = H.ruleBlock(color, a.body, a.terms, math.min(iw, 620), fs.l) end
        if a.weapons and #a.weapons > 0 then
            list[#list + 1] = KT.section("Оружие", iw)
            list[#list + 1] = weaponTable(color, a.weapons, iw)
        end
        for _, ab in ipairs(a.abilities or {}) do
            list[#list + 1] = KT.card({
                KT.hstack({
                    KT.text(ab.title, { w = iw - 24 - (ab.cost and 60 or 0), size = 15, bold = true }),
                    ab.cost and KT.vstack({ (KT.chip(ab.cost, "cost", { size = 12, h = 24 })) }, { w = 54, stretch = false }) or nil,
                }, { stretch = false, align = "UpperLeft" }),
                ab.english and KT.text(ab.english, { w = iw - 24, size = fs.s, color = c.muted }) or nil,
                KT.text(ab.body or "", { w = iw - 24, size = fs.m, color = "#D5DADD" }),
            }, { w = iw })
        end
    end
    local content = KT.vstack(list, { w = iw + G.scrollbar, pad = { 26, 26, 20, 20 }, gap = 14 })
    return KT.scroll(content, { w = w, h = h, id = H.id(color, "refartscroll") })
end

local function termPopover(color, t)
    local w = 380
    local iw = w - 28
    local box = KT.vstack({
        KT.hstack({
            KT.chip("ТЕРМИН", "acc"),
            KT.node("Panel", { flexibleWidth = "1", color = c.clear }),
            btn(color, "termclose", nil, "×", { w = 26, h = 26, size = 14 }),
        }, { h = 26, gap = 8 }),
        KT.text(t.title, { w = iw, size = 17, bold = true }),
        t.english and KT.text(t.english, { w = iw, size = fs.s, color = c.muted }) or nil,
        KT.text(t.body or "", { w = iw, size = fs.m, color = "#D5DADD" }),
        KT.text("Закрытие вернёт к тому же месту статьи.", { w = iw, size = fs.xs, color = c.dim }),
    }, { w = w, pad = 14, gap = 8, bg = c.rail, outline = c.accent })
    box.attributes.ignoreLayout = "true"
    box.attributes.rectAlignment = "UpperRight"
    box.attributes.width = tostring(w)
    box.attributes.height = box.attributes.preferredHeight
    box.attributes.offsetXY = "-26 -120"
    box.attributes.shadow = "#000000CC"
    box.attributes.shadowDistance = "0 -10"
    box.attributes.raycastTarget = "true"
    return box
end

-- Reference occupies the whole body area (no footer). Returns a fixed-size panel.
function H.viewReference(vm, w, h)
    local r = vm.ref or {}
    local color = vm.color
    local kids = {
        KT.hstack({
            refList(color, r, h),
            KT.node("Image", { preferredWidth = "1", color = c.line, raycastTarget = "false" }),
            refArticle(color, r, w - LIST_W - 1, h),
        }, { h = h }),
    }
    if r.term then kids[#kids + 1] = termPopover(color, r.term) end
    return KT.node("Panel", { preferredHeight = tostring(h), preferredWidth = tostring(w), color = c.clear }, kids)
end

------------------------------------------------------------------------------------------------------------------------
-- Rail + dock shell
-- vm = { color, state="open|rail|hidden", tab, tabs={{key,label,icon,glyph}}, status, toast={title,body}|nil,
--        foot={{cmd,arg,label,kind,enabled,flex,w}}, turn/squad/ploys/enemy/ref/log }
------------------------------------------------------------------------------------------------------------------------
H.TABS = {
    { key = "turn", label = "Ход", icon = "APL" },
    { key = "squad", label = "Отряд", icon = "WOUNDS" },
    { key = "ploys", label = "Уловки", glyph = "CP" },
    { key = "enemy", label = "Враг", icon = "RANGED" },
    { key = "ref", label = "Справка", glyph = "?" },
    { key = "log", label = "Журнал", glyph = "≡" },
}

local function railTab(vm, t)
    local on = vm.state == "open" and vm.tab == t.key
    local glyph
    if t.icon then
        local ratio = KT.iconRatio[t.icon] or 1
        local gh = ratio < 0.6 and 22 or 18
        glyph = KT.node("Image", { image = KT.icons[t.icon], preserveAspect = "true", width = tostring(math.ceil(gh * math.max(ratio, 0.5))),
            height = tostring(gh), rectAlignment = "UpperCenter", offsetXY = "0 -12", color = on and "#FFFFFF" or "#FFFFFF99",
            raycastTarget = "false" })
    else
        glyph = KT.node("Text", { text = t.glyph, fontSize = t.glyph == "CP" and "14" or "20", fontStyle = "Bold",
            color = on and c.accent or c.muted, alignment = "MiddleCenter", rectAlignment = "UpperCenter", width = "64", height = "24",
            offsetXY = "0 -10", raycastTarget = "false" })
    end
    return KT.node("Panel", { preferredHeight = "64", color = c.clear }, {
        KT.node("Button", { id = H.id(vm.color, "tab", t.key), onClick = KT.clickTarget(), text = "",
            colors = on and (c.s1 .. "|" .. c.s1 .. "|" .. c.s1 .. "|" .. c.s1) or (c.rail .. "|#171A1D|" .. c.s1 .. "|" .. c.rail),
            tooltip = t.label, tooltipPosition = "Right" }),
        on and KT.node("Image", { rectAlignment = "MiddleLeft", width = "3", height = "100%", color = c.accent, raycastTarget = "false" }) or nil,
        glyph,
        KT.node("Text", { text = t.label, fontSize = "11", fontStyle = "Bold", color = on and c.fg or c.muted, alignment = "MiddleCenter",
            rectAlignment = "LowerCenter", height = "20", offsetXY = "0 8", raycastTarget = "false" }),
    })
end

local function rail(vm)
    local kids = {
        KT.node("Panel", { preferredHeight = "56", color = c.rail }, {
            KT.node("Text", { text = "KT", fontSize = "15", fontStyle = "Bold", color = c.accent, alignment = "MiddleCenter",
                raycastTarget = "false" }),
            KT.node("Image", { rectAlignment = "LowerCenter", height = "1", width = "100%", color = c.line, raycastTarget = "false" }),
        }),
    }
    for _, t in ipairs(vm.tabs or H.TABS) do kids[#kids + 1] = railTab(vm, t) end
    kids[#kids + 1] = KT.node("Panel", { flexibleHeight = "1", color = c.clear })
    kids[#kids + 1] = KT.node("Panel", { preferredHeight = "48", color = c.clear }, {
        KT.node("Image", { rectAlignment = "UpperCenter", height = "1", width = "100%", color = c.line, raycastTarget = "false" }),
        btn(vm.color, vm.state == "open" and "collapse" or "expand", "rail", vm.state == "open" and "‹" or "›",
            { kind = "tab", h = 48, size = 18 }),
    })
    return KT.node("VerticalLayout", { preferredWidth = tostring(G.rail), width = tostring(G.rail), color = c.rail,
        childForceExpandWidth = "true", childForceExpandHeight = "false", spacing = "0" }, kids)
end

local function foot(vm, w)
    local kids = {}
    for _, b in ipairs(vm.foot or {}) do
        if b.note then
            kids[#kids + 1] = KT.node("Text", { text = b.note, fontSize = "12", color = c.muted, alignment = "MiddleLeft",
                flexibleWidth = "1", raycastTarget = "false" })
        else
            kids[#kids + 1] = btn(vm.color, b.cmd, b.arg, b.label, { kind = b.kind or "secondary", h = 40,
                flex = b.flex and 1 or nil, w = b.w or (not b.flex and math.ceil(KT.textWidth(b.label, 14, true) + 28) or nil),
                enabled = b.enabled })
        end
    end
    return KT.node("Panel", { preferredHeight = tostring(G.foot), color = c.bg }, {
        KT.node("Image", { rectAlignment = "UpperCenter", height = "1", width = "100%", color = c.line, raycastTarget = "false" }),
        KT.hstack(kids, { h = G.foot, gap = 8, pad = { G.pad, G.pad, 12, 12 } }),
    })
end

local function toast(vm, w)
    local t = vm.toast
    local tw = w - 24 - 90 - 10
    local box = KT.hstack({
        KT.vstack({
            KT.text(t.title, { w = tw, size = 13, bold = true }),
            t.body and KT.text(t.body, { w = tw, size = 12, color = c.muted }) or nil,
        }, { gap = 2, flex = 1 }),
        t.undo ~= false and btn(vm.color, "undo", nil, "Отменить", { w = 90, h = 30, size = 13 }) or nil,
    }, { gap = 10, pad = { 12, 12, 10, 10 }, bg = c.rail, outline = c.accent, align = "MiddleLeft", stretch = false, raycast = true })
    local h = KT.prefH(box)
    return KT.node("Panel", { id = H.id(vm.color, "toast"), ignoreLayout = "true", rectAlignment = "LowerLeft", width = tostring(w - 24),
        height = tostring(h), offsetXY = "12 " .. tostring(G.foot + 10), color = c.clear, showAnimation = "FadeIn",
        animationDuration = "0.2" }, { box })
end

local VIEWS = { turn = H.viewTurn, squad = H.viewSquad, ploys = H.viewPloys, enemy = H.viewEnemy, log = H.viewLog }

-- Full dock for one seat. Returns a single root Panel visible only to vm.color.
function H.dock(vm)
    local color = vm.color
    local rootId = "khDock_" .. color
    if vm.state == "hidden" then
        return KT.node("Panel", { id = rootId, visibility = color, rectAlignment = "UpperLeft", offsetXY = G.x .. " -" .. G.y,
            width = "64", height = "40", color = c.rail, outline = c.line, outlineSize = "1 1", raycastTarget = "true" }, {
            btn(color, "expand", nil, "KT", { kind = "tab", h = 40, size = 15 }),
        })
    end
    local open = vm.state == "open"
    local wide = open and vm.tab == "ref"
    local panelW = wide and G.wide or G.panel
    local kids = { rail(vm) }
    if open then
        local bodyH = G.h - G.head - (wide and 0 or G.foot)
        local body
        if wide then
            body = H.viewReference(vm, panelW, bodyH)
        else
            local view = VIEWS[vm.tab] or H.viewTurn
            local content = view(vm, inner(panelW))
            local wrapped = KT.vstack({ content }, { w = panelW - G.scrollbar, pad = { G.pad, G.pad, 14, 16 } })
            body = KT.scroll(wrapped, { w = panelW, h = bodyH, id = H.id(color, "scroll", vm.tab) })
        end
        local panelKids = {
            H.head(vm, panelW),
            KT.node("Image", { preferredHeight = "1", color = c.line, raycastTarget = "false" }),
            body,
        }
        if not wide then panelKids[#panelKids + 1] = foot(vm, panelW) end
        local panel = KT.node("VerticalLayout", { preferredWidth = tostring(panelW), color = c.s1, childForceExpandWidth = "true",
            childForceExpandHeight = "false", spacing = "0" }, panelKids)
        if vm.toast and not wide then panel.children[#panel.children + 1] = toast(vm, panelW) end
        kids[#kids + 1] = KT.node("Image", { preferredWidth = "1", color = c.line, raycastTarget = "false" })
        kids[#kids + 1] = panel
    end
    local width = G.rail + (open and (1 + panelW) or 0)
    return KT.node("HorizontalLayout", {
        id = rootId, visibility = color, rectAlignment = "UpperLeft", offsetXY = G.x .. " -" .. G.y,
        width = tostring(width), height = tostring(G.h), color = c.bg, outline = c.line, outlineSize = "1 1",
        shadow = "#000000B0", shadowDistance = "0 -12", childForceExpandWidth = "false", childForceExpandHeight = "true",
        spacing = "0", allowDragging = "false", raycastTarget = "true",
    }, kids)
end
