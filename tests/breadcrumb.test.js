import test from 'node:test';
import assert from 'node:assert/strict';
import {realModel} from './helpers.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText} from '../js/breadcrumb.js';
import {normalizeSelection} from '../js/hierarchy.js';

const m = realModel();

test('crumbs follow ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน › สถานที่', () => {
  assert.equal(breadcrumbText(buildBreadcrumb(m, {province: -1, district: -1, unit: -1})), 'ประเทศไทย');
  const unit = m.units.find(u => u.prefix === 'ทม.' && u.name === 'แสนสุข');
  const crumbs = buildBreadcrumb(m, normalizeSelection(m, {unit: unit.index}));
  assert.equal(breadcrumbText(crumbs), 'ประเทศไทย › ชลบุรี › อำเภอเมืองชลบุรี › ทม.แสนสุข');
  assert.deepEqual(crumbs.map(c => c.action), ['crumb-country', 'crumb-province', 'crumb-district', 'crumb-unit']);
  assert.equal(crumbs[1].id, 'CBI');
  assert.equal(crumbs.at(-1).current, true);
  const bkk = buildBreadcrumb(m, normalizeSelection(m, {district: m.districtByCode.get('1039').index}));
  assert.equal(bkk[2].label, 'เขตวัฒนา');
  const venue = m.venues.find(v => v.name === 'centralwOrld');
  assert.equal(buildBreadcrumb(m, normalizeSelection(m, {district: m.districtByCode.get('1007').index}), venue).at(-1).label, 'centralwOrld');
});

test('rendered crumbs: current level is aria-current, upper levels fold on narrow screens', () => {
  const unit = m.units.find(u => u.prefix === 'ทม.' && u.name === 'แสนสุข');
  const html = renderBreadcrumb(buildBreadcrumb(m, normalizeSelection(m, {unit: unit.index})));
  assert.match(html, /aria-current="location">ทม\.แสนสุข</);
  assert.match(html, /crumb-more/);
  assert.match(html, /data-action="crumb-province" data-id="CBI"/);
  assert.ok(!renderBreadcrumb(buildBreadcrumb(m, {province: 0, district: -1, unit: -1})).includes('crumb-more'));
});
