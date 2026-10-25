import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ringLocation, polygonHit, polygonComponents, chooseHit, buildingComponentId, assertServiceLimits, PUBLIC_SERVICE_LIMITS} from '../scripts/build-spatial-joins.mjs';
import {referenceHit, chooseReferenceHit} from '../scripts/build-reference-spatial-joins.mjs';
import {buildModel} from '../js/model.js';

const outer = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
const hole = [[40, 40], [40, 60], [60, 60], [60, 40], [40, 40]];
test('containment respects holes and both kinds of boundary', () => {
  assert.equal(ringLocation([20, 20], outer), 1);
  assert.equal(ringLocation([0, 20], outer), 0);
  assert.equal(polygonHit([50, 50], [outer, hole]), null);
  assert.equal(polygonHit([40, 50], [outer, hole]).boundaryDistanceM, 0);
  assert.equal(polygonHit([20, 20], [outer, hole]).boundaryDistanceM, 20);
  assert.equal(polygonHit([-1, 20], [outer]), null);
});
test('only one deep interior may select a building, never a near neighbour', () => {
  assert.deepEqual(chooseHit([]), {status: 'no_building', buildingId: null, candidateIds: [], boundaryDistanceM: null});
  assert.equal(chooseHit([{buildingId: 'a', boundaryDistanceM: 9.999}]).status, 'boundary_candidate');
  assert.equal(chooseHit([{buildingId: 'a', boundaryDistanceM: 10}]).status, 'point_inside');
  assert.equal(chooseHit([{buildingId: 'a', boundaryDistanceM: 20}, {buildingId: 'b', boundaryDistanceM: 21}]).status, 'ambiguous');
  assert.equal(chooseHit([{buildingId: 'a', boundaryDistanceM: 20}, {buildingId: 'b', boundaryDistanceM: 1}]).buildingId, 'a');
  assert.equal(chooseHit([{buildingId: 'a', boundaryDistanceM: 1}, {buildingId: 'b', boundaryDistanceM: 2}]).buildingId, null);
});
test('split merged MVT buildings into exact outer+hole components without modifying rings', () => {
  const other = outer.map(([x, y]) => [x + 200, y]);
  const original = JSON.stringify([outer, hole, other]);
  const split = polygonComponents([outer, hole, other]);
  assert.equal(split.length, 2); assert.deepEqual(split[0], [outer, hole]); assert.deepEqual(split[1], [other]);
  assert.equal(JSON.stringify([outer, hole, other]), original);
  const a = buildingComponentId('14/1/2', 9, split[0], 'snapshot-a');
  assert.equal(a, buildingComponentId('14/1/2', 9, split[0], 'snapshot-a'));
  assert.notEqual(a, buildingComponentId('14/1/2', 9, split[1], 'snapshot-a'));
  assert.notEqual(a, buildingComponentId('14/1/2', 9, split[0], 'snapshot-b'));
});
test('public tile extraction bounds require a separate provider permission receipt', () => {
  assert.equal(PUBLIC_SERVICE_LIMITS.concurrency, 4);
  assert.doesNotThrow(() => assertServiceLimits(3000, 50_000_000));
  assert.throws(() => assertServiceLimits(3001), {code: 'SERVICE_LIMIT_EXCEEDED'});
  assert.throws(() => assertServiceLimits(1, 50_000_001), {code: 'SERVICE_LIMIT_EXCEEDED'});
  assert.doesNotThrow(() => assertServiceLimits(8563, 108_901_400, true));
});
test('reference geometry preserves holes and MultiPolygon coverage without treating missing coverage as no building', () => {
  const ring = [[100, 13], [100.002, 13], [100.002, 13.002], [100, 13.002], [100, 13]];
  const inner = [[100.0008, 13.0008], [100.0008, 13.0012], [100.0012, 13.0012], [100.0012, 13.0008], [100.0008, 13.0008]];
  const other = ring.map(([x, y]) => [x + 1, y]);
  const geometry = {type: 'MultiPolygon', coordinates: [[ring, inner], [other]]};
  const original = JSON.stringify(geometry);
  assert.equal(referenceHit(100.001, 13.001, geometry), null);
  assert.equal(referenceHit(100, 13.001, geometry).boundaryDistanceM, 0);
  assert.ok(referenceHit(101.001, 13.001, geometry).boundaryDistanceM > 100);
  assert.equal(referenceHit(102, 13, geometry), null);
  assert.equal(JSON.stringify(geometry), original);
  assert.equal(chooseReferenceHit([]).status, 'unavailable');
  assert.equal(chooseReferenceHit([]).reason, 'limited_reference_coverage');
  assert.equal(chooseReferenceHit([{buildingId: 'host-a', boundaryDistanceM: 5}]).status, 'boundary_candidate');
  assert.equal(chooseReferenceHit([{buildingId: 'host-a', boundaryDistanceM: 12}]).status, 'point_inside');
});

const manifestURL = new URL('../data/spatial-joins.json', import.meta.url);
test('generated spatial artifacts account for every store and resolve every candidate geometry', {skip: !existsSync(manifestURL)}, () => {
  const manifest = JSON.parse(readFileSync(manifestURL));
  const grocery = JSON.parse(readFileSync(new URL('../data/grocery.json', import.meta.url)));
  const areas = JSON.parse(readFileSync(new URL('../data/areas.json', import.meta.url)));
  const refreshBytes = readFileSync(new URL('../data/retail-refresh.json', import.meta.url));
  const refresh = JSON.parse(refreshBytes), model = buildModel(grocery, areas, refresh);
  const sourceKeys = new Set(grocery.rows.map(r => r[0]));
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/spatial-stores-baseline-74d214a.json', import.meta.url)));
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const referenceBytes = readFileSync(new URL('../data/venue-reference-buildings.json', import.meta.url));
  const reference = JSON.parse(referenceBytes), referenceById = new Map(reference.buildings.features.map(f => [f.id, f]));
  const wanted = new Set(model.rows.map(r => r.key)), seen = new Set(), counts = {};
  assert.equal(manifest.meta.inputRows, wanted.size);
  assert.equal(manifest.meta.sourceInputRows, grocery.rows.length);
  assert.equal(manifest.meta.supplementalInputRows, refresh.supplemental.length);
  assert.equal(manifest.meta.inputRetailRefreshSha256, createHash('sha256').update(refreshBytes).digest('hex'));
  assert.equal(Object.keys(manifest.provinces).length, 77);
  assert.equal(manifest.meta.processingComplete, true);
  assert.ok(manifest.meta.coverage);
  assert.equal(manifest.meta.nationwideBuildingCoverage, false);
  assert.equal(manifest.meta.networkRequests, 0);
  assert.deepEqual(manifest.method.priority, ['native_host_hit', 'verified_reference_host_hit', 'microsoft_gap_fill']);
  assert.equal(manifest.meta.guardMetres, 10);
  if (manifest.meta.referenceSHA256) assert.equal(manifest.meta.referenceSHA256, createHash('sha256').update(referenceBytes).digest('hex'));
  assert.equal(manifest.meta.inputDataSha256, createHash('sha256').update(readFileSync(new URL('../data/grocery.json', import.meta.url))).digest('hex'));
  for (const [provinceCode, item] of Object.entries(manifest.provinces)) {
    const bytes = readFileSync(new URL('../' + item.url, import.meta.url)), data = JSON.parse(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(data.meta.provinceCode, provinceCode);
    assert.equal(Object.keys(data.stores).length, item.stores);
    const protectedStores = Object.fromEntries(Object.entries(data.stores).filter(([key]) => sourceKeys.has(key)));
    assert.equal(Object.keys(protectedStores).length, baseline.provinces[provinceCode].sourceStores);
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(protectedStores))).digest('hex'), baseline.provinces[provinceCode].storesCanonicalSHA256,
      `${provinceCode}: original source-point spatial decisions must remain unchanged`);
    const byId = new Map(data.buildings.features.map(f => [f.id, f]));
    assert.equal(byId.size, data.buildings.features.length);
    for (const feature of byId.values()) {
      assert.equal(feature.id, feature.properties.buildingId);
      assert.ok(['Polygon', 'MultiPolygon'].includes(feature.geometry.type));
      assert.ok(Number.isFinite(feature.properties.height) && Number.isFinite(feature.properties.base));
      const p = feature.properties;
      assert.ok(['citymeter_native', 'verified_reference', 'microsoft'].includes(p.provider));
      assert.match(p.sourcePageURL, /^https:\/\//);
      assert.doesNotMatch(p.sourcePageURL, /\.(?:gz|pbf)(?:$|\?)/);
      if (p.provider === 'verified_reference') {
        const original = referenceById.get(feature.id); assert.ok(original);
        assert.deepEqual(feature.geometry, original.geometry);
        for (const field of ['height', 'base', 'heightRole', 'sourceURL']) assert.equal(p[field], original.properties[field]);
        assert.equal(p.geometryRole, 'venue_reference_footprint');
      } else if (p.provider === 'citymeter_native') {
        assert.equal(p.heightRole, 'citymeter_v4_mixed_source_context');
        assert.equal(p.nativeBuildingId, null);
        assert.equal(p.sourceCoordinateTransform, 'EPSG4326_affine_tile_bounds');
        assert.match(p.sourceSnapshotSha256, /^[0-9a-f]{64}$/);
        assert.equal(p.geometrySha256, createHash('sha256').update(JSON.stringify(feature.geometry)).digest('hex'));
      } else {
        assert.equal(p.license, 'CDLA-Permissive-2.0');
        assert.match(p.sourceFileSHA256, /^[0-9a-f]{64}$/);
        assert.match(p.sourceLineSHA256, /^[0-9a-f]{64}$/);
        assert.match(p.sourceGeometrySHA256, /^[0-9a-f]{64}$/);
        assert.ok(feature.id.endsWith(p.sourceGeometrySHA256.slice(0, 20)));
        if (p.heightRole === 'unknown_display_fallback') {
          assert.equal(p.sourceHeightM, null);
          assert.equal(p.height, 3);
          assert.ok(p.rawHeight === null || p.rawHeight === undefined || p.rawHeight <= 0);
        } else assert.ok(Number.isFinite(p.sourceHeightM) && p.sourceHeightM > 0);
      }
    }
    for (const [key, row] of Object.entries(data.stores)) {
      assert.ok(wanted.has(key) && !seen.has(key)); seen.add(key);
      assert.equal(model.provinces[model.rowByKey.get(key).p].code, provinceCode, `${key}: province must match its recorded admin membership`);
      counts[row.status] = (counts[row.status] || 0) + 1;
      for (const id of row.candidateIds) assert.ok(byId.has(id), `${key} candidate geometry missing`);
      assert.equal(new Set(row.candidateIds).size, row.candidateIds.length);
      if (row.status === 'point_inside') {
        assert.ok(byId.has(row.buildingId));
        assert.ok(row.boundaryDistanceM >= 10);
      } else assert.equal(row.buildingId, null);
      assert.ok(['citymeter_native', 'verified_reference', 'microsoft'].includes(row.decisionSource));
      for (const id of row.candidateIds) assert.equal(byId.get(id).properties.provider, row.decisionSource);
      if (['point_inside', 'boundary_candidate', 'ambiguous'].includes(row.nativeStatus)) {
        assert.equal(row.decisionSource, 'citymeter_native'); assert.equal(row.status, row.nativeStatus);
      } else if (['point_inside', 'boundary_candidate', 'ambiguous'].includes(row.referenceStatus)) {
        assert.equal(row.decisionSource, 'verified_reference'); assert.equal(row.status, row.referenceStatus);
      } else {
        assert.equal(row.decisionSource, 'microsoft'); assert.equal(row.status, row.microsoftStatus);
      }
      if (row.status === 'no_building' || row.status === 'unavailable') {
        assert.deepEqual(row.candidateIds, []); assert.equal(row.boundaryDistanceM, null);
      }
      if (row.status === 'boundary_candidate') assert.ok(row.boundaryDistanceM >= 0 && row.boundaryDistanceM <= 10);
    }
  }
  assert.equal(seen.size, wanted.size);
  for (const [status, count] of Object.entries(manifest.counts)) assert.equal(counts[status] || 0, count);
});
