const fs=require('fs'),assert=require('assert/strict');
const source=JSON.parse(fs.readFileSync('ru-images-vespid-plague.reviewed.json','utf8'));
function counts(cards){return [Object.keys(cards).length,Object.values(cards).reduce((n,c)=>n+(c.blocks?.length||0),0),Object.values(cards).reduce((n,c)=>n+(c.weapons?.length||0),0)];}
const replacements=[['Теневая стая веспидов-жалоносцев','Теневой веспид-жалоносец'],['Теневая стая (SHADESTRAIN)','Теневой веспид (SHADESTRAIN)'],['Рой (STRAIN)','Подвид (STRAIN)'],['Огнемётный след','Небесный факел'],['террейна выгодной высоты','террейна с высотной позицией'],['террейне выгодной высоты','террейне с высотной позицией'],['террейна с выгодной высотой','террейна с высотной позицией'],['террейна высокой выгодной позиции','террейна с высотной позицией'],['выгодной высоты (Vantage terrain)','высотной позиции (Vantage terrain)'],['Укреплённый опорный пункт','Тесная крепость'],['Замаскированный (Camouflaged)','Маскировка (Camouflaged)'],['Команда убийц (Kill Team)','Отряд (Kill Team)'],['В команду убийц можно','В отряд можно'],['действия Fight.','действия «Ближний бой» (Fight).']];
function walk(value){if(typeof value==='string'){for(const [a,b]of replacements)value=value.split(a).join(b);return value;}
 if(Array.isArray(value))return value.map(walk);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)]));
 return value;
}
const cards=walk(source);assert.deepEqual(counts(cards),counts(source));assert.deepEqual(counts(cards),[51,59,32]);
const fortitude=cards['5ddf558c2768498c'].blocks.find(b=>b.headingEnglish==='Repulsive Fortitude');
assert.ok(fortitude.russian.includes('на его кубиках защиты'));
fortitude.russian=fortitude.russian.replace('на его кубиках защиты','на ваших кубиках защиты');
const rules=JSON.parse(fs.readFileSync('ru-card-repairs.json','utf8'));
const names=JSON.parse(fs.readFileSync('ru-display-names.json','utf8'));
const key=x=>x.toLowerCase().replace(/[’‘]/g,"'");
for(const [english,rule]of Object.entries(rules.rules)){
 const card=cards[rule.source],block=card.blocks.find(b=>key(b.headingEnglish||'')===key(english));
 assert.ok(block?.russian,'Missing full source-card rule '+english);
 rule.russian=block.russian;
 const base=english.replace(/\s*\(\d+AP\)\s*$/i,'');
 let name=block.headingRussian.replace(/\s*\([^)]*\)\s*$/,'').trim();
 if(base==='Camouflaged')name='Маскировка';
 names[base]=name;
}
fs.writeFileSync('ru-card-repairs.json',JSON.stringify(rules,null,2));
fs.writeFileSync('ru-display-names.json',JSON.stringify(names,null,2));
fs.writeFileSync('ru-images-vespid-plague-final.json',JSON.stringify(cards,null,2));
console.log(JSON.stringify({preservedCounts:counts(cards),fullCardRulesReused:Object.keys(rules.rules).length}));
