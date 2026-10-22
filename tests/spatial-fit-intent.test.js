import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const between = (start, end) => {
  const a = app.indexOf(start), b = app.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production functions still exist: ${start}`);
  return app.slice(a, b);
};

/** Run the production selection, request-completion and map-install functions;
 * only rendering, network transport and geometry selection are stand-ins. */
function harness({loaded = true} = {}) {
  const rows = [
    {key: 'a', p: 0, v: 0, lon: 100, lat: 13, brand: 'A', name: 'Mall A'},
    {key: 'b', p: 1, v: 1, lon: 101, lat: 14, brand: 'B', name: 'Mall B'},
  ];
  const state = {panel: {mode: 'overview', id: ''}, filtered: rows, loaded,
    initialCameraDone: loaded, skipInitialSelectionFit: false, lastPreset: 'eye',
    spatial: {key: '', loading: false, summary: null}, map: {getLayer: () => null}, tileTemplate: ''};
  const caches = new Map(), requests = new Map(), fits = [];
  const model = {provinces: [{code: '10'}, {code: '20'}]};
  const spatialData = {
    peek: code => caches.get(code), peekReferences: () => ({}), ensureReferences: () => Promise.resolve(),
    ensure(code) {
      if (caches.has(code)) return Promise.resolve(caches.get(code));
      if (!requests.has(code)) {
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        requests.set(code, {promise, resolve});
      }
      return requests.get(code).promise;
    },
  };
  let api;
  const context = vm.createContext({
    state, spatialData, M: () => model, Promise,
    rowByKey: key => rows.find(r => r.key === key), venueByIndex: index => index >= 0 && index < 2 ? {} : null,
    hasPoint: row => Number.isFinite(row.lon) && Number.isFinite(row.lat),
    pushHistory() {}, storeSelection: row => ({province: row.p}), cameraPreset: () => 'eye',
    mobilePortrait: () => false, openMobilePanel() {}, announce() {},
    update() {
      api.prepareSpatialSelection(); api.reconcile();
      if (state.loaded) state.lastPreset = 'eye';
    },
    selectSpatialBuildings(m, selected, peek) {
      return {collection: {type: 'FeatureCollection', features: selected.flatMap(row => peek(m.provinces[row.p].code)?.features || [])}};
    },
    fitCurrent(options) {
      fits.push({selection: state.panel.id, buildings: Array.from(state.spatial.summary?.collection.features || [], f => f.id), instant: options?.instant || false});
    },
    renderPanel() {}, updateSpatialLayers() {}, basemapPalette: () => ({}), theme: () => 'light',
    installStoresLayer: () => ({}), installSpatialBuildings: () => ({}), installAreaLayers: () => ({}), installMassing: () => ({}),
    STORE_LAYERS: {context: 'context'}, MASSING_BEFORE: 'water-name', selectAreaByLevel() {},
    BUILDING_LAYERS: {fill: 'joined-buildings-plan'}, installVenueXray: () => ({}),
  });
  const source = [
    between('export function createDeferredSelectionFit(', '/* ---------- small helpers ---------- */').replace('export ', ''),
    'let spatialRequest = 0;',
    between('function spatialSelectionRows()', 'function loadStoreDetail('),
    between('function selectStore(', 'function exploreTop()'),
    between('function installSpatialLayers()', 'function initMap()'),
    'globalThis.api = {selectStore, selectVenue, prepareSpatialSelection, installSpatialLayers, cancelPendingSelectionFit, armSelectionFit, reconcile: () => deferredSelectionFit.reconcile()};',
  ].join('\n');
  vm.runInContext(source, context, {filename: 'production-app-selection-fit.js'});
  api = context.api;
  return {state, api, fits, rows,
    async resolve(code, {geometry = true} = {}) {
      const payload = {features: geometry ? [{id: `building-${code}`}]: []};
      caches.set(code, payload); requests.get(code)?.resolve(payload);
      await new Promise(resolve => setImmediate(resolve));
    },
    cache(code) { caches.set(code, {features: [{id: `building-${code}`}]}); },
  };
}

test('a cold store selection fits its point first, then its full building once', async () => {
  const h = harness();
  h.api.selectStore('a');
  assert.equal(h.fits.length, 1); assert.deepEqual(h.fits[0].buildings, []);
  await h.resolve('10');
  assert.equal(h.fits.length, 2); assert.deepEqual(h.fits[1].buildings, ['building-10']);
  h.api.prepareSpatialSelection(); h.api.installSpatialLayers();
  assert.equal(h.fits.length, 2, 'cached/background updates never refit a consumed intent');
});

test('a cached venue fits its building once and does not schedule another fit', async () => {
  const h = harness(); h.cache('10');
  h.api.selectVenue(0);
  assert.equal(h.fits.length, 1); assert.deepEqual(h.fits[0].buildings, ['building-10']);
  await h.resolve('10'); h.api.installSpatialLayers();
  assert.equal(h.fits.length, 1);
});

test('cold URL data ready before map load waits, then uses geometry in its only initial fit', async () => {
  const h = harness({loaded: false});
  h.state.panel = {mode: 'venue', id: 0};
  h.api.prepareSpatialSelection(); h.api.armSelectionFit();
  await h.resolve('10');
  assert.equal(h.fits.length, 0, 'a data callback cannot fit an unloaded map');
  h.api.installSpatialLayers();
  assert.equal(h.fits.length, 1); assert.equal(h.fits[0].instant, true);
  assert.deepEqual(h.fits[0].buildings, ['building-10']);
  h.api.installSpatialLayers();
  assert.equal(h.fits.length, 1, 'later style installation cannot repeat the initial fit');
});

test('direct map interaction cancels late geometry fits, including a map still loading', async () => {
  for (const loaded of [true, false]) {
    const h = harness({loaded}); h.api.selectStore('a');
    const before = h.fits.length;
    h.state.pendingFit = true; h.api.cancelPendingSelectionFit();
    assert.equal(h.state.pendingFit, false, 'an older area request cannot move the selected detail later');
    await h.resolve('10'); h.api.installSpatialLayers();
    assert.equal(h.fits.length, before, `user view retained with map loaded=${loaded}`);
  }
});

test('an old selection payload cannot fit or consume the new selection intent', async () => {
  const h = harness();
  h.api.selectStore('a'); h.api.selectStore('b');
  assert.equal(h.fits.length, 2);
  await h.resolve('10');
  assert.equal(h.fits.length, 2); assert.equal(h.state.spatial.key, 'store:b:b');
  await h.resolve('20');
  assert.equal(h.fits.length, 3); assert.equal(h.fits[2].selection, 'b');
  assert.deepEqual(h.fits[2].buildings, ['building-20']);
});

test('pin selection, absent geometry and leaving detail do not create late camera jumps', async () => {
  const pin = harness(); pin.api.selectStore('a', {fly: false, fromPin: true});
  await pin.resolve('10'); assert.equal(pin.fits.length, 0, 'clicking a map pin keeps the user camera');
  const empty = harness(); empty.api.selectStore('a'); await empty.resolve('10', {geometry: false});
  empty.api.installSpatialLayers(); assert.equal(empty.fits.length, 1, 'no footprint means only the ordinary point fit');
  const left = harness(); left.api.selectStore('a');
  left.state.panel = {mode: 'overview', id: ''}; left.api.prepareSpatialSelection(); left.api.reconcile();
  await left.resolve('10'); assert.equal(left.fits.length, 1, 'a payload cannot restore a detail that has closed');
});

test('gesture cancellation binds direct input and drag, without treating camera animations as user gestures', () => {
  assert.match(app, /\['mousedown', 'touchstart', 'wheel'\][^\n]+addEventListener\(type, cancelPendingSelectionFit, \{capture: true, passive: true\}\)/);
  assert.match(app, /state\.map\.on\('dragstart', cancelPendingSelectionFit\)/);
  assert.doesNotMatch(app, /(?:\.on|addEventListener)\('(?:movestart|move|moveend|zoomstart|zoom|zoomend)', cancelPendingSelectionFit/);
  assert.match(between('function applyTheme()', 'function storeSelection('), /cancelPendingSelectionFit\(\)/);
  assert.match(between('function update(', '/** The panel for the current area'), /fkey !== state\.filterKey\) \{ cancelPendingSelectionFit\(\)/);
});
