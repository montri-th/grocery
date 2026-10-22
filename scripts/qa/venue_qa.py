"""Venue-level flows of CityMETER Grocery (release 0.2): unit with venue buildings → venue (two-point eye,
x-ray, quiet scene) → มุมสถาปนิก off/on → store in the venue → x-ray click back to the venue → 2D;
centralwOrld, a point-building venue, a venue without buildings; dark; mobile sheet → eye.
Rendered harness: scripts/qa/harness.py (stub tiles: occluders stay 0 here — check them live).
Writes screenshots and harness-venue.json to QA_OUT."""
import json, os, time
from playwright.sync_api import sync_playwright
from harness import open_page, OUT

LOG = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'scenarios': []}
PARAGON, WORLD = 'GV-eb55a15be512058d', 'GV-26efea421326c00d'
RAMINDRA, SAMSEN = 'GV-15636684fbc51542', 'GV-7794cd0558ec8748'
SIAM_UNIT = '?province=BKK&district=1007&unit=8d8ed740-cd31-4b6a-859f-096f1f3d0b0e'

STATE_JS = """() => { const c = window.__citymeter, s = c.state, m = s.map, eye = document.getElementById('toggle-eye');
  const src = m && m.getSource('joined-buildings'), data = src && src._data;
  return {url: location.search, panel: s.panel.mode, title: document.title,
    crumbs: [...document.querySelectorAll('#crumbs li')].map(li => li.textContent.trim()).filter(Boolean),
    zoom: m && +m.getZoom().toFixed(2), pitch: m && +m.getPitch().toFixed(1), bearing: m && +m.getBearing().toFixed(1), fov: m && m.getVerticalFieldOfView && +m.getVerticalFieldOfView().toFixed(1),
    eye: eye && {pressed: eye.getAttribute('aria-pressed'), disabled: eye.disabled}, twoPoint: s.twoPoint,
    buildings: data && data.features ? data.features.length : null, venueHosts: s.venueHosts.length,
    xray: c.xray && {count: c.xray.count, enabled: c.xray.enabled, failed: c.xray.failed},
    occluders: s.massing ? s.massing.occluders.length : null,
    legendVenue: !document.getElementById('legend-venue-building').hidden, legendPoint: !document.getElementById('legend-joined').hidden,
    layers: m ? m.getStyle().layers.map(l => l.id).filter(id => /massing|joined|xray|water-name/.test(id)) : [],
    panelFirstSection: (document.querySelector('#panel-view .panel-section .section-heading')?.textContent || '').replace(/\\s+/g, ' ').trim(),
    pins: document.querySelectorAll('.store-pin:not([hidden])').length, overflowX: document.documentElement.scrollWidth - window.innerWidth,
    theme: document.documentElement.dataset.theme}; }"""

def settle(pg, ms=2200):
    pg.wait_for_timeout(ms)
    try: pg.wait_for_function("() => { const m = window.__citymeter.map; return !m || (m.loaded() && m.areTilesLoaded() && !m.isMoving()); }", timeout=20000)
    except Exception: LOG.setdefault('waitTimeouts', []).append(pg.url)
    pg.wait_for_timeout(500)

def snap(pg, name, note=''):
    settle(pg, 300)
    pg.screenshot(path=str(OUT / f'{name}.png'))
    st = pg.evaluate(STATE_JS)
    LOG['scenarios'].append({'name': name, 'note': note, 'state': st})
    print(name, json.dumps({k: st[k] for k in ('url', 'panel', 'crumbs', 'zoom', 'pitch', 'fov', 'eye', 'buildings', 'venueHosts', 'xray', 'occluders', 'legendVenue', 'legendPoint', 'overflowX')}, ensure_ascii=False))
    return st

def finish(b, logs, label):
    errors = [l for l in logs if l.startswith('pageerror') or (l.startswith('error') and 'Failed to load resource' not in l)]
    LOG['scenarios'].append({'name': f'{label}-console', 'errors': errors, 'warnings': [l for l in logs if l.startswith('warning')][:12]})
    print(label, 'errors', len(errors), errors[:5])
    b.close()

def xray_point(pg):
    """A CSS-pixel point on the drawn venue solid (scan a 12-px grid with the x-ray's own hit test)."""
    return pg.evaluate("""() => { const x = window.__citymeter.xray, el = window.__citymeter.map.getContainer();
      for (let y = 60; y < el.clientHeight - 60; y += 12) for (let i = 40; i < el.clientWidth - 40; i += 12) if (x.hitTest([i, y])) return [i, y];
      return null; }""")

with sync_playwright() as p:
    # ---------- desktop light ----------
    b, pg, logs, ready = open_page(p, 1280, 800, query=SIAM_UNIT, theme='light'); settle(pg, 2600)
    snap(pg, 'v-light-01-unit-siam', 'unit สยาม: venue list first; Siam Paragon reference building drawn (อาคารของสถานที่)')
    pg.locator('#panel-view .venue-row', has_text='Siam Paragon').first.click(); settle(pg, 3200)
    st = snap(pg, 'v-light-02-venue-paragon-eye', 'venue level: two-point eye (pitch 75 / FOV 24), x-ray solid, quiet scene, crumb สถานที่')
    pg.locator('#toggle-eye').click(); settle(pg, 2400)
    snap(pg, 'v-light-03-venue-paragon-model', 'มุมสถาปนิก off → model (pitch 60 / FOV 14), URL cam=model')
    pg.locator('#toggle-eye').click(); settle(pg, 2400)
    pg.locator('#panel-view [data-action="select-store"]').first.click(); settle(pg, 2600)
    snap(pg, 'v-light-04-store-in-paragon', 'store in the venue: crumbs end at the venue, eye kept')
    pt = xray_point(pg)
    LOG['xrayClickPoint'] = pt
    if pt:
        pg.mouse.click(pt[0], pt[1] + pg.evaluate("() => window.__citymeter.map.getContainer().getBoundingClientRect().top")); settle(pg, 2600)
        LOG['xrayClickOpened'] = pg.evaluate("() => window.__citymeter.state.panel.mode")
    pg.locator('#toggle-3d').click(); settle(pg, 2000)
    snap(pg, 'v-light-05-venue-2d', '2D: plan, the toggle shows its setting disabled, buildings as flat fills')
    pg.locator('#toggle-3d').click(); settle(pg, 1600)
    finish(b, logs, 'desktop-light-paragon')

    for name, q, note in [
        ('v-light-06-centralworld', f'?place={WORLD}', 'large venue: footprint + 15 display parts framed with roofs'),
        ('v-light-07-point-building-venue', f'?place={RAMINDRA}', 'venue without a reference: the building its store point falls inside (อาคารตามพิกัดสาขา)'),
        ('v-light-08-venue-no-building', f'?place={SAMSEN}', 'venue without buildings: eye camera on the store point'),
    ]:
        b, pg, logs, ready = open_page(p, 1280, 800, query=q, theme='light'); settle(pg, 4200)
        snap(pg, name, note)
        finish(b, logs, name)

    # ---------- desktop dark ----------
    b, pg, logs, ready = open_page(p, 1280, 800, query=f'?place={PARAGON}', theme='dark'); settle(pg, 4200)
    snap(pg, 'v-dark-01-venue-paragon-eye', 'dark: same activeLayer roles, x-ray edges')
    pg.locator('#crumbs [data-action="crumb-unit"]').click(); settle(pg, 2600)
    snap(pg, 'v-dark-02-unit-back', 'crumb ย่าน: back to the unit, venue building still drawn, toggle disabled')
    finish(b, logs, 'desktop-dark')

    # ---------- mobile ----------
    for theme in ('light', 'dark'):
        b, pg, logs, ready = open_page(p, 390, 844, query=f'?place={PARAGON}', theme=theme, mobile=True); settle(pg, 3600)
        snap(pg, f'v-m-{theme}-01-venue-sheet', 'mobile: sheet open → plan strip')
        pg.locator('#close-mobile-panel').click(); settle(pg, 3000)
        snap(pg, f'v-m-{theme}-02-venue-map', 'sheet closed → two-point eye on the venue')
        finish(b, logs, f'mobile-{theme}')

LOG['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
(OUT / 'harness-venue.json').write_text(json.dumps(LOG, ensure_ascii=False, indent=1))
print('wrote', OUT / 'harness-venue.json')
