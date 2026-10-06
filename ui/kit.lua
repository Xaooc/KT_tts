do -- module scope: keeps this module's locals out of the object's main chunk (Lua allows 200 locals per function)
-- KT hub UI kit: design tokens, text measurement and layout-group components.
-- Every builder returns an XmlUI node whose size is known up front (attributes.preferredHeight / preferredWidth),
-- so containers sum their children instead of guessing, and positions come from Vertical/HorizontalLayout.
-- Text is measured with Arial metrics (ruFontMetrics, 18px reference); Unity's built-in UI font is metric-compatible.
KT = KT or {}

KT.c = {
    bg = "#111315", s1 = "#1A1E22", s2 = "#23292F", s3 = "#2C333A", rail = "#0D0F10", line = "#30373E",
    fg = "#ECEFF1", muted = "#98A3AC", dim = "#6B757D",
    accent = "#F26522", accentHi = "#FF8443", accentLo = "#3A2116", onAccent = "#140B06",
    ok = "#5FD08A", okLo = "#16301F", hurt = "#FF5A4E", hurtLo = "#3A1714", warn = "#F2B53A",
    Red = "#E5484D", Blue = "#3E8EF7", clear = "#00000000",
}
KT.fs = { xs = 11, s = 12, m = 14, l = 16, xl = 20, xxl = 26 }
KT.handler = KT.handler or "ruHubClick"
KT.icons = {
    APL = "https://steamusercontent-a.akamaihd.net/ugc/9369305430220912809/CC6EC4AAB9725BF7852567DB374B35301735FA62/",
    WOUNDS = "https://steamusercontent-a.akamaihd.net/ugc/16384741150793604760/CB8B9ED02F9F267F78B2E854E75A871290364190/",
    SAVE = "https://steamusercontent-a.akamaihd.net/ugc/13684861407307316890/556F46D8F1A313F5FD3456FFBDD45CA418FD7789/",
    RANGED = "https://steamusercontent-a.akamaihd.net/ugc/13462888711902053286/AFE9392A03B3E558180E3C2F357BECAACE715DF6/",
    MOVE = "https://steamusercontent-a.akamaihd.net/ugc/15432009711221783432/A02CDBA6FEF031FCD18784875D989EF99AD59740/",
    MELEE = "https://steamusercontent-a.akamaihd.net/ugc/18196645127188580175/57D0C8FBC2A931C1DB98C8D731C73FC915BF9F20/",
}
-- Icon aspect ratios (width / height) of the sprites above.
KT.iconRatio = { APL = 1.23, WOUNDS = 0.32, SAVE = 0.76, RANGED = 1.62, MOVE = 1.14, MELEE = 1.8 }

local LINE = 1.18      -- Unity line height in em for Liberation Sans / Arial
local SLACK = 2        -- px added to every measured text block

local function str(v) return tostring(v) end
local function num(v) return tostring(math.floor((tonumber(v) or 0) * 100 + 0.5) / 100) end

function KT.clickTarget()
    local guid = self and self.getGUID and self.getGUID() or nil
    return guid and (guid .. "/" .. KT.handler) or KT.handler
end

------------------------------------------------------------------------------------------------------------------------
-- Text measurement
------------------------------------------------------------------------------------------------------------------------
local WIDE_CHARS = #"Я" == 1     -- MoonSharp strings are UTF-16: one Cyrillic letter is one char

local function chars(s)
    local out = {}
    if WIDE_CHARS then
        for i = 1, #s do out[#out + 1] = s:sub(i, i) end
    else
        local i, n = 1, #s
        while i <= n do
            local b = s:byte(i)
            local len = b < 0x80 and 1 or b < 0xE0 and 2 or b < 0xF0 and 3 or 4
            out[#out + 1] = s:sub(i, i + len - 1)
            i = i + len
        end
    end
    return out
end
KT.chars = chars

-- Plain split. MoonSharp matches pattern character classes by the low byte of UTF-16 chars, so "[^ ]+" also
-- splits on "Р" (U+0420) and "[^,]+" on "Ь" (U+042C). Never use classes on Cyrillic text.
function KT.split(s, sep, keepEmpty)
    local out, pos = {}, 1
    s = tostring(s or "")
    while true do
        local at = s:find(sep, pos, true)
        local piece = s:sub(pos, at and at - 1 or #s)
        if keepEmpty or piece ~= "" then out[#out + 1] = piece end
        if not at then break end
        pos = at + #sep
    end
    return out
end

local function stripTags(s)
    local parts, pos = {}, 1
    while pos <= #s do
        local first = s:find("<", pos, true)
        if not first then parts[#parts + 1] = s:sub(pos); break end
        local last = s:find(">", first + 1, true)
        if not last then parts[#parts + 1] = s:sub(pos); break end
        parts[#parts + 1] = s:sub(pos, first - 1)
        pos = last + 1
    end
    return table.concat(parts)
end
KT.stripTags = stripTags

local function glyph(c, bold)
    local m = ruFontMetrics and ruFontMetrics[bold and "bold" or "normal"]
    local w = m and m[c]
    if w then return w / 18 end
    if c == " " then return 0.28 end
    return bold and 0.64 or 0.58       -- unknown glyph: average Cyrillic width
end

-- Width in px of a single line (no wrapping). Rich-text <b> spans are measured bold.
function KT.textWidth(s, size, bold)
    s = str(s or "")
    local total, isBold, pos = 0, bold == true, 1
    while pos <= #s do
        local lt = s:find("<", pos, true)
        local chunk = lt and s:sub(pos, lt - 1) or s:sub(pos)
        for _, c in ipairs(chars(chunk)) do total = total + glyph(c, isBold) end
        if not lt then break end
        local gt = s:find(">", lt + 1, true)
        if not gt then break end
        local tag = s:sub(lt + 1, gt - 1):lower()
        if tag == "b" then isBold = true elseif tag == "/b" then isBold = bold == true end
        pos = gt + 1
    end
    return total * (size or KT.fs.m)
end

local function splitLines(s)
    local out, pos = {}, 1
    while true do
        local nl = s:find("\n", pos, true)
        if not nl then out[#out + 1] = s:sub(pos); break end
        out[#out + 1] = s:sub(pos, nl - 1)
        pos = nl + 1
    end
    return out
end

-- Number of rendered lines with word wrapping at `width` px.
function KT.lineCount(s, width, size, bold)
    s = str(s or "")
    local plainBold = bold == true
    local count = 0
    for _, para in ipairs(splitLines(s)) do
        local words, lineW, lines = {}, 0, 1
        for _, w in ipairs(KT.split(para, " ")) do words[#words + 1] = w end
        local space = glyph(" ", plainBold) * (size or KT.fs.m)
        for i, w in ipairs(words) do
            local ww = KT.textWidth(w, size, plainBold)
            if lineW == 0 then
                lineW = ww
                while lineW > width do lines = lines + 1; lineW = lineW - width end
            elseif lineW + space + ww <= width then
                lineW = lineW + space + ww
            else
                lines = lines + 1
                lineW = ww
                while lineW > width do lines = lines + 1; lineW = lineW - width end
            end
        end
        count = count + lines
    end
    return math.max(1, count)
end

-- Wrap against 96% of the width: Unity breaks lines slightly earlier than this word-wrap estimate, and an extra
-- few pixels of air is better than one block overlapping the next.
function KT.textHeight(s, width, size, bold)
    size = size or KT.fs.m
    return math.ceil(KT.lineCount(s, width * 0.96, size, bold) * size * LINE + SLACK)
end

------------------------------------------------------------------------------------------------------------------------
-- Node helpers
------------------------------------------------------------------------------------------------------------------------
-- Children lists are often built with optional entries ({a, cond and b or nil, c}); ipairs/# would stop at the hole.
local function compact(list)
    if not list then return {} end
    local keys = {}
    for key in pairs(list) do if type(key) == "number" then keys[#keys + 1] = key end end
    table.sort(keys)
    local out = {}
    for _, key in ipairs(keys) do if list[key] then out[#out + 1] = list[key] end end
    return out
end
KT.compact = compact

local NO_RAYCAST = { Panel = true, Image = true, Text = true, HorizontalLayout = true, VerticalLayout = true, GridLayout = true }

local function node(tag, attrs, children, value)
    -- Copy only real values: MoonSharp keeps keys written as {x = nil} in constructors, and TTS would receive them.
    local clean = {}
    for key, value in pairs(attrs or {}) do if value ~= nil then clean[key] = value end end
    local n = { tag = tag, attributes = clean }
    -- Decorative elements never swallow clicks meant for a Button underneath (Unity Images are raycast targets).
    if NO_RAYCAST[tag] and n.attributes.raycastTarget == nil then n.attributes.raycastTarget = "false" end
    -- In TTS, free space in a layout group goes to children with any flexible size (some elements get one
    -- implicitly), even with childForceExpand off. Sized elements therefore opt out explicitly.
    if n.attributes.preferredHeight ~= nil and n.attributes.flexibleHeight == nil then n.attributes.flexibleHeight = "0" end
    if n.attributes.preferredWidth ~= nil and n.attributes.flexibleWidth == nil then n.attributes.flexibleWidth = "0" end
    children = compact(children)
    if #children > 0 then n.children = children end
    if value then n.value = value end
    return n
end
KT.node = node

local function prefH(n) return tonumber(n.attributes.preferredHeight) or tonumber(n.attributes.height) or 0 end
local function prefW(n) return tonumber(n.attributes.preferredWidth) or tonumber(n.attributes.width) or 0 end
KT.prefH, KT.prefW = prefH, prefW

local function pad(p)
    p = p or {}
    if type(p) == "number" then return { p, p, p, p } end
    return { p[1] or 0, p[2] or 0, p[3] or 0, p[4] or 0 }
end

local function spacer(h, w)
    return node("Panel", { preferredHeight = num(h or 0), preferredWidth = w and num(w) or nil, color = KT.c.clear,
        raycastTarget = "false" })
end
KT.spacer = spacer

------------------------------------------------------------------------------------------------------------------------
-- Text
------------------------------------------------------------------------------------------------------------------------
-- o = { w, size, bold, color, align, id, lines (max lines, truncates), italic }
function KT.text(s, o)
    o = o or {}
    s = str(s or "")
    local size = o.size or KT.fs.m
    local w = o.w or 300
    local h = KT.textHeight(s, w, size, o.bold)
    if o.lines then h = math.min(h, math.ceil(o.lines * size * LINE + SLACK)) end
    if o.minH then h = math.max(h, o.minH) end
    return node("Text", {
        id = o.id, text = s, fontSize = num(size),
        fontStyle = o.bold and (o.italic and "BoldAndItalic" or "Bold") or (o.italic and "Italic" or "Normal"),
        color = o.color or KT.c.fg, alignment = o.align or "UpperLeft",
        horizontalOverflow = "Wrap", verticalOverflow = o.lines and "Truncate" or "Overflow",
        preferredHeight = num(h), preferredWidth = num(w), raycastTarget = "false",
    })
end

-- Uppercase section label with a hairline to the right: "ОРУЖИЕ ───────"
function KT.section(label, w, count)
    local text = (KT.upper or string.upper)(str(label))
    local tw = KT.textWidth(text, KT.fs.xs, true) + 10
    local kids = {
        node("Text", { text = text, fontSize = num(KT.fs.xs), fontStyle = "Bold", color = KT.c.muted,
            alignment = "MiddleLeft", preferredWidth = num(tw), raycastTarget = "false" }),
    }
    if count then
        local ct = str(count)
        kids[#kids + 1] = node("Text", { text = ct, fontSize = num(KT.fs.xs), fontStyle = "Bold", color = KT.c.dim,
            alignment = "MiddleLeft", preferredWidth = num(KT.textWidth(ct, KT.fs.xs, true) + 8), raycastTarget = "false" })
    end
    kids[#kids + 1] = node("Panel", { flexibleWidth = "1", preferredHeight = "18", color = KT.c.clear, raycastTarget = "false" }, {
        node("Image", { height = "1", width = "100%", color = KT.c.line, raycastTarget = "false" }),
    })
    return node("HorizontalLayout", { preferredHeight = "20", preferredWidth = num(w), spacing = "0", raycastTarget = "false",
        childForceExpandWidth = "false", childForceExpandHeight = "true", childAlignment = "MiddleLeft" }, kids)
end

------------------------------------------------------------------------------------------------------------------------
-- Containers
------------------------------------------------------------------------------------------------------------------------
-- Vertical stack. o = { w, pad, gap, bg, id, outline, align, active, minH, h (fixed) }
function KT.vstack(children, o)
    o = o or {}
    local p, gap = pad(o.pad), o.gap or 0
    local h = p[3] + p[4]
    local kept = compact(children)
    for _, c in ipairs(kept) do h = h + prefH(c) end
    h = h + math.max(0, #kept - 1) * gap
    if o.minH then h = math.max(h, o.minH) end
    if o.h and o.h > h then
        -- Absorb the leftover height so no child gets stretched.
        kept[#kept + 1] = node("Panel", { preferredHeight = "0", flexibleHeight = "1", color = KT.c.clear })
    end
    if o.h then h = o.h end
    return node("VerticalLayout", {
        id = o.id, preferredHeight = num(h), preferredWidth = o.w and num(o.w) or nil,
        padding = p[1] .. " " .. p[2] .. " " .. p[3] .. " " .. p[4], spacing = num(gap),
        childForceExpandWidth = o.stretch == false and "false" or "true", childForceExpandHeight = "false",
        childAlignment = o.align or "UpperLeft", color = o.bg or KT.c.clear,
        outline = o.outline, outlineSize = o.outline and "1 1" or nil, active = o.active == false and "false" or nil,
        flexibleWidth = o.flex and num(o.flex) or nil, tooltip = o.tooltip,
        raycastTarget = (o.raycast or o.tooltip) and "true" or "false",
    }, kept)
end

-- Horizontal row. Children carry preferredWidth or flexibleWidth. o = { h, pad, gap, bg, id, align, outline }
function KT.hstack(children, o)
    o = o or {}
    local p, gap = pad(o.pad), o.gap or 0
    local h = o.h
    local kept = compact(children)
    if not h then
        h = 0
        for _, c in ipairs(kept) do h = math.max(h, prefH(c)) end
        h = h + p[3] + p[4]
    end
    return node("HorizontalLayout", {
        id = o.id, preferredHeight = num(h), preferredWidth = o.w and num(o.w) or nil,
        padding = p[1] .. " " .. p[2] .. " " .. p[3] .. " " .. p[4], spacing = num(gap),
        childForceExpandWidth = "false", childForceExpandHeight = o.stretch == false and "false" or "true",
        childAlignment = o.align or "MiddleLeft", color = o.bg or KT.c.clear,
        outline = o.outline, outlineSize = o.outline and "1 1" or nil, active = o.active == false and "false" or nil,
        flexibleWidth = o.flex and num(o.flex) or nil, raycastTarget = o.raycast and "true" or "false",
    }, kept)
end

-- Fixed-size absolutely positioned panel (only for shells: dock, rail, overlays).
function KT.panel(children, o)
    o = o or {}
    return node("Panel", {
        id = o.id, width = o.w and num(o.w) or nil, height = o.h and num(o.h) or nil,
        rectAlignment = o.anchor or "UpperLeft", offsetXY = o.x and (num(o.x) .. " " .. num(-(o.y or 0))) or nil,
        color = o.bg or KT.c.clear, visibility = o.visibility, active = o.active == false and "false" or nil,
        outline = o.outline, outlineSize = o.outline and "1 1" or nil,
        shadow = o.shadow and "#000000AA" or nil, shadowDistance = o.shadow and "0 -8" or nil,
        preferredHeight = o.h and num(o.h) or nil, preferredWidth = o.w and num(o.w) or nil,
        flexibleWidth = o.flex and num(o.flex) or nil, raycastTarget = o.raycast == false and "false" or "true",
        showAnimation = o.anim, hideAnimation = o.anim and "FadeOut" or nil, animationDuration = o.anim and "0.15" or nil,
    }, children)
end

-- Scroll area: viewport w×h, content is a vstack (its preferredHeight sizes the scroll content).
function KT.scroll(content, o)
    local ch = math.max(prefH(content), o.h)
    content.attributes.height = num(ch)
    content.attributes.width = num(o.w - 10)
    content.attributes.rectAlignment = "UpperLeft"
    content.attributes.contentSizeFitter = "vertical"
    -- The mouse wheel reaches the ScrollRect only through a raycast target under the pointer. Decorative children
    -- are non-raycast (so clicks reach row buttons), therefore the content itself must catch the pointer; a fully
    -- transparent colour may be skipped by TTS, so use alpha 1/255.
    content.attributes.raycastTarget = "true"
    if content.attributes.color == nil or content.attributes.color == KT.c.clear then content.attributes.color = "#00000001" end
    return node("VerticalScrollView", {
        id = o.id, width = num(o.w), height = num(o.h), preferredHeight = num(o.h), preferredWidth = num(o.w),
        rectAlignment = o.anchor or "UpperLeft", offsetXY = o.x and (num(o.x) .. " " .. num(-(o.y or 0))) or nil,
        horizontal = "false", vertical = "true", movementType = "Clamped", scrollSensitivity = "32",
        verticalScrollbarVisibility = "AutoHideAndExpandViewport", horizontalScrollbarVisibility = "AutoHide",
        color = "#00000001", raycastTarget = "true", scrollbarBackgroundColor = "#00000001",
        scrollbarColors = KT.c.s3 .. "|" .. KT.c.dim .. "|" .. KT.c.accent .. "|" .. KT.c.s3,
    }, { content })
end

------------------------------------------------------------------------------------------------------------------------
-- Controls
------------------------------------------------------------------------------------------------------------------------
local BTN = {
    primary = { colors = "#F26522|#FF8443|#D9531A|#5A3A2A", text = "#140B06" },
    secondary = { colors = "#23292F|#2C333A|#343C44|#1A1E22", text = "#ECEFF1" },
    ghost = { colors = "#00000000|#23292F|#2C333A|#00000000", text = "#98A3AC" },
    tab = { colors = "#00000000|#171A1D|#1A1E22|#00000000", text = "#98A3AC" },
    tabOn = { colors = "#1A1E22|#1A1E22|#1A1E22|#1A1E22", text = "#ECEFF1" },
    row = { colors = "#23292F|#2C333A|#343C44|#23292F", text = "#ECEFF1" },
    rowOn = { colors = "#2C333A|#343C44|#343C44|#2C333A", text = "#ECEFF1" },
    danger = { colors = "#3A1714|#4A1D19|#5A231E|#2A1210", text = "#FF5A4E" },
}
KT.buttonStyles = BTN

-- o = { id, kind, w, h, enabled, size, align, tooltip, flex, bold }
-- Text inside a button cannot be measured by Unity for layout, so width must be explicit or flexible.
function KT.button(label, o)
    o = o or {}
    local st = BTN[o.kind or "secondary"]
    local enabled = o.enabled ~= false
    return node("Button", {
        id = o.id, text = str(label), onClick = enabled and KT.clickTarget() or nil,
        colors = st.colors, textColor = enabled and st.text or KT.c.dim, interactable = enabled and "true" or "false",
        fontSize = num(o.size or KT.fs.m), fontStyle = o.bold == false and "Normal" or "Bold",
        textAlignment = o.align or "MiddleCenter",
        preferredHeight = num(o.h or 40), preferredWidth = o.w and num(o.w) or nil, minWidth = o.w and num(o.w) or nil,
        flexibleWidth = o.flex and num(o.flex) or nil,
        tooltip = o.tooltip, tooltipPosition = o.tooltip and (o.tooltipPosition or "Right") or nil,
        tooltipOffset = o.tooltip and "12" or nil,
        tooltipBackgroundColor = o.tooltip and "#0D0F10F2" or nil, tooltipTextColor = o.tooltip and KT.c.fg or nil,
        tooltipBorderColor = o.tooltip and KT.c.line or nil,
        outline = o.kind ~= "primary" and o.kind ~= "ghost" and o.kind ~= "tab" and o.kind ~= "tabOn" and KT.c.line or nil,
        outlineSize = "1 1",
    })
end

-- Small tag. kind: neutral|acc|ok|hurt|mute
local CHIP = {
    neutral = { KT.c.s3, KT.c.fg }, acc = { KT.c.accentLo, KT.c.accentHi }, ok = { KT.c.okLo, KT.c.ok },
    hurt = { KT.c.hurtLo, KT.c.hurt }, mute = { KT.c.clear, KT.c.muted }, cost = { KT.c.accentLo, KT.c.accentHi },
}
function KT.chip(label, kind, o)
    o = o or {}
    local cs = CHIP[kind or "neutral"] or CHIP.neutral
    local text = str(label)
    local size = o.size or KT.fs.xs
    local w = math.ceil(KT.textWidth(text, size, true) + 14)
    local h = o.h or (size + 10)
    return node("Panel", {
        id = o.id, color = cs[1], preferredWidth = num(w), minWidth = num(w), preferredHeight = num(h),
        outline = kind == "mute" and KT.c.line or nil, outlineSize = kind == "mute" and "1 1" or nil,
        tooltip = o.tooltip, raycastTarget = o.tooltip and "true" or "false",
    }, {
        node("Text", { id = o.id and (o.id .. "_t") or nil, text = text, fontSize = num(size), fontStyle = "Bold",
            color = cs[2], alignment = "MiddleCenter", raycastTarget = "false" }),
    }), w
end

-- Row of chips that wraps onto several lines inside width w.
function KT.chips(list, w, gap)
    gap = gap or 6
    local rows, row, rowW = {}, {}, 0
    for _, spec in ipairs(list) do
        local chipNode, cw = KT.chip(spec[1], spec[2], spec[3])
        if #row > 0 and rowW + gap + cw > w then
            rows[#rows + 1] = KT.hstack(row, { gap = gap, stretch = false })
            row, rowW = {}, 0
        end
        row[#row + 1] = chipNode
        rowW = rowW + (rowW > 0 and gap or 0) + cw
    end
    if #row > 0 then rows[#rows + 1] = KT.hstack(row, { gap = gap, stretch = false }) end
    if #rows == 0 then return nil end
    return KT.vstack(rows, { gap = gap, w = w, stretch = false })
end

-- Wound / progress bar built from layout only: [fill | rest]. Patch id.."_fill" with KT.barFill(...).
function KT.bar(value, max, o)
    o = o or {}
    local w, h = o.w or 200, o.h or 6
    local fill = KT.barFill(value, max, w)
    return node("HorizontalLayout", {
        id = o.id, preferredHeight = num(h), preferredWidth = num(w), spacing = "0", raycastTarget = "false",
        childForceExpandWidth = "false", childForceExpandHeight = "true", color = KT.c.bg,
    }, {
        node("Image", { id = o.id and (o.id .. "_fill") or nil, preferredWidth = fill.preferredWidth, color = fill.color,
            raycastTarget = "false" }),
        node("Image", { flexibleWidth = "1", color = KT.c.bg, raycastTarget = "false" }),
    })
end
function KT.barFill(value, max, w)
    local pct = (max and max > 0) and math.max(0, math.min(1, (value or 0) / max)) or 0
    return {
        preferredWidth = num(math.floor(w * pct)),
        color = pct <= 0.34 and KT.c.hurt or pct <= 0.67 and KT.c.warn or KT.c.ok,
    }
end

-- Segmented control: options = { {key,label}, ... }; ids are prefix..key.
function KT.seg(options, selected, o)
    o = o or {}
    local kids = {}
    for _, opt in ipairs(options) do
        local on = opt[1] == selected
        kids[#kids + 1] = node("Panel", { flexibleWidth = "1", preferredHeight = num(o.h or 32), color = KT.c.clear }, {
            node("Button", {
                id = o.prefix .. opt[1], text = opt[2], onClick = KT.clickTarget(),
                colors = on and (KT.c.s3 .. "|" .. KT.c.s3 .. "|" .. KT.c.s3 .. "|" .. KT.c.s3)
                    or (KT.c.bg .. "|" .. KT.c.s2 .. "|" .. KT.c.s3 .. "|" .. KT.c.bg),
                textColor = on and KT.c.fg or KT.c.muted, fontSize = num(KT.fs.s), fontStyle = "Bold",
            }),
            node("Image", { rectAlignment = "LowerCenter", height = "2", width = "100%",
                color = on and KT.c.accent or KT.c.clear, raycastTarget = "false" }),
        })
    end
    return node("HorizontalLayout", { preferredHeight = num(o.h or 32), preferredWidth = o.w and num(o.w) or nil,
        spacing = "0", childForceExpandWidth = "true", childForceExpandHeight = "true", color = KT.c.bg,
        outline = KT.c.line, outlineSize = "1 1" }, kids)
end

-- Search field. Value comes back through onEndEdit (InputField passes the text).
function KT.search(id, value, placeholder, o)
    o = o or {}
    return node("InputField", {
        id = id, text = str(value or ""), placeholder = placeholder or "Поиск…",
        onEndEdit = KT.clickTarget(), onValueChanged = o.live and KT.clickTarget() or nil,
        colors = KT.c.bg .. "|" .. KT.c.s1 .. "|" .. KT.c.s1 .. "|" .. KT.c.bg,
        textColor = KT.c.fg, placeholderTextColor = KT.c.dim, fontSize = num(KT.fs.m),
        preferredHeight = num(o.h or 36), preferredWidth = o.w and num(o.w) or nil, flexibleWidth = o.w and nil or "1",
        outline = KT.c.line, outlineSize = "1 1", characterLimit = "60",
    })
end

function KT.icon(name, h, o)
    o = o or {}
    local ratio = KT.iconRatio[name] or 1
    return node("Image", { image = KT.icons[name], preserveAspect = "true", color = o.color,
        preferredHeight = num(h), preferredWidth = num(math.ceil(h * ratio)), raycastTarget = "false" })
end

-- Vertical stat cell: icon + label on top, big value below. Value text id = o.id.
function KT.stat(iconName, label, value, o)
    o = o or {}
    local top = KT.hstack({
        KT.icon(iconName, 11),
        node("Text", { text = label, fontSize = "10", fontStyle = "Bold", color = KT.c.muted, alignment = "MiddleLeft",
            preferredWidth = num(KT.textWidth(label, 10, true) + 2), raycastTarget = "false" }),
    }, { h = 14, gap = 4, align = "MiddleCenter" })
    return KT.vstack({
        top,
        node("Text", { id = o.id, text = str(value), fontSize = num(o.size or 18), fontStyle = "Bold", color = KT.c.fg,
            alignment = "MiddleCenter", preferredHeight = num((o.size or 18) + 6), raycastTarget = "false" }),
    }, { pad = { 4, 4, 7, 6 }, gap = 3, bg = KT.c.s1, w = o.w, flex = (not o.w) and 1 or nil, align = "MiddleCenter" })
end

-- Pips for AP: n total, used spent.
function KT.pips(total, used, o)
    o = o or {}
    local kids = {}
    for i = 1, total do
        kids[#kids + 1] = node("Image", { id = o.id and (o.id .. "_" .. i) or nil, preferredWidth = "22", preferredHeight = "10",
            color = i <= total - used and KT.c.accent or KT.c.s3, raycastTarget = "false" })
    end
    return KT.hstack(kids, { h = 10, gap = 4, stretch = false })
end

-- Empty state block.
function KT.empty(title, body, w)
    local inner = w - 32
    return KT.vstack({
        KT.text(title, { w = inner, size = KT.fs.m, bold = true, align = "UpperCenter" }),
        body and KT.text(body, { w = inner, size = KT.fs.s, color = KT.c.muted, align = "UpperCenter" }) or nil,
    }, { w = w, pad = { 16, 16, 20, 20 }, gap = 6, bg = KT.c.s1, outline = KT.c.line })
end

-- Card: vertical stack on surface-2 with hairline outline.
function KT.card(children, o)
    o = o or {}
    return KT.vstack(children, { w = o.w, pad = o.pad or 12, gap = o.gap or 10, bg = o.bg or KT.c.s2,
        outline = o.outline or KT.c.line, id = o.id })
end

-- Thin vertical colour stripe (for list rows / player sides).
function KT.stripe(color, w)
    return node("Image", { preferredWidth = num(w or 3), color = color, raycastTarget = "false" })
end

------------------------------------------------------------------------------------------------------------------------
-- Defaults block (mounted once with the hub; gives Unity sensible inherited styling for any plain element)
------------------------------------------------------------------------------------------------------------------------
function KT.defaults()
    return node("Defaults", {}, {
        node("Text", { class = "kt", color = KT.c.fg, fontSize = num(KT.fs.m) }),
        node("Button", { class = "kt", fontSize = num(KT.fs.m), fontStyle = "Bold" }),
    })
end

-- Utility for shells: escape user strings that will be shown inside rich text.
function KT.esc(s)
    s = str(s or "")
    local parts, pos = {}, 1
    while true do
        local lt = s:find("<", pos, true)
        if not lt then parts[#parts + 1] = s:sub(pos); break end
        parts[#parts + 1] = s:sub(pos, lt - 1) .. "‹"
        pos = lt + 1
    end
    return table.concat(parts)
end

-- Formatted rule text when ui/rich.lua is loaded; plain measured text otherwise.
function KT.ruleText(body, o)
    if KT.rich then return KT.rich(body, o) end
    return KT.text(body or "", { w = o.w, size = o.size, color = o.color or "#D5DADD" })
end
end
