'use strict';

const PLAYER_COLORS = {
  white: '#ffffff', brown: '#7a5230', red: '#ff0000', orange: '#ff8000', yellow: '#ffff00',
  green: '#00ff00', teal: '#00ffff', blue: '#0000ff', purple: '#800080', pink: '#ff00ff',
  grey: '#808080', gray: '#808080', black: '#000000', clear: '#00000000'
};

function color(value, fallback = '#000000') {
  if (value == null || value === '') return fallback;
  const s = String(value).trim();
  if (PLAYER_COLORS[s.toLowerCase()]) return PLAYER_COLORS[s.toLowerCase()];
  if (/^#[\da-f]{3,8}$/i.test(s)) return s;
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const raw = m[1].split(/[ ,/]+/).filter(Boolean), parts = raw.map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      const floatSyntax = raw.slice(0, 3).some(x => x.includes('.'));
      const rgb = parts.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(255, floatSyntax && x <= 1 ? x * 255 : x))));
      return parts.length > 3 ? `rgba(${rgb.join(',')},${Math.max(0, Math.min(1, parts[3]))})` : `rgb(${rgb.join(',')})`;
    }
  }
  return fallback;
}

function entries(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.keys(value).sort((a, b) => Number(a) - Number(b)).map(k => value[k]);
  return [];
}
function resolveDefaults(nodes) {
  const tags = {}, classes = {};
  function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (n.tag === 'Defaults') {
      for (const d of entries(n.children)) {
        const a = d.attributes || {}, values = { ...(d.attributes || {}), ...(d.value && typeof d.value === 'object' ? d.value : {}) };
        delete values.class; delete values.id; delete values.name;
        if (d.tag === 'Class' || a.name) {
          const names = String(a.name || a.class || '').split(/\s+/).filter(Boolean);
          for (const c of names) classes[c] = { ...(classes[c] || {}), ...values };
        } else if (d.tag && a.class) {
          // <Button class="x"> applies only to Buttons that carry class x (XmlLayout semantics).
          for (const c of String(a.class).split(/\s+/).filter(Boolean)) {
            const key = d.tag + '.' + c;
            classes[key] = { ...(classes[key] || {}), ...values };
          }
        } else if (d.tag) tags[d.tag] = { ...(tags[d.tag] || {}), ...values };
      }
    }
    for (const c of entries(n.children)) visit(c);
  }
  entries(nodes).forEach(visit);
  return { tags, classes };
}
function attributes(node, defaults) {
  const tag = defaults.tags[node.tag] || {};
  const cls = String((node.attributes || {}).class || '').split(/\s+/).filter(Boolean)
    .reduce((out, c) => Object.assign(out, defaults.classes[c] || {}, defaults.classes[node.tag + '.' + c] || {}), {});
  return { ...tag, ...cls, ...(node.attributes || {}) };
}
function num(v, base, fallback) {
  if (v == null || v === '') return fallback;
  const s = String(v).trim();
  return s.endsWith('%') ? base * (parseFloat(s) || 0) / 100 : (parseFloat(s) || 0);
}
function tuple(v, count, fallback = 0) {
  const a = String(v == null ? '' : v).trim().split(/[ ,]+/).filter(Boolean).map(Number);
  return Array.from({ length: count }, (_, i) => Number.isFinite(a[i]) ? a[i] : fallback);
}
const anchors = {
  UpperLeft: [0, 0], UpperCenter: [.5, 0], UpperRight: [1, 0], MiddleLeft: [0, .5],
  MiddleCenter: [.5, .5], MiddleRight: [1, .5], LowerLeft: [0, 1], LowerCenter: [.5, 1], LowerRight: [1, 1]
};
function visible(a, player) {
  if (a.active === false || String(a.active).toLowerCase() === 'false') return false;
  if (player && a.visibility && String(a.visibility).trim()) return String(a.visibility).split('|').map(x => x.trim().toLowerCase()).includes(player.toLowerCase());
  return true;
}
function layout(nodes, options = {}) {
  const defaults = resolveDefaults(nodes), player = options.player || '', autosize = options.textAutosize !== false;
  const output = [];
  const canvas = { x: 0, y: 0, width: 1920, height: 1080 };
  function preferred(node, axis, available) {
    const a = attributes(node, defaults), key = axis === 'x' ? 'Width' : 'Height';
    if (a[`preferred${key}`] != null) return num(a[`preferred${key}`], available, 0);
    const children = entries(node.children).filter(k => k && k.tag && visible(attributes(k, defaults), player) &&
      String(attributes(k, defaults).ignoreLayout).toLowerCase() !== 'true');
    if (node.tag === 'HorizontalLayout' || node.tag === 'VerticalLayout') {
      const horizontal = node.tag === 'HorizontalLayout', same = (axis === 'x') === horizontal;
      const [l, r, t, b] = tuple(a.padding, 4);
      const pad = axis === 'x' ? l + r : t + b;
      if (same) return pad + children.reduce((sum, child) => sum + preferred(child, axis, available), 0) +
        Math.max(0, children.length - 1) * num(a.spacing, available, 0);
      return pad + Math.max(0, ...children.map(child => preferred(child, axis, available)));
    }
    if (node.tag === 'Text') {
      if (axis === 'x') return Math.max(0, ...String(a.text ?? node.value ?? '').split('\n')
        .map(s => s.length * num(a.fontSize, available, 14) * .55));
      const fs = num(a.fontSize, available, 14), width = Math.max(1, num(a.preferredWidth, available, available));
      const chars = Math.max(1, Math.floor(width / (fs * .55)));
      return String(a.text ?? node.value ?? '').split('\n')
        .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)), 0) * fs * 1.2;
    }
    return 0;
  }
  function make(node, parent, parentBox, forcedBox) {
    if (!node || typeof node !== 'object') return null;
    const a = attributes(node, defaults), kids = entries(node.children).filter(k => k && k.tag);
    if (!visible(a, player) || node.tag === 'Defaults') return null;
    const w = forcedBox ? forcedBox.width : num(a.width, parentBox.width, parentBox.width);
    const h = forcedBox ? forcedBox.height : num(a.height, parentBox.height, parentBox.height);
    let x = forcedBox ? forcedBox.x : parentBox.x, y = forcedBox ? forcedBox.y : parentBox.y;
    if (!forcedBox) {
      const [ax, ay] = anchors[a.rectAlignment || (!parent ? 'UpperLeft' : '')] || [.5, .5], [ox, oy] = tuple(a.offsetXY, 2);
      const [px, py] = tuple(a.pivot, 2, .5);
      const edgeAligned = !parent || String(a.ignoreLayout).toLowerCase() === 'true';
      x = edgeAligned ? parentBox.x + ax * (parentBox.width - w) + ox : parentBox.x + ax * parentBox.width + ox - px * w;
      y = edgeAligned ? parentBox.y + ay * (parentBox.height - h) - oy : parentBox.y + ay * parentBox.height - oy - py * h;
    }
    let box = { x, y, width: w, height: h };
    if (/ScrollView/.test(node.tag) && options.expandScroll && kids[0]) {
      const ca = attributes(kids[0], defaults);
      if (node.tag.startsWith('Horizontal')) box.width = Math.max(box.width, num(ca.preferredWidth || ca.width, box.width, box.width));
      else box.height = Math.max(box.height, num(ca.preferredHeight || ca.height, box.height, box.height));
    }
    if (a.contentSizeFitter && (node.tag.endsWith('Layout') || node.tag === 'GridLayout')) {
      const [l, r, t, b] = tuple(a.padding, 4); const children = kids.map(k => attributes(k, defaults));
      const vertical = /vertical|both/i.test(a.contentSizeFitter), horizontal = /horizontal|both/i.test(a.contentSizeFitter);
      if (vertical) box.height = t + b + children.reduce((s, c) => s + num(c.preferredHeight || c.height, h, 0), 0) + Math.max(0, kids.length - 1) * num(a.spacing, h, 0);
      if (horizontal) box.width = l + r + children.reduce((s, c) => s + num(c.preferredWidth || c.width, w, 0), 0) + Math.max(0, kids.length - 1) * num(a.spacing, w, 0);
    }
    const result = { tag: node.tag, attributes: a, value: node.value, text: a.text != null ? a.text : node.value, box, children: [] };
    const pad = tuple(a.padding, 4), [pl, pr, pt, pb] = pad;
    const inner = { x: box.x + pl, y: box.y + pt, width: Math.max(0, box.width - pl - pr), height: Math.max(0, box.height - pt - pb) };
    if (node.tag === 'HorizontalLayout' || node.tag === 'VerticalLayout') {
      const horizontal = node.tag === 'HorizontalLayout', mainSize = horizontal ? inner.width : inner.height;
      const visibleKids = kids.filter(k => visible(attributes(k, defaults), player) && String(attributes(k, defaults).ignoreLayout).toLowerCase() !== 'true');
      const gap = num(a.spacing, mainSize, 0), spacing = gap * Math.max(0, visibleKids.length - 1);
      const main = visibleKids.map(k => {
        const c = attributes(k, defaults), axis = horizontal ? 'x' : 'y';
        const pref = preferred(k, axis, mainSize);
        return {
          min: num(c[horizontal ? 'minWidth' : 'minHeight'], mainSize, 0), pref,
          flex: num(c[horizontal ? 'flexibleWidth' : 'flexibleHeight'], mainSize, 0), attr: c, node: k
        };
      });
      const available = Math.max(0, mainSize - spacing), totalPref = main.reduce((s, c) => s + Math.max(c.min, c.pref), 0);
      const force = String(a[horizontal ? 'childForceExpandWidth' : 'childForceExpandHeight'] ?? 'true') !== 'false';
      const flexTotal = main.reduce((s, c) => s + c.flex, 0);
      const sizes = main.map(c => {
        if (totalPref > available) {
          const minTotal = main.reduce((s, item) => s + item.min, 0);
          const t = Math.max(0, Math.min(1, (available - minTotal) / Math.max(1e-9, totalPref - minTotal)));
          return c.min + (Math.max(c.min, c.pref) - c.min) * t;
        }
        return Math.max(c.min, c.pref);
      });
      const extra = Math.max(0, available - sizes.reduce((s, v) => s + v, 0));
      let cursor = horizontal ? inner.x : inner.y;
      main.forEach((c, i) => {
        let share = flexTotal ? extra * c.flex / flexTotal : 0;
        if (!flexTotal && (!totalPref || force)) share = extra / Math.max(1, main.length);
        const mainLen = sizes[i] + share;
        let crossH = horizontal ? inner.height : mainLen, crossW = horizontal ? mainLen : inner.width;
        const crossForce = String(a[horizontal ? 'childForceExpandHeight' : 'childForceExpandWidth'] ?? 'true') !== 'false';
        if (!crossForce) {
          const pref = preferred(c.node, horizontal ? 'y' : 'x', horizontal ? inner.height : inner.width);
          if (horizontal) crossH = pref; else crossW = pref;
          if (horizontal) crossH = Math.min(inner.height, crossH); else crossW = Math.min(inner.width, crossW);
        }
        const align = String(a.childAlignment || 'UpperLeft');
        const [cx, cy] = anchors[align] || [0, 0];
        const childBox = horizontal
          ? { x: cursor, y: inner.y + (inner.height - crossH) * cy, width: mainLen, height: crossH }
          : { x: inner.x + (inner.width - crossW) * cx, y: cursor, width: crossW, height: mainLen };
        const child = make(c.node, result, inner, childBox); if (child) result.children.push(child);
        cursor += mainLen + gap;
      });
      for (const k of kids) {
        const ca = attributes(k, defaults);
        if (String(ca.ignoreLayout).toLowerCase() === 'true') {
          const child = make(k, result, inner); if (child) result.children.push(child);
        }
      }
    } else if (node.tag === 'GridLayout') {
      const [cw, ch] = tuple(a.cellSize, 2, 100), [gx, gy] = tuple(a.spacing, 2), count = Math.max(1, Number(a.constraintCount) || 1);
      const flowKids = kids.filter(k => String(attributes(k, defaults).ignoreLayout).toLowerCase() !== 'true');
      const cols = /FixedRowCount/i.test(a.constraint) ? Math.max(1, Math.ceil(flowKids.length / count)) : count;
      const rows = Math.max(1, Math.ceil(flowKids.length / cols)), gridW = cols * cw + Math.max(0, cols - 1) * gx, gridH = rows * ch + Math.max(0, rows - 1) * gy;
      const [alignX, alignY] = anchors[a.childAlignment] || [0, 0];
      flowKids.forEach((k, i) => { const row = /Vertical/i.test(a.startAxis) ? i % rows : Math.floor(i / cols), col = /Vertical/i.test(a.startAxis) ? Math.floor(i / rows) : i % cols;
        const child = make(k, result, inner, { x: inner.x + (inner.width - gridW) * alignX + col * (cw + gx), y: inner.y + (inner.height - gridH) * alignY + row * (ch + gy), width: cw, height: ch }); if (child) result.children.push(child);
      });
      for (const k of kids.filter(c => String(attributes(c, defaults).ignoreLayout).toLowerCase() === 'true')) { const overlay = make(k, result, inner); if (overlay) result.children.push(overlay); }
    } else if (node.tag === 'TableLayout') {
      let cy = inner.y; const rows = kids;
      for (const row of rows) {
        const ra = attributes(row, defaults);
        const measured = String(ra.autoCalculateHeight).toLowerCase() === 'true'
          ? Math.max(0, ...entries(row.children).map(c => num(attributes(c, defaults).preferredHeight || attributes(c, defaults).height, inner.height, 0)))
          : 0;
        const rh = num(ra.preferredHeight, inner.height, measured || 32);
        const rowNode = make(row, result, inner, { x: inner.x, y: cy, width: inner.width, height: rh }); if (rowNode) result.children.push(rowNode); cy += rh + num(a.cellSpacing, inner.height, 0);
      }
    } else if (node.tag === 'Row') {
      const widths = String(parent && parent.attributes.columnWidths || '').split(/[ ,]+/).filter(Boolean); let cx = inner.x;
      kids.forEach((k, i) => { const cw = widths[i] ? num(widths[i], inner.width, 80) : inner.width / Math.max(1, kids.length); const child = make(k, result, inner, { x: cx, y: inner.y, width: cw, height: box.height }); if (child) result.children.push(child); cx += cw; });
    } else if (node.tag === 'Cell') {
      for (const k of kids) { const c = make(k, result, inner); if (c) result.children.push(c); }
    } else {
      const scroll = /ScrollView/.test(node.tag), content = scroll ? kids.slice(0, 1) : kids;
      for (const k of content) {
        const childA = attributes(k, defaults);
        const horizontalScroll = node.tag.startsWith('Horizontal');
        const child = make(k, result, inner, scroll ? {
          x: inner.x, y: inner.y,
          width: num(childA.preferredWidth || childA.width, inner.width, inner.width),
          height: num(childA.preferredHeight || childA.height, inner.height, inner.height)
        } : undefined);
        if (child) result.children.push(child);
      }
    }
    return result;
  }
  for (const node of entries(nodes)) { const n = make(node, null, canvas); if (n) output.push(n); }
  return output;
}

module.exports = { color, entries, resolveDefaults, attributes, layout, tuple, num, anchors };
