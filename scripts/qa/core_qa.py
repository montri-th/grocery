"""Core flows of CityMETER Grocery (release 0.1 scenarios, re-run every release): first Aha, ดูทุก…, metric
switch, drill province → district → unit, pins, store, charts, table, help, deep links, dark, mobile, keyboard.
Rendered harness: scripts/qa/harness.py (vendored MapLibre 5.6.2, stub TileJSON, empty tiles). Writes
screenshots and harness-core.json to QA_OUT. The real-tile look is checked live separately."""
import json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright
from harness import open_page, OUT

LOG = {'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'scenarios': []}

STATE_JS = """() => { const s = window.__citymeter.state; const a = s.aha;
  return {url: location.search, title: document.title, level: s.sel, panel: s.panel.mode, metric: s.metric,
    focus: s.focus && {level: s.focus.level, n: s.focus.ids.length, mode: s.focus.mode || null},
    aha: a && {share: Math.round(a.share), pop: a.popShare == null ? null : Math.round(a.popShare), k: a.k, top: a.top.map(t => t.name), comparison: a.comparison},
    ahaText: (document.querySelector('#panel-view .aha h2')?.textContent || '').trim(), compareText: (document.querySelector('#panel-view .aha-compare')?.textContent || '').trim(),
    crumbs: [...document.querySelectorAll('#crumbs li')].map(li => li.textContent.trim()).filter(Boolean),
    rows: s.rows.length, scope: s.scopeRows.length, filtered: s.filtered.length,
    zoom: s.map && +s.map.getZoom().toFixed(2), pitch: s.map && +s.map.getPitch().toFixed(1), fov: s.map && s.map.getVerticalFieldOfView && +s.map.getVerticalFieldOfView().toFixed(1),
    legend: document.getElementById('legend-title').textContent, legendSteps: [...document.querySelectorAll('#legend-steps .legend-step')].map(x => x.textContent.trim()),
    ramp: (() => { const r = document.querySelector('#legend-steps .ramp'); return r && {swatches: r.querySelectorAll('.ramp-bar i').length, used: r.querySelectorAll('.ramp-bar i.is-used').length,
      ticks: [...r.querySelectorAll('.ramp-tick')].map(t => t.textContent), aria: r.getAttribute('aria-label')}; })(),
    compare: (() => { const c = s.compare; if (!c) return null; const lut = c.classes.lut || [], fills = c.items.map(i => i.fill).filter(Boolean);
      return {method: c.classes.method, steps: c.classes.steps, samples: c.classes.classCount, distinctFills: new Set(fills).size, allFillsExact: fills.every(f => lut.includes(f) || f === c.classes.noData.fill)}; })(),
    chartRamp: (() => { const r = document.querySelector('.chart-legend .ramp'); return r && {swatches: r.querySelectorAll('.ramp-bar i').length, used: r.querySelectorAll('.ramp-bar i.is-used').length,
      ticks: [...r.querySelectorAll('.ramp-tick')].map(t => t.textContent), plates: document.querySelectorAll('.matrix-cell .has-plate').length}; })(),
    labels: document.querySelectorAll('.area-label:not([hidden])').length, quietLabels: document.querySelectorAll('.area-label.is-quiet:not([hidden])').length,
    pins: document.querySelectorAll('.store-pin:not([hidden])').length, logos: document.querySelectorAll('.store-pin.has-logo:not([hidden])').length,
    status: document.getElementById('map-status').textContent, pictograms: document.documentElement.classList.contains('pictograms-ready'),
    overflowX: document.documentElement.scrollWidth - window.innerWidth, theme: document.documentElement.dataset.theme}; }"""

def snap(pg, name, note=''):
    # Software WebGL in the container: wait until every source (area GeoJSON, stores) has been tiled and drawn.
    try: pg.wait_for_function("() => { const m = window.__citymeter.map; return !m || (m.loaded() && m.areTilesLoaded()); }", timeout=20000)
    except Exception as e: LOG.setdefault('waitTimeouts', []).append(name)
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / f'{name}.png'))
    st = pg.evaluate(STATE_JS)
    LOG['scenarios'].append({'name': name, 'note': note, 'state': st})
    print(name, json.dumps({k: st[k] for k in ('url', 'panel', 'aha', 'ahaText', 'compareText', 'crumbs', 'rows', 'zoom', 'pitch', 'legend', 'ramp', 'compare', 'chartRamp', 'pins', 'logos', 'overflowX')}, ensure_ascii=False))
    return st

def finish(b, logs, label):
    errors = [l for l in logs if l.startswith('pageerror') or (l.startswith('error') and 'Failed to load resource' not in l)]
    LOG['scenarios'].append({'name': f'{label}-console', 'errors': errors, 'warnings': [l for l in logs if l.startswith('warning')][:12]})
    print(label, 'errors', len(errors), errors[:5])
    b.close()

def wait_idle(pg, ms=1600): pg.wait_for_timeout(ms)

with sync_playwright() as p:
    # ---------- desktop light ----------
    b, pg, logs, ready = open_page(p, 1280, 800, theme='light')
    LOG['coreReadySeconds'] = round(ready, 2)
    snap(pg, 'd-light-01-country-aha', 'first paint: auto focus top-3 provinces')
    pg.locator('#panel-view [data-action="clear-focus"]').first.click(); wait_idle(pg)
    snap(pg, 'd-light-02-country-all', 'ดูทุกจังหวัด (?areas=all)')
    pg.locator('#legend-metric [data-value="capita"]').click(); wait_idle(pg, 900)
    snap(pg, 'd-light-03-country-capita', 'metric switch → ต่อ 1 หมื่นคน')
    pg.locator('#legend-metric [data-value="count"]').click(); wait_idle(pg, 600)
    pg.locator('#panel-view [data-action="explore-top"]').first.click(); wait_idle(pg)
    # drill: the Aha names are buttons — Chonburi
    pg.locator('#panel-view .aha-copy [data-action="select-area"]', has_text='ชลบุรี').first.click(); wait_idle(pg, 2600)
    snap(pg, 'd-light-04-province-cbi', 'province Aha (districts)')
    pg.locator('#panel-view .aha-copy [data-action="select-area"]').first.click(); wait_idle(pg, 2600)
    snap(pg, 'd-light-05-district', 'district Aha (local units)')
    pg.locator('#panel-view .rank-row').first.click(); wait_idle(pg, 2600)
    st = snap(pg, 'd-light-06-unit', 'unit profile (vs district average)')
    LOG['unitCompare'] = pg.locator('#panel-view .unit-compare').inner_text() if pg.locator('#panel-view .unit-compare').count() else ''
    # street level inside the unit
    pg.evaluate("() => { const s = window.__citymeter.state; const r = s.rows.find(x => Number.isFinite(x.lon)); window.__citymeter.map.jumpTo({center: [r.lon, r.lat], zoom: 15.6}); }"); wait_idle(pg, 2600)
    snap(pg, 'd-light-07-pins', 'zoom ≥ 14: HTML pins + logos inside the focus')
    pin = pg.locator('.store-pin:not([hidden])').first
    if pin.count():
        pin.click(); wait_idle(pg, 2800)
        snap(pg, 'd-light-08-store', 'store detail (address loaded on demand)')
        LOG['storeFacts'] = pg.locator('#panel-view .facts').inner_text()[:600]
    # charts at province level
    pg.locator('#crumbs [data-action="crumb-province"]').click(); wait_idle(pg, 2600)
    pg.locator('#toggle-insights').click(); wait_idle(pg, 1400)
    snap(pg, 'd-light-09-charts-ranking', 'paired stores vs people ranking')
    LOG['matrixCellWidths'] = None
    pg.locator('#tab-mix').click(); wait_idle(pg, 900)
    widths = pg.evaluate("() => [...document.querySelectorAll('.matrix-cell')].map(c => Math.round(c.getBoundingClientRect().width))")
    heights = pg.evaluate("() => [...document.querySelectorAll('.matrix-cell')].map(c => Math.round(c.getBoundingClientRect().height))")
    LOG['matrixCellWidths'] = sorted(set(widths)); LOG['matrixCellHeights'] = sorted(set(heights))
    snap(pg, 'd-light-10-charts-mix', 'store-type matrix (equal cells)')
    pg.locator('#tab-brands').click(); wait_idle(pg, 900)
    snap(pg, 'd-light-11-charts-brands', 'brand matrix')
    pg.locator('#tab-ranking').click(); wait_idle(pg, 500)
    pg.locator('#toggle-insights').click(); wait_idle(pg, 600)
    pg.locator('#open-table').click(); wait_idle(pg, 700)
    snap(pg, 'd-light-12-table', 'table of rows in focus')
    LOG['tableCsvControls'] = pg.evaluate("() => [...document.querySelectorAll('a,button')].filter(e => /csv/i.test(e.textContent)).length")
    pg.locator('#toggle-table').click(); wait_idle(pg, 400)
    pg.locator('#open-help').click(); wait_idle(pg, 500)
    snap(pg, 'd-light-13-help', 'help dialog')
    pg.keyboard.press('Escape'); wait_idle(pg, 300)
    LOG['helpClosedByEscape'] = not pg.evaluate("() => document.getElementById('usage-help').open")
    finish(b, logs, 'desktop-light')

    # deep links
    for name, q, note in [
        ('d-light-14-watthana', '?district=1039', 'Bangkok district → Locales (ย่าน)'),
        ('d-light-15-dusit', '?district=1002', 'a child Locale without population → no population comparison'),
        ('d-light-16-deeplink', '?province=CBI&district=2004&metric=capita&view=mix&areas=all', 'URL restores district, metric, chart view, focus off'),
        ('d-light-17-empty', '?search=zzzz', 'empty state with reset'),
        ('d-light-18-brand-makro', '?brand=MAKRO', 'brand filter recomputes the Aha'),
    ]:
        b, pg, logs, ready = open_page(p, 1280, 800, query=q, theme='light'); wait_idle(pg, 2400)
        snap(pg, name, note)
        finish(b, logs, name)

    # ---------- desktop dark ----------
    b, pg, logs, ready = open_page(p, 1280, 800, theme='dark')
    snap(pg, 'd-dark-01-country-aha', 'dark theme first paint (same data HEX)')
    pg.locator('#panel-view .aha-copy [data-action="select-area"]').first.click(); wait_idle(pg, 2600)
    snap(pg, 'd-dark-02-province-bkk', 'Bangkok districts')
    pg.locator('#toggle-insights').click(); wait_idle(pg, 1200)
    pg.locator('#tab-mix').click(); wait_idle(pg, 900)
    snap(pg, 'd-dark-03-charts-mix', 'dark matrix: ink on the 41 samples, backplate where neither ink reaches 4.5:1')
    pg.locator('#toggle-insights').click(); wait_idle(pg, 500)
    pg.locator('#legend-metric [data-value="capita"]').click(); wait_idle(pg, 900)
    snap(pg, 'd-dark-04-capita', 'dark per-capita')
    finish(b, logs, 'desktop-dark')

    # ---------- mobile ----------
    for theme in ('light', 'dark'):
        b, pg, logs, ready = open_page(p, 390, 844, theme=theme, mobile=True)
        snap(pg, f'm-{theme}-01-country', 'mobile: compact Aha card on the map, sheet closed')
        pg.locator('#mobile-panel').click(); wait_idle(pg, 900)
        snap(pg, f'm-{theme}-02-sheet', 'bottom sheet open')
        pg.locator('#panel-view .aha-copy [data-action="select-area"]').first.click(); wait_idle(pg, 2600)
        snap(pg, f'm-{theme}-03-province', 'province from the sheet (plan camera)')
        pg.locator('#panel-view .rank-row').first.click(); wait_idle(pg, 2600)
        pg.locator('#panel-view .rank-row').first.click(); wait_idle(pg, 2600)
        snap(pg, f'm-{theme}-04-unit', 'unit (crumbs fold behind …)')
        LOG['mobileCrumbFold' + theme] = pg.locator('#crumbs .crumb-more').count()
        pg.locator('#close-mobile-panel').click(); wait_idle(pg, 1200)
        snap(pg, f'm-{theme}-05-unit-map', 'sheet closed → map')
        finish(b, logs, f'mobile-{theme}')

    # ---------- keyboard ----------
    b, pg, logs, ready = open_page(p, 1280, 800, query='?district=1007', theme='light'); wait_idle(pg, 2400)
    pg.evaluate("() => window.__citymeter.map.jumpTo({center: [100.5340, 13.7460], zoom: 15.5})"); wait_idle(pg, 2400)
    first = pg.locator('.store-pin:not([hidden])').first
    kb = {'pinsFocusable': pg.evaluate("() => [...document.querySelectorAll('.store-pin:not([hidden])')].filter(p => p.tabIndex >= 0).length")}
    if first.count():
        first.focus(); pg.keyboard.press('ArrowRight'); wait_idle(pg, 300)
        kb['focusedAfterArrow'] = pg.evaluate("() => document.activeElement && document.activeElement.className")
        pg.keyboard.press('Enter'); wait_idle(pg, 2200)
        kb['panelAfterEnter'] = pg.evaluate("() => window.__citymeter.state.panel.mode")
    kb['focusRingVisible'] = pg.evaluate("() => { const b = document.querySelector('#fit-map'); b.focus(); const s = getComputedStyle(b); return s.outlineStyle !== 'none' || s.boxShadow !== 'none'; }")
    LOG['keyboard'] = kb
    snap(pg, 'a11y-01-keyboard-store', 'arrow-key pin tour → Enter opens the store')
    finish(b, logs, 'keyboard')

LOG['finishedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
(OUT / 'harness-core.json').write_text(json.dumps(LOG, ensure_ascii=False, indent=1))
print('wrote', OUT / 'harness-core.json')
