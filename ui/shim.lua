--[[RU-UI:shim:BEGIN]]
do
    local ruUiReal=Global and Global.UI or UI
    local ruUiProxy={}
    local function ruUiOwner()
        if self and self.getGUID then return self.getGUID() end
        return "RuUi:unavailable-self"
    end
    local function ruUiAvailable()
        -- Probe only availability; errors in the requested operation propagate normally.
        if not Global or not Global.call then return false end
        if Global.getVar then return Global.getVar("ruUiComposerReady")==true end
        local ok,value=pcall(Global.call,"ruUiLoading")
        return ok and type(value)=="boolean"
    end
    for _,op in ipairs({"setXmlTable","getXmlTable","setXml","getXml","setAttribute","setAttributes","getAttribute",
        "getAttributes","setValue","getValue","setClass","show","hide"}) do
        local operation=op
        ruUiProxy[operation]=function(...)
            if ruUiAvailable() then
                return Global.call("ruUiLegacy",{owner=ruUiOwner(),op=operation,args={...}})
            end
            local real=Global and Global.UI or ruUiReal
            return real[operation](...)
        end
    end
    UI=setmetatable(ruUiProxy,{__index=function(_,key)
        if key=="loading" and ruUiAvailable() then return Global.call("ruUiLoading") end
        local real=Global and Global.UI or ruUiReal
        return real[key]
    end})
end
--[[RU-UI:shim:END]]
