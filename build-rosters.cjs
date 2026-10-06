// Reviewed Russian roster sources. Indices are zero-based positions in the HUD library.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const selections = {
  angelsofdeath: [14, 15], battleclade: [0], bladesofkhaine: [14, 15], blooded: [10, 11],
  broodbrothers: [1, 2], chaoscult: [18], corsairvoidscarred: [11, 12], deathkorps: [17, 18],
  deathwatch: [12], elucidianstarstriders: [6], exactionsquad: [0, 1], farstalkerkinband: [6, 7],
  fellgorravager: [10], gellerpoxinfected: [18], goremongers: [16], handofthearchon: [6, 7],
  hearthkynsalvager: [5, 6], hernkynyaegirs: [8], hierotekcircle: [14, 15],
  hunterclade: ['29a6f58596e10e41', 'c49b7b88af9c84bc', '00080c27039bb502'],
  imperialnavybreachers: [5, 6], inquisitorialagents: [9, 10], kasrkin: [12, 13], kommandos: [9],
  legionary: [7, 8], mandrakes: [5], nemesisclaw: [9, 10], novitiates: [2], pathfinders: [7, 8],
  phobosstriketeam: [16, 17], plaguemarines: [17], ratlings: [5, 6], raveners: [5], sanctifiers: [0, 1],
  scoutsquad: [12], tempestusaquilons: [0, 1], vespidsstingwing: ['4f7229a631152b96'],
  voiddancertroupe: [16, 17], warpcoven: ['a707fa127bcb0840'], wreckakrew: [9], wyrmblade: [16, 17],
};
// These reviewed reverse sides repeat information already included in the complete front text.
// Keep their provenance so the service also excludes them from the faction-rules section.
const redundant = {corsairvoidscarred: [12], exactionsquad: [1], hierotekcircle: [15], kasrkin: [13], nemesisclaw: [10]};

function clean(raw) {
  return raw.replace(/\r\n?/g, '\n').replace(/\u00ad/g, '').replace(/\u00a0/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/<b>([^\n]*?)<\/b>/g, (_, title) => '\n\n' + title.replace(/:$/, '') + ':\n')
    .replace(/<[^>]+>/g, '').replace(/\*\*/g, '')
    .replace(/(?:Продолжение\s*(?:—\s*)?на обороте|Список продолжается на обратной стороне)\.?/gi, '')
    .replace(/См\. оборот карточки: ограничения выбора приведены там\./gi, '')
    .replace(/^.*(?:СМ\. ОБОРОТ|SEE REVERSE).*$/gm, '');
}

function listLines(sentence) {
  // Split only at top-level separators before named operatives, never inside weapon parentheses.
  const named = /^[А-ЯЁа-яё][^;:()]*\([A-Z][A-Z ’'ÂÔ.\-]*\)/;
  const intro = sentence.match(/^(.*?(?:из списка|из следующего списка|оперативников[^:]*):)\s*(.+)$/i);
  const head = intro ? intro[1] : '', text = intro ? intro[2] : sentence;
  if (!intro && /^(?:В отряде|Кроме|За исключением|Каждый|Каждого|Для|Нельзя|В некоторых|До)\s/u.test(text)) {
    return sentence;
  }
  const pieces = [];
  let start = 0, depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')') depth--;
    if (depth !== 0 || !';,'.includes(text[i])) continue;
    const next = text.slice(i + 1).trimStart();
    if (!named.test(next) && !(intro && text[i] === ';' && /^[А-ЯЁ]/.test(next))) continue;
    pieces.push(text.slice(start, i).trim());
    start = i + 1;
  }
  pieces.push(text.slice(start).trim());
  if (pieces.length === 1 && !intro) return sentence;
  return (head ? head + '\n' : '') + pieces.map(piece => '- ' + piece).join('\n');
}

function sentences(text) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')') depth--;
    if (depth || text[i] !== '.' || !/^\s+[А-ЯЁA-Z«]/u.test(text.slice(i + 1))) continue;
    if (/(?:^|\s)(?:т|е|д|п|см|др)$/u.test(text.slice(0, i))) continue;
    parts.push(text.slice(start, i + 1).trim());
    start = i + 1;
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function normalize(raw) {
  const out = [];
  let paragraph = '';
  let listMode = false;
  const flush = () => {
    if (!paragraph) return;
    // Wrapped OCR lines become sentences; dotted names such as C.A.T. stay intact.
    out.push(sentences(paragraph).map(listLines).join('\n\n'));
    paragraph = '';
  };
  for (let line of clean(raw).split('\n')) {
    line = line.trim().replace(/[ \t]+/g, ' ');
    if (/^(?:\d{1,3}|(?:страница|page)\s+\d+)$/i.test(line)) continue;
    if (!line) { flush(); continue; }
    const heading = line.length < 130 && /:$/.test(line);
    const bareHeading = /^(?:ОПЕРАТИВНИКИ|АРХЕТИПЫ?)$/.test(line);
    const bullet = /^[•○▶◆■–—*-]\s+/.test(line);
    const operative = /^[А-ЯЁ][^():]*\([A-Z][A-Z ’'ÂÔ.\-]*\)/.test(line)
      && !/^(?:Выберите|Ещё|Каждый|Каждого|Кроме|Для|За исключением|В отряде)(?:\s|$)/u.test(line);
    if (heading || bareHeading) {
      flush(); out.push(bareHeading ? line + ':' : line);
      listMode = /списка:$/i.test(line);
      continue;
    }
    if (bullet || operative && (listMode || /(?:списка:|[.;])$/.test(paragraph))) {
      flush(); paragraph = '- ' + line.replace(/^[•○▶◆■–—*-]\s+/, '');
    } else {
      paragraph += (paragraph ? ' ' : '') + line;
    }
  }
  flush();
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function generate(library, cards) {
  const teamKeys = Object.keys(library.teams).sort();
  assert.equal(teamKeys.length, 41, 'Expected all 41 library teams');
  assert.deepEqual(Object.keys(selections).sort(), teamKeys, 'Missing/unknown roster team');
  return Object.fromEntries(teamKeys.map(teamKey => {
    const team = library.teams[teamKey], blocks = [], sources = [], seen = new Set();
    for (const selected of selections[teamKey]) {
      const isCard = typeof selected === 'string';
      sources.push(isCard ? 'card:' + selected : 'library:entries[' + selected + ']');
      const source = isCard ? cards[selected] : team.entries[selected];
      assert(source && (isCard ? source.verifiedAgainstPixels : source.category === 'team'), 'Invalid source: ' + teamKey);
      const raws = isCard ? source.blocks.map(block => {
        assert(block.russian, 'Missing Russian card block: ' + selected);
        const heading = block.headingRussian || '';
        return (heading ? '<b>' + heading + '</b>\n' : '') + block.russian;
      }) : [source.text];
      if ((redundant[teamKey] || []).includes(selected)) continue;
      for (const raw of raws) {
        const body = normalize(raw);
        assert(body.length > 80, 'Incomplete roster: ' + teamKey);
        if (seen.has(body)) continue;
        seen.add(body);
        blocks.push({title: blocks.length === 0 ? 'Состав отряда' : 'Состав отряда — продолжение', body});
      }
    }
    assert(blocks.length, 'Missing roster: ' + teamKey);
    return [teamKey, {title: 'Состав отряда', blocks, sources}];
  }));
}

function literal(s) {
  return '"' + s.replace(/[\\"\x00-\x1f\x7f]/g, ch => {
    return ({'\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t'})[ch]
      || '\\' + String(ch.charCodeAt(0)).padStart(3, '0');
  }) + '"';
}

function stringLines(s, indent) {
  const chunks = [];
  let chunk = '';
  for (const char of s) {
    if ((indent + literal(chunk + char) + ' ..').length > 136) { chunks.push(chunk); chunk = ''; }
    chunk += char;
  }
  chunks.push(chunk);
  return chunks.map((part, i) => indent + literal(part) + (i < chunks.length - 1 ? ' ..' : ',')).join('\n');
}

function serialize(rosters) {
  const lines = ['RuRosters = {'];
  for (const [team, roster] of Object.entries(rosters)) {
    lines.push('    [' + literal(team) + '] = {', '        title = ' + literal(roster.title) + ',', '        blocks = {');
    for (const block of roster.blocks) {
      lines.push('            {', '                title = ' + literal(block.title) + ',', '                body =',
        stringLines(block.body, '                    '), '            },');
    }
    lines.push('        },', '        sources = {');
    for (const source of roster.sources) lines.push('            ' + literal(source) + ',');
    lines.push('        },', '    },');
  }
  return lines.concat('}', '').join('\n');
}

module.exports = {generate, normalize, serialize};
if (require.main === module) {
  const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  const rosters = generate(read('output/reference-hud-library.json'), read('ru-images-all-reviewed.json'));
  fs.writeFileSync(path.join(__dirname, 'ui/data-rosters.lua'), serialize(rosters));
  for (const [team, roster] of Object.entries(rosters)) {
    console.log(team + ': ' + roster.blocks.length + ' blocks; ' + roster.sources.join(', '));
  }
  for (const team of ['hierotekcircle', 'hunterclade', 'warpcoven']) {
    console.log('\n' + team + ': ' + rosters[team].blocks[0].body.slice(0, 300));
  }
}
