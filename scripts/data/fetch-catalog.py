"""Fetch the CityMETER production area catalogue used by the Grocery page.

Writes raw JSON responses (unchanged bytes) under work/api/raw/ and a fetch log
with URL, HTTP status, byte length and SHA-256 for every request.
"""
import hashlib, json, os, sys, time, concurrent.futures as cf
import requests

BASE = 'https://landometer.com/api/v2/citymeter-v3'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
S = requests.Session()
S.headers['User-Agent'] = 'CityMETER-Grocery-demo-build (montri@landometer.com)'
LOG = []

def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        b = open(path, 'rb').read()
        LOG.append({'url': url, 'status': 'cached', 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'path': os.path.relpath(path, OUT)})
        return b
    for attempt in range(4):
        try:
            r = S.get(url, timeout=60)
            if r.status_code == 200:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, 'wb').write(r.content)
                LOG.append({'url': url, 'status': 200, 'bytes': len(r.content), 'sha256': hashlib.sha256(r.content).hexdigest(), 'path': os.path.relpath(path, OUT), 'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
                return r.content
            LOG.append({'url': url, 'status': r.status_code})
        except Exception as e:
            LOG.append({'url': url, 'status': 'error', 'error': str(e)[:200]})
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError('failed ' + url)

lv0 = json.loads(get(f'{BASE}/base/info/lv0', f'{OUT}/base-lv0.json'))
get(f'{BASE}/grocery/info/lv0', f'{OUT}/grocery-lv0.json')
provs = lv0['value']['provinceInfos']
print('provinces', len(provs))
jobs = []
with cf.ThreadPoolExecutor(6) as ex:
    for p in provs:
        jobs.append(ex.submit(get, f"{BASE}/base/info/lv1/{p['id']}", f"{OUT}/base-lv1/{p['id']}.json"))
        jobs.append(ex.submit(get, f"{BASE}/grocery/info/lv1/{p['id']}?currentDetailType=ML", f"{OUT}/grocery-lv1-ML/{p['id']}.json"))
    for j in cf.as_completed(jobs): j.result()
json.dump(LOG, open(f'{OUT}/fetch-log-catalog.json', 'w'), ensure_ascii=False, indent=1)
print('requests', len(LOG))
