"""Rendered QA harness for CityMETER Grocery (scripts/qa/README.md).

Serves the app from QA_ROOT (default http://127.0.0.1:4173/ = `npm start`), routes the MapLibre CDN to a
vendored copy (QA_VENDOR, default scripts/qa/vendor/package/dist from `npm pack maplibre-gl@5.6.2`) and
answers the OpenFreeMap TileJSON with a stub whose tiles are empty — for sandboxes that cannot reach
unpkg.com or tiles.openfreemap.org. Data layers, venue buildings and the x-ray render; basemap and massing
do not, so the real-tile look must still be checked on the live site. Screenshots + JSON go to QA_OUT
(default dist/qa, git-ignored)."""
import json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).resolve().parent
ROOT = os.environ.get('QA_ROOT', 'http://127.0.0.1:4173/')
VENDOR = Path(os.environ.get('QA_VENDOR', HERE / 'vendor' / 'package' / 'dist'))
OUT = Path(os.environ.get('QA_OUT', HERE.parent.parent / 'dist' / 'qa'))
OUT.mkdir(parents=True, exist_ok=True)
JS = (VENDOR / 'maplibre-gl.js').read_bytes(); CSS = (VENDOR / 'maplibre-gl.css').read_bytes()
TILEJSON = {"tilejson": "3.0.0", "tiles": ["https://tiles.openfreemap.org/stub/{z}/{x}/{y}.pbf"], "minzoom": 0, "maxzoom": 14,
            "vector_layers": [{"id": n, "fields": {}} for n in ["water", "waterway", "landcover", "landuse", "park", "transportation", "transportation_name", "building", "place", "boundary", "water_name", "aeroway", "poi", "housenumber", "mountain_peak", "aerodrome_label"]]}

def route(r):
    u = r.request.url
    if 'maplibre-gl.js' in u: return r.fulfill(status=200, body=JS, headers={'content-type': 'application/javascript', 'access-control-allow-origin': '*'})
    if 'maplibre-gl.css' in u: return r.fulfill(status=200, body=CSS, headers={'content-type': 'text/css'})
    if u.rstrip('/').endswith('/planet'): return r.fulfill(status=200, body=json.dumps(TILEJSON), headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
    return r.fulfill(status=200, body=b'', headers={'content-type': 'application/x-protobuf', 'access-control-allow-origin': '*'})

def open_page(p, width=1280, height=800, query='', theme='light', mobile=False):
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile, color_scheme=theme)
    pg = ctx.new_page()
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    for pat in ['https://unpkg.com/**', 'https://tiles.openfreemap.org/**']: pg.route(pat, route)
    t0 = time.time()
    pg.goto(ROOT + 'index.html' + query, wait_until='load')
    pg.wait_for_function('window.__citymeter && window.__citymeter.state.model', timeout=30000)
    ready = time.time() - t0
    try: pg.wait_for_function('window.__citymeter.state.loaded', timeout=30000)
    except Exception as e: logs.append(f'map not loaded: {e}')
    pg.wait_for_timeout(1500)
    return b, pg, logs, ready

if __name__ == '__main__':
    with sync_playwright() as p:
        b, pg, logs, ready = open_page(p)
        print('ready s', round(ready, 2))
        pg.screenshot(path=str(OUT / 'd1-country.png'))
        info = pg.evaluate("""() => { const s = window.__citymeter.state; return {level: s.sel, aha: s.aha && {share: s.aha.share, pop: s.aha.popShare, top: s.aha.top.map(t => t.name)}, rows: s.rows.length, filtered: s.filtered.length, zoom: s.map && s.map.getZoom(), labels: document.querySelectorAll('.area-label:not([hidden])').length, title: document.title}; }""")
        print(json.dumps(info, ensure_ascii=False))
        print('\n'.join(logs[:20]))
        b.close()
