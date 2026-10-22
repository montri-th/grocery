import test from 'node:test';
import assert from 'node:assert/strict';
import {realModel} from './helpers.js';
import {typeMix, brandMix, venueRanking, buildUnitProfile, buildVenueProfile, buildStoreDetail, describeStatus, describeGeometry} from '../js/profile-model.js';

const m = realModel();

test('mixes keep the fixed series order and add up to the rows', () => {
  const mix = typeMix(m, m.rows);
  assert.deepEqual(mix.map(t => t.id), ['C_STORE', 'SUPERMARKET', 'HYPERMARKET', 'WHOLESALE', 'PHARMACY']);
  assert.equal(mix.reduce((s, t) => s + t.count, 0), 27607);
  assert.deepEqual(Object.fromEntries(mix.map(t => [t.id, t.count])), {C_STORE: 26336, SUPERMARKET: 550, HYPERMARKET: 377, WHOLESALE: 194, PHARMACY: 150});
  const brands = brandMix(m, m.rows);
  assert.equal(brands[0].brand.id, 'SEVEN_ELEVEN');
  assert.equal(brands[0].count, 16487);
  assert.equal(brands.reduce((s, b) => s + b.count, 0), 27607);
  const venues = venueRanking(m, m.rows);
  assert.equal(venues.reduce((s, v) => s + v.count, 0), m.rows.filter(r => r.v >= 0).length);
});

test('a unit profile counts its source members and links to production', () => {
  const unit = m.units.find(u => u.prefix === 'ทม.' && u.name === 'แสนสุข');
  const p = buildUnitProfile(m, m.rows, unit.index);
  assert.equal(p.count, unit.api);
  assert.equal(p.kind, 'เทศบาลเมือง');
  assert.equal(p.district.code, '2001');
  assert.match(p.production, /\/CBI\/M\//);
  assert.ok(p.perCapita > 0);
  const loc = m.units.find(u => u.kind === 'L' && u.api > 10);
  assert.equal(buildUnitProfile(m, m.rows, loc.index).count, loc.api);
});

test('venue profiles group the stores whose branch name names the place', () => {
  const v = m.venues.find(x => x.name === 'centralwOrld');
  assert.ok(v, 'venue candidate present');
  const p = buildVenueProfile(m, m.rows, v.index);
  assert.ok(p.count >= 1 && p.rows.every(r => r.v === v.index));
  assert.equal(buildVenueProfile(m, [], v.index), null);
});

test('store detail is factual: listed status, tile geometry, nearby stores of the same brand', () => {
  const r = m.rows.find(x => x.brandId === 'SEVEN_ELEVEN' && x.u.length === 1);
  const d = buildStoreDetail(m, r, m.rows);
  assert.equal(d.brand.id, 'SEVEN_ELEVEN');
  assert.equal(d.type.id, 'C_STORE');
  assert.equal(d.status.tone, 'listed');
  assert.equal(d.geometry.level, 'tile');
  assert.ok(d.nearby.every(n => n.b === r.b && n.key !== r.key));
  assert.equal(d.nearbyScope, 'unit');
  assert.equal(describeStatus({flags: 1}).label, 'ชื่อสาขามีคำว่าออนไลน์');
  assert.equal(describeGeometry(m, {lat: null, lon: null}).level, 'none');
  assert.equal(m.rows.filter(x => x.flags & 1).length, 4, 'online-named rows flagged, never removed');
});
