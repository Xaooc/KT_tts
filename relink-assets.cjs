const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {collectReferences} = require('./export-assets.cjs');
const {resolveTtsDir}=require('./tts-paths.cjs');

let DEFAULT_TTS_DIR;
try{DEFAULT_TTS_DIR=resolveTtsDir();}catch{}
const DEFAULT_SAVE=DEFAULT_TTS_DIR&&path.join(DEFAULT_TTS_DIR,'Saves','KT24-The-Killzone-RU.json');
const DEFAULT_PACK=DEFAULT_TTS_DIR&&path.join(DEFAULT_TTS_DIR,'Saves','Saved Objects','KT41-RU.json');
const crypto=require('crypto');

function parseArgs(argv) {
  const options = {save: DEFAULT_SAVE, pack: DEFAULT_PACK, outDir: 'output/online'};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') options.base = argv[++i];
    else if (argv[i] === '--source') options.save = argv[++i];
    else if (argv[i] === '--pack') options.pack = argv[++i];
    else if (argv[i] === '--out-dir') options.outDir = argv[++i];
    else if (argv[i] === '--check-urls') options.checkUrls = Number(argv[++i]);
    else if (argv[i] === '--install') options.install = true;
    else if (argv[i] === '--embed-pack') options.embedPack = true;
    else if (argv[i] === '--tts-dir') {
      const dir=resolveTtsDir({dir:argv[++i]});
      options.ttsDir=dir;
      options.save=path.join(dir,'Saves','KT24-The-Killzone-RU.json');
      options.pack=path.join(dir,'Saves','Saved Objects','KT41-RU.json');
    }
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.base) throw new Error('Usage: node relink-assets.cjs --base <URL> [--source <save.json>] [--pack <pack.json>] [--out-dir <dir>]');
  if((!options.save||!options.pack)&&!options.ttsDir){
    const dir=resolveTtsDir();
    options.save||=path.join(dir,'Saves','KT24-The-Killzone-RU.json');
    options.pack||=path.join(dir,'Saves','Saved Objects','KT41-RU.json');
  }
  if (!Number.isFinite(options.checkUrls ?? 0) || (options.checkUrls ?? 0) < 0) throw new Error('--check-urls must be a non-negative number');
  const parsed = new URL(options.base);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--base must use http or https');
  options.base = options.base.replace(/\/+$/, '');
  return options;
}

function encodeRelative(file) {
  return file.replace(/\\/g, '/').split('/').map(segment => {
    try { return encodeURIComponent(decodeURIComponent(segment)); }
    catch { return encodeURIComponent(segment); }
  }).join('/');
}

function replaceStrings(node, replacements) {
  if (typeof node === 'string') {
    let output = node;
    for (const [from, to] of replacements) output = output.split(from).join(to);
    return output;
  }
  if (Array.isArray(node)) return node.map(value => replaceStrings(value, replacements));
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) node[key] = replaceStrings(node[key], replacements);
  }
  return node;
}

function remainingRefs(data, source) {
  return [...collectReferences(data, source)].map(([ref]) => ref);
}

async function checkURLs(urls, count) {
  const selected = urls.slice().sort(() => Math.random() - 0.5).slice(0, count);
  const results = [];
  for (const url of selected) {
    try {
      const response = await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(20000)});
      results.push({url, status: response.status, ok: response.status >= 200 && response.status < 400});
    } catch (error) {
      // Node fetch ignores HTTPS_PROXY; curl honours the system proxy, so use it as the second opinion.
      const curl = require('child_process').spawnSync('curl', ['-s', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
        '-I', '-w', '%{http_code}', '--max-time', '60', url], {encoding: 'utf8'});
      const status = Number(curl.stdout);
      if (status) results.push({url, status, ok: status >= 200 && status < 400, via: 'curl'});
      else results.push({url, error: error.message, ok: false});
    }
  }
  return results;
}

function installCopy(source,destination){
  const bytes=fs.readFileSync(source),digest=crypto.createHash('sha256').update(bytes).digest('hex');
  let target=destination;
  if(fs.existsSync(target)&&crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==digest){
    const extension=path.extname(destination),base=destination.slice(0,-extension.length);
    target=base+'-'+digest.slice(0,8)+extension;
    if(fs.existsSync(target))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),digest,
      'Online install destination exists with different content: '+target);
  }
  if(!fs.existsSync(target))fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  return {path:target,sha256:digest};
}

// Put the team pack's objects on the table of the save: same GUIDs (refuse on any clash), placed at the nearest
// spot to the pack's own saved position where no table object lies within 5 units, dropped from above the table.
function embedPack(save, pack) {
  const guids = new Set();
  const walk = (o, visit) => { visit(o); (o.ContainedObjects || []).forEach(c => walk(c, visit)); Object.values(o.States || {}).forEach(c => walk(c, visit)); };
  save.ObjectStates.forEach(o => walk(o, x => guids.add(x.GUID)));
  pack.ObjectStates.forEach(o => walk(o, x => { if (guids.has(x.GUID)) throw new Error(`GUID clash while embedding pack: ${x.GUID}`); }));
  const occupied = save.ObjectStates.filter(o => o.Transform).map(o => [o.Transform.posX, o.Transform.posZ]);
  const free = (x, z) => occupied.every(([ox, oz]) => Math.hypot(ox - x, oz - z) >= 5);
  const placed = [];
  for (const original of pack.ObjectStates) {
    const o = JSON.parse(JSON.stringify(original));
    const t = o.Transform || (o.Transform = {posX: 0, posY: 3, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1});
    let spot = [t.posX, t.posZ];
    search: for (let r = 0; r <= 60; r += 4) {
      for (let a = 0; a < 360; a += 30) {
        const x = t.posX + r * Math.cos(a * Math.PI / 180), z = t.posZ + r * Math.sin(a * Math.PI / 180);
        if (free(x, z)) { spot = [x, z]; break search; }
        if (r === 0) break;
      }
    }
    t.posX = Math.round(spot[0] * 1000) / 1000; t.posZ = Math.round(spot[1] * 1000) / 1000; t.posY = Math.max(t.posY || 0, 3.4);
    occupied.push(spot);
    save.ObjectStates.push(o);
    placed.push({guid: o.GUID, nickname: o.Nickname, x: t.posX, z: t.posZ});
  }
  return placed;
}

async function relink(options) {
  const manifestPath = path.resolve('output/online-assets/manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Asset manifest not found: ${manifestPath}; run export-assets.cjs first.`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const replacements = manifest.map(item => [item.ref, `${options.base}/${encodeRelative(item.file)}`])
    .sort((a, b) => b[0].length - a[0].length);
  const sourceInputs = [
    {key: 'save', file: options.save, output: 'KT24-The-Killzone-RU-online.json'},
    {key: 'pack', file: options.pack, output: 'KT41-RU-online.json'}
  ];
  const outDir = path.resolve(options.outDir);
  fs.mkdirSync(outDir, {recursive: true});
  let replacementsCount = 0;
  const files = [];
  const urls = new Set();
  for (const input of sourceInputs) {
    if (!fs.existsSync(input.file)) throw new Error(`Source file not found: ${input.file}`);
    const original = JSON.parse(fs.readFileSync(input.file, 'utf8'));
    const linked = replaceStrings(JSON.parse(JSON.stringify(original)), replacements);
    const restored = replaceStrings(JSON.parse(JSON.stringify(linked)), replacements.map(([from, to]) => [to, from]));
    assert.deepStrictEqual(restored, original, `${input.key} JSON changed beyond asset reference replacements`);
    const local = remainingRefs(linked, input.key);
    assert.equal(local.length, 0, `${input.key} still contains ${local.length} local asset reference(s)`);
    for (const text of strings(linked)) {
      for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
        if (replacements.some(([, url]) => match[0].startsWith(url))) urls.add(match[0].replace(/[),.;]+$/, ''));
      }
    }
    replacementsCount += strings(original).reduce((total, value) => total + replacements.reduce((count, [ref]) =>
      count + value.split(ref).length - 1, 0), 0);
    // TTS lists saves by SaveName: mark the online copy so it is not confused with the local one.
    if (typeof linked.SaveName === 'string' && linked.SaveName && !linked.SaveName.endsWith(' (онлайн)')) {
      linked.SaveName += ' (онлайн)';
    }
    fs.writeFileSync(path.join(outDir, input.output), JSON.stringify(linked, null, 2) + '\n', 'utf8');
    files.push({source: input.key, output: input.output, localRefsRemain: local.length});
  }
  if (options.embedPack) {
    const savePath = path.join(outDir, 'KT24-The-Killzone-RU-online.json');
    const save = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    const pack = JSON.parse(fs.readFileSync(path.join(outDir, 'KT41-RU-online.json'), 'utf8'));
    const placed = embedPack(save, pack);
    fs.writeFileSync(savePath, JSON.stringify(save, null, 2) + '\n', 'utf8');
    files.push({source: 'pack-on-table', output: path.basename(savePath), placed});
  }
  const urlChecks = options.checkUrls ? await checkURLs([...urls], options.checkUrls) : [];
  const urlFailures=urlChecks.filter(result=>!result.ok);
  const installed=[];
  if(options.install){
    const dir=resolveTtsDir({dir:options.ttsDir});
    const saves=path.join(dir,'Saves');
    installed.push({source:'save',...installCopy(path.join(outDir,'KT24-The-Killzone-RU-online.json'),
      path.join(saves,'KT24-The-Killzone-RU-online.json'))});
    installed.push({source:'pack',...installCopy(path.join(outDir,'KT41-RU-online.json'),
      path.join(saves,'Saved Objects','KT41-RU-online.json'))});
  }
  const report = {base: options.base, assetsInManifest: manifest.length, replacementOccurrences: replacementsCount,
    localRefsRemain: files.reduce((sum, file) => sum + file.localRefsRemain, 0), files, urlChecks, urlFailures,
    installed, installNote:installed.length?'TTS saves are discovered by filename; no SaveFileInfos entry was edited.':''};
  fs.writeFileSync(path.join(outDir, 'relink-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

function strings(node, result = []) {
  if (typeof node === 'string') result.push(node);
  else if (Array.isArray(node)) node.forEach(value => strings(value, result));
  else if (node && typeof node === 'object') Object.values(node).forEach(value => strings(value, result));
  return result;
}

if (require.main === module) {
  (async () => {
    try {
      const report = await relink(parseArgs(process.argv.slice(2)));
      console.log(`Relinked ${report.replacementOccurrences} occurrences across ${report.files.length} files.`);
      console.log(`Local references remaining: ${report.localRefsRemain}.`);
      if (report.urlChecks.length) console.log(`HEAD checks: ${JSON.stringify(report.urlChecks)}`);
      if(report.urlFailures.length){console.error('Failed URLs:\n'+report.urlFailures.map(item=>item.url).join('\n'));process.exitCode=1;}
      if(report.installed.length)console.log(`Installed online copies: ${JSON.stringify(report.installed)}`);
      console.log(`Report: output/online/relink-report.json`);
    } catch (error) {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  })();
}

module.exports = {encodeRelative, parseArgs, relink, replaceStrings, checkURLs, installCopy, embedPack};
