/** Lazy, immutable spatial-join snapshots. A polygon match is not a tenancy check. */
export function createSpatialStore({fetchImpl = (...args) => fetch(...args), timeout = 15000} = {}) {
  const tasks = new Map(), values = new Map(), controllers = new Set();
  let references = null, referenceTask = null;
  let disposed = false;
  async function ensure(code) {
    code = String(code);
    if (!/^\d{2}$/.test(code)) throw new Error('Invalid province code');
    if (disposed) throw new Error('Spatial data store disposed');
    if (!tasks.has(code)) {
      const controller = new AbortController(); controllers.add(controller);
      const task = (async () => {
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const r = await fetchImpl(`data/spatial/${code}.json`, {signal: controller.signal, cache: 'no-cache'});
          if (!r.ok) throw new Error(`Spatial data ${r.status}`);
          const value = await r.json();
          if (!value || typeof value.stores !== 'object' || !Array.isArray(value.buildings?.features)) throw new Error('Invalid spatial data');
          const byId = new Map(value.buildings.features.filter(validBuilding).map(f => [String(f.id ?? f.properties.buildingId), f]));
          const result = {...value, byId};
          if (!disposed) values.set(code, result);
          return result;
        } finally { clearTimeout(timer); controllers.delete(controller); }
      })().catch(e => { tasks.delete(code); throw e; });
      tasks.set(code, task);
    }
    return tasks.get(code);
  }
  async function ensureReferences() {
    if (disposed) throw new Error('Spatial data store disposed');
    if (!referenceTask) {
      const controller = new AbortController(); controllers.add(controller);
      referenceTask = (async () => {
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const r = await fetchImpl('data/venue-reference-buildings.json', {signal: controller.signal, cache: 'no-cache'});
          if (!r.ok) throw new Error(`Venue buildings ${r.status}`);
          const value = await r.json();
          if (!value || typeof value.venues !== 'object' || !Array.isArray(value.buildings?.features)) throw new Error('Invalid venue building data');
          const result = {...value, byId: new Map(value.buildings.features.filter(validBuilding).map(f => [String(f.id ?? f.properties.buildingId), f]))};
          if (!disposed) references = result;
          return result;
        } finally { clearTimeout(timer); controllers.delete(controller); }
      })().catch(e => { referenceTask = null; throw e; });
    }
    return referenceTask;
  }
  function dispose() { disposed = true; controllers.forEach(c => c.abort()); controllers.clear(); tasks.clear(); values.clear(); references = null; referenceTask = null; }
  return {ensure, peek: code => values.get(String(code)) || null, ensureReferences, peekReferences: () => references, dispose};
}

export function validBuilding(f) {
  return f?.type === 'Feature' && ['Polygon', 'MultiPolygon'].includes(f.geometry?.type) &&
    Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length > 0 && Boolean(f.id ?? f.properties?.buildingId);
}

/** Only a strict, unambiguous interior match may colour a building on the map. */
export function selectSpatialBuildings(model, rows, peek, references = null) {
  const features = new Map(), links = [], counts = {matched: 0, boundary: 0, ambiguous: 0, noBuilding: 0, unavailable: 0};
  for (const row of rows) {
    const code = model.provinces[row.p]?.code;
    const data = code ? peek(code) : null;
    const match = data?.stores?.[row.key];
    const feature = match?.status === 'point_inside' && match.buildingId ? data.byId.get(String(match.buildingId)) : null;
    if (feature) {
      const id = String(feature.id ?? feature.properties.buildingId);
      if (!features.has(id)) features.set(id, {...feature, id, properties: {...feature.properties, storeKeys: [], sourceFeatureId: feature.properties?.sourceFeatureId ?? null}});
      features.get(id).properties.storeKeys.push(row.key);
      counts.matched++;
    } else if (match?.status === 'boundary_candidate') counts.boundary++;
    else if (match?.status === 'ambiguous') counts.ambiguous++;
    else if (match?.status === 'no_building') counts.noBuilding++;
    else counts.unavailable++;
    links.push({key: row.key, status: feature ? 'point_inside' : match?.status || 'unavailable', buildingId: feature ? String(feature.id ?? feature.properties.buildingId) : null});
  }
  const referenceFeatures = new Map(), referenceVenues = new Set(), referencedRows = new Set();
  for (const row of rows) {
    const venue = row.v >= 0 ? model.venues[row.v] : null;
    const reference = venue && references?.venues?.[venue.id];
    if (reference?.status !== 'venue_reference') continue;
    let found = false;
    for (const id of reference.buildingIds || []) {
      const f = references.byId.get(String(id));
      if (!f) continue;
      if (!referenceFeatures.has(String(id))) referenceFeatures.set(String(id), {...f, id: String(id), properties: {...f.properties, storeKeys: []}});
      referenceFeatures.get(String(id)).properties.storeKeys.push(row.key);
      found = true;
    }
    if (found) { referenceVenues.add(venue.id); referencedRows.add(row.key); }
  }
  // A named venue reference may be shown without a point-in-polygon match. It
  // never upgrades that point's status or changes its location.
  const pointFeatures = [...features.values()];
  const selectedPoints = pointFeatures.map(f => ({...f, properties: {...f.properties, storeKeys: f.properties.storeKeys.filter(k => !referencedRows.has(k))}})).filter(f => f.properties.storeKeys.length);
  return {total: rows.length, ...counts, buildingCount: features.size, links,
    pointBuildings: pointFeatures,
    referenceCount: referenceFeatures.size, referenceVenueCount: referenceVenues.size,
    collection: {type: 'FeatureCollection', features: [...selectedPoints, ...referenceFeatures.values()]}};
}

function footprintSource(properties) {
  const p = properties || {}, provider = String(p.provider || p.sourceLabel || '').toLowerCase();
  let label = '', fallbackURL = '';
  if (/verified_reference/.test(provider)) {
    label = 'OpenStreetMap / CityMETER'; fallbackURL = 'https://www.openstreetmap.org/copyright';
  } else if (/citymeter/.test(provider) || /^citymeter_/.test(p.heightRole || '')) {
    label = 'CityMETER'; fallbackURL = 'https://landometer.com/v3/citymeter?d=building';
  } else if (/microsoft|msml|globalml/.test(provider)) {
    label = 'Microsoft'; fallbackURL = 'https://github.com/microsoft/GlobalMLBuildingFootprints';
  } else {
    label = String(p.sourceLabel || p.provider || '').trim();
    if (label.length > 60) label = 'แหล่งข้อมูลอาคาร';
  }
  let url = '';
  try {
    const candidate = new URL(p.sourcePageURL || fallbackURL);
    if (['http:', 'https:'].includes(candidate.protocol) && !/\.(?:gz|pbf|zip|json|geojson)$/i.test(candidate.pathname)) url = candidate.href;
  } catch {}
  if (!url) url = fallbackURL;
  return label ? {label, url} : null;
}

function hasSourceHeight(properties) {
  const p = properties || {}, role = String(p.heightRole || '');
  if (/unknown|fallback|missing|unavailable/.test(role)) return false;
  const raw = [p.sourceHeightM, p.rawSourceHeight, p.rawsourceHeight, p.rawHeight].find(value => value !== null && value !== undefined && value !== '');
  if (raw !== undefined) return Number.isFinite(Number(raw)) && Number(raw) > 0;
  return Boolean(role) && Number.isFinite(Number(p.height)) && Number(p.height) > 0;
}

function pointBuildingEvidence(summary) {
  const buildings = summary.pointBuildings || [], sources = new Map();
  for (const feature of buildings) {
    const source = footprintSource(feature.properties);
    if (source) sources.set(`${source.label}/${source.url}`, source);
  }
  const known = buildings.filter(feature => hasSourceHeight(feature.properties)).length;
  const heightLabel = !buildings.length ? '' : known === buildings.length ? 'ความสูงเป็นค่าประมาณจากแหล่งข้อมูล'
    : known ? 'ความสูงบางอาคารเป็นค่าประมาณ บางอาคารยังไม่มีข้อมูล' : 'ยังไม่มีความสูงอาคาร';
  return {sources: [...sources.values()], heightLabel};
}

/** Human-facing state; source precision stays in the existing coordinate fact. */
export function buildingFact(summary, loading = false) {
  if (loading) return {label: 'กำลังโหลดข้อมูลอาคาร…', state: 'loading'};
  if (!summary || (!summary.total || summary.unavailable === summary.total)) return {label: 'ยังไม่มีข้อมูลอาคารสำหรับพิกัดนี้', state: 'unavailable'};
  if (summary.matched) return {label: `${summary.buildingCount.toLocaleString('th-TH')} อาคารตามพิกัดสาขา`, detail: summary.total > 1 ? `จับคู่ได้ ${summary.matched.toLocaleString('th-TH')} จาก ${summary.total.toLocaleString('th-TH')} สาขา` : 'พิกัดอยู่ภายในขอบเขตอาคาร', state: 'matched', ...pointBuildingEvidence(summary)};
  if (summary.boundary || summary.ambiguous) return {label: 'ยังระบุอาคารไม่ได้แน่ชัด', detail: 'พิกัดใกล้ขอบอาคารหรือมีอาคารซ้อนกัน', state: 'uncertain'};
  return {label: 'ไม่พบขอบเขตอาคารที่ครอบพิกัด', state: 'unmatched'};
}

export const referenceBuildingFact = summary => summary?.referenceCount
  ? {label: 'อาคารของสถานที่ตามชื่อสาขา', state: 'reference'} : null;
