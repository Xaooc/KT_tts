// Builds tmp/hub-views-test.lua: font metrics + ui/kit.lua + ui/hub-views.lua + sample view-models.
// Run it through MoonSharp with -SnapshotGlobal PreviewHubScenes to get XmlUI tables for the renderer.
const fs = require('fs');
const lit = v => v == null ? 'nil' : typeof v === 'string' ? JSON.stringify(v) : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? String(v) : '{' + Object.entries(v).map(([k, x]) => '[' + JSON.stringify(k) + ']=' + lit(x)).join(',') + '}';
const metrics = JSON.parse(fs.readFileSync('ui-font-metrics.json', 'utf8'));
const src = [
  'ruFontMetrics=' + lit(metrics),
  'self={getGUID=function() return "efa3fe" end}',
  fs.readFileSync('ui/kit.lua', 'utf8'),
  fs.readFileSync('ui/rich.lua', 'utf8'),
  fs.readFileSync('ui/hub-views.lua', 'utf8'),
  fs.readFileSync('ui/datasheet-view.lua', 'utf8'),
  fs.readFileSync('ui/fixtures/hub-sample.lua', 'utf8'),
  'PreviewHubScenes=HubSample.all()',
  'PreviewHubScenes.datasheet={HubSample.datasheet()}',
  'PreviewHubScenes.rich={HubSample.rich()}',
  'local n=0 for _ in pairs(PreviewHubScenes) do n=n+1 end',
  'return tostring(n).." hub scenes"',
].join('\n');
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/hub-views-test.lua', src);
console.log('tmp/hub-views-test.lua', src.length);
