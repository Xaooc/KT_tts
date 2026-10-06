-- Read-only bridge: gameplay state is owned by the scoreboard assistant.
function ruAssistantRead(params)
    local color=params.color
    local ctx=RuPloySeats[color] or ruPloySeat(color)
    if ruReferenceTeams[params.team] then ctx.team=params.team end
    ctx.open=true;ctx.picker=not ctx.team;ctx.group="firefight";ctx.query="";ctx.selected=1
    if params.english and ctx.team then
        for _,entry in ipairs(ruReferenceTeams[ctx.team].entries or {}) do
            if entry.english==params.english then ctx.group=entry.ployType=="strategy" and "strategy" or "firefight";ctx.query=params.english;break end
        end
    end
    ruRenderPloys(color)
end
local ruLegacyLauncher=ruPloyLauncher
function ruPloyLauncher()
    local panel=ruLegacyLauncher();panel.attributes.offsetXY="436 -18"
    panel.children[1].attributes.text="Справочник / уловки"
    return panel
end
local ruAssistantOldRandomize=onOperativeRandomize
function onOperativeRandomize(params)
    ruAssistantOldRandomize(params)
    local operative=params[1];local board=getObjectFromGUID and getObjectFromGUID("339b7f")
    if board and operative and operative.getGUID then pcall(function() board.call("ruAssistantFocus",{guid=operative.getGUID(),color=params[2]}) end) end
end
