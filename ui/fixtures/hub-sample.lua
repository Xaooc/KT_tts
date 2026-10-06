-- Sample view-models for every hub tab (used by check-hub-views.cjs to render previews). Mirrors design/hub-mockup.html.
HubSample = {}

local status = {
    eyebrow = "РАУНД 2 / 4 · ПЕРЕСТРЕЛКА",
    sides = {
        { name = "Круг Иеротек", colorKey = "Red", cp = 2, vp = 7, turn = true },
        { name = "Ангелы смерти", colorKey = "Blue", cp = 3, vp = 5 },
    },
}

local squad = {
    { guid = "a1", name = "Бессмертный деспотек", wounds = 12, maxWounds = 13, order = "Engage", state = "used" },
    { guid = "a2", name = "Хрономант", wounds = 9, maxWounds = 9, order = "Conceal", state = "ready", canActivate = true },
    { guid = "a3", name = "Страж-бессмертный", wounds = 7, maxWounds = 10, order = "Engage", state = "active" },
    { guid = "a4", name = "Страж-бессмертный", wounds = 10, maxWounds = 10, order = "Engage", state = "ready", canActivate = true },
    { guid = "a5", name = "Метчик смерти", wounds = 3, maxWounds = 10, order = "Conceal", state = "ready", injured = true,
        injuryNote = "Травмирован: −2\" к движению, −1 к попаданию. Правило отряда может отменить.",
        canActivate = true },
    { guid = "a6", name = "Плазмацит-реаниматор", wounds = 0, maxWounds = 5, order = "Conceal", state = "down" },
    { guid = "a7", name = "Подмастерье", wounds = 8, maxWounds = 8, order = "Engage", state = "used" },
}

local enemyUnits = {
    { guid = "b1", name = "Капитан", wounds = 15, maxWounds = 15, order = "Engage", state = "used" },
    { guid = "b2", name = "Сержант-ветеран", wounds = 8, maxWounds = 14, order = "Engage", state = "ready" },
    { guid = "b3", name = "Штурмовой интерцессор", wounds = 14, maxWounds = 14, order = "Conceal", state = "ready" },
    { guid = "b4", name = "Элиминатор", wounds = 0, maxWounds = 13, order = "Conceal", state = "down" },
    { guid = "b5", name = "Интерцессор-гренадер", wounds = 6, maxWounds = 14, order = "Engage", state = "used", injured = true },
}

local livingLightning = "<b>Эффект</b>\nПримените, когда дружественный <b>Бессмертный</b> (IMMORTAL) из Круга Иеротек выполняет "
    .. "действие «Стрелять» и выбирает карабин Теслы. До конца действия оружие теряет дистанционное условие 2\" у правила "
    .. "<b>Взрыв</b> и получает <b>Беспощадное</b>.\n\n<b>Описание</b>\nМолнии с треском перескакивают между целями."

local function base(tab)
    return { color = "Red", state = "open", tab = tab, status = status }
end

function HubSample.turn()
    local vm = base("turn")
    vm.turn = {
        mode = "activation",
        unit = { name = "Страж-бессмертный", english = "Immortal Guardian", order = "Engage", state = "active",
            apl = 2, move = "5\"", save = "3+", wounds = 7, maxWounds = 10 },
        apTotal = 2, apLeft = 1,
        weapons = {
            { key = "w1", name = "Карабин Теслы", english = "Tesla carbine", kind = "ranged", a = 4, bs = "3+", d = "5/2",
                selected = true, tip = "Взрыв 2\": атака по цели и всем в пределах 2\". Беспощадное: перебросьте любые промахи." },
            { key = "w2", name = "Штык", english = "Bayonet", kind = "melee", a = 3, bs = "3+", d = "3/4" },
        },
        actions = {
            { key = "reposition", label = "Перемещение", cost = 1, state = "done" },
            { key = "dash", label = "Рывок", cost = 1, state = "disabled", tip = "Нельзя после перемещения в этой активации" },
            { key = "shoot", label = "Стрельба", cost = 1, state = "available" },
            { key = "fight", label = "Ближний бой", cost = 1, state = "available" },
            { key = "charge", label = "Натиск", cost = 1, state = "disabled" },
            { key = "fallback", label = "Отступление", cost = 2, state = "disabled", tip = "Нужно 2 AP" },
            { key = "mission", label = "Миссия / уникальное действие", cost = 1, state = "available", wide = true },
        },
        effects = { { id = "e1", title = "Неумолимое наступление", expiry = "До конца раунда · уловка" } },
        advanced = { open = false },
    }
    vm.toast = { title = "Перемещение выполнено", body = "Страж-бессмертный · −1 AP" }
    vm.foot = { { cmd = "tab", arg = "ploys", label = "Уловки" },
        { cmd = "finish", label = "Завершить активацию", kind = "primary", flex = true } }
    return vm
end

function HubSample.turnPending()
    local vm = HubSample.turn()
    vm.toast = nil
    vm.turn.pending = { label = "Стрельба", weapon = "Карабин Теслы" }
    vm.foot = { { cmd = "tab", arg = "ploys", label = "Уловки" },
        { cmd = "finishaction", label = "Завершить стрельбу", kind = "primary", flex = true } }
    return vm
end

function HubSample.turnIdle()
    local vm = base("turn")
    local ready = {}
    for _, u in ipairs(squad) do if u.state == "ready" then ready[#ready + 1] = u end end
    vm.turn = { mode = "idle", myTurn = true, ready = ready,
        counter = { { guid = "a7", name = "Подмастерье", wounds = 8, maxWounds = 8, order = "Engage", state = "used", canActivate = true } } }
    vm.foot = { { cmd = "passcounter", label = "Пропустить контрдействие", flex = true } }
    return vm
end

function HubSample.turnPhase()
    local vm = base("turn")
    vm.status = { eyebrow = "РАУНД 3 / 4 · СТРАТЕГИЯ · ГАМБИТЫ", sides = status.sides }
    vm.turn = { mode = "phase", title = "Стратегические гамбиты",
        text = "Игроки по очереди применяют стратегические уловки или пасуют. Два паса подряд начинают перестрелку.",
        buttons = { { cmd = "tab", arg = "ploys", label = "Выбрать стратегическую уловку", kind = "primary" },
            { cmd = "passgambit", label = "Пас" } },
        waiting = "Сейчас очередь: Круг Иеротек" }
    vm.foot = { { note = "Доступно 4 CP" } }
    return vm
end

function HubSample.setup()
    local vm = base("turn")
    vm.status = { eyebrow = "ПОМОЩНИК НЕ ЗАПУЩЕН", sides = {
        { name = "Круг Иеротек", colorKey = "Red", cp = 3, vp = 0 }, { name = "Ангелы смерти", colorKey = "Blue", cp = 3, vp = 0 } } }
    vm.turn = { mode = "setup", isHost = true, round = 1, phaseIndex = 1,
        phaseLabels = { "Стратегия · инициатива", "Стратегия · готовность", "Стратегия · гамбиты", "Перестрелка", "Конец раунда · подсчёт очков" },
        turnLabels = { "Красный", "Синий" }, turnIndex = 1 }
    vm.foot = { { cmd = "start", label = "Начать партию", kind = "primary", flex = true } }
    return vm
end

function HubSample.squad()
    local vm = base("squad")
    vm.squad = { team = "Круг Иеротек", summary = "6 из 7 в строю · 3 готовы", seg = "all", units = squad }
    vm.foot = { { cmd = "begin", arg = "a2", label = "Начать активацию: Хрономант", kind = "primary", flex = true } }
    return vm
end

function HubSample.ploys()
    local vm = base("ploys")
    vm.ploys = { seg = "fire", note = "Сейчас ход соперника: ответные уловки доступны.", items = {
        { key = "p1", name = "Живая молния", english = "Living Lightning", cost = 1, open = true, usable = true,
            body = livingLightning, terms = { { "t1", "Бессмертный" }, { "t2", "Взрыв" }, { "t3", "Беспощадное" } }, expiry = "action",
            needsTarget = true, targetGuid = "a3", targets = { { guid = "a3", name = "Страж-бессмертный" },
                { guid = "a4", name = "Страж-бессмертный" }, { guid = "a6", name = "Плазмацит-реаниматор", state = "down" } } },
        { key = "p2", name = "Контроль корой", english = "Cortical Control", cost = 1 },
        { key = "p3", name = "Повторно активированная функция", english = "Reanimated Function", cost = 1 },
        { key = "p4", name = "Межпространственная засада", english = "Dimensional Ambush", cost = 1, used = true },
        { key = "p5", name = "Командный переброс", english = "Command Re-roll", cost = 1, pinned = true },
    } }
    vm.foot = { { note = "Доступно 2 CP · Командный переброс: 0 из 1" } }
    return vm
end

function HubSample.enemy()
    local vm = base("enemy")
    vm.enemy = { name = "Ангелы смерти", colorKey = "Blue", sub = "Синий · 3 CP · 5 VP · тактика «Агрессивный»", seg = "ops",
        units = enemyUnits }
    vm.foot = { { cmd = "enemyref", label = "Открыть отряд в справочнике", flex = true } }
    return vm
end

function HubSample.log()
    local vm = base("log")
    vm.log = { seg = "events", groups = {
        { title = "Раунд 2 · Перестрелка", entries = {
            { side = "Red", title = "<b>Страж-бессмертный</b>: Перемещение", sub = "Красный · активация 4", delta = "1 AP" },
            { side = "Blue", title = "<b>Сержант-ветеран</b>: Стрельба по Метчику смерти", sub = "Синий · урон 7, WND 10 → 3",
                delta = "−7 WND", neg = true },
            { side = "Red", title = "Уловка <b>Неумолимое наступление</b>", sub = "Красный · гамбит", delta = "−1 CP", neg = true },
            { side = "Blue", title = "Инициатива: <b>Синий</b>", sub = "+1 CP Синему, +2 CP Красному", delta = "+CP" },
        } },
        { title = "Раунд 1", entries = {
            { side = "Red", title = "Очки за критическую операцию", sub = "Красный · подсчёт", delta = "+2 VP" },
            { side = "Blue", title = "<b>Элиминатор</b> выведен из строя", sub = "Синий", delta = "выведен", neg = true },
        } },
    } }
    vm.foot = { { note = "VP берутся из табло стола, CP — из учёта помощника." } }
    return vm
end

function HubSample.score()
    local vm = HubSample.log()
    vm.log.seg = "score"
    vm.log.score = { names = { red = "Круг Иеротек", blue = "Ангелы смерти" },
        rows = { { label = "1", rcp = "3 → 1", rvp = 4, bcp = "3 → 2", bvp = 3 }, { label = "2", rcp = "3 → 2", rvp = 3, bcp = "3 → 3", bvp = 2 },
            { label = "3", rcp = "—", rvp = "—", bcp = "—", bvp = "—" }, { label = "4", rcp = "—", rvp = "—", bcp = "—", bvp = "—" } },
        total = { rvp = 7, bvp = 5 },
        sources = { { label = "Критическая операция", r = 4, b = 3 }, { label = "Тактическая операция", r = 2, b = 1 },
            { label = "Операция на убийство", r = 1, b = 1 } } }
    return vm
end

function HubSample.ref()
    local vm = base("ref")
    vm.ref = { scope = "team", query = "реаним", count = 4,
        scopes = { { "model", "Модель" }, { "weapon", "Оружие" }, { "team", "Отряд" }, { "ploy", "Уловки" }, { "eq", "Снаряжение" },
            { "faq", "FAQ" } },
        results = {
            { key = "r1", title = "Плазмацит-реаниматор — Реанимация", english = "Plasmacyte Reanimator — Reanimate", on = true },
            { key = "r2", title = "Протоколы реанимации", english = "Reanimation Protocols" },
            { key = "r3", title = "Повторно активированная функция", english = "Reanimated Function · уловка" },
            { key = "r4", title = "Живой металл", english = "Living Metal" },
        },
        article = { label = "ОТРЯД", team = "Круг Иеротек", title = "Плазмацит-реаниматор — Реанимация",
            english = "Plasmacyte Reanimator — Reanimate", cost = "1/2 AP",
            body = "Выберите свой маркер Реанимации, <b>видимый</b> этому оперативнику и находящийся <b>в пределах</b> 6\". "
                .. "Бросьте D6: при результате 3+ дружественный оперативник РЕАНИМИРУЕТСЯ. Если потратить ещё 1 AP, он "
                .. "реанимируется без броска.\n\nЕсли этот боец уже был использован в текущем раунде, после реанимации выставьте "
                .. "его использованным. Нельзя выполнять в <b>зоне контроля</b> врага.",
            terms = { { "g1", "Видимый" }, { "g2", "В пределах" }, { "g3", "Зона контроля" } },
            weapons = { { kind = "ranged", name = "Пистолет-гаусс", a = 4, bs = "3+", d = "3/4", traits = { "Дистанция 6\"", "Убойное" } },
                { kind = "melee", name = "Клинки", a = 3, bs = "4+", d = "3/5" } } },
        term = { title = "Зона контроля", english = "Control range",
            body = "Расстояние 1\" от оперативника, при этом он должен его видеть. Пока враг в зоне контроля, нельзя выполнять ряд действий." },
    }
    return vm
end

function HubSample.rail()
    local vm = base("turn")
    vm.state = "rail"
    return vm
end

function HubSample.all()
    local out = {}
    for _, name in ipairs({ "setup", "turn", "turnPending", "turnIdle", "turnPhase", "squad", "ploys", "enemy", "log", "score", "ref",
        "rail" }) do
        out[name] = { KT.hub.dock(HubSample[name]()) }
    end
    return out
end

function HubSample.datasheet()
    return KT.ds.view({
        color = "Red", name = "Страж-бессмертный", english = "Immortal Guardian", team = "Круг Иеротек",
        apl = 2, move = "5\"", save = "3+", wounds = 10,
        weapons = {
            { index = 1, kind = "ranged", name = "Карабин Теслы", a = 4, bs = "3+", d = "5/2",
                traits = { { label = "Взрыв 2\"", key = "blast" }, { label = "Беспощадное", key = "relentless" } } },
            { index = 2, kind = "melee", name = "Штык", a = 3, bs = "3+", d = "3/4" },
        },
        abilities = {
            { title = "Живой металл", english = "Living Metal",
                body = "В шаге «Готовность» каждого раунда этот оперативник восстанавливает 2 потерянных WND." },
            { title = "Неумирающие",
                body = "Когда оперативник выведен из строя, поставьте маркер Реанимации на его месте." },
            { title = "Межпространственное командование", english = "Interstitial Command", cost = "1 AP",
                body = "ПОДДЕРЖКА. Выберите другого дружественного оперативника Круга Иеротек, видимого этому оперативнику. "
                    .. "До конца раунда при активации он может выполнить одно дополнительное действие «Перемещение» без затрат AP. "
                    .. "Это действие нельзя выполнять, пока оперативник находится в зоне контроля врага." },
        },
    })
end
