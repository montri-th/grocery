/**
 * Venue level — the fifth crumb (ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน ›
 * สถานที่) as a level of its own on the map, in the same form as CityMETER
 * Luxury Brands 0.5 (owner instruction 2026-10-22, release 0.2):
 *   - at an area level the reference buildings of the venues its focused rows
 *     name are drawn as "อาคารของสถานที่" and open the venue when clicked;
 *   - at venue level (a venue, or a store whose branch name names a venue) the
 *     venue's own buildings are the framing target of the two-point camera
 *     (camera.js `eye`), the occlusion target of the eye scene (massing.js) and
 *     the solid drawn by the x-ray (venue-xray.js).
 *
 * Evidence stays separate (js/spatial-store.js, data/venue-joins.json):
 *   venue_reference — a footprint linked to the venue by exact name/source id
 *                     (data/venue-reference-buildings.json, 29 venues);
 *   point_inside    — a footprint the store's plotted point falls inside
 *                     (data/spatial/<province>.json).
 * Neither is a tenancy claim, a height measurement or a reason to move a point.
 * Pure functions: no DOM, no map — tested in tests/venue-level.test.js.
 */
import {outerRings} from './massing.js?v=20261025-fp1';

export const EVIDENCE = Object.freeze({reference: 'venue_reference', point: 'point_inside'});
/** Display-only height for an extruded footprint without a source height (never quoted as a fact). */
export const DISPLAY_FALLBACK_HEIGHT_M = 3;

const empty = () => ({type: 'FeatureCollection', features: []});
const list = value => (Array.isArray(value) ? value : String(value ?? '').split(',').filter(Boolean));

/** The venue being looked at: the open venue, or the venue a store's branch name names. */
export function venueOf(model, panel, rowByKey) {
  if (panel?.mode === 'venue') return model.venues[panel.id] || null;
  if (panel?.mode === 'store') { const r = rowByKey(panel.id); return r && r.v >= 0 ? model.venues[r.v] || null : null; }
  return null;
}

/** Venue level = a venue panel, or a store whose branch name names a venue. */
export const isVenueLevel = (panel, venue) => panel?.mode === 'venue' || (panel?.mode === 'store' && Boolean(venue));

/** Reference ids of a venue (empty unless the reference is an accepted venue_reference). */
export function referenceIds(references, venueId) {
  const ref = references?.venues?.[venueId];
  return ref?.status === EVIDENCE.reference ? (ref.buildingIds || []).map(String) : [];
}

/**
 * Area level: the reference buildings of the venues named by `rows`, each tagged
 * with the store keys and venue indexes that refer to it. Never a nearest-building
 * guess: a venue without an accepted reference draws nothing here.
 */
export function areaVenueBuildings(model, rows, references) {
  if (!references?.byId || !rows?.length) return empty();
  const keysByVenue = new Map();
  for (const r of rows) {
    if (!(r.v >= 0)) continue;
    if (!keysByVenue.has(r.v)) keysByVenue.set(r.v, []);
    keysByVenue.get(r.v).push(r.key);
  }
  const features = new Map();
  for (const [index, keys] of keysByVenue) {
    const venue = model.venues[index];
    if (!venue) continue;
    for (const id of referenceIds(references, venue.id)) {
      const f = references.byId.get(id);
      if (!f) continue;
      if (!features.has(id)) features.set(id, {...f, id, properties: {...f.properties, storeKeys: [], venueIndexes: [], evidence: EVIDENCE.reference}});
      const p = features.get(id).properties;
      for (const k of keys) if (!p.storeKeys.includes(k)) p.storeKeys.push(k);
      if (!p.venueIndexes.includes(index)) p.venueIndexes.push(index);
    }
  }
  return {type: 'FeatureCollection', features: [...features.values()]};
}

/**
 * Venue/store level: tag the selection's buildings (js/spatial-store.js
 * selectSpatialBuildings → collection) with their evidence, and reference
 * buildings with the venue indexes that name them. Returns new objects.
 */
export function tagVenueFeatures(collection, model, references, rows = []) {
  const features = collection?.features || [];
  if (!features.length) return empty();
  const venueByBuilding = new Map();
  for (const index of new Set(rows.filter(r => r.v >= 0).map(r => r.v))) {
    const venue = model.venues[index];
    if (!venue) continue;
    for (const id of referenceIds(references, venue.id)) {
      if (!venueByBuilding.has(id)) venueByBuilding.set(id, []);
      venueByBuilding.get(id).push(index);
    }
  }
  return {type: 'FeatureCollection', features: features.map(f => {
    const id = String(f.id ?? f.properties?.buildingId ?? '');
    const venues = venueByBuilding.get(id) || [];
    return {...f, properties: {...f.properties, venueIndexes: venues, evidence: venues.length ? EVIDENCE.reference : EVIDENCE.point}};
  })};
}

/** Which kinds of building the legend has to name. */
export function buildingKinds(collection) {
  const features = collection?.features || [];
  return {venue: features.some(f => f.properties?.evidence === EVIDENCE.reference), point: features.some(f => f.properties?.evidence !== EVIDENCE.reference)};
}

/**
 * The current venue's own buildings in the displayed collection: its accepted
 * reference footprints/parts; without a reference, the footprints that its rows'
 * plotted points fall inside.
 */
export function venueHostFeatures(collection, {venue, references, rowKeys = []} = {}) {
  const features = collection?.features || [];
  if (!venue || !features.length) return [];
  const ids = new Set(referenceIds(references, venue.id));
  const own = features.filter(f => ids.has(String(f.id ?? f.properties?.buildingId ?? '')));
  if (own.length) return own;
  const keys = new Set(rowKeys);
  return features.filter(f => f.properties?.evidence !== EVIDENCE.reference && list(f.properties?.storeKeys).some(k => keys.has(k)));
}

/** Display height of a building: an outline parent lies flat; an extrusion without a source height uses the display fallback. */
export function displayHeight(feature) {
  const p = feature?.properties || {};
  if (p.renderAs === 'outline') return 0;
  const h = Number(p.height);
  return Number.isFinite(h) && h > 0 ? h : DISPLAY_FALLBACK_HEIGHT_M;
}

/** Occlusion and framing targets: [{ring, height}] per outer ring. */
export function venueTargets(features) {
  return (features || []).flatMap(f => outerRings(f).map(ring => ({ring, height: displayHeight(f)})));
}

/** Solids for the x-ray: extruded parts only (an outline parent is the footprint drawn flat). */
export function xrayFeatures(features) {
  return (features || []).filter(f => f.properties?.renderAs !== 'outline').map(f => ({...f, properties: {...f.properties, height: displayHeight(f), base: Math.max(0, Number(f.properties?.base) || 0)}}));
}

/** Ground and roof vertices for a pitched fit that keeps the whole solid in frame (camera.js fitPitched). */
export function venueFramePoints(targets, points = []) {
  const ground = [...targets.flatMap(t => t.ring.map(([lng, lat]) => [lng, lat, 0])), ...points.map(([lng, lat]) => [lng, lat, 0])];
  const roof = targets.filter(t => t.height > 0).flatMap(t => t.ring.map(([lng, lat]) => [lng, lat, t.height]));
  return {ground, roof};
}

/**
 * What a click on a drawn building opens: at an area level or from a store, a
 * reference building opens its venue (the venue crumb); otherwise the store the
 * building holds (the open store first).
 */
export function buildingClickTarget({mode, id, venueIndexes = [], storeKeys = [], hasVenue = () => true, hasStore = () => true} = {}) {
  const venue = venueIndexes.find(hasVenue);
  if (venue != null && mode !== 'venue') return {type: 'venue', index: venue};
  const key = mode === 'store' && storeKeys.includes(id) ? id : storeKeys.find(hasStore);
  return key ? {type: 'store', key} : null;
}
