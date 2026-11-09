/**
 * Breadcrumb — ประเทศไทย › จังหวัด › อำเภอ/เขต, or ประเทศไทย › จังหวัด › อปท./ย่าน, then the venue the reader is in —
 * the CityMETER production hierarchy, through the shared shell (js/shell/breadcrumb.js, citymeter-shell 0.4.1).
 * A local administrative unit (อปท., production M) and a Bangkok locale (ย่าน, production L) divide the province
 * another way, so they follow the province directly (owner 2026-11-09 01:34: “ก”, demo-platform-review §5.3 rule 5);
 * the browser's back button still returns to the district the reader came from. Every administrative crumb carries
 * its production deep link `/v3/citymeter/{province}[/D/{district} | /M/{DOLA code} | /L/{locale uuid}]?d=grocery`;
 * a venue is the last crumb, with no production link; a store is the panel heading, never a crumb.
 */
import {unitName, districtNoun} from './model.js?v=20261025-fp3';
import {buildBreadcrumb as shellBreadcrumb, renderBreadcrumb, breadcrumbText} from './shell/breadcrumb.js';

/** Production dataset code (`?d=`). */
export const DATASET = 'grocery';

/** Pure model. sel = {province, district, unit} indexes (-1 for none); venue = a venue record or null. */
export function buildBreadcrumb(model, sel = {}, venue = null) {
  const p = sel.province >= 0 ? model.provinces[sel.province] : null;
  const d = sel.district >= 0 ? model.districts[sel.district] : null;
  const u = sel.unit >= 0 ? model.units[sel.unit] : null;
  const code = p?.abbr || '';
  return shellBreadcrumb({
    province: code,
    area: !u && d ? {id: d.code, name: d.name, province: code} : null,
    unit: u ? {id: u.key, name: unitName(u), province: code, kind: u.kind === 'L' ? 'L' : 'M'} : null,
    site: venue ? {id: venue.id, name: venue.name, province: code} : null,
  }, {dataset: DATASET, provinceByCode: c => (p && c === p.abbr ? {code: p.abbr, th: p.name} : null), areaWord: () => districtNoun(p)});
}

export {renderBreadcrumb, breadcrumbText};
