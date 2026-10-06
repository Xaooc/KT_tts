'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { layout, color, resolveDefaults } = require('./layout.cjs');
const { htmlFor } = require('./render.cjs');

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

test('root layout alignment applies y-up offsets from the canvas top-left', () => {
  const tree = layout([node('HorizontalLayout', { rectAlignment: 'UpperLeft', offsetXY: '12 -52', width: 453, height: 760 })]);
  assert.deepEqual([tree[0].box.x, tree[0].box.y], [12, 52]);
});

test('layout group color is emitted as its background', () => {
  const tree = layout([node('VerticalLayout', { width: 80, height: 40, color: '#222' })]);
  assert.match(htmlFor(tree, 'color'), /background:#222;/);
});

test('HorizontalLayout honors preferred widths and gives the remainder to flexible children', () => {
  const tree = layout([node('HorizontalLayout', { width: 300, height: 40, childForceExpandWidth: 'false' }, [
    node('Text', { preferredWidth: 76 }), node('Text', { preferredWidth: 34 }),
    node('Text', { preferredWidth: 34 }), node('Panel', { flexibleWidth: 1 })
  ])]);
  assert.deepEqual(boxChildren(tree).map(b => [b.x, b.width]), [[0, 76], [76, 34], [110, 34], [144, 156]]);
});

test('over-constrained HorizontalLayout shrinks proportionally between min and preferred', () => {
  const tree = layout([node('HorizontalLayout', { width: 100, height: 30, childForceExpandWidth: 'false' }, [
    node('Panel', { preferredWidth: 80, minWidth: 20 }), node('Panel', { preferredWidth: 40, minWidth: 20 })
  ])]);
  assert.deepEqual(boxChildren(tree).map(b => b.width), [65, 35]);
});

test('cross-axis preferred height is centered for MiddleLeft alignment', () => {
  const tree = layout([node('HorizontalLayout', {
    width: 100, height: 100, childForceExpandHeight: 'false', childAlignment: 'MiddleLeft'
  }, [
    node('Panel', { preferredWidth: 30, preferredHeight: 20 })
  ])]);
  assert.deepEqual([tree[0].children[0].box.height, tree[0].children[0].box.y], [20, 40]);
});

test('nested preferred-height layout positions its own children inside its box', () => {
  const tree = layout([node('VerticalLayout', { width: 100, height: 300, childForceExpandHeight: 'false' }, [
    node('VerticalLayout', { preferredHeight: 200, childForceExpandHeight: 'false' }, [node('Panel', { preferredHeight: 30 })])
  ])]);
  assert.deepEqual([tree[0].children[0].box.height, tree[0].children[0].children[0].box.y], [200, 0]);
});

test('ignoreLayout positions against the parent rect using rectAlignment and y-up offset', () => {
  const tree = layout([node('VerticalLayout', { width: 388, height: 760 }, [
    node('Panel', { ignoreLayout: 'true', rectAlignment: 'LowerLeft', offsetXY: '12 74', width: 100, height: 20 })
  ])]);
  assert.deepEqual([tree[0].children[0].box.x, tree[0].children[0].box.y], [12, 666]);
});

test('scroll content uses explicit dimensions at the viewport top-left and clips overflow', () => {
  const tree = layout([node('VerticalScrollView', { width: 120, height: 80 }, [
    node('VerticalLayout', { width: 100, height: 240 })
  ])]);
  assert.deepEqual([tree[0].children[0].box.x, tree[0].children[0].box.y,
    tree[0].children[0].box.width, tree[0].children[0].box.height], [0, 0, 100, 240]);
  assert.match(htmlFor(tree, 'scroll'), /overflow-y:auto;overflow-x:hidden;/);
});

test('Button fills a Panel layer and retains its fill and outline', () => {
  const tree = layout([node('Panel', { width: 200, height: 80 }, [
    node('Button', { text: '', colors: '#123456|#eeeeee', outline: '#ff0000', outlineSize: '2 2' }),
    node('HorizontalLayout', {}, [node('Text', { text: 'Action' })])
  ])]);
  const [button, content] = tree[0].children;
  assert.deepEqual(button.box, tree[0].box);
  assert.deepEqual(content.box, tree[0].box);
  const html = htmlFor(tree, 'button-layer');
  assert.match(html, /background:#123456;color:/);
  assert.match(html, /border:2px solid #ff0000;/);
});

test('Text fills a Panel and defaults to vertically and horizontally centered alignment', () => {
  const tree = layout([node('Panel', { width: 120, height: 40 }, [node('Text', { text: 'Label' })])]);
  const text = tree[0].children[0];
  assert.deepEqual(text.box, tree[0].box);
  const html = htmlFor(tree, 'panel-text');
  assert.match(html, /align-items:center;justify-content:center;/);
  assert.match(html, /text-align:center;/);
});

test('Text render preserves newlines with rich tags when wrapping', () => {
  const tree = layout([node('Text', { text: '<b>Эффект</b>\nПримените…', horizontalOverflow: 'Wrap' })]);
  const html = htmlFor(tree, 'wrapped-text');
  assert.match(html, /white-space:pre-wrap;/);
  assert.match(html, /<b>Эффект<\/b>\nПримените…/);
});
