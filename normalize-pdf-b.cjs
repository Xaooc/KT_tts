const fs=require('fs'),assert=require('assert/strict');
const source=JSON.parse(fs.readFileSync('ru-pdfs-b.json','utf8'));
const localized=new Set(['titleRussian','russian','rowsRussian','columnsRussian','legendRussian','captionRussian','labelsRussian','captionsRussian']);
let changed=0;
function visit(value,key){
 if(typeof value==='string'&&localized.has(key)){const ru=value.replace(/НБО/g,'NPO').replace(/косые когти/g,'косовидные когти').replace(/1\. Бой \(Fight\)\./g,'1. Ближний бой (Fight).');if(ru!==value)changed++;return ru;}
 if(Array.isArray(value))return value.map(v=>visit(v,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));
 return value;
}
const data=visit(source,'');assert.equal(Object.keys(data).length,8);assert.ok(Object.values(data).every(x=>x.status==='ready'));
let proseTables=0;
for(const d of Object.values(data))for(const p of d.pages)for(const block of p.blocks){
 if(block.table?.rowsRussian?.length)block.type='table';
 if(block.type==='table'&&!(block.rowsRussian||block.table?.rowsRussian)?.length){
  assert.ok(block.russian?.includes('Характеристики:')&&block.russian.includes('Оружие:'));
  // These complete datacards were authored as prose with labelled numeric profiles.
  // Render all of that text; never fabricate table rows or discard rule bodies.
  block.type='paragraph';proseTables++;
 }
}
let flattenedFigures=0, translatedFigureTables=0;
const exclusions=[];
for(const [id,d] of Object.entries(data))for(const p of d.pages){
 const flattened=[];
 for(const original of p.blocks){
  const block={...original},figure=block.figure;
  if(!figure){flattened.push(block);continue;}
  delete block.figure;
  if(figure.rowsRussian?.length){
   // This numeric chart is fully reproduced as a Russian table.
   block.type='table';block.columnsRussian=figure.labelsRussian;block.rowsRussian=figure.rowsRussian;
   block.legendRussian=figure.legendRussian;translatedFigureTables++;
   flattened.push(block);continue;
  }
  if(block.type==='figure'){
   Object.assign(block,figure);block.type='figure';
   // Keep complete source schematics; some authored rectangles used a different page size.
   delete block.sourceRegion;flattened.push(block);flattenedFigures++;continue;
  }
  flattened.push(block);
  if(figure.decorative || (id==='2bb168f5f1355bac'&&p.sourcePage===4)){
   // These illustrations have no additional playable rules. Preserve their Russian captions.
   const caption=[figure.legendRussian,...(figure.labelsRussian||[])].filter(Boolean).join('\n');
   if(caption)flattened.push({type:'paragraph',russian:caption});
   exclusions.push({id,sourcePage:p.sourcePage,figure});continue;
  }
  const schematic={...figure,type:'figure'};delete schematic.sourceRegion;
  flattened.push(schematic);flattenedFigures++;
 }
 p.blocks=flattened;
}
let flattenedTables=0;
for(const d of Object.values(data))for(const p of d.pages){
 const flattened=[];
 for(const block of p.blocks){
  const tables=block.tables;delete block.tables;flattened.push(block);
  if(tables)for(const table of tables){assert.ok(table.rowsRussian?.length&&table.columnsRussian?.length);flattened.push({...table,type:'table'});flattenedTables++;}
 }
 p.blocks=flattened;
}
assert.ok(Object.values(data).every(d=>d.pages.every(p=>p.blocks.every(b=>!b.figure&&!b.tables))));
fs.writeFileSync('inventory/pdf-b-illustration-exclusions.json',JSON.stringify(exclusions,null,2));
fs.writeFileSync('ru-pdfs-b-final.json',JSON.stringify(data,null,2));console.log({canonicalNPOFields:changed,proseTables,flattenedFigures,translatedFigureTables,flattenedTables});
