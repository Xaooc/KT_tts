const fs=require('fs');const hud=JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-assistant-candidate.json')).ObjectStates.find(x=>x.GUID==='efa3fe').LuaScript;
const driver=fs.readFileSync('check-reference-hud.cjs','utf8').match(/const driver=`([\s\S]*?)`;/)[1];
const tests=`
local profile={name='Infernal gaze',wr='PSYCHIC, Rng (6), Lethal 3+, Devastating 3'}
RuReferenceCache.Red={currentEdition=false,rules={},entries={},weaponRules=profile.wr,section='weapon',query='',open=false,name='Mindwitch'}
WeaponCache.Red={weapons={profile}}
local tip=ruWeaponTooltip('Red',profile)
for _,word in ipairs({'PSYCHIC','Rng (6)','Lethal 3+','Devastating 3'}) do assert(tip:find(word,1,true),'Fallback missing '..word..': '..tip) end
assert(not tip:find('нет сохранённой справки',1,true))
ruOpenWeaponReference({color='Red'},nil,'ruWeapon_1_Red')
local entries=RuReferenceCache.Red.visible;assert(#entries==4,'Expected four profile traits, got '..#entries)
local names={};for _,entry in ipairs(entries) do names[entry.english]=true;assert(entry.text~='') end
assert(names.PSYCHIC and names.Range and names.Lethal and names.Devastating)
assert(ruWeaponTooltip('Red',{name='Fists',wr='-'}):find('нет дополнительных',1,true))
assert(not ruWeaponTooltip('Red',{name='test',wr='Backblast'}):find('Взрыв',1,true))
RuReferenceCache.Red.rules={Lethal='Сохранённая старая редакция'}
tip=ruWeaponTooltip('Red',{name='Old weapon',wr='Lethal 3+'});assert(tip:find('Сохранённая старая редакция',1,true),'Saved legacy definition replaced')
-- Reader bridge opens the exact requested ploy, without touching CP/game state.
ruAssistantRead({color='Red',team='hierotekcircle',english='Living Lightning'})
assert(RuPloySeats.Red.open and RuPloySeats.Red.team=='hierotekcircle')
assert(RuPloySeats.Red.visible[RuPloySeats.Red.selected].english=='Living Lightning')
local launcher=ruPloyLauncher();assert(launcher.attributes.offsetXY=='436 -18')
PreviewWeaponFallback=UI.getXmlTable()
return '12 weapon fallback and reader bridge checks'
`;
fs.writeFileSync('tmp/weapon-fallback-test.lua',driver+'\n'+hud+'\n'+tests);console.log('Emitted missing-rule fallback fixture');
