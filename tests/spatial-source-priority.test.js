import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const script = new URL('../scripts/combine-spatial-sources.py', import.meta.url).pathname;
const inside = (id, distance = 20) => ({status: 'point_inside', buildingId: id, candidateIds: [id], boundaryDistanceM: distance});
const boundary = (id, distance = 4) => ({status: 'boundary_candidate', buildingId: null, candidateIds: [id], boundaryDistanceM: distance});
const noHit = () => ({status: 'no_building', buildingId: null, candidateIds: [], boundaryDistanceM: null, queryCoverage: 'complete', queryContextComplete: true});
const unavailable = () => ({status: 'unavailable', buildingId: null, candidateIds: [], boundaryDistanceM: null, queryCoverage: 'not_queried'});

// Expectations are authored from the source-priority contract, independently of
// the merger. Later-source success never changes an earlier-source uncertainty.
const cases = [
  {id: 'native-boundary', native: boundary('native:edge'), reference: inside('ref:host'), microsoft: inside('ms:roof'), source: 'citymeter_native', status: 'boundary_candidate'},
  {id: 'reference-boundary', native: unavailable(), reference: boundary('ref:edge'), microsoft: inside('ms:roof'), source: 'verified_reference', status: 'boundary_candidate'},
  {id: 'microsoft-gap-fill', native: noHit(), reference: unavailable(), microsoft: inside('ms:roof'), source: 'microsoft', status: 'point_inside'},
  {id: 'native-covered-no-hit', native: noHit(), reference: unavailable(), microsoft: unavailable(), source: 'citymeter_native', status: 'no_building'},
  {id: 'native-ambiguity', native: {status: 'ambiguous', buildingId: null, candidateIds: ['native:a', 'native:b'], boundaryDistanceM: null}, reference: inside('ref:host'), microsoft: inside('ms:roof'), source: 'citymeter_native', status: 'ambiguous'},
  {id: 'native-deep', native: inside('native:deep', 12), reference: inside('ref:host'), microsoft: inside('ms:roof'), source: 'citymeter_native', status: 'point_inside'},
  {id: 'reference-gap-fill', native: noHit(), reference: inside('ref:host'), microsoft: inside('ms:roof'), source: 'verified_reference', status: 'point_inside'},
  {id: 'no-coverage', native: unavailable(), reference: unavailable(), microsoft: unavailable(), source: 'microsoft', status: 'unavailable'},
];

test('native/reference uncertainty is retained before ML gap fill, without cross-provider host inflation', () => {
  const python = "import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('merger',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nx=json.load(sys.stdin)\nprint(json.dumps([{'id':r['id'],'source':m.choose(r['native'],r['reference'],r['microsoft'])[0],'selected':m.choose(r['native'],r['reference'],r['microsoft'])[1]}for r in x]))";
  const run = spawnSync('python3', ['-c', python, script], {input: JSON.stringify(cases), encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  for (const result of JSON.parse(run.stdout)) {
    const expected = cases.find(c => c.id === result.id);
    assert.equal(result.source, expected.source, result.id);
    assert.equal(result.selected.status, expected.status, result.id);
    const chosen = expected.source === 'citymeter_native' ? expected.native : expected.source === 'verified_reference' ? expected.reference : expected.microsoft;
    assert.deepEqual(result.selected, chosen, 'selection preserves the entire chosen receipt');
  }
});

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function makeFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'grocery-source-priority-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const directories = Object.fromEntries(['native', 'reference', 'microsoft', 'data'].map(name => [name, join(root, name)]));
  Object.values(directories).forEach(path => mkdirSync(path, {recursive: true}));
  const features = new Map();
  const makeFeature = (id, rank) => {
    const geometry = {type: 'MultiPolygon', coordinates: [[[[100 + rank / 100, 13], [100.009 + rank / 100, 13], [100.009 + rank / 100, 13.009], [100 + rank / 100, 13.009], [100 + rank / 100, 13]], [[100.003 + rank / 100, 13.003], [100.006 + rank / 100, 13.003], [100.006 + rank / 100, 13.006], [100.003 + rank / 100, 13.006], [100.003 + rank / 100, 13.003]]]]};
    return {type: 'Feature', id, geometry, properties: {buildingId: id, sourceGeometrySHA256: digest(geometry), height: id.startsWith('ms:') ? 3 : 15, base: 0, sourceHeightM: id.startsWith('ms:') ? null : 15, rawHeight: id.startsWith('ms:') ? -1 : 15, heightRole: id.startsWith('ms:') ? 'unknown_display_fallback' : 'source_model_estimate', sourceURL: 'https://example.org/pinned-public-source'}};
  };
  for (const [source, rank] of [['native', 0], ['reference', 1], ['microsoft', 2]]) {
    const ids = new Set(cases.flatMap(c => c[source].candidateIds));
    features.set(source, new Map([...ids].map(id => [id, makeFeature(id, rank)])));
    for (let i = 1; i <= 77; i++) {
      const code = String(i).padStart(2, '0');
      const stores = i === 10 ? Object.fromEntries(cases.map(c => [c.id, c[source]])) : {};
      writeFileSync(join(directories[source], `${code}.json`), JSON.stringify({meta: {coverage: 'test snapshot'}, stores, buildings: {type: 'FeatureCollection', features: i === 10 ? [...features.get(source).values()] : []}}));
    }
  }
  const grocery = {rows: cases.map((c, i) => [c.id, 0, 0, -1, c.id, 100.001 + i / 10000, 13.001, 0, -1, 0])};
  writeFileSync(join(directories.data, 'grocery.json'), JSON.stringify(grocery));
  writeFileSync(join(directories.data, 'areas.json'), '{}');
  const run = () => spawnSync('python3', [script, '--native-dir', directories.native, '--reference-dir', directories.reference, '--microsoft-dir', directories.microsoft, '--data-dir', directories.data], {encoding: 'utf8'});
  return {directories, features, grocery, run};
}

test('merged province payload preserves exact chosen geometry/holes, valid candidate IDs and all source-point rows', t => {
  const fixture = makeFixture(t), before = readFileSync(join(fixture.directories.data, 'grocery.json'));
  const run = fixture.run(); assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readFileSync(join(fixture.directories.data, 'grocery.json')), before, 'merger cannot rewrite input coordinates or venue assignments');
  const payload = JSON.parse(readFileSync(join(fixture.directories.data, 'spatial/10.json')));
  const manifest = JSON.parse(readFileSync(join(fixture.directories.data, 'spatial-joins.json')));
  assert.equal(Object.keys(manifest.provinces).length, 77);
  assert.equal(Object.values(manifest.counts).reduce((a, b) => a + b, 0), cases.length);
  assert.deepEqual(Object.keys(payload.stores).sort(), cases.map(c => c.id).sort());
  const byId = new Map(payload.buildings.features.map(f => [f.id, f]));
  for (const c of cases) {
    const row = payload.stores[c.id];
    assert.equal(row.status, c.status, c.id);
    assert.equal(row.decisionSource, c.source, c.id);
    if (row.status !== 'point_inside') assert.equal(row.buildingId, null, c.id);
    else assert.ok(row.boundaryDistanceM >= 10, c.id);
    const provider = c.source === 'citymeter_native' ? 'native' : c.source === 'verified_reference' ? 'reference' : 'microsoft';
    for (const id of new Set([...(row.candidateIds || []), row.buildingId].filter(Boolean))) {
      const actual = byId.get(id), source = fixture.features.get(provider).get(id);
      assert.ok(actual && source, `${c.id}: selected ID belongs to the chosen provider`);
      assert.deepEqual(actual.geometry, source.geometry, `${c.id}: no union, crop, snap, rounding or lost courtyard`);
      for (const key of ['sourceGeometrySHA256', 'height', 'base', 'sourceHeightM', 'rawHeight', 'heightRole']) assert.deepEqual(actual.properties[key], source.properties[key], `${id}.${key}`);
    }
  }
  assert.match(payload.stores['native-boundary'].sourceConflict, /native_boundary_ms_inside/);
  assert.equal(payload.stores['microsoft-gap-fill'].decisionRule, 'native_no_polygon');
});

test('merge fails if a chosen candidate has no source geometry', t => {
  const fixture = makeFixture(t), path = join(fixture.directories.native, '10.json');
  const value = JSON.parse(readFileSync(path));
  value.buildings.features = value.buildings.features.filter(f => f.id !== 'native:edge');
  writeFileSync(path, JSON.stringify(value));
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /native:edge/);
});

test('merge rejects an earlier-source inside result that fails the 10m guard', t => {
  const fixture = makeFixture(t), path = join(fixture.directories.native, '10.json');
  const value = JSON.parse(readFileSync(path)); value.stores['native-deep'].boundaryDistanceM = 9.9;
  writeFileSync(path, JSON.stringify(value));
  assert.notEqual(fixture.run().status, 0, 'invalid interior cannot be laundered through merge precedence');
});

test('merge fails closed on duplicate source IDs and non-finite render heights', t => {
  const duplicate = makeFixture(t), path = join(duplicate.directories.native, '10.json');
  const value = JSON.parse(readFileSync(path));
  value.buildings.features.push({...value.buildings.features[0], geometry: {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]}});
  writeFileSync(path, JSON.stringify(value));
  assert.notEqual(duplicate.run().status, 0, 'duplicate ID cannot silently replace another source geometry');
  const infinite = makeFixture(t), heightPath = join(infinite.directories.native, '10.json');
  // Valid JSON number syntax that overflows a floating point reader: it must
  // never become a positive infinite extrusion or invalid browser JSON output.
  const source = readFileSync(heightPath, 'utf8');
  assert.match(source, /"height":15/);
  writeFileSync(heightPath, source.replaceAll('"height":15', '"height":1e999'));
  assert.notEqual(infinite.run().status, 0, 'render heights must be finite');
});

test('all provider snapshots must cover exactly the same province store-key set', t => {
  const fixture = makeFixture(t), path = join(fixture.directories.microsoft, '10.json');
  const value = JSON.parse(readFileSync(path)); delete value.stores['native-boundary'];
  writeFileSync(path, JSON.stringify(value));
  assert.notEqual(fixture.run().status, 0, 'one missing provider row cannot be silently omitted from the map');
});
