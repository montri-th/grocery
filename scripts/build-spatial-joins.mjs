#!/usr/bin/env node
/**
 * Join the unchanged display points to raw, snapshot-pinned OpenFreeMap building
 * polygons. The 10 m guard is deliberately conservative for Grocery's z10 MVT
 * coordinate grid and the public demo's five-decimal coordinate representation.
 * No nearest-building fallback, relocation, geocoding or tenancy assertion.
 *
 * node scripts/build-spatial-joins.mjs --probe 3
 * This retained analysis is NOT the public reference-only join pipeline.
 * Public-service extraction is limited to4 requests,3000tiles and50MB;
 * larger extraction requires --provider-permission <permission-receipt-path>.
 * Raw tile cache + HTTP/SHA receipts live OUTSIDE the public repository.
 */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, appendFile, rename} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseVectorTile, lonLatToTile, lonLatToTileUnits, tileToLonLat} from '../js/mvt.js';
import {signedArea} from '../js/geometry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const GUARD_METRES = 10;
export const STATUSES = ['point_inside', 'boundary_candidate', 'ambiguous', 'no_building', 'unavailable'];
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const AS_OF = '2026-10-22';
export const PUBLIC_SERVICE_LIMITS = {tiles: 3000, bytes: 50_000_000, concurrency: 4};
const USER_AGENT = 'CityMETER-Grocery-Research/0.1 (+https://montri-th.github.io/grocery/)';
const PRECISION_NOTE = 'The unchanged Grocery display point comes from a z10/extent4096 CityMETER MVT grid (about9.55m Web Mercator), rounded to5 decimal degrees by this demo. The10m boundary guard is a geometric review threshold, not validated accuracy or an error radius. Upstream points may be displaced farther. point_inside describes only the plotted source coordinate, never confirmed tenancy or true shopfront location.';
const sha256 = x => createHash('sha256').update(x).digest('hex');
const emptyCounts = () => Object.fromEntries(STATUSES.map(k => [k, 0]));
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Boundary-aware ring classifier: -1 outside,0 boundary,1 interior. */
export function ringLocation(p, ring, epsilon = 1e-7) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (distanceToSegment(p, a, b) <= epsilon) return 0;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 1 : -1;
}

/** Outer followed by holes, using MVT y-down winding. Reject malformed or zero rings. */
export function polygonComponents(rings) {
  const polys = [];
  for (const ring of rings) {
    if (ring.length < 4 || Math.abs(signedArea(ring)) < 1e-8) continue;
    if (signedArea(ring) > 0) polys.push([ring]);
    else if (polys.length) polys.at(-1).push(ring);
  }
  return polys;
}

/** Contains/covers geometry with holes; boundary points remain candidates. */
export function polygonHit(p, rings, metresPerUnit = 1) {
  const outer = ringLocation(p, rings[0]);
  if (outer < 0) return null;
  let boundary = outer === 0;
  for (const hole of rings.slice(1)) {
    const loc = ringLocation(p, hole);
    if (loc > 0) return null;
    if (loc === 0) boundary = true;
  }
  let distance = Infinity;
  for (const ring of rings) for (let i = 1; i < ring.length; i++) distance = Math.min(distance, distanceToSegment(p, ring[i - 1], ring[i]));
  return {boundaryDistanceM: boundary ? 0 : distance * metresPerUnit};
}

export function chooseHit(hits, guard = GUARD_METRES) {
  const sorted = [...hits].sort((a, b) => a.buildingId.localeCompare(b.buildingId));
  const deep = sorted.filter(h => h.boundaryDistanceM >= guard);
  return {
    status: deep.length > 1 ? 'ambiguous' : deep.length === 1 ? 'point_inside' : sorted.length ? 'boundary_candidate' : 'no_building',
    buildingId: deep.length === 1 ? deep[0].buildingId : null,
    candidateIds: sorted.map(h => h.buildingId),
    boundaryDistanceM: sorted.length ? round(Math.min(...(deep.length === 1 ? deep : sorted).map(h => h.boundaryDistanceM))) : null,
  };
}

/** A source tile feature can merge thousands of disjoint same-height buildings. */
export function buildingComponentId(tileKey, sourceFeatureId, rings, tileTemplate) {
  return 'ofm-' + sha256(JSON.stringify([tileTemplate, tileKey, sourceFeatureId ?? null, rings])).slice(0, 28);
}

function bbox(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
  return [minX, minY, maxX, maxY];
}

function componentsFromTile(bytes, tile, template, sourceURL) {
  const layer = parseVectorTile(bytes).layers.building;
  if (!layer) return {extent: 4096, components: []};
  const components = [];
  for (const feature of layer.features) {
    if (feature.type !== 3 || feature.properties.hide_3d === true) continue;
    for (const [componentIndex, rings] of polygonComponents(feature.rings()).entries()) {
      const tileKey = `${tile.z}/${tile.x}/${tile.y}`;
      const buildingId = buildingComponentId(tileKey, feature.id, rings, template);
      const height = Number(feature.properties.render_height), base = Number(feature.properties.render_min_height);
      components.push({buildingId, rings, bbox: bbox(rings[0]), feature: {
        type: 'Feature', id: buildingId,
        geometry: {type: 'Polygon', coordinates: rings.map(r => r.map(p => tileToLonLat(p[0], p[1], tile, layer.extent)))},
        properties: {buildingId, sourceFeatureId: feature.id ?? null, sourceComponent: componentIndex, tile: tileKey, sourceURL,
          height: Number.isFinite(height) ? height : 0, base: Number.isFinite(base) ? base : 0,
          heightRole: 'osm_context', geometryRole: 'raw_mvt_polygon_component', geometrySha256: sha256(JSON.stringify(rings))},
      }});
    }
  }
  return {extent: layer.extent, components};
}

export function assertServiceLimits(tileCount, decodedBytes = 0, providerPermission = false) {
  if (!providerPermission && (tileCount > PUBLIC_SERVICE_LIMITS.tiles || decodedBytes > PUBLIC_SERVICE_LIMITS.bytes)) {
    throw Object.assign(new Error('OpenFreeMap public-service batch limit: at most3000tiles and50MB; larger extraction requires an explicit provider permission receipt.'), {code: 'SERVICE_LIMIT_EXCEEDED'});
  }
}

function consumeBudget(budget, bytes) {
  if (!budget) return;
  if (budget.error) throw budget.error;
  try { assertServiceLimits(budget.tiles, budget.bytes + bytes, budget.providerPermission); }
  catch (error) { budget.error = error; budget.controller.abort(error); throw error; }
  budget.bytes += bytes;
}

async function fetchBytes(url, budget = null) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const signal = budget ? AbortSignal.any([AbortSignal.timeout(30000), budget.controller.signal]) : AbortSignal.timeout(30000);
      const response = await fetch(url, {headers: {'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate, br'}, signal});
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
      const chunks = [];
      for await (const chunk of response.body) { consumeBudget(budget, chunk.byteLength); chunks.push(chunk); }
      return {bytes: new Uint8Array(Buffer.concat(chunks)), status: response.status, contentEncoding: response.headers.get('content-encoding'), contentLength: Number(response.headers.get('content-length')) || null};
    } catch (error) { if (budget?.error) throw budget.error; last = error; if (attempt < 2) await new Promise(r => setTimeout(r, 300 * 2 ** attempt)); }
  }
  throw last;
}

function argValue(args, name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
async function atomicJSON(path, value) { await writeFile(path + '.tmp', JSON.stringify(value) + '\n'); await rename(path + '.tmp', path); }

export async function build(args = process.argv.slice(2)) {
  const concurrency = Math.min(PUBLIC_SERVICE_LIMITS.concurrency, Math.max(1, Number(argValue(args, '--concurrency', 4)) || 4));
  const probe = Number(argValue(args, '--probe', 0)) || 0;
  const cacheRoot = resolve(argValue(args, '--cache', join(ROOT, '..', 'tile-cache')));
  const groceryBytes = await readFile(join(ROOT, 'data/grocery.json')), areasBytes = await readFile(join(ROOT, 'data/areas.json'));
  const grocery = JSON.parse(groceryBytes), areas = JSON.parse(areasBytes);
  const storeFields = grocery.fields, provinceFields = areas.provinces.fields, districtFields = areas.districts.fields;
  const index = Object.fromEntries(storeFields.map((f, i) => [f, i]));
  const pCode = provinceFields.indexOf('code'), dProvince = districtFields.indexOf('p');
  const provinces = new Map(areas.provinces.rows.map(r => [r[pCode], {stores: {}, buildings: new Map(), counts: emptyCounts()}]));
  const rows = grocery.rows.map(r => ({key: r[index.id], lon: r[index.lon], lat: r[index.lat], province: areas.provinces.rows[areas.districts.rows[r[index.district]][dProvince]][pCode]}));
  if (new Set(rows.map(r => r.key)).size !== rows.length || rows.some(r => !Number.isFinite(r.lon) || !Number.isFinite(r.lat))) throw new Error('Invalid or duplicate input points');
  const tileStores = new Map();
  for (const row of rows) {
    const tile = lonLatToTile(row.lon, row.lat, 14), key = `${tile.z}/${tile.x}/${tile.y}`;
    if (!tileStores.has(key)) tileStores.set(key, {key, tile, rows: []});
    tileStores.get(key).rows.push(row);
  }
  let tasks = [...tileStores.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (probe) tasks = Array.from({length: Math.min(probe, tasks.length)}, (_, i) => tasks[Math.floor(i * (tasks.length - 1) / Math.max(1, probe - 1))]);
  const permissionPath = argValue(args, '--provider-permission', null);
  const permissionBytes = permissionPath ? await readFile(resolve(permissionPath)) : null;
  if (permissionBytes && !permissionBytes.toString('utf8').trim()) throw new Error('Provider permission receipt is empty');
  const providerPermission = permissionBytes ? {receiptFile: resolve(permissionPath), sha256: sha256(permissionBytes)} : null;
  assertServiceLimits(tasks.length, 0, Boolean(providerPermission));
  const budget = {tiles: tasks.length, bytes: 0, providerPermission: Boolean(providerPermission), controller: new AbortController(), error: null};
  await mkdir(cacheRoot, {recursive: true});
  let tileJSONReceipt;
  try {
    const result = await fetchBytes(TILEJSON_URL);
    const tileJSON = JSON.parse(new TextDecoder().decode(result.bytes));
    tileJSONReceipt = {url: TILEJSON_URL, retrievedOn: new Date().toISOString(), sha256: sha256(result.bytes), tileTemplate: tileJSON.tiles?.[0], tileJSON};
    if (!tileJSONReceipt.tileTemplate?.startsWith('https://tiles.openfreemap.org/planet/')) throw new Error('Unexpected tile template');
    await atomicJSON(join(cacheRoot, 'tilejson-current.json'), tileJSONReceipt);
  } catch (error) {
    tileJSONReceipt = JSON.parse(await readFile(join(cacheRoot, 'tilejson-current.json'), 'utf8'));
    console.warn('TileJSON fetch failed; using previously observed pinned receipt', error.message);
  }
  const template = argValue(args, '--tile-template', tileJSONReceipt.tileTemplate);
  const snapshot = template.match(/\/planet\/([^/]+)\//)?.[1];
  if (!snapshot) throw new Error('Snapshot-pinned tile URL required');
  const cacheDir = join(cacheRoot, snapshot); await mkdir(cacheDir, {recursive: true});
  await writeFile(join(cacheDir, `input-grocery-${sha256(groceryBytes)}.json`), groceryBytes);
  await writeFile(join(cacheDir, `input-areas-${sha256(areasBytes)}.json`), areasBytes);
  const receiptFile = join(cacheDir, 'receipts.jsonl'), receipts = new Map();
  try { for (const line of (await readFile(receiptFile, 'utf8')).split('\n').filter(Boolean)) { const r = JSON.parse(line); receipts.set(r.key, r); } } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const globalCounts = emptyCounts(), actual = {tiles: tasks.length, completeTiles: 0, failedTiles: 0, decodedBytes: 0, transportBytes: 0, cachedTiles: 0};
  let next = 0, lastProgress = 0; const start = Date.now();
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++], url = template.replace('{z}', task.tile.z).replace('{x}', task.tile.x).replace('{y}', task.tile.y), file = join(cacheDir, task.key.replaceAll('/', '_') + '.pbf');
      let bytes, receipt = receipts.get(task.key), parsed;
      try {
        if (receipt?.http === 200 && receipt.sourceURL === url) {
          try { const raw = await readFile(file); if (sha256(raw) === receipt.sha256) { consumeBudget(budget, raw.byteLength); bytes = raw; actual.cachedTiles++; } } catch (error) { if (error.code === 'SERVICE_LIMIT_EXCEEDED') throw error; }
        }
        if (!bytes) {
          const result = await fetchBytes(url, budget); bytes = result.bytes;
          receipt = {key: task.key, sourceURL: url, http: result.status, bytes: bytes.length, transportBytes: result.contentLength, contentEncoding: result.contentEncoding, sha256: sha256(bytes), retrievedOn: new Date().toISOString()};
          await writeFile(file + '.tmp', bytes); await rename(file + '.tmp', file);
          receipts.set(task.key, receipt); await appendFile(receiptFile, JSON.stringify(receipt) + '\n');
        }
        parsed = componentsFromTile(bytes, task.tile, template, url);
        actual.decodedBytes += bytes.length; actual.transportBytes += receipt.transportBytes || bytes.length; actual.completeTiles++;
        if (probe) console.log(JSON.stringify({probe: task.key, bytes: bytes.length, transportBytes: receipt.transportBytes, components: parsed.components.length, rows: task.rows.length}));
      } catch (error) {
        if (budget.error || error.code === 'SERVICE_LIMIT_EXCEEDED') throw budget.error || error;
        actual.failedTiles++; receipt = {key: task.key, sourceURL: url, http: error.status || null, error: error.message, retrievedOn: new Date().toISOString()};
        receipts.set(task.key, receipt); await appendFile(receiptFile, JSON.stringify(receipt) + '\n');
      }
      if (!probe) for (const row of task.rows) {
        const province = provinces.get(row.province); let result;
        if (!parsed) result = {status: 'unavailable', buildingId: null, candidateIds: [], boundaryDistanceM: null, sourceURL: url};
        else {
          const p = lonLatToTileUnits(row.lon, row.lat, task.tile, parsed.extent);
          const metres = 40075016.686 * Math.cos(row.lat * Math.PI / 180) / 2 ** task.tile.z / parsed.extent, hits = [];
          for (const component of parsed.components) {
            const b = component.bbox;
            if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) continue;
            const hit = polygonHit(p, component.rings, metres);
            if (hit) { hits.push({buildingId: component.buildingId, ...hit}); province.buildings.set(component.buildingId, component.feature); }
          }
          result = {...chooseHit(hits), sourceURL: url};
        }
        province.stores[row.key] = result; province.counts[result.status]++; globalCounts[result.status]++;
      }
      const done = actual.completeTiles + actual.failedTiles;
      if (!probe && (done >= lastProgress + 100 || done === tasks.length && done > lastProgress)) {
        lastProgress = done;
        const progress = {progress: done, total: tasks.length, seconds: round((Date.now() - start) / 1000, 1), decodedMB: round(actual.decodedBytes / 1e6, 1), transferMB: round(actual.transportBytes / 1e6, 1), failedTiles: actual.failedTiles, counts: {...globalCounts}, observedOn: new Date().toISOString()};
        await atomicJSON(join(cacheDir, 'progress.json'), progress);
        console.log(JSON.stringify(progress));
      }
    }
  }
  await Promise.all(Array.from({length: concurrency}, worker));
  const globalMeta = {asOf: AS_OF, generatedOn: new Date().toISOString(), provider: 'OpenFreeMap / OpenMapTiles / OpenStreetMap', tileURLTemplate: template, tileJSONURL: TILEJSON_URL, tileJSONSha256: tileJSONReceipt.sha256, zoom: 14, guardMetres: GUARD_METRES, precisionNote: PRECISION_NOTE, inputRows: rows.length, inputDataSha256: sha256(groceryBytes), inputAreasSha256: sha256(areasBytes), totalRequiredTiles: tileStores.size, complete: actual.failedTiles === 0, publicServiceLimits: PUBLIC_SERVICE_LIMITS, providerPermission, userAgent: USER_AGENT, ...actual};
  if (probe) { const out = {probe: true, ...globalMeta}; await atomicJSON(join(cacheDir, 'probe-summary.json'), out); console.log(JSON.stringify(out)); return out; }
  if (Object.values(globalCounts).reduce((a, b) => a + b, 0) !== rows.length) throw new Error('Output row accounting mismatch');
  const directory = join(ROOT, 'data/spatial'); await mkdir(directory, {recursive: true}); const provinceIndex = {};
  for (const [code, province] of provinces) {
    const features = [...province.buildings.values()].sort((a, b) => a.id.localeCompare(b.id));
    const payload = {meta: {...globalMeta, provinceCode: code, inputRows: Object.keys(province.stores).length, buildingCount: features.length}, stores: Object.fromEntries(Object.entries(province.stores).sort(([a], [b]) => a.localeCompare(b))), buildings: {type: 'FeatureCollection', features}};
    const text = JSON.stringify(payload) + '\n'; await writeFile(join(directory, code + '.json'), text);
    provinceIndex[code] = {url: `data/spatial/${code}.json`, counts: province.counts, stores: Object.keys(province.stores).length, buildings: features.length, bytes: Buffer.byteLength(text), sha256: sha256(text)};
  }
  const output = {meta: globalMeta, provinces: provinceIndex, counts: globalCounts, method: {
    join: 'unchanged point covered by raw MVT Polygon component including holes',
    point_inside: 'exactly one containing component has boundary clearance >=10m',
    boundary_candidate: 'containing component(s), all with boundary clearance <10m',
    ambiguous: 'more than one containing component has boundary clearance >=10m',
    no_building: 'no containing raw rendered-building component; no nearest fallback',
    unavailable: 'required source tile failed or could not be decoded',
    geometry: 'raw source Polygon component and holes, without rounding/offset/snap; a merged source feature may contain unrelated disjoint components',
    identity: 'snapshot-specific provider/tile/sourceFeatureId/geometry hash; not a validated OSM way/relation identity',
    heights: 'OpenMapTiles render heights are context/defaults, not measured floor or height claims',
    excluded: 'source hide_3d=true footprints are not rendered by the existing app and are excluded from this join',
    tenancy: 'geometric containment does not establish current operation, tenancy or venue identity',
    attribution: 'OpenFreeMap; ©OpenMapTiles; ©OpenStreetMap contributors (ODbL)',
  }};
  await atomicJSON(join(ROOT, 'data/spatial-joins.json'), output);
  await normalizeOutputMetadata(output, ROOT, tileJSONReceipt.sha256);
  await atomicJSON(join(cacheDir, 'join-summary.json'), output);
  console.log(JSON.stringify({complete: globalMeta.complete, tiles: actual, counts: globalCounts, provinces: Object.keys(provinceIndex).length, rows: rows.length, outputBytes: Object.values(provinceIndex).reduce((n, p) => n + p.bytes, 0)}));
  return output;
}

/** Validate province accounting and keep detail metadata scoped to that province. */
export async function normalizeOutputMetadata(output, root = ROOT, tileJSONSha256 = output.meta.tileJSONSha256) {
  const globalCounts = emptyCounts(); let total = 0;
  output.meta.tileJSONSha256 = tileJSONSha256; output.meta.precisionNote = PRECISION_NOTE;
  output.method.reviewThreshold = 'The10m guard is a conservative geometric review threshold only, not validated source accuracy or an error radius; upstream points may be displaced farther.';
  for (const [code, item] of Object.entries(output.provinces)) {
    const path = join(root, item.url), data = JSON.parse(await readFile(path, 'utf8'));
    const counts = emptyCounts(), sourceURLs = new Set(), failedURLs = new Set();
    for (const row of Object.values(data.stores)) {
      if (!STATUSES.includes(row.status)) throw new Error(`Unknown spatial status in${code}`);
      counts[row.status]++; globalCounts[row.status]++; total++; sourceURLs.add(row.sourceURL);
      if (row.status === 'unavailable') failedURLs.add(row.sourceURL);
    }
    const {tiles, completeTiles, failedTiles, decodedBytes, transportBytes, cachedTiles, totalRequiredTiles, ...scopeMeta} = data.meta;
    data.meta = {...scopeMeta, provinceCode: code, inputRows: Object.keys(data.stores).length, counts,
      sourceTiles: sourceURLs.size, failedSourceTiles: failedURLs.size, complete: counts.unavailable === 0,
      buildingCount: data.buildings.features.length, tileJSONSha256, precisionNote: PRECISION_NOTE};
    item.counts = counts;
    const text = JSON.stringify(data) + '\n'; await writeFile(path, text);
    item.bytes = Buffer.byteLength(text); item.sha256 = sha256(text);
  }
  if (total !== output.meta.inputRows) throw new Error('Province store totals do not match input rows');
  output.counts = globalCounts;
  await atomicJSON(join(root, 'data/spatial-joins.json'), output);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await build();
