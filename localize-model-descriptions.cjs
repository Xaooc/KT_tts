// Russian native model tooltips. Keep the combat parser's original stat and weapon rows intact.
const fs=require('fs'),assert=require('assert/strict');
const names=JSON.parse(fs.readFileSync('ru-hud-display-names-complete.json','utf8'));
const clean=s=>String(s||'').replace(/\[(?:[0-9a-f]+|-)\]/gi,'').replace(/^\*/,'').replace(/\s*\((?:[\d/]+AP|AP\d+)\)$/,'').trim();
function label(raw){const key=clean(raw).replace(/^\(?[RM]\)?\s+/,'');const ru=names[key]||names[key.toUpperCase()];return ru?ru+' ('+key+')':key;}
function readable(s){return String(s).replace(/\*\*/g,'').replace(/\b(\d+)\s+([1236])&&/g,(_,n,u)=>Number(n)*Number(u)+' дюймов').replace(/([1236])&&/g,(_,u)=>u+' дюймов');}
const weaponRows=s=>s.split(/\r?\n/).filter(l=>/^\s*[RM]\s+/.test(clean(l))||/\b(?:ATK|HIT|DMG|WR)\b/.test(clean(l)));
module.exports=function localize(root){
 const approved=new Map(),changes=[];
 function visit(v,loc){
  if(!v||typeof v!=='object')return;
  if(v.LuaScriptState){const state=JSON.parse(v.LuaScriptState),info=state.info;
   if(info&&typeof v.Description==='string'){
    const before=v.Description,lines=before.split(/\r?\n/),start=lines.findIndex(l=>clean(l).includes('Weapons'));
    // Unarmed loadout variants in the source have a stat block followed directly by abilities.
    let end=lines.findIndex((l,i)=>i>start&&/^---/.test(l));if(end<0)end=lines.length;
    const result=['[F4641D]'+label(info.name||info.modelType||v.Nickname)+'[-]'];
    // The source stat block can span several lines; retain it byte for byte for data-helper parsing.
    result.push(...lines.slice(0,start<0?lines.length:start).filter(l=>/\b(?:APL|MOVE|SAVE|WOUNDS|SV)\b/.test(clean(l))));
    if(start>=0)result.push('[31B32B]Оружие (Weapons)[-]');
    for(const line of start<0?[]:lines.slice(start+1,end)){
     result.push(line);
     const match=clean(line).match(/^\s*[RM]\s+(.+)$/);
     if(match)result.push('[C5C5C5]'+label(match[1])+'[-]');
    }
    const seen=new Set();
    function collect(value,heading){
     const entries=[];
     function walk(x){if(!x||typeof x!=='object')return;if(typeof x.text==='string'&&x.text.trim()){
      const key=(x.name||'')+'\n'+x.text;if(!seen.has(key)){seen.add(key);entries.push('[EF8450]'+label(x.name||'Особое правило')+'[-]\n'+readable(x.text));}
     }for(const y of Object.values(x))if(y&&typeof y==='object')walk(y);}
     walk(value);if(entries.length)result.push('---','[31B32B]'+heading+'[-]',...entries);
    }
    collect(info.abilities,'Способности');collect(info.actions,'Действия');collect(info.special,'Особые правила');collect(info.psychic,'Психические силы');
    const rules=Object.entries(info.rules||{}).filter(([n,t])=>typeof t==='string'&&t.trim());
    if(rules.length)result.push('---','[31B32B]Правила оружия[-]',...rules.map(([n,t])=>'[EF8450]'+label(n)+'[-]\n'+readable(t)));
    const after=result.join('\n\n').replace(/\n\n(?=(?:\[84E680\]|ATK|WR:|\[F4641D\][RM]))/g,'\n');
    // No attack keys or numerical combat rows are allowed to change while translating this tooltip.
    assert.deepEqual(weaponRows(after).filter(l=>weaponRows(before).includes(l)),weaponRows(before),v.GUID);
    v.Description=after;approved.set(loc+'/Description',JSON.stringify(after));changes.push({guid:v.GUID,path:loc+'/Description',combatRowsPreserved:true});
   }
  }
  for(const [k,x]of Object.entries(v))if(x&&typeof x==='object')visit(x,loc+'/'+k);
 }
 visit(root,'');return {approved,changes};
};
