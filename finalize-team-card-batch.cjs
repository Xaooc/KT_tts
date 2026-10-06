const fs=require('fs'),assert=require('assert/strict');
const batch=process.argv[2];assert.match(batch,/^\d\d$/);
const source='ru-images-teams-'+batch+'.reviewed.json',data=JSON.parse(fs.readFileSync(source,'utf8'));
const before={cards:Object.keys(data).length,blocks:Object.values(data).reduce((n,c)=>n+(c.blocks||[]).length,0),weapons:Object.values(data).reduce((n,c)=>n+(c.weapons||[]).length,0)};
const fields=new Set(['titleRussian','categoryRussian','flavorRussian','headingRussian','russian','footerRussian','wrRussian','fullRULegend','labelsRussian','legendRussian']);
function canonicalTeams(text){
 for(const [old,ru] of [['неистовые феллгоры','Разорители Феллгора'],['неистовых феллгоров','Разорителей Феллгора'],['неистовым феллгорам','Разорителям Феллгора'],['неистовыми феллгорами','Разорителями Феллгора'],['неистовый феллгор','Разоритель Феллгора']]){
  text=text.replace(new RegExp(old,'gi'),match=>match===match.toUpperCase()?ru.toUpperCase():match[0]===match[0].toLowerCase()?ru[0].toLowerCase()+ru.slice(1):ru);
 }
 return text;
}
function normalize(x,key){
 if(typeof x==='string'&&fields.has(key))return x.replace(/СХЕМА УРОВНЕЙ GORE TANK/g,'СХЕМА УРОВНЕЙ РЕЗЕРВУАРА КРОВИ').replace(/с приказом Conceal/g,'с приказом «Скрытность» (Conceal)').replace(/Передатчик Psiren/g,'Псирен-передатчик (Psiren Caster)').replace(/\(GORE TANK\)/g,'(Gore Tank)').replace(/его GORE TANK пуст/g,'его резервуар крови (Gore Tank) пуст').replace(/\bGORE TANK\b/g,'резервуара крови (Gore Tank)').replace(/САНГВАВИТЭ \(SANGUAVITAE\)/g,'«Сангвавитаэ» (Sanguavitae)').replace(/\(SANGUAVITAE\)/g,'(Sanguavitae)').replace(/САНГВАВИТЭ/g,'САНГВАВИТАЭ').replace(/\bSANGUAVITAE\b/g,'«Сангвавитаэ» (Sanguavitae)').replace(/с вашим жетоном Bleeding/g,'с вашим жетоном «Кровотечение»');
 if(Array.isArray(x))return x.map(v=>normalize(v,key));
 if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,normalize(v,k)]));
 return x;
}
const final=normalize(data,'');
function applyCanonicalNames(value,key){
 if(typeof value==='string'&&fields.has(key))return canonicalTeams(value);
 if(Array.isArray(value))return value.map(v=>applyCanonicalNames(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,applyCanonicalNames(v,k)]));
 return value;
}
if(final['00d3bda095035692'])for(const b of final['00d3bda095035692'].blocks||[])if(b.type==='figure')b.fullRULegend='Оранжевый круг A внизу — оперативник, выбирающий цель; чёрный круг вверху — враг. Красная пунктирная линия от A пересекает серый террейн: враг виден, но между ним и A есть террейн. Другой дружественный оперативник слева видит врага без промежуточного террейна; это показано зелёными линиями. При выполнении условий «Беспощадной координации» (Ruthless Coordination) наличие промежуточного террейна можно определять с позиции этого второго оперативника; видимость от A определяется обычным образом.';
const after={cards:Object.keys(final).length,blocks:Object.values(final).reduce((n,c)=>n+(c.blocks||[]).length,0),weapons:Object.values(final).reduce((n,c)=>n+(c.weapons||[]).length,0)};assert.deepEqual(after,before);
assert.ok(Object.values(final).every(c=>c.verifiedAgainstPixels&&c.kind==='card'));
fs.writeFileSync('ru-images-teams-'+batch+'-final.json',JSON.stringify(applyCanonicalNames(final,''),null,2));console.log({...after,batch});
