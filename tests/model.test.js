import test from 'node:test';
import assert from 'node:assert/strict';
import {realModel, readJSON} from './helpers.js';
import {filterRows, perCapita, productionURL, unitName, unitKind, withNoun, districtNoun, unitNoun, hasPoint, brandCount, TYPE_ORDER} from '../js/model.js';

const m = realModel();

test('the model carries every source row, brand, type and area of the snapshot', () => {
  assert.equal(m.rows.length, 27607, 'one row per source point (API aggregate 27,608 minus one aggregate-only record)');
  assert.equal(m.meta.apiTotal, 27608);
  assert.equal(m.brands.length, 17);
  assert.deepEqual(m.types.map(t => t.id), TYPE_ORDER);
  assert.equal(m.provinces.length, 77);
  assert.equal(m.districts.length, 928);
  assert.equal(m.units.length, 8621);
  assert.equal(m.units.filter(u => u.kind === 'L').length, 847, 'Bangkok Locales');
  assert.equal(new Set(m.rows.map(r => r.key)).size, m.rows.length, 'short store keys are unique');
  assert.ok(m.rows.every(hasPoint), 'every row has a usable coordinate');
  assert.ok(m.rows.every(r => m.districts[r.d] && m.provinces[r.p] && r.u.every(i => m.units[i])), 'every index resolves');
  assert.equal(m.rows.filter(r => r.u.length === 2).length, 15, 'rows in two overlapping source units');
  assert.equal(m.rows.filter(r => r.u.length === 0).length, 19, 'Bangkok rows outside every Locale');
  assert.ok(m.rows.filter(r => r.u.length === 0).every(r => m.provinces[r.p].code === '10'));
});

test('area tables link both ways and keep production codes', () => {
  for (const p of m.provinces) assert.ok(m.districtsOf[p.index].length > 0, p.name);
  assert.equal(m.districtsOf.flat().length, 928);
  assert.equal(m.unitsOf.flat().length, 8621);
  assert.equal(m.provinceByAbbr.get('BKK').code, '10');
  assert.equal(m.provinceByAbbr.get('CBI').name, 'ชลบุรี');
  assert.equal(m.districtByCode.get('2001').name, 'เมืองชลบุรี');
  const pattaya = m.units.find(u => u.kind === 'M' && u.prefix === '' && u.name === 'เมืองพัทยา');
  assert.ok(pattaya, 'Pattaya special municipality is a unit');
  assert.equal(m.districts[pattaya.d].code, '2004', 'Pattaya sits in บางละมุง (7-digit DOLA code)');
});

test('filters never mutate rows and combine brand, type and multi-term search', () => {
  const before = JSON.stringify(m.rows.slice(0, 50));
  assert.equal(filterRows(m.rows, {brand: 'MAKRO'}).length, 168);
  assert.equal(filterRows(m.rows, {type: 'PHARMACY'}).length, 150);
  assert.equal(filterRows(m.rows, {brand: 'LOTUSS', type: 'HYPERMARKET'}).length, 226);
  const hits = filterRows(m.rows, {search: 'central world'});
  assert.ok(hits.length >= 1 && hits.every(r => r.text.includes('central') && r.text.includes('world')));
  assert.ok(filterRows(m.rows, {search: 'ชลบุรี'}).length >= 1761, 'province names are searchable');
  assert.equal(filterRows(m.rows, {search: 'zzzz-no-such-store'}).length, 0);
  assert.equal(JSON.stringify(m.rows.slice(0, 50)), before);
});

test('per-capita is stores per 10,000 residents and never invents a zero for an unknown population', () => {
  assert.equal(perCapita(10, 10000), 10);
  assert.equal(perCapita(0, 5000), 0);
  assert.equal(perCapita(5, 0), null);
  assert.equal(perCapita(5, null), null);
  assert.equal(Math.round(perCapita(27607, m.country.pop) * 100) / 100, 4.2);
});

test('names, kinds, nouns and production links follow CityMETER', () => {
  const u = m.units.find(x => x.prefix === 'ทม.' && x.name === 'แสนสุข');
  assert.equal(unitName(u), 'ทม.แสนสุข');
  assert.equal(unitKind(u), 'เทศบาลเมือง');
  const loc = m.units.find(x => x.kind === 'L');
  assert.equal(unitKind(loc), 'ย่าน');
  assert.equal(unitName(loc), loc.name);
  assert.equal(districtNoun(m.provinceByCode.get('10')), 'เขต');
  assert.equal(districtNoun(m.provinceByCode.get('20')), 'อำเภอ');
  assert.equal(unitNoun(m.provinceByCode.get('10')), 'ย่าน');
  assert.equal(unitNoun(m.provinceByCode.get('20')), 'อปท.');
  assert.equal(withNoun('ดูทุก', 'อปท.'), 'ดูทุก อปท.');
  assert.equal(withNoun('ดูทุก', 'อำเภอ'), 'ดูทุกอำเภอ');
  assert.equal(productionURL(m, {}), 'https://landometer.com/v3/citymeter?d=grocery');
  assert.equal(productionURL(m, {province: m.provinceByCode.get('20').index}), 'https://landometer.com/v3/citymeter/CBI?d=grocery');
  assert.match(productionURL(m, {unit: u.index}), /^https:\/\/landometer\.com\/v3\/citymeter\/CBI\/M\/\d{7,8}\?d=grocery$/);
  assert.match(productionURL(m, {unit: loc.index}), /^https:\/\/landometer\.com\/v3\/citymeter\/BKK\/L\/[0-9a-f-]{36}\?d=grocery$/);
  assert.equal(brandCount(m.rows), 17);
});

test('the build receipt reconciles the shipped rows with the production API at every level', () => {
  const r = readJSON('data/build-receipt.json');
  assert.equal(r.checks.country.api, 27608);
  assert.equal(r.checks.country.rows, 27607);
  assert.equal(r.checks.provinces.equal, 76);
  assert.deepEqual(r.checks.provinces.differ, [{code: '84', api: 515, rows: 514}]);
  assert.equal(r.checks.districts.equal, 927);
  assert.deepEqual(r.checks.districts.differ.map(d => d.code), ['8405']);
  assert.equal(r.checks.units.equal, 8621, 'every local unit count equals the API');
  assert.equal(r.checks.populationTotals.country, r.checks.populationTotals.provinces);
  assert.equal(r.checks.populationTotals.country, r.checks.populationTotals.districts);
  assert.match(r.inputs.sheetXlsx.sha256, /^[a-f0-9]{64}$/);
});
