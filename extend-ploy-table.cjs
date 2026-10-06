const fs=require('fs'),assert=require('assert');
module.exports=function(table){
 const button=table.ObjectStates.find(o=>o.GUID==='bc18b1'),round=table.ObjectStates.find(o=>o.GUID==='d2682e');assert(button&&round);
 const anchor='function onLoad()';assert.equal(button.LuaScript.split(anchor).length-1,1);
 button.LuaScript=button.LuaScript.replace(anchor,anchor+`
  self.createButton({label="УЛОВКИ",click_function="ruTablePloys",function_owner=self,
    position={0,1,-1.6},width=1100,height=420,font_size=200,
    color={0.83,0.29,0.04},font_color={1,1,1},
    tooltip="Стратегические и боевые уловки вашего отряда"})
`)+`
function ruTablePloys(_,color)
  local hud=getObjectFromGUID('efa3fe')
  if hud then hud.call('ruOpenPloys',{color=color}) end
end
`;
 const roundAnchor='function roundEnd(player, color)';assert.equal(round.LuaScript.split(roundAnchor).length-1,1);
 round.LuaScript=round.LuaScript.replace(roundAnchor,roundAnchor+`
    local ruHud=getObjectFromGUID('efa3fe')
    if ruHud then ruHud.call('ruPloysRoundEnd') end
`);
 return {physicalButtonGUID:button.GUID,roundEndGUID:round.GUID,screenLauncher:true,teamPloys:328,commandReroll:true,manualCP:true};
};
