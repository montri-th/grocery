# Verification record — release 0.1 (2026-10-22)

Dataset snapshot: 2026-10-22 (what CityMETER production shows). Levels are reported separately: data reconciliation, unit tests, machine contracts, LDS checks, rendered harness, live browser checks and live byte attestation. None of them is a blanket LDS, accessibility or market-completeness certificate.

## Data reconciliation (build)

`scripts/build-data.py` stops unless every check below holds; the results are in `data/build-receipt.json` (input hashes without private URLs, fetch windows, settings).

| Check | Result |
|---|---|
| Rows vs production total | 27,607 point rows · `grocery/info/lv0` 27,608 (Ko Pha-ngan 8405: API 57, 56 points in the tiles) |
| Local units (อปท. + Locale) | 8,621 / 8,621 equal the API (5,692 with stores; overlay membership decoded from 8,896 tiles) |
| Districts | 927 / 928 equal the API (8405 as above) |
| Provinces | 76 / 77 equal the API (84 Surat Thani: 515 vs 514, same row) |
| Population | 65,723,008 at country = Σ 77 provinces = Σ 928 districts |
| Membership edge cases | 15 rows in two units · 19 Bangkok rows outside every Locale · 69 rows whose subdistrict district ≠ their unit's parent (25 units straddle a district border) |
| Unit parents | DOLA code 7,774 · Locale store majority 681 · Locale geometry overlap 166; every parent inside the unit's province (asserted) |
| Keys | 27,607 unique 8-character keys (asserted) |
| Logos | 17 brand files and 128 venue files byte-identical to the sheet's sha256 |

## Automated (unit)

`npm test` — **65/65 passed** (Node 22) on the release working tree, against the shipped data files:

- **data** (`data.test.js`): every province geometry file holds all its districts and units (label point, bbox); every store has a detail record (full uuid, source tile; 178 blank addresses stay blank); icon fonts match their contracts; no private Drive/Sheet link in any shipped text file
- **model** (`model.test.js`): every source row, brand, type and area of the snapshot; production codes; filters never mutate rows; per-capita never invents a zero; names, nouns and production links; the build receipt reconciles the shipped rows with the API at every level
- **hierarchy** (`hierarchy.test.js`): selection normalisation; children cover their parent (77 provinces = 27,607 stores and 65,723,008 residents); every unit of the tested districts shows its API count, including border units (ทน.แหลมฉบัง 152 with 130 in ศรีราชา; คลองบางครุ 5, not a false zero); the country Aha (BKK · CBI · SPK, 30% / 13%, “less”); the recomputed Aha for ชลบุรี (79% / 63%), เขตวัฒนา (38% / 16%) and a brand filter; the k rule; the union of overlapping units; no population comparison for เขตดุสิต; per-capita ranking with missing population last; the unit insight of ทม.แสนสุข
- **scales** (`scales.test.js`): every LUT sample of `count` and `density.capita` equals the LDS package fixture; quantile classes on rounded values; zero vs no data; ink contrast ≥ 4.5:1
- **charts** (`chart-model.test.js`): shares sum to 100% at country level; Bangkok first by count, Phuket by per-capita; population shares omitted when incomplete; border units keep their full count in ranking and matrix while their share counts only the district's stores; matrix rows sum to their area
- **profile-model**, **breadcrumb**, **map-style** (stores layer, area layers, pictogram contract ↔ manifest), **pins**, **brand-logos**, **venue-logos** (registry validation, sha256 of every file), **massing**, **geometry**, **mvt**

## Machine contracts

`product-statement.json`, `product-brief.json` and `implementation-plan.json` validate against `handoff.schema.json` **1.0.0** (ajv 2020-12, 2026-10-22). The generated `handoff-manifest.json` is checked by the same schema at bundle time.

## LDS checks

- Package integrity: `verify.mjs` on the pinned LDS 0.9.7 package (`v0.9.7-owner.1`, release.json sha256 `0a936393…8516`, normative `d3085cbc…2d96`) — **PASS 9,769 / 9,769**, 65 package-level B-HUE warnings (not caused by this artifact).
- Artifact: `check-artifact.mjs index.html` (index + fonts.css, theme.css, styles.css, navigation.css, logos.css, grocery.css; 127 unique colours) — status FAIL for **24 basemap-only literal HEX values in `assets/theme.css`** (declared once per theme as `--basemap-*`, never data colours — the same accepted exception as Luxury Brands), plus the standard warning that scripts need rendered review. No other ungoverned colour, no prohibited alias. This static check is not a contrast, layout or accessibility certificate.

## Rendered harness (Playwright, Chromium, container)

The container cannot reach unpkg.com or tiles.openfreemap.org. The harness serves the repository on 127.0.0.1, fulfils the pinned MapLibre 5.6.2 JS/CSS from the npm package and answers the TileJSON with a stub whose tiles are empty, so the basemap is blank paper; data layers (areas, dots, pins, labels), panel, charts, table and camera are the real code paths. Screenshots are taken after `map.loaded()` and `areTilesLoaded()` (software WebGL needs ~2–4 s to tile the 77 province polygons). Log: `evidence/harness-0.1.log`, state per screenshot: `evidence/harness-0.1.json`.

| Viewport / theme | Flows checked | Result |
|---|---|---|
| 1280×800 light | first paint (core data ready 0.65 s): Aha “30% ของสาขาอยู่ใน 3 จังหวัดนี้ · ซึ่งมีคนแค่ 13% ของประเทศ”, focus BKK · CBI · SPK (8,228 rows), plan z4.37, legend จังหวัด · จำนวนสาขา (39–90 … 446–5,310); ดูทุกจังหวัด (`?areas=all`, every province filled); ต่อ 1 หมื่นคน (legend 1.0–2.3 … 4.6–11.3, density.capita fills); ชลบุรี via the Aha name (79% / 63%, crumbs ประเทศไทย › ชลบุรี); บางละมุง (78% ใน 2 อปท. นี้ / 61%); เมืองพัทยา (model preset pitch 60; label 364 = panel 364 = API; “มากกว่าค่าเฉลี่ยอำเภอบางละมุง 2.2 เท่า”); z15.6: 29 pins, 25 logos; store via pin (address “ต.นาเกลือ อ.บางละมุง ชลบุรี” loaded on demand, source 7-Eleven 29 ก.ย. 2569); crumb-province; charts ranking / mix / brands (matrix cells all 144×36 px); table (no CSV control); help (Escape closes) | pass — no page errors |
| deep links | `?district=1039` (38% / 16%, ย่าน, city preset pitch 56); `?district=1002` (“ยังไม่มีข้อมูลประชากรครบทุกย่าน จึงไม่เทียบกับจำนวนคน”); `?province=CBI&district=2004&metric=capita&view=mix&areas=all` (restored); `?search=zzzz` (empty state + reset); `?brand=MAKRO` (Aha recomputed: BKK · CBI · เชียงใหม่) | pass — no page errors |
| 1280×800 dark | first paint, กรุงเทพมหานคร (11% ใน 3 เขตนี้ / 9%), matrix, per-capita | pass — same data HEX, dark basemap tokens |
| 390×844 light + dark (touch) | compact Aha card on the map; bottom sheet; province from the sheet (plan); unit (crumbs fold behind “…”); sheet closed → map | pass — no horizontal overflow, no page errors |
| keyboard | at z15.5 one pin in the tab order (roving), ArrowRight moves focus, Enter opens the store; focus ring visible on toolbar buttons | pass |

Fixed during this pass: a unit straddling a district border showed fewer stores in its district's comparison (label) than in its own panel (เมืองพัทยา 362 vs 364; คลองบางครุ drawn as a measured zero with 5 stores) — units now show their full production count everywhere, while district shares count only the district's own stores (`hierarchy.js#comparisonRows`, `inArea`; tests added).

## Live checks (Chrome on macOS, real tiles)

Chrome on macOS, viewport 1710×822 CSS px (DPR 2), OpenFreeMap tiles (`planet/20261018_080001_pt`), the owner's theme preference `auto` (dark system theme) restored after the light-theme check.

**9242f23 (first publish; Pages run 39767642418 “pages build and deployment”, success 2026-10-22 11:03:45 UTC = 18:03 ICT).** `index.html` served byte-identical (sha256 `62f4e23d…3484`).

| Check | Result |
|---|---|
| First paint (`live-01-country-aha-dark-9242f23.jpg`) | Aha 29.80% / 12.85% → “30% ของสาขาอยู่ใน 3 จังหวัดนี้ · ซึ่งมีคนแค่ 13% ของประเทศ”, 8,228 / 27,607; auto focus BKK · CBI · SPK; 77 province fills rendered (BKK fill `#213E70`); dark paper basemap with Thai labels; plan z4.43; pictograms ready |
| ชลบุรี via the Aha name (`live-02`) | “79% ของสาขาในชลบุรีอยู่ใน 3 อำเภอนี้ · 63%”; district fills and outlines from the per-province geometry |
| อำเภอบางละมุง (`live-03`) | “78% … อยู่ใน 2 อปท. นี้ · 61%”, 463 / 592; labels เมืองพัทยา 364, ทม.หนองปรือ 101 |
| เมืองพัทยา via the ranking (`live-04`) | label 364 = panel 364 (= API); model preset pitch 60 / FOV 14; “มากกว่าค่าเฉลี่ยอำเภอบางละมุง 2.2 เท่า (36.3 เทียบ 16.7)” |
| z15.6 in Pattaya (`live-05`) | 51 pins, 39 logos (status “51 สาขาในจอ · โลโก้ 39/250”); 42 city-massing features drawn quiet |
| Store via pin (`live-06`) | Villa Market Pattaya: ซูเปอร์มาร์เก็ต, “อยู่ในรายการสาขาของแบรนด์”, address loaded from `data/detail/20.json`, ตำบลหนองปรือ, source CityMETER Grocery (ข้อมูลเดิม) นำเข้า 12 พ.ค. 2567, uuid, links tile ต้นทาง / ดูใน CityMETER, popup on the map |
| เขตวัฒนา (`live-07`) | “38% … อยู่ใน 3 ย่านนี้ · 16%”, 64 / 168; city preset pitch 56. **Found:** the pitched fit used the bounding-box corners, so the long diagonal district sat small in the lower half → fixed in the next commit (fit on the outline vertices, as Luxury Brands does) |
| อโศก-เหนือ (`live-08` dark, `live-09` light) | model preset z15.3; 483 rounded focus buildings + 181 quiet city buildings from real tiles; 22 pins, 12 logos; “76.6 เทียบ 21.2 ต่อ 1 หมื่นคน · 3.6 เท่า”; light paper basemap after the theme switch, same data HEX |
| Per-capita + chart tray (`live-10`, light) | legend “จังหวัด · สาขาต่อประชากร 10,000 คน” 1.0–2.3 … 4.6–11.3; ranking ภูเก็ต 11.3 · ชลบุรี 10.7 · กรุงเทพมหานคร 9.8 · สมุทรปราการ 8.4 · นนทบุรี 8.1 |
| Not verified live | mobile width (checked in the harness only; the owner's Chrome window was not resized), Safari, keyboard tour, AC02/AC03/AC05 fault paths |

## Live byte attestation

`npm run verify:live` compares SHA-256 of every published file in the generated manifest with the bytes served by GitHub Pages (`cache: no-store`, cache-busting query). The result is in `evidence/live-attestation-<commit>.json` inside the bundle and summarised in `RELEASE_RECEIPT.json`. The manifest is generated from `git ls-files` of the release commit and is not tracked in git, so it cannot drift from the bytes it describes.

## Evidence files in the bundle

`evidence/` holds the harness screenshots (`d-light-*`, `d-dark-*`, `m-light-*`, `m-dark-*`, `a11y-*`), `harness-0.1.json/.log`, the LDS outputs (`lds-verify.json`, `lds-check-index.txt`), live screenshots (`live-*`) and the live attestation. Harness screenshots show a blank basemap; the real-tile look is in the live screenshots.
