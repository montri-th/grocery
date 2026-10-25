/** Reviewed retail observations augment the source snapshot without rewriting it. */
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const clone = value => JSON.parse(JSON.stringify(value));

function requireValue(ok, message) {
  if (ok) return;
  const error = new Error(`Retail refresh: ${message}`);
  error.resource = 'data/retail-refresh.json'; error.phase = 'retail-refresh';
  throw error;
}
function publicURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}
function checkedEvidence(value) {
  requireValue(value && publicURL(value.url) && isoDate(value.checkedOn), 'missing dated source evidence');
  return Object.freeze(clone(value));
}
function sourceFacts(row, model) {
  return Object.freeze({key: row.key, brandIndex: row.b, brandId: row.brandId, typeIndex: row.t, typeId: row.type,
    formatIndex: row.format, format: model.formats[row.format] || null, name: row.name,
    longitude: row.lon, latitude: row.lat, districtIndex: row.d, provinceIndex: row.p,
    unitIndexes: Object.freeze([...row.u]), sourceIndex: row.s, sourceKey: model.sources[row.s].key,
    venueIndex: row.v, flags: row.flags, layer: 'citymeter_source_snapshot'});
}

/** Returns derived display rows; base rows, source metadata and registries stay intact. */
export function applyRetailRefresh(base, refresh) {
  requireValue(refresh?.schema === 'citymeter-retail-refresh-v1' && isoDate(refresh.checkedOn), 'invalid schema/date');
  requireValue(refresh.baseline?.pointRows === base.rows.length && refresh.baseline?.apiTotal === base.meta.apiTotal, 'source snapshot count mismatch');
  for (const key of ['brands', 'sources', 'existing', 'supplemental']) requireValue(Array.isArray(refresh[key]), `missing ${key} array`);
  requireValue(refresh.brands.length === 0, 'this format refresh must preserve the source brand registry');
  const brands = base.brands.map(b => ({...b})), sources = base.sources.map(s => ({...s}));
  const venues = base.venues.map(v => ({...v, aliases: [...v.aliases]}));
  const formats = [...base.formats], brandIndex = new Map(brands.map(b => [b.id, b.index]));
  const sourceIndex = new Map(sources.map(s => [s.key, s.index]));
  const venueIndex = new Map(venues.map(v => [v.id, v.index]));
  const districtIndex = new Map(base.districts.map(d => [d.code, d.index]));
  const unitIndex = new Map(base.units.map(u => [u.key, u.index]));
  for (const format of refresh.formats || []) {
    requireValue(typeof format === 'string' && format && !formats.includes(format), 'invalid/duplicate refresh format');
    formats.push(format);
  }
  const formatFamilies = [], familyIds = new Set(), familyByFormat = new Map();
  for (const family of refresh.formatFamilies || []) {
    requireValue(family && typeof family.id === 'string' && family.name && !familyIds.has(family.id) && !brandIndex.has(family.id) &&
      brandIndex.has(family.parentBrandId) && Array.isArray(family.formats) && family.formats.length &&
      family.formats.every(format => formats.includes(format) && !familyByFormat.has(format)), 'invalid/duplicate format family');
    const entry = Object.freeze(clone(family)); formatFamilies.push(entry); familyIds.add(entry.id);
    for (const format of entry.formats) familyByFormat.set(format, entry);
  }
  for (const source of refresh.sources) {
    requireValue(source && typeof source.key === 'string' && !sourceIndex.has(source.key) && source.label && source.date && publicURL(source.url), 'invalid/duplicate refresh source');
    const index = sources.length; sources.push({...clone(source), index}); sourceIndex.set(source.key, index);
  }
  for (const venue of refresh.venues || []) {
    requireValue(venue && typeof venue.id === 'string' && !venueIndex.has(venue.id) && venue.name && venue.type && venue.typeTh &&
      (venue.aliases === undefined || Array.isArray(venue.aliases)), 'invalid/duplicate refresh venue');
    const index = venues.length;
    venues.push({...clone(venue), index, logo: venue.logo || '', role: venue.role || 'none', aliases: [...(venue.aliases || [])]});
    venueIndex.set(venue.id, index);
  }
  const rows = base.rows.map(row => ({...row, u: [...row.u], sourceFacts: sourceFacts(row, base),
    parentBrandId: brands[row.b].parentBrandId || row.brandId, supplemental: false}));
  const rowIndex = new Map(rows.map((r, i) => [r.key, i])), seenPatches = new Set(), officialIds = new Set();
  function selectedVenue(id) {
    requireValue(id === null || venueIndex.has(id), `unknown venue ${id}`);
    return id === null ? -1 : venueIndex.get(id);
  }
  function displayFields(brandId, format) {
    requireValue(brandIndex.has(brandId) && formats.includes(format), 'unknown display brand/format');
    const b = brandIndex.get(brandId), brand = brands[b];
    return {b, brand: brand.name, brandId, format: formats.indexOf(format), parentBrandId: brand.parentBrandId || brandId};
  }
  function reserveOfficialId(parentId, value) {
    if (!value) return;
    const id = `${parentId}:${value}`;
    requireValue(!officialIds.has(id), `duplicate official outlet ${id}`); officialIds.add(id);
  }
  for (const patch of refresh.existing) {
    requireValue(patch && rowIndex.has(patch.mapKey) && !seenPatches.has(patch.mapKey), 'unknown/duplicate source-row patch');
    const index = rowIndex.get(patch.mapKey), row = rows[index];
    requireValue(typeof patch.sourceOutletId === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(patch.sourceOutletId) &&
      patch.sourceOutletId.split('-')[0] === row.key, 'source UUID does not match map key');
    requireValue(row.brandId === patch.expectedSourceBrandId && row.type === patch.expectedSourceTypeId &&
      base.formats[row.format] === patch.expectedSourceFormat, `source identity guard failed for ${row.key}`);
    requireValue(!['longitude', 'latitude', 'lon', 'lat', 'districtCode', 'unitKeys', 'name', 'typeId'].some(key => own(patch, key)), 'a format patch cannot change source location/name/type');
    const evidence = checkedEvidence(patch.evidence), display = displayFields(patch.brandId, patch.format);
    requireValue(patch.brandId === row.brandId && brands[display.b].types.includes(row.type), 'a format patch cannot change source brand/type');
    reserveOfficialId(display.parentBrandId, evidence.branchCode);
    rows[index] = {...row, ...display, ...(own(patch, 'venueId') ? {v: selectedVenue(patch.venueId)} : {}),
      sourceOutletId: patch.sourceOutletId, refresh: Object.freeze({checkedOn: refresh.checkedOn, evidence})};
    seenPatches.add(row.key);
  }
  const supplementIds = new Set();
  for (const item of refresh.supplemental) {
    requireValue(item && typeof item.key === 'string' && /^[a-z0-9][a-z0-9:_-]{1,127}$/i.test(item.key) && !rowIndex.has(item.key), 'duplicate/invalid supplemental map key');
    requireValue(typeof item.sourceId === 'string' && item.sourceId && sourceIndex.has(item.sourceKey), 'missing supplemental source identity');
    const sourceId = `${item.sourceKey}:${item.sourceId}`;
    requireValue(!supplementIds.has(sourceId), 'duplicate supplemental source record'); supplementIds.add(sourceId);
    const display = displayFields(item.brandId, item.format), t = base.types.findIndex(type => type.id === item.typeId);
    requireValue(t >= 0 && brands[display.b].types.includes(item.typeId), 'unknown supplemental type');
    requireValue(typeof item.name === 'string' && item.name && Number.isFinite(item.longitude) && Number.isFinite(item.latitude) &&
      item.longitude >= 97 && item.longitude <= 106 && item.latitude >= 5 && item.latitude <= 21 && item.coordinateRole, 'invalid supplemental source point');
    requireValue(districtIndex.has(item.districtCode) && Array.isArray(item.unitKeys) && item.unitKeys.every(key => unitIndex.has(key)) &&
      new Set(item.unitKeys).size === item.unitKeys.length && item.administrativeEvidence?.method, 'missing verified administrative mapping');
    const d = districtIndex.get(item.districtCode), p = base.districts[d].p, u = item.unitKeys.map(key => unitIndex.get(key));
    requireValue(u.every(index => base.units[index].p === p), 'supplemental unit/province mismatch');
    requireValue(item.detail && (typeof item.detail.address === 'string' || item.detail.address === null), 'missing supplemental local detail');
    requireValue(item.aliases === undefined || (Array.isArray(item.aliases) && item.aliases.every(alias => typeof alias === 'string')), 'invalid supplemental aliases');
    const evidence = checkedEvidence(item.evidence);
    requireValue(!evidence.branchCode || evidence.branchCode === item.sourceId, 'supplemental branch/source ID mismatch');
    requireValue(!own(item.detail, 'sourceContactStatus') || !evidence.contactStatusType || item.detail.sourceContactStatus === evidence.contactStatusType, 'conflicting contact status observations');
    reserveOfficialId(display.parentBrandId, item.sourceId);
    const row = {key: item.key, id: item.key, ...display, t, type: item.typeId, name: item.name,
      lon: item.longitude, lat: item.latitude, d, p, u, s: sourceIndex.get(item.sourceKey),
      v: selectedVenue(item.venueId ?? null), flags: item.detail.address ? 0 : 2,
      supplemental: true, sourceOutletId: sourceId, coordinateRole: item.coordinateRole, aliases: [...(item.aliases || [])],
      localDetail: Object.freeze({...clone(item.detail), uuid: item.detail.officialBranchUUID || evidence.officialBranchUUID || `${display.parentBrandId}:${item.sourceId}`}),
      administrativeEvidence: Object.freeze(clone(item.administrativeEvidence)),
      refresh: Object.freeze({checkedOn: refresh.checkedOn, evidence})};
    row.sourceFacts = Object.freeze({...sourceFacts(row, {formats, sources}), sourceId: item.sourceId,
      layer: 'official_verified_supplement', coordinateRole: item.coordinateRole});
    rowIndex.set(row.key, rows.length); rows.push(row);
  }
  for (const row of rows) {
    const family = familyByFormat.get(formats[row.format]);
    if (family) {
      requireValue(family.parentBrandId === row.brandId, 'format family/parent brand mismatch');
      row.formatFamilyId = family.id; row.formatLogoKey = family.logoKey || '';
    }
  }
  const parentGroups = [...new Set(formatFamilies.map(f => f.parentBrandId))].map(id => ({id,
    sourceRows: base.rows.filter(row => row.brandId === id || base.brands[row.b].parentBrandId === id).length,
    supplementalRows: rows.filter(row => row.supplemental && row.parentBrandId === id).length,
    displayedRows: rows.filter(row => row.parentBrandId === id).length}));
  return {...base, brands, sources, venues, formats, formatFamilies, rows,
    sourceMeta: clone(base.meta), sourceRows: base.rows.map(row => ({...row, u: [...row.u]})),
    meta: {...base.meta, sourcePointRows: base.rows.length, supplementalPointRows: refresh.supplemental.length,
      pointRows: rows.length, retailRefreshCheckedOn: refresh.checkedOn, countBasis: 'source_rows_plus_verified_supplement_not_production_api'},
    retailRefresh: {checkedOn: refresh.checkedOn, sourcePointRows: base.rows.length, sourceApiTotal: base.meta.apiTotal,
      supplementalRows: refresh.supplemental.length, existingFormatRows: refresh.existing.length, displayedPointRows: rows.length, parentGroups}};
}
