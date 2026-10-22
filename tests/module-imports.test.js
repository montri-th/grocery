import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * A module imported under two specifiers is loaded twice, and right after a deploy
 * the untagged copy can come from the browser cache (GitHub Pages: max-age 600 s)
 * while the tagged copy is fresh — a missing export then stops the whole app.
 * Every module therefore has one specifier across js/*.js. Known exception:
 * model.js (tagged in app.js only; backlog N21 replaces tags with an import map).
 */
const KNOWN = new Set(['./model.js']);

test('every module is imported under one specifier (one cache tag) across js/*.js', () => {
  const dir = new URL('../js/', import.meta.url);
  const specs = new Map();
  for (const f of fs.readdirSync(dir).filter(name => name.endsWith('.js'))) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^;]*?from\s+'(\.\/[^']+)'/gm)) {
      const base = m[1].replace(/\?.*$/, '');
      if (!specs.has(base)) specs.set(base, new Set());
      specs.get(base).add(m[1]);
    }
  }
  const multi = [...specs].filter(([base, set]) => set.size > 1 && !KNOWN.has(base)).map(([base, set]) => `${base}: ${[...set].join(' | ')}`);
  assert.deepEqual(multi, []);
  // Modules changed after the first release carry a cache tag (?v=…) wherever they are imported.
  for (const base of ['./scales.js', './ramp-legend.js', './charts.js', './panel.js', './venue-level.js', './venue-xray.js', './spatial-layer.js', './massing.js']) {
    assert.ok([...specs.get(base)].every(spec => /\?v=\d{8}-[a-z0-9]+$/.test(spec)), `${base} is imported with a cache tag`);
  }
});
