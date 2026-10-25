/**
 * Dataset vocabulary and the in-memory model of CityMETER · Grocery.
 *
 * Inputs (scripts/build-data.py):
 *   data/grocery.json — one row per source point (27,607 outlets of 17 chains),
 *                        fields [key, brand, type, format, name, lon, lat, district,
 *                        unit, source, venue?, flags?]; `unit` is a local-unit index,
 *                        a list of two (overlapping source units) or -1.
 *   data/areas.json   — country → 77 provinces → 928 districts → 8,621 local units
 *                        (เทศบาล/อบต. outside Bangkok, Locale ย่าน inside Bangkok) with
 *                        registered population and the production API counts.
 *   data/retail-refresh.json — reviewed format observations and separately sourced
 *                        supplemental points; original source rows/metadata retained.
 *
 * Nothing here mutates a row after the model is built; filters return new arrays.
 * Counting units: สาขา = one source row; แบรนด์ = distinct brands (never summed
 * across areas); population is the registered population the production uses.
 */
import {applyRetailRefresh} from './retail-refresh.js?v=20261025-fp3';

export const TYPE_ORDER = Object.freeze(['C_STORE', 'SUPERMARKET', 'HYPERMARKET', 'WHOLESALE', 'PHARMACY']);
/** Short Thai labels for dense surfaces (matrix columns, chips). */
export const TYPE_SHORT = Object.freeze({C_STORE: 'สะดวกซื้อ', SUPERMARKET: 'ซูเปอร์ฯ', HYPERMARKET: 'ไฮเปอร์ฯ', WHOLESALE: 'ค้าส่ง', PHARMACY: 'ร้านยา'});
/** Local-unit kinds by name prefix (built from the DOLA full names). */
export const UNIT_KIND = Object.freeze({
  'อบต.': 'องค์การบริหารส่วนตำบล', 'ทต.': 'เทศบาลตำบล', 'ทม.': 'เทศบาลเมือง', 'ทน.': 'เทศบาลนคร',
});
export const FLAG_ONLINE = 1;
export const FLAG_NO_ADDRESS = 2;
/** Production CityMETER (observed 2026-10-22): /v3/citymeter/{ABBR}[/M/{dola code} | /L/{locale uuid}]?d=grocery */
export const PRODUCTION = 'https://landometer.com/v3/citymeter';

const lower = v => String(v ?? '').toLocaleLowerCase('th');

function table(block) {
  const {fields, rows} = block;
  return rows.map(r => Object.fromEntries(fields.map((f, i) => [f, r[i]])));
}

/** Display name of a local unit: "อบต.บ้านเก่า", "ทน.สมุทรปราการ", "เมืองพัทยา", a Bangkok ย่าน as is. */
export const unitName = u => (u ? `${u.prefix || ''}${u.name}` : '');
/** Kind label of a local unit. */
export function unitKind(u) {
  if (!u) return '';
  if (u.kind === 'L') return 'ย่าน';
  if (u.prefix) return UNIT_KIND[u.prefix] || 'องค์กรปกครองส่วนท้องถิ่น';
  return 'องค์กรปกครองส่วนท้องถิ่นรูปแบบพิเศษ';
}
/** Level noun of a unit list in a province: Bangkok has ย่าน (Locales), elsewhere อปท. */
export const unitNoun = province => (province?.code === '10' ? 'ย่าน' : 'อปท.');
/** Thai join of a word and an area noun: an abbreviation (อปท.) gets a space, a word does not ("ทุกอำเภอ", "ทุก อปท."). */
export const withNoun = (word, noun) => (/\.$/.test(noun || '') ? `${word} ${noun}` : `${word}${noun}`);
/** District noun: เขต in Bangkok, อำเภอ elsewhere. */
export const districtNoun = province => (province?.code === '10' ? 'เขต' : 'อำเภอ');

/**
 * Build the model. Returns plain objects with direct index links:
 * row.b/t/d/p/u/v/s are indexes into brands/types/districts/provinces/units/venues/sources.
 */
export function buildModel(grocery, areas, refresh = null) {
  const brands = grocery.brands.map((b, i) => ({...b, index: i}));
  const types = grocery.types.map((t, i) => ({...t, index: i}));
  const sources = grocery.sources.map((s, i) => ({...s, index: i}));
  const venues = grocery.venues.map(([id, name, type, typeTh, logo, role, aliases = []], i) => ({id, name, type, typeTh, logo, role, aliases: Array.isArray(aliases) ? aliases : [], index: i}));
  const provinces = table(areas.provinces).map((p, i) => ({...p, index: i, level: 'province'}));
  const districts = table(areas.districts).map((d, i) => ({...d, index: i, level: 'district'}));
  const units = table(areas.units).map((u, i) => ({...u, index: i, level: 'unit', p: districts[u.d].p}));
  const districtsOf = provinces.map(() => []);
  for (const d of districts) districtsOf[d.p].push(d.index);
  const unitsOf = districts.map(() => []);
  for (const u of units) unitsOf[u.d].push(u.index);
  const rows = grocery.rows.map(([key, b, t, format, name, lon, lat, d, unit, s, v = -1, flags = 0]) => {
    const u = Array.isArray(unit) ? unit : unit >= 0 ? [unit] : [];
    return {key, id: key, b, t, format, name, lon, lat, d, p: districts[d].p, u, s, v, flags,
      brand: brands[b].name, brandId: brands[b].id, type: types[t].id};
  });
  const base = {meta: grocery.meta, brands, types, formats: grocery.formats, sources, venues, rows,
    country: {...areas.country, level: 'country'}, provinces, districts, units, districtsOf, unitsOf};
  const model = refresh ? applyRetailRefresh(base, refresh) : base;
  for (const r of model.rows) {
    const venue = r.v >= 0 ? model.venues[r.v] : null;
    const parent = model.brands.find(b => b.id === r.parentBrandId);
    r.text = lower([r.brand, parent?.name || '', r.name, ...(r.aliases || []), model.formats[r.format] || '', venue?.name || '', ...(venue?.aliases || []),
      districts[r.d].name, provinces[r.p].name, ...r.u.map(i => unitName(units[i]))].join(' '));
    r.formatFilterId = r.formatFamilyId || (r.format >= 0 ? `format-${r.format}` : '');
  }
  const groupedFormats = new Set((model.formatFamilies || []).flatMap(f => f.formats));
  const formatOptions = [...(model.formatFamilies || []).map(f => ({id: f.id, name: f.name})),
    ...model.formats.flatMap((name, i) => groupedFormats.has(name) ? [] : [{id: `format-${i}`, name}])];
  const index = (list, key) => new Map(list.map(x => [x[key], x]));
  return {...model, formatOptions, formatOptionById: index(formatOptions, 'id'), rowByKey: index(model.rows, 'key'),
    provinceByCode: index(provinces, 'code'), provinceByAbbr: index(provinces, 'abbr'),
    districtByCode: index(districts, 'code'), unitByKey: index(units, 'key'),
    brandById: index(model.brands, 'id'), typeById: index(types, 'id')};
}

/** A usable source coordinate inside Thailand's bounding box. */
export const hasPoint = r => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lat >= 5 && r.lat <= 21 && r.lon >= 97 && r.lon <= 106;

/**
 * Shared non-geographic filter used by the map, counters, charts, panel and table.
 * f.search (brand, branch, venue, district, local unit, province), f.brand (brand id), f.type (type id).
 */
export function filterRows(rows, f = {}) {
  const q = lower(f.search || '').trim();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  return rows.filter(r => {
    if (f.brand && r.brandId !== f.brand) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.format && r.formatFilterId !== f.format) return false;
    return !terms.length || terms.every(t => r.text.includes(t));
  });
}

/** Distinct brands among rows. */
export const brandCount = rows => new Set(rows.map(r => r.b)).size;

/** Stores per 10,000 registered residents; null when the population is unknown (never zero). */
export function perCapita(count, pop) {
  return Number.isFinite(pop) && pop > 0 ? (count / pop) * 10000 : null;
}

/** Province / district / unit production deep links (static hosting cannot mirror the path, so they point out). */
export function productionURL(model, {province = -1, unit = -1} = {}) {
  const p = model.provinces[province >= 0 ? province : unit >= 0 ? model.units[unit].p : -1];
  if (!p) return `${PRODUCTION}?d=grocery`;
  if (unit >= 0) {
    const u = model.units[unit];
    // M = municipality / SAO by its DOLA code; L = Bangkok Locale by its uuid (both are the unit key).
    return `${PRODUCTION}/${p.abbr}/${u.kind}/${encodeURIComponent(u.key)}?d=grocery`;
  }
  return `${PRODUCTION}/${p.abbr}?d=grocery`;
}

export const safeURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; }
  catch { return ''; }
};
