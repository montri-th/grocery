"""Assign each store row to an ML unit (municipality / Bangkok Locale) by point-in-polygon on the
full-resolution production geometry; assign each ML unit to a district by largest overlap.
Reconcile with the API's per-ML aggregate counts."""
import csv, json, os, sys, collections, time
from shapely.geometry import shape, Point
from shapely.strtree import STRtree
from shapely import make_valid
GEO = sys.argv[1]; SHEET = sys.argv[2]; RAW = sys.argv[3]; OUT = sys.argv[4]
t0 = time.time()
ml = json.load(open(os.path.join(GEO, 'ml.full.geojson')))['features']
dist = json.load(open(os.path.join(GEO, 'districts.full.geojson')))['features']
def geomv(f):
    g = shape(f['geometry'])
    return g if g.is_valid else make_valid(g)
mlg = [geomv(f) for f in ml]; dg = [geomv(f) for f in dist]
print('geoms loaded', round(time.time() - t0), 's', 'invalid fixed ml', sum(1 for f in ml if not shape(f['geometry']).is_valid))
mtree = STRtree(mlg); dtree = STRtree(dg)
rows = list(csv.DictReader(open(os.path.join(SHEET, '02_STORES.csv'), encoding='utf-8')))
assign = {}; multi = 0; none = []
dist_mismatch = 0
for r in rows:
    p = Point(float(r['longitude']), float(r['latitude']))
    hits = [i for i in mtree.query(p) if mlg[i].covers(p)]
    if len(hits) > 1: multi += 1
    if hits:
        # deterministic: smallest area wins on overlap/shared edge
        hits.sort(key=lambda i: (mlg[i].area, ml[i]['properties']['id']))
        assign[r['outlet_id']] = ml[hits[0]]['properties']['id']
    else:
        none.append(r)
    dh = [i for i in dtree.query(p) if dg[i].covers(p)]
    if dh and dist[dh[0]]['properties']['code'] != r['district_code']: dist_mismatch += 1
print('rows', len(rows), 'assigned', len(assign), 'multi-hit', multi, 'unassigned', len(none), 'district geom != source code', dist_mismatch, round(time.time() - t0), 's')
# nearest ML for unassigned (report only; not assigned)
for r in none[:10]:
    p = Point(float(r['longitude']), float(r['latitude']))
    i = mtree.nearest(p)
    print('  unassigned', r['brand_name'], r['store_name'], r['province'], r['district_code'], 'nearest', ml[i]['properties']['name'], round(mlg[i].distance(p) * 111000), 'm')
# ML -> district by largest overlap
ml_district = {}
for i, f in enumerate(ml):
    g = mlg[i]; best = None; ba = 0
    for j in dtree.query(g):
        if dist[j]['properties']['province'] != f['properties']['province']: continue
        a = g.intersection(dg[j]).area
        if a > ba: ba, best = a, j
    ml_district[f['properties']['id']] = dist[best]['properties']['code'] if best is not None else None
print('ml without district', sum(1 for v in ml_district.values() if not v), round(time.time() - t0), 's')
# reconcile with API counts
api = {}
for fn in os.listdir(os.path.join(RAW, 'grocery-lv1-ML')):
    v = json.load(open(os.path.join(RAW, 'grocery-lv1-ML', fn)))['value']
    for k, x in {**v.get('municipalityDatas', {}), **v.get('localeDatas', {})}.items():
        api[k] = x['rows'][0]
ours = collections.Counter(assign.values())
diff = {k: ours.get(k, 0) - api[k]['totalCount'] for k in api}
nz = {k: d for k, d in diff.items() if d}
print('ML units', len(api), 'count mismatches', len(nz), 'abs diff total', sum(abs(d) for d in nz.values()), 'exact match share', round(1 - len(nz) / len(api), 4))
names = {f['properties']['id']: f['properties']['name'] for f in ml}
for k, d in sorted(nz.items(), key=lambda kv: -abs(kv[1]))[:12]: print('  ', names[k], 'ours', ours.get(k, 0), 'api', api[k]['totalCount'])
json.dump({'assign': assign, 'ml_district': ml_district, 'unassigned': [r['outlet_id'] for r in none], 'mismatch': {k: {'ours': ours.get(k, 0), 'api': api[k]['totalCount']} for k in nz}}, open(OUT, 'w'))
print('done', round(time.time() - t0), 's')
