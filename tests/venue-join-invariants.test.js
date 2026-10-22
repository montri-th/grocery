import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const data = read('data/grocery.json');
const joins = read('data/venue-joins.json');
const references = read('data/venue-reference-buildings.json');
const baseline = read('tests/fixtures/venue-join-baseline.json');
const sourceFeatures = read('tests/fixtures/venue-reference-source-hashes.json');
const sha = input => createHash('sha256').update(Buffer.isBuffer(input) ? input : JSON.stringify(input)).digest('hex');
const countAt = i => Object.fromEntries([...data.rows.reduce((m, r) => m.set(String(r[i]), (m.get(String(r[i])) || 0) + 1), new Map())].sort(([a], [b]) => a.localeCompare(b, 'en')));
const rowsByKey = new Map(data.rows.map(r => [r[0], r]));

test('venue updates preserve every original store coordinate, row, flag and administrative membership', () => {
  assert.equal(data.rows.length, baseline.rowCount);
  assert.equal(rowsByKey.size, baseline.rowCount, 'no key is duplicated');
  assert.equal(sha(data.rows.map(r => [r[0], r[5], r[6]])), baseline.coordinateSHA256, 'every coordinate remains exact and in source order');
  assert.equal(sha(data.rows.map(r => [r.slice(0, 10), r.slice(11)])), baseline.immutableRowFieldsSHA256, 'only the venue index may change');
  assert.equal(sha(data.rows.map(r => [r[0], r[7], r[8]])), baseline.administrativeMembershipSHA256);
  assert.equal(sha(readFileSync(new URL('../data/areas.json', import.meta.url))), baseline.administrativeRegistrySHA256);
  assert.deepEqual(countAt(1), baseline.brandCounts);
  assert.deepEqual(countAt(2), baseline.typeCounts);
  assert.deepEqual(countAt(3), baseline.formatCounts);
  assert.equal(sha(data.venues.slice(0, baseline.originalVenueCount).map(v => v.slice(0, 6))), baseline.originalVenueIdentitySHA256, 'existing venue positions and roles remain stable');
});

test('every applied venue index has the reviewed receipt, and all inactive links stay inactive', () => {
  const receipts = new Map(joins.rows.map(r => [r.key, r]));
  assert.equal(receipts.size, joins.rows.length);
  assert.equal(joins.summary.sourceRows, baseline.rowCount);
  assert.equal(data.rows.filter(r => r[10] >= 0).length, joins.summary.linkedRows);
  assert.equal(joins.rows.filter(r => !r.priorVenueId && r.newVenueId).length, joins.summary.newLinkedRows);
  assert.equal(joins.rows.filter(r => r.priorVenueId && !r.newVenueId).length, joins.summary.removedPriorLinks);
  for (const row of data.rows) {
    const receipt = receipts.get(row[0]);
    const actual = row[10] >= 0 ? data.venues[row[10]][0] : null;
    assert.equal(actual, receipt?.newVenueId || null, row[0]);
  }
  const venues = new Map(data.venues.map(v => [v[0], v]));
  for (const venue of joins.newVenues) {
    assert.equal(venue.id, `SC-${venue.sourceVenueId}`, 'research ID and production UUID retain a reversible crosswalk');
    assert.equal(venues.get(venue.id)?.[1], venue.name);
  }
  assert.equal(joins.summary.coordinateChanges, 0);
  assert.equal(joins.summary.confirmedInsideLinks, 0);
  assert.equal(data.meta.venueJoinRole, 'name_reference_not_confirmed_tenancy');
});

test('venue reference buildings require an accepted source crosswalk and retain independent source geometry', () => {
  const accepted = new Set(joins.rows.filter(r => r.status === 'name_and_source_point').map(r => `${r.newVenueId}|${r.sourceVenueId}`));
  const sourceById = new Map(sourceFeatures.features.map(f => [`ref:${f.id}`, f]));
  const buildingById = new Map(references.buildings.features.map(f => [f.id, f]));
  for (const row of joins.rows.filter(r => r.status !== 'name_and_source_point')) assert.equal(row.sourceVenueId, null, row.key);
  for (const [venueId, reference] of Object.entries(references.venues)) {
    assert.ok(accepted.has(`${venueId}|${reference.sourceVenueId}`), `${venueId} uses an accepted source identity`);
    assert.equal(reference.status, 'venue_reference');
    for (const id of reference.buildingIds) {
      const feature = buildingById.get(id), source = sourceById.get(id);
      assert.ok(feature && source, id);
      assert.ok(source.sourceVenueIds.includes(reference.sourceVenueId), id);
      assert.equal(sha(feature.geometry), source.geometrySHA256, `${id}: original coordinates and holes`);
    }
  }
  assert.equal(references.meta.features, buildingById.size);
  assert.equal(references.meta.venueCount, Object.keys(references.venues).length);
});
