/**
 * CityMETER · Grocery — application orchestration.
 *
 * One committed selection drives everything:
 *   filters  — search · brand · store type (js/model.js filterRows)
 *   sel      — {province, district, unit}: ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน
 *   panel    — overview (country/province/district) | unit | venue | store, with a back stack
 *   metric   — count | capita (stores per 10,000 registered residents)
 *   focus    — auto (top-k children of the Aha), explicit (?areas=a,b,c) or none (?areas=all)
 *
 * Row scopes, named consistently:
 *   filtered  — all rows after the filters (the stores layer draws them all; non-focus = quiet)
 *   scopeRows — filtered rows inside the selected area (unit = source members)
 *   rows      — the focused part: scopeRows narrowed by the focus (pins, table, counters)
 *
 * The first Aha (owner choice 2026-10-22, "สาขากระจุกเทียบคน") is recomputed
 * at every level: the share of the area's stores held by its top children
 * against their share of residents (js/hierarchy.js buildAha).
 *
 * Map: generated paper basemap (map-style.js) on OpenFreeMap tiles; area
 * choropleth (area-layers.js) with the LDS count / density.capita families;
 * every store a WebGL dot (stores-layer.js), HTML pins with logos from zoom 14
 * (pins.js); two-tier city massing in 3D (massing.js); camera presets (camera.js).
 * URL state: search, brand, type, province, district, unit, areas, metric, view,
 * store, place, view3d — restored on load. Core data first; the map (MapLibre
 * from a CDN), province geometry and store details are independent and retryable.
 */
import {buildModel, filterRows, hasPoint, unitName, districtNoun, unitNoun, perCapita, brandCount, withNoun} from './model.js?v=20261022-j1';
import {NO_SELECTION, normalizeSelection, levelOf, parentSelection, areaRows, childrenOf, summarizeChildren, rankChildren, buildAha, levelNouns, areaKey, CHILD_LEVEL} from './hierarchy.js';
import {buildClasses, classify, formatMetric, METRICS} from './scales.js';
import {renderInsightChart} from './charts.js';
import {loadMapLibrary} from './vendors.js';
import {installStorePins, LOGO_MIN_ZOOM, MAX_PINS} from './pins.js';
import {installStoresLayer, STORE_LAYERS} from './stores-layer.js';
import {installAreaLayers, installAreaLabels, FILL_MAX_ZOOM, LABEL_MAX_ZOOM, bboxOfFeature} from './area-layers.js';
import {configureBrandLogos, brandLogoMarkup} from './brand-logos.js';
import {configureVenueLogos} from './venue-logos.js';
import {typeMix, brandMix, buildUnitProfile, buildVenueProfile, buildStoreDetail} from './profile-model.js';
import {renderOverview, renderUnit, renderVenue, renderStore, renderFilterChips, link, esc, num} from './panel.js?v=20261022-j1';
import {buildMapStyle, basemapPalette, TILEJSON_URL, MASSING_BEFORE} from './map-style.js';
import {installMassing, outerRings} from './massing.js?v=20261022-j1';
import {presetFor, applyPreset, fitPitched, framePoint} from './camera.js';
import {buildBreadcrumb, renderBreadcrumb, breadcrumbText} from './breadcrumb.js';
import {fetchJSON, ensureProvinceGeo, provinceGeoNow, loadProvinceDetail} from './geo-store.js';
import {createSpatialStore, selectSpatialBuildings, buildingFact, referenceBuildingFact} from './spatial-store.js?v=20261022-j1';
import {installSpatialBuildings} from './spatial-layer.js?v=20261022-j1';

const $ = id => document.getElementById(id);
const FIELDS = ['search', 'brand', 'type'];
const THAILAND = [97.34, 5.61, 105.64, 20.46];
const BANGKOK = [100.33, 13.49, 100.94, 13.96];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobilePortrait = () => matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
const animate = () => !reduced();
const announce = text => { $('announcement').textContent = text; };
const theme = () => document.documentElement.dataset.theme;

const state = {
  model: null, provinceGeo: null,
  filters: {search: '', brand: '', type: ''}, filtered: [], filterKey: null,
  sel: {...NO_SELECTION}, metric: 'count',
  focusKeys: [], autoFocus: true, focus: {level: 'all', ids: []},
  panel: {mode: 'overview', id: ''}, history: [],
  scopeRows: [], rows: [], aha: null, compare: null,
  view: 'ranking', page: 0, view3d: true, showAreas: true,
  map: null, loaded: false, mapTheme: '', tileTemplate: '', initialCameraDone: false, skipInitialSelectionFit: false, lastPreset: '',
  pins: null, stores: null, areas: null, labels: null, massing: null, joinedBuildings: null, popup: null,
  storeDetail: null,
  spatial: {key: '', loading: false, summary: null},
};
const spatialData = createSpatialStore();
let spatialRequest = 0;

/** A deliberate selection may fit once after its geometry becomes available. */
export function createDeferredSelectionFit({currentKey, canFit, fit}) {
  let pending = '';
  return {
    arm(key) { pending = key || ''; },
    cancel() { pending = ''; },
    reconcile() { if (pending && pending !== currentKey()) pending = ''; },
    run(resolvedKey, options) {
      if (!pending || resolvedKey !== pending) return false;
      if (pending !== currentKey()) { pending = ''; return false; }
      if (!canFit()) return false;
      pending = '';
      fit(options);
      return true;
    },
  };
}

const deferredSelectionFit = createDeferredSelectionFit({
  currentKey: () => spatialSelectionKey(),
  canFit: () => state.loaded && !state.spatial.loading && Boolean(state.spatial.summary?.collection.features.length),
  fit: options => fitCurrent(options),
});
function cancelPendingSelectionFit() { deferredSelectionFit.cancel(); state.pendingFit = false; state.skipInitialSelectionFit = true; }
function armSelectionFit() { state.skipInitialSelectionFit = false; deferredSelectionFit.arm(spatialSelectionKey()); }

/* ---------- small helpers ---------- */
const M = () => state.model;
const level = () => levelOf(state.sel);
const province = () => (state.sel.province >= 0 ? M().provinces[state.sel.province] : null);
const districtLabel = d => `${districtNoun(M().provinces[d.p])}${d.name}`;
const unitLabel = u => unitName(u);
const rowByKey = key => M().rowByKey.get(key) || null;
const venueByIndex = i => (Number.isInteger(i) && i >= 0 ? M().venues[i] : null);
const bottomSpace = () => $('insights').getBoundingClientRect().height + 12;
const sheetOffset = () => (mobilePortrait() ? [0, -Math.round(window.innerHeight * 0.2)] : [0, 0]);
const focusMode = () => (state.focusKeys.length ? 'explicit' : state.autoFocus ? 'auto' : 'none');
const compareSelection = () => (level() === 'unit' ? parentSelection(state.sel) : state.sel);
const placeOf = r => [...r.u.map(i => unitLabel(M().units[i])), districtLabel(M().districts[r.d]), M().provinces[r.p].name].join(' · ');
const cameraPreset = () => presetFor({view3d: state.view3d, mode: state.panel.mode === 'overview' ? 'overview' : 'detail'});

/* ---------- URL ---------- */
function saveURL() {
  const p = new URLSearchParams(), f = state.filters, m = M();
  for (const k of FIELDS) if (f[k]) p.set(k, f[k]);
  if (state.sel.province >= 0) p.set('province', m.provinces[state.sel.province].abbr);
  if (state.sel.district >= 0) p.set('district', m.districts[state.sel.district].code);
  if (state.sel.unit >= 0) p.set('unit', m.units[state.sel.unit].key);
  if (state.focusKeys.length) p.set('areas', state.focusKeys.join(','));
  else if (!state.autoFocus) p.set('areas', 'all');
  if (state.metric !== 'count') p.set('metric', state.metric);
  if (state.view !== 'ranking') p.set('view', state.view);
  if (state.panel.mode === 'store') p.set('store', state.panel.id);
  if (state.panel.mode === 'venue') p.set('place', m.venues[state.panel.id]?.id || '');
  if (!state.view3d) p.set('view3d', '0');
  history.replaceState(null, '', location.pathname + (p.size ? '?' + p : ''));
}

function restoreFromURL() {
  const p = new URLSearchParams(location.search), m = M();
  for (const k of FIELDS) if (p.has(k)) state.filters[k] = p.get(k) || '';
  if (state.filters.brand && !m.brandById.has(state.filters.brand)) state.filters.brand = '';
  if (state.filters.type && !m.typeById.has(state.filters.type)) state.filters.type = '';
  let sel = {...NO_SELECTION};
  const prov = m.provinceByAbbr.get((p.get('province') || '').toUpperCase()) || m.provinceByCode.get(p.get('province') || '');
  if (prov) sel.province = prov.index;
  const dist = m.districtByCode.get(p.get('district') || '');
  if (dist) sel.district = dist.index;
  const unit = m.unitByKey.get(p.get('unit') || '');
  if (unit) sel.unit = unit.index;
  state.sel = normalizeSelection(m, sel);
  state.metric = p.get('metric') === 'capita' ? 'capita' : 'count';
  if (['ranking', 'mix', 'brands'].includes(p.get('view'))) state.view = p.get('view');
  const areas = p.get('areas') || '';
  if (areas === 'all') { state.autoFocus = false; state.focusKeys = []; }
  else state.focusKeys = [...new Set(areas.split(',').filter(Boolean))].slice(0, 3);
  state.view3d = p.get('view3d') !== '0';
  const store = rowByKey(p.get('store') || '');
  if (store) { state.panel = {mode: 'store', id: store.key}; state.sel = storeSelection(store); }
  else if (p.get('place')) {
    const v = m.venues.find(x => x.id === p.get('place'));
    if (v) {
      state.panel = {mode: 'venue', id: v.index};
      const members = filterRows(m.rows, state.filters).filter(r => r.v === v.index);
      const first = members.find(hasPoint) || members[0];
      if (first) state.sel = storeSelection(first);
    }
  } else if (state.sel.unit >= 0) state.panel = {mode: 'unit', id: state.sel.unit};
  for (const k of FIELDS) $(k).value = state.filters[k];
}

/* ---------- theme ---------- */
function applyTheme() {
  const value = $('theme').value;
  const next = value === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('citymeter-grocery-theme', value); } catch {}
  if (state.map && next !== state.mapTheme) {
    cancelPendingSelectionFit();
    state.loaded = false;
    state.stores?.dispose(); state.stores = null;
    state.areas?.dispose(); state.areas = null;
    state.massing?.dispose(); state.massing = null;
    state.joinedBuildings?.dispose(); state.joinedBuildings = null;
    state.mapTheme = next;
    state.map.setStyle(buildMapStyle(next), {diff: false});
  }
  if (state.model) drawChart();
}

/* ---------- selection ---------- */
/** The finest area of a store: its (first) unit, else its district. */
function storeSelection(r) {
  return normalizeSelection(M(), r.u.length ? {unit: r.u[0]} : {district: r.d});
}

function computeFocus() {
  const lvl = level(), m = M();
  if (state.panel.mode === 'venue') return {level: 'venue', ids: [state.panel.id]};
  if (lvl === 'unit') return {level: 'unit', ids: [state.sel.unit]};
  const childLevel = CHILD_LEVEL[lvl];
  const children = childrenOf(m, state.sel);
  if (state.focusKeys.length) {
    const ids = children.filter(c => state.focusKeys.includes(areaKey(c))).map(c => c.index);
    if (ids.length) return {level: childLevel, ids, mode: 'explicit'};
  }
  if (state.autoFocus && state.aha?.top.length) return {level: childLevel, ids: state.aha.top.map(t => t.index), mode: 'auto'};
  // No focus: the whole current area carries detail.
  if (lvl === 'country') return {level: 'all', ids: []};
  if (lvl === 'province') return {level: 'province', ids: [state.sel.province]};
  return {level: 'district', ids: [state.sel.district]};
}

function rowInFocus(r, focus) {
  switch (focus.level) {
    case 'province': return focus.ids.includes(r.p);
    case 'district': return focus.ids.includes(r.d);
    case 'unit': return r.u.some(i => focus.ids.includes(i));
    case 'venue': return focus.ids.includes(r.v);
    case 'none': return false;
    default: return true;
  }
}

function update({fit = false} = {}) {
  const m = M();
  const fkey = JSON.stringify(state.filters);
  if (fkey !== state.filterKey) { cancelPendingSelectionFit(); state.filtered = filterRows(m.rows, state.filters); state.filterKey = fkey; state.storesDirty = true; }
  state.sel = normalizeSelection(m, state.sel);
  // A focus key list only applies at the level it was chosen for.
  const children = childrenOf(m, state.sel);
  if (state.focusKeys.length && !state.focusKeys.every(k => children.some(c => areaKey(c) === k))) state.focusKeys = [];
  state.scopeRows = areaRows(state.filtered, state.sel);
  state.aha = level() === 'unit' ? null : buildAha(m, state.filtered, state.sel);
  state.focus = computeFocus();
  const inFocus = state.focus.level === 'all' ? null : r => rowInFocus(r, state.focus);
  state.rows = state.panel.mode === 'venue' ? state.filtered.filter(r => r.v === state.panel.id)
    : inFocus && level() !== 'unit' ? state.scopeRows.filter(inFocus) : state.scopeRows;
  state.page = 0;
  // Keep the panel honest: a store or venue that left the filtered scope falls back to the area.
  if (state.panel.mode === 'store' && !state.filtered.some(r => r.key === state.panel.id)) { state.panel = areaPanel(); state.history = []; }
  if (state.panel.mode === 'venue' && !state.filtered.some(r => r.v === state.panel.id)) { state.panel = areaPanel(); state.history = []; }
  if (state.panel.mode === 'unit' && state.sel.unit < 0) state.panel = {mode: 'overview', id: ''};
  if (state.panel.mode === 'overview' && state.sel.unit >= 0) state.panel = {mode: 'unit', id: state.sel.unit};
  if (state.panel.mode === 'unit') state.panel.id = state.sel.unit;

  $('result-count').textContent = num(state.rows.length);
  const active = FIELDS.filter(k => state.filters[k]).length;
  $('filter-count').textContent = active ? String(active) : '';
  $('filter-chips').innerHTML = renderFilterChips(state.filters, {brand: Object.fromEntries(m.brands.map(b => [b.id, b.name])), type: Object.fromEntries(m.types.map(t => [t.id, t.th]))});
  syncAreaSelects();
  prepareSpatialSelection();
  deferredSelectionFit.reconcile();
  renderPanel();
  renderLegend();
  if (state.loaded) {
    updateSpatialLayers();
    if (fit) fitCurrent();
    state.lastPreset = cameraPreset();
  }
  drawChart();
  renderTable();
  saveURL();
  ensureGeometry();
  announce(`${breadcrumbText(currentCrumbs())}: ${num(state.scopeRows.length)} สาขา`);
}

/** The panel for the current area (used when a store/venue falls out of scope). */
function areaPanel() { return state.sel.unit >= 0 ? {mode: 'unit', id: state.sel.unit} : {mode: 'overview', id: ''}; }

/* ---------- geometry on demand ---------- */
function ensureGeometry() {
  const p = province();
  if (!p || provinceGeoNow(p.code)) return;
  ensureProvinceGeo(p.code).then(() => {
    if (state.loaded) updateSpatialLayers();
    if (state.pendingFit) { state.pendingFit = false; fitCurrent(); }
  }).catch(e => { console.warn('Province geometry unavailable', e); $('map-status').textContent = 'โหลดขอบเขตอำเภอ/อปท. ไม่สำเร็จ'; });
}

/* ---------- breadcrumb ---------- */
function currentVenue() {
  if (state.panel.mode === 'venue') return venueByIndex(state.panel.id);
  if (state.panel.mode === 'store') { const r = rowByKey(state.panel.id); return r && r.v >= 0 ? venueByIndex(r.v) : null; }
  return null;
}
function currentCrumbs() { return buildBreadcrumb(M(), state.sel, currentVenue()); }
function renderCrumbs() {
  const crumbs = currentCrumbs();
  $('crumbs').innerHTML = renderBreadcrumb(crumbs);
  const title = state.panel.mode === 'store' ? `${rowByKey(state.panel.id)?.brand || ''} ${rowByKey(state.panel.id)?.name || ''} · ` : '';
  document.title = `${title}${breadcrumbText(crumbs)} · Grocery · CityMETER`;
  return crumbs;
}

/* ---------- panel ---------- */
function areaSummary(sel = state.sel) {
  const m = M(), lvl = levelOf(sel);
  const area = lvl === 'unit' ? m.units[sel.unit] : lvl === 'district' ? m.districts[sel.district] : lvl === 'province' ? m.provinces[sel.province] : m.country;
  const rows = areaRows(state.filtered, sel);
  const pop = Number.isFinite(area.pop) && area.pop > 0 ? area.pop : null;
  return {count: rows.length, brands: brandCount(rows), pop, perCapita: perCapita(rows.length, pop),
    areaName: lvl === 'country' ? 'ประเทศไทย' : lvl === 'district' ? districtLabel(area) : lvl === 'unit' ? unitLabel(area) : area.name};
}

/** Children of the compared area with class colours and focus flags (map, labels, panel ranking). */
function comparisonModel() {
  const m = M(), cmpSel = compareSelection();
  const summary = summarizeChildren(m, state.filtered, cmpSel);
  const value = c => (state.metric === 'capita' ? c.perCapita : c.count);
  const classes = buildClasses(summary.map(value), {metric: state.metric});
  const childLevel = CHILD_LEVEL[levelOf(cmpSel)];
  // A venue or store sits inside one unit: that unit is the area in focus on the map.
  const focusIds = new Set(state.focus.level === childLevel ? state.focus.ids : (childLevel === 'unit' && state.sel.unit >= 0 ? [state.sel.unit] : []));
  const anyFocus = focusIds.size > 0;
  const ranked = rankChildren(summary, state.metric);
  const rank = new Map(ranked.map((c, i) => [c.index, i + 1]));
  const items = summary.map(c => {
    const cls = classify(value(c), classes);
    const focused = !anyFocus || focusIds.has(c.index);
    return {...c, cls, fill: cls.fill, state: cls.state, rank: rank.get(c.index), focused, quiet: !focused, selected: c.level === 'unit' && c.index === state.sel.unit};
  });
  const byIndex = new Map(items.map(i => [i.index, i]));
  return {cmpSel, childLevel, classes, items, ranked: ranked.map(c => byIndex.get(c.index)), anyFocus};
}

function renderPanel() {
  const view = $('panel-view'), m = M(), mode = state.panel.mode;
  renderCrumbs();
  state.compare = comparisonModel();
  let html = '';
  if (mode === 'unit') {
    const p = buildUnitProfile(m, state.filtered, state.panel.id);
    if (p) { p.districtLabel = districtLabel(p.district); html = renderUnit(p); }
  } else if (mode === 'venue') {
    const v = buildVenueProfile(m, state.filtered, state.panel.id);
    if (v) { v.districtLabel = districtLabel(v.district); v.unitLabel = v.unit ? unitLabel(v.unit) : ''; html = renderVenue(v, {building: buildingFact(state.spatial.summary, state.spatial.loading), buildingReference: referenceBuildingFact(state.spatial.summary)}); }
  } else if (mode === 'store') {
    const r = rowByKey(state.panel.id);
    const d = buildStoreDetail(m, r, state.filtered);
    if (d) {
      const detail = state.storeDetail?.key === r.key ? state.storeDetail : null;
      html = renderStore(d, {detail: detail?.value, detailError: detail?.error, building: buildingFact(state.spatial.summary, state.spatial.loading), buildingReference: referenceBuildingFact(state.spatial.summary), districtLabel: districtLabel(d.district), unitLabel, placeOf});
      if (!detail) loadStoreDetail(r);
    }
  }
  if (!html) {
    const nouns = levelNouns(m, state.sel);
    const summary = areaSummary();
    const focusRows = state.rows;
    const focusNames = state.focus.mode === 'explicit' ? state.compare.items.filter(i => state.focus.ids.includes(i.index)).map(i => ({area: i.area, name: i.name})) : [];
    html = renderOverview({
      aha: state.aha, focusMode: focusMode(), focusNames, metric: state.metric,
      summary: {...summary, focusCount: focusRows.length, focusBrands: brandCount(focusRows)},
      ranking: state.compare.ranked, nouns: {...nouns, childPictogram: {province: 'province', district: 'district', unit: 'area'}[state.compare.childLevel] || 'area'},
      typeMix: typeMix(m, state.scopeRows), brandMix: brandMix(m, state.scopeRows), asOf: m.meta?.asOf || '', apiTotal: m.meta?.apiTotal || m.rows.length,
    });
    renderMapAha();
  } else {
    $('map-aha').hidden = true;
  }
  view.innerHTML = html;
  view.dataset.mode = mode;
  const key = `${mode}:${state.panel.id}:${state.sel.province}:${state.sel.district}:${state.sel.unit}`;
  if (key !== renderPanel.lastKey) $('panel').scrollTop = 0;
  renderPanel.lastKey = key;
}

function spatialSelectionRows() {
  if (state.panel.mode === 'store') { const r = rowByKey(state.panel.id); return r ? [r] : []; }
  if (state.panel.mode === 'venue') return state.filtered.filter(r => r.v === state.panel.id);
  return [];
}

function spatialSelectionKey(rows = spatialSelectionRows()) {
  return rows.length ? `${state.panel.mode}:${state.panel.id}:${rows.map(r => r.key).join(',')}` : '';
}

/** Province snapshots never change selection, point coordinates or counters. */
function prepareSpatialSelection({retry = false} = {}) {
  const rows = spatialSelectionRows();
  const codes = [...new Set(rows.map(r => M().provinces[r.p].code))];
  const key = spatialSelectionKey(rows);
  if (!retry && key === state.spatial.key) return;
  const request = ++spatialRequest;
  if (!key) { state.spatial = {key, loading: false, summary: null}; return; }
  const ready = codes.every(code => spatialData.peek(code)) && spatialData.peekReferences();
  state.spatial = {key, loading: !ready, summary: selectSpatialBuildings(M(), rows, spatialData.peek, spatialData.peekReferences())};
  if (ready) return;
  Promise.allSettled([...codes.map(code => spatialData.ensure(code)), spatialData.ensureReferences()]).then(() => {
    if (request !== spatialRequest || state.spatial.key !== key) return;
    state.spatial = {key, loading: false, summary: selectSpatialBuildings(M(), rows, spatialData.peek, spatialData.peekReferences())};
    renderPanel();
    if (state.loaded) updateSpatialLayers();
    if (state.spatial.summary.collection.features.length) deferredSelectionFit.run(key);
    else deferredSelectionFit.cancel();
  });
}

function loadStoreDetail(r) {
  const code = M().provinces[r.p].code;
  loadProvinceDetail(code).then(map => {
    state.storeDetail = {key: r.key, value: map.get(r.key) || {address: ''}};
  }).catch(e => { console.warn('Store detail unavailable', e); state.storeDetail = {key: r.key, error: true}; })
    .finally(() => { if (state.panel.mode === 'store' && state.panel.id === r.key) renderPanel(); });
}

function renderMapAha() {
  const el = $('map-aha'), a = state.aha;
  if (!a || !a.top.length) { el.hidden = true; return; }
  el.hidden = $('panel').classList.contains('is-open');
  const crumb = `<p class="map-aha-crumb">${esc(breadcrumbText(currentCrumbs()))}</p>`;
  const childThis = `${a.nouns.child}${a.nouns.child.endsWith('.') ? ' ' : ''}นี้`;
  const compare = a.popShare == null ? '' : ` · มีคน${a.comparison === 'less' ? 'แค่' : ''} ${Math.round(a.popShare)}%`;
  el.innerHTML = focusMode() === 'explicit'
    ? `<div>${crumb}<h2>กำลังสำรวจ ${num(state.focus.ids.length)} ${esc(a.nouns.child)}</h2><p>${num(state.rows.length)} สาขา</p></div><button type="button" class="btn" data-action="clear-focus">${esc(withNoun('ดูทุก', a.nouns.child))}</button>`
    : `<div>${crumb}<h2>${num(Math.round(a.share))}% ของสาขาอยู่ใน${a.top.length > 1 ? ` ${num(a.top.length)} ` : ''}${esc(childThis)}</h2><p>${a.top.map(t => esc(t.name)).join(' · ')}${esc(compare)}</p></div>${focusMode() === 'auto'
      ? `<button type="button" class="btn" data-action="clear-focus">${esc(withNoun('ดูทุก', a.nouns.child))}</button>`
      : `<button type="button" class="btn primary" data-action="explore-top">โฟกัส</button>`}`;
}

/* ---------- navigation ---------- */
function pushHistory() { state.history.push({panel: {...state.panel}, sel: {...state.sel}, focusKeys: [...state.focusKeys], autoFocus: state.autoFocus}); if (state.history.length > 30) state.history.shift(); }

function goBack() {
  cancelPendingSelectionFit();
  const previous = state.history.pop();
  if (!previous) { selectArea(parentSelection(state.sel), {push: false}); return; }
  state.panel = previous.panel; state.sel = previous.sel; state.focusKeys = previous.focusKeys; state.autoFocus = previous.autoFocus;
  state.popup?.remove(); state.popup = null;
  update({fit: true});
}

/** Drill to an area selection (country/province/district/unit). */
function selectArea(sel, {push = true, fromMap = false} = {}) {
  cancelPendingSelectionFit();
  const next = normalizeSelection(M(), sel);
  if (push) pushHistory();
  state.sel = next;
  state.focusKeys = [];
  state.autoFocus = true;
  state.panel = next.unit >= 0 ? {mode: 'unit', id: next.unit} : {mode: 'overview', id: ''};
  state.popup?.remove(); state.popup = null;
  update({fit: true});
  if (!fromMap && next.unit >= 0) openMobilePanel();
  const crumbs = currentCrumbs();
  announce(`${breadcrumbText(crumbs)}: ${num(state.scopeRows.length)} สาขา`);
}

function selectAreaByLevel(lvl, index, opts) {
  if (lvl === 'province') selectArea({province: index}, opts);
  else if (lvl === 'district') selectArea({district: index}, opts);
  else if (lvl === 'unit') selectArea({unit: index}, opts);
}

function selectStore(key, {fly = true, showPopup = false, fromPin = false} = {}) {
  const r = rowByKey(key);
  if (!r) return;
  cancelPendingSelectionFit();
  if (!(state.panel.mode === 'store' && state.panel.id === key)) pushHistory();
  state.panel = {mode: 'store', id: key};
  state.sel = storeSelection(r);
  state.focusKeys = [];
  update();
  const wantsFit = fly || cameraPreset() !== state.lastPreset;
  if (wantsFit) armSelectionFit();
  if (hasPoint(r) && state.loaded) {
    if (wantsFit && !deferredSelectionFit.run(spatialSelectionKey())) fitCurrent();
    state.lastPreset = cameraPreset();
    state.popup?.remove(); state.popup = null;
    if (showPopup && !mobilePortrait()) {
      const wrap = document.createElement('div'), h = document.createElement('h3'), p = document.createElement('p');
      wrap.innerHTML = brandLogoMarkup(r.brand, {className: 'popup-logo'});
      h.textContent = r.brand;
      p.textContent = r.name;
      wrap.append(h, p);
      state.popup = new maplibregl.Popup({maxWidth: '280px', offset: 14, closeButton: true}).setLngLat([r.lon, r.lat]).setDOMContent(wrap).addTo(state.map);
    }
  }
  if (!fromPin || mobilePortrait()) openMobilePanel();
  announce(`เลือก ${r.brand} ${r.name}`);
}

function selectVenue(index) {
  const v = venueByIndex(index);
  if (!v) return;
  const members = state.filtered.filter(r => r.v === index);
  if (!members.length) return;
  cancelPendingSelectionFit();
  pushHistory();
  state.panel = {mode: 'venue', id: index};
  const first = members.find(hasPoint) || members[0];
  state.sel = storeSelection(first);
  update();
  armSelectionFit();
  if (state.loaded && hasPoint(first) && !deferredSelectionFit.run(spatialSelectionKey())) fitCurrent();
  openMobilePanel();
}

function exploreTop() { state.autoFocus = true; state.focusKeys = []; update({fit: true}); closeMobilePanel(); }
function clearFocus() { state.autoFocus = false; state.focusKeys = []; update({fit: true}); }

function clearFilter(key) {
  if (key === 'all') { for (const k of FIELDS) { state.filters[k] = ''; $(k).value = ''; } }
  else { state.filters[key] = ''; $(key).value = ''; }
  if (state.panel.mode === 'store' || state.panel.mode === 'venue') state.panel = areaPanel();
  update({fit: false});
}

function setFilter(key, value) {
  state.filters[key] = value;
  $(key).value = value;
  if (state.panel.mode === 'store' || state.panel.mode === 'venue') { state.panel = areaPanel(); state.history = []; }
  update({fit: false});
}

function setMetric(metric) {
  if (!['count', 'capita'].includes(metric) || metric === state.metric) return;
  state.metric = metric;
  update();
  announce(metric === 'capita' ? 'แสดงสาขาต่อประชากร 10,000 คน' : 'แสดงจำนวนสาขา');
}

function onPanelAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const {action, id, value, level: lvl, index} = target.dataset;
  switch (action) {
    case 'select-area': selectAreaByLevel(lvl, Number(index)); break;
    case 'select-store': selectStore(id); break;
    case 'select-venue': selectVenue(Number(id)); break;
    case 'retry-spatial': prepareSpatialSelection({retry: true}); renderPanel(); break;
    case 'filter-brand': setFilter('brand', value); break;
    case 'filter-type': setFilter('type', value); break;
    case 'back': goBack(); break;
    case 'explore-top': exploreTop(); break;
    case 'clear-focus': clearFocus(); break;
    case 'set-metric': setMetric(value); break;
    case 'open-charts': openInsights(true); closeMobilePanel(); break;
    case 'open-table': $('results').hidden = false; closeMobilePanel(); $('toggle-table').focus({preventScroll: true}); break;
    case 'clear-filter': clearFilter(id); break;
    case 'crumb-country': selectArea({...NO_SELECTION}); break;
    case 'crumb-province': { const p = M().provinceByAbbr.get(id); if (p) selectArea({province: p.index}); break; }
    case 'crumb-district': { const d = M().districtByCode.get(id); if (d) selectArea({district: d.index}); break; }
    case 'crumb-unit': { const u = M().unitByKey.get(id); if (u) selectArea({unit: u.index}); break; }
    case 'crumb-venue': { const v = M().venues.find(x => x.id === id); if (v) selectVenue(v.index); break; }
    case 'crumb-expand': { const ol = target.closest('.crumbs'); ol.classList.add('is-expanded'); target.setAttribute('aria-expanded', 'true'); ol.querySelector('.crumb:not(.crumb-more)')?.focus({preventScroll: true}); break; }
    default: break;
  }
}

/* ---------- area selects (filter panel) ---------- */
function fillSelect(id, items, placeholder) {
  const s = $(id);
  s.replaceChildren();
  const o = document.createElement('option'); o.value = ''; o.textContent = placeholder; s.append(o);
  for (const [value, label] of items) { const x = document.createElement('option'); x.value = value; x.textContent = label; s.append(x); }
}
function syncAreaSelects() {
  const m = M(), p = province();
  $('province').value = p ? p.abbr : '';
  const dKey = `${state.sel.province}`;
  if ($('district').dataset.for !== dKey) {
    fillSelect('district', p ? m.districtsOf[p.index].map(i => [m.districts[i].code, m.districts[i].name]).sort((a, b) => a[1].localeCompare(b[1], 'th')) : [], p ? `ทุก${districtNoun(p)}` : 'เลือกจังหวัดก่อน');
    $('district').dataset.for = dKey;
  }
  $('district').disabled = !p;
  $('district').value = state.sel.district >= 0 ? m.districts[state.sel.district].code : '';
  const uKey = `${state.sel.district}`;
  if ($('unit').dataset.for !== uKey) {
    fillSelect('unit', state.sel.district >= 0 ? m.unitsOf[state.sel.district].map(i => [m.units[i].key, unitLabel(m.units[i])]).sort((a, b) => a[1].localeCompare(b[1], 'th')) : [], state.sel.district >= 0 ? withNoun('ทุก', unitNoun(p)) : `เลือก${p ? districtNoun(p) : 'อำเภอ'}ก่อน`);
    $('unit').dataset.for = uKey;
  }
  $('unit').disabled = state.sel.district < 0;
  $('unit').value = state.sel.unit >= 0 ? m.units[state.sel.unit].key : '';
  $('unit-label').textContent = p ? unitNoun(p) : 'อปท. / ย่าน';
  $('district-label').textContent = p ? districtNoun(p) : 'อำเภอ / เขต';
}

/* ---------- legend ---------- */
function renderLegend() {
  const c = state.compare;
  const steps = $('legend-steps');
  const nounOf = {province: 'จังหวัด', district: districtNoun(province()), unit: unitNoun(province())};
  const noun = nounOf[c?.childLevel] || 'พื้นที่';
  $('legend-title').textContent = `${noun} · ${METRICS[state.metric].legend}`;
  if (!c || !c.classes.classes.length) steps.innerHTML = `<span class="hint">${esc(withNoun('ไม่มี', noun))}ที่มีสาขาในตัวกรองนี้</span>`;
  else {
    steps.innerHTML = c.classes.classes.map(k => `<span class="legend-step"><i style="background:${k.fill}" aria-hidden="true"></i>${esc(k.label)}</span>`).join('') +
      (c.classes.zeroCount ? `<span class="legend-step" title="${noun}ที่ไม่พบสาขาในตัวกรองนี้"><i class="legend-zero" aria-hidden="true"></i>0</span>` : '') +
      (c.classes.noDataCount ? `<span class="legend-step" title="${noun}ที่ไม่มีข้อมูลประชากร จึงไม่คิดสาขาต่อคน"><i class="legend-nodata" aria-hidden="true"></i>ไม่มีข้อมูล</span>` : '');
    $('legend-areas').title = `${METRICS[state.metric].legend} · ${c.classes.classCount} ระดับควอนไทล์ของ${noun}ที่เทียบกัน · สีเดียวกันทั้งสองธีม`;
  }
  for (const b of document.querySelectorAll('#legend-metric [data-value]')) b.setAttribute('aria-pressed', String(b.dataset.value === state.metric));
  document.querySelector('.map-panel').classList.toggle('is-3d', state.view3d);
  document.querySelector('.map-panel').classList.toggle('metric-capita', state.metric === 'capita');
}

/* ---------- charts ---------- */
let chartDispose = null;
function drawChart() {
  if (!state.model) return;
  chartDispose?.(); chartDispose = null;
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  $('chart').setAttribute('aria-labelledby', 'tab-' + state.view);
  const c = state.compare || comparisonModel();
  const nounOf = {province: 'จังหวัด', district: districtNoun(province()), unit: unitNoun(province())};
  $('insight-title').textContent = withNoun('เปรียบเทียบ', nounOf[c.childLevel] || 'พื้นที่');
  $('chart-scope').textContent = `${num(areaRows(state.filtered, c.cmpSel).length)} สาขาใน${levelNouns(M(), c.cmpSel).areaName}`;
  if ($('insight-content').hidden) return;
  chartDispose = renderInsightChart({elementId: 'chart', view: state.view, theme: theme(), model: M(), rows: state.filtered, compareSel: c.cmpSel, metric: state.metric,
    selectedIndex: state.sel.unit >= 0 ? state.sel.unit : -1, childNoun: nounOf[c.childLevel]}, selection => {
    if (selection.type === 'area') selectAreaByLevel(selection.level, selection.index, {fromMap: true});
  });
}

function openInsights(open) {
  $('insight-content').hidden = !open;
  $('insights').classList.toggle('is-collapsed', !open);
  $('toggle-insights').setAttribute('aria-expanded', String(open));
  $('toggle-insights').textContent = open ? 'ย่อกราฟ' : 'เปิดกราฟ';
  requestAnimationFrame(() => { syncBottomPanel(); drawChart(); });
}

function syncBottomPanel() {
  document.documentElement.style.setProperty('--bottom-panel-height', `${$('insights').getBoundingClientRect().height}px`);
  state.pins?.layout();
  state.labels?.layout();
}

/* ---------- table ---------- */
function renderTable() {
  const m = M(), pageSize = 25, start = state.page * pageSize, rs = state.rows.slice(start, start + pageSize);
  $('result-rows').innerHTML = rs.map(r => {
    const v = r.v >= 0 ? m.venues[r.v] : null;
    const src = m.sources[r.s];
    return `<tr><td><button type="button" class="row-name brand-row" data-id="${esc(r.key)}">${brandLogoMarkup(r.brand)}<span>${esc(r.brand)}</span></button><small>${esc(r.name)}</small></td>
      <td><i class="category-swatch type-${esc(r.type)}" aria-hidden="true"></i> ${esc(m.types[r.t].th)}</td>
      <td>${esc(placeOf(r))}</td>
      <td>${v ? esc(v.name) : '<span class="hint">—</span>'}</td>
      <td><small class="data-number">${hasPoint(r) ? r.lat.toFixed(5) + ', ' + r.lon.toFixed(5) : 'ไม่มีพิกัด'}</small></td>
      <td class="links">${link(src?.url || m.brands[r.b].locatorURL, 'แหล่งข้อมูล')}<small>${esc(src?.date || '')}</small></td></tr>`;
  }).join('') || '<tr><td colspan="6">ไม่พบสาขาตามตัวกรอง</td></tr>';
  $('page-label').textContent = state.rows.length ? `${num(start + 1)}–${num(Math.min(start + pageSize, state.rows.length))} / ${num(state.rows.length)}` : '0 สาขา';
  $('prev-page').disabled = state.page === 0;
  $('next-page').disabled = start + pageSize >= state.rows.length;
  for (const b of $('result-rows').querySelectorAll('[data-id]')) b.onclick = () => { selectStore(b.dataset.id); $('panel').scrollTop = 0; };
}

/* ---------- map ---------- */
function cameraPadding() {
  const height = $('map').clientHeight, panel = $('insights').getBoundingClientRect().height;
  const edge = Math.min(48, Math.max(12, (height - panel) / 6));
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  const aha = $('map-aha'), legend = $('map-legend');
  const chromeTop = !aha.hidden && aha.offsetHeight ? aha.getBoundingClientRect().top : legend.offsetHeight ? legend.getBoundingClientRect().top : null;
  let bottom = chromeTop != null ? height - (chromeTop - mapTop) + 12 : panel + edge;
  if (mobilePortrait() && $('panel').classList.contains('is-open')) bottom = Math.max(bottom, Math.round(window.innerHeight * 0.64) - (window.innerHeight - height - mapTop) + 8);
  return {top: Math.max(edge, toolbar.bottom - mapTop + 12), left: edge, right: edge, bottom: Math.min(height * 0.7, bottom)};
}
function pitchedPadding() {
  const mapTop = $('map').getBoundingClientRect().top, toolbar = document.querySelector('.map-toolbar').getBoundingClientRect();
  return {top: Math.round(toolbar.bottom - mapTop + 12), bottom: Math.round($('insights').getBoundingClientRect().height + 40), left: 24, right: 24};
}

/** Bounding box of the current area: unit (from its geometry file), district, province, or the country. */
function currentBBox() {
  const m = M(), lvl = level();
  if (state.panel.mode === 'store' || state.panel.mode === 'venue') return null;
  if (lvl === 'unit') {
    const u = m.units[state.sel.unit], g = provinceGeoNow(province().code);
    const f = g?.units.get(u.key);
    return f?.properties?.b || (f ? bboxOfFeature(f) : null) || m.districts[u.d].bbox;
  }
  if (lvl === 'district') return m.districts[state.sel.district].bbox;
  if (lvl === 'province') return m.provinces[state.sel.province].bbox;
  return THAILAND;
}

/** Outline vertices of the open district or unit (thinned to ≤ 400), so a pitched fit frames the shape, not its bounding box. */
function currentOutline() {
  const m = M(), lvl = level();
  if (lvl !== 'district' && lvl !== 'unit') return null;
  const g = province() ? provinceGeoNow(province().code) : null;
  const f = !g ? null : lvl === 'unit' ? g.units.get(m.units[state.sel.unit].key) : g.districts.get(m.districts[state.sel.district].code);
  if (!f?.geometry) return null;
  const pts = [];
  const walk = v => { if (typeof v[0] === 'number') pts.push([v[0], v[1]]); else v.forEach(walk); };
  walk(f.geometry.coordinates);
  const step = Math.max(1, Math.ceil(pts.length / 400));
  return pts.filter((_, i) => i % step === 0);
}

function fitBBox(bbox, {instant = false, points = null} = {}) {
  if (!state.loaded || !bbox) return;
  const wide = bbox[2] - bbox[0] > 0.3 || bbox[3] - bbox[1] > 0.3;
  const preset = wide || mobilePortrait() ? 'plan' : cameraPreset();
  const pitched = preset !== 'plan';
  const b = new maplibregl.LngLatBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
  fitPitched(state.map, b, {preset, padding: pitched ? pitchedPadding() : cameraPadding(), maxZoom: 16, minZoom: 4, animate: animate() && !instant,
    shift: mobilePortrait() ? -0.08 : null, points: pitched && points?.length ? points : null});
}

function fitCurrent({instant = false} = {}) {
  if ((state.panel.mode === 'store' || state.panel.mode === 'venue') && state.spatial.summary?.collection.features.length) {
    const points = spatialSelectionRows().filter(hasPoint).map(r => [r.lon, r.lat]);
    for (const f of state.spatial.summary.collection.features) for (const ring of outerRings(f)) {
      const height = Number(f.properties?.height) || 0;
      for (const [lon, lat] of ring) { points.push([lon, lat]); if (height > 0) points.push([lon, lat, height]); }
    }
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    fitBBox([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], {instant, points});
    return;
  }
  if (state.panel.mode === 'store') {
    const r = rowByKey(state.panel.id);
    if (r && hasPoint(r)) framePoint(state.map, [r.lon, r.lat], {preset: cameraPreset(), zoom: 16, offset: sheetOffset(), animate: animate() && !instant});
    return;
  }
  if (state.panel.mode === 'venue') {
    const r = state.rows.find(hasPoint);
    if (r) framePoint(state.map, [r.lon, r.lat], {preset: cameraPreset(), zoom: 16, offset: sheetOffset(), animate: animate() && !instant});
    return;
  }
  if (level() === 'unit' && !provinceGeoNow(province().code)) state.pendingFit = true;
  fitBBox(currentBBox(), {instant, points: currentOutline()});
}

/** Area features for the three choropleth layers at the current selection. */
function areaLayerModel() {
  const m = M(), lvl = level(), c = state.compare, show = state.showAreas;
  const byChild = new Map(c.items.map(i => [i.index, i]));
  const g = province() ? provinceGeoNow(province().code) : null;
  const provinces = (state.provinceGeo?.features || []).map(f => {
    const p = m.provinceByCode.get(f.id || f.properties.code);
    if (!p) return null;
    const item = c.childLevel === 'province' ? byChild.get(p.index) : null;
    return {feature: f, index: p.index, key: p.code, name: p.name,
      fill: item?.fill, filled: show && item ? item.focused : false, zero: item?.state === 'measured_zero',
      quiet: item ? item.quiet : true, selected: p.index === state.sel.province, outlined: true};
  }).filter(Boolean);
  const districts = g && lvl !== 'country' ? m.districtsOf[state.sel.province].map(i => {
    const d = m.districts[i], f = g.districts.get(d.code);
    if (!f) return null;
    const item = c.childLevel === 'district' ? byChild.get(i) : null;
    return {feature: f, index: i, key: d.code, name: d.name, fill: item?.fill, filled: show && item ? item.focused : false, zero: item?.state === 'measured_zero',
      quiet: item ? item.quiet : i !== state.sel.district, selected: i === state.sel.district, outlined: true};
  }).filter(Boolean) : [];
  const units = g && (lvl === 'district' || lvl === 'unit') ? m.unitsOf[state.sel.district].map(i => {
    const u = m.units[i], f = g.units.get(u.key);
    if (!f) return null;
    const item = byChild.get(i);
    return {feature: f, index: i, key: u.key, name: unitLabel(u), fill: item?.fill, filled: show && item ? item.focused : false, zero: item?.state === 'measured_zero',
      quiet: item ? item.quiet : true, selected: i === state.sel.unit, outlined: true};
  }).filter(Boolean) : [];
  return {province: provinces, district: districts, unit: units};
}

function labelModel() {
  const m = M(), c = state.compare;
  const g = province() ? provinceGeoNow(province().code) : null;
  return c.items.map(i => {
    let center = null;
    if (i.level === 'province' || i.level === 'district') center = i.area.label;
    else center = g?.units.get(i.area.key)?.properties?.c || null;
    const value = state.metric === 'capita' ? (i.perCapita == null ? '—' : formatMetric(i.perCapita, 'capita')) : num(i.count);
    const valueText = state.metric === 'capita' ? (i.perCapita == null ? 'ไม่มีข้อมูลประชากร' : `${formatMetric(i.perCapita, 'capita')} สาขาต่อ 1 หมื่นคน`) : `${num(i.count)} สาขา`;
    return {index: i.index, level: i.level, key: i.key, name: i.name, center, valueLabel: value, aria: `${i.name}: ${valueText} กดเพื่อดูพื้นที่นี้`,
      state: i.state, quiet: i.quiet, selected: i.selected, rank: i.rank};
  });
}

function updatePins() {
  if (!state.pins || !state.map) return;
  const map = state.map;
  if (map.getZoom() < LOGO_MIN_ZOOM) { state.pins.update([]); return; }
  const b = map.getBounds(), padX = (b.getEast() - b.getWest()) * 0.15, padY = (b.getNorth() - b.getSouth()) * 0.15;
  const w = b.getWest() - padX, e = b.getEast() + padX, s = b.getSouth() - padY, n = b.getNorth() + padY;
  const c = map.getCenter();
  const focusRows = state.focus.level === 'all' ? state.filtered : state.filtered.filter(r => rowInFocus(r, state.focus));
  let inView = focusRows.filter(r => r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n);
  if (inView.length > MAX_PINS) inView = inView.map(r => [r, (r.lon - c.lng) ** 2 + (r.lat - c.lat) ** 2]).sort((a, z) => a[1] - z[1]).slice(0, MAX_PINS).map(x => x[0]);
  const selected = state.panel.mode === 'store' ? rowByKey(state.panel.id) : null;
  if (selected && !inView.includes(selected)) inView.push(selected);
  state.pins.update(inView);
  state.pins.select(selected?.key || '');
}

function updateSpatialLayers() {
  if (!state.loaded) return;
  const m = M();
  if (state.storesDirty) { state.stores?.update(state.filtered); state.storesDirty = false; }
  state.stores?.setFocus(state.focus);
  state.stores?.select(state.panel.mode === 'store' ? state.panel.id : '');
  state.areas?.update(areaLayerModel());
  const childLevel = state.compare.childLevel;
  state.labels?.update(state.showAreas ? labelModel() : [], {minZoom: 0, maxZoom: LABEL_MAX_ZOOM[childLevel] ?? 16, detailZoom: FILL_MAX_ZOOM[childLevel] ?? 14.5});
  updatePins();
  const joined = state.spatial.summary?.collection || {type: 'FeatureCollection', features: []};
  $('legend-joined').hidden = !joined.features.length;
  state.joinedBuildings?.update(joined, {view3d: state.view3d});
  const hosts = joined.features.flatMap(outerRings);
  // Context follows a compact local unit or selected raw building; at most nine z14 tiles.
  const g = province() ? provinceGeoNow(province().code) : null;
  const unit = state.sel.unit >= 0 ? m.units[state.sel.unit] : null;
  const uf = unit && g ? g.units.get(unit.key) : null;
  const ub = uf?.properties?.b;
  // A detail host must be inside the bounded context tiles so its twin can be hidden.
  const compactUnit = !hosts.length && uf && ub && ub[2] - ub[0] < 0.08 && ub[3] - ub[1] < 0.08;
  const regions = compactUnit ? outerRings(uf) : hosts.map(ring => {
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), d = 0.0012;
    const w = Math.min(...xs) - d, e = Math.max(...xs) + d, s = Math.min(...ys) - d, n = Math.max(...ys) + d;
    return [[w, s], [e, s], [e, n], [w, n], [w, s]];
  });
  const anchors = compactUnit ? [uf.properties.c] : hosts.length ? hosts.map(ring => {
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }) : spatialSelectionRows().filter(hasPoint).map(r => [r.lon, r.lat]);
  state.massing?.update({regions, hosts, anchors, enabled: true, city: state.view3d, zoom: state.map.getZoom(), latitude: state.map.getCenter().lat})?.catch(e => console.warn('Massing', e));
}

function installSpatialLayers() {
  const map = state.map;
  state.loaded = true;
  const palette = basemapPalette(theme());
  // Stores first: their click handler must win over the area under a dot.
  state.stores = installStoresLayer(map, {onSelect: key => selectStore(key, {fly: false, showPopup: true, fromPin: true})});
  state.joinedBuildings = installSpatialBuildings(map, {beforeId: STORE_LAYERS.context, onSelect: keys => {
    const current = state.panel.mode === 'store' && keys.includes(state.panel.id) ? state.panel.id : keys.find(key => state.filtered.some(r => r.key === key));
    if (current) selectStore(current, {fly: false, showPopup: true, fromPin: true});
  }});
  state.areas = installAreaLayers(map, {linesBefore: STORE_LAYERS.context, onSelect: (lvl, index) => selectAreaByLevel(lvl, index, {fromMap: true})});
  state.massing = installMassing(map, {
    beforeId: MASSING_BEFORE, colors: {quiet: palette.massingQuiet, focus: palette.massingFocus, ground: palette.ground},
    tileUrl: t => (state.tileTemplate ? state.tileTemplate.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y) : ''),
    onResult: result => { $('map-status').dataset.massing = `${result.features || 0}`; },
  });
  state.storesDirty = true;
  updateSpatialLayers();
  if (!state.initialCameraDone) {
    state.initialCameraDone = true;
    const fitted = deferredSelectionFit.run(spatialSelectionKey(), {instant: true});
    const detail = state.panel.mode === 'store' || state.panel.mode === 'venue';
    if (!fitted && !(detail && state.skipInitialSelectionFit)) fitCurrent({instant: true});
  } else deferredSelectionFit.run(spatialSelectionKey());
}

function initMap() {
  if (!window.maplibregl) throw new Error('Map library is unavailable');
  try {
    state.mapTheme = theme();
    state.map = new maplibregl.Map({container: 'map', bounds: THAILAND, fitBoundsOptions: {padding: 24}, pitch: 0, maxPitch: 85, attributionControl: {compact: true}, style: buildMapStyle(state.mapTheme)});
    state.map.addControl(new maplibregl.NavigationControl({showCompass: true, visualizePitch: true}), 'top-right');
    state.labels = installAreaLabels(state.map, $('map'), {onSelect: (lvl, index) => selectAreaByLevel(lvl, index, {fromMap: true}), reservedBottom: bottomSpace});
    state.pins = installStorePins(state.map, $('map'), {
      reservedBottom: bottomSpace,
      onSelect: r => selectStore(r.key, {fly: false, showPopup: true, fromPin: true}),
      onLayout: stats => {
        const z = state.map.getZoom();
        $('map-status').textContent = z >= LOGO_MIN_ZOOM ? `${num(stats.visiblePins)} สาขาในจอ · โลโก้ ${num(stats.visibleLogos)}/${num(stats.logoLimit)}` : `${num(state.rows.length)} สาขาในโฟกัส · ${num(state.filtered.length)} สาขาตามตัวกรอง`;
      },
    });
    let pinTimer = 0;
    state.map.on('moveend', () => { clearTimeout(pinTimer); pinTimer = setTimeout(() => { updatePins(); if (state.loaded) updateMassingOnMove(); }, 80); });
    state.map.on('zoomend', () => { if (state.map.getZoom() < LOGO_MIN_ZOOM) $('map-status').textContent = `${num(state.rows.length)} สาขาในโฟกัส · ${num(state.filtered.length)} สาขาตามตัวกรอง`; });
    state.map.on('style.load', installSpatialLayers);
    state.map.on('dragstart', cancelPendingSelectionFit);
    state.map.on('error', e => console.warn('Map resource', e.error?.message || e));
    // The same TileJSON MapLibre reads gives the tile template for the focus massing decoder.
    fetch(TILEJSON_URL).then(r => r.json()).then(j => { state.tileTemplate = j.tiles?.[0] || ''; if (state.loaded) updateSpatialLayers(); }).catch(e => console.warn('TileJSON', e));
  } catch (e) {
    state.loaded = false; state.initialCameraDone = false;
    for (const cleanup of [() => state.pins?.dispose(), () => state.labels?.dispose(), () => state.stores?.dispose(), () => state.joinedBuildings?.dispose(), () => state.areas?.dispose(), () => state.massing?.dispose(), () => state.map?.remove()]) { try { cleanup(); } catch (err) { console.warn('Map cleanup', err); } }
    state.map = null; state.pins = null; state.labels = null; state.stores = null; state.areas = null; state.massing = null; state.joinedBuildings = null;
    throw e;
  }
}
function updateMassingOnMove() {
  state.massing?.update({zoom: state.map.getZoom(), latitude: state.map.getCenter().lat})?.catch(() => {});
}

async function startMap() {
  const el = $('map-failure');
  try { await loadMapLibrary(); el.hidden = true; initMap(); }
  catch (e) {
    el.hidden = false;
    el.innerHTML = `<p>โหลดแผนที่ไม่สำเร็จ ข้อมูล ตาราง และกราฟยังใช้งานได้</p><p class="hint">${esc(e.message || '')}</p><button type="button" class="btn">ลองโหลดแผนที่ใหม่</button>`;
    el.querySelector('button').onclick = event => { event.target.disabled = true; startMap(); };
    console.warn(e);
  }
}

function toggle3d() {
  cancelPendingSelectionFit();
  state.view3d = !state.view3d;
  $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
  renderLegend();
  updateSpatialLayers();
  if (state.map) { applyPreset(state.map, state.view3d && state.map.getZoom() >= 11 ? cameraPreset() : 'plan', {animate: animate()}); state.lastPreset = cameraPreset(); }
  saveURL();
}

/* ---------- mobile sheet ---------- */
function openMobilePanel() {
  if (!mobilePortrait()) return;
  $('panel').classList.add('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'true');
  $('map-aha').hidden = true;
}
function closeMobilePanel() {
  const wasOpen = $('panel').classList.contains('is-open');
  $('panel').classList.remove('is-open');
  $('mobile-panel').setAttribute('aria-expanded', 'false');
  if (mobilePortrait()) {
    $('mobile-panel').focus({preventScroll: true});
    if (state.panel.mode === 'overview') renderPanel();
    if (wasOpen && state.loaded) fitCurrent();
    updateSpatialLayers();
  }
}

/* ---------- data loading ---------- */
function validProvinceFrames(value) {
  if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)) return false;
  return value.features.every(f => f?.type === 'Feature' && (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') && M().provinceByCode.has(f.id || f.properties?.code));
}

function wireEvents() {
  for (const type of ['mousedown', 'touchstart', 'wheel']) $('map').addEventListener(type, cancelPendingSelectionFit, {capture: true, passive: true});
  window.addEventListener('pagehide', e => { if (!e.persisted) { spatialRequest++; spatialData.dispose(); } });
  let timer;
  for (const f of FIELDS) $(f).addEventListener(f === 'search' ? 'input' : 'change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.filters[f] = $(f).value.trim ? $(f).value.trim() : $(f).value;
      if (state.panel.mode === 'store' || state.panel.mode === 'venue') { state.panel = areaPanel(); state.history = []; }
      update({fit: false});
    }, f === 'search' ? 200 : 0);
  });
  $('province').addEventListener('change', () => { const p = M().provinceByAbbr.get($('province').value); selectArea(p ? {province: p.index} : {...NO_SELECTION}); });
  $('district').addEventListener('change', () => { const d = M().districtByCode.get($('district').value); selectArea(d ? {district: d.index} : {province: state.sel.province}); });
  $('unit').addEventListener('change', () => { const u = M().unitByKey.get($('unit').value); selectArea(u ? {unit: u.index} : {district: state.sel.district}); });
  $('filters').addEventListener('reset', () => setTimeout(() => { for (const k of FIELDS) state.filters[k] = ''; selectArea({...NO_SELECTION}); }, 0));
  $('filters').addEventListener('submit', e => e.preventDefault());
  for (const id of ['panel-view', 'filter-chips', 'map-aha', 'crumbs', 'legend-metric']) $(id).addEventListener('click', onPanelAction);

  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach((b, i) => {
    b.onclick = () => { state.view = b.dataset.view; drawChart(); saveURL(); };
    b.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[j].focus(); tabs[j].click();
    });
  });

  $('fit-map').onclick = () => fitCurrent();
  $('country-map').onclick = () => selectArea({...NO_SELECTION});
  $('bangkok-map').onclick = () => { const p = M().provinceByCode.get('10'); selectArea({province: p.index}); };
  $('toggle-3d').onclick = toggle3d;
  $('toggle-areas').onclick = () => { state.showAreas = !state.showAreas; $('toggle-areas').setAttribute('aria-pressed', String(state.showAreas)); updateSpatialLayers(); };
  $('mobile-panel').onclick = () => { $('panel').classList.contains('is-open') ? closeMobilePanel() : openMobilePanel(); };
  $('close-mobile-panel').onclick = closeMobilePanel;
  document.querySelector('.skip').onclick = () => { openMobilePanel(); $('dataset-title').focus(); };
  $('toggle-insights').onclick = () => openInsights($('insight-content').hidden);
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncBottomPanel).observe($('insights')); else window.addEventListener('resize', syncBottomPanel);
  $('open-table').onclick = () => { $('results').hidden = false; closeMobilePanel(); $('toggle-table').focus(); };
  $('toggle-table').onclick = () => { $('results').hidden = true; $('open-table').focus(); };
  $('prev-page').onclick = () => { state.page--; renderTable(); };
  $('next-page').onclick = () => { state.page++; renderTable(); };
  $('theme').onchange = applyTheme;
  const colorMedia = matchMedia('(prefers-color-scheme: dark)');
  const onColorChange = () => { if ($('theme').value === 'auto') applyTheme(); };
  if (colorMedia.addEventListener) colorMedia.addEventListener('change', onColorChange); else colorMedia.addListener(onColorChange);
  matchMedia('(max-width: 760px) and (orientation: portrait)').addEventListener?.('change', () => { if (!mobilePortrait()) $('panel').classList.remove('is-open'); renderPanel(); });
}

async function init() {
  try {
    const resources = ['data/grocery.json', 'data/areas.json', 'data/geo/provinces.json', 'data/brand-logos.json', 'data/venue-logos.json'];
    const results = await Promise.allSettled(resources.map(r => fetchJSON(r)));
    for (const i of [0, 1]) if (results[i].status === 'rejected') throw results[i].reason;
    state.model = buildModel(results[0].value, results[1].value);
    if (results[2].status === 'fulfilled' && validProvinceFrames(results[2].value)) state.provinceGeo = results[2].value;
    else { state.provinceGeo = {type: 'FeatureCollection', features: []}; console.warn('Province frames unavailable', results[2].reason || 'invalid'); }
    const coverage = configureBrandLogos(results[3].status === 'fulfilled' ? results[3].value : {brands: []}, state.model.brands.map(b => ({brand: b.name})));
    if (!coverage.complete) console.warn('Brand logo coverage', coverage);
    const venueLogos = configureVenueLogos(results[4].status === 'fulfilled' ? results[4].value : {assets: []});
    if (!venueLogos.complete) console.warn('Venue logo registry', venueLogos);

    const m = state.model;
    fillSelect('brand', m.brands.map(b => [b.id, b.name]), 'ทุกแบรนด์');
    fillSelect('type', m.types.map(t => [t.id, t.th]), 'ทุกประเภท');
    fillSelect('province', [...m.provinces].sort((a, b) => a.name.localeCompare(b.name, 'th')).map(p => [p.abbr, p.name]), 'ทุกจังหวัด');
    $('category-items').innerHTML = m.types.map(t => `<span><i class="category-swatch type-${esc(t.id)}" aria-hidden="true"></i>${esc(t.th)}</span>`).join('');

    restoreFromURL();
    $('toggle-3d').setAttribute('aria-pressed', String(state.view3d));
    try { $('theme').value = localStorage.getItem('citymeter-grocery-theme') || 'auto'; } catch {}
    applyTheme();
    wireEvents();
    update();
    if (state.panel.mode === 'store' || state.panel.mode === 'venue') armSelectionFit();
    if (state.panel.mode !== 'overview') openMobilePanel();
    window.dispatchEvent(new CustomEvent('citymeter:ready'));
    startMap();
  } catch (e) {
    window.dispatchEvent(new CustomEvent('citymeter:load-error', {detail: {message: 'โหลดข้อมูลสาขาไม่สำเร็จ กรุณาลองอีกครั้ง', resource: e.resource, status: e.status, phase: e.phase || 'startup', diagnostic: e.message}}));
    console.error(e);
  }
}

// Developer hook for live tuning in a browser console (not an API; may change without notice).
window.__citymeter = {state, get map() { return state.map; }, update, fitCurrent, updateSpatialLayers, applyPreset: (name, opts) => state.map && applyPreset(state.map, name, opts), fitPitched: (b, opts) => state.map && fitPitched(state.map, b, opts), cameraPadding, buildMapStyle, selectArea, selectStore};

init();
