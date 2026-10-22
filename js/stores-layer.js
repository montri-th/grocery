/**
 * Store dots — every filtered source row as one WebGL circle (27,607 rows; no
 * aggregation, no clustering, source coordinates unchanged).
 *
 *  - focus dots: rows of the focused part (the current area, its top-k children,
 *    the open unit or venue) in their store-type colour (logos.css --type-*,
 *    LDS categorical series), drawn up to zoom 14; from there the HTML pins of
 *    js/pins.js (logos, keyboard tour, leader lines) take over for the rows in view;
 *  - context dots: every other filtered row, small and quiet, at every zoom;
 *  - a selected ring for the open store.
 * Dots fade in between zoom 7 and 8, so the country view reads as a choropleth
 * first. Focus changes only swap filter expressions (no data upload).
 */
export const STORE_LAYERS = Object.freeze({source: 'stores', context: 'stores-context', focus: 'stores-focus', selected: 'stores-selected'});
export const DOT_DETAIL_ZOOM = 14;
const TYPES = ['C_STORE', 'SUPERMARKET', 'HYPERMARKET', 'WHOLESALE', 'PHARMACY'];
const TYPE_VAR = {C_STORE: '--type-c-store', SUPERMARKET: '--type-supermarket', HYPERMARKET: '--type-hypermarket', WHOLESALE: '--type-wholesale', PHARMACY: '--type-pharmacy'};

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/** Resolve the store-type colours from CSS (var() chains resolve in computed style). */
export function typeColors() {
  const fallback = {C_STORE: '#49C0BC', SUPERMARKET: '#EAC578', HYPERMARKET: '#E39B6E', WHOLESALE: '#6196D1', PHARMACY: '#D88381'};
  return Object.fromEntries(TYPES.map(t => [t, cssVar(TYPE_VAR[t], fallback[t])]));
}

/** GeoJSON for the rows (only what the expressions need). */
export function storeFeatures(rows) {
  const features = [];
  for (const r of rows) {
    if (!Number.isFinite(r.lon) || !Number.isFinite(r.lat)) continue;
    features.push({type: 'Feature', geometry: {type: 'Point', coordinates: [r.lon, r.lat]},
      properties: {k: r.key, t: r.type, p: r.p, d: r.d, u0: r.u[0] ?? -1, u1: r.u[1] ?? -1, v: r.v}});
  }
  return {type: 'FeatureCollection', features};
}

/**
 * Focus expression for the circle filters.
 * focus = {level: 'all'|'province'|'district'|'unit'|'venue'|'none', ids: number[]}
 */
export function focusExpression(focus = {level: 'all'}) {
  const ids = ['literal', focus.ids || []];
  switch (focus.level) {
    case 'province': return ['in', ['get', 'p'], ids];
    case 'district': return ['in', ['get', 'd'], ids];
    case 'unit': return ['any', ['in', ['get', 'u0'], ids], ['in', ['get', 'u1'], ids]];
    case 'venue': return ['in', ['get', 'v'], ids];
    case 'none': return ['any'];
    default: return ['all'];
  }
}

export function installStoresLayer(map, {onSelect, beforeId} = {}) {
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  map.addSource(STORE_LAYERS.source, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, promoteId: 'k'});
  let focusExpr = focusExpression({level: 'all'}), selectedKey = '';
  const typeColor = colors => ['match', ['get', 't'], ...TYPES.flatMap(t => [t, colors[t]]), cssVar('--text-muted', '#7B877D')];
  const fadeIn = ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1];
  map.addLayer({
    id: STORE_LAYERS.context, type: 'circle', source: STORE_LAYERS.source, filter: ['!', focusExpr],
    paint: {
      'circle-color': cssVar('--text-disabled', '#A7B3A9'),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 10, 1.2, 13, 2, 16, 2.6],
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.75],
    },
  }, before);
  map.addLayer({
    id: STORE_LAYERS.focus, type: 'circle', source: STORE_LAYERS.source, maxzoom: DOT_DETAIL_ZOOM, filter: focusExpr,
    paint: {
      'circle-color': typeColor(typeColors()),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 1.8, 11, 2.6, 13, 3.4, 14, 3.8],
      'circle-stroke-color': cssVar('--map-marker-stroke', '#182327'),
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0, 10, 0.4, 13, 0.8],
      'circle-opacity': fadeIn, 'circle-stroke-opacity': fadeIn,
    },
  }, before);
  map.addLayer({
    id: STORE_LAYERS.selected, type: 'circle', source: STORE_LAYERS.source, filter: ['==', ['get', 'k'], ''],
    paint: {
      'circle-color': 'transparent', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 5, 14, 9],
      'circle-stroke-color': cssVar('--map-selected-stroke', '#176B82'), 'circle-stroke-width': 2.5,
    },
  });
  const clickable = [STORE_LAYERS.focus, STORE_LAYERS.context];
  const onClick = e => {
    if (e.originalEvent?.__citymeterHandled) return;
    const f = map.queryRenderedFeatures(e.point, {layers: clickable.filter(id => map.getLayer(id))})[0];
    if (!f) return;
    if (e.originalEvent) e.originalEvent.__citymeterHandled = true;
    onSelect?.(f.properties.k);
  };
  // Registered before the area click so a dot wins over the area under it.
  map.on('click', onClick);
  const onMove = e => {
    const over = map.getZoom() >= 8 && map.queryRenderedFeatures(e.point, {layers: clickable.filter(id => map.getLayer(id))}).length > 0;
    map.__citymeterPointer = over;
    map.getCanvas().style.cursor = over ? 'pointer' : (map.getCanvas().style.cursor === 'pointer' ? '' : map.getCanvas().style.cursor);
  };
  map.on('mousemove', onMove);

  function update(rows) { map.getSource(STORE_LAYERS.source)?.setData(storeFeatures(rows)); }
  function setFocus(focus) {
    focusExpr = focusExpression(focus);
    if (map.getLayer(STORE_LAYERS.focus)) map.setFilter(STORE_LAYERS.focus, focusExpr);
    if (map.getLayer(STORE_LAYERS.context)) map.setFilter(STORE_LAYERS.context, ['!', focusExpr]);
  }
  function select(key = '') {
    selectedKey = key || '';
    if (map.getLayer(STORE_LAYERS.selected)) map.setFilter(STORE_LAYERS.selected, ['==', ['get', 'k'], selectedKey]);
  }
  function retheme() {
    if (map.getLayer(STORE_LAYERS.focus)) {
      map.setPaintProperty(STORE_LAYERS.focus, 'circle-color', typeColor(typeColors()));
      map.setPaintProperty(STORE_LAYERS.focus, 'circle-stroke-color', cssVar('--map-marker-stroke', '#182327'));
    }
    if (map.getLayer(STORE_LAYERS.context)) map.setPaintProperty(STORE_LAYERS.context, 'circle-color', cssVar('--text-disabled', '#A7B3A9'));
    if (map.getLayer(STORE_LAYERS.selected)) map.setPaintProperty(STORE_LAYERS.selected, 'circle-stroke-color', cssVar('--map-selected-stroke', '#176B82'));
  }
  function dispose() {
    map.off('click', onClick); map.off('mousemove', onMove);
    for (const id of [STORE_LAYERS.selected, STORE_LAYERS.focus, STORE_LAYERS.context]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(STORE_LAYERS.source)) map.removeSource(STORE_LAYERS.source);
  }
  return {update, setFocus, select, retheme, dispose, selected: () => selectedKey};
}
