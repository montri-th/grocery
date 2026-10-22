import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpatialStore, selectSpatialBuildings, buildingFact, referenceBuildingFact} from '../js/spatial-store.js';
import {installSpatialBuildings, BUILDING_LAYERS} from '../js/spatial-layer.js';
import {buildModel, filterRows} from '../js/model.js';
import {readJSON, realModel} from './helpers.js';
import {buildStoreDetail} from '../js/profile-model.js';
import {renderStore} from '../js/panel.js';

const polygon = id => ({type: 'Feature', id, geometry: {type: 'Polygon', coordinates: [[[100, 13], [100.01, 13], [100.01, 13.01], [100, 13]]]}, properties: {buildingId: id, height: 10, base: 0}});
const payload = () => ({meta: {}, stores: {a: {status: 'point_inside', buildingId: 'b1'}}, buildings: {type: 'FeatureCollection', features: [polygon('b1')]}});

test('province snapshot fetches are shared, failures retry, references cache separately, disposal aborts in-flight work', async () => {
  let calls = 0, fail = true;
  const cache = createSpatialStore({fetchImpl: async url => {
    calls++;
    if (fail) { fail = false; return {ok: false, status: 503}; }
    return {ok: true, json: async () => url.includes('reference') ? {venues: {}, buildings: {features: []}} : payload()};
  }});
  await assert.rejects(cache.ensure('10'), /503/);
  await Promise.all([cache.ensure('10'), cache.ensure('10')]);
  assert.equal(calls, 2, 'one retry, concurrent requests share its result');
  assert.equal(cache.peek('10').byId.get('b1').properties.height, 10);
  await Promise.all([cache.ensureReferences(), cache.ensureReferences()]);
  assert.equal(calls, 3, 'one shared global reference request');
  assert.ok(cache.peekReferences());
  await assert.rejects(cache.ensure('../10'), /Invalid province/);
  cache.dispose();
  assert.equal(cache.peek('10'), null);
  await assert.rejects(cache.ensure('10'), /disposed/);
  let aborted = false;
  const pending = createSpatialStore({fetchImpl: (url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  })});
  const request = pending.ensure('20'); pending.dispose();
  await assert.rejects(request, /aborted/); assert.equal(aborted, true);
});

test('a stalled province request times out and a later retry can populate the cache', async () => {
  let calls = 0;
  const cache = createSpatialStore({timeout: 5, fetchImpl: (url, {signal}) => {
    if (++calls > 1) return Promise.resolve({ok: true, json: async () => payload()});
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timed out'))));
  }});
  await assert.rejects(cache.ensure('10'), /timed out/);
  assert.equal(cache.peek('10'), null);
  await cache.ensure('10');
  assert.ok(cache.peek('10').byId.has('b1'));
  cache.dispose();
});

test('only strict interior matches highlight buildings; uncertainty, holes and source rows stay untouched', () => {
  const model = {provinces: [{code: '10'}], venues: []};
  const rows = ['a', 'b', 'c', 'd', 'e'].map(key => ({key, p: 0, v: -1, lon: 100, lat: 13}));
  const data = payload();
  data.stores.b = {status: 'boundary_candidate', candidateIds: ['b1']};
  data.stores.c = {status: 'ambiguous', candidateIds: ['b1', 'b2']};
  data.stores.d = {status: 'no_building'};
  const feature = polygon('b1'); feature.geometry.coordinates.push([[100.001, 13.001], [100.002, 13.001], [100.001, 13.001]]);
  data.byId = new Map([['b1', feature]]);
  const before = JSON.stringify({rows, feature});
  const selected = selectSpatialBuildings(model, rows, () => data);
  assert.equal(selected.matched, 1); assert.equal(selected.boundary, 1); assert.equal(selected.ambiguous, 1);
  assert.equal(selected.noBuilding, 1); assert.equal(selected.unavailable, 1);
  assert.deepEqual(selected.collection.features[0].properties.storeKeys, ['a']);
  assert.deepEqual(selected.collection.features[0].geometry.coordinates, feature.geometry.coordinates, 'raw holes remain in the displayed footprint');
  assert.equal(JSON.stringify({rows, feature}), before, 'no row, coordinate, geometry or height mutation');
  assert.match(buildingFact(selected).detail, /1 จาก 5/);
  assert.equal(buildingFact(null, true).state, 'loading');
  assert.equal(buildingFact({...selected, matched: 0}).state, 'uncertain');
});

test('an exact named-venue reference takes visual priority without upgrading point matching', () => {
  const model = {provinces: [{code: '10'}], venues: [{id: 'GV-one'}, {id: 'GV-other'}]};
  const rows = [{key: 'a', p: 0, v: 0}, {key: 'b', p: 0, v: 1}];
  const data = payload(); data.stores.b = {status: 'boundary_candidate'}; data.byId = new Map([['b1', polygon('b1')]]);
  const parent = polygon('ref:parent'), part = polygon('ref:part'); parent.properties.renderAs = 'outline';
  const refs = {venues: {'GV-one': {status: 'venue_reference', buildingIds: ['ref:parent', 'ref:part']}}, byId: new Map([['ref:parent', parent], ['ref:part', part]])};
  const selected = selectSpatialBuildings(model, rows, () => data, refs);
  assert.deepEqual(selected.collection.features.map(f => f.id), ['ref:parent', 'ref:part']);
  assert.equal(selected.matched, 1); assert.equal(selected.boundary, 1);
  assert.equal(selected.links[1].buildingId, null, 'a neighbouring venue reference never leaks into another candidate');
  assert.equal(selected.referenceCount, 2);
  assert.equal(referenceBuildingFact(selected).state, 'reference');
});

test('native point-match facts keep modeled height and source separate from a named venue reference', () => {
  const model = {provinces: [{code: '10'}], venues: [{id: 'GV-one'}]}, row = {key: 'a', p: 0, v: 0};
  const native = polygon('cmv4-one');
  Object.assign(native.properties, {provider: 'citymeter_v4_native_cache', height: 23, heightRole: 'citymeter_v4_mixed_source_context', sourcePageURL: 'https://landometer.com/v3/citymeter?d=building'});
  const data = {stores: {a: {status: 'point_inside', buildingId: native.id}}, byId: new Map([[native.id, native]])};
  const reference = polygon('ref:one'); reference.properties.height = 0; reference.properties.heightRole = 'unknown_display_fallback';
  const refs = {venues: {'GV-one': {status: 'venue_reference', buildingIds: [reference.id]}}, byId: new Map([[reference.id, reference]])};
  const before = JSON.stringify({row, native, reference});
  const summary = selectSpatialBuildings(model, [row], () => data, refs), fact = buildingFact(summary);
  assert.deepEqual(summary.collection.features.map(f => f.id), ['ref:one']);
  assert.equal(fact.label, '1 อาคารตามพิกัดสาขา');
  assert.equal(fact.heightLabel, 'ความสูงเป็นค่าประมาณจากแหล่งข้อมูล');
  assert.deepEqual(fact.sources, [{label: 'CityMETER', url: 'https://landometer.com/v3/citymeter?d=building'}]);
  assert.equal(referenceBuildingFact(summary).label, 'อาคารของสถานที่ตามชื่อสาขา');
  assert.equal(JSON.stringify({row, native, reference}), before);
});

test('Microsoft missing height is not upgraded by the 3m display fallback or a raw download link', () => {
  const microsoft = polygon('msml-one');
  Object.assign(microsoft.properties, {provider: 'Microsoft GlobalMLBuildingFootprints', height: 3, rawHeight: -1, heightRole: 'unknown_display_fallback', sourceURL: 'https://example.org/large.geojsonl.gz', sourcePageURL: 'https://example.org/large.geojsonl.gz'});
  const fact = buildingFact({total: 1, matched: 1, buildingCount: 1, pointBuildings: [microsoft]});
  assert.equal(fact.heightLabel, 'ยังไม่มีความสูงอาคาร');
  assert.deepEqual(fact.sources, [{label: 'Microsoft', url: 'https://github.com/microsoft/GlobalMLBuildingFootprints'}]);
  microsoft.properties.heightRole = 'predicted'; microsoft.properties.rawHeight = 12; microsoft.properties.height = 12;
  assert.equal(buildingFact({total: 1, matched: 1, buildingCount: 1, pointBuildings: [microsoft]}).heightLabel, 'ความสูงเป็นค่าประมาณจากแหล่งข้อมูล');
});

test('store detail renders the footprint source and height status as facts with an official page link', () => {
  const model = realModel(), row = model.rows.find(r => r.brandId === 'SEVEN_ELEVEN'), detail = buildStoreDetail(model, row, model.rows);
  const feature = polygon('msml-one');
  Object.assign(feature.properties, {provider: 'Microsoft', height: 3, heightRole: 'unknown_display_fallback'});
  const fact = buildingFact({total: 1, matched: 1, buildingCount: 1, pointBuildings: [feature]});
  const html = renderStore(detail, {building: fact, buildingReference: {label: 'อาคารของสถานที่ตามชื่อสาขา', state: 'reference'}});
  assert.match(html, /ยังไม่มีความสูงอาคาร/);
  assert.match(html, /แหล่งอาคาร: <a[^>]*href="https:\/\/github.com\/microsoft\/GlobalMLBuildingFootprints"[^>]*>Microsoft<\/a>/);
  assert.match(html, /อาคารสถานที่<\/dt><dd><span>อาคารของสถานที่ตามชื่อสาขา/);
  assert.doesNotMatch(html, /3 ม\.|3 เมตร|\.gz/);
});

test('building layer preserves raw geometry, keeps outline parents flat, switches 2D/3D and honours store click priority', () => {
  const layers = new Map(), sources = new Map(), handlers = new Map(), selected = [];
  const map = {layers, data: null, visibility: {}, filters: {},
    addSource(id) { sources.set(id, {setData: d => { this.data = d; }}); }, getSource: id => sources.get(id),
    addLayer: d => layers.set(d.id, d), getLayer: id => layers.get(id),
    removeLayer: id => layers.delete(id), removeSource: id => sources.delete(id),
    setLayoutProperty(id, key, value) { this.visibility[id] = value; }, setFilter(id, value) { this.filters[id] = value; },
    on: (e, fn) => handlers.set(e, fn), off: e => handlers.delete(e),
    queryRenderedFeatures: () => [{properties: {storeKeys: 'a,b'}}]};
  const overlay = installSpatialBuildings(map, {onSelect: keys => selected.push(keys)});
  const f = polygon('b1'); f.properties.storeKeys = ['a', 'b'];
  const source = JSON.stringify(f);
  overlay.update({type: 'FeatureCollection', features: [f]}, {view3d: true});
  assert.equal(map.data.features[0].properties.storeKeys, 'a,b');
  assert.equal(JSON.stringify(f), source);
  assert.equal(map.visibility[BUILDING_LAYERS.extrusion], 'visible');
  assert.deepEqual(layers.get(BUILDING_LAYERS.extrusion).filter, ['!=', ['get', 'renderAs'], 'outline']);
  assert.deepEqual(map.filters[BUILDING_LAYERS.line], ['==', ['get', 'renderAs'], 'outline']);
  handlers.get('click')({point: {}, originalEvent: {__citymeterHandled: true}});
  assert.equal(selected.length, 0, 'a store dot has already handled this click');
  const event = {point: {}, originalEvent: {}}; handlers.get('click')(event);
  assert.deepEqual(selected, [['a', 'b']]); assert.equal(event.originalEvent.__citymeterHandled, true);
  overlay.update(undefined, {view3d: false});
  assert.equal(map.visibility[BUILDING_LAYERS.extrusion], 'none');
  assert.equal(map.visibility[BUILDING_LAYERS.fill], 'visible');
  assert.equal(map.data.features.length, 0, 'leaving the detail clears the highlight');
  overlay.dispose(); assert.equal(layers.size, 0); assert.equal(sources.size, 0); assert.equal(handlers.size, 0);
});

test('source venue aliases are searchable without renaming or moving any store row', () => {
  const grocery = readJSON('data/grocery.json'), areas = readJSON('data/areas.json');
  const index = grocery.rows.find(r => r[10] >= 0)?.[10]; assert.ok(index >= 0);
  grocery.venues[index][6] = ['prior-alias-for-test'];
  const original = JSON.stringify(grocery.rows);
  const model = buildModel(grocery, areas);
  const matches = filterRows(model.rows, {search: 'prior-alias-for-test'});
  assert.ok(matches.length > 0 && matches.every(r => r.v === index));
  assert.equal(JSON.stringify(grocery.rows), original);
});
