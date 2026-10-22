"""Fetch source-native store membership per ML unit (municipality or Bangkok Locale) from the
production overlay vector tiles: grocery/overlayMvt/10/{x}/{y}?inTileType={MUNICIPALITY|LOCALE}&inTileId={id}.
Only units whose API aggregate count is > 0 are fetched; tiles cover the unit's extent at z10."""
import gzip, hashlib, json, math, os, sys, time, threading, concurrent.futures as cf
import requests
RAW = sys.argv[1]
OUT = os.path.join(RAW, 'ml-overlay'); os.makedirs(OUT, exist_ok=True)
B = 'https://landometer.com/api/v2/citymeter-v3/grocery/overlayMvt/10/{x}/{y}?inTileType={t}&inTileId={id}'
S = requests.Session(); S.headers['User-Agent'] = 'CityMETER-Grocery-demo-build (montri@landometer.com)'
R = 6378137
def lonlat(x, y): return (x / R * 180 / math.pi, (2 * math.atan(math.exp(y / R)) - math.pi / 2) * 180 / math.pi)
def tile(lon, lat, z=10):
    n = 2 ** z; x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y
lv0 = json.load(open(os.path.join(RAW, 'base-lv0.json')))['value']
jobs = []
for p in lv0['provinceInfos']:
    b = json.load(open(os.path.join(RAW, 'base-lv1', p['id'] + '.json')))['value']
    g = json.load(open(os.path.join(RAW, 'grocery-lv1-ML', p['id'] + '.json')))['value']
    stats = {**g.get('municipalityDatas', {}), **g.get('localeDatas', {})}
    for kind, infos in (('MUNICIPALITY', b['municipalityInfos']), ('LOCALE', b['localeInfos'])):
        for m in infos:
            if stats.get(m['id'], {'rows': [{'totalCount': 0}]})['rows'][0]['totalCount'] <= 0: continue
            e = m['extent']; lo1, la1 = lonlat(e[0], e[1]); lo2, la2 = lonlat(e[2], e[3])
            x1, y2 = tile(lo1, la1); x2, y1 = tile(lo2, la2)
            for x in range(min(x1, x2), max(x1, x2) + 1):
                for y in range(min(y1, y2), max(y1, y2) + 1):
                    jobs.append((kind, m['id'], x, y))
print('units', len({j[1] for j in jobs}), 'tile requests', len(jobs), flush=True)
lock = threading.Lock(); LOG = {}
logpath = os.path.join(RAW, 'fetch-log-ml-overlay.json')
if os.path.exists(logpath): LOG = json.load(open(logpath))
def fetch(job):
    kind, id_, x, y = job
    key = f'{id_}/{x}/{y}'; path = os.path.join(OUT, id_, f'{x}-{y}.pbf.gz')
    if key in LOG and LOG[key].get('status') == 200 and os.path.exists(path): return 'cached'
    url = B.format(x=x, y=y, t=kind, id=id_)
    for attempt in range(5):
        try:
            r = S.get(url, timeout=60)
            if r.status_code == 200:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with gzip.open(path, 'wb') as f: f.write(r.content)
                with lock: LOG[key] = {'url': url, 'status': 200, 'bytes': len(r.content), 'sha256': hashlib.sha256(r.content).hexdigest(), 'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                return 'ok'
            with lock: LOG[key] = {'url': url, 'status': r.status_code}
        except Exception as e:
            with lock: LOG[key] = {'url': url, 'status': 'error', 'error': str(e)[:200]}
        time.sleep(2 * (attempt + 1))
    return 'failed'
res = {}; t0 = time.time(); done = 0
with cf.ThreadPoolExecutor(6) as ex:
    for r in ex.map(fetch, jobs):
        res[r] = res.get(r, 0) + 1; done += 1
        if done % 1000 == 0:
            print(done, res, round(time.time() - t0), 's', flush=True)
            with lock: json.dump(LOG, open(logpath, 'w'))
json.dump(LOG, open(logpath, 'w'))
print('done', res, round(time.time() - t0), 's')
