const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {collectReferences} = require('./export-assets.cjs');

const DEFAULT_SAVE = 'C:/Users/PC/Documents/My Games/Tabletop Simulator/Saves/KT24-The-Killzone-RU.json';
const DEFAULT_PACK = 'C:/Users/PC/Documents/My Games/Tabletop Simulator/Saves/Saved Objects/KT41-RU.json';

function parseArgs(argv) {
  const options = {save: DEFAULT_SAVE, pack: DEFAULT_PACK, outDir: 'output/online'};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') options.base = argv[++i];
    else if (argv[i] === '--source') options.save = argv[++i];
    else if (argv[i] === '--pack') options.pack = argv[++i];
    else if (argv[i] === '--out-dir') options.outDir = argv[++i];
    else if (argv[i] === '--check-urls') options.checkUrls = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!options.base) throw new Error('Usage: node relink-assets.cjs --base <URL> [--source <save.json>] [--pack <pack.json>] [--out-dir <dir>]');
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
      const response = await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(8000)});
      results.push({url, status: response.status});
    } catch (error) {
      results.push({url, error: error.message});
    }
  }
  return results;
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
    fs.writeFileSync(path.join(outDir, input.output), JSON.stringify(linked, null, 2) + '\n', 'utf8');
    files.push({source: input.key, output: input.output, localRefsRemain: local.length});
  }
  const urlChecks = options.checkUrls ? await checkURLs([...urls], options.checkUrls) : [];
  const report = {base: options.base, assetsInManifest: manifest.length, replacementOccurrences: replacementsCount,
    localRefsRemain: files.reduce((sum, file) => sum + file.localRefsRemain, 0), files, urlChecks};
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
      console.log(`Report: output/online/relink-report.json`);
    } catch (error) {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  })();
}

module.exports = {encodeRelative, parseArgs, relink, replaceStrings};
