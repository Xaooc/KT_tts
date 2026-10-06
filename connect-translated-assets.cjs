const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict');
const {parseSource, decode} = require('./lua-display.cjs');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const images = read('inventory/image-sources.json'), pdfs = read('inventory/pdf-sources.json');
const imageReport = read('output/card-render-report.json'), pdfReport = read('output/pdf-build-report.json');
const definitions = read('ru-images-all-reviewed.json');
const approval = read('inventory/layout-approval.json');
const layoutQA = read('output/card-layout-verification.json');
const textQA = read('output/card-text-verification.json');
assert.ok(textQA.allRussianTextPresent && textQA.definitionFileSHA256 === sha('ru-images-all-reviewed.json'), 'Current rendered Russian text verification is required.');
assert.ok(layoutQA.passed && layoutQA.definitionFileSHA256 === sha('ru-images-all-reviewed.json') && layoutQA.cards === Object.values(definitions).reduce((n, d) => n + (d.kind === 'atlas' ? Object.keys(d.tiles).length : 1), 0), 'Current card geometry and contrast verification is required.');
assert.ok(approval.status === 'approved' && approval.approvalEvidence, 'Approved card design is required.');
assert.deepEqual(Object.keys(imageReport).sort(), Object.keys(definitions).sort(), 'Rendered card inventory must match the reviewed definitions.');
for (const [id, rendered] of Object.entries(imageReport)) {
  assert.equal(rendered.designSystem, approval.selectedStyle, 'Card uses an unapproved layout: ' + id);
  const definitionSHA = crypto.createHash('sha256').update(JSON.stringify(definitions[id])).digest('hex');
  assert.equal(rendered.definitionSHA256, definitionSHA, 'Card translation changed after rendering: ' + id);
}
if (Object.values(pdfReport).some(item => item.layoutVersion >= 2)) {
  const approval = read('inventory/layout-approval.json');
  assert.ok(approval.status === 'approved' && approval.selectedStyle && approval.approvalEvidence,
    'New bulk layout requires the user to approve the design samples before installation.');
  for (const item of Object.values(pdfReport).filter(item => item.layoutVersion >= 2)) {
    assert.equal(item.designSystem, approval.selectedStyle,
      'Experimental PDFs must be rebuilt using the approved design before installation.');
  }
}
const destination = String.raw`C:\Users\PC\Documents\My Games\Tabletop Simulator\Mods\KT-RU`;
const audit = {stage: 'working', complete: true, completeTranslation: true, nativeTTSRuntimeTested: false, destination, assets: [], changes: [], embeddedReferences: []};
const mapping = new Map(), bySourceHash = new Map();
for (const [id, rendered] of Object.entries(imageReport)) {
  assert.equal(rendered.id, id);
  assert.equal(sha(rendered.path), rendered.sha256, 'Generated image changed ' + id);
  assert.ok(rendered.verifiedAgainstPixels && rendered.sourceCardIDPreserved, 'Unreviewed card ' + id);
  const source = images.find(item => item.id === id);
  assert.ok(source, 'Unknown image ' + id);
  assert.equal(sha(source.path), rendered.sourceSHA256, 'Original image changed ' + id);
  const previous = bySourceHash.get(rendered.sourceSHA256);
  if (previous) assert.equal(previous.sha256, rendered.sha256, 'Different translations of identical source images ' + id);
  else bySourceHash.set(rendered.sourceSHA256, rendered);
}
function install(source, rendered, kind) {
  assert.equal(source.sha256, rendered.sourceSHA256);
  assert.equal(sha(source.path), source.sha256);
  assert.equal(sha(rendered.path), rendered.sha256);
  const target = path.join(destination, kind === 'pdf' ? 'pdf' : 'images', path.basename(rendered.path));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (!fs.existsSync(target) || sha(target) !== rendered.sha256) fs.copyFileSync(rendered.path, target);
  assert.equal(sha(target), rendered.sha256);
  const localURL = target.replace(/\\/g, '/');
  mapping.set(source.url, localURL);
  audit.assets.push({id: source.id, kind, sourceURL: source.url, sourceSHA256: source.sha256, translatedPath: target, sha256: rendered.sha256, visuallyVerified: rendered.visuallyVerified});
}
for (const source of images) if (bySourceHash.has(source.sha256)) install(source, bySourceHash.get(source.sha256), 'image');
for (const source of pdfs) if (pdfReport[source.id]) {
  const rendered = pdfReport[source.id];
  assert.equal(rendered.sourcePages, source.pages);
  assert.equal(rendered.translatedSourcePages, source.pages);
  install(source, rendered, 'pdf');
}
const memo = new Map();
function replaceScript(source) {
  if (memo.has(source)) return memo.get(source);
  const patches = [], embedded = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'StringLiteral') {
      const value = decode(node.raw);
      if (mapping.has(value)) patches.push({range: node.range, old: value, value: mapping.get(value)});
      else for (const url of mapping.keys()) if (value.includes(url)) embedded.push(url);
    }
    for (const [key, child] of Object.entries(node)) if (!['range', 'loc'].includes(key)) {
      if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child);
    }
  }
  walk(parseSource(source).ast);
  let text = source;
  for (const patch of patches.sort((a, b) => b.range[0] - a.range[0])) text = text.slice(0, patch.range[0]) + JSON.stringify(patch.value) + text.slice(patch.range[1]);
  parseSource(text);
  const result = {text, patches, embedded: [...new Set(embedded)]};
  memo.set(source, result); return result;
}
const allowedFields = new Set(['ImageURL', 'FaceURL', 'BackURL', 'PDFUrl']);
function connect(node, location, file, approved) {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    const at = location + '/' + key;
    if (allowedFields.has(key) && mapping.has(value)) {
      node[key] = mapping.get(value); approved.set(at, node[key]);
      audit.changes.push({file, path: at, sourceURL: value, translatedPath: node[key]});
    } else if (key === 'LuaScript' && value) {
      const result = replaceScript(value);
      if (result.text !== value) {
        node[key] = result.text; approved.set(at, result.text);
        audit.changes.push({file, path: at, scriptURLReplacements: result.patches.map(patch => ({sourceURL: patch.old, translatedPath: patch.value}))});
      }
      if (result.embedded.length) audit.embeddedReferences.push({file, path: at, sourceURLs: result.embedded});
    } else if (value && typeof value === 'object') connect(value, at, file, approved);
  }
}
function verify(original, translated, location, approved) {
  if (JSON.stringify(original) === JSON.stringify(translated)) return;
  if (approved.has(location)) {assert.equal(translated, approved.get(location)); return;}
  assert.ok(original && translated && typeof original === 'object' && typeof translated === 'object', 'Unapproved change ' + location);
  assert.deepEqual(Object.keys(translated), Object.keys(original), 'Object topology changed ' + location);
  for (const key of Object.keys(original)) verify(original[key], translated[key], location + '/' + key, approved);
}
function scopeNote(data, approved) {
  if (!data.TabStates) return;
  const note = Object.entries(data.TabStates).find(([id, tab]) => tab.title === 'RU — о переводе');
  assert.ok(note, 'Missing Russian notebook');
  const [id, tab] = note;
  tab.body = 'Русская сборка стола и всех 41 отряда локального набора. Переведены интерфейс, описания, способности, игровые карточки и 20 исходных PDF; в наборах добавлены отдельные русские справочники всех 41 отряда. Дизайн согласован: крупные заголовки, плотная вёрстка, выделенные игровые термины, светлый текст на тёмных карточках. Сокращения APL, MOVE, SAVE, WOUNDS, ATK, HIT, DMG, WR, AP и CP сохранены.\n\nПравила отрядов сверены с полными официальными документами и Wahapedia на 05.10.2026. Зачёркнутые изменения исключены. Материалы старых миссионных наборов сохраняют собственную редакцию.\n\nВыберите модель и нажмите R. Наведите мышь на WR для подсказки именно выбранного профиля; кнопка «?» справа от оружия открывает эти трейты в справочнике. Над панелью находятся кнопки «Способности», «Трейты оружия», «Справочник отряда». В справочнике доступны разделы «Модель», «Оружие», «Отряд», «Уловки», «Снаряжение», «FAQ». Введите русский или английский запрос и нажмите Enter. В разделе снаряжения есть и вещи фракции, и все 10 универсальных вариантов с правилами оборотов. Длинные тексты прокручиваются; окно можно переместить и закрыть кнопкой ×. Текст справочника встроен в Lua и не требует открытия PDF или браузера.\n\nКнопка «Уловки» находится в углу экрана и на столе возле табло, рядом с кнопкой обновления панели. Выберите свой отряд; выбор сохраняется отдельно от просмотра моделей через R. Разделы: «Стратегические», «Боевые», «Напоминания». Уловки отмечаются как использованные, а «Закрепить» добавляет напоминание. CP и эффекты применяйте вручную. Кнопка стола «Конец раунда» сбрасывает отметки всех игроков; закреплённые напоминания остаются до снятия. «Сброс отметок» очищает только ваш учёт. Состояние сохраняется вместе со столом.\n\nЗагрузите новый набор KT41-RU вместе с русским столом: модели содержат данные для определения отряда. Для изображений и PDF нужны установленные файлы Mods/KT-RU этого компьютера. Это локальные ресурсы: для сетевой игры их необходимо разместить в облаке и заменить ссылки на общедоступные.\n\nСтруктура сохранений, профили и Lua проверены автоматически. Загрузка и игровые действия внутри Tabletop Simulator ещё не проверялись.';
  approved.set('/TabStates/' + id + '/body', tab.body);
  for (const [tabId, entry] of Object.entries(data.TabStates)) {
    const before = entry.body;
    entry.body = entry.body.replace('Карты на изображениях пока не переведены.', 'Графические карточки переводятся по отрядам; в этой промежуточной сборке часть карточек ещё на английском.');
    if (before !== entry.body) approved.set('/TabStates/' + tabId + '/body', entry.body);
  }
  data.SaveName = 'KT24 The Killzone — русский перевод';
  approved.set('/SaveName', data.SaveName);
}
for (const input of ['KT24-The-Killzone-RU-bundled-working.json', 'KT41-RU-bundled-working.json']) {
  const original = read('output/' + input), translated = structuredClone(original), approved = new Map();
  connect(translated, '', input, approved); if (input.startsWith('KT24-')) scopeNote(translated, approved); verify(original, translated, '', approved);
  const target = 'output/' + input.replace('bundled-working', 'assets-working');
  fs.writeFileSync(target, JSON.stringify(translated, null, 2));
}
audit.counts = {translatedImageURLs: audit.assets.filter(asset => asset.kind === 'image').length, translatedPDFs: audit.assets.filter(asset => asset.kind === 'pdf').length, connectedOccurrences: audit.changes.length, unresolvedEmbeddedOccurrences: audit.embeddedReferences.length};
fs.writeFileSync('output/asset-integration-report.json', JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit.counts));
