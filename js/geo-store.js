/**
 * Lazy data for one province: district + local-unit boundaries
 * (data/geo/p/<code>.json, 35–720 KB) and store addresses/source tiles
 * (data/detail/<code>.json). Each file is fetched once and cached; a failed
 * fetch is retried on the next request and never blocks the rest of the app.
 */
const geo = new Map(), detail = new Map();

export async function fetchJSON(resource, {timeout = 15000} = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(resource, {signal: controller.signal, cache: 'no-cache'});
    if (!r.ok) { const e = new Error('โหลดข้อมูลไม่สำเร็จ'); e.status = r.status; throw e; }
    return await r.json();
  } catch (e) { e.resource = resource; e.phase = e.phase || 'data'; throw e; }
  finally { clearTimeout(timer); }
}

function cached(map, key, load) {
  if (!map.has(key)) {
    const task = load().catch(e => { map.delete(key); throw e; });
    map.set(key, task);
  }
  return map.get(key);
}

/** {districts: Map(code → Feature), units: Map(key → Feature)} for one province code ("10" …). */
export function loadProvinceGeo(code) {
  return cached(geo, code, async () => {
    const fc = await fetchJSON(`data/geo/p/${encodeURIComponent(code)}.json`);
    const districts = new Map(), units = new Map();
    for (const f of fc.features || []) {
      if (f?.properties?.l === 'd') districts.set(f.properties.k, f);
      else if (f?.properties?.l === 'u') units.set(f.properties.k, f);
    }
    return {districts, units};
  });
}
/** Synchronous peek (null until loaded). */
const settled = new Map();
export function provinceGeoNow(code) { return settled.get(code) || null; }
export async function ensureProvinceGeo(code) {
  const value = await loadProvinceGeo(code);
  settled.set(code, value);
  return value;
}

/** Store details of one province: Map(key → {uuid, address, subdistrict, subdistrictCode, tile, tileArea}). */
export function loadProvinceDetail(code) {
  return cached(detail, code, async () => {
    const d = await fetchJSON(`data/detail/${encodeURIComponent(code)}.json`);
    const fields = d.fields || [];
    return new Map(Object.entries(d.rows || {}).map(([key, values]) => [key, Object.fromEntries(fields.map((f, i) => [f, values[i]]))]));
  });
}
