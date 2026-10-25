import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readJSON, realModel} from './helpers.js';
import {buildModel, filterRows} from '../js/model.js';
import {selectSpatialBuildings, referenceStoreKeys, buildingFact, referenceBuildingFact} from '../js/spatial-store.js';
import {referenceIds, areaVenueBuildings, tagVenueFeatures, venueHostFeatures, venueTargets, venueFramePoints, xrayFeatures} from '../js/venue-level.js';

const venueId = 'GV-a6836f91efc61a13', bigcKey = 'bigc-official-15068', pureKey = 'c1901a70', sevenKey = '29055ba4';
const forumId = 'followup:osm:way/1264152504';
const parcVenueId = 'SC-000977', parcKey = 'bigc-official-15073', parcId = 'followup:cmv4-70aa2830ff1ea4b186f1a46b94fa';
const raw = readJSON('data/venue-reference-buildings.json');
const references = {...raw, byId: new Map(raw.buildings.features.map(f => [f.id, f]))};
const model = buildModel(readJSON('data/grocery.json'), readJSON('data/areas.json'), readJSON('data/retail-refresh.json'));
const rows = [bigcKey, pureKey, sevenKey].map(key => model.rowByKey.get(key));
const venue = model.venues.find(v => v.id === venueId);
const actualSpatial = readJSON('data/spatial/10.json');
const actual = {...actualSpatial, byId: new Map(actualSpatial.buildings.features.map(f => [f.id, f]))};
const ids = features => features.map(f => f.id).sort();
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('an explicit store allow-list fails closed; legacy venue references retain their unscoped behavior', () => {
  const ref = raw.venues[venueId];
  assert.deepEqual(referenceIds(references, venueId), [], 'a scoped reference needs explicit selected row keys');
  assert.deepEqual(referenceIds(references, venueId, [pureKey, sevenKey]), []);
  assert.deepEqual(referenceIds(references, venueId, [bigcKey, pureKey]), [forumId]);
  assert.deepEqual(referenceStoreKeys(ref, [pureKey, bigcKey, sevenKey]), [bigcKey]);
  const legacyId = Object.keys(raw.venues).find(id => !Object.hasOwn(raw.venues[id], 'appliesToStoreKeys'));
  assert.deepEqual(referenceIds(references, legacyId), raw.venues[legacyId].buildingIds);
  assert.deepEqual(referenceStoreKeys(raw.venues[legacyId], [pureKey, bigcKey]), [pureKey, bigcKey]);
  for (const scope of [[], null, undefined, bigcKey, {}, [bigcKey, ''], [bigcKey, null], [` ${bigcKey}`], [bigcKey, bigcKey]]) {
    const bad = {...references, venues: {...references.venues, [venueId]: {...ref, appliesToStoreKeys: scope}}};
    assert.deepEqual(referenceIds(bad, venueId, [bigcKey]), [], `reject malformed scope ${JSON.stringify(scope)}`);
    assert.equal(selectSpatialBuildings(model, rows, () => actual, bad).referenceCount, 0);
    assert.equal(areaVenueBuildings(model, rows, bad).features.length, 0);
    const stale = {type: 'FeatureCollection', features: [references.byId.get(forumId)]};
    assert.equal(tagVenueFeatures(stale, model, bad, rows).features.length, 0);
    assert.deepEqual(venueHostFeatures(stale, {venue, references: bad, rowKeys: [bigcKey]}), []);
  }
});

test('Forum is an original OSM footprint qualified for one official branch, with unknown source height', () => {
  const ref = raw.venues[venueId], feature = references.byId.get(forumId), p = feature.properties;
  assert.deepEqual(ref.appliesToStoreKeys, [bigcKey]);
  assert.equal(ref.sourceVenueId, '17f44c5c-de52-4d42-bfba-2b160c8bb2e6');
  assert.equal(ref.qualifiedHostName, 'Forum · One Bangkok');
  assert.equal(ref.pointRelation, 'outside');
  assert.equal(ref.pointDistanceM, 135.418);
  assert.equal(sha(feature.geometry), '65cdb04c1fac404d87b1c6d0f2c4fa22b2a7267962690ae4d8850fe2bf3ea15b', 'independent source geometry checkpoint, including exact coordinates');
  assert.match(p.sourceGeometrySHA256Encoding, /sorted keys/);
  assert.equal(sha({coordinates: feature.geometry.coordinates, type: feature.geometry.type}), p.sourceGeometrySHA256, 'Forum source hash uses its declared sorted-key encoding');
  assert.equal(p.sourceFeatureId, 'way/1264152504');
  assert.equal(p.osmVersion, '4');
  assert.equal(p.osmTimestamp, '2025-03-09T18:15:29Z');
  assert.equal(p.sourcePageURL, 'https://www.openstreetmap.org/way/1264152504');
  assert.equal(p.sourceResponseSHA256, 'f7ca531e4d1404961992b9271bf3ae5ddfc34af6124dd854eb19b7a86cc09c79');
  assert.equal(p.license, 'ODbL-1.0');
  assert.equal(p.sourceHeightM, null);
  assert.equal(p.heightRole, 'unknown_display_fallback');
  assert.equal(p.height, 3); assert.equal(p.base, 0);
  assert.equal(p.sourceCheckedOn, '2026-10-25');
  assert.equal(ref.method, 'official_branch_address_and_venue_guide_with_osm_building');
});

test('actual One Bangkok selection never promotes the official outside point or lends Forum to Pure and 7-Eleven', () => {
  const before = JSON.stringify({rows, stores: actual.stores, refs: raw});
  const selected = selectSpatialBuildings(model, rows, () => actual, references);
  assert.equal(selected.referenceCount, 1);
  assert.equal(selected.matched, 0); assert.equal(selected.boundary, 1); assert.equal(selected.noBuilding, 2);
  assert.deepEqual(selected.links, [
    {key: bigcKey, status: 'no_building', buildingId: null},
    {key: pureKey, status: 'no_building', buildingId: null},
    {key: sevenKey, status: 'boundary_candidate', buildingId: null}
  ]);
  assert.deepEqual(ids(selected.collection.features), [forumId]);
  assert.deepEqual(selected.collection.features[0].properties.storeKeys, [bigcKey]);
  assert.deepEqual([rows[0].lon, rows[0].lat], [100.546693, 13.727357]);
  const bigc = selectSpatialBuildings(model, [rows[0]], () => actual, references);
  assert.equal(buildingFact(bigc).state, 'unmatched');
  assert.deepEqual(referenceBuildingFact(bigc), {label: 'อาคารของสถานที่ตามชื่อสาขา', state: 'reference', detail: 'Forum · One Bangkok',
    sources: [{label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/way/1264152504'}], heightLabel: 'ยังไม่มีความสูงอาคาร'});
  for (const other of rows.slice(1)) {
    const result = selectSpatialBuildings(model, [other], () => actual, references);
    assert.equal(result.referenceCount, 0, other.brand);
    assert.deepEqual(result.collection.features, []);
    assert.equal(referenceBuildingFact(result), null);
  }
  assert.equal(JSON.stringify({rows, stores: actual.stores, refs: raw}), before, 'no coordinate, source status, membership or geometry mutation');
});

test('filtered and baseline area views do not receive a scoped host from an absent supplemental row', () => {
  const originalModel = realModel();
  const baseRows = originalModel.rows.filter(r => originalModel.venues[r.v]?.id === venueId);
  assert.deepEqual(baseRows.map(r => r.key).sort(), [sevenKey, pureKey].sort());
  assert.deepEqual(areaVenueBuildings(originalModel, baseRows, references).features, []);
  const all = areaVenueBuildings(model, rows, references);
  assert.deepEqual(ids(all.features), [forumId]);
  assert.deepEqual(all.features[0].properties.storeKeys, [bigcKey]);
  const pureFiltered = filterRows(model.rows, {brand: 'PURE'}).filter(r => r.v === venue.index);
  assert.deepEqual(pureFiltered.map(r => r.key), [pureKey]);
  assert.deepEqual(areaVenueBuildings(model, pureFiltered, references).features, []);
  assert.deepEqual(tagVenueFeatures(all, model, references, pureFiltered).features, [], 'stale loaded Forum cannot be retagged as a point building');
  assert.deepEqual(venueHostFeatures(all, {venue, references, rowKeys: [pureKey, sevenKey]}), [], 'stale Forum is excluded from framing and x-ray');
});

test('mixed venue framing retains scoped Forum and other rows’ independent point buildings without cross-brand store keys', () => {
  const makePoint = (id, key) => ({...references.byId.get(forumId), id, properties: {buildingId: id, height: 12, heightRole: 'source_model', storeKeys: [key]}});
  const pure = makePoint('point:pure', pureKey), seven = makePoint('point:seven', sevenKey);
  const data = {stores: {[bigcKey]: {status: 'no_building'}, [pureKey]: {status: 'point_inside', buildingId: pure.id}, [sevenKey]: {status: 'point_inside', buildingId: seven.id}}, byId: new Map([[pure.id, pure], [seven.id, seven]])};
  const before = JSON.stringify(data.stores);
  const selected = selectSpatialBuildings(model, rows, () => data, references);
  assert.deepEqual(ids(selected.collection.features), [forumId, pure.id, seven.id].sort());
  assert.equal(selected.matched, 2); assert.equal(selected.noBuilding, 1);
  const tagged = tagVenueFeatures(selected.collection, model, references, rows);
  const host = tagged.features.find(f => f.id === forumId);
  assert.deepEqual(host.properties.storeKeys, [bigcKey]);
  assert.deepEqual(host.properties.venueIndexes, [venue.index]);
  assert.equal(host.properties.evidence, 'venue_reference');
  for (const point of tagged.features.filter(f => f.id !== forumId)) {
    assert.equal(point.properties.evidence, 'point_inside');
    assert.deepEqual(point.properties.venueIndexes, []);
  }
  const targets = venueHostFeatures(tagged, {venue, references, rowKeys: rows.map(r => r.key)});
  assert.deepEqual(ids(targets), [forumId, pure.id, seven.id].sort());
  const frames = venueFramePoints(venueTargets(targets), rows.map(r => [r.lon, r.lat]));
  assert.ok(frames.ground.some(p => p[0] === 100.546693 && p[1] === 13.727357), 'the official outside point stays in the framing target');
  assert.ok(frames.roof.some(p => p[2] === 3), 'unknown Forum has only its display fallback in rendering');
  assert.equal(xrayFeatures(targets).length, 3);
  const otherRows = rows.slice(1), filtered = tagVenueFeatures(tagged, model, references, otherRows);
  assert.deepEqual(ids(filtered.features), [pure.id, seven.id].sort());
  assert.deepEqual(ids(venueHostFeatures(filtered, {venue, references, rowKeys: otherRows.map(r => r.key)})), [pure.id, seven.id].sort());
  assert.equal(JSON.stringify(data.stores), before, 'named context does not rewrite independent point joins');
});

test('PARC parking reference preserves its complete quantized source ring and holds model height separately from owner evidence', () => {
  const ref = raw.venues[parcVenueId], feature = references.byId.get(parcId), p = feature.properties;
  assert.deepEqual(ref.appliesToStoreKeys, [parcKey]);
  assert.equal(ref.qualifiedHostName, 'อาคารจอดรถ · PARC Bangna');
  assert.equal(ref.sourceVenueId, null, 'an anonymous native component never acquires a provider venue UUID');
  assert.equal(ref.ownerEvidence.ownerReportedStoreys, 3); assert.equal(ref.ownerEvidence.selectedStoreFloor, 'Ground');
  assert.equal(ref.ownerEvidence.imageSHA256, '868226fa696bdd186b59d1cf0d89d402df8918432fe373e819be18e1556ed98f');
  assert.equal(ref.pointRelation, 'outside'); assert.equal(ref.pointDistanceM, 64.954);
  assert.deepEqual(ref.separateGoogleObservation.point, [100.6477432, 13.6671705]);
  assert.equal(ref.separateGoogleObservation.selectedAsStorePoint, false);
  assert.equal(ref.separateGoogleObservation.relation, 'inside_boundary_review');
  assert.equal(ref.separateGoogleObservation.edgeClearanceM, 4.851);
  assert.equal(ref.separateGoogleObservation.pointReviewGuardM, 10);
  const tileRing = [[2405,-14],[2431,-5],[2430,-2],[2438,1],[2420,57],[2427,59],[2421,76],[2411,73],[2404,95],[2373,86],[2405,-14]];
  assert.deepEqual(p.rawTileRings, [tileRing], 'the negative-Y buffer vertices are neither clipped nor repaired');
  assert.equal(feature.geometry.coordinates.length, 1, 'no added or removed holes');
  assert.equal(sha(feature.geometry), '2fe21de9f293d9f811dd0a40db3237ff08f57c6c99ef135553828b3d77aa592b', 'independent original source checkpoint');
  assert.match(p.sourceGeometrySHA256Encoding, /JSON\.stringify|insertion/);
  assert.equal(sha(feature.geometry), p.sourceGeometrySHA256, 'PARC source hash uses its declared insertion-order encoding');
  assert.equal(p.sourceSnapshotSHA256, 'b04f089d790eeea244d082437873ed98763456a122bb082ac50d9ae6a5251153');
  assert.equal(p.tile, '14/12772/7564'); assert.equal(p.sourceFeatureIndex, 51); assert.equal(p.sourceComponent, 0); assert.equal(p.sourceExtent, 4096);
  assert.equal(p.sourceCoordinateTransform, 'EPSG4326_affine_tile_bounds');
  assert.equal(p.sourceFeatureId, null); assert.equal(p.nativeBuildingId, null);
  assert.equal(p.sourceHeightM, null); assert.equal(p.measuredHeightM, null);
  assert.equal(p.heightRole, 'unknown_display_fallback'); assert.equal(p.height, 3); assert.equal(p.base, 0);
  assert.equal(p.sourceModelHeightM, 16.75); assert.equal(p.sourceEstimatedFloor, 4); assert.equal(p.ownerObservedStoreys, 3);
  assert.deepEqual(p.rawSourceProperties, {height_m: '16.75', estimated_floor: 4, height_class_code: 'H3'});
  assert.deepEqual(p.sourceLicenses, ['ODbL-1.0', 'CC-BY-4.0']);
});

test('PARC uses only branch-qualified named context and retains the official outside point and no-building result', () => {
  const row = model.rowByKey.get(parcKey), before = JSON.stringify({row, data: actual.stores[parcKey], ref: raw.venues[parcVenueId]});
  const ref = raw.venues[parcVenueId], parcVenue = model.venues[row.v];
  assert.equal(parcVenue.id, parcVenueId);
  assert.deepEqual([row.lon, row.lat], [100.64690561279112, 13.666999737741738]);
  assert.deepEqual([row.sourceFacts.longitude, row.sourceFacts.latitude], [row.lon, row.lat]);
  assert.equal(actual.stores[parcKey].status, 'no_building');
  const selected = selectSpatialBuildings(model, [row], () => actual, references);
  assert.equal(selected.matched, 0); assert.equal(selected.noBuilding, 1); assert.equal(selected.referenceCount, 1);
  assert.deepEqual(selected.links, [{key: parcKey, status: 'no_building', buildingId: null}]);
  assert.deepEqual(ids(selected.collection.features), [parcId]);
  assert.deepEqual(selected.collection.features[0].properties.storeKeys, [parcKey]);
  assert.equal(buildingFact(selected).state, 'unmatched');
  const fact = referenceBuildingFact(selected);
  assert.equal(fact.detail, 'อาคารจอดรถ · PARC Bangna');
  assert.equal(fact.heightLabel, 'ยังไม่มีความสูงอาคาร');
  assert.deepEqual(fact.sources.map(s => s.label), ['CityMETER']);
  assert.doesNotMatch(JSON.stringify(fact), /16\.75|9 ม\.|4 ชั้น|3 ชั้น/);
  assert.deepEqual(referenceIds(references, parcVenueId), []);
  assert.deepEqual(referenceIds(references, parcVenueId, [bigcKey, pureKey, sevenKey]), []);
  assert.deepEqual(referenceIds(references, parcVenueId, [parcKey]), [parcId]);
  const foreign = {...row, key: 'other-parc-store-with-no-host-evidence'};
  assert.equal(selectSpatialBuildings(model, [foreign], () => actual, references).referenceCount, 0);
  assert.equal(areaVenueBuildings(model, [foreign], references).features.length, 0);
  assert.deepEqual(tagVenueFeatures(selected.collection, model, references, [foreign]).features, []);
  assert.deepEqual(venueHostFeatures(selected.collection, {venue: parcVenue, references, rowKeys: [foreign.key]}), []);
  assert.deepEqual(venueHostFeatures(selected.collection, {venue: parcVenue, references, rowKeys: [parcKey]}).map(f => f.id), [parcId]);
  assert.equal(JSON.stringify({row, data: actual.stores[parcKey], ref}), before, 'no source coordinate, point result, host evidence or floor fact is rewritten');
});

test('effective reference totals add exactly two qualified rows and never cross the Forum/PARC branch scopes', () => {
  const qualified = model.rows.filter(row => row.v >= 0 && referenceStoreKeys(raw.venues[model.venues[row.v].id], [row.key]).length);
  assert.equal(raw.meta.venueCount, 31); assert.equal(raw.meta.features, 78); assert.equal(raw.meta.linkedStoreRows, 46);
  assert.equal(qualified.length, 46);
  const selectedRows = [model.rowByKey.get(parcKey), rows[0]];
  const collection = areaVenueBuildings(model, selectedRows, references);
  assert.deepEqual(ids(collection.features), [parcId, forumId].sort());
  for (const feature of collection.features) assert.deepEqual(feature.properties.storeKeys, [feature.id === parcId ? parcKey : bigcKey]);
  const parcOnly = areaVenueBuildings(model, selectedRows.filter(row => row.key === parcKey), references);
  assert.deepEqual(ids(parcOnly.features), [parcId]);
  const forumOnly = areaVenueBuildings(model, selectedRows.filter(row => row.key === bigcKey), references);
  assert.deepEqual(ids(forumOnly.features), [forumId]);
});
