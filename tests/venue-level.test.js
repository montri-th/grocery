import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {realModel, readJSON} from './helpers.js';
import {EVIDENCE, DISPLAY_FALLBACK_HEIGHT_M, venueOf, isVenueLevel, referenceIds, areaVenueBuildings, tagVenueFeatures, buildingKinds,
  venueHostFeatures, displayHeight, venueTargets, xrayFeatures, venueFramePoints, buildingClickTarget} from '../js/venue-level.js';
import {presetFor} from '../js/camera.js';
import {NO_SELECTION, normalizeSelection, areaRows} from '../js/hierarchy.js';
import {filterRows, hasPoint} from '../js/model.js';
import {buildBreadcrumb} from '../js/breadcrumb.js';

const model = realModel();
const raw = readJSON('data/venue-reference-buildings.json');
// The same lookup js/spatial-store.js ensureReferences() builds.
const references = {...raw, byId: new Map(raw.buildings.features.map(f => [String(f.id ?? f.properties.buildingId), f]))};
const venueNamed = name => model.venues.find(v => v.name === name);
const paragon = venueNamed('Siam Paragon');
const world = venueNamed('centralwOrld');
const rowsOf = venue => model.rows.filter(r => r.v === venue.index);
const rowByKey = key => model.rowByKey.get(key) || null;

test('the venue level is a venue panel or a store whose branch name names a venue', () => {
  const store = rowsOf(paragon)[0];
  assert.equal(venueOf(model, {mode: 'store', id: store.key}, rowByKey), paragon);
  assert.equal(venueOf(model, {mode: 'venue', id: paragon.index}, rowByKey), paragon);
  assert.ok(isVenueLevel({mode: 'store'}, paragon) && isVenueLevel({mode: 'venue'}, null));
  const plain = model.rows.find(r => r.v < 0);
  assert.equal(venueOf(model, {mode: 'store', id: plain.key}, rowByKey), null);
  assert.equal(isVenueLevel({mode: 'store'}, null), false);
  assert.equal(isVenueLevel({mode: 'unit'}, paragon), false, 'an area panel is never the venue level');
  // The crumbs of a store in a venue end at the venue; a store is never a crumb.
  const sel = normalizeSelection(model, {unit: store.u[0]});
  assert.deepEqual(buildBreadcrumb(model, sel, paragon).map(c => c.level), ['country', 'province', 'district', 'unit', 'venue']);
});

test('an area level draws only the accepted reference buildings of the venues its rows name', () => {
  const unitRows = areaRows(model.rows, normalizeSelection(model, {unit: rowsOf(paragon)[0].u[0]}));
  assert.ok(unitRows.length > rowsOf(paragon).length, 'the unit holds other stores too');
  const before = JSON.stringify(raw.buildings.features);
  const fc = areaVenueBuildings(model, unitRows, references);
  const ids = new Set(referenceIds(references, paragon.id));
  assert.equal(fc.features.length, ids.size, 'every footprint and part of Siam Paragon, nothing else');
  assert.ok(fc.features.every(f => ids.has(f.id)));
  for (const f of fc.features) {
    assert.equal(f.properties.evidence, EVIDENCE.reference);
    assert.deepEqual(f.properties.venueIndexes, [paragon.index]);
    assert.deepEqual(f.properties.storeKeys, rowsOf(paragon).filter(r => unitRows.includes(r)).map(r => r.key));
  }
  assert.equal(JSON.stringify(raw.buildings.features), before, 'source geometry and properties are not mutated');
  assert.equal(areaVenueBuildings(model, unitRows.filter(r => r.v !== paragon.index), references).features.length, 0, 'no reference → nothing drawn, never a nearest building');
  assert.equal(areaVenueBuildings(model, unitRows, null).features.length, 0, 'references not loaded yet → nothing');
  // A venue that is named but has no accepted reference draws nothing.
  const named = model.venues.find(v => v.name === 'MBK Center');
  assert.deepEqual(referenceIds(references, named.id), []);
  assert.equal(areaVenueBuildings(model, rowsOf(named), references).features.length, 0);
});

test('venue/store level: buildings are tagged with their evidence and the venue they belong to', () => {
  const refFeature = references.byId.get(referenceIds(references, world.id)[0]);
  const point = {type: 'Feature', id: 'msml-test', geometry: refFeature.geometry, properties: {buildingId: 'msml-test', height: 3, storeKeys: ['zzzzzzzz']}};
  const collection = {type: 'FeatureCollection', features: [refFeature, point]};
  const tagged = tagVenueFeatures(collection, model, references, rowsOf(world));
  assert.deepEqual(tagged.features[0].properties.venueIndexes, [world.index]);
  assert.equal(tagged.features[0].properties.evidence, EVIDENCE.reference);
  assert.equal(tagged.features[1].properties.evidence, EVIDENCE.point);
  assert.deepEqual(tagged.features[1].properties.venueIndexes, []);
  assert.equal(refFeature.properties.evidence, undefined, 'tagging returns new objects');
  assert.deepEqual(buildingKinds(tagged), {venue: true, point: true});
  assert.deepEqual(buildingKinds({features: []}), {venue: false, point: false});
  assert.equal(tagVenueFeatures(null, model, references).features.length, 0);
});

test('the venue’s own buildings: its reference first, else the buildings its own points fall inside', () => {
  const ref = areaVenueBuildings(model, rowsOf(world), references);
  assert.ok(ref.features.length > 1, 'centralwOrld has a footprint and display parts');
  const store = rowsOf(world)[0];
  const point = {type: 'Feature', id: 'cmv4-test', geometry: ref.features[0].geometry, properties: {buildingId: 'cmv4-test', height: 12, storeKeys: [store.key], evidence: EVIDENCE.point}};
  const both = {type: 'FeatureCollection', features: [...ref.features, point]};
  assert.deepEqual(venueHostFeatures(both, {venue: world, references, rowKeys: [store.key]}).map(f => f.id), ref.features.map(f => f.id));
  const other = model.venues.find(v => v.name === 'MBK Center');
  const onlyPoint = {type: 'FeatureCollection', features: [{...point, properties: {...point.properties, storeKeys: rowsOf(other).map(r => r.key)}}, ...ref.features]};
  assert.deepEqual(venueHostFeatures(onlyPoint, {venue: other, references, rowKeys: rowsOf(other).map(r => r.key)}).map(f => f.id), ['cmv4-test'],
    'without a reference, the point buildings of the venue’s own rows — never another venue’s reference');
  assert.deepEqual(venueHostFeatures(both, {venue: null, references}), []);
});

test('display heights, x-ray solids and framing points: outline parents stay flat, unknown heights are display-only', () => {
  const outline = {type: 'Feature', geometry: {type: 'Polygon', coordinates: [[[100, 13], [100.001, 13], [100.001, 13.001], [100, 13]]]}, properties: {renderAs: 'outline', height: 0}};
  const part = {...outline, properties: {renderAs: 'extrusion', height: 38, base: 12}};
  const unknown = {...outline, properties: {height: null}};
  assert.equal(displayHeight(outline), 0);
  assert.equal(displayHeight(part), 38);
  assert.equal(displayHeight(unknown), DISPLAY_FALLBACK_HEIGHT_M);
  const solids = xrayFeatures([outline, part, unknown]);
  assert.equal(solids.length, 2, 'the flat outline parent is not a solid');
  assert.deepEqual(solids.map(f => [f.properties.height, f.properties.base]), [[38, 12], [DISPLAY_FALLBACK_HEIGHT_M, 0]]);
  assert.equal(unknown.properties.height, null, 'the source property is untouched');
  const targets = venueTargets([outline, part]);
  assert.deepEqual(targets.map(t => t.height), [0, 38]);
  const {ground, roof} = venueFramePoints(targets, [[100.0005, 13.0005]]);
  assert.equal(ground.length, 4 + 4 + 1, 'both rings and the store point on the ground');
  assert.equal(roof.length, 4, 'only the extruded part has a roof');
  assert.ok(roof.every(p => p[2] === 38));
});

test('a click on a drawn building opens the venue from an area or a store, the store inside the venue level', () => {
  const has = () => true;
  assert.deepEqual(buildingClickTarget({mode: 'unit', venueIndexes: [7], storeKeys: ['a'], hasVenue: has, hasStore: has}), {type: 'venue', index: 7});
  assert.deepEqual(buildingClickTarget({mode: 'store', id: 'a', venueIndexes: [7], storeKeys: ['a'], hasVenue: has, hasStore: has}), {type: 'venue', index: 7}, 'from a store up to its venue');
  assert.deepEqual(buildingClickTarget({mode: 'venue', id: 7, venueIndexes: [7], storeKeys: ['a', 'b'], hasVenue: has, hasStore: has}), {type: 'store', key: 'a'});
  assert.deepEqual(buildingClickTarget({mode: 'store', id: 'b', storeKeys: ['a', 'b'], hasStore: has}), {type: 'store', key: 'b'}, 'a point building keeps the open store');
  assert.deepEqual(buildingClickTarget({mode: 'unit', venueIndexes: [7], storeKeys: ['a'], hasVenue: () => false, hasStore: k => k === 'a'}), {type: 'store', key: 'a'}, 'a filtered-out venue falls back to its store');
  assert.equal(buildingClickTarget({mode: 'unit', storeKeys: ['a'], hasStore: () => false}), null);
});

/* ---------- production camera and URL contract (sliced from js/app.js) ---------- */
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const slice = (start, end) => {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production code still exists: ${start}`);
  return app.slice(a, b);
};

test('camera contract: two-point (eye) by default at venue level, model with ?cam=model, plan in 2D; never elsewhere', () => {
  const panel = {classList: {contains: () => false}};
  const context = vm.createContext({state: {view3d: true, twoPoint: true, panel: {mode: 'venue', id: 0}}, presetFor, isVenueLevel,
    currentVenue: () => ({}), mobilePortrait: () => false, $: () => panel});
  vm.runInContext(slice('// While the mobile sheet covers the map', '/* ---------- URL ---------- */') + '\nglobalThis.api = {cameraPreset, venueLevel, sheetOpen};', context);
  const {state, api} = context;
  assert.equal(api.cameraPreset(), 'eye');
  state.panel = {mode: 'store', id: 'x'}; assert.equal(api.cameraPreset(), 'eye', 'a store inside a venue is the venue level');
  context.currentVenue = () => null; assert.equal(api.cameraPreset(), 'model', 'a store outside every venue keeps the model view');
  context.currentVenue = () => ({});
  state.panel = {mode: 'unit', id: 3}; assert.equal(api.cameraPreset(), 'model', 'the two-point view is a venue-level camera only');
  state.panel = {mode: 'overview', id: ''}; assert.equal(api.cameraPreset(), 'city');
  state.panel = {mode: 'venue', id: 0}; state.twoPoint = false; assert.equal(api.cameraPreset(), 'model', '?cam=model');
  state.twoPoint = true; state.view3d = false; assert.equal(api.cameraPreset(), 'plan');
  state.view3d = true; context.mobilePortrait = () => true; panel.classList.contains = () => true;
  assert.equal(api.sheetOpen(), true); assert.equal(api.cameraPreset(), 'model', 'the venue view waits while the mobile sheet covers the map (frameVenue fits a plan)');
  panel.classList.contains = () => false; assert.equal(api.cameraPreset(), 'eye', 'closing the sheet restores the two-point view');
});

test('?cam=model restores the model view; the default URL keeps the two-point view and stays clean', () => {
  const restore = search => {
    const state = {filters: {search: '', brand: '', type: ''}, sel: {...NO_SELECTION}, panel: {mode: 'overview', id: ''}};
    const context = vm.createContext({state, location: {search}, URLSearchParams, M: () => model, NO_SELECTION, normalizeSelection, filterRows, hasPoint,
      FIELDS: ['search', 'brand', 'type'], rowByKey, $: () => ({})});
    vm.runInContext([slice('function restoreFromURL()', '/* ---------- theme ---------- */'), slice('function storeSelection(', 'function computeFocus()'), 'restoreFromURL();'].join('\n'), context);
    return state;
  };
  assert.equal(restore(`?place=${paragon.id}`).twoPoint, true);
  const off = restore(`?place=${paragon.id}&cam=model`);
  assert.equal(off.twoPoint, false); assert.equal(off.panel.mode, 'venue'); assert.equal(model.venues[off.panel.id], paragon);
  const save = slice('function saveURL()', 'function restoreFromURL()');
  assert.match(save, /if \(!state\.twoPoint\) p\.set\('cam', 'model'\)/, 'only the opt-out is written to the URL');
});
