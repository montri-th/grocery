import test from 'node:test';
import assert from 'node:assert/strict';
import {readJSON} from './helpers.js';
import {buildModel, filterRows} from '../js/model.js';
import {buildStoreDetail, describeGeometry, readCoordinateSelection} from '../js/profile-model.js';
import {renderStore} from '../js/panel.js';

const grocery = readJSON('data/grocery.json'), areas = readJSON('data/areas.json');
const fixture = readJSON('tests/fixtures/retail-refresh.json');
const copy = value => JSON.parse(JSON.stringify(value));
const key = 'bigc-official-15073';
const originalPoint = [100.64690561279112, 13.666999737741738];
const selectedPoint = [100.6477432, 13.6671705];
const mapsURL = 'https://maps.app.goo.gl/JDaMRUZfW2wBfVhZ9';
const decision = () => ({kind: 'owner_confirmed_maps_point', longitude: selectedPoint[0], latitude: selectedPoint[1],
  sourceURL: mapsURL, checkedOn: '2026-10-25', decision: 'owner_requested_coordinate_correction',
  pointRole: 'owner_confirmed_maps_store_point', sourcePoint: [...originalPoint],
  reason: 'ผู้ใช้ยืนยันให้ใช้จุด Maps ของ Big C Foodplace PARC Bangna'});
function refreshWithSelection() {
  const refresh = copy(fixture);
  refresh.supplemental.find(item => item.key === key).selectedCoordinate = decision();
  return refresh;
}
const build = refresh => buildModel(grocery, areas, refresh);

test('owner selection changes one supplemental display point while retaining raw source facts and outlet counts', () => {
  const refresh = refreshWithSelection(), inputBefore = JSON.stringify({grocery, areas, refresh});
  const before = build(fixture), after = build(refresh), row = after.rowByKey.get(key);
  const item = refresh.supplemental.find(value => value.key === key);
  assert.deepEqual([row.lon, row.lat], selectedPoint);
  assert.deepEqual([item.longitude, item.latitude], originalPoint);
  assert.deepEqual([row.sourceFacts.longitude, row.sourceFacts.latitude], originalPoint);
  assert.equal(row.sourceFacts.coordinateRole, item.coordinateRole);
  assert.equal(row.coordinateRole, 'owner_confirmed_maps_store_point');
  assert.deepEqual(row.sourceFacts, before.rowByKey.get(key).sourceFacts);
  assert.equal(row.sourceOutletId, before.rowByKey.get(key).sourceOutletId);
  assert.deepEqual(row.localDetail, before.rowByKey.get(key).localDetail);
  assert.deepEqual(row.refresh, before.rowByKey.get(key).refresh);
  assert.equal(after.rows.length, 27612); assert.equal(after.sourceRows.length, 27607);
  assert.equal(after.brands.length, 17); assert.equal(after.meta.apiTotal, 27608);
  assert.equal(filterRows(after.rows, {format: 'BIG_C_FOODPLACE'}).length, 17);
  assert.equal(filterRows(after.rows, {brand: 'BIG_C'}).length, 1749);
  for (const prior of before.rows) {
    const current = after.rowByKey.get(prior.key);
    if (prior.key !== key) assert.deepEqual(current, prior, `unrelated row ${prior.key} remains unchanged`);
  }
  assert.equal(JSON.stringify({grocery, areas, refresh}), inputBefore, 'raw inputs are not rewritten');
  assert.ok(Object.isFrozen(row.sourceFacts));
  assert.ok(Object.isFrozen(row.coordinateSelection)); assert.ok(Object.isFrozen(row.coordinateSelection.sourcePoint));
  assert.notEqual(row.coordinateSelection, item.selectedCoordinate);
  assert.notEqual(row.coordinateSelection.sourcePoint, item.selectedCoordinate.sourcePoint);
  item.selectedCoordinate.sourcePoint[0] = 100;
  item.selectedCoordinate.longitude = 100;
  assert.deepEqual(row.coordinateSelection.sourcePoint, originalPoint);
  assert.equal(row.coordinateSelection.longitude, selectedPoint[0]);
  assert.throws(() => { row.coordinateSelection.sourcePoint[0] = 100; }, TypeError);
});

test('coordinate fact names the owner-confirmed Maps source without changing operating status or other geometry roles', () => {
  const model = build(refreshWithSelection()), row = model.rowByKey.get(key);
  const detail = buildStoreDetail(model, row, model.rows);
  assert.equal(detail.geometry.level, 'owner_confirmed_maps');
  assert.equal(detail.geometry.label, 'พิกัด Maps ที่ผู้ใช้ยืนยัน');
  assert.equal(detail.geometry.sourceURL, mapsURL);
  assert.equal(detail.geometry.checkedOn, '2026-10-25');
  assert.match(detail.geometry.note, /ไม่ใช่ค่าความแม่นจากการสำรวจ/);
  const html = renderStore(detail, {detail: row.localDetail});
  const coordinateFact = html.match(/<dt>พิกัด<\/dt><dd>(.*?)<\/dd>/s)?.[1];
  assert.ok(coordinateFact);
  assert.match(coordinateFact, /13\.66717, 100\.64774/);
  assert.ok(coordinateFact.includes(`href="${mapsURL}"`));
  assert.match(coordinateFact, /พิกัด Maps ที่ผู้ใช้ยืนยัน/);
  assert.match(coordinateFact, /25 ต\.ค\. 2569/);
  assert.doesNotMatch(coordinateFact, /พิกัดจากทำเนียบสาขาของแบรนด์/);
  const prior = buildStoreDetail(build(fixture), build(fixture).rowByKey.get(key));
  assert.deepEqual(detail.status, prior.status, 'selecting a map point supplies no operation evidence');
  for (const other of model.rows.filter(value => value.supplemental && value.key !== key)) {
    assert.equal(describeGeometry(model, other).level, 'official');
    assert.equal(readCoordinateSelection(other), null);
  }
  assert.equal(describeGeometry(model, model.rows.find(value => !value.supplemental)).level, 'tile');
});

test('coordinate decisions fail closed on stale source points, malformed identities, dates or private sources', () => {
  const cases = [
    [value => { value.kind = 'nearby_point'; }, /schema\/decision/],
    [value => { value.decision = 'automatic_snap'; }, /schema\/decision/],
    [value => { value.pointRole = 'retailer_published_store_point'; }, /schema\/decision/],
    [value => { value.extra = true; }, /schema\/decision/],
    [value => { value.sourcePoint[0] += 0.000000000001; }, /stale/],
    [value => { value.sourcePoint.reverse(); }, /stale/],
    [value => { value.sourcePoint.push(0); }, /stale/],
    [value => { value.longitude = String(value.longitude); }, /coordinate point/],
    [value => { value.latitude = NaN; }, /coordinate point/],
    [value => { value.latitude = 90; }, /coordinate point/],
    [value => { value.checkedOn = '2026-02-30'; }, /coordinate date/],
    [value => { value.checkedOn = '2026-10-25T00:00:00Z'; }, /coordinate date/],
    [value => { value.reason = ' '; }, /coordinate reason/],
    ...['http://maps.app.goo.gl/example', ['https://user:secret', 'maps.app.goo.gl/example'].join('@'),
      ['https:', '', 'drive.google.com', 'file/d/private'].join('/'), ['https:', '', 'docs.google.com', 'spreadsheets/d/private'].join('/'),
      'https://127.0.0.1/example', 'https://localhost/example', 'https://host.local/example',
      'file:///private/maps.json'].map(url => [value => { value.sourceURL = url; }, /public source URL/]),
  ];
  for (const [change, expected] of cases) {
    const refresh = refreshWithSelection();
    change(refresh.supplemental.find(item => item.key === key).selectedCoordinate);
    assert.throws(() => build(refresh), expected);
  }
  const existing = copy(fixture); existing.existing[0].selectedCoordinate = decision();
  assert.throws(() => build(existing), /cannot change source location\/name\/type/);
});

test('view models withhold a Maps fact when the selected row or retained source no longer matches the decision', () => {
  const model = build(refreshWithSelection()), row = model.rowByKey.get(key);
  assert.ok(readCoordinateSelection(row));
  const forged = [
    {...row, supplemental: false},
    {...row, lon: originalPoint[0]},
    {...row, coordinateRole: row.sourceFacts.coordinateRole},
    {...row, sourceFacts: {...row.sourceFacts, longitude: originalPoint[0] + 0.001}},
    {...row, coordinateSelection: {...row.coordinateSelection, sourceURL: ['https:', '', 'drive.google.com', 'file/d/private'].join('/')}},
    {...row, coordinateSelection: {...row.coordinateSelection, checkedOn: '2026-02-30'}},
  ];
  for (const invalid of forged) {
    assert.equal(readCoordinateSelection(invalid), null);
    assert.notEqual(describeGeometry(model, invalid).level, 'owner_confirmed_maps');
    const html = renderStore(buildStoreDetail(model, invalid, model.rows), {detail: invalid.localDetail});
    assert.doesNotMatch(html.match(/<dt>พิกัด<\/dt><dd>(.*?)<\/dd>/s)?.[1] || '', /พิกัด Maps ที่ผู้ใช้ยืนยัน|maps\.app\.goo\.gl/);
  }
});
