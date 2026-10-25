import test from 'node:test';
import assert from 'node:assert/strict';
import {readJSON} from './helpers.js';
import {buildModel, brandCount, filterRows} from '../js/model.js';
import {buildStoreDetail, describeStatus, readHostLocationEvidence} from '../js/profile-model.js';
import {esc, renderStore} from '../js/panel.js';

const grocery = readJSON('data/grocery.json'), areas = readJSON('data/areas.json');
const refresh = readJSON('data/retail-refresh.json');
const copy = value => JSON.parse(JSON.stringify(value));
const key = 'bigc-official-15073';
const evidence = {
  kind: 'owner_reported_host_location', selectedStoreFloor: 'Ground', hostBuildingUse: 'parking_building',
  ownerReportedStoreys: 3, checkedOn: '2026-10-25',
  sourceURL: 'https://maps.app.goo.gl/JDaMRUZfW2wBfVhZ9',
  sourceImageSHA256: '868226fa696bdd186b59d1cf0d89d402df8918432fe373e819be18e1556ed98f',
};
// Start from the actual PARC source record, whether the observation has been merged yet or not.
const baselineRefresh = copy(refresh);
delete baselineRefresh.supplemental.find(item => item.key === key).detail.hostLocationEvidence;
const baseline = buildModel(grocery, areas, baselineRefresh), baselineRow = baseline.rowByKey.get(key);
function detailFor(value) {
  const row = {...baselineRow, localDetail: {...baselineRow.localDetail, hostLocationEvidence: value}};
  return buildStoreDetail(baseline, row, baseline.rows);
}
const htmlFor = value => {
  const detail = detailFor(value);
  return renderStore(detail, {detail: detail.row.localDetail});
};

test('PARC owner floor and parking-building fact is dated, qualified and separate from the missing source address', () => {
  const detail = detailFor(evidence), html = htmlFor(evidence);
  assert.deepEqual(detail.hostLocationEvidence, evidence);
  assert.ok(Object.isFrozen(detail.hostLocationEvidence));
  assert.ok(html.includes('<dt>ชั้นและอาคาร</dt><dd title="ชั้นร้านและจำนวนชั้นอาคารตามข้อมูลผู้ใช้">Ground · อาคารจอดรถ 3 ชั้น<br><span class="hint"><a class="source-link" href="https://maps.app.goo.gl/JDaMRUZfW2wBfVhZ9" target="_blank" rel="noopener">ข้อมูลผู้ใช้</a> · 25 ต.ค. 2569</span></dd>'));
  assert.equal(detail.row.localDetail.address, null);
  assert.equal(detail.row.localDetail.unitFloor, '');
  assert.match(html, /แหล่งข้อมูลไม่ระบุที่อยู่/);
  assert.deepEqual(detail.status, describeStatus(baselineRow));
  assert.equal(detail.hostLocationEvidence.measuredHeightM, undefined);
  assert.equal(detail.hostLocationEvidence.height, undefined);
  assert.doesNotMatch(html, /9\s*(?:m|เมตร)|ความสูง|ยืนยันว่าเปิด|เปิดให้บริการแล้ว/);
});

test('owner evidence cannot replace raw floor fields, add a height, move the selected point or inject markup', () => {
  const value = {...evidence, sourceURL: `${evidence.sourceURL}?from=a&to=b#"><script>alert(1)</script>`,
    unitFloor: 'Ground', measuredHeightM: 9, height: 9, longitude: 100.6477432, latitude: 13.6671705,
    label: '<img src=x onerror="alert(1)">', operatingStatus: 'open'};
  for (const unitFloor of ['', null, 'directory floor']) {
    const row = {...baselineRow, localDetail: {...baselineRow.localDetail, unitFloor, hostLocationEvidence: value}};
    const detail = buildStoreDetail(baseline, row, baseline.rows), html = renderStore(detail, {detail: row.localDetail});
    assert.equal(row.localDetail.unitFloor, unitFloor);
    assert.equal(detail.row.lon, baselineRow.lon); assert.equal(detail.row.lat, baselineRow.lat);
    assert.notEqual(detail.row.lon, 100.6477432); assert.notEqual(detail.row.lat, 13.6671705);
    assert.equal(detail.hostLocationEvidence.measuredHeightM, undefined);
    assert.equal(detail.hostLocationEvidence.unitFloor, undefined);
    assert.equal(detail.hostLocationEvidence.operatingStatus, undefined);
    assert.ok(html.includes(`href="${esc(new URL(value.sourceURL).href)}"`));
    assert.match(html, /from=a&amp;to=b/);
    assert.doesNotMatch(html, /<script>|<img src=x|onerror=|9\s*(?:m|เมตร)|ยืนยันว่าเปิด/);
  }
});

test('host observations require the supported kind, typed floor/use/storeys, real date, public HTTPS source and image hash', () => {
  const invalid = [undefined, null, {}, {...evidence, kind: 'field_verified_building'},
    {...evidence, selectedStoreFloor: 'Ground<script>'}, {...evidence, hostBuildingUse: 'office'},
    ...[0, -1, 3.5, '3', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(ownerReportedStoreys => ({...evidence, ownerReportedStoreys})),
    ...['2026-02-29', '2026-04-31', '2026-10-25T00:00:00Z', '', null].map(checkedOn => ({...evidence, checkedOn})),
    ...['http://maps.app.goo.gl/abc', 'javascript:alert(1)', '//maps.app.goo.gl/abc',
      ['https://user:secret', 'maps.app.goo.gl/abc'].join('@'), 'https://localhost/abc', 'https://service.internal/abc',
      'https://127.0.0.1/abc', 'https://[::1]/abc', ['https:', '', 'drive.google.com', 'file/d/private/view'].join('/')]
      .map(sourceURL => ({...evidence, sourceURL})),
    ...['', null, 'not-a-hash', 'a'.repeat(63)].map(sourceImageSHA256 => ({...evidence, sourceImageSHA256})),
  ];
  for (const value of invalid) {
    assert.equal(readHostLocationEvidence(value), null);
    assert.equal(detailFor(value).hostLocationEvidence, null);
    assert.doesNotMatch(htmlFor(value), /ชั้นและอาคาร|อาคารจอดรถ 3 ชั้น|ข้อมูลผู้ใช้/);
  }
  assert.equal(readHostLocationEvidence({...evidence, sourceImageSHA256: evidence.sourceImageSHA256.toUpperCase()}).sourceImageSHA256, evidence.sourceImageSHA256);
});

test('renderer revalidates host evidence and no other row gains the PARC owner fact', () => {
  const detail = detailFor(evidence);
  assert.doesNotMatch(renderStore({...detail, hostLocationEvidence: {...evidence, ownerReportedStoreys: '3'}}, {detail: detail.row.localDetail}), /ชั้นและอาคาร/);
  for (const row of baseline.rows.filter(row => row.supplemental && row.key !== key)) {
    const other = buildStoreDetail(baseline, row, baseline.rows);
    assert.equal(other.hostLocationEvidence, null);
    assert.doesNotMatch(renderStore(other, {detail: row.localDetail}), /ชั้นและอาคาร|ข้อมูลผู้ใช้/);
  }
  const sourceRow = {...baseline.rowByKey.get('9335bd72'), localDetail: {hostLocationEvidence: evidence}};
  const sourceDetail = buildStoreDetail(baseline, sourceRow, baseline.rows);
  assert.equal(sourceDetail.hostLocationEvidence, null);
  assert.doesNotMatch(renderStore({...sourceDetail, hostLocationEvidence: evidence}, {detail: sourceRow.localDetail}), /ชั้นและอาคาร|ข้อมูลผู้ใช้/);
});

test('merging owner evidence leaves all row identities, points, source fields, counts and operation status unchanged', () => {
  const inputBefore = JSON.stringify({grocery, areas, refresh}), augmented = copy(baselineRefresh);
  const raw = augmented.supplemental.find(item => item.key === key);
  assert.equal(raw.detail.address, null); assert.equal(raw.detail.unitFloor, '');
  raw.detail.hostLocationEvidence = copy(evidence);
  const model = buildModel(grocery, areas, augmented), row = model.rowByKey.get(key);
  assert.equal(model.rows.length, 27612); assert.equal(model.sourceRows.length, 27607);
  assert.equal(model.brands.length, 17); assert.equal(brandCount(model.rows), 17);
  assert.equal(filterRows(model.rows, {format: 'BIG_C_FOODPLACE'}).length, 17);
  assert.deepEqual(model.meta, baseline.meta); assert.deepEqual(model.sourceMeta, baseline.sourceMeta);
  assert.deepEqual(model.brands, baseline.brands);
  assert.deepEqual(model.rows.filter(row => row.key !== key), baseline.rows.filter(row => row.key !== key));
  assert.deepEqual({...row, localDetail: null}, {...baselineRow, localDetail: null});
  const {hostLocationEvidence, ...rawDetail} = row.localDetail;
  assert.deepEqual(rawDetail, baselineRow.localDetail); assert.deepEqual(hostLocationEvidence, evidence);
  assert.equal(row.lon, 100.64690561279112); assert.equal(row.lat, 13.666999737741738);
  assert.equal(row.localDetail.operatingStatus, 'not_revalidated');
  assert.deepEqual(describeStatus(row), describeStatus(baselineRow));
  assert.equal(JSON.stringify({grocery, areas, refresh}), inputBefore);
});
