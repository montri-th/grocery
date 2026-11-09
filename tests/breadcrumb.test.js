import test from 'node:test';
import assert from 'node:assert/strict';
import {realModel} from './helpers.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText} from '../js/breadcrumb.js';
import {normalizeSelection} from '../js/hierarchy.js';

const m = realModel();

test('crumbs follow ประเทศไทย › จังหวัด › อำเภอ/เขต, or ประเทศไทย › จังหวัด › อปท./ย่าน (owner 2026-11-09 “ก”), then the venue', () => {
  assert.equal(breadcrumbText(buildBreadcrumb(m, {province: -1, district: -1, unit: -1})), 'ประเทศไทย');
  const unit = m.units.find(u => u.prefix === 'ทม.' && u.name === 'แสนสุข');
  const crumbs = buildBreadcrumb(m, normalizeSelection(m, {unit: unit.index}));
  assert.equal(breadcrumbText(crumbs), 'ประเทศไทย › ชลบุรี › ทม.แสนสุข');
  assert.deepEqual(crumbs.map(c => c.action), ['crumb-country', 'crumb-province', 'crumb-unit']);
  assert.equal(crumbs.at(-1).href, `https://landometer.com/v3/citymeter/CBI/${unit.kind}/${unit.key}?d=grocery`);
  assert.equal(crumbs[1].id, 'CBI');
  assert.equal(crumbs.at(-1).current, true);
  const bkk = buildBreadcrumb(m, normalizeSelection(m, {district: m.districtByCode.get('1039').index}));
  assert.equal(bkk[2].label, 'เขตวัฒนา');
  assert.equal(bkk[2].action, 'crumb-area');
  assert.equal(bkk[2].href, 'https://landometer.com/v3/citymeter/BKK/D/1039?d=grocery');
  const venue = m.venues.find(v => v.name === 'centralwOrld');
  assert.equal(buildBreadcrumb(m, normalizeSelection(m, {district: m.districtByCode.get('1007').index}), venue).at(-1).label, 'centralwOrld');
});

test('rendered crumbs: current level is aria-current, upper levels fold on narrow screens', () => {
  const unit = m.units.find(u => u.prefix === 'ทม.' && u.name === 'แสนสุข');
  const html = renderBreadcrumb(buildBreadcrumb(m, normalizeSelection(m, {unit: unit.index})));
  assert.match(html, /aria-current="location">ทม\.แสนสุข</);
  assert.ok(!html.includes('crumb-more'), 'three levels never fold');
  const venue = m.venues.find(v => v.name === 'centralwOrld');
  assert.match(renderBreadcrumb(buildBreadcrumb(m, normalizeSelection(m, {unit: unit.index}), venue)), /crumb-more/, 'four levels fold');
  assert.match(html, /data-action="crumb-province" data-id="CBI"/);
  assert.ok(!renderBreadcrumb(buildBreadcrumb(m, {province: 0, district: -1, unit: -1})).includes('crumb-more'));
});
