const fs=require('fs'),assert=require('assert/strict');
const {translate,collect,parseSource}=require('./lua-display.cjs');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('./tools/node_modules/fengari');
const dictionary={Cancel:'Отмена','Attacking with':'Атака оружием','%s took damage':'%s получает урон'};
const original='local key="Cancel"\nself.createButton({label="Cancel",click_function="cancel"})\nif btn.label == "Cancel" then done() end';
assert.throws(()=>translate(original,dictionary,{coordinatedCancel:true}),/Unrecognized Cancel/);
const safe='self.createButton({label="Cancel",click_function="cancel"})\nif btn.label == "Cancel" then done() end\nif hasButtonWithLabel(obj,"Cancel") then recall() end';
const translated=translate(safe,dictionary,{coordinatedCancel:true});
assert.equal(translated.changes.length,3);assert.ok(!translated.text.includes('"Cancel"'));assert.ok(translated.text.includes('click_function="cancel"'));
assert.throws(()=>translate('print(string.format("%s took damage",name))',{'%s took damage':'Получен урон'}),/format placeholders/);
const dialect='Wait.time(|| rollDice(), 0.5)\nif !disabled && x != "||" then print("Attacking with" .. weapon) end';
const changed=translate(dialect,dictionary);assert.equal(changed.changes.length,1);assert.ok(changed.text.includes('|| rollDice()'));assert.ok(changed.text.includes('x != "||"'));parseSource(changed.text);
const table=JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-working.json','utf8'));
let occurrences=0,checked=new Set(),repaired=0,woundFunction;
function walk(v){if(!v||typeof v!=='object')return;
 if(v.LuaScript){occurrences++;if(!checked.has(v.LuaScript)){parseSource(v.LuaScript);checked.add(v.LuaScript);}
  const match=v.LuaScript.match(/local function getWoundPanelWidth\(\)[\s\S]*?\r?\nend/);
  if(match&&match[0].includes('elseif wounds <= 10 then')){repaired++;woundFunction=match[0];}
 }
 for(const child of Object.values(v))if(child&&typeof child==='object')walk(child);
}
walk(table);walk(JSON.parse(fs.readFileSync('output/KT41-RU-working.json','utf8')));
assert.ok(woundFunction);const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
const test='local state = {stats={}}\n'+woundFunction+'\n'+[[0,60],[7,60],[8,80],[10,80],[11,100],[14,100],[15,120],[18,120],[19,140],[75,140]].map(([w,width])=>`state.stats.Wounds=${w};assert(getWoundPanelWidth()==${width})`).join('\n');
let status=lauxlib.luaL_loadstring(L,to_luastring(test));if(status===lua.LUA_OK)status=lua.lua_pcall(L,0,0,0);if(status!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));
const audit=JSON.parse(fs.readFileSync('output/display-validation.json','utf8'));const preservedStats=new Set(['MOVE','SAVE','WOUNDS','ATK','HIT','DMG']);assert.equal(audit.pending.filter(x=>!preservedStats.has(x.english)).length,0);assert.equal(repaired,audit.sourceRepairs.length);
console.log(JSON.stringify({scriptOccurrences:occurrences,uniqueScriptsParsed:checked.size,repairedNPOScripts:repaired,woundPanelBoundaries:10,cancelProducerConsumerCases:3,formatPlaceholders:'preserved',symbolicDialect:'preserved'}));
