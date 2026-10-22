import test from 'node:test';
import assert from 'node:assert/strict';
import {realModel} from './helpers.js';
import {buildRankingModel, buildMatrixModel} from '../js/chart-model.js';
import {normalizeSelection, NO_SELECTION} from '../js/hierarchy.js';
import {filterRows} from '../js/model.js';

const m = realModel();

test('ranking shares: stores and residents of the compared children each sum to 100%', () => {
  const r = buildRankingModel(m, m.rows, NO_SELECTION, 'count');
  assert.equal(r.level, 'province');
  assert.equal(r.children.length, 77);
  assert.equal(r.total, 27607);
  assert.ok(Math.abs(r.children.reduce((s, c) => s + c.storeShare, 0) - 100) < 1e-9);
  assert.ok(Math.abs(r.children.reduce((s, c) => s + c.popShare, 0) - 100) < 1e-9);
  assert.equal(r.children[0].area.code, '10');
  assert.equal(r.children[0].rank, 1);
  const capita = buildRankingModel(m, m.rows, NO_SELECTION, 'capita');
  assert.equal(capita.children[0].area.code, '83', 'Phuket leads stores per 10,000 residents');
});

test('ranking omits population shares when a compared unit has no population', () => {
  const r = buildRankingModel(m, m.rows, normalizeSelection(m, {district: m.districtByCode.get('1002').index}), 'count');
  assert.equal(r.popComplete, false);
  assert.ok(r.children.every(c => c.popShare === null));
});

test('units straddling a district border keep their full count; shares use only the district\'s own stores', () => {
  const sel = normalizeSelection(m, {district: m.districtByCode.get('2007').index});
  const r = buildRankingModel(m, m.rows, sel, 'count');
  const lc = r.children.find(c => c.name === 'ทน.แหลมฉบัง');
  assert.equal(lc.count, 152);
  assert.ok(Math.abs(lc.storeShare - (130 / r.total) * 100) < 1e-9);
  const types = buildMatrixModel(m, m.rows, sel, 'types', {areaLimit: 20});
  const row = types.areas.find(a => a.name === 'ทน.แหลมฉบัง');
  assert.equal(types.cells.filter(c => c.areaIndex === row.index).reduce((s, c) => s + c.count, 0), 152);
});

test('type and brand matrices count every store of the shown children exactly once per column', () => {
  const sel = {province: m.provinceByCode.get('20').index, district: -1, unit: -1};
  const types = buildMatrixModel(m, m.rows, sel, 'types', {areaLimit: 20});
  for (const a of types.areas) assert.equal(types.cells.filter(c => c.areaIndex === a.index).reduce((s, c) => s + c.count, 0), a.count, a.name);
  assert.ok(types.cols.length <= 5 && types.cols.every(c => c.count > 0));
  const brands = buildMatrixModel(m, m.rows, sel, 'brands', {areaLimit: 12, columnLimit: 8});
  assert.ok(brands.cols.length <= 8);
  assert.equal(brands.cols[0].key, 'SEVEN_ELEVEN');
  const empty = buildMatrixModel(m, filterRows(m.rows, {search: 'zzzz-none'}), sel, 'types');
  assert.equal(empty.areas.length, 0);
});
