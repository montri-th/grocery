/**
 * Area hierarchy and the first Aha — ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน.
 *
 * A selection is {province, district, unit} (indexes, -1 = not chosen). The
 * current area's children are compared at every level:
 *   country  → 77 provinces
 *   province → its districts (อำเภอ; เขต in Bangkok)
 *   district → its local units (อปท.; Locale ย่าน in Bangkok)
 *   unit     → leaf: the unit profile compares it with its district instead.
 *
 * Membership is source-native: a store's district is the source subdistrict
 * crosswalk (sheet district_code), its local unit the production overlay
 * membership (15 stores sit in two overlapping units and count in both, as in
 * production; 19 Bangkok stores lie outside every Locale). Children of a
 * district are the units whose parent is that district (DOLA code, or for a
 * Locale the district most of its stores report). A unit always shows its full
 * production count, also inside its district's comparison; the two systems do
 * not nest for 69 border stores, so shares of a district count only the
 * district's own stores (`inArea`, see comparisonRows).
 *
 * The Aha ("สาขากระจุกเทียบคน", owner choice 2026-10-22): the share of the
 * area's stores held by its top-k children (k = 3 when there are at least nine
 * children, 2 from four, else 1) against those children's share of the
 * population of all children. Stores in two units are counted once in the
 * share (union). The population comparison is shown only when every child has
 * a registered population; otherwise it is absent, never estimated.
 */
import {perCapita, brandCount, unitName, districtNoun, unitNoun} from './model.js?v=20261025-fp2';

export const NO_SELECTION = Object.freeze({province: -1, district: -1, unit: -1});

/** Make a selection consistent: a unit implies its district and province, a district its province. */
export function normalizeSelection(model, sel = {}) {
  let {province = -1, district = -1, unit = -1} = sel;
  if (unit >= 0 && model.units[unit]) { district = model.units[unit].d; province = model.districts[district].p; }
  else unit = -1;
  if (district >= 0 && model.districts[district]) province = model.districts[district].p;
  else district = -1;
  if (!(province >= 0 && model.provinces[province])) province = -1;
  if (province < 0) { district = -1; unit = -1; }
  return {province, district, unit};
}

export function levelOf(sel) {
  if (sel.unit >= 0) return 'unit';
  if (sel.district >= 0) return 'district';
  if (sel.province >= 0) return 'province';
  return 'country';
}

export const CHILD_LEVEL = Object.freeze({country: 'province', province: 'district', district: 'unit', unit: null});

export function currentArea(model, sel) {
  const level = levelOf(sel);
  if (level === 'unit') return model.units[sel.unit];
  if (level === 'district') return model.districts[sel.district];
  if (level === 'province') return model.provinces[sel.province];
  return model.country;
}

export function parentSelection(sel) {
  const level = levelOf(sel);
  if (level === 'unit') return {...sel, unit: -1};
  if (level === 'district') return {...sel, district: -1, unit: -1};
  return {...NO_SELECTION};
}

/** Rows inside the selected area (the unit level uses the source membership, so a unit's stores may carry another district code). */
export function areaRows(rows, sel) {
  if (sel.unit >= 0) return rows.filter(r => r.u.includes(sel.unit));
  if (sel.district >= 0) return rows.filter(r => r.d === sel.district);
  if (sel.province >= 0) return rows.filter(r => r.p === sel.province);
  return rows;
}

/** Area objects of the child level (empty at unit level). */
export function childrenOf(model, sel) {
  const level = levelOf(sel);
  if (level === 'country') return model.provinces;
  if (level === 'province') return model.districtsOf[sel.province].map(i => model.districts[i]);
  if (level === 'district') return model.unitsOf[sel.district].map(i => model.units[i]);
  return [];
}

/** Display name of any area object. */
export function areaName(model, area) {
  if (!area) return '';
  if (area.level === 'unit') return unitName(area);
  if (area.level === 'district') return area.name;
  return area.name;
}
/** Key used in URLs and geometry ids: province abbr, district code, unit key. */
export const areaKey = area => (area ? (area.level === 'province' ? area.abbr : area.level === 'unit' ? area.key : area.code) : '');

/** Nouns for copy at the current level: what the children are called and what the area is called. */
export function levelNouns(model, sel) {
  const level = levelOf(sel);
  const province = sel.province >= 0 ? model.provinces[sel.province] : null;
  if (level === 'country') return {child: 'จังหวัด', area: 'ประเทศ', areaName: 'ประเทศไทย'};
  if (level === 'province') return {child: districtNoun(province), area: 'จังหวัด', areaName: province.name};
  if (level === 'district') {
    const d = model.districts[sel.district];
    return {child: unitNoun(province), area: districtNoun(province), areaName: `${districtNoun(province)}${d.name}`};
  }
  const u = model.units[sel.unit];
  return {child: '', area: unitNoun(province), areaName: unitName(u)};
}

/** The child indexes a row counts for at a child level (unit → only units of the selected district). */
function rowChildren(row, childLevel, sel, model) {
  if (childLevel === 'province') return [row.p];
  if (childLevel === 'district') return [row.d];
  if (childLevel === 'unit') return row.u.filter(i => model.units[i].d === sel.district);
  return [];
}

/**
 * Rows that can count for the children of `sel`. For provinces and districts
 * this is the area itself. For the units of a district it also takes the
 * members whose source subdistrict lies in a neighbouring district (25 units
 * straddle a district border, e.g. ทน.แหลมฉบัง: 152 members, 130 of them in
 * ศรีราชา), so a unit shows its full production count everywhere.
 */
export function comparisonRows(model, rows, sel) {
  if (levelOf(sel) !== 'district') return areaRows(rows, sel);
  return rows.filter(r => r.d === sel.district || r.u.some(i => model.units[i].d === sel.district));
}

/**
 * Per-child summary of `rows` (already filtered; any area). Every child is
 * returned, including measured zeros, with its population and per-capita.
 * `count` is the child's own count (for a unit: all its production members);
 * `inArea` counts only the stores of the current area (the Aha and the store
 * shares use it, so a share never takes stores from outside its denominator).
 */
export function summarizeChildren(model, rows, sel) {
  const level = levelOf(sel), childLevel = CHILD_LEVEL[level];
  const children = childrenOf(model, sel);
  if (!childLevel) return [];
  const inside = level === 'district' ? r => r.d === sel.district : () => true;
  const acc = new Map(children.map(c => [c.index, {count: 0, inArea: 0, brands: new Set()}]));
  for (const r of comparisonRows(model, rows, sel)) {
    const own = inside(r);
    for (const ci of rowChildren(r, childLevel, sel, model)) {
      const a = acc.get(ci);
      if (a) { a.count++; if (own) a.inArea++; a.brands.add(r.b); }
    }
  }
  return children.map(c => {
    const a = acc.get(c.index);
    const pop = Number.isFinite(c.pop) && c.pop > 0 ? c.pop : null;
    return {area: c, index: c.index, level: childLevel, key: areaKey(c), name: areaName(model, c), count: a.count, inArea: a.inArea, brands: a.brands.size, pop, perCapita: perCapita(a.count, pop)};
  });
}

/** Ranking by the chosen metric; ties by count then name. Children without a value sort last. */
export function rankChildren(summary, metric = 'count') {
  const value = s => (metric === 'capita' ? (s.perCapita ?? -1) : s.count);
  return [...summary].sort((a, b) => value(b) - value(a) || b.count - a.count || a.name.localeCompare(b.name, 'th') || String(a.key).localeCompare(String(b.key)));
}

/** How many top children the Aha names: 3 with ≥ 9 children, 2 with ≥ 4, else 1. */
export const ahaSize = n => (n >= 9 ? 3 : n >= 4 ? 2 : 1);

/**
 * The Aha for the current area. Returns null at unit level.
 * {level, childLevel, area, nouns, total, children (by count), top, k, topCount, share,
 *  popComplete, popShare, populationTotal, populationTop, comparison: 'less'|'more'|'equal'|null}
 */
export function buildAha(model, rows, sel) {
  const level = levelOf(sel), childLevel = CHILD_LEVEL[level];
  if (!childLevel) return null;
  const scoped = areaRows(rows, sel);
  const children = rankChildren(summarizeChildren(model, rows, sel), 'count');
  const withStores = children.filter(c => c.count > 0);
  const k = Math.min(ahaSize(children.length), withStores.length);
  const top = withStores.slice(0, k);
  const topSet = new Set(top.map(c => c.index));
  // Union: a store in two overlapping units of the top set counts once.
  const topCount = scoped.filter(r => rowChildren(r, childLevel, sel, model).some(i => topSet.has(i))).length;
  const total = scoped.length;
  const share = total ? (topCount / total) * 100 : 0;
  const popComplete = children.length > 0 && children.every(c => c.pop != null);
  const populationTotal = popComplete ? children.reduce((s, c) => s + c.pop, 0) : null;
  const populationTop = popComplete ? top.reduce((s, c) => s + c.pop, 0) : null;
  const popShare = popComplete && populationTotal > 0 ? (populationTop / populationTotal) * 100 : null;
  const comparison = popShare == null ? null : Math.round(popShare) < Math.round(share) ? 'less' : Math.round(popShare) > Math.round(share) ? 'more' : 'equal';
  return {level, childLevel, area: currentArea(model, sel), nouns: levelNouns(model, sel), total, brands: brandCount(scoped),
    children, top, k, topCount, share, popComplete, popShare, populationTotal, populationTop, comparison,
    missingPopulation: children.filter(c => c.pop == null).length};
}

/**
 * Leaf insight for one local unit: its stores per 10,000 residents against its
 * district (district rows / district population), and its rank among the
 * district's units by count.
 */
export function buildUnitInsight(model, rows, sel) {
  if (sel.unit < 0) return null;
  const unit = model.units[sel.unit], district = model.districts[unit.d];
  const own = rows.filter(r => r.u.includes(sel.unit));
  const districtRows = rows.filter(r => r.d === unit.d);
  const unitPerCapita = perCapita(own.length, unit.pop);
  const districtPerCapita = perCapita(districtRows.length, district.pop);
  const siblings = rankChildren(summarizeChildren(model, rows, {province: district.p, district: unit.d, unit: -1}), 'count');
  const rank = siblings.findIndex(s => s.index === unit.index) + 1;
  const ratio = unitPerCapita != null && districtPerCapita ? unitPerCapita / districtPerCapita : null;
  return {unit, district, count: own.length, brands: brandCount(own), pop: unit.pop || null, perCapita: unitPerCapita,
    districtCount: districtRows.length, districtPerCapita, ratio, rank: rank || null, siblings: siblings.length};
}
