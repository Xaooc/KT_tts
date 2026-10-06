const fs = require('fs'), crypto = require('crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);

// Translate rule bodies only. Names, characteristics and backend identifiers keep their source values.
module.exports = function localizeTableProse(table) {
  const source = JSON.parse(fs.readFileSync(__dirname + '/inventory/table-prose-source.json', 'utf8'));
  const dictionaries = ['ru-rule-texts.json', 'ru-team-prose.json', 'ru-table-prose.json']
    .map(file => JSON.parse(fs.readFileSync(__dirname + '/' + file, 'utf8')));
  const translations = Object.assign({}, ...dictionaries);
  const expected = new Map(source.map(item => [item.id, item.english]));
  const approved = new Map(), changes = [], seen = new Set();
  for (const [id, english] of expected) {
    if (hash(english) !== id || typeof translations[id] !== 'string' || !translations[id].trim()) {
      throw Error('Missing or mismatched table translation ' + id);
    }
  }
  function leaf(owner, key, location, guid) {
    const english = owner[key];
    if (typeof english !== 'string' || !english.trim()) return;
    const id = hash(english);
    if (!expected.has(id) || expected.get(id) !== english) throw Error('Uninventoried table rule ' + location);
    const russian = translations[id];
    owner[key] = russian;
    approved.set(location, russian);
    seen.add(id);
    changes.push({path: location, guid, id});
  }
  function bodies(value, location, guid) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && ['text', 'description', 'desc'].includes(key)) leaf(value, key, location + '/' + key, guid);
      else if (child && typeof child === 'object') bodies(child, location + '/' + key, guid);
    }
  }
  function visit(value, location) {
    if (!value || typeof value !== 'object') return;
    if (value.LuaScriptState) {
      const state = JSON.parse(value.LuaScriptState), before = changes.length;
      if (state.info) {
        const at = location + '/LuaScriptState/info';
        for (const key of ['abilities', 'actions', 'psychic', 'special']) bodies(state.info[key], at + '/' + key, value.GUID);
        for (const key of Object.keys(state.info.rules || {})) leaf(state.info.rules, key, at + '/rules/' + key, value.GUID);
      }
      if (changes.length !== before) value.LuaScriptState = JSON.stringify(state);
    }
    for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') visit(child, location + '/' + key);
  }
  visit(table, '');
  if (seen.size !== expected.size) throw Error('Missing table source bodies: ' + [...expected.keys()].filter(id => !seen.has(id)).join(', '));
  return {approved, changes, uniqueTexts: seen.size};
};
