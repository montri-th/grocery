"""Fetch exact production geometries (GeoJSON strings) for every province, district
and ML unit (municipality outside Bangkok, Locale inside Bangkok).

Each response is stored gzip-compressed with its SHA-256 (of the uncompressed
response bytes) in a log, so derived simplified layers can cite their source.
"""
import gzip, hashlib, json, os, sys, time, concurrent.futures as cf, threading
import requests

BASE = 'https://landometer.com/api/v2/citymeter-v3/grocery/info/geom'
RAW = sys.argv[1]
OUT = os.path.join(RAW, 'geom')
os.makedirs(OUT, exist_ok=True)
S = requests.Session()
S.headers['User-Agent'] = 'CityMETER-Grocery-demo-build (montri@landometer.com)'
lock = threading.Lock()
LOG = {}
logpath = os.path.join(RAW, 'fetch-log-geometry.json')
if os.path.exists(logpath): LOG = json.load(open(logpath))

def fetch(kind, id_):
    key = f'{kind}/{id_}'
    path = os.path.join(OUT, kind, id_ + '.json.gz')
    if key in LOG and LOG[key].get('status') == 200 and os.path.exists(path): return 'cached'
    url = f'{BASE}/{id_}/{kind}'
    for attempt in range(5):
        try:
            r = S.get(url, timeout=90)
            if r.status_code == 200 and r.content:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with gzip.open(path, 'wb') as f: f.write(r.content)
                with lock: LOG[key] = {'url': url, 'status': 200, 'bytes': len(r.content), 'sha256': hashlib.sha256(r.content).hexdigest(), 'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                return 'ok'
            with lock: LOG[key] = {'url': url, 'status': r.status_code}
        except Exception as e:
            with lock: LOG[key] = {'url': url, 'status': 'error', 'error': str(e)[:200]}
        time.sleep(2 * (attempt + 1))
    return 'failed'

lv0 = json.load(open(os.path.join(RAW, 'base-lv0.json')))['value']
jobs = []
for p in lv0['provinceInfos']:
    jobs.append(('PROVINCE', p['id']))
    b = json.load(open(os.path.join(RAW, 'base-lv1', p['id'] + '.json')))['value']
    jobs += [('DISTRICT', d['id']) for d in b['districtInfos']]
    jobs += [('MUNICIPALITY', m['id']) for m in b['municipalityInfos']]
    jobs += [('LOCALE', l['id']) for l in b['localeInfos']]
print('jobs', len(jobs), flush=True)
done = 0; res = {}
t0 = time.time()
with cf.ThreadPoolExecutor(6) as ex:
    futs = {ex.submit(fetch, k, i): (k, i) for k, i in jobs}
    for f in cf.as_completed(futs):
        r = f.result(); res[r] = res.get(r, 0) + 1; done += 1
        if done % 500 == 0:
            print(done, res, round(time.time() - t0), 's', flush=True)
            with lock: json.dump(LOG, open(logpath, 'w'))
json.dump(LOG, open(logpath, 'w'))
print('done', res, round(time.time() - t0), 's')
