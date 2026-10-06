// Add explicitly authored missing rule cards after original-save topology verification.
const fs=require('fs'),crypto=require('crypto'),assert=require('assert');
const path='output/KT41-RU-assets-working.json',pack=JSON.parse(fs.readFileSync(path));
const cards=JSON.parse(fs.readFileSync('ru-images-all-reviewed.json'));
const manifest=JSON.parse(fs.readFileSync('inventory/supplement-card-manifest.json'));
let template;const guids=new Set(),deckIds=new Set();
function scan(x){if(!x||typeof x!=='object')return;if(x.GUID)guids.add(x.GUID);for(const k of Object.keys(x.CustomDeck||{}))deckIds.add(Number(k));if(x.Name==='CardCustom'&&!template)template=x;for(const v of Object.values(x))if(v&&typeof v==='object')scan(v);}
scan(pack);assert(template);const roots=pack.ObjectStates.flatMap(x=>[x,...Object.values(x.States||{})]);
const added=[];let key=Math.max(...deckIds)+1;
for(const [i,item] of manifest.entries()){
 const root=roots.find(x=>x.Nickname.toLowerCase()===item.team.toLowerCase());assert(root,'Missing team '+item.team);
 const card=cards[item.id];assert(card?.generatedSupplement);const obj=structuredClone(template);
 obj.GUID=crypto.createHash('sha256').update('KT-RU-card/'+item.id).digest('hex').slice(0,6);assert(!guids.has(obj.GUID));guids.add(obj.GUID);
 const image='C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/KT-RU/images/'+item.id+'-ru.png';assert(fs.existsSync(image));
 obj.CardID=key*100;obj.CustomDeck={[key]:{FaceURL:image,BackURL:image,NumWidth:1,NumHeight:1,BackIsHidden:true,UniqueBack:false,Type:0}};key++;
 obj.Nickname=card.titleRussian;obj.Description=card.categoryRussian+'\n'+(card.blocks||[]).map(b=>b.headingRussian+'\n'+(b.russian||'')).join('\n\n');
 obj.GMNotes='KT-RU authored supplement '+item.id;obj.LuaScript='';obj.LuaScriptState='';obj.XmlUI='';delete obj.States;
 obj.Transform={...template.Transform,posX:root.Transform.posX+(i%4)*3,posY:2+(i/4|0)*.08,posZ:root.Transform.posZ+8,rotX:0,rotY:180,rotZ:0};
 root.ContainedObjects||=[];root.ContainedObjects.push(obj);added.push({team:item.team,id:item.id,guid:obj.GUID});
}
fs.writeFileSync(path,JSON.stringify(pack,null,2));fs.writeFileSync('output/supplement-integration-report.json',JSON.stringify({added,originalGUIDsPreserved:true},null,2));console.log({added:added.length});
const guides=JSON.parse(fs.readFileSync('output/current-team-guides.json'));
const table=JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-assets-working.json'));let pdfTemplate;
function findPDF(x){if(!x||typeof x!=='object')return;if(x.CustomPDF&&!pdfTemplate)pdfTemplate=x;for(const v of Object.values(x))if(v&&typeof v==='object')findPDF(v);}
findPDF(table);assert(pdfTemplate);const integration=JSON.parse(fs.readFileSync('output/asset-integration-report.json'));
const directory='C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/KT-RU/pdf/teams';fs.mkdirSync(directory,{recursive:true});
for(const guide of guides){
 const root=roots.find(x=>x.Nickname.toLowerCase()===guide.team.toLowerCase());assert(root);
 const target=directory+'/'+require('path').basename(guide.path);fs.copyFileSync(guide.path,target);const obj=structuredClone(pdfTemplate);
 obj.GUID=crypto.createHash('sha256').update('KT-RU-guide/'+guide.team).digest('hex').slice(0,6);assert(!guids.has(obj.GUID));guids.add(obj.GUID);
 obj.CustomPDF.PDFUrl=target;obj.CustomPDF.PDFPage=0;obj.Nickname='Русский справочник — '+guide.team;obj.Description='Полные карточки и правила отряда. Сверка: 05.10.2026.';obj.Locked=false;obj.LuaScript='';obj.LuaScriptState='';obj.XmlUI='';obj.Transform={...obj.Transform,posX:root.Transform.posX,posY:2,posZ:root.Transform.posZ+12,rotX:0,rotY:180,rotZ:0,scaleX:4,scaleZ:4};root.ContainedObjects.push(obj);
 integration.assets.push({kind:'pdf',team:guide.team,translatedPath:target,sha256:guide.sha256,authoredSupplement:true});
}
integration.counts.translatedPDFs=integration.assets.filter(x=>x.kind==='pdf').length;
fs.writeFileSync('output/asset-integration-report.json',JSON.stringify(integration,null,2));fs.writeFileSync(path,JSON.stringify(pack,null,2));console.log({guides:guides.length});
