/** The accepted raw building footprint, separate from quiet city context. */
export const BUILDING_LAYERS = Object.freeze({source: 'joined-buildings', fill: 'joined-buildings-plan', extrusion: 'joined-buildings-3d', line: 'joined-buildings-outline'});
const empty = () => ({type: 'FeatureCollection', features: []});
function palette() {
  const read = (key, fallback) => typeof document !== 'undefined' && typeof getComputedStyle === 'function'
    ? getComputedStyle(document.documentElement).getPropertyValue(key).trim() || fallback : fallback;
  return {fill: read('--map-active-layer', '#347DA8'), line: read('--map-selected-stroke', '#176B82')};
}

export function installSpatialBuildings(map, {beforeId, onSelect} = {}) {
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  const colors = palette();
  map.addSource(BUILDING_LAYERS.source, {type: 'geojson', data: empty()});
  map.addLayer({id: BUILDING_LAYERS.fill, type: 'fill', source: BUILDING_LAYERS.source, minzoom: 13,
    filter: ['!=', ['get', 'renderAs'], 'outline'],
    paint: {'fill-color': colors.fill, 'fill-opacity': 0.32}}, before);
  map.addLayer({id: BUILDING_LAYERS.extrusion, type: 'fill-extrusion', source: BUILDING_LAYERS.source, minzoom: 13,
    filter: ['!=', ['get', 'renderAs'], 'outline'],
    paint: {'fill-extrusion-color': colors.fill, 'fill-extrusion-height': ['+', ['coalesce', ['get', 'height'], 0], 0.4],
      'fill-extrusion-base': ['coalesce', ['get', 'base'], 0], 'fill-extrusion-opacity': 0.88, 'fill-extrusion-vertical-gradient': true}}, before);
  map.addLayer({id: BUILDING_LAYERS.line, type: 'line', source: BUILDING_LAYERS.source, minzoom: 13,
    paint: {'line-color': colors.line, 'line-width': 1.5, 'line-opacity': 0.9}}, before);
  const click = e => {
    if (e.originalEvent?.__citymeterHandled) return;
    const layers = [BUILDING_LAYERS.extrusion, BUILDING_LAYERS.fill, BUILDING_LAYERS.line].filter(id => map.getLayer(id));
    const f = map.queryRenderedFeatures(e.point, {layers})[0];
    if (!f) return;
    if (e.originalEvent) e.originalEvent.__citymeterHandled = true;
    const keys = String(f.properties?.storeKeys || '').split(',').filter(Boolean);
    if (keys.length) onSelect?.(keys);
  };
  map.on('click', click);
  function update(collection = empty(), {view3d = true} = {}) {
    // Rendering-only lift prevents z-fighting; exported geometry and height stay raw.
    const features = (collection.features || []).map(f => ({...f, properties: {...f.properties, storeKeys: Array.isArray(f.properties?.storeKeys) ? f.properties.storeKeys.join(',') : f.properties?.storeKeys || ''}}));
    map.getSource(BUILDING_LAYERS.source)?.setData({type: 'FeatureCollection', features});
    if (map.getLayer(BUILDING_LAYERS.fill)) map.setLayoutProperty(BUILDING_LAYERS.fill, 'visibility', view3d ? 'none' : 'visible');
    if (map.getLayer(BUILDING_LAYERS.line)) { map.setLayoutProperty(BUILDING_LAYERS.line, 'visibility', 'visible'); map.setFilter(BUILDING_LAYERS.line, view3d ? ['==', ['get', 'renderAs'], 'outline'] : ['all']); }
    if (map.getLayer(BUILDING_LAYERS.extrusion)) map.setLayoutProperty(BUILDING_LAYERS.extrusion, 'visibility', view3d ? 'visible' : 'none');
  }
  function dispose() {
    map.off('click', click);
    for (const id of [BUILDING_LAYERS.line, BUILDING_LAYERS.extrusion, BUILDING_LAYERS.fill]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(BUILDING_LAYERS.source)) map.removeSource(BUILDING_LAYERS.source);
  }
  return {update, dispose};
}
