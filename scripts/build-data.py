#!/usr/bin/env python3
"""Build the CityMETER · Grocery demo datasets from the research sheet and the
production CityMETER API snapshot.

  python3 scripts/build-data.py --sheet <csv dir> --xlsx <master.xlsx> --raw <api raw dir> \
      --geo <full geojson dir> --membership <unit-membership.json> --mapshaper <mapshaper cli>

Inputs (not committed — see DATA_METHOD.md for how each one was obtained):
  sheet       tabs of "CityMETER Grocery Thailand — Source Audit / Refresh Master 2026-10-22" as CSV
  raw         production API responses: base/info lv0 + lv1, grocery/info lv0 + lv1?currentDetailType=ML
  geo         provinces / districts / ml .full.geojson assembled from grocery/info/geom (scripts/data/assemble-geo.py)
  membership  outlet → local-unit membership decoded from grocery/overlayMvt (scripts/data/merge-unit-membership.mjs)

Outputs:
  data/grocery.json          stores (one row per source point), brands, types, sources, venue candidates
  data/areas.json            country · 77 provinces · 928 districts · 8,621 local units with population and API counts
  data/geo/provinces.json    simplified province frames
  data/geo/p/<code>.json     districts + local units of one province (loaded on drill-down)
  data/detail/<code>.json    address and source tile of every store in one province (loaded on store detail)
  data/build-receipt.json    input hashes, reconciliation against the API at every level, simplification settings

Nothing is invented: a store's district comes from the source subdistrict membership (sheet district_code),
its local unit from the source overlay membership, population from the API. Missing stays missing.
"""
import argparse, collections, csv, hashlib, json, math, os, re, subprocess, sys, tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
AS_OF = '2026-10-22'
API = 'https://landometer.com/api/v2/citymeter-v3'
SIMPLIFY = {'provinces': ('1.5%', 0.0001), 'districts': ('3%', 0.00001), 'units': ('3%', 0.00001)}

TYPES = [
    # id, Thai, English, uniform estimate defaults from the production constants (sale m², visits/day)
    ('C_STORE', 'ร้านสะดวกซื้อ', 'Convenience store'),
    ('SUPERMARKET', 'ซูเปอร์มาร์เก็ต', 'Supermarket'),
    ('HYPERMARKET', 'ไฮเปอร์มาร์เก็ต', 'Hypermarket'),
    ('WHOLESALE', 'ค้าส่ง', 'Wholesale'),
    ('PHARMACY', 'ร้านขายยา', 'Pharmacy'),
]
# Source store_format values → a readable sub-format label (None = the type label is enough).
FORMATS = {
    'C_STORE': None, 'SUPERMARKET': None, 'WHOLESALE': None,
    'stores-lotuss-express': "Lotus's express", 'stores-lotuss-extra': "Lotus's extra", 'stores-lotuss-market': "Lotus's market",
    'Big C Mini': 'Big C Mini', 'Big C': 'Big C', 'Big C Market': 'Big C Market', 'Big C Foodplace': 'Big C Foodplace', 'Depot': 'Big C Depot',
    'tops_daily': 'Tops Daily', 'Tops': 'Tops', 'Tops Food Hall': 'Tops Food Hall', 'Pure Pharmacy': 'Pure Pharmacy',
}
UNIT_PREFIX = [('องค์การบริหารส่วนตำบล', 'อบต.'), ('เทศบาลตำบล', 'ทต.'), ('เทศบาลเมือง', 'ทม.'), ('เทศบาลนคร', 'ทน.'),
               ('องค์กรปกครองส่วนท้องถิ่นรูปแบบพิเศษ', '')]
VENUE_TYPES = {
    'fuel_station_or_operator_host': 'สถานีบริการน้ำมัน', 'hospital': 'โรงพยาบาล', 'shopping_center': 'ศูนย์การค้า',
    'shopping_center_candidate': 'ศูนย์การค้า', 'office_building': 'อาคารสำนักงาน', 'residential_complex': 'ที่พักอาศัย',
    'university_campus': 'มหาวิทยาลัย', 'rail_or_bus_station': 'สถานีขนส่ง', 'department_store_or_center_unresolved': 'ห้างสรรพสินค้า / ศูนย์การค้า',
    'hotel': 'โรงแรม', 'school': 'โรงเรียน', 'industrial_estate': 'นิคมอุตสาหกรรม', 'airport': 'สนามบิน',
    'mixed_use_complex_candidate': 'โครงการมิกซ์ยูส', 'retail_complex_candidate': 'คอมเพล็กซ์ค้าปลีก', 'department_store': 'ห้างสรรพสินค้า',
    'marina_complex_candidate': 'มารีนา', 'resort_complex_candidate': 'รีสอร์ต',
}
FLAG_ONLINE, FLAG_NO_ADDRESS = 1, 2


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def read_csv(sheet, name):
    with open(Path(sheet) / name, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def num(value):
    try:
        v = float(value)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def jdump(path, obj, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=1 if pretty else None, separators=None if pretty else (',', ':'))
    path.write_text(text + ('\n' if pretty else ''), encoding='utf-8')
    return path


def unit_label(name):
    for full, short in UNIT_PREFIX:
        if name.startswith(full):
            rest = name[len(full):].strip()
            return short, rest
    return '', name.strip()


def unit_district(code, kind):
    if kind != 'M': return None
    return code[2:6] if len(code) == 8 else code[1:5]


def simplify(mapshaper, src, pct, precision, out):
    cmd = [mapshaper, '-i', str(src), '-simplify', pct, 'weighted', 'keep-shapes', '-o', f'precision={precision}', 'format=geojson', str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr)
    return [l for l in (r.stderr + r.stdout).splitlines() if l.strip()]


def label_and_bbox(geometry):
    from shapely.geometry import shape
    from shapely.ops import polylabel
    g = shape(geometry)
    if not g.is_valid: g = g.buffer(0)
    parts = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
    parts = [p for p in parts if not p.is_empty]
    big = max(parts, key=lambda p: p.area)
    try:
        c = polylabel(big, tolerance=max(1e-5, math.sqrt(big.area) / 200))
    except Exception:
        c = big.representative_point()
    w, s, e, n = g.bounds
    return [round(c.x, 5), round(c.y, 5)], [round(w, 5), round(s, 5), round(e, 5), round(n, 5)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for a in ('--sheet', '--xlsx', '--raw', '--geo', '--membership', '--mapshaper'): ap.add_argument(a, required=True)
    args = ap.parse_args()
    raw = Path(args.raw)
    receipt = {'builtFor': 'CityMETER · Grocery demo', 'asOf': AS_OF, 'inputs': {}, 'checks': {}, 'notes': []}
    # The research sheet is private: the receipt keeps its title and byte hash, never its URL.
    receipt['inputs']['sheetXlsx'] = {'file': Path(args.xlsx).name, 'sha256': sha256_file(args.xlsx),
                                      'title': 'CityMETER Grocery Thailand — Source Audit / Refresh Master 2026-10-22'}
    for name in ('01_BRANDS.csv', '02_STORES.csv', '07_VENUES.csv', '10_VENUE_LOGOS.csv', '12_SOURCE_CATALOG.csv'):
        receipt['inputs'].setdefault('sheetTabs', {})[name] = sha256_file(Path(args.sheet) / name)
    for name in ('base-lv0.json', 'grocery-lv0.json', 'fetch-log-catalog.json', 'fetch-log-geometry.json', 'fetch-log-ml-overlay.json'):
        receipt['inputs'].setdefault('api', {})[name] = sha256_file(raw / name)
    receipt['inputs']['membership'] = {'file': Path(args.membership).name, 'sha256': sha256_file(args.membership)}
    for name in ('fetch-log-catalog.json', 'fetch-log-geometry.json', 'fetch-log-ml-overlay.json'):
        log = json.load(open(raw / name))
        entries = log if isinstance(log, list) else list(log.values())
        stamps = sorted(e['retrievedAt'] for e in entries if e.get('retrievedAt'))
        receipt['inputs'].setdefault('fetches', {})[name] = {'requests': len(entries), 'ok': sum(1 for e in entries if e.get('status') in (200, 'cached')),
                                                             'firstRetrievedAt': stamps[0] if stamps else None, 'lastRetrievedAt': stamps[-1] if stamps else None}

    # ---------- production area catalogue ----------
    lv0 = json.load(open(raw / 'base-lv0.json'))['value']
    g0 = json.load(open(raw / 'grocery-lv0.json'))['value']
    country = g0['countryDatas']['00000000-0000-0000-0000-000000000000']['rows'][0]
    provinces, districts, units = [], [], []
    dist_by_code, unit_by_id = {}, {}
    for p in sorted(lv0['provinceInfos'], key=lambda p: p['code']):
        pd = g0['provinceDatas'][p['id']]['rows'][0]
        b = json.load(open(raw / 'base-lv1' / f"{p['id']}.json"))['value']
        g1 = json.load(open(raw / 'grocery-lv1-ML' / f"{p['id']}.json"))['value']
        pi = len(provinces)
        provinces.append({'code': p['code'], 'abbr': p['abbrEn'], 'id': p['id'], 'name': p['nameTh'], 'nameEn': p['nameEn'],
                          'pop': pd.get('population') or None, 'areaKm2': round(p['areaSqm'] / 1e6, 2), 'api': pd['totalCount']})
        for d in sorted(b['districtInfos'], key=lambda d: d['code']):
            dd = g0['districtDatas'].get(d['id'], {}).get('rows', [{}])[0]
            dist_by_code[d['code']] = len(districts)
            districts.append({'code': d['code'], 'id': d['id'], 'name': d['nameTh'], 'p': pi, 'pop': dd.get('population') or None,
                              'areaKm2': round(d['areaSqm'] / 1e6, 2), 'api': dd.get('totalCount', 0)})
        stats = {**g1.get('municipalityDatas', {}), **g1.get('localeDatas', {})}
        for kind, infos in (('M', b['municipalityInfos']), ('L', b['localeInfos'])):
            for m in infos:
                s = stats.get(m['id'], {}).get('rows', [{}])[0]
                prefix, short = unit_label(m['nameTh']) if kind == 'M' else ('', m['nameTh'].strip())
                unit_by_id[m['id']] = len(units)
                units.append({'key': m['code'] if kind == 'M' else m['id'], 'id': m['id'], 'kind': kind, 'prefix': prefix, 'name': short,
                              'fullName': m['nameTh'], 'nameEn': m.get('nameEn') or '', 'p': pi, 'code': m['code'],
                              'pop': s.get('population') or None, 'areaKm2': round(m['areaSqm'] / 1e6, 3), 'api': s.get('totalCount', 0)})

    # ---------- sheet ----------
    stores = read_csv(args.sheet, '02_STORES.csv')
    brands_tab = read_csv(args.sheet, '01_BRANDS.csv')
    sources_tab = read_csv(args.sheet, '12_SOURCE_CATALOG.csv')
    venues_tab = read_csv(args.sheet, '07_VENUES.csv')
    membership = json.load(open(args.membership))
    member_units = membership['membership']
    assert membership['mismatchedUnits'] == 0, 'overlay membership does not reproduce the API unit counts'

    # Unit → parent district: DOLA code for municipalities; for Bangkok Locales the district most of their
    # source members report (ties → the full-resolution geometry overlap computed by scripts/data/assign-geometry.py).
    geo_district = json.load(open(Path(args.geo) / 'ml-assignment.json'))['ml_district']
    loc_votes = collections.defaultdict(collections.Counter)
    for s in stores:
        for uid in member_units.get(s['outlet_id'], []):
            u = units[unit_by_id[uid]]
            # Only districts of the unit's own province vote (a border Locale of Bangkok can hold stores
            # whose source subdistrict lies in Samut Prakan; its parent must stay a Bangkok เขต).
            if u['kind'] == 'L' and s['district_code'] in dist_by_code and districts[dist_by_code[s['district_code']]]['p'] == u['p']:
                loc_votes[uid][s['district_code']] += 1
    parent_method = collections.Counter()
    for u in units:
        code = unit_district(u['code'], u['kind'])
        if code and code in dist_by_code:
            u['d'] = dist_by_code[code]; parent_method['dola_code'] += 1; continue
        votes = loc_votes.get(u['id'])
        if votes:
            top = votes.most_common()
            best = [c for c, n in top if n == top[0][1]]
            pick = geo_district.get(u['id']) if geo_district.get(u['id']) in best else sorted(best)[0]
            u['d'] = dist_by_code[pick]; parent_method['member_majority'] += 1; continue
        gd = geo_district.get(u['id'])
        assert gd in dist_by_code and districts[dist_by_code[gd]]['p'] == u['p'], f"no in-province parent for {u['id']}"
        u['d'] = dist_by_code[gd]; parent_method['geometry_overlap'] += 1
    assert all(districts[u['d']]['p'] == u['p'] for u in units), 'a unit parent district lies outside its province'
    receipt['checks']['unitParentDistrict'] = dict(parent_method)

    brand_order = sorted(brands_tab, key=lambda b: -int(float(b['live_aggregate_count'] or 0)))
    brands = [{'id': b['brand_id'], 'name': b['brand_name'], 'types': [t.strip() for t in b['product_category'].split('|') if t.strip()],
               'api': int(float(b['live_aggregate_count'] or 0)), 'points': int(float(b['extracted_point_count'] or 0)),
               'locatorURL': (b['official_locator_urls'] or '').split('|')[0].strip(), 'vintage': b['source_vintages'],
               'scope': 'pharmacy' if b['scope_group'] == 'page_pharmacy_extension' else 'grocery'} for b in brand_order]
    brand_idx = {b['id']: i for i, b in enumerate(brands)}
    type_idx = {t[0]: i for i, t in enumerate(TYPES)}
    formats = sorted({v for v in FORMATS.values() if v})
    format_idx = {k: (formats.index(v) if v else -1) for k, v in FORMATS.items()}
    sources = [{'key': s['source_dataset_key'], 'label': s['source_label'], 'date': s['source_date_text'], 'url': s['upstream_url'],
                'limitation': s['source_limitation'], 'legacy': s['legacy_flag'] == 'True', 'rows': int(float(s['extracted_rows'] or 0))} for s in sources_tab]
    source_idx = {s['key']: i for i, s in enumerate(sources)}
    venue_rows = collections.Counter(s['venue_candidate_id'] for s in stores if s['venue_candidate_id'])
    venues = [{'id': v['venue_candidate_id'], 'name': v['venue_candidate_name'], 'type': v['venue_type'],
               'typeTh': VENUE_TYPES.get(v['venue_type'], 'สถานที่'), 'logo': v['logo_key'] or None, 'role': v['logo_role'] or None}
              for v in venues_tab if venue_rows.get(v['venue_candidate_id'])]
    venues.sort(key=lambda v: v['id'])
    venue_idx = {v['id']: i for i, v in enumerate(venues)}

    # Short store key: the first 8 hex digits of the source outlet uuid (unique in this snapshot; the build
    # stops if a refresh ever makes them collide). The full uuid travels in data/detail/<province>.json.
    short_id = {s['outlet_id']: s['outlet_id'].replace('-', '')[:8] for s in stores}
    assert len(set(short_id.values())) == len(stores), 'short store keys collide — lengthen them'
    rows, detail = [], collections.defaultdict(dict)
    issues = collections.Counter()
    unit_rows = collections.Counter()
    for s in sorted(stores, key=lambda s: (s['province_code'], s['district_code'], s['outlet_id'])):
        cat = s['category_key'].split(':')[0]
        lon, lat = num(s['longitude']), num(s['latitude'])
        if lon is None or lat is None: issues['no_point'] += 1
        uids = member_units.get(s['outlet_id'], [])
        uix = [unit_by_id[u] for u in uids]
        for u in uix: unit_rows[u] += 1
        unit = uix[0] if len(uix) == 1 else (sorted(uix) if uix else -1)
        flags = (FLAG_ONLINE if s['online_name_flag'] == 'True' or s['online_channel_candidate'] == 'True' else 0) | (0 if s['address'].strip() else FLAG_NO_ADDRESS)
        row = [short_id[s['outlet_id']], brand_idx[s['brand_id']], type_idx[cat], format_idx.get(s['store_format'], -1), s['store_name'].strip(),
               round(lon, 5), round(lat, 5), dist_by_code[s['district_code']], unit, source_idx[s['source_dataset_key']]]
        v = venue_idx.get(s['venue_candidate_id'], -1)
        if v >= 0 or flags: row.append(v)
        if flags: row.append(flags)
        rows.append(row)
        q = parse_qs(urlparse(s['alternate_source_urls'] or s['coordinate_source_url']).query)
        m = re.search(r'/overlayMvt/10/(\d+)/(\d+)', s['alternate_source_urls'] or s['coordinate_source_url'] or '')
        detail[s['province_code']][short_id[s['outlet_id']]] = [s['outlet_id'], s['address'].strip(), s['subdistrict_name'].strip(), s['subdistrict_code'].strip(),
                                                      f"{m.group(1)}/{m.group(2)}" if m else '', (q.get('inTileId') or [''])[0]]

    # ---------- reconciliation against the API at every level ----------
    by_p = collections.Counter(districts[r[7]]['p'] for r in rows)
    by_d = collections.Counter(r[7] for r in rows)
    checks = receipt['checks']
    checks['country'] = {'api': country['totalCount'], 'rows': len(rows), 'difference': len(rows) - country['totalCount']}
    checks['provinces'] = {'total': len(provinces), 'equal': sum(1 for i, p in enumerate(provinces) if by_p[i] == p['api']),
                           'differ': [{'code': p['code'], 'api': p['api'], 'rows': by_p[i]} for i, p in enumerate(provinces) if by_p[i] != p['api']]}
    checks['districts'] = {'total': len(districts), 'equal': sum(1 for i, d in enumerate(districts) if by_d[i] == d['api']),
                           'differ': [{'code': d['code'], 'name': d['name'], 'api': d['api'], 'rows': by_d[i]} for i, d in enumerate(districts) if by_d[i] != d['api']]}
    checks['units'] = {'total': len(units), 'withStores': sum(1 for u in units if u['api'] > 0),
                       'equal': sum(1 for i, u in enumerate(units) if unit_rows[i] == u['api']),
                       'differ': [{'key': u['key'], 'api': u['api'], 'rows': unit_rows[i]} for i, u in enumerate(units) if unit_rows[i] != u['api']]}
    checks['rowsInTwoUnits'] = sum(1 for r in rows if isinstance(r[8], list))
    checks['rowsOutsideUnits'] = [{'key': r[0], 'name': r[4], 'district': districts[r[7]]['code']} for r in rows if r[8] == -1]
    checks['rowDistrictOutsideUnitParent'] = sum(1 for r in rows if not isinstance(r[8], list) and r[8] >= 0 and units[r[8]]['d'] != r[7])
    checks['populationTotals'] = {'country': country['population'], 'provinces': sum(p['pop'] or 0 for p in provinces),
                                  'districts': sum(d['pop'] or 0 for d in districts), 'unitsWithoutPopulation': sum(1 for u in units if not u['pop'])}
    checks['typeCounts'] = dict(collections.Counter(TYPES[r[2]][0] for r in rows))
    checks['brandCounts'] = {b['id']: sum(1 for r in rows if r[1] == i) for i, b in enumerate(brands)}
    receipt['issues'] = dict(issues)

    # ---------- geometry ----------
    geo = Path(args.geo)
    tmp = Path(tempfile.mkdtemp(prefix='grocery-geo-'))
    logs = {}
    for layer, src in (('provinces', 'provinces.full.geojson'), ('districts', 'districts.full.geojson'), ('units', 'ml.full.geojson')):
        pct, prec = SIMPLIFY[layer]
        logs[layer] = simplify(args.mapshaper, geo / src, pct, prec, tmp / f'{layer}.json')
    receipt['geometry'] = {'tool': 'mapshaper -simplify <pct> weighted keep-shapes', 'settings': {k: {'retain': v[0], 'precision': v[1]} for k, v in SIMPLIFY.items()},
                           'log': logs, 'source': f'{API}/grocery/info/geom/<id>/<PROVINCE|DISTRICT|MUNICIPALITY|LOCALE>'}
    prov_fc = json.load(open(tmp / 'provinces.json'))
    code_to_pi = {p['code']: i for i, p in enumerate(provinces)}
    out_features = []
    for f in prov_fc['features']:
        pi = code_to_pi[f['properties']['code']]
        label, bbox = label_and_bbox(f['geometry'])
        provinces[pi]['label'], provinces[pi]['bbox'] = label, bbox
        out_features.append({'type': 'Feature', 'id': provinces[pi]['code'], 'properties': {'code': provinces[pi]['code']}, 'geometry': f['geometry']})
    jdump(DATA / 'geo' / 'provinces.json', {'type': 'FeatureCollection', 'features': sorted(out_features, key=lambda f: f['id'])})
    per_province = collections.defaultdict(list)
    for f in json.load(open(tmp / 'districts.json'))['features']:
        di = dist_by_code[f['properties']['code']]
        label, bbox = label_and_bbox(f['geometry'])
        districts[di]['label'], districts[di]['bbox'] = label, bbox
        per_province[provinces[districts[di]['p']]['code']].append({'type': 'Feature', 'id': 'd' + districts[di]['code'],
            'properties': {'l': 'd', 'k': districts[di]['code']}, 'geometry': f['geometry']})
    for f in json.load(open(tmp / 'units.json'))['features']:
        ui = unit_by_id[f['properties']['id']]
        label, bbox = label_and_bbox(f['geometry'])
        u = units[ui]
        per_province[provinces[u['p']]['code']].append({'type': 'Feature', 'id': 'u' + u['key'],
            'properties': {'l': 'u', 'k': u['key'], 'c': label, 'b': bbox}, 'geometry': f['geometry']})
    sizes = {}
    for code, feats in per_province.items():
        feats.sort(key=lambda f: (f['properties']['l'], f['id']))
        sizes[code] = jdump(DATA / 'geo' / 'p' / f'{code}.json', {'type': 'FeatureCollection', 'features': feats}).stat().st_size
    receipt['geometry']['provinceFiles'] = {'count': len(sizes), 'maxBytes': max(sizes.values()), 'totalBytes': sum(sizes.values())}

    # ---------- write ----------
    meta = {
        'dataset': 'CityMETER Grocery Thailand', 'asOf': AS_OF, 'apiTotal': country['totalCount'], 'pointRows': len(rows),
        'aggregateOnly': [d for d in checks['districts']['differ']],
        'population': {'total': country['population'], 'source': 'ประชากรตามทะเบียนราษฎร กรมการปกครอง พ.ค. 2569 (ค่าที่ CityMETER ใช้)'},
        'coordinates': 'ถอดจาก vector tile สาธารณะ z10 (extent 4096) — ตารางประมาณ 9.55 ม. ไม่ใช่พิกัดสำรวจหน้าร้าน',
        'status': 'not_revalidated', 'production': 'https://landometer.com/v3/citymeter?d=grocery',
        'estimates': {t: {'saleAreaSqm': None, 'visitsPerDay': None} for t, *_ in TYPES},
    }
    for s in stores:  # uniform type defaults (production constants) — documented, never shown as measured
        t = s['category_key'].split(':')[0]
        meta['estimates'][t] = {'saleAreaSqm': num(s['estimated_sale_area_sqm']), 'visitsPerDay': num(s['estimated_traffic_per_day'])}
    grocery = {
        'meta': meta,
        'brands': brands,
        'types': [{'id': t, 'th': th, 'en': en} for t, th, en in TYPES],
        'formats': formats,
        'sources': sources,
        'venues': [[v['id'], v['name'], v['type'], v['typeTh'], v['logo'], v['role']] for v in venues],
        'fields': ['id', 'brand', 'type', 'format', 'name', 'lon', 'lat', 'district', 'unit', 'source', 'venue', 'flags'],
        'rows': rows,
    }
    jdump(DATA / 'grocery.json', grocery)
    areas = {
        'country': {'code': 'TH', 'name': 'ประเทศไทย', 'pop': country['population'], 'areaKm2': round(country['areaSqm'] / 1e6, 1), 'api': country['totalCount']},
        'provinces': {'fields': ['code', 'abbr', 'id', 'name', 'nameEn', 'pop', 'areaKm2', 'api', 'bbox', 'label'],
                      'rows': [[p[k] for k in ('code', 'abbr', 'id', 'name', 'nameEn', 'pop', 'areaKm2', 'api', 'bbox', 'label')] for p in provinces]},
        'districts': {'fields': ['code', 'name', 'p', 'pop', 'areaKm2', 'api', 'bbox', 'label'],
                      'rows': [[d[k] for k in ('code', 'name', 'p', 'pop', 'areaKm2', 'api', 'bbox', 'label')] for d in districts]},
        'units': {'fields': ['key', 'kind', 'prefix', 'name', 'nameEn', 'd', 'pop', 'areaKm2', 'api'],
                  'rows': [[u[k] for k in ('key', 'kind', 'prefix', 'name', 'nameEn', 'd', 'pop', 'areaKm2', 'api')] for u in units]},
    }
    jdump(DATA / 'areas.json', areas)
    for code, d in detail.items():
        jdump(DATA / 'detail' / f'{code}.json', {'fields': ['uuid', 'address', 'subdistrict', 'subdistrictCode', 'tile', 'tileArea'], 'rows': d})
    outputs = {}
    for p in sorted(DATA.rglob('*.json')):
        if p.name == 'build-receipt.json' or 'logos' in p.name: continue
        outputs[str(p.relative_to(ROOT))] = {'bytes': p.stat().st_size, 'sha256': sha256_file(p)}
    receipt['outputs'] = {'count': len(outputs), 'core': {k: v for k, v in outputs.items() if k.count('/') == 1}}
    jdump(DATA / 'build-receipt.json', receipt, pretty=True)
    print(json.dumps({'rows': len(rows), 'provinces': len(provinces), 'districts': len(districts), 'units': len(units), 'venues': len(venues),
                      'checks': {k: (v if not isinstance(v, dict) else {kk: (vv if not isinstance(vv, list) else len(vv)) for kk, vv in v.items()}) for k, v in checks.items()},
                      'core': receipt['outputs']['core'], 'geometry': receipt['geometry']['provinceFiles']}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
