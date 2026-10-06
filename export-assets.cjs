const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {resolveTtsDir}=require('./tts-paths.cjs');

let DEFAULT_TTS_DIR;
try { DEFAULT_TTS_DIR = resolveTtsDir(); } catch { /* Resolve after CLI options are known. */ }
const DEFAULT_SAVE = DEFAULT_TTS_DIR&&path.join(DEFAULT_TTS_DIR,'Saves','KT24-The-Killzone-RU.json');
const DEFAULT_PACK = DEFAULT_TTS_DIR&&path.join(DEFAULT_TTS_DIR,'Saves','Saved Objects','KT41-RU.json');
const DEFAULT_ROOT = DEFAULT_TTS_DIR&&path.join(DEFAULT_TTS_DIR,'Mods','KT-RU');
const ASSET_KEYS = /(?:url|path|image|pdf|asset)/i;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function decodeFileRef(ref) {
  let value = String(ref).trim();
  if (/^file:/i.test(value)) {
    value = value.replace(/^file:\/\//i, '');
    try { value = decodeURIComponent(value); } catch { /* Keep malformed escapes literal. */ }
    if (/^\/[A-Za-z]:\//.test(value)) value = value.slice(1);
  } else {
    try { value = decodeURIComponent(value); } catch { /* Keep malformed escapes literal. */ }
  }
  return value.replace(/[?#].*$/, '').replace(/[\\/]+/g, path.sep);
}

function isLocalAssetRef(value, key = '') {
  if (typeof value !== 'string' || !value.trim() || /^https?:\/\//i.test(value.trim())) return false;
  const text = value.trim();
  if (/^file:\/\//i.test(text)) return true;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(text)) return false;
  if (/^[A-Za-z]:[\\/]/.test(text) || /^\\\\[^\\]+\\[^\\]+/.test(text)) return true;
  return ASSET_KEYS.test(key) && /(?:^|[\\/])[^\\/]+\.[A-Za-z0-9]{2,8}(?:[?#].*)?$/.test(text);
}

function extractRefs(value) {
  const text = String(value);
  if (isLocalAssetRef(text)) return [text];
  const found = [];
  const matcher = /(?:file:\/\/\/[^\s"'<>]+|(?:^|(?<=[\s"'(=]))[A-Za-z]:[\\/][^"'<>\r\n]*?\.(?:png|jpe?g|webp|gif|bmp|tiff?|pdf|svg|mp3|ogg|wav|mp4|webm))(?=["'<>\s)]|$)/gi;
  for (const match of text.matchAll(matcher)) found.push(match[0]);
  return found;
}

function collectReferences(data, source, rootPath = '') {
  const refs = new Map();
  function walk(node, at, parentKey = '', guid = '', nickname = '') {
    if (typeof node === 'string') {
      const candidates = isLocalAssetRef(node, parentKey) ? [node] : extractRefs(node);
      for (const ref of candidates) {
        if (!refs.has(ref)) refs.set(ref, []);
        refs.get(ref).push({source, path: at, guid: guid || null, nickname: nickname || null});
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${at}[${index}]`, parentKey, guid, nickname));
      return;
    }
    const nextGuid = typeof node.GUID === 'string' ? node.GUID : guid;
    const nextNickname = typeof node.Nickname === 'string' ? node.Nickname : nickname;
    for (const [key, child] of Object.entries(node)) {
      walk(child, at ? `${at}.${key}` : key, key, nextGuid, nextNickname);
    }
  }
  walk(data, rootPath);
  return refs;
}

function safeSegment(segment) {
  let decoded = segment;
  try { decoded = decodeURIComponent(segment); } catch { /* Keep malformed escapes literal. */ }
  return decoded.replace(/[<>:"|?*\\/\x00-\x1f]/g, '_').replace(/[ .]+$/g, '') || '_';
}

function relativeAssetPath(ref, assetRoot) {
  const absolute = decodeFileRef(ref);
  const resolved = path.resolve(absolute);
  const root = path.resolve(assetRoot);
  const relative = path.relative(root, resolved);
  if (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) {
    return relative.split(path.sep).map(safeSegment).join('/');
  }
  if (relative === '') return 'misc/' + crypto.createHash('sha256').update(ref).digest('hex').slice(0, 8) + '-asset';
  const name = safeSegment(path.basename(resolved));
  return `misc/${crypto.createHash('sha256').update(ref).digest('hex').slice(0, 8)}-${name}`;
}

function missingAssets(refs) {
  return [...refs].filter(([ref]) => {
    const file = path.resolve(decodeFileRef(ref));
    return !fs.existsSync(file) || !fs.statSync(file).isFile();
  }).map(([ref, usedIn]) => ({ref, usedIn}));
}

function parseArgs(argv) {
  const result = {save: DEFAULT_SAVE, pack: DEFAULT_PACK, root: DEFAULT_ROOT, out: 'output/online-assets'};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--save') result.save = argv[++i];
    else if (argv[i] === '--pack') result.pack = argv[++i];
    else if (argv[i] === '--asset-root') result.root = argv[++i];
    else if (argv[i] === '--out-dir') result.out = argv[++i];
    else if (argv[i] === '--tts-dir') {
      const dir = resolveTtsDir({dir: argv[++i]});
      result.save = path.join(dir, 'Saves', 'KT24-The-Killzone-RU.json');
      result.pack = path.join(dir, 'Saves', 'Saved Objects', 'KT41-RU.json');
      result.root = path.join(dir, 'Mods', 'KT-RU');
    }
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if(!result.save||!result.pack||!result.root){
    const dir=resolveTtsDir();
    result.save||=path.join(dir,'Saves','KT24-The-Killzone-RU.json');
    result.pack||=path.join(dir,'Saves','Saved Objects','KT41-RU.json');
    result.root||=path.join(dir,'Mods','KT-RU');
  }
  return result;
}

function exportAssets(options) {
  const sources = [
    {name: 'save', file: options.save},
    {name: 'pack', file: options.pack}
  ];
  const all = new Map();
  for (const source of sources) {
    if (!fs.existsSync(source.file)) throw new Error(`Source file not found: ${source.file}`);
    const data = JSON.parse(fs.readFileSync(source.file, 'utf8'));
    for (const [ref, uses] of collectReferences(data, source.name)) {
      if (!all.has(ref)) all.set(ref, []);
      all.get(ref).push(...uses);
    }
  }
  const outDir = path.resolve(options.out);
  fs.mkdirSync(outDir, {recursive: true});
  const manifest = [];
  const missing = missingAssets(all);
  if (missing.length) {
    throw new Error(`Missing ${missing.length} referenced asset file(s):\n${missing.slice(0, 20).map(item => item.ref).join('\n')}`);
  }
  const targetRefs = new Map();
  for (const [ref, usedIn] of all) {
    const sourceFile = path.resolve(decodeFileRef(ref));
    if (missing.some(item => item.ref === ref)) continue;
    let relative = relativeAssetPath(ref, options.root);
    if (targetRefs.has(relative) && targetRefs.get(relative) !== ref) {
      const ext = path.posix.extname(relative);
      relative = `${relative.slice(0, -ext.length)}-${crypto.createHash('sha256').update(ref).digest('hex').slice(0, 8)}${ext}`;
    }
    targetRefs.set(relative, ref);
    const targetFile = path.resolve(outDir, ...relative.split('/'));
    if (!targetFile.startsWith(outDir + path.sep)) throw new Error(`Unsafe destination path for ${ref}`);
    fs.mkdirSync(path.dirname(targetFile), {recursive: true});
    fs.copyFileSync(sourceFile, targetFile);
    manifest.push({ref, file: relative, sha256: sha256(targetFile), bytes: fs.statSync(targetFile).size, usedIn});
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outDir, 'README.txt'), [
    'Загрузка ассетов для сетевой игры в Tabletop Simulator',
    '',
    'GitHub: создайте публичный репозиторий, загрузите содержимое этой папки (включая подпапки),',
    'затем используйте базовый адрес:',
    'https://raw.githubusercontent.com/<user>/<repo>/main/',
    'Проверка URL: node relink-assets.cjs --base <URL> --check-urls <количество>. Ошибки HEAD записываются в relink-report.json.',
    'Установка: добавьте --install, чтобы скопировать связанные файлы в Saves. При совпадении имён сохраняются обе версии.',
    'Передавайте этот адрес скрипту relink-assets.cjs через --base.',
    '',
    'Steam Cloud: загрузка через TTS Modding → Cloud Manager выполняется по одному файлу.',
    'Для более чем 1300 файлов такой способ непрактичен.',
    ''
  ].join('\n'), 'utf8');
  const bytes = manifest.reduce((sum, item) => sum + item.bytes, 0);
  return {count: manifest.length, bytes, missing: 0, manifest};
}

if (require.main === module) {
  try {
    const result = exportAssets(parseArgs(process.argv.slice(2)));
    console.log(`Exported ${result.count} unique assets (${(result.bytes / 1024 / 1024).toFixed(2)} MB).`);
    console.log(`Manifest: output/online-assets/manifest.json`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {collectReferences, decodeFileRef, exportAssets, extractRefs, isLocalAssetRef, missingAssets, relativeAssetPath};
