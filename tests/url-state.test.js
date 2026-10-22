import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {realModel} from './helpers.js';
import {NO_SELECTION, normalizeSelection, areaRows} from '../js/hierarchy.js';
import {filterRows, hasPoint} from '../js/model.js';
import {buildBreadcrumb} from '../js/breadcrumb.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function productionFunction(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return app.slice(a, b);
}

function restore(search, model = realModel()) {
  const state = {filters: {search: '', brand: '', type: ''}, sel: {...NO_SELECTION}, panel: {mode: 'overview', id: ''}};
  const inputs = new Map(['search', 'brand', 'type'].map(id => [id, {}]));
  const context = vm.createContext({state, location: {search}, URLSearchParams, M: () => model,
    NO_SELECTION, normalizeSelection, filterRows, hasPoint, FIELDS: ['search', 'brand', 'type'],
    rowByKey: key => model.rowByKey.get(key), $: id => inputs.get(id)});
  vm.runInContext([
    productionFunction('function restoreFromURL()', '/* ---------- theme ---------- */'),
    productionFunction('function storeSelection(', 'function computeFocus()'),
    'restoreFromURL();',
  ].join('\n'), context, {filename: 'production-app-url-restore.js'});
  return state;
}

test('a direct Megabangna URL restores its source administrative path and local comparison scope', () => {
  const model = realModel(), before = JSON.stringify(model.rows);
  for (const suffix of ['', '&province=INVALID', '&province=BKK']) {
    const state = restore(`?place=GV-9e1d3c678f9b9ae0${suffix}`);
    const venue = model.venues[state.panel.id];
    assert.equal(state.panel.mode, 'venue'); assert.equal(venue.name, 'Megabangna');
    assert.equal(model.provinces[state.sel.province].code, '11');
    assert.equal(model.districts[state.sel.district].code, '1103');
    assert.equal(model.units[state.sel.unit].key, '04110302');
    assert.deepEqual(buildBreadcrumb(model, state.sel, venue).map(c => c.level), ['country', 'province', 'district', 'unit', 'venue']);
    const scope = areaRows(model.rows, state.sel);
    assert.ok(scope.length > 0 && scope.length < model.rows.length, 'comparison starts in the member area, not the country');
  }
  assert.equal(JSON.stringify(model.rows), before, 'restoring a URL cannot alter store coordinates or source memberships');
});

test('venue URL restoration uses the same filtered, point-first member choice as selecting a venue', () => {
  const model = realModel(), venue = model.venues.find(v => v.id === 'GV-9e1d3c678f9b9ae0');
  const first = model.rows.find(r => r.v === venue.index);
  const other = model.rows.find(r => r.p !== first.p && r.brandId !== first.brandId && hasPoint(r));
  const fixture = {...model, rows: [{...first, lat: null}, {...other, v: venue.index}]};
  const pointed = restore(`?place=${venue.id}`, fixture);
  assert.deepEqual(pointed.sel, normalizeSelection(model, other.u.length ? {unit: other.u[0]} : {district: other.d}));
  const filtered = restore(`?place=${venue.id}&brand=${first.brandId}`, fixture);
  assert.deepEqual(filtered.sel, normalizeSelection(model, {unit: first.u[0]}), 'the remaining filtered member is used even if its point is missing');
});
