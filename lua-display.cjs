const lua=require('./tools/node_modules/luaparse');
function decode(raw){
  const long=raw.match(/^\[(=*)\[([\s\S]*)\]\1\]$/);if(long)return long[2].replace(/^\r?\n/,'');
  return raw.slice(1,-1).replace(/\\(\d{1,3}|x[\da-fA-F]{2}|z\s*|\r?\n|.)/g,(_,x)=>{
    if(/^\d/.test(x))return String.fromCharCode(Number(x));if(x.startsWith('x'))return String.fromCharCode(parseInt(x.slice(1),16));if(x.startsWith('z'))return '';
    return ({a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\x0b','\n':'\n','\r\n':'\n'})[x]??x;
  });
}
function callee(node){return node?.base?.identifier?.name||node?.base?.name||'';}
// TTS scripts can contain symbolic operator aliases. Parse a shadow copy, preserving original code.
function shadow(src){
 let text='',positions=[];
 const append=(s,start)=>{for(let j=0;j<s.length;j++){text+=s[j];positions.push(start+j);}};
 for(let i=0;i<src.length;){
  const rest=src.slice(i);let end;
  if(rest.startsWith('--')){
   const long=rest.slice(2).match(/^\[(=*)\[/);
   if(long){const stop=']'+long[1]+']',found=src.indexOf(stop,i+2+long[0].length);end=found<0?src.length:found+stop.length;}
   else{const found=src.indexOf('\n',i);end=found<0?src.length:found+1;}
  }else if(src[i]==='"'||src[i]==="'"){
   const quote=src[i];end=i+1;while(end<src.length){if(src[end]==='\\'){end+=2;continue;}if(src[end++]===quote)break;}
  }else{
   const long=rest.match(/^\[(=*)\[/);
   if(long){const stop=']'+long[1]+']',found=src.indexOf(stop,i+long[0].length);end=found<0?src.length:found+stop.length;}
  }
  if(end!==undefined){append(src.slice(i,end),i);i=end;continue;}
  if(rest.startsWith('||')&&/^\|\|\s*[A-Za-z_][\w:.]*\s*\(/.test(rest)){
   const begin=i+2,open=src.indexOf('(',begin);let depth=0,quote=null,finish;
   for(let k=open;k<src.length;k++){
    const ch=src[k];
    if(quote){if(ch==='\\')k++;else if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='(')depth++;else if(ch===')'&&--depth===0){finish=k+1;break;}
   }
   if(finish){
    for(const c of 'function() return '){text+=c;positions.push(i);}
    append(src.slice(begin,finish),begin);
    for(const c of ' end'){text+=c;positions.push(finish-1);}
    i=finish;continue;
   }
  }
  let from,to;
  for(const pair of [['!=','~='],['&&','and'],['||','or'],['!','not '],['|','or'],['&','and']])if(rest.startsWith(pair[0])){[from,to]=pair;break;}
  if(from){for(const c of to){text+=c;positions.push(i);}i+=from.length;}
  else{append(src[i],i);i++;}
 }
 positions.push(src.length);return {text,positions};
}
function parseSource(src){
 const options={luaVersion:'5.2',ranges:true,comments:false};
 try{return {ast:lua.parse(src,options),dialect:false};}
 catch(originalError){
  const copy=shadow(src);let ast;
  try{ast=lua.parse(copy.text,options);}catch(e){throw Error(originalError.message+'; shadow: '+e.message);}
  function remap(node){if(!node||typeof node!=='object')return;
   if(node.range)node.range=[copy.positions[node.range[0]],copy.positions[node.range[1]]];
   for(const [k,v]of Object.entries(node))if(!['range','loc'].includes(k)){if(Array.isArray(v))v.forEach(remap);else if(v&&typeof v==='object')remap(v);}
  }
  remap(ast);return {ast,dialect:true};
 }
}
function collect(src){
  let parsed;try{parsed=parseSource(src);}catch(e){return {error:e.message,literals:[]};}
  const ast=parsed.ast;
  const literals=[];
  function walk(node,parents){
    if(!node||typeof node!=='object')return;
    if(node.type==='StringLiteral'){
      const old=decode(node.raw),parent=parents.at(-1);let role='';
      if(parent?.type==='TableKeyString'&&['label','tooltip','text'].includes(parent.key.name))role=parent.key.name;
      for(let i=parents.length-1;i>=0;i--){const call=parents[i];if(call.type!=='CallExpression')continue;
        const name=callee(call),container=parents[i+1]||node;
        if(['addContextMenuItem','broadcastToAll','broadcastToColor','broadcast','printToAll','printToColor','print','showConfirmDialog','showInfoDialog','showInputDialog','showMemoDialog'].includes(name)&&call.arguments[0]===container)role=name;
        if(name==='notify'&&call.arguments[1]===container)role=name;
        if(name==='showMemoDialog'&&call.arguments[1]===container)role=name;
        if(name==='setAttribute'&&call.arguments[1]?.type==='StringLiteral'&&['text','tooltip'].includes(decode(call.arguments[1].raw))&&call.arguments[2]===container)role='setAttribute';
        if(name==='setValue'&&call.arguments[1]===container)role='setValue';
      }
      if(role&&/[A-Za-z]/.test(old)&&old.length<15000&&!old.includes('function ')&&!/^https?:\/\/\S+$/.test(old.trim()))literals.push({old,range:node.range,role,context:src.slice(Math.max(0,node.range[0]-100),Math.min(src.length,node.range[1]+100))});
    }
    for(const [key,value] of Object.entries(node)){if(['range','loc'].includes(key))continue;if(Array.isArray(value))for(const child of value)walk(child,[...parents,node]);else if(value&&typeof value==='object')walk(value,[...parents,node]);}
  }
  walk(ast,[]);return {ast,literals,dialect:parsed.dialect};
}
function shape(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(shape);const r={};for(const [k,v]of Object.entries(n)){if(['range','loc'].includes(k)||n.type==='StringLiteral'&&['raw','value'].includes(k))continue;r[k]=shape(v);}return r;}
function formatCodes(text){return text.match(/%[-+ #0]*\d*(?:\.\d+)?[cdeEfgGiouXxsq%]/g)||[];}
function translate(src,dictionary,{coordinatedCancel=false}={}){
 const extracted=collect(src);if(extracted.error)return {text:src,error:extracted.error,changes:[]};
 const changes=[];
 for(const literal of extracted.literals){const key=literal.old.trim(),value=dictionary[key];
  if(key==='Cancel')continue;
  if(value&&value!==key){
   if(JSON.stringify(formatCodes(key))!==JSON.stringify(formatCodes(value)))throw Error('Changed format placeholders '+key);
   changes.push({...literal,new:literal.old.replace(key,value)});
  }
 }
 // Cancel is both a visible label and a cross-object lookup value. Change every producer and consumer together.
 if(coordinatedCancel){
  const literals=[];
  function all(n,parent){if(!n||typeof n!=='object')return;
   if(n.type==='StringLiteral'&&decode(n.raw)==='Cancel'){
    if(!(parent?.type==='TableKeyString'&&parent.key.name==='label'||parent?.type==='BinaryExpression'&&['==','~='].includes(parent.operator)||parent?.type==='CallExpression'&&callee(parent)==='hasButtonWithLabel'&&parent.arguments[1]===n))throw Error('Unrecognized Cancel producer/consumer '+parent?.type+' '+src.slice(Math.max(0,n.range[0]-120),n.range[1]+120));
    literals.push({old:'Cancel',new:dictionary.Cancel||'Отмена',range:n.range,role:'coordinated-cancel'});
   }
   for(const [k,v]of Object.entries(n))if(!['range','loc'].includes(k)){if(Array.isArray(v))v.forEach(x=>all(x,n));else if(v&&typeof v==='object')all(v,n);}
  }
  all(extracted.ast,null);changes.push(...literals);
 }
 let text=src;for(const change of [...changes].sort((a,b)=>b.range[0]-a.range[0]))text=text.slice(0,change.range[0])+JSON.stringify(change.new)+text.slice(change.range[1]);
 const next=parseSource(text).ast;
 if(JSON.stringify(shape(next))!==JSON.stringify(shape(extracted.ast)))throw Error('Translated UI changed code topology');
 return {text,changes};
}
module.exports={collect,translate,decode,parseSource};
