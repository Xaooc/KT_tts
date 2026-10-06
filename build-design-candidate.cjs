// Reviewable candidate; never writes to the installed Workshop or Saves folders.
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');const {parseSource}=require('./lua-display.cjs');
const installed='C:/Users/PC/Documents/My Games/Tabletop Simulator/Mods/Workshop/3573927734_RU.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const before=fs.readFileSync(installed),table=JSON.parse(before);
const built=JSON.parse(fs.readFileSync('output/KT24-The-Killzone-RU-bundled-working.json'));const source=built.ObjectStates.find(o=>o.GUID==='efa3fe').LuaScript;parseSource(source);
const original=table.ObjectStates.find(o=>o.GUID==='efa3fe');assert(original);const oldSource=original.LuaScript;original.LuaScript=source;
const output='output/KT24-The-Killzone-RU-design-candidate.json';fs.writeFileSync(output,JSON.stringify(table,null,2));fs.writeFileSync('output/HUD-modern-candidate.lua',source);
original.LuaScript=oldSource;assert.deepStrictEqual(table,JSON.parse(before),'Candidate changed data beyond the reader script');
assert.equal(sha(fs.readFileSync(installed)),sha(before),'Installed mod changed during candidate creation');
const manifest={status:'design-review',date:'2026-10-05',candidate:output,changedObjectGUID:'efa3fe',changedProperty:'LuaScript',installedSHA256:sha(before),candidateSHA256:sha(fs.readFileSync(output)),installedVersionUnchanged:true,nativeTTSRuntimeTested:false,examples:['output/ploy-panel-preview.png','output/ploy-panel-preview-definition.png','output/reference-hud-preview.png']};fs.writeFileSync('output/design-candidate-manifest.json',JSON.stringify(manifest,null,2));console.log(manifest);
