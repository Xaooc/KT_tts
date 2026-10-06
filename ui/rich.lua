do -- module scope: keeps this module's locals out of the object's main chunk (Lua allows 200 locals per function)
-- Rule text formatter: turns a rules string into readable blocks instead of one wall of text.
--   * "<b>Эффект</b>" / short "Заголовок:" lines  -> small accent section labels ("Описание" makes the next block flavour)
--   * a leading "1 AP, ПОДДЕРЖКА (SUPPORT)."       -> chips
--   * "- ", "• ", "▶ ", "◆ ", "■ ", "1. " lines      -> bullet rows
--   * long paragraphs                              -> one sentence per line
--   * "Нельзя…", "Это действие нельзя…", "…только один раз…" -> limitation block with a stripe
--   * "(ENGLISH)" asides are dimmed; distances, dice, thresholds and AP are bold
--   * a first line repeating the card title ("Название (English):") is dropped
-- Requires ui/kit.lua (KT.text, KT.vstack, KT.hstack, KT.chips, KT.stripe, KT.chars, KT.stripTags).
local RICH = { body = "#D5DADD", flavour = "#8E99A2", aside = "#7F8A93", limit = "#E8D9B0" }
KT.richColors = RICH

local function trim(s)
    local a, b = 1, #s
    while a <= b do
        local ch = s:sub(a, a)
        if ch ~= " " and ch ~= "\t" and ch ~= "\r" then break end
        a = a + 1
    end
    while b >= a do
        local ch = s:sub(b, b)
        if ch ~= " " and ch ~= "\t" and ch ~= "\r" then break end
        b = b - 1
    end
    return s:sub(a, b)
end

-- Cyrillic-aware case folding (MoonSharp's string.lower/upper may leave Cyrillic untouched).
local UPPER = { "А","Б","В","Г","Д","Е","Ё","Ж","З","И","Й","К","Л","М","Н","О","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ",
    "Ъ","Ы","Ь","Э","Ю","Я" }
local LOWER = { "а","б","в","г","д","е","ё","ж","з","и","й","к","л","м","н","о","п","р","с","т","у","ф","х","ц","ч","ш","щ",
    "ъ","ы","ь","э","ю","я" }
local TO_LOWER, TO_UPPER = {}, {}
for i, u in ipairs(UPPER) do TO_LOWER[u] = LOWER[i]; TO_UPPER[LOWER[i]] = u end
function KT.fold(s)
    local out = {}
    for _, ch in ipairs(KT.chars(tostring(s or ""))) do out[#out + 1] = TO_LOWER[ch] or ch:lower() end
    return table.concat(out)
end
function KT.upper(s)
    local out = {}
    for _, ch in ipairs(KT.chars(tostring(s or ""))) do out[#out + 1] = TO_UPPER[ch] or ch:upper() end
    return table.concat(out)
end
local function isUpperChar(ch) return TO_LOWER[ch] ~= nil or (ch ~= ch:lower()) end

local function startsWith(s, prefix) return s:sub(1, #prefix) == prefix end
local function isAscii(ch) local b = ch:byte(); return b ~= nil and b < 128 end

-- Dim parenthesised Latin asides: "оперативник (DARK COMMUNE)" -> grey aside.
local function dimAsides(s)
    local out, pos = {}, 1
    while true do
        local open = s:find("(", pos, true)
        if not open then out[#out + 1] = s:sub(pos); break end
        local close = s:find(")", open + 1, true)
        if not close then out[#out + 1] = s:sub(pos); break end
        local inner = s:sub(open + 1, close - 1)
        local latin = #inner > 0 and not inner:find("<", 1, true)
        if latin then
            for _, ch in ipairs(KT.chars(inner)) do if not isAscii(ch) then latin = false; break end end
        end
        out[#out + 1] = s:sub(pos, open - 1)
        out[#out + 1] = latin and ("<color=" .. RICH.aside .. ">(" .. inner .. ")</color>") or s:sub(open, close)
        pos = close + 1
    end
    return table.concat(out)
end

local function isDigit(ch) return ch ~= "" and ch >= "0" and ch <= "9" end
local function leadingNumber(w)
    local i = 1
    while isDigit(w:sub(i, i)) do i = i + 1 end
    return i - 1
end

-- Bold game numbers: 6", D3/D6, 3+, "1 AP", "2 CP", "6 дюймов".
local function boldNumbers(s)
    local words, out = {}, {}
    for _, w in ipairs(KT.split(s, " ")) do words[#words + 1] = w end
    local i = 1
    while i <= #words do
        local w, nextWord = words[i], words[i + 1] or ""
        local plain = not w:find("<", 1, true)
        local digits = leadingNumber(w)
        local after = w:sub(digits + 1, digits + 1)
        local first = w:sub(1, 1)
        if plain and digits > 0 and (after == "\"" or after == "+") then
            out[#out + 1] = "<b>" .. w .. "</b>"
        elseif plain and (first == "D" or first == "Д") and isDigit(w:sub(2, 2)) then
            out[#out + 1] = "<b>" .. w .. "</b>"
        elseif plain and digits > 0 and (startsWith(nextWord, "AP") or startsWith(nextWord, "CP")
            or startsWith(nextWord, "дюйм")) then
            out[#out + 1] = "<b>" .. w .. " " .. nextWord .. "</b>"
            i = i + 1
        else
            out[#out + 1] = w
        end
        i = i + 1
    end
    return table.concat(out, " ")
end

local function decorate(s) return boldNumbers(dimAsides(s)) end
KT.richDecorate = decorate

-- Sentence split that keeps "т. е.", "т. д.", "см." abbreviations intact; splits only before a capital/quote/tag.
local function sentences(p)
    local out, start, i = {}, 1, 1
    local n = #p
    while i <= n do
        local ch = p:sub(i, i)
        if (ch == "." or ch == "!" or ch == "?") and p:sub(i + 1, i + 1) == " " then
            local before = p:sub(math.max(1, i - 2), i - 1)
            local nextCh = KT.chars(p:sub(i + 2, i + 4))[1] or ""
            local abbreviation = before == " т" or before == " е" or before == " д" or before == " п" or before == "см"
                or before == "др"
            local upper = nextCh ~= "" and isUpperChar(nextCh)
            if not abbreviation and (upper or nextCh == "«" or nextCh == "<") then
                out[#out + 1] = trim(p:sub(start, i))
                start = i + 2
                i = i + 1
            end
        end
        i = i + 1
    end
    local rest = trim(p:sub(start))
    if rest ~= "" then out[#out + 1] = rest end
    return out
end

local function lowerRu(s) return KT.fold(s) end

local function isLimitation(s)
    local l = lowerRu(KT.stripTags(s))
    -- Only sentences that state a restriction up front; definitions merely mentioning one stay plain.
    return startsWith(l, "нельзя") or startsWith(l, "это действие нельзя") or startsWith(l, "этот приём нельзя")
        or startsWith(l, "это правило нельзя") or startsWith(l, "этот оперативник не может")
        or startsWith(l, "каждый дружественный оперативник может") and l:find("только один раз", 1, true) ~= nil
        or startsWith(l, "только один раз") or startsWith(l, "не более одного раза")
end

local BULLETS = { "- ", "• ", "▶ ", "◆ ", "■ ", "* ", "— " }
local function bulletOf(line)
    for _, b in ipairs(BULLETS) do
        if startsWith(line, b) then return "•", trim(line:sub(#b + 1)) end
    end
    local digits = leadingNumber(line)
    local mark = line:sub(digits + 1, digits + 2)
    if digits > 0 and digits <= 2 and (mark == ". " or mark == ") ") then
        return line:sub(1, digits) .. ".", trim(line:sub(digits + 3))
    end
    return nil
end

-- Card title without the English part and team prefix: "Плазмацит — Реанимация (Reanimate)" -> "реанимация".
local function baseTitle(t)
    t = KT.stripTags(t or "")
    local cut = t:find(" (", 1, true)
    if cut then t = t:sub(1, cut - 1) end
    local dash = t:find(" — ", 1, true)
    if dash then t = t:sub(dash + #" — ") end
    if t:sub(-1) == ":" then t = t:sub(1, -2) end
    return lowerRu(trim(t))
end

-- o = { w, size, color, title (card title, used to drop a repeated first line), gap }
function KT.rich(text, o)
    o = o or {}
    local w, size = o.w or 300, o.size or KT.fs.m
    local color = o.color or RICH.body
    local blocks = {}
    local flavour = false
    local titleKey = o.title and baseTitle(o.title) or nil
    local first = true

    local function para(t)
        blocks[#blocks + 1] = KT.text(decorate(t), { w = w, size = size, color = flavour and RICH.flavour or color,
            italic = flavour })
    end
    local function limitation(t)
        local inner = w - 13
        blocks[#blocks + 1] = KT.hstack({
            KT.stripe(KT.c.warn, 3),
            KT.vstack({ KT.text(decorate(t), { w = inner, size = size - 1, color = RICH.limit }) }, { w = inner }),
        }, { gap = 10, stretch = true, align = "UpperLeft" })
    end
    local function bullet(marker, t)
        local mw = marker == "•" and 12 or 20
        local inner = w - mw - 6
        blocks[#blocks + 1] = KT.hstack({
            KT.node("Text", { text = marker, fontSize = tostring(size), fontStyle = "Bold", color = KT.c.accent,
                alignment = "UpperLeft", preferredWidth = tostring(mw), raycastTarget = "false" }),
            KT.vstack({ KT.text(decorate(t), { w = inner, size = size, color = color }) }, { w = inner }),
        }, { gap = 6, stretch = true, align = "UpperLeft" })
    end
    local function heading(t)
        local label = trim(KT.stripTags(t))
        if label:sub(-1) == ":" then label = label:sub(1, -2) end
        local l = lowerRu(label)
        flavour = l == "описание" or l == "description"
        blocks[#blocks + 1] = KT.node("Text", { text = KT.upper(label), fontSize = "11", fontStyle = "Bold",
            color = flavour and KT.c.dim or KT.c.accentHi, alignment = "LowerLeft", preferredHeight = "18",
            preferredWidth = tostring(w), raycastTarget = "false" })
    end
    -- "1 AP, ПОДДЕРЖКА (SUPPORT). Rest…" -> chips + rest
    local function lead(line)
        local stop = line:find(". ", 1, true)
        if not stop or stop > 80 then return line end
        local head = line:sub(1, stop - 1)
        local digits = leadingNumber(head)
        local isCost = digits > 0 and head:find("AP", 1, true) ~= nil and head:find("AP", 1, true) <= digits + 5
        local firstWord = head
        for _, sep in ipairs({ " ", ",", "(" }) do
            local at = firstWord:find(sep, 1, true)
            if at then firstWord = firstWord:sub(1, at - 1) end
        end
        local isKeyword = #KT.chars(firstWord) >= 4 and KT.upper(firstWord) == firstWord and KT.fold(firstWord) ~= firstWord
        if not isCost and not isKeyword then return line end
        local chips = {}
        for _, part in ipairs(KT.split(head, ",")) do
            local p = trim(part)
            local cut = p:find(" (", 1, true)
            if cut then p = p:sub(1, cut - 1) end
            if p ~= "" then chips[#chips + 1] = { p, p:find("AP", 1, true) and "cost" or "neutral", { size = 11 } } end
        end
        local row = KT.chips(chips, w, 6)
        if row then blocks[#blocks + 1] = row end
        return trim(line:sub(stop + 2))
    end

    for _, raw in ipairs(KT.split(tostring(text or ""), "\n", true)) do
        local line = trim(raw)
        if line ~= "" then
            local plain = trim(KT.stripTags(line))
            local boldOnly = startsWith(line, "<b>") and line:sub(-4) == "</b>" and not line:sub(4, -5):find("<", 1, true)
            local isHeading = boldOnly or (plain:sub(-1) == ":" and #plain <= 40)
            if first and titleKey and isHeading and baseTitle(plain) == titleKey then
                -- repeats the card title: skip
            elseif isHeading and plain ~= "" then
                heading(line)
            else
                if first and titleKey then
                    -- "Кулак Патриарха (Fist of the Patriarch): …" repeating the title
                    local colon = line:find(":", 1, true)
                    if colon and colon < 90 and baseTitle(line:sub(1, colon - 1)) == titleKey then
                        line = trim(line:sub(colon + 1))
                    end
                end
                local marker, rest = bulletOf(line)
                if marker then
                    if isLimitation(rest) then limitation(rest) else bullet(marker, rest) end
                elseif line ~= "" then
                    if not flavour then line = lead(line) end
                    local parts = (not flavour and #KT.stripTags(line) > 120) and sentences(line) or { line }
                    for _, s in ipairs(parts) do
                        if not flavour and isLimitation(s) then limitation(s) else para(s) end
                    end
                end
            end
            first = false
        end
    end
    if #blocks == 0 then return KT.text("", { w = w, size = size }) end
    return KT.vstack(blocks, { w = w, gap = o.gap or 6 })
end
end
