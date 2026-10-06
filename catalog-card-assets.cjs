const fs=require('fs'),crypto=require('crypto');
const sources={table:'C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734.json',teams:'C:/Users/PC/Documents/My Games/Tabletop Simulator/Saves/Saved Objects/Chaos Cult.json'};
const images=JSON.parse(fs.readFileSync('inventory/image-sources.json','utf8'));
const byURL=new Map(images.map(x=>[x.url,x]));
const records=[];
for(const [source,file]of Object.entries(sources)){
  const json=JSON.parse(fs.readFileSync(file,'utf8'));
  function walk(x,loc,team,inheritedDeck){if(!x||typeof x!=='object')return;
    if(source==='teams'&&/^\/ObjectStates\/\d+(?:\/States\/\d+)?$/.test(loc))team=x.Nickname||team;
    const decks=x.CustomDeck||inheritedDeck;
    if(x.CardID!==undefined){
      const id=Number(x.CardID),key=String(Math.floor(id/100));
      let deck=decks?.[key],actualKey=key,mapping='exact';
      if(!deck&&decks&&Object.keys(decks).length===1){actualKey=Object.keys(decks)[0];deck=decks[actualKey];mapping='single-deck-key-mismatch';}
      if(!deck){records.push({source,path:loc,team,guid:x.GUID,name:x.Nickname,cardID:id,deckKey:key,mapping:'unresolved',availableDeckKeys:Object.keys(decks||{})});return;}
      const width=Number(deck.NumWidth),height=Number(deck.NumHeight),tile=id%100;
      if(!Number.isInteger(width)||!Number.isInteger(height)||tile>=width*height)throw Error('Invalid atlas tile '+loc);
      const face=byURL.get(deck.FaceURL),back=byURL.get(deck.BackURL);
      if(!face||!back)throw Error('Uninventoried URL '+loc);
      records.push({source,path:loc,team,guid:x.GUID,name:x.Nickname,description:x.Description,cardID:id,deckKey:key,actualDeckKey:actualKey,mapping,face:{id:face.id,path:face.path,url:face.url,columns:width,rows:height,column:tile%width,row:Math.floor(tile/width),tile},back:{id:back.id,path:back.path,url:back.url,uniqueBack:!!deck.UniqueBack}});
    }
    for(const [key,value]of Object.entries(x))if(key!=='CustomDeck'&&value&&typeof value==='object')walk(value,loc+'/'+key,team,decks);
  }
  walk(json,'',null,null);
}
fs.writeFileSync('inventory/card-assets.json',JSON.stringify(records,null,2));
console.log(JSON.stringify({cardObjects:records.length,unresolved:records.filter(x=>!x.face).length,keyMismatches:records.filter(x=>x.mapping==='single-deck-key-mismatch').length,uniqueFaces:new Set(records.filter(x=>x.face).map(x=>x.face.id)).size,uniqueBacks:new Set(records.filter(x=>x.back).map(x=>x.back.id)).size,atlases:[...new Set(records.filter(x=>x.face&&(x.face.columns>1||x.face.rows>1)).map(x=>x.face.id))].length,teams:[...new Set(records.map(x=>x.team).filter(Boolean))].length},null,2));
