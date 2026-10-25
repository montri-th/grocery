import test from 'node:test';
import assert from 'node:assert/strict';
import {readJSON} from './helpers.js';
import {buildModel, filterRows, brandCount} from '../js/model.js';
import {buildStoreDetail} from '../js/profile-model.js';
import {configureBrandLogos, getBrandLogo, getFormatLogo} from '../js/brand-logos.js?v=20261025-fp2';

const grocery = readJSON('data/grocery.json'), areas = readJSON('data/areas.json'), refresh = readJSON('data/retail-refresh.json');
const expected = {
  '15069': {lat: 13.74584843, lon: 100.5000923, district: '1001', unit: 'b3221f7e-f41c-43b0-b8b9-24e9ba4884de'},
  '15070': {lat: 13.74268075, lon: 100.5489759, district: '1007', unit: '23b4b88f-a1ac-4a41-a3e8-3253bddc3547'},
  '15073': {lat: 13.666999737741738, lon: 100.64690561279112, district: '1047', unit: '7430567c-5878-422e-97ba-2dbad5f0d9fe'},
  '15066': {lat: 13.85787881, lon: 100.5370458, district: '1201', unit: null},
  '15068': {lat: 13.727357, lon: 100.546693, district: '1007', unit: 'b252deaa-c659-4b80-8672-a53ceca7f1bb'},
};

test('shipped retail overlay keeps all source point facts and API totals while adding five official observations once', () => {
  const before = JSON.stringify({grocery, areas, refresh}), model = buildModel(grocery, areas, refresh);
  assert.equal(model.rows.length, 27612); assert.equal(model.sourceRows.length, 27607);
  assert.equal(new Set(model.rows.map(r => r.key)).size, 27612);
  assert.equal(model.meta.apiTotal, 27608); assert.equal(model.sourceMeta.pointRows, 27607);
  assert.equal(model.meta.supplementalPointRows, 5); assert.equal(brandCount(model.rows), 17);
  assert.equal(filterRows(model.rows, {brand: 'BIG_C'}).length, 1749);
  assert.equal(filterRows(model.rows, {format: 'BIG_C_FOODPLACE'}).length, 17);
  assert.equal(model.brandById.get('BIG_C').api, 1744);
  assert.equal(refresh.existing.length, 13); assert.equal(refresh.supplemental.length, 5);
  for (const raw of grocery.rows) {
    const row = model.rowByKey.get(raw[0]), source = row.sourceFacts;
    assert.equal(row.b, raw[1]); assert.equal(row.t, raw[2]); assert.equal(row.name, raw[4]);
    assert.equal(row.lon, raw[5]); assert.equal(row.lat, raw[6]); assert.equal(row.d, raw[7]); assert.equal(row.s, raw[9]);
    assert.deepEqual(row.u, Array.isArray(raw[8]) ? raw[8] : raw[8] >= 0 ? [raw[8]] : []);
    assert.equal(source.formatIndex, raw[3]); assert.equal(source.venueIndex, raw[10] ?? -1); assert.equal(source.flags, raw[11] || 0);
  }
  assert.equal(JSON.stringify({grocery, areas, refresh}), before);
});

test('shipped supplemental points match official coordinate checkpoints and reviewed admin IDs without copying venue centroids', () => {
  const model = buildModel(grocery, areas, refresh);
  assert.deepEqual(refresh.supplemental.map(r => r.sourceId).sort(), Object.keys(expected).sort());
  for (const [id, gold] of Object.entries(expected)) {
    const row = model.rowByKey.get(`bigc-official-${id}`), item = refresh.supplemental.find(r => r.sourceId === id);
    assert.equal(row.lon, gold.lon); assert.equal(row.lat, gold.lat);
    assert.equal(model.districts[row.d].code, gold.district);
    assert.deepEqual(row.u.map(i => model.units[i].key), gold.unit ? [gold.unit] : []);
    assert.match(row.administrativeEvidence.method, /inferred supplemental membership/);
    assert.equal(row.localDetail.sourceRecordId, id);
    assert.equal(row.localDetail.uuid, item.detail.officialBranchUUID, 'display the actual branch UUID, not a fabricated Grocery UUID');
    assert.equal(row.refresh.evidence.contactStatusType, item.detail.sourceContactStatus);
  }
  const mahatun = buildStoreDetail(model, model.rowByKey.get('bigc-official-15070'), model.rows);
  assert.equal(mahatun.status.label, 'รอยืนยันสถานะสาขา'); assert.equal(mahatun.geometry.level, 'official');
  assert.equal(model.rowByKey.get('bigc-official-15073').localDetail.address, null);
  const one = model.rowByKey.get('bigc-official-15068');
  assert.equal(model.formats[one.format], 'Big C Foodplace · Bangkok Marché');
  assert.equal(one.v, model.venues.find(v => v.id === 'GV-a6836f91efc61a13').index);
  const mini = model.rowByKey.get('9f9a188a');
  assert.equal(model.formats[mini.format], 'Big C Mini'); assert.equal(mini.type, 'C_STORE');
  assert.equal(mini.refresh.evidence.decision, 'excluded_mini_confirmed');
  assert.equal(mini.formatFamilyId, undefined); assert.equal(mini.formatLogoKey, undefined);
  assert.deepEqual([mini.lon, mini.lat], [100.50825, 13.74097]);
  assert.equal(model.rowByKey.get('c1901a70').brandId, 'PURE');
  assert.equal(model.rowByKey.get('29055ba4').brandId, 'SEVEN_ELEVEN');
});

test('shipped format/logo registry uses one Big C parent brand and one Foodplace format identity', () => {
  const catalog = readJSON('data/brand-logos.json'), model = buildModel(grocery, areas, refresh);
  const coverage = configureBrandLogos(catalog, model.brands.map(b => b.name));
  assert.equal(coverage.complete, true); assert.equal(catalog.brands.length, grocery.brands.length);
  assert.equal(model.brands.length, 17); assert.equal(model.brandById.has('BIG_C_FOODPLACE'), false);
  assert.equal(getBrandLogo('Big C Foodplace'), null);
  assert.equal(getFormatLogo('BIG_C_FOODPLACE').parentBrandId, 'BIG_C');
  assert.ok(filterRows(model.rows, {format: 'BIG_C_FOODPLACE'}).every(r => r.formatLogoKey === 'BIG_C_FOODPLACE' && r.brandId === 'BIG_C'));
  assert.equal(model.formatOptions.filter(f => f.id === 'BIG_C_FOODPLACE').length, 1);
});
