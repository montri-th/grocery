/**
 * Breadcrumb — ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน › สถานที่ — the
 * CityMETER production drill path for the Grocery dataset.
 *
 * Production (landometer.com/v3/citymeter, observed 2026-10-22):
 *   /v3/citymeter?d=grocery                          country
 *   /v3/citymeter/{ABBR}?d=grocery                   province (BKK, CBI, SPK …)
 *   /v3/citymeter/{ABBR}/M/{DOLA code}?d=grocery     เทศบาล / อบต. (detail type ML)
 *   /v3/citymeter/{ABBR}/L/{locale uuid}?d=grocery   Bangkok Locale (ย่าน)
 * Production has no district path of its own; this static demo serialises every
 * level as query parameters (?province=BKK&district=1039&unit=<key>&place=<venue id>)
 * with the same codes, and links out to production where a path exists.
 *
 * Rules:
 *   - every level is a container; a store is a record, not a crumb (the panel heading names it);
 *   - the venue level appears for a venue candidate (a place the branch name or address names);
 *   - a Bangkok store outside every Locale skips the ย่าน crumb (เขต is its finest level);
 *   - with four or more crumbs the upper levels fold behind “…” on narrow screens.
 */
import {unitName, districtNoun} from './model.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/**
 * Pure model. `sel` = {province, district, unit} indexes (-1 = not chosen);
 * `venue` = a venue record or null.
 */
export function buildBreadcrumb(model, sel = {}, venue = null) {
  const crumbs = [{level: 'country', label: 'ประเทศไทย', action: 'crumb-country'}];
  const p = sel.province >= 0 ? model.provinces[sel.province] : null;
  if (p) crumbs.push({level: 'province', label: p.name, id: p.abbr, action: 'crumb-province'});
  const d = sel.district >= 0 ? model.districts[sel.district] : null;
  if (d) crumbs.push({level: 'district', label: `${districtNoun(p)}${d.name}`, id: d.code, action: 'crumb-district'});
  const u = sel.unit >= 0 ? model.units[sel.unit] : null;
  if (u) crumbs.push({level: 'unit', label: unitName(u), id: u.key, action: 'crumb-unit'});
  if (venue) crumbs.push({level: 'venue', label: venue.name, id: venue.id, action: 'crumb-venue'});
  crumbs[crumbs.length - 1].current = true;
  return crumbs;
}

/**
 * HTML for the panel header; the last crumb is the current level (aria-current).
 * With four or more levels the upper ones get `is-collapsible` so narrow
 * screens can fold them behind an “…” toggle (the last two always stay visible).
 */
export function renderBreadcrumb(crumbs) {
  const collapsible = crumbs.length >= 4;
  const items = crumbs.map((c, i) => {
    const fold = collapsible && i < crumbs.length - 2;
    const inner = c.current
      ? `<span class="crumb is-current" aria-current="location">${esc(c.label)}</span>`
      : `<button type="button" class="crumb" data-action="${esc(c.action)}" data-id="${esc(c.id || '')}">${esc(c.label)}</button>`;
    return `<li${fold ? ' class="is-collapsible"' : ''}>${inner}</li>`;
  });
  if (collapsible) items.splice(crumbs.length - 2, 0, '<li class="crumb-ellipsis"><button type="button" class="crumb crumb-more" data-action="crumb-expand" aria-expanded="false" aria-label="แสดงระดับบน">…</button></li>');
  return `<ol class="crumbs${collapsible ? ' is-collapsible' : ''}">${items.join('')}</ol>`;
}

/** Compact text form for the mobile map card and the document title. */
export const breadcrumbText = crumbs => crumbs.map(c => c.label).join(' › ');
