import test from 'node:test';
import assert from 'node:assert/strict';
import {readJSON} from './helpers.js';
import {buildModel, brandCount} from '../js/model.js';
import {buildStoreDetail, describeStatus, readOperationalEvidence} from '../js/profile-model.js';
import {esc, renderStore} from '../js/panel.js';

const grocery = readJSON('data/grocery.json'), areas = readJSON('data/areas.json');
const fixture = readJSON('tests/fixtures/retail-refresh.json');
const copy = value => JSON.parse(JSON.stringify(value));
const key = 'bigc-official-15070';
const observation = {
  kind: 'employer_recruitment_listing',
  url: 'https://www.jobthai.com/th/company/job/1644838',
  sourcePublishedOn: '2026-10-22',
};
const baseline = buildModel(grocery, areas, fixture);
const baselineRow = baseline.rowByKey.get(key);
function detailFor(evidence) {
  const row = {...baselineRow, localDetail: {...baselineRow.localDetail, operationalEvidence: evidence}};
  return buildStoreDetail(baseline, row, baseline.rows);
}
const htmlFor = evidence => {
  const detail = detailFor(evidence);
  return renderStore(detail, {detail: detail.row.localDetail});
};

test('Mahatun latest activity displays the dated employer source without promoting the status', () => {
  const detail = detailFor(observation), html = htmlFor(observation);
  assert.deepEqual(detail.operationalEvidence, observation);
  assert.ok(Object.isFrozen(detail.operationalEvidence));
  assert.ok(html.includes('<dt>กิจกรรมล่าสุด</dt><dd title="ประกาศรับสมัครของนายจ้าง ไม่ใช่การตรวจยืนยันการเปิดหน้าร้าน"><a class="source-link" href="https://www.jobthai.com/th/company/job/1644838" target="_blank" rel="noopener">รับสมัครพนักงานสาขานี้</a> · 22 ต.ค. 2569</dd>'));
  assert.match(html, /รอยืนยันสถานะสาขา/);
  assert.match(html, /ระบบติดต่อระบุ inactive; ไม่ได้ยืนยันว่าปิด/);
  assert.deepEqual(detail.status, describeStatus(baselineRow));
  assert.doesNotMatch(html, /ยืนยันว่าเปิด|เปิดให้บริการแล้ว|ปิดถาวร/);
});

test('activity links are escaped and arbitrary source copy cannot enter the facts row', () => {
  const evidence = {...observation, url: `${observation.url}?from=a&to=b#"><script>alert(1)</script>`,
    sourceSnippet: '<img src=x onerror="alert(1)">', label: 'ยืนยันว่าเปิด', status: 'open'};
  const detail = detailFor(evidence), html = htmlFor(evidence);
  assert.deepEqual(Object.keys(detail.operationalEvidence).sort(), ['kind', 'sourcePublishedOn', 'url']);
  assert.ok(html.includes(`href="${esc(new URL(evidence.url).href)}"`));
  assert.match(html, /from=a&amp;to=b/);
  assert.doesNotMatch(html, /<script>|<img src=x|onerror=|ยืนยันว่าเปิด/);
});

test('missing, untyped, unsafe or invalidly dated observations are withheld', () => {
  const invalid = [null, undefined, {}, {...observation, kind: 'opening_confirmation'},
    {...observation, kind: undefined}, {...observation, sourcePublishedOn: undefined},
    ...['2026-02-29', '2026-04-31', '2026-13-22', '2026-10-32', '2026-1-22', '2026-10-22T02:05:53Z', 'not-a-date']
      .map(sourcePublishedOn => ({...observation, sourcePublishedOn})),
    ...['http://www.jobthai.com/job', 'javascript:alert(1)', '//www.jobthai.com/job',
      ['https://user:password', 'www.jobthai.com/job'].join('@'), 'https://localhost/job', 'https://service.internal/job',
      'https://127.0.0.1/job', 'https://10.0.0.1/job', 'https://[::1]/job',
      ['https:', '', 'drive.google.com', 'file/d/private/view'].join('/'), ['https:', '', 'docs.google.com', 'document/d/private/edit'].join('/')]
      .map(url => ({...observation, url})),
  ];
  for (const value of invalid) {
    assert.equal(readOperationalEvidence(value), null);
    assert.equal(detailFor(value).operationalEvidence, null);
    assert.doesNotMatch(htmlFor(value), /กิจกรรมล่าสุด|รับสมัครพนักงานสาขานี้/);
  }
  assert.equal(readOperationalEvidence({...observation, sourcePublishedOn: '2024-02-29'}).sourcePublishedOn, '2024-02-29');
  assert.equal(readOperationalEvidence({...observation, sourcePublishedOn: '1900-02-29'}), null);
});

test('renderer rechecks derived evidence and baseline source rows cannot acquire the fact', () => {
  const detail = detailFor(observation);
  for (const value of [{...observation, kind: 'unreviewed'}, {...observation, url: 'https://localhost/private'}, {...observation, sourcePublishedOn: '2026-02-30'}]) {
    assert.doesNotMatch(renderStore({...detail, operationalEvidence: value}, {detail: detail.row.localDetail}), /กิจกรรมล่าสุด|รับสมัครพนักงานสาขานี้/);
  }
  const row = {...baseline.rowByKey.get('9335bd72'), localDetail: {operationalEvidence: observation}};
  const sourceDetail = buildStoreDetail(baseline, row, baseline.rows);
  assert.equal(sourceDetail.operationalEvidence, null);
  assert.doesNotMatch(renderStore({...sourceDetail, operationalEvidence: observation}, {detail: row.localDetail}), /กิจกรรมล่าสุด|รับสมัครพนักงานสาขานี้/);
});

test('adding a public observation preserves counts, source facts, parent brand, point and review state', () => {
  const refresh = copy(fixture), rawBefore = JSON.stringify({grocery, areas, fixture});
  refresh.supplemental.find(item => item.key === key).detail.operationalEvidence = copy(observation);
  const model = buildModel(grocery, areas, refresh), row = model.rowByKey.get(key);
  assert.equal(model.rows.length, baseline.rows.length);
  assert.equal(model.sourceRows.length, baseline.sourceRows.length);
  assert.equal(model.brands.length, 17); assert.equal(brandCount(model.rows), 17);
  assert.deepEqual(model.meta, baseline.meta); assert.deepEqual(model.sourceMeta, baseline.sourceMeta);
  assert.deepEqual(model.brands, baseline.brands);
  assert.deepEqual({...row, localDetail: null}, {...baselineRow, localDetail: null});
  assert.equal(row.parentBrandId, 'BIG_C'); assert.equal(row.brandId, 'BIG_C');
  assert.equal(row.lon, 100.5489759); assert.equal(row.lat, 13.74268075);
  assert.equal(row.refresh.evidence.contactStatusType, 'inactive');
  assert.deepEqual(describeStatus(row), describeStatus(baselineRow));
  assert.deepEqual(buildStoreDetail(model, row, model.rows).operationalEvidence, observation);
  assert.equal(JSON.stringify({grocery, areas, fixture}), rawBefore);
});
