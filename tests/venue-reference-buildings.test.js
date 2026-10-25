import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readJSON, realModel} from './helpers.js';
import {buildVenueProfile} from '../js/profile-model.js';
import {createSpatialStore, selectSpatialBuildings, buildingFact, referenceBuildingFact, referenceStoreKeys} from '../js/spatial-store.js';

const hashGeometry = geometry => createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
const reference = readJSON('data/venue-reference-buildings.json');
const source = readJSON('tests/fixtures/venue-reference-source-hashes.json');
const model = realModel();

test('venue references preserve the original source geometry, height roles and exact venue IDs without Luxury outlet identities', () => {
  assert.equal(reference.meta.sourceURL, source.sourceURL);
  assert.equal(reference.meta.sourceSHA256, source.sourceSHA256);
  assert.equal(reference.meta.geometryAsOf, source.geometryAsOf);
  const originals = new Map(source.features.map(f => ['ref:' + f.id, f]));
  const features = new Map(reference.buildings.features.map(f => [f.id, f]));
  assert.equal(features.size, reference.buildings.features.length, 'part and parent identities remain distinct');
  assert.equal(features.size, originals.size + 2, 'only the separately qualified Forum and PARC references are appended');
  assert.equal(features.size, reference.meta.features);
  const propertyKeys = new Set(['buildingId', 'originalHostId', 'height', 'base', 'sourceHeightM', 'renderAs', 'heightRole', 'heightNote', 'sourceURL', 'geometrySource', 'geometryRole', 'license', 'sourceCheckedOn', 'secondarySourceURL']);
  for (const [id, original] of originals) {
    const f = features.get(id); assert.ok(f, `${id} is retained`);
    assert.equal(f.type, 'Feature');
    assert.ok(['Polygon', 'MultiPolygon'].includes(f.geometry.type));
    assert.equal(hashGeometry(f.geometry), original.geometrySHA256, `${id}: every original coordinate and hole is preserved`);
    assert.equal(f.properties.buildingId, id);
    assert.equal(f.properties.originalHostId, original.hostId);
    assert.equal(f.properties.sourceURL, original.sourceURL);
    assert.equal(f.properties.heightRole, original.heightRole);
    assert.equal(f.properties.sourceHeightM, original.sourceHeightM);
    assert.equal(f.properties.height, original.displayHeightM);
    assert.equal(f.properties.base, original.displayBaseM);
    assert.ok(Number.isFinite(f.properties.height) && Number.isFinite(f.properties.base));
    assert.ok(f.properties.base >= 0 && f.properties.height >= f.properties.base);
    assert.equal(f.properties.renderAs, original.renderAs);
    assert.equal(f.properties.geometryRole, id.includes('/part/') ? 'venue_reference_part' : 'venue_reference_footprint');
    for (const key of Object.keys(f.properties)) assert.ok(propertyKeys.has(key), `${id}: unrelated property ${key}`);
  }
  const used = new Set();
  const scopedVenueIds = new Set(['GV-a6836f91efc61a13', 'SC-000977']);
  assert.deepEqual(Object.keys(reference.venues).filter(id => !scopedVenueIds.has(id)).sort(), Object.keys(source.venues).sort(), 'the original reviewed Grocery crosswalk remains unchanged');
  for (const id of Object.keys(source.venues)) {
    const venue = reference.venues[id];
    const index = model.venues.findIndex(v => v.id === id);
    assert.ok(index >= 0, `${id} is an exact Grocery venue ID`);
    assert.equal(venue.sourceVenueId, source.venues[id].sourceVenueId, `${id}: reviewed venue identity must not be exchanged with another complex`);
    assert.deepEqual(model.rows.filter(r => r.v === index).map(r => r.key).sort(), source.venues[id].memberKeys, `${id}: reviewed store membership is preserved`);
    assert.equal(venue.status, 'venue_reference');
    assert.equal(venue.method, 'exact_venue_name_and_source_id');
    assert.ok(venue.buildingIds.length > 0);
    assert.equal(new Set(venue.buildingIds).size, venue.buildingIds.length);
    for (const buildingId of venue.buildingIds) {
      assert.ok(features.has(buildingId)); used.add(buildingId);
      assert.ok(originals.get(buildingId).sourceVenueIds.includes(venue.sourceVenueId), `${id}: geometry belongs to the exact source venue`);
    }
  }
  assert.equal(Object.keys(reference.venues).length, reference.meta.venueCount);
  assert.deepEqual([...used].sort(), [...originals.keys()].sort(), 'no original geometry is orphaned');
  assert.equal(hashGeometry(reference.buildings.features.filter(f => originals.has(f.id))), '8e60d41d7b8c4b8cb008e8b70f81d36617e23364bb4a92ed58f25417eb95c7b5', 'all 76 original complete feature objects and ordering stay unchanged');
  assert.equal(hashGeometry(Object.fromEntries(Object.entries(reference.venues).filter(([id]) => Object.hasOwn(source.venues, id)))), '1d1192b8e58bed8c67455d73a89a229dcdffae1cb4a2a3224e987ab20168f27b', 'all 29 original complete crosswalk objects and ordering stay unchanged');
  assert.doesNotMatch(JSON.stringify(reference), /POS-[0-9a-f]+|"(?:outlet_ids|outletIds|pos_ids)"/i);
});

test('actual lazy snapshots select the named venue and its stores without changing independent spatial status', async () => {
  const calls = [];
  const cache = createSpatialStore({fetchImpl: async url => {
    calls.push(url); return {ok: true, json: async () => readJSON(url)};
  }});
  const [refs, same] = await Promise.all([cache.ensureReferences(), cache.ensureReferences()]);
  assert.equal(refs, same); assert.equal(refs.byId.size, reference.buildings.features.length);
  const members = model.rows.filter(r => r.v >= 0 && referenceStoreKeys(reference.venues[model.venues[r.v].id], [r.key]).length);
  assert.equal(members.length, 44, 'the baseline model excludes the supplemental scoped branch');
  assert.equal(members.length + 2, reference.meta.linkedStoreRows, 'only the two explicitly scoped supplemental rows extend the reference count');
  const codes = [...new Set(members.map(r => model.provinces[r.p].code))];
  await Promise.all(codes.map(code => cache.ensure(code)));
  assert.equal(calls.filter(url => url === 'data/venue-reference-buildings.json').length, 1);
  const before = JSON.stringify(members);
  for (const row of members) {
    const selected = selectSpatialBuildings(model, [row], cache.peek, refs);
    const venue = reference.venues[model.venues[row.v].id];
    const point = cache.peek(model.provinces[row.p].code).stores[row.key];
    assert.deepEqual(selected.collection.features.map(f => f.id).sort(), [...venue.buildingIds].sort());
    assert.equal(selected.links[0].status, point.status, `${row.key}: a named venue does not upgrade containment`);
    assert.equal(selected.links[0].buildingId, point.status === 'point_inside' ? point.buildingId : null);
    for (const f of selected.collection.features) assert.deepEqual(f.properties.storeKeys, [row.key]);
  }
  for (const id of Object.keys(source.venues)) {
    const index = model.venues.findIndex(v => v.id === id);
    const profile = buildVenueProfile(model, model.rows, index);
    const selected = selectSpatialBuildings(model, profile.rows, cache.peek, refs);
    const keys = profile.rows.map(r => r.key).sort();
    assert.equal(selected.total, profile.count);
    assert.deepEqual(selected.collection.features.map(f => f.id).sort(), [...reference.venues[id].buildingIds].sort());
    for (const f of selected.collection.features) assert.deepEqual([...f.properties.storeKeys].sort(), keys, 'venue focus contains only its own filtered members');
    const filtered = selectSpatialBuildings(model, profile.rows.slice(0, 1), cache.peek, refs);
    for (const f of filtered.collection.features) assert.deepEqual(f.properties.storeKeys, [profile.rows[0].key], 'store focus and filtered venue focus retain their own rows');
  }
  assert.equal(JSON.stringify(members), before, 'source coordinates, row identity and venue association stay unchanged');
  cache.dispose();
});

test('unresolved names receive no reference geometry and limited coverage stays unavailable', () => {
  const refs = {...reference, byId: new Map(reference.buildings.features.map(f => [f.id, f]))};
  for (const key of ['973f79eb', 'e2ce86d4', '885d1643', '093b32d8', '9cf0e506', '06e4280e', '7b5e5cd7']) {
    const row = model.rowByKey.get(key); assert.ok(row, `${key} remains in the source rows`);
    const selected = selectSpatialBuildings(model, [row], () => null, refs);
    assert.equal(selected.referenceCount, 0, `${row.name}: similar or unresolved names do not imply a venue reference`);
    assert.equal(selected.collection.features.length, 0);
  }
  const row = model.rows.find(r => r.v >= 0 && reference.venues[model.venues[r.v].id]);
  const selected = selectSpatialBuildings(model, [row], () => ({stores: {[row.key]: {status: 'unavailable', buildingId: null}}, byId: new Map()}), refs);
  assert.equal(selected.unavailable, 1); assert.equal(selected.noBuilding, 0); assert.equal(selected.matched, 0);
  assert.equal(selected.links[0].status, 'unavailable');
  assert.equal(buildingFact(selected).state, 'unavailable');
  assert.equal(referenceBuildingFact(selected).state, 'reference', 'a named reference can coexist with unavailable spatial coverage');
});
