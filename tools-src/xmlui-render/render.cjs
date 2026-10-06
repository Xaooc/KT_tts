'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { layout, color, entries } = require('./layout.cjs');

function args(argv) {
  const out = { player: '', textAutosize: 'on' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--expand-scroll' || argv[i] === '--compare-autosize' || argv[i] === '--check') out[argv[i].slice(2)] = true;
    else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = n => `${Math.max(0, n)}px`;
async function measureText(nodes, tree, browser) {
  const requests = [];
  function visit(list, laidOut, inLayout = false) {
    for (let i = 0; i < list.length; i++) {
      const n = list[i], box = laidOut[i]?.box;
      const a = n.attributes || {}, isLayout = /^(Horizontal|Vertical)Layout$/.test(n.tag);
      if (n.tag === 'Text' && inLayout && a.preferredHeight == null && box) {
        requests.push({ node: n, text: String(a.text ?? n.value ?? ''), fontSize: Number(a.fontSize) || 14,
          bold: a.fontStyle === 'Bold', width: box.width,
          wrap: String(a.horizontalOverflow || 'Overflow').toLowerCase() === 'wrap' });
      }
      visit(entries(n.children), laidOut[i]?.children || [], isLayout || inLayout && n.tag === 'Panel');
    }
  }
  visit(nodes, tree);
  if (!requests.length) return;
  const page = await browser.newPage();
  try {
    const heights = await page.evaluate(items => {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      return items.map(item => {
        ctx.font = `${item.bold ? 'bold ' : ''}${item.fontSize}px Arial`;
        const lines = item.text.split('\n');
        let lineCount = 0;
        for (const line of lines) {
          if (!item.wrap) { lineCount++; continue; }
          const words = line.split(/\s+/); let row = '';
          for (const word of words) {
            const candidate = row ? `${row} ${word}` : word;
            if (row && ctx.measureText(candidate).width > item.width) { lineCount++; row = word; }
            else row = candidate;
          }
          lineCount++;
        }
        return Math.max(1, lineCount) * item.fontSize * 1.2;
      });
    }, requests.map(({ node, ...x }) => x));
    requests.forEach((r, i) => { r.node.attributes ||= {}; r.node.attributes.preferredHeight = heights[i]; });
  } finally { await page.close(); }
}
function rich(text) {
  return esc(text).replace(/&lt;(\/?)b&gt;/gi, '<$1b>').replace(/&lt;(\/?)i&gt;/gi, '<$1i>')
    .replace(/&lt;color=(#[\da-f]{3,8})&gt;/gi, '<span style="color:$1">').replace(/&lt;\/color&gt;/gi, '</span>')
    .replace(/&lt;size=(\d+)&gt;/gi, '<span style="font-size:$1px">').replace(/&lt;\/size&gt;/gi, '</span>');
}
function nodeHtml(n, assets, index, parentBox = { x: 0, y: 0 }) {
  const a = n.attributes || {}, b = n.box, tag = n.tag;
  const id = a.id || `node-${index}`;
  const base = `position:absolute;left:${b.x - parentBox.x}px;top:${b.y - parentBox.y}px;width:${px(b.width)};height:${px(b.height)};box-sizing:border-box;`;
  const shadow = a.shadow ? `box-shadow:${String(a.shadowDistance || '2 2').split(/[ ,]+/).join('px ')}px ${color(a.shadow, 'rgba(0,0,0,.45)')};` : '';
  const outline = a.outline ? `border:${tupleBorder(a.outlineSize)}px solid ${color(a.outline, '#ffffff')};` : '';
  const common = `id="${esc(id)}" data-tag="${esc(tag)}"`;
  const kids = n.children.map((c, i) => nodeHtml(c, assets, `${index}-${i}`, b)).join('');
  const bg = color(a.color, 'transparent');
  if (tag === 'Text') {
    const overflow = String(a.horizontalOverflow || 'Overflow').toLowerCase() === 'wrap' ? 'normal' : 'pre';
    return `<div ${common} class="text-node" style="${base}${shadow}${outline}font: ${a.fontStyle === 'Bold' ? 'bold ' : ''}${Number(a.fontSize) || 14}px Arial,sans-serif;color:${color(a.color, '#323232')};text-align:${align(a.alignment)};white-space:${overflow};overflow:${a.verticalOverflow === 'Truncate' ? 'hidden' : 'visible'};line-height:normal">${rich(n.text)}</div>`;
  }
  if (tag === 'Image') {
    let src = a.image && assets[a.image];
    if (src && !/^(?:https?:|data:|file:)/i.test(src)) src = pathToFileURL(path.resolve(src)).href;
    if (src) {
      // Unity Image colour tints the sprite (multiply); white or no colour means the sprite as-is.
      const tint = a.color && !/^#?f{6}(?:f{2})?$/i.test(String(a.color).replace('#','')) && String(a.color).toLowerCase() !== 'white' ? color(a.color, '#ffffff') : '';
      const size = a.preserveAspect === 'true' ? 'contain' : '100% 100%';
      const fill = tint ? `background:${tint};-webkit-mask:url('${esc(src)}') center/${size} no-repeat;mask:url('${esc(src)}') center/${size} no-repeat;` : `background-image:url('${esc(src)}');background-size:${size};background-repeat:no-repeat;background-position:center;`;
      return `<div ${common} style="${base}${shadow}${outline}${fill}"></div>`;
    }
    return `<div ${common} style="${base}${shadow}${outline}background:${bg};${src ? `background-image:url('${esc(src)}');background-size:${a.preserveAspect === 'true' ? 'contain' : '100% 100%'};background-repeat:no-repeat;background-position:center;` : ''}"></div>`;
  }
  if (tag === 'Button' || tag === 'ToggleButton') {
    const disabled = String(a.interactable).toLowerCase() === 'false';
    const c = String(a.colors || '#dddddd|#eeeeee|#cccccc|#888888').split('|');
    return `<button ${common} ${disabled ? 'disabled' : ''} style="${base}${shadow}${outline}border:0;background:${color(disabled ? c[3] : c[0], '#dddddd')};color:${color(a.textColor, '#222222')};font:${a.fontStyle === 'Bold' ? 'bold ' : ''}${Number(a.fontSize) || 14}px Arial,sans-serif;overflow:hidden">${rich(n.text)}</button>`;
  }
  if (tag === 'InputField') return `<div ${common} style="${base}background:${color((a.colors || '#ffffff').split('|')[0], '#fff')};color:${color(a.textColor, '#222')};font: ${Number(a.fontSize) || 14}px Arial,sans-serif;padding:4px;overflow:hidden">${esc(a.text || a.placeholder || '')}</div>`;
  if (tag === 'Dropdown') {
    const selected = n.children.find(c => String(c.attributes.selected).toLowerCase() === 'true') || n.children[0];
    return `<div ${common} style="${base}background:${bg};padding:5px;font:14px Arial,sans-serif">${esc(selected ? selected.text : '')} &gt;</div>`;
  }
  if (tag === 'Toggle') return `<div ${common} style="${base}font:14px Arial,sans-serif;color:${color(a.textColor, '#222')};padding:3px"><span style="display:inline-block;border:1px solid #555;width:14px;height:14px;vertical-align:middle">${String(a.isOn).toLowerCase() === 'true' ? 'X' : ''}</span> ${esc(n.text)}</div>`;
  if (tag === 'ProgressBar') {
    const pct = Math.max(0, Math.min(100, Number(a.percentage) || 0));
    return `<div ${common} style="${base}background:${bg};overflow:hidden"><div style="width:${pct}%;height:100%;background:${color(a.fillImageColor, '#3b8dca')}"></div>${String(a.showPercentageText).toLowerCase() === 'true' ? `<span style="position:absolute;inset:0;text-align:center;color:${color(a.textColor, '#222')};font:14px Arial">${pct}%</span>` : ''}</div>`;
  }
  const scroll = /ScrollView/.test(tag);
  const overflow = scroll ? (tag.startsWith('Vertical') ? 'overflow-y:auto;overflow-x:hidden;' : 'overflow-x:auto;overflow-y:hidden;') : '';
  return `<div ${common} style="${base}${shadow}${outline}${overflow}background:${bg};">${kids}</div>`;
}
function tupleBorder(v) { const a = String(v || '1 1').split(/[ ,]+/).map(Number); return Math.max(...a.filter(Number.isFinite), 1); }
function align(v) { return /Right$/.test(v || '') ? 'right' : /Center$/.test(v || '') ? 'center' : 'left'; }
function htmlFor(tree, name, assets = {}) {
  const body = tree.map((n, i) => nodeHtml(n, assets, `${i}`)).join('');
  return `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;font-family:Arial,sans-serif;background:#30343a;overflow:hidden}main{position:relative;width:1920px;height:1080px;overflow:hidden;background:#20252b}button{padding:0}main>div,main>button{}</style><main data-scene="${esc(name)}">${body}</main>`;
}
function walk(nodes, cb, parent = null) { for (const n of nodes) { cb(n, parent); walk(n.children || [], cb, n); } }
function overlapProblems(tree) {
  const found = [];
  walk(tree, n => {
    if (!/Layout$/.test(n.tag) && n.tag !== 'GridLayout') return;
    const c = n.children || [];
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
      const a = c[i].box, b = c[j].box;
      if (a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1)
        found.push({ type: 'sibling-overlap', tag: n.tag, elements: [c[i].attributes.id || c[i].tag, c[j].attributes.id || c[j].tag] });
    }
  });
  return found;
}
async function main() {
  const opt = args(process.argv), input = path.resolve(opt.in || ''), out = path.resolve(opt.out || 'tmp/xmlui-render');
  if (!opt.in || !opt.out) throw new Error('Usage: render.cjs --in scenes.json --out dir');
  fs.mkdirSync(out, { recursive: true });
  const scenes = JSON.parse(fs.readFileSync(input, 'utf8')), assetMap = opt.assets ? JSON.parse(fs.readFileSync(opt.assets, 'utf8')) : {};
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const report = { scenes: {}, summary: { scenes: 0, elements: 0, problems: 0 },
    approximated: [
      'RectTransform anchors, pivots, y-up offsets, and common layout-group preferred/flexible sizing are mapped to pixel boxes.',
      'Text preferred height is measured in Chromium using Arial and canvas text metrics when autosize is enabled.',
      'Common grid constraints, table rows/cells, scroll clipping, content size fitting, and control appearances are represented.'
    ],
    uncertain: [
      'TTS Unity font metrics, font fallback, rich-text edge cases, native controls, and sprite slicing can differ from Chromium.',
      'XmlLayout edge cases for GridLayout constraints, table auto-calculated row heights, scrollbar sizing, and layout rebuild timing are not reproduced exactly.'
    ] };
  try {
    for (const [sceneName, raw] of Object.entries(scenes)) {
      const roots = entries(raw), noautoRoots = JSON.parse(JSON.stringify(roots));
      let tree = layout(roots, { player: opt.player, expandScroll: !!opt['expand-scroll'], textAutosize: opt.textAutosize !== 'off' });
      if (opt.textAutosize !== 'off') {
        await measureText(roots, tree, browser);
        tree = layout(roots, { player: opt.player, expandScroll: !!opt['expand-scroll'], textAutosize: true });
      }
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const doc = htmlFor(tree, sceneName, assetMap);
      fs.writeFileSync(path.join(out, `${sceneName}.html`), doc);
      await page.setContent(doc, { waitUntil: 'load' });
      const probs = overlapProblems(tree);
      walk(tree, n => {
        if ((n.tag === 'Button' || n.tag === 'Text') && !String(n.text || '').trim()) probs.push({ type: 'empty-text', tag: n.tag, id: n.attributes.id || null });
        if (n.tag === 'Text' && n.attributes.verticalOverflow === 'Truncate') {
          const node = page.locator(`#${cssEscape(n.attributes.id || '')}`);
          if (n.attributes.id && node.count) { /* Browser metrics collected below for stable report. */ }
        }
      });
      const browserProblems = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('[data-tag]')) {
          const r = el.getBoundingClientRect(), tag = el.dataset.tag;
          const id = el.id;
          if (tag === 'Text' && el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow === 'hidden') out.push({ type: 'text-vertical-overflow', id, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
          if (tag === 'Text' && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).whiteSpace === 'pre') out.push({ type: 'text-horizontal-overflow', id, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
          const parent = el.parentElement;
          if (parent && parent.matches('[data-tag]') && !el.closest('[data-tag*="ScrollView"]') && !/ScrollView/.test(parent.dataset.tag)) {
            const p = parent.getBoundingClientRect();
            if (r.left < p.left - 1 || r.top < p.top - 1 || r.right > p.right + 1 || r.bottom > p.bottom + 1) out.push({ type: 'outside-parent', id, parent: parent.id });
          }
        }
        return out;
      });
      probs.push(...browserProblems);
      await page.screenshot({ path: path.join(out, `${sceneName}.png`) });
      await page.close();
      report.scenes[sceneName] = { elements: count(tree), problems: probs.length, findings: probs };
      report.summary.scenes++; report.summary.elements += count(tree); report.summary.problems += probs.length;
      if (opt['compare-autosize']) {
        const noauto = layout(noautoRoots, { player: opt.player, expandScroll: !!opt['expand-scroll'], textAutosize: false });
        const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await p.setContent(htmlFor(noauto, sceneName, assetMap), { waitUntil: 'load' });
        await p.screenshot({ path: path.join(out, `${sceneName}.noauto.png`) }); await p.close();
      }
    }
  } finally { await browser.close(); }
  if (opt.check) fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
}
function count(nodes) { return nodes.reduce((s, n) => s + 1 + count(n.children || []), 0); }
function cssEscape(s) { return String(s).replace(/[^\w-]/g, '\\$&'); }
module.exports = { htmlFor };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
