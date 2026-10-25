import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readJSON} from './helpers.js';
import {buildModel, filterRows, brandCount} from '../js/model.js';
import {buildStoreDetail, describeStatus, describeGeometry, brandMix} from '../js/profile-model.js';
import {renderStore, renderOverview, renderFilterChips} from '../js/panel.js';
import {configureBrandLogos} from '../js/brand-logos.js?v=20261025-fp2';

const grocery = readJSON('data/grocery.json'), areas = readJSON('data/areas.json');
const fixture = readJSON('tests/fixtures/retail-refresh.json');
const copy = value => JSON.parse(JSON.stringify(value));
const build = (refresh = fixture) => buildModel(grocery, areas, refresh);

test('format refresh preserves every original row, brand index, coordinate, membership and API/source fact', () => {
  const before = JSON.stringify({grocery, areas, fixture}), model = build();
  assert.equal(model.rows.length, 27612); assert.equal(model.sourceRows.length, 27607);
  assert.equal(model.meta.apiTotal, 27608); assert.equal(model.meta.sourcePointRows, 27607); assert.equal(model.meta.supplementalPointRows, 5);
  assert.equal(model.meta.pointRows, 27612); assert.deepEqual(model.sourceMeta, grocery.meta);
  assert.equal(model.brands.length, 17); assert.equal(brandCount(model.rows), 17);
  assert.equal(model.brandById.has('BIG_C_FOODPLACE'), false, 'Foodplace is a format, not an eighteenth brand');
  assert.deepEqual(model.brands.map(({index, ...brand}) => brand), grocery.brands);
  for (const raw of grocery.rows) {
    const row = model.rowByKey.get(raw[0]), source = row.sourceFacts;
    const unit = Array.isArray(raw[8]) ? raw[8] : raw[8] >= 0 ? [raw[8]] : [];
    assert.equal(row.b, raw[1]); assert.equal(source.brandIndex, raw[1]);
    assert.equal(row.t, raw[2]); assert.equal(source.typeIndex, raw[2]); assert.equal(source.formatIndex, raw[3]);
    assert.equal(row.name, raw[4]); assert.equal(row.lon, raw[5]); assert.equal(row.lat, raw[6]);
    assert.equal(source.longitude, raw[5]); assert.equal(source.latitude, raw[6]);
    assert.equal(row.d, raw[7]); assert.deepEqual(row.u, unit); assert.deepEqual(source.unitIndexes, unit);
    assert.equal(row.s, raw[9]); assert.equal(source.sourceIndex, raw[9]); assert.equal(source.flags, raw[11] || 0);
  }
  assert.equal(JSON.stringify({grocery, areas, fixture}), before, 'no raw input or refresh observation is rewritten');
});

test('twelve existing rows plus five unique official rows form one Foodplace family under BIG_C', () => {
  const model = build(), family = filterRows(model.rows, {format: 'BIG_C_FOODPLACE'});
  assert.equal(family.length, 17); assert.equal(new Set(family.map(r => r.key)).size, 17);
  assert.equal(family.filter(r => r.supplemental).length, 5);
  assert.ok(family.every(r => r.brandId === 'BIG_C' && r.formatLogoKey === 'BIG_C_FOODPLACE'));
  assert.equal(filterRows(model.rows, {brand: 'BIG_C'}).length, 1749);
  assert.equal(filterRows(model.rows, {brand: 'BIG_C', format: 'BIG_C_FOODPLACE', type: 'SUPERMARKET'}).length, 17);
  assert.equal(model.brandById.get('BIG_C').api, 1744); assert.equal(model.brandById.get('BIG_C').points, 1744, 'source metadata remains the original count');
  assert.deepEqual(model.retailRefresh.parentGroups, [{id: 'BIG_C', sourceRows: 1744, supplementalRows: 5, displayedRows: 1749}]);
  assert.equal(brandMix(model, model.rows).reduce((sum, b) => sum + b.count, 0), 27612);
  const march = model.rowByKey.get('bigc-official-15068');
  assert.equal(model.formats[march.format], 'Big C Foodplace · Bangkok Marché');
  assert.equal(filterRows(model.rows, {search: 'Bangkok Marche'}).length, 1, 'alias names the same One Bangkok observation');
  assert.equal(filterRows(model.rows, {search: 'Foodplace'}).length, 17, 'format is indexed even when absent from the branch label');
  assert.equal(model.formatOptions.filter(f => f.id === 'BIG_C_FOODPLACE').length, 1);
  assert.equal(filterRows(model.rows, {format: `format-${grocery.formats.indexOf('Big C Market')}`}).length, 45);
  assert.equal(filterRows(model.rows, {format: `format-${grocery.formats.indexOf('Big C Mini')}`}).length, 1524);
  assert.equal(model.rowByKey.get('9f9a188a').formatFamilyId, undefined, 'Yaowarat Mini is not silently converted');
  assert.equal(model.rowByKey.get('c1901a70').brandId, 'PURE', 'Pure One Bangkok remains a separate pharmacy row');
});

test('official coordinates and branch/contact identities stay separate; missing local-unit coverage remains empty', () => {
  const model = build();
  for (const item of fixture.supplemental) {
    const row = model.rowByKey.get(item.key);
    assert.equal(row.lon, item.longitude); assert.equal(row.lat, item.latitude);
    assert.equal(row.coordinateRole, item.coordinateRole); assert.equal(row.sourceFacts.sourceId, item.sourceId);
    assert.equal(row.refresh.evidence.officialBranchUUID, item.evidence.officialBranchUUID);
    assert.equal(row.refresh.evidence.contactRecordUUID, item.evidence.contactRecordUUID);
    assert.notEqual(row.refresh.evidence.officialBranchUUID, row.refresh.evidence.contactRecordUUID);
    assert.equal(model.districts[row.d].code, item.districtCode);
    assert.deepEqual(row.u.map(i => model.units[i].key), item.unitKeys);
  }
  assert.deepEqual(model.rowByKey.get('bigc-official-15066').u, [], 'Pantip does not inherit a nearest local unit');
  assert.equal(model.rowByKey.get('bigc-official-15073').localDetail.address, null, 'PARC missing directory address is retained');
});

test('refresh fails closed on duplicate identities, source changes, fabricated brand or unsupported admin links', () => {
  const cases = [
    [r => r.existing.push(copy(r.existing[0])), /duplicate source-row/],
    [r => { r.existing[0].sourceOutletId = '00000000-0000-0000-0000-000000000000'; }, /UUID/],
    [r => { r.existing[0].expectedSourceFormat = 'Big C Mini'; }, /identity guard/],
    [r => { r.existing[0].latitude = 13.7; }, /cannot change source location/],
    [r => { r.existing[0].brandId = 'TOPS'; }, /cannot change source brand/],
    [r => r.brands.push({id: 'BIG_C_FOODPLACE'}), /preserve the source brand registry/],
    [r => r.supplemental.push(copy(r.supplemental[0])), /supplemental map key/],
    [r => { r.supplemental[1].sourceId = r.supplemental[0].sourceId; }, /duplicate supplemental source/],
    [r => { r.existing[0].evidence.branchCode = r.supplemental[0].sourceId; }, /duplicate official outlet/],
    [r => { r.supplemental[0].unitKeys = ['nearest-invented-unit']; }, /administrative mapping/],
    [r => { r.supplemental[0].longitude = null; }, /source point/],
    [r => { r.supplemental[0].evidence.checkedOn = ''; }, /dated source evidence/],
  ];
  for (const [change, expected] of cases) {
    const bad = copy(fixture); change(bad); assert.throws(() => build(bad), expected);
  }
});

test('Mahatun inactive contact state is review-only; supplemental geometry/source detail never claims a Grocery tile', () => {
  const model = build(); configureBrandLogos(readJSON('data/brand-logos.json'));
  const row = model.rowByKey.get('bigc-official-15070'), detail = buildStoreDetail(model, row, model.rows);
  assert.equal(describeStatus(row).label, 'รอยืนยันสถานะสาขา');
  assert.equal(describeStatus(row).detail, 'ระบบติดต่อระบุ inactive; ไม่ได้ยืนยันว่าปิด');
  assert.equal(describeGeometry(model, row).level, 'official'); assert.equal(detail.production, '');
  const html = renderStore(detail, {detail: row.localDetail});
  assert.match(html, /ระบบติดต่อระบุ inactive; ไม่ได้ยืนยันว่าปิด/);
  assert.match(html, /พิกัดจากทำเนียบสาขาของแบรนด์/);
  assert.doesNotMatch(html, /tile ต้นทาง|ดูใน CityMETER|ปิดถาวร|กำลังโหลดที่อยู่/);
  const normal = model.rowByKey.get('bigc-official-15069');
  assert.doesNotMatch(renderStore(buildStoreDetail(model, normal, model.rows), {detail: normal.localDetail}), /รอยืนยันสถานะสาขา/);
  const priorMarket = model.rowByKey.get('9335bd72');
  assert.equal(priorMarket.sourceFacts.format, 'Big C Market');
  assert.match(renderStore(buildStoreDetail(model, priorMarket, model.rows), {detail: {address: 'source address'}}), /รูปแบบในข้อมูลเดิม: Big C Market/);
});

test('supplemental detail is local and cannot issue a request with a nonexistent Grocery UUID', () => {
  const model = build(), app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function loadStoreDetail('), end = app.indexOf('function renderMapAha()', start);
  assert.ok(start >= 0 && end > start);
  const state = {}; let calls = 0;
  const context = vm.createContext({state, M: () => model, loadProvinceDetail() { calls++; throw new Error('wrong source request'); }});
  vm.runInContext(app.slice(start, end) + '\nglobalThis.loadDetail = loadStoreDetail;', context);
  for (const row of model.rows.filter(r => r.supplemental)) {
    context.loadDetail(row); assert.equal(state.storeDetail.key, row.key); assert.equal(state.storeDetail.value, row.localDetail);
  }
  assert.equal(calls, 0);
  assert.match(app, /const detail = r\.supplemental \? \{key: r\.key, value: r\.localDetail\}/, 'first render uses local address without an async loading placeholder');
  assert.match(app, /for \(const i of \[0, 1, 5\]\)/, 'the tracked refresh file is required, not silently omitted');
});

test('format filter and source-count facts keep the Foodplace family separate from API aggregate totals', () => {
  const model = build(), html = renderOverview({aha: null, summary: {count: model.rows.length, brands: 17}, ranking: [],
    metric: 'count', nouns: {child: 'จังหวัด'}, typeMix: [], brandMix: [], asOf: model.sourceMeta.asOf,
    apiTotal: model.meta.apiTotal, sourcePointRows: model.meta.sourcePointRows, supplementalPointRows: model.meta.supplementalPointRows,
    refreshCheckedOn: model.meta.retailRefreshCheckedOn});
  assert.match(html, /27,607 จุดจาก CityMETER \+ 5 สาขาเพิ่มจากแบรนด์/);
  assert.match(html, /27,608 สาขาตามยอดใน CityMETER/);
  assert.match(renderFilterChips({format: 'BIG_C_FOODPLACE'}, {format: {BIG_C_FOODPLACE: 'Big C Foodplace'}}), /ล้างตัวกรอง Big C Foodplace/);
});
