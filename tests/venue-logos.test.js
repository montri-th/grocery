import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {configureVenueLogos, getVenueLogo, venueLogoMarkup, ROLE_LABELS} from '../js/venue-logos.js';
import {readJSON, realModel} from './helpers.js';

const registry = readJSON('data/venue-logos.json');
const m = realModel();

test('128 venue logo files are present with the registered bytes', () => {
  const r = configureVenueLogos(registry);
  assert.equal(r.assets, 128);
  assert.equal(r.complete, true);
  for (const a of registry.assets) {
    const bytes = fs.readFileSync(new URL(`../${a.file}`, import.meta.url));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), a.sha256, a.file);
    assert.equal(bytes.length, a.bytes);
    assert.ok(!/drive\.google|googleusercontent/.test(`${a.sourcePage} ${a.assetURL}`));
  }
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
