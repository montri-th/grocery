import test from 'node:test';
import assert from 'node:assert/strict';
import {realModel} from './helpers.js';
import {filterRows} from '../js/model.js';
import {NO_SELECTION, normalizeSelection, levelOf, parentSelection, areaRows, childrenOf, summarizeChildren, rankChildren, buildAha, buildUnitInsight, ahaSize, levelNouns, areaKey} from '../js/hierarchy.js';

const m = realModel();
const P = code => m.provinceByCode.get(code).index;
const D = code => m.districtByCode.get(code).index;

test('selections normalise upwards and levels follow the drill path', () => {
  const unit = m.units.find(u => u.prefix === 'ทม.' && u.name === 'แสนสุข');
  const sel = normalizeSelection(m, {unit: unit.index});
  assert.deepEqual(sel, {province: P('20'), district: D('2001'), unit: unit.index});
  assert.equal(levelOf(sel), 'unit');
  assert.equal(levelOf(parentSelection(sel)), 'district');
  assert.equal(levelOf(parentSelection(parentSelection(sel))), 'province');
  assert.equal(levelOf(parentSelection(parentSelection(parentSelection(sel)))), 'country');
  assert.deepEqual(normalizeSelection(m, {province: 999}), NO_SELECTION);
  assert.deepEqual(normalizeSelection(m, {district: D('1039')}), {province: P('10'), district: D('1039'), unit: -1});
  assert.equal(areaKey(m.provinces[P('10')]), 'BKK');
  assert.equal(areaKey(m.districts[D('1039')]), '1039');
});

test('children cover their parent: provinces sum to the country, districts to their province', () => {
  const country = summarizeChildren(m, m.rows, NO_SELECTION);
  assert.equal(country.length, 77);
  assert.equal(country.reduce((s, c) => s + c.count, 0), 27607);
  assert.equal(country.reduce((s, c) => s + c.pop, 0), m.country.pop);
  for (const code of ['10', '20', '50', '84']) {
    const sel = {province: P(code), district: -1, unit: -1};
    const kids = summarizeChildren(m, m.rows, sel);
    assert.equal(kids.reduce((s, c) => s + c.count, 0), areaRows(m.rows, sel).length, code);
    assert.equal(kids.length, m.districtsOf[P(code)].length);
  }
  // A district's units show their full production count (= API when unfiltered), also for the 25 units whose
  // members partly report a neighbouring district's subdistrict; `inArea` keeps only the district's own stores.
  for (const code of ['2001', '2007', '1049', '2004']) {
    for (const c of summarizeChildren(m, m.rows, normalizeSelection(m, {district: D(code)}))) {
      assert.equal(c.count, c.area.api, `${c.name} = API`);
      assert.ok(c.inArea <= c.count, `${c.name} inArea ≤ count`);
    }
  }
  const siracha = summarizeChildren(m, m.rows, normalizeSelection(m, {district: D('2007')}));
  const laemChabang = siracha.find(c => c.name === 'ทน.แหลมฉบัง');
  assert.deepEqual([laemChabang.count, laemChabang.inArea], [152, 130]);
  const khlongBangKhru = summarizeChildren(m, m.rows, normalizeSelection(m, {district: D('1049')})).find(c => c.name === 'คลองบางครุ');
  assert.equal(khlongBangKhru.count, 5, 'a unit whose members all report a neighbouring subdistrict is not a false zero');
  assert.equal(childrenOf(m, {province: -1, district: -1, unit: 5}).length, 0);
});

test('the country Aha: 30% of stores sit in 3 provinces that hold 13% of residents', () => {
  const a = buildAha(m, m.rows, NO_SELECTION);
  assert.deepEqual(a.top.map(t => t.area.code), ['10', '20', '11']);
  assert.equal(a.topCount, 5310 + 1761 + 1157);
  assert.equal(Math.round(a.share), 30);
  assert.equal(Math.round(a.popShare), 13);
  assert.equal(a.comparison, 'less');
  assert.deepEqual(a.nouns, {child: 'จังหวัด', area: 'ประเทศ', areaName: 'ประเทศไทย'});
});

test('the Aha is recomputed at province and district level, and for any filter', () => {
  const cbi = buildAha(m, m.rows, {province: P('20'), district: -1, unit: -1});
  assert.deepEqual(cbi.top.map(t => t.name), ['บางละมุง', 'ศรีราชา', 'เมืองชลบุรี']);
  assert.equal(Math.round(cbi.share), 79);
  assert.equal(Math.round(cbi.popShare), 63);
  const watthana = buildAha(m, m.rows, normalizeSelection(m, {district: D('1039')}));
  assert.equal(watthana.nouns.child, 'ย่าน');
  assert.equal(watthana.nouns.area, 'เขต');
  assert.equal(Math.round(watthana.share), 38);
  assert.equal(Math.round(watthana.popShare), 16);
  const makro = buildAha(m, filterRows(m.rows, {brand: 'MAKRO'}), NO_SELECTION);
  assert.equal(makro.total, 168);
  assert.equal(makro.top[0].area.code, '10');
  // Small comparison sets name fewer areas: 3 districts → the single top district.
  assert.equal(ahaSize(3), 1); assert.equal(ahaSize(4), 2); assert.equal(ahaSize(9), 3);
  const sks = buildAha(m, m.rows, {province: P('75'), district: -1, unit: -1});
  assert.equal(sks.k, 1);
  assert.equal(buildAha(m, m.rows, normalizeSelection(m, {unit: 0})), null, 'no Aha at the leaf level');
});

test('stores in two overlapping units count once in the Aha share (union), while each unit keeps its production count', () => {
  // Three source rows sit in two overlapping Locales of บางเขน (1005); 9 more sit in a Bangkok Locale and a
  // Samut Prakan municipality at the province edge; two อปท. named คลองไผ่ overlap in สีคิ้ว.
  const twice = m.rows.filter(r => r.u.length === 2);
  assert.equal(twice.length, 15);
  const sel = normalizeSelection(m, {district: D('1005')});
  const rows = twice.filter(r => r.d === D('1005'));
  const a = buildAha(m, rows, sel);
  assert.equal(a.top.length, 2);
  assert.deepEqual(a.top.map(t => t.count), [3, 3], 'each unit counts the shared stores, like production');
  assert.equal(a.topCount, 3, 'the share counts each store once');
  assert.equal(a.share, 100);
});

test('population comparison appears only when every compared area has a registered population', () => {
  const dusit = buildAha(m, m.rows, normalizeSelection(m, {district: D('1002')}));
  assert.equal(dusit.popComplete, false);
  assert.equal(dusit.popShare, null);
  assert.equal(dusit.comparison, null);
  assert.ok(dusit.missingPopulation >= 1);
});

test('ranking by per-capita puts areas without population last; the unit insight compares with its district', () => {
  const kids = summarizeChildren(m, m.rows, normalizeSelection(m, {district: D('1002')}));
  const ranked = rankChildren(kids, 'capita');
  const firstMissing = ranked.findIndex(c => c.perCapita == null);
  assert.ok(firstMissing > 0 && ranked.slice(firstMissing).every(c => c.perCapita == null));
  const unit = m.units.find(u => u.prefix === 'ทม.' && u.name === 'แสนสุข');
  const ins = buildUnitInsight(m, m.rows, normalizeSelection(m, {unit: unit.index}));
  assert.equal(ins.count, unit.api, 'the unit counts its source members (= API)');
  assert.equal(ins.rank, 1);
  assert.ok(ins.ratio > 1.5 && ins.ratio < 2.1);
  assert.equal(levelNouns(m, normalizeSelection(m, {unit: unit.index})).areaName, 'ทม.แสนสุข');
});
