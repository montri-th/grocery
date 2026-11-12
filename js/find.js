/**
 * What the search box of CityMETER · Grocery knows by name: the entries js/shell/fuzzy.js matches and
 * js/shell/search.js lists (release 0.5.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว
 * implement กับ demo web ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”).
 *
 * The product statement asks one question at every level — “ร้านกระจุกที่ไหน เมื่อเทียบกับคน”. So a name typed here
 * opens the level that asks it again: a province, a เขต/อำเภอ, an อปท. or a Bangkok ย่าน; a brand, a store type or
 * a store format is the same question for that part of the market (its filter); a place that hosts stores, and one
 * store, open their pages. The order below is the order among equal matches: places first, the larger before the
 * smaller.
 *
 * A store is named the way the page lists it: the brand, then the branch (a branch name that already begins with
 * the brand is left as it is).
 *
 * Pure: entries from the model (js/model.js#buildModel); no DOM, no numbers shown (a row names what it is and where).
 */
import {unitName, unitKind, districtNoun, TYPE_SHORT} from './model.js?v=20261025-fp3';
import {PROVINCE_AKA, withoutMueang} from './shell/fuzzy.js';

export const SEARCH_KINDS = Object.freeze([
  {id: 'province', level: 'province', auto: true}, {id: 'district', level: 'district', auto: true},
  {id: 'locale', level: 'locale', auto: true}, {id: 'unit', auto: true},
  {id: 'brand', auto: true}, {id: 'type', auto: true}, {id: 'format', auto: true}, {id: 'venue'}, {id: 'store'},
]);
/**
 * Words a name may begin with, or carry, that people add or leave out; an array is one word and its short forms
 * (an อปท. is listed as “อบต.บ้านเก่า” and typed as “องค์การบริหารส่วนตำบลบ้านเก่า” or “บ้านเก่า”).
 */
export const SEARCH_HEADS = Object.freeze([
  ['องค์การบริหารส่วนตำบล', 'อบต.'], ['เทศบาลตำบล', 'ทต.'], ['เทศบาลเมือง', 'ทม.'], ['เทศบาลนคร', 'ทน.'], 'เทศบาล', 'สาขา', 'the',
]);
/** What to try when nothing is found: the kinds of name this demo knows. */
export const SEARCH_HINT = 'ลองชื่อแบรนด์ สาขา สถานที่ อปท./ย่าน เขต/อำเภอ หรือจังหวัด';

const squash = text => String(text || '').toLocaleLowerCase('th').replace(/[\s'’.\-]+/g, '');
/** A store as the page lists it: the brand, then the branch. */
export const storeTitle = r => (squash(r.name).startsWith(squash(r.brand)) ? r.name : `${r.brand} ${r.name}`.trim());

/** Every entry: the places, the filters, the places that host stores, then the stores. */
export function* searchEntries(model) {
  const {provinces, districts, units, venues, rows} = model;
  for (const p of provinces) yield {id: p.abbr, kind: 'province', name: p.name, nameEn: p.nameEn, aka: PROVINCE_AKA[p.name], codes: [p.abbr, p.code], province: p.abbr};
  const inProvince = provinces.map(p => [p.name, p.nameEn]);
  const inDistrict = districts.map(d => [d.name, ...inProvince[d.p]]);
  for (const d of districts) yield {id: d.code, kind: 'district', name: d.name, also: withoutMueang(d.name), codes: [d.code], within: inProvince[d.p], province: provinces[d.p].abbr};
  // A local unit by its listed name (prefix and all); a Bangkok ย่าน also by its English name.
  for (const u of units) yield {id: u.key, kind: u.kind === 'L' ? 'locale' : 'unit', name: unitName(u), nameEn: u.nameEn, codes: u.kind === 'M' ? [u.key] : undefined, within: inDistrict[u.d], province: provinces[u.p].abbr, unit: u};
  for (const b of model.brands) yield {id: b.id, kind: 'brand', name: b.name};
  for (const t of model.types) yield {id: t.id, kind: 'type', name: t.th, nameEn: t.en, aka: [TYPE_SHORT[t.id]]};
  for (const f of model.formatOptions) yield {id: f.id, kind: 'format', name: f.name};
  // A place that hosts stores stands where its first store with a district stands.
  const first = new Map();
  for (const r of rows) if (r.v >= 0 && !first.has(r.v)) first.set(r.v, r);
  for (const v of venues) {
    const r = first.get(v.index);
    if (r) yield {id: v.index, kind: 'venue', name: v.name, aka: v.aliases, within: inDistrict[r.d], province: provinces[r.p].abbr, venue: v, at: r};
  }
  for (const r of rows) {
    const where = r.u.length ? [...r.u.map(i => unitName(units[i])), ...inDistrict[r.d]] : inDistrict[r.d];
    yield {id: r.key, kind: 'store', name: storeTitle(r), aka: r.aliases?.length ? r.aliases : undefined, within: r.v >= 0 ? [venues[r.v].name, ...where] : where, province: provinces[r.p].abbr, row: r};
  }
}

/** The line under a name in the list: what it is and where. */
export function searchNote(entry, model) {
  const {provinces, districts} = model;
  const place = r => [districts[r.d].name, provinces[r.p].name];
  if (entry.kind === 'province') return 'จังหวัด';
  if (entry.kind === 'district') { const p = provinces.find(x => x.abbr === entry.province); return [districtNoun(p), p?.name].filter(Boolean).join(' · '); }
  if (entry.kind === 'locale' || entry.kind === 'unit') { const u = entry.unit; return [unitKind(u), districts[u.d].name, provinces[u.p].name].join(' · '); }
  if (entry.kind === 'brand') return 'แบรนด์';
  if (entry.kind === 'type') return 'ประเภทร้าน';
  if (entry.kind === 'format') return 'รูปแบบร้าน';
  if (entry.kind === 'venue') return [entry.venue.typeTh || 'สถานที่', ...place(entry.at)].join(' · ');
  const r = entry.row;
  return [model.typeById.get(r.type)?.th, ...place(r)].filter(Boolean).join(' · ');
}
