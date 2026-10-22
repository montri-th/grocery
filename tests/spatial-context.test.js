import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {realModel, readJSON} from './helpers.js';
import {outerRings, tilesForRegions, MAX_TILES} from '../js/massing.js';
import {LABEL_MAX_ZOOM, FILL_MAX_ZOOM} from '../js/area-layers.js';
import {buildingKinds} from '../js/venue-level.js';

const model = realModel();
const venue = model.venues.find(v => v.id === 'GV-9e1d3c678f9b9ae0');
const row = model.rows.find(r => r.v === venue.index);
const unit = readJSON('data/geo/p/11.json').features.find(f => f.properties.k === '04110302');
const refs = readJSON('data/venue-reference-buildings.json');
const ids = new Set(refs.venues[venue.id].buildingIds);
const collection = {type: 'FeatureCollection', features: refs.buildings.features.filter(f => ids.has(f.id))};
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('function updateSpatialLayers()'), end = app.indexOf('function installSpatialLayers()', start);
assert.ok(start >= 0 && end > start);
const productionUpdate = app.slice(start, end);
const tileId = tile => `${tile.z}/${tile.x}/${tile.y}`;
const mallTile = '14/12774/7565';

const none = {type: 'FeatureCollection', features: []};
/** Run the production updateSpatialLayers with stand-ins; `areaCollection` is what displayedBuildings() draws at an area level. */
function contextFor(mode, selectedCollection = collection, areaCollection = none) {
  const detail = mode === 'store' || mode === 'venue';
  const state = {loaded: true, storesDirty: false, panel: {mode, id: mode === 'store' ? row.key : venue.index},
    sel: {province: row.p, district: row.d, unit: row.u[0]}, view3d: true,
    compare: {childLevel: 'unit'}, spatial: {summary: {collection: detail ? selectedCollection : {type: 'FeatureCollection', features: []}}},
    map: {getZoom: () => 16, getCenter: () => ({lat: row.lat})}};
  let input;
  state.massing = {update(value) { input = value; return Promise.resolve(); }};
  const context = vm.createContext({state, M: () => model, outerRings, LABEL_MAX_ZOOM, FILL_MAX_ZOOM,
    $: () => ({}), areaLayerModel: () => ({}), labelModel: () => [], updatePins() {},
    province: () => model.provinces[row.p], provinceGeoNow: () => ({units: new Map([[unit.properties.k, unit]])}),
    spatialSelectionRows: () => detail ? [row] : [], hasPoint: () => true, console,
    displayedBuildings: () => (detail ? state.spatial.summary.collection : areaCollection), buildingKinds, updateVenueScene() {}});
  vm.runInContext(productionUpdate + '\nupdateSpatialLayers();', context, {filename: 'production-spatial-context.js'});
  return input;
}

test('store and venue context includes the Megabangna host tile before the nine-tile cap', () => {
  const areaPlan = tilesForRegions(outerRings(unit));
  assert.equal(areaPlan.total, 16); assert.equal(areaPlan.truncated, true);
  assert.ok(!areaPlan.tiles.some(t => tileId(t) === mallTile), 'the old area-first plan omitted the host and could not exclude its context twin');
  const before = JSON.stringify({row, unit, collection});
  for (const mode of ['store', 'venue']) {
    const input = contextFor(mode), plan = tilesForRegions(input.regions);
    const tileIds = plan.tiles.map(tileId);
    assert.ok(tileIds.includes(mallTile), `${mode} includes the actual host tile`);
    assert.ok(plan.tiles.length <= MAX_TILES); assert.equal(plan.truncated, false);
    assert.equal(new Set(tileIds).size, tileIds.length, 'overlapping host regions do not duplicate tile requests');
    assert.deepEqual(input.hosts, collection.features.flatMap(outerRings), 'the original host ring remains available for context exclusion');
    const overlappingPart = {...collection.features[0], id: 'test-overlapping-display-part'};
    const overlapping = contextFor(mode, {...collection, features: [...collection.features, overlappingPart]});
    assert.deepEqual(tilesForRegions(overlapping.regions).tiles.map(tileId), tileIds, 'an overlapping display part shares the same bounded tile requests');
  }
  assert.equal(JSON.stringify({row, unit, collection}), before, 'tile planning changes no source geometry or memberships');
});

test('area views retain their compact-unit context and the existing request cap', () => {
  const input = contextFor('unit'), plan = tilesForRegions(input.regions);
  assert.deepEqual(input.regions, outerRings(unit)); assert.equal(input.hosts.length, 0);
  assert.deepEqual(Array.from(input.anchors), [unit.properties.c]);
  assert.equal(plan.tiles.length, MAX_TILES); assert.equal(plan.total, 16); assert.equal(plan.truncated, true);
});

test('an area level that draws venue buildings plans their tiles first, keeps the compact unit as context and stays within the cap', () => {
  const input = contextFor('unit', collection, collection), plan = tilesForRegions(input.regions);
  assert.ok(plan.tiles.some(t => tileId(t) === mallTile), 'the venue building tile survives the nine-tile cap');
  assert.ok(plan.tiles.length <= MAX_TILES);
  assert.deepEqual(input.hosts, collection.features.flatMap(outerRings), 'drawn venue buildings hide their context twins');
  const unitRings = outerRings(unit);
  assert.deepEqual(Array.from(input.regions).slice(-unitRings.length), unitRings, 'the compact unit remains the context region');
  assert.deepEqual(Array.from(input.anchors), [unit.properties.c]);
});
