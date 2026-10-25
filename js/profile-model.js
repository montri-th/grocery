/**
 * Pure view models for the reading panel: unit profile, venue profile, store
 * detail and the mixes the overview shows. No DOM, no map. Every function works
 * on the committed filtered rows the app passes in.
 *
 * Counting rules (shared with hierarchy.js and chart-model.js):
 * - สาขา = one source row; แบรนด์ = distinct brands (never summed across areas)
 * - a unit's stores are its source members (production overlay membership)
 * - population is the registered population the production uses; missing stays missing
 */
import {TYPE_ORDER, FLAG_ONLINE, FLAG_NO_ADDRESS, unitName, unitKind, perCapita, brandCount, productionURL, hasPoint} from './model.js?v=20261025-fp2';
import {buildUnitInsight} from './hierarchy.js?v=20261025-fp2';

/** Store-type mix in the fixed series order (types with no store are left out). */
export function typeMix(model, rows) {
  const counts = new Map(TYPE_ORDER.map(t => [t, 0]));
  for (const r of rows) counts.set(r.type, (counts.get(r.type) || 0) + 1);
  return TYPE_ORDER.map((id, i) => ({id, index: i, th: model.typeById.get(id)?.th || id, count: counts.get(id) || 0, share: rows.length ? (counts.get(id) || 0) / rows.length : 0}))
    .filter(t => t.count > 0);
}

/** Brands by store count within rows. */
export function brandMix(model, rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.b, (counts.get(r.b) || 0) + 1);
  return [...counts].map(([b, count]) => ({brand: model.brands[b], count, share: rows.length ? count / rows.length : 0}))
    .sort((a, b) => b.count - a.count || a.brand.name.localeCompare(b.brand.name));
}

/** Venue candidates named by the rows, by store count. */
export function venueRanking(model, rows) {
  const groups = new Map();
  for (const r of rows) {
    if (r.v < 0) continue;
    if (!groups.has(r.v)) groups.set(r.v, []);
    groups.get(r.v).push(r);
  }
  return [...groups].map(([v, rs]) => ({venue: model.venues[v], count: rs.length, brands: brandCount(rs)}))
    .sort((a, b) => b.count - a.count || b.brands - a.brands || a.venue.name.localeCompare(b.venue.name));
}

/** Thai reading of the status every row carries in this snapshot (no branch was re-checked one by one). */
export function describeStatus(row = {}) {
  if (row.supplemental && row.refresh?.evidence?.contactStatusType === 'inactive') return {tone: 'neutral', label: 'รอยืนยันสถานะสาขา', detail: 'ระบบติดต่อระบุ inactive; ไม่ได้ยืนยันว่าปิด'};
  if (row.supplemental) return {tone: 'listed', label: 'อยู่ในรายการสาขาของแบรนด์', detail: 'รายการจากทำเนียบสาขาของแบรนด์ ยังไม่ได้ตรวจยืนยันการเปิดให้บริการที่หน้างาน'};
  if (row.flags & FLAG_ONLINE) return {tone: 'neutral', label: 'ชื่อสาขามีคำว่าออนไลน์', detail: 'แหล่งข้อมูลตั้งชื่อสาขาด้วยคำว่าออนไลน์ อาจเป็นช่องทางขายมากกว่าหน้าร้าน'};
  return {tone: 'listed', label: 'อยู่ในรายการสาขาของแบรนด์', detail: 'รายการตามแหล่งข้อมูลของแบรนด์ที่ CityMETER ใช้ ยังไม่ได้ตรวจสถานะเปิด–ปิดทีละสาขา'};
}

function validEvidenceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function publicEvidenceURL(value) {
  if (typeof value !== 'string') return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  // Public source pages use a domain; local hosts, IP literals and credentials are withheld.
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') ||
    /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
    /(^|\.)(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com|googleusercontent\.com)$/.test(host)) return null;
  return url.href;
}

/** A dated activity observation is a source fact, never an opening-status override. */
export function readOperationalEvidence(value) {
  if (!value || value.kind !== 'employer_recruitment_listing' || !validEvidenceDate(value.sourcePublishedOn)) return null;
  const url = publicEvidenceURL(value.url);
  return url ? Object.freeze({kind: value.kind, url, sourcePublishedOn: value.sourcePublishedOn}) : null;
}

/** Owner-reported floor/storeys remain separate from raw directory fields and measured height. */
export function readHostLocationEvidence(value) {
  if (!value || value.kind !== 'owner_reported_host_location' || value.selectedStoreFloor !== 'Ground' ||
    value.hostBuildingUse !== 'parking_building' || !Number.isSafeInteger(value.ownerReportedStoreys) ||
    value.ownerReportedStoreys < 1 || !validEvidenceDate(value.checkedOn) ||
    typeof value.sourceImageSHA256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sourceImageSHA256)) return null;
  const sourceURL = publicEvidenceURL(value.sourceURL);
  return sourceURL ? Object.freeze({kind: value.kind, selectedStoreFloor: value.selectedStoreFloor,
    hostBuildingUse: value.hostBuildingUse, ownerReportedStoreys: value.ownerReportedStoreys,
    checkedOn: value.checkedOn, sourceURL, sourceImageSHA256: value.sourceImageSHA256.toLowerCase()}) : null;
}

/** Thai reading of the coordinate: decoded from the production vector tile, never a surveyed door point. */
export function describeGeometry(model, row = {}) {
  const source = model.sources[row.s];
  if (!hasPoint(row)) return {level: 'none', label: 'ยังไม่มีพิกัด', note: 'รายการยังอยู่ในตารางและจำนวน'};
  if (row.supplemental) return {level: 'official', label: 'พิกัดจากทำเนียบสาขาของแบรนด์', note: 'เก็บค่าพิกัดที่แหล่งข้อมูลส่งคืน ไม่ใช่พิกัดสำรวจหน้าร้าน'};
  return {level: 'tile', label: 'ตำแหน่งตามที่แบรนด์ประกาศ ถอดจากแผนที่ CityMETER',
    note: `${source?.limitation || ''}${source?.limitation ? ' · ' : ''}ถอดจาก vector tile z10 ตารางประมาณ 10 ม. ไม่ใช่พิกัดสำรวจหน้าร้าน`};
}

/** Full profile of one local unit within the filtered rows. */
export function buildUnitProfile(model, rows, unitIndex) {
  const unit = model.units[unitIndex];
  if (!unit) return null;
  const members = rows.filter(r => r.u.includes(unitIndex));
  const district = model.districts[unit.d], province = model.provinces[district.p];
  const insight = buildUnitInsight(model, rows, {province: district.p, district: unit.d, unit: unitIndex});
  return {
    unit, district, province, name: unitName(unit), kind: unitKind(unit), nameEn: unit.nameEn || '',
    rows: members, count: members.length, brands: brandCount(members), pop: unit.pop || null, perCapita: perCapita(members.length, unit.pop),
    areaKm2: unit.areaKm2, insight, typeMix: typeMix(model, members), brandMix: brandMix(model, members), venues: venueRanking(model, members),
    production: productionURL(model, {unit: unitIndex}), apiCount: unit.api,
  };
}

/** A venue candidate within the filtered rows. */
export function buildVenueProfile(model, rows, venueIndex) {
  const venue = model.venues[venueIndex];
  if (!venue) return null;
  const members = rows.filter(r => r.v === venueIndex);
  if (!members.length) return null;
  const first = members.find(hasPoint) || members[0];
  const units = [...new Set(members.flatMap(r => r.u))];
  return {
    venue, rows: [...members].sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name, 'th')),
    count: members.length, brands: brandCount(members), typeMix: typeMix(model, members),
    district: model.districts[first.d], province: model.provinces[first.p], unit: units.length === 1 ? model.units[units[0]] : null,
    lon: first.lon, lat: first.lat,
  };
}

/** Detail model for one store row. `rows` is the filtered set used for the "same brand nearby" list. */
export function buildStoreDetail(model, row, rows = []) {
  if (!row) return null;
  const district = model.districts[row.d], province = model.provinces[row.p];
  const units = row.u.map(i => model.units[i]);
  const unitSet = new Set(row.u);
  const sameBrand = rows.filter(r => r.b === row.b);
  const nearby = sameBrand.filter(r => r.key !== row.key && (row.u.length ? r.u.some(i => unitSet.has(i)) : r.d === row.d));
  const coLocated = rows.filter(r => r.key !== row.key && r.lon === row.lon && r.lat === row.lat).length;
  return {
    row, brand: model.brands[row.b], type: model.types[row.t], format: row.format >= 0 ? model.formats[row.format] : '',
    source: model.sources[row.s], venue: row.v >= 0 ? model.venues[row.v] : null,
    district, province, units, status: describeStatus(row), geometry: describeGeometry(model, row),
    nearby: nearby.slice(0, 12), nearbyCount: nearby.length, nearbyScope: row.u.length ? 'unit' : 'district',
    brandInProvince: sameBrand.filter(r => r.p === row.p).length, coLocated,
    noAddress: Boolean(row.flags & FLAG_NO_ADDRESS),
    formatEvidence: row.refresh && !row.supplemental ? {name: model.formats[row.format], ...row.refresh.evidence, sourceFormat: row.sourceFacts?.format} : null,
    operationalEvidence: row.supplemental ? readOperationalEvidence(row.localDetail?.operationalEvidence) : null,
    hostLocationEvidence: row.supplemental ? readHostLocationEvidence(row.localDetail?.hostLocationEvidence) : null,
    production: row.supplemental ? '' : units.length ? productionURL(model, {unit: units[0].index}) : productionURL(model, {province: province.index}),
    estimate: model.meta?.estimates?.[row.type] || null,
  };
}
