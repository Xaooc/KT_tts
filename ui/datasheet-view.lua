-- Operative datasheet shown on R (per seat). Pure builder: view-model -> XmlUI root node.
-- Weapon rows keep the original ids "weaponButton_<i>_<color>" and the efa3fe/onWeaponAttack handler
-- (left click = normal roll, right click = auto roll).
KT.ds = KT.ds or {}
local D = KT.ds
local c, fs = KT.c, KT.fs

D.geo = { w = 640, maxH = 900, pad = 14, right = 16 }

function D.id(color, cmd, arg)
    return "kd:" .. color .. ":" .. cmd .. (arg ~= nil and (":" .. tostring(arg)) or "")
end

local function statCell(icon, label, value)
    local ratio = KT.iconRatio[icon] or 1
    return KT.vstack({
        KT.node("Image", { image = KT.icons[icon], preserveAspect = "true", preferredHeight = "14",
            preferredWidth = tostring(math.ceil(14 * ratio)), raycastTarget = "false" }),
        KT.node("Text", { text = tostring(value or "—"), fontSize = "18", fontStyle = "Bold", color = c.fg, alignment = "MiddleCenter",
            preferredHeight = "22", raycastTarget = "false" }),
        KT.node("Text", { text = label, fontSize = "9", fontStyle = "Bold", color = c.muted, alignment = "MiddleCenter",
            preferredHeight = "11", raycastTarget = "false" }),
    }, { w = 62, pad = { 0, 0, 9, 7 }, gap = 3, align = "MiddleCenter", stretch = false })
end

local function header(vm, w)
    local statsW = 4 * 62 + 4
    local nameW = w - statsW - 36 - D.geo.pad * 2
    local nameCol = KT.vstack({
        KT.text(vm.name or "", { w = nameW, size = fs.xl, bold = true }),
        KT.text((vm.english or "") .. (vm.team and ("  ·  " .. vm.team) or ""), { w = nameW, size = fs.s, color = c.muted }),
    }, { pad = { D.geo.pad, 8, 12, 12 }, gap = 2, flex = 1 })
    local function vline() return KT.node("Image", { preferredWidth = "1", color = c.line, raycastTarget = "false" }) end
    local row = KT.hstack({
        nameCol,
        vline(), statCell("APL", "APL", vm.apl), vline(), statCell("MOVE", "MOVE", vm.move),
        vline(), statCell("SAVE", "SAVE", vm.save), vline(), statCell("WOUNDS", "WND", vm.wounds), vline(),
        KT.vstack({
            KT.button("×", { id = D.id(vm.color, "close"), kind = "ghost", w = 36, h = 36, size = 16 }),
        }, { w = 36, stretch = false }),
    }, { bg = c.rail, stretch = true, align = "UpperLeft" })
    return KT.vstack({
        row,
        KT.node("Image", { preferredHeight = "2", color = c.accent, raycastTarget = "false" }),
    }, { w = w })
end

local function weaponRows(vm, w)
    local iw = w - D.geo.pad * 2
    local colW = 40
    local nameW = iw - 22 - 3 * colW - 10 * 4 - 20
    local rows = {
        KT.hstack({
            KT.node("Panel", { preferredWidth = "22", color = c.clear }),
            KT.node("Text", { text = "ОРУЖИЕ · клик — бросок, правый клик — автобросок", fontSize = "10", fontStyle = "Bold",
                color = c.muted, alignment = "MiddleLeft", flexibleWidth = "1", raycastTarget = "false" }),
            KT.node("Text", { text = "A", fontSize = "10", fontStyle = "Bold", color = c.muted, alignment = "MiddleCenter",
                preferredWidth = tostring(colW), raycastTarget = "false" }),
            KT.node("Text", { text = "BS", fontSize = "10", fontStyle = "Bold", color = c.muted, alignment = "MiddleCenter",
                preferredWidth = tostring(colW), raycastTarget = "false" }),
            KT.node("Text", { text = "D", fontSize = "10", fontStyle = "Bold", color = c.muted, alignment = "MiddleCenter",
                preferredWidth = tostring(colW + 10), raycastTarget = "false" }),
        }, { h = 28, gap = 10, pad = { 10, 10, 0, 0 }, bg = c.bg }),
    }
    for _, wp in ipairs(vm.weapons or {}) do
        local traitButtons, traitRows, rowW = {}, {}, 0
        for j, t in ipairs(wp.traits or {}) do
            local label = t.label .. (t.key and "  ?" or "")
            local bw = math.ceil(KT.textWidth(label, 11, true) + 14)
            if #traitButtons > 0 and rowW + 4 + bw > nameW then
                traitRows[#traitRows + 1] = KT.hstack(traitButtons, { h = 22, gap = 4 })
                traitButtons, rowW = {}, 0
            end
            traitButtons[#traitButtons + 1] = KT.button(label, { id = D.id(vm.color, "trait", wp.index .. ":" .. j), w = bw, h = 22,
                size = 11, kind = "secondary", enabled = t.key ~= nil, tooltip = t.tip })
            rowW = rowW + (rowW > 0 and 4 or 0) + bw
        end
        if #traitButtons > 0 then traitRows[#traitRows + 1] = KT.hstack(traitButtons, { h = 22, gap = 4 }) end
        local nameCol = KT.vstack({
            KT.text(wp.name, { w = nameW, size = 14, bold = true }),
            #traitRows > 0 and KT.vstack(traitRows, { w = nameW, gap = 4 }) or nil,
        }, { gap = 5, w = nameW })
        local function num(v, wd)
            return KT.node("Text", { text = tostring(v or "—"), fontSize = "14", fontStyle = "Bold", color = c.fg,
                alignment = "MiddleCenter", preferredWidth = tostring(wd), raycastTarget = "false" })
        end
        local content = KT.hstack({
            KT.vstack({ KT.icon(wp.kind == "melee" and "MELEE" or "RANGED", 12) }, { w = 22, align = "MiddleCenter", stretch = false }),
            nameCol,
            KT.node("Panel", { flexibleWidth = "1", color = c.clear }),
            num(wp.a, colW), num(wp.bs, colW), num(wp.d, colW + 10),
        }, { gap = 10, pad = { 10, 10, 9, 9 }, align = "MiddleLeft" })
        -- The click layer is the original weapon button; trait buttons sit above it and keep their own clicks.
        rows[#rows + 1] = KT.node("Panel", { preferredHeight = tostring(KT.prefH(content)), color = c.clear }, {
            KT.node("Button", { id = "weaponButton_" .. wp.index .. "_" .. vm.color, onClick = (vm.guid or "efa3fe") .. "/onWeaponAttack",
                text = "", colors = c.s1 .. "|" .. c.s3 .. "|" .. c.s3 .. "|" .. c.s1,
                tooltip = "Левый клик — бросок кубиков атаки, правый — автобросок", tooltipPosition = "Left" }),
            content,
        })
    end
    return KT.vstack(rows, { w = iw, gap = 1, bg = c.line, outline = c.line })
end

local function abilityCard(a, w)
    local iw = w - 24
    local costW = a.cost and 52 or 0
    local titleW = iw - costW - (costW > 0 and 8 or 0)
    local engW = math.min(KT.textWidth(a.english or "", fs.xs) + 4, titleW * 0.45)
    local titleRow
    if a.english and KT.textWidth(a.title, 14, true) + engW + 10 <= titleW then
        titleRow = KT.hstack({
            KT.text(a.title, { w = titleW - engW - 8, size = 14, bold = true }),
            KT.node("Text", { text = a.english, fontSize = tostring(fs.xs), color = c.muted, alignment = "UpperRight",
                preferredWidth = tostring(engW), raycastTarget = "false" }),
            a.cost and KT.vstack({ (KT.chip(a.cost, "cost", { size = 11, h = 20 })) }, { w = costW, align = "UpperRight", stretch = false }) or nil,
        }, { gap = 8, stretch = false, align = "UpperLeft" })
    else
        titleRow = KT.hstack({
            KT.vstack({
                KT.text(a.title, { w = titleW, size = 14, bold = true }),
                a.english and KT.text(a.english, { w = titleW, size = fs.xs, color = c.muted }) or nil,
            }, { gap = 2, w = titleW }),
            a.cost and KT.vstack({ (KT.chip(a.cost, "cost", { size = 11, h = 20 })) }, { w = costW, align = "UpperRight", stretch = false }) or nil,
        }, { gap = 8, stretch = false, align = "UpperLeft" })
    end
    return KT.vstack({
        titleRow,
        KT.text(a.body or "", { w = iw, size = 13, color = "#D0D6DA" }),
    }, { w = w, pad = { 12, 12, 10, 10 }, gap = 6, bg = c.s1, outline = c.line })
end

local function abilityGrid(vm, w)
    local iw = w - D.geo.pad * 2
    local half = math.floor((iw - 8) / 2)
    local rows, pending = {}, nil
    for _, a in ipairs(vm.abilities or {}) do
        local probe = abilityCard(a, half)
        if KT.prefH(probe) > 150 then
            if pending then rows[#rows + 1] = abilityCard(pending, iw); pending = nil end
            rows[#rows + 1] = abilityCard(a, iw)
        elseif pending then
            local left, right = abilityCard(pending, half), probe
            local h = math.max(KT.prefH(left), KT.prefH(right))
            left.attributes.preferredHeight, right.attributes.preferredHeight = tostring(h), tostring(h)
            rows[#rows + 1] = KT.hstack({ left, right }, { h = h, gap = 8 })
            pending = nil
        else
            pending = a
        end
    end
    if pending then rows[#rows + 1] = abilityCard(pending, iw) end
    if #rows == 0 then return nil end
    return KT.vstack(rows, { w = iw, gap = 8 })
end

function D.view(vm)
    local w = D.geo.w
    local body = KT.vstack({
        weaponRows(vm, w),
        abilityGrid(vm, w),
    }, { w = w, pad = { D.geo.pad, D.geo.pad, 12, 12 }, gap = 10 })
    local footer = KT.hstack({
        KT.node("Text", { text = vm.hint or "«?» у трейта — определение в Центре › Справка", fontSize = "11", color = c.dim,
            alignment = "MiddleLeft", flexibleWidth = "1", raycastTarget = "false" }),
        KT.button("Открыть в справочнике", { id = D.id(vm.color, "openref"), kind = "ghost", w = 170, h = 26, size = 11 }),
    }, { h = 34, pad = { D.geo.pad, 8, 0, 0 } })
    local head = header(vm, w)
    local fixed = KT.prefH(head) + KT.prefH(footer) + 2
    local maxBody = D.geo.maxH - fixed
    local bodyNode = body
    local bodyH = KT.prefH(body)
    if bodyH > maxBody then
        bodyNode = KT.scroll(body, { w = w, h = maxBody, id = D.id(vm.color, "scroll") })
        bodyH = maxBody
    end
    local total = fixed + bodyH
    return KT.node("VerticalLayout", {
        id = "datasheetHUD_body_" .. vm.color, visibility = vm.color, rectAlignment = "MiddleRight",
        offsetXY = "-" .. D.geo.right .. " 0", width = tostring(w), height = tostring(total),
        color = c.bg, outline = c.line, outlineSize = "1 1", shadow = "#000000B0", shadowDistance = "0 -12",
        childForceExpandWidth = "true", childForceExpandHeight = "false", spacing = "0", allowDragging = "true",
        returnToOriginalPositionWhenReleased = "false", raycastTarget = "true",
    }, {
        head, bodyNode,
        KT.node("Image", { preferredHeight = "1", color = c.line, raycastTarget = "false" }),
        footer,
    })
end
