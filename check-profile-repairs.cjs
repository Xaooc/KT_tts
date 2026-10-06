const fs=require('fs'),assert=require('assert/strict');
const pack=JSON.parse(fs.readFileSync('output/KT41-RU-preview-3.json','utf8'));
// Card profile order: Move, APL, Save, Wounds. These are independent of hidden source state.
const expected={
  '7652ba':[6,2,3,9],'d94e1c':[6,2,5,9],'289587':[6,2,5,9],'7c9716':[6,2,5,10],
  '60ccad':[8,2,2,5],'ac2e70':[6,2,5,9],'d8f05b':[6,2,5,9],'87e473':[6,2,5,9],
  'c5d4d7':[6,2,5,9],'438aed':[6,2,5,9],
  '7506bd':[5,3,3,14],'5f35f7':[5,3,3,14],'0e43c7':[5,3,3,14],'fffb0a':[5,3,3,14],
  'b3db26':[5,3,3,14],'96fe20':[5,3,3,14],'883c89':[5,3,3,15]
};
let checked=0;
function visit(v){if(!v||typeof v!=='object')return;
  if(expected[v.GUID]){
    const s=JSON.parse(v.LuaScriptState),[M,APL,SV,W]=expected[v.GUID];
    assert.deepEqual([s.stats.Move,s.stats.APL,s.stats.Save,s.stats.Wounds],[M,APL,SV,W]);
    assert.deepEqual([Number(s.info.stats.M),Number(s.info.stats.APL),parseInt(s.info.stats.SV),Number(s.info.stats.W)],[M,APL,SV,W]);
    for(const w of s.info.weapons){assert.equal(typeof w.stats.ATK,'number');assert.equal(typeof w.stats.HIT,'number');assert.match(w.stats.DMG,/^\d+\/\d+$/);assert.ok(!/Mace of the Righteous|Surgical saw|Flensing blades|Missile launcher/.test(w.name));}
    if(v.GUID==='60ccad'){assert.equal(s.info.weapons.length,1);assert.equal(s.info.weapons[0].name,'(M) Ram');}
    if(v.GUID==='fffb0a')assert.ok(!s.info.rules.Heavy,'Heavy Gunner title must not grant Heavy');
    assert.ok(!/NOVITIATE|Disgusting Vigour/.test(JSON.stringify([s.info.abilities,s.info.actions,s.info.rules])));
    assert.ok(!/NOVITIATE|LEGIONARY|ELUCIDIAN STARSTRIDERS|HERNKYN YAEGIR|Adepta Sororitas|Novitiate|Legionary|Canid/.test(JSON.stringify([s.info.name,s.info.modelType,s.info.categories,s.info.upgrades,v.Tags])));
    assert.ok(v.Tags.includes('KTUIMini'));assert.ok(s.info.categories.includes('Operative'));
    checked++;
  }
  for(const child of Object.values(v))if(child&&typeof child==='object')visit(child);
}
visit(pack);assert.equal(checked,17);
console.log(JSON.stringify({correctedCardProfilesChecked:checked,hiddenWeaponsAndStatsConsistent:true}));
