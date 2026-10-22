#!/usr/bin/env node
/** Local-only point containment against the29 accepted venue host footprints. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {polygonHit, chooseHit, STATUSES, GUARD_METRES} from './build-spatial-joins.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const emptyCounts = () => Object.fromEntries(STATUSES.map(status => [status, 0]));
const PRECISION_NOTE = 'The unchanged Grocery display point comes from a z10/extent4096 CityMETER MVT grid (about9.55m Web Mercator), rounded to5 decimal degrees by this demo. The10m boundary guard is a geometric review threshold, not validated accuracy or an error radius. Upstream points may be displaced farther. point_inside describes only the plotted source coordinate, never confirmed tenancy or true shopfront location.';

/** Local equirectangular metres around the tested point, preserving source rings. */
export function referenceHit(lon, lat, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const rad = Math.PI / 180, xFactor = 6371008.8 * rad * Math.cos(lat * rad), yFactor = 6371008.8 * rad;
  let best = null;
  for (const rings of polygons) {
    const outer = rings[0];
    if (!outer?.length || !outer.some(([x]) => x <= lon) || !outer.some(([x]) => x >= lon) || !outer.some(([, y]) => y <= lat) || !outer.some(([, y]) => y >= lat)) continue;
    const local = rings.map(ring => ring.map(([x, y]) => [(x - lon) * xFactor, (y - lat) * yFactor]));
    const hit = polygonHit([0, 0], local);
    if (hit && (!best || hit.boundaryDistanceM > best.boundaryDistanceM)) best = hit;
  }
  return best;
}

export function chooseReferenceHit(hits) {
  if (!hits.length) return {status: 'unavailable', buildingId: null, candidateIds: [], boundaryDistanceM: null, reason: 'limited_reference_coverage'};
  return {...chooseHit(hits), reason: 'verified_venue_footprint_geometry'};
}

export async function buildReferenceJoins(root = ROOT) {
  const [groceryBytes, areasBytes, referenceBytes] = await Promise.all(['data/grocery.json', 'data/areas.json', 'data/venue-reference-buildings.json'].map(path => readFile(join(root, path))));
  const grocery = JSON.parse(groceryBytes), areas = JSON.parse(areasBytes), reference = JSON.parse(referenceBytes);
  const footprints = reference.buildings.features.filter(feature => feature.properties.geometryRole === 'venue_reference_footprint');
  const hosts = new Map(footprints.map(feature => [feature.id, feature]));
  if (hosts.size !== footprints.length || hosts.size !== reference.meta.venueCount) throw new Error('Reference host/venue accounting mismatch');
  for (const feature of footprints) if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type) || feature.id !== feature.properties.buildingId) throw new Error('Invalid reference footprint');
  const storeFields = Object.fromEntries(grocery.fields.map((field, index) => [field, index]));
  const pCode = areas.provinces.fields.indexOf('code'), dProvince = areas.districts.fields.indexOf('p');
  const provinces = new Map(areas.provinces.rows.map(row => [row[pCode], {stores: {}, buildings: new Map(), counts: emptyCounts()}]));
  const counts = emptyCounts(), seen = new Set();
  for (const row of grocery.rows) {
    const key = row[storeFields.id], lon = row[storeFields.lon], lat = row[storeFields.lat];
    if (seen.has(key) || !Number.isFinite(lon) || !Number.isFinite(lat)) throw new Error('Invalid or duplicate Grocery point');
    seen.add(key);
    const provinceCode = areas.provinces.rows[areas.districts.rows[row[storeFields.district]][dProvince]][pCode], province = provinces.get(provinceCode);
    const hits = [];
    for (const feature of footprints) {
      const hit = referenceHit(lon, lat, feature.geometry);
      if (hit) {
        hits.push({buildingId: feature.id, ...hit});
        province.buildings.set(feature.id, feature);
      }
    }
    const result = chooseReferenceHit(hits);
    const selected = result.buildingId ? hosts.get(result.buildingId) : null;
    province.stores[key] = {...result, sourceURL: selected?.properties.sourceURL || reference.meta.sourceURL};
    province.counts[result.status]++; counts[result.status]++;
  }
  const meta = {
    asOf: reference.meta.asOf, generatedOn: new Date().toISOString(),
    provider: 'OpenStreetMap / CityMETER verified venue references',
    sourceURL: reference.meta.sourceURL, sourceSHA256: reference.meta.sourceSHA256,
    referenceFile: 'data/venue-reference-buildings.json', referenceSHA256: sha256(referenceBytes),
    geometryAsOf: reference.meta.geometryAsOf, sourceCheckedOn: reference.meta.sourceCheckedOn,
    coverage: 'verified_venue_references_only', referenceVenueCount: footprints.length,
    referenceFeatureCount: reference.buildings.features.length, guardMetres: GUARD_METRES,
    precisionNote: PRECISION_NOTE, inputRows: grocery.rows.length,
    inputDataSha256: sha256(groceryBytes), inputAreasSha256: sha256(areasBytes),
    processingComplete: true, nationwideBuildingCoverage: false,
    networkRequests: 0, license: reference.meta.license,
    attribution: reference.meta.attribution, attributionURL: reference.meta.attributionURL,
  };
  const method = {
    join: 'unchanged source point tested against accepted original venue host footprints including holes',
    geometry: 'unmodified Polygon/MultiPolygon host footprints; display parts do not count as separate overlapping hosts',
    point_inside: 'exactly one containing host footprint has boundary clearance >=10m',
    boundary_candidate: 'containing host footprint(s), all with boundary clearance <10m',
    ambiguous: 'more than one containing host footprint has boundary clearance >=10m',
    unavailable: 'no containing footprint in the limited verified venue reference set; this is not nationwide building coverage',
    no_building: 'not assigned by this limited-coverage reference pipeline',
    reviewThreshold: 'The10m guard is a geometric review threshold only, not validated positional accuracy or an error radius.',
    identity: 'accepted venue reference host IDs and original source URLs are preserved; no nearest-building assignment',
    tenancy: 'geometric containment does not establish venue identity, tenancy, floor, current operation or true shopfront coordinates',
    heights: 'source height/base/heightRole are preserved; zero/unknown is not measured height',
    attribution: reference.meta.attribution, license: reference.meta.license,
  };
  await mkdir(join(root, 'data/spatial'), {recursive: true});
  const provinceIndex = {};
  for (const [provinceCode, province] of provinces) {
    const features = [...province.buildings.values()].sort((a, b) => a.id.localeCompare(b.id));
    const payload = {
      meta: {...meta, provinceCode, inputRows: Object.keys(province.stores).length, counts: province.counts, buildingCount: features.length},
      stores: Object.fromEntries(Object.entries(province.stores).sort(([a], [b]) => a.localeCompare(b))),
      buildings: {type: 'FeatureCollection', features},
    };
    const text = JSON.stringify(payload) + '\n', url = `data/spatial/${provinceCode}.json`;
    await writeFile(join(root, url), text);
    provinceIndex[provinceCode] = {url, counts: province.counts, stores: Object.keys(province.stores).length, buildings: features.length, bytes: Buffer.byteLength(text), sha256: sha256(text)};
  }
  const manifest = {meta, provinces: provinceIndex, counts, method};
  await writeFile(join(root, 'data/spatial-joins.json'), JSON.stringify(manifest) + '\n');
  console.log(JSON.stringify({referenceVenues: footprints.length, referenceFeatures: reference.buildings.features.length, rows: seen.size, provinces: provinces.size, counts, outputBytes: Object.values(provinceIndex).reduce((sum, item) => sum + item.bytes, 0)}));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildReferenceJoins();
