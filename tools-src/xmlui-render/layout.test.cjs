'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { layout, color, resolveDefaults } = require('./layout.cjs');

const node = (tag, attributes = {}, children = []) => ({ tag, attributes, children });
const boxChildren = tree => tree[0].children.map(n => n.box);

test('VerticalLayout places preferred-height children with spacing and padding', () => {
  const tree = layout([node('VerticalLayout', { width: 200, height: 200, padding: '10 10 10 10', spacing: 5, childForceExpandHeight: 'false' }, [
    node('Panel', { preferredHeight: 20 }), node('Panel', { preferredHeight: 30 }), node('Panel', { preferredHeight: 40 })
  ])]);
  assert.deepEqual(boxChildren(tree).map(b => [b.x, b.y, b.height]), [[10, 10, 20], [10, 35, 30], [10, 70, 40]]);
});

test('childForceExpandHeight stretches the main axis when enabled', () => {
  const make = force => layout([node('VerticalLayout', { width: 100, height: 100, childForceExpandHeight: String(force) }, [
    node('Panel', { preferredHeight: 20 }), node('Panel', { preferredHeight: 20 })
  ])]);
  assert.deepEqual(boxChildren(make(false)).map(b => b.height), [20, 20]);
  assert.deepEqual(boxChildren(make(true)).map(b => b.height), [50, 50]);
});

test('flexibleWidth distributes remaining HorizontalLayout width', () => {
  const tree = layout([node('HorizontalLayout', { width: 100, height: 40, childForceExpandWidth: 'false' }, [
    node('Panel', { preferredWidth: 20, flexibleWidth: 1 }), node('Panel', { preferredWidth: 20, flexibleWidth: 1 })
  ])]);
  assert.deepEqual(boxChildren(tree).map(b => [b.x, b.width]), [[0, 50], [50, 50]]);
});

test('contentSizeFitter computes vertical preferred extent with padding and gaps', () => {
  const tree = layout([node('VerticalLayout', { width: 200, height: 100, padding: '2 3 4 5', spacing: 6, contentSizeFitter: 'vertical' }, [
    node('Panel', { preferredHeight: 20 }), node('Panel', { preferredHeight: 30 })
  ])]);
  assert.equal(tree[0].box.height, 65);
});

test('rectAlignment and y-up offsetXY cover all nine anchors', () => {
  const names = ['UpperLeft', 'UpperCenter', 'UpperRight', 'MiddleLeft', 'MiddleCenter', 'MiddleRight', 'LowerLeft', 'LowerCenter', 'LowerRight'];
  const expected = [[-5, -12], [95, -12], [195, -12], [-5, 38], [95, 38], [195, 38], [-5, 88], [95, 88], [195, 88]];
  names.forEach((anchor, i) => {
    const tree = layout([node('Panel', { width: 200, height: 100 }, [node('Image', { width: 20, height: 10, rectAlignment: anchor, offsetXY: '5 7' })])]);
    assert.deepEqual([tree[0].children[0].box.x, tree[0].children[0].box.y], expected[i], anchor);
  });
});

test('Defaults resolve tag values and class precedence before element attributes', () => {
  const defaultsNode = node('Defaults', {}, [node('Text', { color: 'Red', fontSize: 12 }), node('Class', { class: 'muted', color: 'Blue', fontSize: 10 })]);
  const d = resolveDefaults([defaultsNode]);
  assert.equal(d.tags.Text.fontSize, 12);
  assert.equal(d.classes.muted.color, 'Blue');
  const tree = layout([defaultsNode, node('Text', { class: 'muted', color: 'Green', fontSize: 16 })]);
  assert.equal(tree[0].attributes.color, 'Green');
  assert.equal(tree[0].attributes.fontSize, 16);
});

test('color parser handles hex, float rgba, named player colors, and clear', () => {
  assert.equal(color('#abc'), '#abc');
  assert.equal(color('rgba(1, 0.5, 0, 0.25)'), 'rgba(255,128,0,0.25)');
  assert.equal(color('Teal'), '#00ffff');
  assert.equal(color('clear'), '#00000000');
});

test('GridLayout FixedColumnCount places cells in row-major order', () => {
  const tree = layout([node('GridLayout', { width: 220, height: 140, cellSize: '100 50', spacing: '10 5', constraint: 'FixedColumnCount', constraintCount: 2 }, [
    node('Panel'), node('Panel'), node('Panel'), node('Panel')
  ])]);
  assert.deepEqual(boxChildren(tree).map(b => [b.x, b.y]), [[0, 0], [110, 0], [0, 55], [110, 55]]);
});
