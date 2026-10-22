"""Assemble full-resolution GeoJSON layers from the raw production geometry responses."""
import gzip, json, os, sys
RAW = sys.argv[1]; OUT = sys.argv[2]
lv0 = json.load(open(os.path.join(RAW, 'base-lv0.json')))['value']
prov_by_id = {p['id']: p for p in lv0['provinceInfos']}
def geom(kind, id_):
    raw = gzip.open(os.path.join(RAW, 'geom', kind, id_ + '.json.gz')).read()
    v = json.loads(raw)['value']
    return json.loads(v) if isinstance(v, str) else v
layers = {'provinces': [], 'districts': [], 'ml': []}
for p in lv0['provinceInfos']:
    layers['provinces'].append({'type': 'Feature', 'properties': {'id': p['id'], 'code': p['code'], 'abbr': p['abbrEn'], 'name': p['nameTh'], 'nameEn': p['nameEn']}, 'geometry': geom('PROVINCE', p['id'])})
    b = json.load(open(os.path.join(RAW, 'base-lv1', p['id'] + '.json')))['value']
    for d in b['districtInfos']:
        layers['districts'].append({'type': 'Feature', 'properties': {'id': d['id'], 'code': d['code'], 'name': d['nameTh'], 'province': p['code']}, 'geometry': geom('DISTRICT', d['id'])})
    for m in b['municipalityInfos']:
        layers['ml'].append({'type': 'Feature', 'properties': {'id': m['id'], 'kind': 'M', 'code': m['code'], 'name': m['nameTh'], 'province': p['code']}, 'geometry': geom('MUNICIPALITY', m['id'])})
    for l in b['localeInfos']:
        layers['ml'].append({'type': 'Feature', 'properties': {'id': l['id'], 'kind': 'L', 'code': l['code'], 'name': l['nameTh'], 'nameEn': l.get('nameEn'), 'province': p['code']}, 'geometry': geom('LOCALE', l['id'])})
os.makedirs(OUT, exist_ok=True)
for k, feats in layers.items():
    types = {}
    for f in feats: types[f['geometry']['type']] = types.get(f['geometry']['type'], 0) + 1
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, k + '.full.geojson'), 'w'), ensure_ascii=False)
    print(k, len(feats), types, os.path.getsize(os.path.join(OUT, k + '.full.geojson')) // 1024, 'KB')
