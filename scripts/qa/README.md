# Rendered QA harness

Playwright scripts that drive the real app in Chromium and record screenshots plus a JSON state log per scenario. They exist because a sandbox or CI runner often cannot reach the MapLibre CDN (unpkg.com) or the OpenFreeMap tiles: the harness serves a vendored MapLibre 5.6.2 and a stub TileJSON with empty tiles. Data layers, area fills, store dots and pins, venue buildings and the venue x-ray render; the basemap and the building massing do not, so occluders stay 0 and the paper basemap is missing — confirm the real-tile look on the live site (`handoff/VERIFICATION.md`).

| Script | Flows | Output (`QA_OUT`) |
|---|---|---|
| `core_qa.py` | first Aha, ดูทุก…, metric switch, drill province → district → unit, pins, store, charts, table, help, deep links, dark, mobile 390×844, keyboard pin tour | `harness-core.json` + PNGs |
| `venue_qa.py` | unit with venue buildings → venue (two-point `eye`, x-ray, quiet scene) → มุมสถาปนิก off/on → store in the venue → x-ray click → 2D; centralwOrld, point-building venue, venue without buildings; dark; mobile sheet → `eye` | `harness-venue.json` + PNGs |

```sh
pip install playwright && python -m playwright install chromium   # once
npm pack maplibre-gl@5.6.2 && mkdir -p scripts/qa/vendor && tar -xzf maplibre-gl-5.6.2.tgz -C scripts/qa/vendor && rm maplibre-gl-5.6.2.tgz
npm start &                                                         # http://127.0.0.1:4173/
cd scripts/qa && python core_qa.py && python venue_qa.py            # QA_OUT defaults to dist/qa (git-ignored)
```

Environment: `QA_ROOT` (app URL, default `http://127.0.0.1:4173/`), `QA_VENDOR` (folder holding `maplibre-gl.js` / `.css`), `QA_OUT`. A scenario passes when its console section lists no page errors and the state matches the contract in `handoff/product-brief.json` (camera preset, crumbs, buildings drawn, x-ray vertices, legend items, no horizontal overflow at 390 px). Colour scale (owner rule 2026-10-22): `ramp.swatches` and `chartRamp.swatches` must be 41, `compare.method` `rank-41` and `compare.allFillsExact` true in every view with a choropleth; look at the legend in the screenshots too — the state log cannot see a ramp squeezed to zero width. Software WebGL (SwiftShader) is slow: allow several minutes per script.
