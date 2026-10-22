import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMapStyle, basemapPalette, SOURCE_ID, DATA_FILL_BEFORE, MASSING_BEFORE, FIRST_LINE_LAYER, FIRST_LABEL_LAYER} from '../js/map-style.js';
import {presetFor, CAMERA, DEFAULT_FOV} from '../js/camera.js';
import {focusExpression, storeFeatures, typeColors, STORE_LAYERS, DOT_DETAIL_ZOOM} from '../js/stores-layer.js';
import {FILL_MAX_ZOOM, LABEL_MAX_ZOOM, AREA_LAYERS, bboxOfFeature} from '../js/area-layers.js';
import {realModel} from './helpers.js';

test('generated basemap is a well-formed MapLibre style with the anchor layers the app inserts before', () => {
  for (const theme of ['light', 'dark']) {
    const style = buildMapStyle(theme);
    assert.equal(style.version, 8);
    assert.ok(style.sources[SOURCE_ID]?.url, 'OpenFreeMap TileJSON source');
    assert.ok(style.glyphs.includes('{fontstack}'));
    const ids = style.layers.map(l => l.id);
    assert.equal(new Set(ids).size, ids.length, 'layer ids are unique');
    for (const l of style.layers) if (l.type !== 'background') { assert.equal(l.source, SOURCE_ID); assert.ok(l['source-layer'], `${l.id} names a source-layer`); }
    assert.ok(ids.includes(DATA_FILL_BEFORE) && ids.includes(MASSING_BEFORE));
    const firstLine = style.layers.find(l => l.type === 'line');
    assert.equal(firstLine.id, FIRST_LINE_LAYER, 'data fills sit beneath every line layer');
    const firstSymbol = style.layers.find(l => l.type === 'symbol');
    assert.equal(firstSymbol.id, FIRST_LABEL_LAYER, 'massing sits beneath every label');
    assert.ok(ids.indexOf('building') > ids.indexOf(FIRST_LINE_LAYER), '2D footprints draw above the data fill');
    assert.ok(style.sky && style.light, 'sky/fog quiets the distance; light shades the massing');
    assert.ok(!ids.some(id => /poi|housenumber|boundary/.test(id)), 'no POI, house numbers or admin boundaries');
  }
  const light = basemapPalette('light'), dark = basemapPalette('dark');
  assert.notEqual(light.ground, dark.ground);
  assert.equal(light.ground, '#EEF1EE', 'ground = LDS surface.alt (light)');
  assert.equal(dark.ground, '#11191D', 'ground = LDS surface.canvas (dark)');
});

test('store dots: one feature per row, focus swaps filters only, type colours fall back to the LDS series', () => {
  const m = realModel();
  const fc = storeFeatures(m.rows);
  assert.equal(fc.features.length, 27607);
  const f = fc.features.find(x => x.properties.u1 >= 0);
  assert.ok(f, 'a row in two units carries both unit indexes');
  assert.deepEqual(focusExpression({level: 'all'}), ['all']);
  assert.deepEqual(focusExpression({level: 'none'}), ['any']);
  assert.deepEqual(focusExpression({level: 'province', ids: [0, 10]}), ['in', ['get', 'p'], ['literal', [0, 10]]]);
  assert.deepEqual(focusExpression({level: 'unit', ids: [7]}), ['any', ['in', ['get', 'u0'], ['literal', [7]]], ['in', ['get', 'u1'], ['literal', [7]]]]);
  assert.deepEqual(Object.keys(typeColors()), ['C_STORE', 'SUPERMARKET', 'HYPERMARKET', 'WHOLESALE', 'PHARMACY']);
  assert.equal(typeColors().C_STORE, '#49C0BC', 'outside a browser the fallback is series 7 (light)');
  assert.equal(DOT_DETAIL_ZOOM, 14, 'HTML pins with logos take over at street level');
  assert.equal(STORE_LAYERS.focus, 'stores-focus');
});

test('area layers: fill zoom windows widen with each level and every layer has a hit layer', () => {
  assert.ok(FILL_MAX_ZOOM.province < FILL_MAX_ZOOM.district && FILL_MAX_ZOOM.district < FILL_MAX_ZOOM.unit);
  for (const level of ['province', 'district', 'unit']) {
    assert.ok(LABEL_MAX_ZOOM[level] > FILL_MAX_ZOOM[level]);
    assert.ok(AREA_LAYERS[level].hit && AREA_LAYERS[level].fill && AREA_LAYERS[level].selected);
  }
  assert.deepEqual(bboxOfFeature({geometry: {type: 'Polygon', coordinates: [[[100, 13], [101, 13], [101, 14], [100, 13]]]}}), [100, 13, 101, 14]);
});

test('camera presets: 2D plan, 3D city overview, upright-vertical model close-up and two-point option', () => {
  assert.equal(presetFor({view3d: false, mode: 'detail'}), 'plan');
  assert.equal(presetFor({view3d: true, mode: 'overview'}), 'city');
  assert.equal(presetFor({view3d: true, mode: 'detail'}), 'model');
  assert.equal(presetFor({view3d: true, mode: 'detail', twoPoint: true}), 'eye');
  assert.equal(CAMERA.plan.pitch, 0);
  assert.ok(CAMERA.model.fov < DEFAULT_FOV / 2, 'narrow field of view ≈ axonometric');
  assert.ok(CAMERA.eye.pitch <= 90 - CAMERA.eye.fov / 2 - 2, 'two-point: the horizon stays outside the frame (MapLibre 5.6.2 draws fill-extrusion wrongly once it enters)');
  assert.ok(CAMERA.eye.pitch >= 72 && CAMERA.eye.fov <= 26, 'strongly pitched, narrow field of view → verticals near-parallel');
});
