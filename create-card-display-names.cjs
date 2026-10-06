const fs=require('fs');
const cards=JSON.parse(fs.readFileSync('ru-images-all-reviewed.json','utf8')),names={},variants=[];
function add(en,ru,id){
  if(!en||!ru)return;
  en=en.trim();ru=ru.replace(/\s*\([^()]*[A-Za-z][^()]*\)\s*$/,'').trim();
  if(!/[А-Яа-яЁё]/.test(ru))return;
  if(names[en]&&names[en]!==ru){variants.push({english:en,selected:names[en],alternate:ru,id});return;}
  names[en]=ru;names[en.toUpperCase()]=ru;
}
for(const[id,c]of Object.entries(cards)){
  if(c.stats)add(c.titleEnglish,c.titleRussian,id);
  for(const w of c.weapons||[])add(w.english,w.russian,id);
}
fs.writeFileSync('ru-card-display-names.json',JSON.stringify(names,null,2)+'\n');
fs.writeFileSync('inventory/card-display-name-variants.json',JSON.stringify(variants,null,2)+'\n');
console.log({aliases:Object.keys(names).length,wordingVariants:variants.length});
