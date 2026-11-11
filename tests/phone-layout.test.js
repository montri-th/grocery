// The key, the finding and the map's attribution on a phone (owner 2026-11-12 00:36, the look on a phone): no card
// stands over the attribution while it is open, and the finding keeps clear of the key by the key's live height.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('styles.css', root), 'utf8');
const app = readFileSync(new URL('js/app.js', root), 'utf8');

test('phone: the key and the finding stand above the attribution where they would cover it, by live heights', () => {
  assert.match(app, /function trackAttribution\(map\)/);
  assert.match(app, /state\.attribObserver = trackAttribution\(state\.map\);/);
  assert.match(app, /setProperty\('--attrib-height'/);
  assert.match(app, /setProperty\('--legend-height'/);
  const phone = css.slice(css.indexOf('@media (max-width: 760px) and (orientation: portrait)'));
  assert.match(app, /classList\.toggle\('is-key-lifted', lifted\)/);
  assert.match(app, /classList\.toggle\('is-crowded', /);
  assert.match(app, /new ResizeObserver\(schedule\)/, 'measured once a frame, not inside the observer callback');
  assert.match(phone, /\.map-panel\.is-key-lifted \.map-legend \{ bottom: calc\(var\(--bottom-panel-height\) \+ var\(--attrib-height, 40px\) \+ 14px\); \}/);
  assert.match(phone, /\.map-panel\.is-key-lifted \.map-aha \{ bottom: calc\(var\(--bottom-panel-height\) \+ var\(--attrib-height, 40px\) \+ var\(--legend-height, \d+px\) \+ 22px\); \}/);
  assert.match(phone, /\.map-panel\.is-crowded \.map-aha \{ display: none; \}/);
  assert.match(phone, /\n  \.map-aha \{ bottom: calc\(var\(--bottom-panel-height\) \+ var\(--legend-height, \d+px\) \+ 16px\); \}/);
});

test('phone: no later stylesheet gives the finding a fixed offset again', () => {
  for (const name of ['grocery.css', 'navigation.css']) {
    let text = '';
    try { text = readFileSync(new URL(name, root), 'utf8'); } catch { continue; }
    assert.doesNotMatch(text, /\.map-aha \{ bottom:/, `${name}: the finding's place comes from styles.css`);
  }
});
