import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {configureVenueLogos, getVenueLogo, venueLogoMarkup, ROLE_LABELS} from '../js/venue-logos.js';
import {readJSON, realModel} from './helpers.js';
import {buildModel} from '../js/model.js';

const registry = readJSON('data/venue-logos.json');
const m = realModel();

test('registered venue logo bytes retain the original 128 assets and the three qualified additions', () => {
  const r = configureVenueLogos(registry);
  const baseline = readJSON('tests/fixtures/venue-logos-baseline-74d214a.json');
  assert.equal(baseline.assets.length, 128);
  assert.equal(r.assets, baseline.assets.length + 3);
  assert.equal(r.complete, true);
  const byKey = new Map(registry.assets.map(asset => [asset.key, asset]));
  for (const original of baseline.assets) assert.deepEqual(byKey.get(original.key), original, 'existing venue identity/provenance stays unchanged');
  const previous = new Set(baseline.assets.map(asset => asset.key));
  assert.deepEqual(registry.assets.filter(asset => !previous.has(asset.key)).map(asset => asset.key).sort(),
    ['VL-48cc1ab9b18e83f3', 'VL-aec3daf50bb5aa94', 'VL-3acd00100f2a26e8'].sort());
  for (const a of registry.assets) {
    const bytes = fs.readFileSync(new URL(`../${a.file}`, import.meta.url));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), a.sha256, a.file);
    assert.equal(bytes.length, a.bytes);
    assert.ok(!/drive\.google|googleusercontent/.test(`${a.sourcePage} ${a.assetURL}`));
  }
  const updated = buildModel(readJSON('data/grocery.json'), readJSON('data/areas.json'), readJSON('data/retail-refresh.json'));
  for (const id of ['SC-001421', 'SC-000977', 'SC-006578']) assert.ok(getVenueLogo(updated.venues.find(v => v.id === id)), `${id}: added venue mark resolves`);
  assert.equal(getVenueLogo(updated.venues.find(v => v.id === 'SC-001266')), null, 'Mahatun unresolved logo stays missing');
});

test('every venue logo link in the data resolves; shared banners keep their role label', () => {
  configureVenueLogos(registry);
  const linked = m.venues.filter(v => v.logo);
  assert.ok(linked.length >= 2500);
  for (const v of linked) assert.ok(getVenueLogo(v), `${v.id} ${v.logo}`);
  const ptt = linked.find(v => v.role === 'shared_operator_banner');
  assert.equal(getVenueLogo(ptt).roleLabel, ROLE_LABELS.shared_operator_banner);
  assert.equal(getVenueLogo({name: 'x', logo: null}), null);
  assert.equal(getVenueLogo({name: 'x', logo: 'VL-0000000000000000'}), null);
  const html = venueLogoMarkup(linked[0], {size: 'md'});
  assert.match(html, /^<span class="venue-logo venue-logo-md"/);
  assert.match(html, /src="assets\/venue-logos\//);
});

test('a malformed registry fails closed: no logo, never a broken image', () => {
  const r = configureVenueLogos({assets: [{key: 'bad', file: 'https://example.com/x.png'}]});
  assert.equal(r.complete, false);
  assert.equal(getVenueLogo(m.venues.find(v => v.logo)), null);
  configureVenueLogos(registry);
});
