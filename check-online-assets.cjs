const test = require('node:test');
const assert = require('node:assert/strict');
const {collectReferences, decodeFileRef, extractRefs, missingAssets} = require('./export-assets.cjs');
const {encodeRelative, replaceStrings} = require('./relink-assets.cjs');
const {checkURLs, installCopy} = require('./relink-assets.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('collects references in nested objects, states, decks, UI assets, and Lua strings', () => {
  const data = {
    ObjectStates: [{GUID: 'abc123', Nickname: 'Юнит', CustomImage: {ImageURL: 'C:/KT-RU/images/юнит.png'},
      CustomDeck: {'1': {FaceURL: 'C:/KT-RU/images/лицо.png', BackURL: 'C:/KT-RU/images/рубашка.png'}},
      CustomUIAssets: [{URL: 'C:/KT-RU/images/ui.png'}],
      ContainedObjects: [{States: {'2': {CustomPDF: {PDFUrl: 'C:/KT-RU/pdf/отряд.pdf'}}}}],
      LuaScript: 'loadImage("C:/KT-RU/images/скрипт.png")'}]
  };
  const refs = collectReferences(data, 'save');
  assert.deepEqual([...refs.keys()], [
    'C:/KT-RU/images/юнит.png', 'C:/KT-RU/images/лицо.png', 'C:/KT-RU/images/рубашка.png',
    'C:/KT-RU/images/ui.png', 'C:/KT-RU/pdf/отряд.pdf', 'C:/KT-RU/images/скрипт.png'
  ]);
  assert.equal(refs.get('C:/KT-RU/images/юнит.png')[0].path, 'ObjectStates[0].CustomImage.ImageURL');
  assert.equal(refs.get('C:/KT-RU/images/юнит.png')[0].guid, 'abc123');
  assert.equal(refs.get('C:/KT-RU/images/юнит.png')[0].nickname, 'Юнит');
  assert.equal(refs.get('C:/KT-RU/pdf/отряд.pdf')[0].path,
    'ObjectStates[0].ContainedObjects[0].States.2.CustomPDF.PDFUrl');
});

test('normalizes Windows, file URL, slash, encoded-space, and Cyrillic paths', () => {
  assert.equal(decodeFileRef('C:\\Games\\KT-RU\\images\\карта.png'), 'C:\\Games\\KT-RU\\images\\карта.png');
  assert.equal(decodeFileRef('file:///C:/Games/KT-RU/карта%20один.png'), 'C:\\Games\\KT-RU\\карта один.png');
  assert.equal(decodeFileRef('C:/Games/KT-RU/a%20b/карта.png'), 'C:\\Games\\KT-RU\\a b\\карта.png');
  assert.deepEqual(extractRefs('image = "C:/Games/My Documents/KT-RU/файл имя.png"'),
    ['C:/Games/My Documents/KT-RU/файл имя.png']);
  assert.equal(encodeRelative('images/файл имя.png'), 'images/%D1%84%D0%B0%D0%B9%D0%BB%20%D0%B8%D0%BC%D1%8F.png');
});

test('relink replacement round-trips without changing unrelated JSON', () => {
  const original = {url: 'C:/KT-RU/images/a b.png', LuaScript: 'show("C:/KT-RU/images/a b.png")', nested: [7]};
  const remote = 'https://cdn.example/kt/images/a%20b.png';
  const linked = replaceStrings(JSON.parse(JSON.stringify(original)), [[original.url, remote]]);
  assert.deepEqual(linked, {url: remote, LuaScript: `show("${remote}")`, nested: [7]});
  assert.deepEqual(replaceStrings(linked, [[remote, original.url]]), original);
});

test('reports missing referenced files for a nonzero export decision', () => {
  const missing = missingAssets(new Map([
    ['C:/definitely-not-present/KT-RU/missing.png', [{source: 'save', path: 'ObjectStates[0].CustomImage.ImageURL'}]]
  ]));
  assert.equal(missing.length, 1);
  assert.match(missing[0].ref, /missing\.png$/);
  assert.equal(missing[0].usedIn[0].source, 'save');
});

test('HEAD URL checks mark HTTP failures and request errors as failed', async () => {
  const originalFetch=global.fetch;
  global.fetch=async url=>{
    if(url.endsWith('/missing'))return {status:404};
    if(url.endsWith('/redirect'))return {status:302};
    throw new Error('network unavailable');
  };
  try{
    const result=await checkURLs(['https://example.test/missing','https://example.test/redirect',
      'https://example.test/error'],3);
    assert.equal(result.filter(item=>!item.ok).length,2);
    assert(result.some(item=>item.status===302&&item.ok));
  }finally{global.fetch=originalFetch;}
});

test('online install copies preserve conflicting files and use a hash suffix', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kt-online-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const source=path.join(dir,'source.json'),destination=path.join(dir,'Saves','entry.json');
  fs.mkdirSync(path.dirname(destination));fs.writeFileSync(source,'new content');fs.writeFileSync(destination,'user content');
  const installed=installCopy(source,destination);
  assert.match(installed.path,/entry-[a-f0-9]{8}\.json$/);
  assert.equal(fs.readFileSync(destination,'utf8'),'user content');
  assert.equal(fs.readFileSync(installed.path,'utf8'),'new content');
});
