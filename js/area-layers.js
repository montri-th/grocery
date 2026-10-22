/**
 * Area choropleth on the MapLibre map: provinces, districts and local units.
 *
 * Three GeoJSON sources (provinces always; districts and units of the open
 * province, loaded on drill-down) share one rule set:
 *  - the comparison set of the current level is filled with its LDS sample
 *    (scales.js rank-41: all 41 samples; count or per-capita), the rest of the map stays quiet:
 *      country  → provinces filled              (fill below zoom 9)
 *      province → its districts filled          (fill below zoom 12)
 *      district → its units filled              (fill below zoom 14.5)
 *      unit     → its sibling units, the unit itself in focus
 *  - focus + quiet: with a focus (auto top-k, explicit ?areas=, or the open unit)
 *    only focused areas keep their fill; the others keep a quiet outline;
 *  - the selected ancestors keep a selected outline so the drill path stays visible.
 * Fills sit beneath the basemap's first line layer, so roads and labels stay
 * readable above an exact, opaque data colour. Above the fill zoom only the
 * outlines remain and the store pins carry the reading (hard switch, no fade).
 *
 * Geometry is uploaded only when a layer's feature set changes; every
 * selection, focus or metric change is applied as feature-state (fill, filled,
 * quiet, outlined, selected, zero), so the 77 province polygons are never
 * re-tiled for a click.
 *
 * EVID-05 states: measured · measured_zero (sample 0 + zero outline) ·
 * no_data (neutral fill, per-capita without population) · out_of_scope (not drawn).
 * Every area of an open layer has an invisible hit layer, so a click anywhere
 * inside a quiet area still drills into it.
 */
export const FILL_MAX_ZOOM = Object.freeze({province: 9, district: 12, unit: 14.5});
export const LABEL_MAX_ZOOM = Object.freeze({province: 9.5, district: 12.5, unit: 16.5});
const LEVELS = ['province', 'district', 'unit'];
export const AREA_LAYERS = Object.freeze(Object.fromEntries(LEVELS.map(l => [l, {
  source: `areas-${l}`, fill: `${l}-fill`, zero: `${l}-zero-outline`, outline: `${l}-outline`, selected: `${l}-selected`, hit: `${l}-hit`,
}])));

function cssVar(name, fallback) {
  const value = typeof getComputedStyle === 'function' && typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return value || fallback;
}

/** First basemap line layer id, so data fills stay under roads and labels. */
export function firstLineLayerId(map) {
  const layers = map.getStyle()?.layers || [];
  return (layers.find(l => l.type === 'line') || layers.find(l => l.type === 'symbol'))?.id;
}

export function bboxOfFeature(feature) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = v => { if (typeof v[0] === 'number') { if (v[0] < w) w = v[0]; if (v[0] > e) e = v[0]; if (v[1] < s) s = v[1]; if (v[1] > n) n = v[1]; } else v.forEach(walk); };
  walk(feature.geometry.coordinates);
  return [w, s, e, n];
}

const CLEAR = 'transparent';
const stateColor = name => ['coalesce', ['feature-state', name], CLEAR];

/**
 * Install the three area sources and their layers. `onSelect(level, index)` is
 * called for a click inside any area of an open layer (most specific first).
 * `linesBefore` puts the outlines under the store dots.
 *
 * Every per-area look is a colour in feature-state (fill, zero, line, sel) —
 * "off" is a transparent colour — because MapLibre 5.6.2 fails to evaluate
 * feature-state inside fill-opacity / line-opacity ("expression.evaluate is not
 * a function", observed 2026-10-22), while feature-state colours work.
 */
export function installAreaLayers(map, {onSelect, linesBefore} = {}) {
  const beforeId = firstLineLayerId(map);
  const lineBefore = linesBefore && map.getLayer(linesBefore) ? linesBefore : undefined;
  let colors = readColors();
  function readColors() {
    return {quiet: cssVar('--border-default', '#C9D0CB'), emphasis: cssVar('--border-emphasis', '#7D877F'),
      selected: cssVar('--map-selected-stroke', '#176B82'), zero: cssVar('--data-zero-outline', '#7D877F')};
  }
  const widths = {
    province: ['interpolate', ['linear'], ['zoom'], 5, 0.8, 9, 1.2, 12, 1.6],
    district: ['interpolate', ['linear'], ['zoom'], 7, 0.7, 10, 1.1, 13, 1.6],
    unit: ['interpolate', ['linear'], ['zoom'], 9, 0.6, 12, 1, 15, 1.6],
  };
  const dash = {province: null, district: [4, 2], unit: [3, 2]};
  for (const level of LEVELS) {
    const L = AREA_LAYERS[level];
    map.addSource(L.source, {type: 'geojson', data: {type: 'FeatureCollection', features: []}, promoteId: 'key'});
    map.addLayer({id: L.hit, type: 'fill', source: L.source, paint: {'fill-color': '#000000', 'fill-opacity': 0}}, beforeId);
    map.addLayer({id: L.fill, type: 'fill', source: L.source, maxzoom: FILL_MAX_ZOOM[level],
      paint: {'fill-color': stateColor('fill'), 'fill-opacity': 1, 'fill-antialias': true}}, beforeId);
    map.addLayer({id: L.zero, type: 'line', source: L.source, maxzoom: FILL_MAX_ZOOM[level],
      paint: {'line-color': stateColor('zero'), 'line-width': 1.6}}, beforeId);
    const outline = {'line-color': stateColor('line'), 'line-width': widths[level]};
    if (dash[level]) outline['line-dasharray'] = dash[level];
    map.addLayer({id: L.outline, type: 'line', source: L.source, paint: outline}, lineBefore);
    map.addLayer({id: L.selected, type: 'line', source: L.source,
      paint: {'line-color': stateColor('sel'), 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.6, 10, 2.4, 14, 3]}}, lineBefore);
  }
  const hitOrder = ['unit', 'district', 'province'].map(l => AREA_LAYERS[l].hit);
  const navigable = new Map(LEVELS.map(l => [l, new Set()]));
  const onClick = e => {
    if (e.originalEvent?.__citymeterHandled || !onSelect) return;
    const hits = map.queryRenderedFeatures(e.point, {layers: hitOrder.filter(id => map.getLayer(id))});
    for (const level of ['unit', 'district', 'province']) {
      const f = hits.find(h => h.layer.id === AREA_LAYERS[level].hit && navigable.get(level).has(h.properties?.key));
      if (f) { if (e.originalEvent) e.originalEvent.__citymeterHandled = true; onSelect(level, Number(f.properties.index)); return; }
    }
  };
  map.on('click', onClick);
  const onMove = e => {
    if (map.__citymeterPointer) return;
    const hits = map.queryRenderedFeatures(e.point, {layers: hitOrder.filter(id => map.getLayer(id))});
    const over = hits.some(h => navigable.get(h.properties?.level)?.has(h.properties?.key));
    map.getCanvas().style.cursor = over ? 'pointer' : '';
  };
  map.on('mousemove', onMove);

  const signatures = new Map(), states = new Map(LEVELS.map(l => [l, new Map()]));
  let lastLayers = {};
  // Feature-state set while a GeoJSON source is re-tiling can miss the new tiles (MapLibre 5.6.2):
  // once the source reports loaded, every known state of that level is written again.
  const pending = new Set();
  const onSourceData = e => {
    const level = LEVELS.find(l => AREA_LAYERS[l].source === e.sourceId);
    if (!level || !pending.has(level) || !map.isSourceLoaded(e.sourceId)) return;
    pending.delete(level);
    for (const [key, value] of states.get(level)) map.setFeatureState({source: e.sourceId, id: key}, value);
  };
  map.on('sourcedata', onSourceData);
  /**
   * layers: {province|district|unit: [{feature, index, key, name, fill, filled, quiet, outlined, selected, zero, nav}]}.
   * A level absent from `layers` is emptied. Geometry is re-uploaded only when the key list changes.
   */
  function update(layers = {}) {
    lastLayers = layers;
    for (const level of LEVELS) {
      const L = AREA_LAYERS[level], list = layers[level] || [];
      const signature = list.map(a => a.key).join('|');
      const src = map.getSource(L.source);
      if (!src) continue;
      if (signatures.get(level) !== signature) {
        signatures.set(level, signature);
        try { map.removeFeatureState({source: L.source}); } catch {}
        states.get(level).clear();
        src.setData({type: 'FeatureCollection', features: list.map(a => ({type: 'Feature', geometry: a.feature.geometry,
          properties: {key: a.key, index: a.index, level, name: a.name}}))});
        pending.add(level);
      }
      const nav = navigable.get(level); nav.clear();
      const known = states.get(level);
      for (const a of list) {
        if (a.nav !== false) nav.add(a.key);
        const next = {
          fill: a.filled && a.fill ? a.fill : CLEAR,
          zero: a.filled && a.zero ? colors.zero : CLEAR,
          line: a.outlined === false ? CLEAR : (a.quiet ? colors.quiet : colors.emphasis),
          sel: a.selected ? colors.selected : CLEAR,
        };
        const prev = known.get(a.key);
        if (prev && prev.fill === next.fill && prev.zero === next.zero && prev.line === next.line && prev.sel === next.sel) continue;
        known.set(a.key, next);
        map.setFeatureState({source: L.source, id: a.key}, next);
      }
    }
  }
  function retheme() {
    colors = readColors();
    for (const level of LEVELS) states.get(level).clear();
    update(lastLayers);
  }
  function dispose() {
    map.off('click', onClick); map.off('mousemove', onMove); map.off('sourcedata', onSourceData);
    for (const level of LEVELS) {
      const L = AREA_LAYERS[level];
      for (const id of [L.selected, L.outline, L.zero, L.fill, L.hit]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(L.source)) map.removeSource(L.source);
    }
  }
  return {update, retheme, dispose};
}

/**
 * HTML labels for the compared areas: name + value badge (count or per-capita).
 * Collision-managed against each other and the map chrome; shown within a zoom window.
 */
export function installAreaLabels(map, container, {onSelect, reservedBottom = () => 0, hostLabel = 'พื้นที่บนแผนที่'} = {}) {
  const host = document.createElement('div');
  host.id = 'area-labels';
  host.className = 'area-labels';
  host.setAttribute('aria-label', hostLabel);
  container.append(host);
  let labels = [], frame = 0, window_ = {min: 0, max: Infinity}, detailZoom = Infinity;
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  function layout() {
    const width = container.clientWidth, height = container.clientHeight - reservedBottom();
    const panel = container.closest('.map-panel'), rect = container.getBoundingClientRect();
    const chrome = [...panel.querySelectorAll('.map-toolbar, .map-legend, .map-status, .map-aha, .maplibregl-ctrl-top-right')]
      .filter(e => e.offsetWidth && e.offsetHeight)
      .map(e => { const b = e.getBoundingClientRect(); return {left: b.left - rect.left - 4, right: b.right - rect.left + 4, top: b.top - rect.top - 4, bottom: b.bottom - rect.top + 4}; });
    const placed = [];
    const zoom = map.getZoom();
    panel.classList.toggle('is-detail-zoom', zoom >= detailZoom);
    const inWindow = zoom >= window_.min && zoom < window_.max;
    for (const e of labels) {
      const p = map.project(e.center);
      e.button.hidden = !(inWindow && p.x > 0 && p.x < width && p.y > 48 && p.y < height);
      if (e.button.hidden) continue;
      const w = e.button.offsetWidth, h = e.button.offsetHeight;
      let position = null;
      for (const [dx, dy] of [[0, 0], [0, -26], [0, 26], [-36, 0], [36, 0], [0, -52], [0, 52]]) {
        const x = p.x + dx, y = p.y + dy;
        const box = {left: x - w / 2 - 3, right: x + w / 2 + 3, top: y - h / 2 - 2, bottom: y + h / 2 + 2};
        if (box.left < 4 || box.right > width - 4 || box.top < 48 || box.bottom > height || placed.some(b => overlaps(box, b)) || chrome.some(b => overlaps(box, b))) continue;
        position = {x, y, box};
        break;
      }
      e.button.hidden = !position;
      if (position) { e.button.style.left = `${position.x}px`; e.button.style.top = `${position.y}px`; placed.push(position.box); }
    }
  }
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };

  /**
   * areas: [{index, level, key, name, center:[lon,lat], valueLabel, aria, state, quiet, selected, rank (1 = first)}]
   * opts: {minZoom, maxZoom, detailZoom}
   */
  function update(areas, {minZoom = 0, maxZoom = Infinity, detailZoom: dz = Infinity} = {}) {
    window_ = {min: minZoom, max: maxZoom}; detailZoom = dz;
    host.replaceChildren();
    labels = [];
    const ordered = [...areas].sort((a, b) => Number(b.selected) - Number(a.selected) || Number(!b.quiet) - Number(!a.quiet) || (a.rank ?? 1e9) - (b.rank ?? 1e9));
    for (const a of ordered) {
      if (!a.center) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `area-label level-${a.level} is-${a.state}${a.selected ? ' is-selected' : ''}${a.quiet ? ' is-quiet' : ''}`;
      button.innerHTML = '<span class="label-name"></span><span class="label-count data-number" aria-hidden="true"></span>';
      button.querySelector('.label-name').textContent = a.name;
      button.querySelector('.label-count').textContent = a.valueLabel;
      button.setAttribute('aria-label', a.aria || a.name);
      button.title = a.aria || a.name;
      button.setAttribute('aria-pressed', String(Boolean(a.selected)));
      if (a.state === 'measured_zero') button.classList.add('is-zero');
      button.onclick = () => onSelect?.(a.level, a.index);
      host.append(button);
      labels.push({button, center: a.center});
    }
    schedule();
  }
  map.on('move', schedule);
  map.on('resize', schedule);
  return {update, layout: schedule, dispose() { cancelAnimationFrame(frame); map.off('move', schedule); map.off('resize', schedule); host.remove(); }};
}
