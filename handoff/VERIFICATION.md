# Verification record — Grocery 0.2, join update and 0.1 baseline (2026-10-22)

Dataset snapshot: 2026-10-22 (what CityMETER production shows). Levels are reported separately: data reconciliation, unit tests, machine contracts, LDS checks, rendered harness, live browser checks and live byte attestation. None of them is a blanket LDS, accessibility or market-completeness certificate.

## Follow-up — Forum, PARC, Yaowarat and Mahatun (25 Oct 2026)

This section records the prepared follow-up independently of the released Foodplace baseline and the 22 Oct evidence below. The release owner reports the current local suite at **183/183 passed** and actual local PARC/Mahatun views checked at 1280 px and 390 px in light/dark themes. The source-point result and named-host fact were inspected separately. A Pure branch in One Bangkok does not receive the Forum fact. One temporary local fetch failure recovered on reload; this is not a fault-path certification. The current preparation checks are recorded in `data/build-receipt.json → targetedFollowup`. Exact source commit, provider delivery and matching live bytes are bound by the external release receipt; this preparation record does not attest a future deployment.

| Check | Prepared follow-up result |
|---|---|
| Count and format invariants | 27,612 rows / 17 brands / Big C 1,749 / Foodplace family 17; five supplements remain five. Thirteen existing-row observations comprise 12 Foodplace rows plus one unchanged Mini. |
| Yaowarat identity | Official branch 22301 resolves to existing canonical outlet `9f9a188a-6a85-4adc-8900-aaea7b49f310`; map key `9f9a188a`, Big C Mini / `C_STORE`, source point and UUID retained; excluded from Foodplace. |
| Mahatun operation and logo | Employer recruitment evidence is dated 22 Oct 2026. Contact status remains inactive; recruitment is not current walk-in confirmation. Review status retained, current hours unverified, verified venue logo still not found. |
| Named host scope | 31 venues / 78 features / 46 qualified rows: original 29 / 76 / 44 preserved, plus Forum only for `bigc-official-15068` and PARC parking only for `bigc-official-15073`. Other tenants receive neither fact by campus name alone. |
| Point invariants | Both official points remain unchanged and `no_building`: Forum outside by 135.418 m; PARC outside by 64.954 m. Totals remain 808 inside / 9,329 boundary / 17,475 no-hit, with no promotion from the host reference. |
| Forum identity | Official branch address, official venue guide and original OSM way `1264152504` support the narrow Forum context. OSM shop node and way share editor/changeset/time and are not an independent survey. No campus landuse or adjacent tower substituted. |
| PARC geometry | Independent raw-MVT decoder and GEOS review reproduced the original 11-vertex component, no holes, including negative tile-Y coordinates; all six cached source receipts verified. Official point stays outside. Separate Google observation is 4.851 m from the inside edge (4.849 m in independent AEQD), never selected as the official point or a strict-inside result. |
| Source and height | Original geometries/holes preserved; no nearest assignment, scaling or coordinate repair. Selected heights unknown; 3 m is display-only. Owner-reported Ground / 3 storeys is separate from held PARC model 16.75 m / estimated 4 floors; no 9 m conversion. Forum model 98.83 m / 35 floors also held. |
| Evidence and rights | Follow-up sources and caveats are in `data/retail-followup-evidence.json`. Forum uses OSM/ODbL; PARC preserves mixed-source CityMETER V4 attribution. Owner frontage imagery is private identity evidence, not a public image license. |

The independent PARC geometry audit accepted only the owner-qualified parking-host context, not a surveyed footprint, complete campus model, floor-area measurement or verified metre height. Source retrieval/check dates do not replace editorial dates. The following sections preserve historical results at their stated versions and do not attest publication of this follow-up.

## Foodplace refresh — 25 Oct 2026 (released baseline)

Local suite: **165/165 passed**, 0 failed/skipped; full transcript SHA-256 `6a6da6e1fdd4f909905cada1bec744796d5879f454c3fa0e36e19a09cd96ab8c`. Frozen data hashes were rechecked after the run. Source `grocery.json` and `areas.json` remain byte-identical to base `74d214a`; all 27,607 original point facts, all 77 provincial decision dictionaries and the original 128 venue asset records/bytes remain unchanged. Effective data adds five official branch records and three format reclassifications: 27,612 rows, 17 brands, Big C 1,749, Foodplace family 17. The family count is bounded coverage, not a national inventory or operating-status census.

Independent geometry review rescanned both complete cached Microsoft partitions (2,681,630 raw features). Hole-aware containment and segment-distance calculations agreed with GEOS: five new points yield two inside / one boundary candidate / two without a containing roof. No nearest assignment, coordinate movement, geometry repair, extra country download or invented measured height was applied. Invalid display-unit candidates stay held; supplemental display membership is explicitly inferred rather than original production membership.

Native Sheet verification compares all 28 planned ranges, 1,621 entered cells, 66 native date cells, both count formulas and all protected existing store fields. Counts resolve to Big C 1,749 and Foodplace 17; native types, table identities and the original 83 column definitions are preserved, with four format columns appended. Existing date display patterns may normalize under native Tables; checked dates remain readable native DATE values.

Rendered local browser checks use actual map tiles and application code, at desktop 1280 px and narrow 390×844 in light/dark themes. Foodplace is a format option under the existing Big C brand; clearing/restoring it updates the URL and returns 17 family rows / one brand. PARC's missing source address, Mahatun's contact-inactive review fact and One Bangkok's long Marché name were inspected without overlap. New details use local official-source records. Foodplace and venue logos render; no console errors were observed in checked states. These are desktop-browser responsive checks, not physical-phone testing. Native Sheets' changed tables, new format/review tabs, dictionary, README and source catalog were inspected at 100%; table header contrast was corrected after actual rendering.

Publication is recorded separately by the release receipt and exact-commit live byte attestation supplied with the scoped audit package. This checked-in record does not predict a provider result.

## Release 0.2 — venue level, two-point view, 41-sample colour scales (owner, 22 Oct 2026, second round)

Commits: `46b4bb5` venue level + two-point view · `f5db660` colour scales on all 41 LDS samples + 0.2 handoff (schema 1.1.0, task cards, `scripts/qa/`) · `77ac6f7` empty rebuild trigger · `cd9f074` cache tag of the legend's `scales.js` import + `tests/module-imports.test.js` · the commit after it: this live record. Each line names what it ran on; the release receipt binds the final commit.

| Level | Result |
|---|---|
| Unit | `npm test` — **151/151** passed (Node 22.22.0) on the 0.2 tree; 0 failed, 0 skipped (incl. `tests/module-imports.test.js`: one specifier per module, changed modules tagged) |
| Machine contracts | `product-statement.json`, `product-brief.json`, `implementation-plan.json` valid against `handoff.schema.json` **1.1.0** (ajv 8.17.1, draft 2020-12). Negative checks: the schema rejects `metricContract.method = quantile` / `steps = 5` and a plan without `agentTaskCards` |
| LDS | package `verify.mjs` — PASS 9,769 / 9,769 (65 package-level warnings, not caused by this artifact); `check-artifact.mjs index.html` — FAIL only for the same 24 basemap-only literals as 0.1 (127 unique colours, identical literal set) + the scripts-need-rendered-review warning |
| Rendered harness | `scripts/qa/core_qa.py` (33 views, 10 console sections) and `venue_qa.py` (14 views, 7 console sections), Chromium + vendored MapLibre 5.6.2 + stub tiles — **0 page errors** |
| Live browser | Chrome on macOS, real tiles: venue level on `46b4bb5` and again on `cd9f074`; colour scales on `cd9f074` — below |
| Live bytes | `npm run verify:live` on `cd9f074`: **457 ok, 0 failed** (`evidence/live-attestation-cd9f074.json`); the final commit is attested again in `RELEASE_RECEIPT.json` |

### Colour scales on all 41 LDS samples (owner rule “Color scale ขอให้ใช้ 41 scales ตาม LDS เสมอ”)

- **Unit** (`tests/scales.test.js`, 8 tests): both LUTs equal the LDS 0.9.7 fixture sample by sample; `rank-41` on the real 77 provinces — lowest shown value sample 0, highest 40, ascending values never take a lighter sample, closed intervals never overlap, every province sits in the sample its colour says, count uses all 41 samples and per-capita 31 (ties at one decimal), at most 7 provinces share a sample, order-independent; ties share their mean position (1,1,1,3,5,9 → 0/20/30/40); one distinct value → 40; zero = sample 0 + zero outline, unknown = no data; ink on all 41 samples is the better foundation ink and exactly count 27–29 / density.capita 31–35 take a backplate; the legend emits 41 swatches in LUT order with exact HEX, no gradient, marks only the samples in use and ticks 39 · 230 · 5,310 at country level; the machine brief declares the same `rank-41` / 41 / scale versions as the code.
- **Harness** (state per screenshot: `ramp`, `compare`, `chartRamp`): every view with a choropleth shows 41 swatches and every area fill is an exact LUT sample (`allFillsExact`). Country count 41 samples in use (ticks 39 · 230 · 5,310); country per-capita 31 (1.0 · 2.9 · 11.3); Bangkok districts 39 (20 · 95 · 211); ชลบุรี districts 11 (1 · 70 · 592); store-type matrix of ชลบุรี 18 samples with 2 numbers on a backplate, brand matrix 24 / 4, Bangkok store types (dark) 17 / 4. 390×844 light and dark: legend title + switch on the first row, the ramp on the second, no overlap with the compact Aha card, no horizontal overflow.
- **Found and fixed in this pass:** the first legend layout let its flex row shrink the ramp to its min-content width (≈ 0 px) — seen in the screenshots, not in the state log; the area legend is now a two-row grid (`#legend-areas`). Re-checked at 1280 and 390 px in both themes: ramp 320 px (desktop) / 271–320 px (390 px), swatches 7.8 / 6.6 px, ticks never overlap. Before its deploy, `js/ramp-legend.js` imported `./scales.js` without the cache tag the other importers use — a browser holding the cached 0.1–0.2 `scales.js` (no `STEPS` export) would have stopped the app for up to 10 minutes; fixed and guarded by `tests/module-imports.test.js`.

### Live checks of the colour scales (`cd9f074`)

**Deploy.** GitHub recorded the pushes of `f5db660` and `77ac6f7` about 40 minutes late (repository activity backfilled at 16:34 and 16:56 UTC); no Pages run existed until 17:22 UTC. Run 39822044409 was cancelled by run **39822115600** (pages build and deployment, head `cd9f074`, success 17:24:23 UTC). Before checking, Chrome's cache was refreshed with `fetch(…, {cache: 'reload'})`: `index.html` carries the `?v=20261022-v3` tags (9), `js/scales.js` declares `rank-41`, `js/ramp-legend.js` is served.

Chrome on macOS, 1710×909 CSS px (DPR 2), OpenFreeMap tiles; the 1280×800 and 390×844 views run in a same-origin frame scaled to the window (so the 390 px view is the app's real narrow layout in desktop Chrome, not a phone). Area colours are read from what MapLibre renders (`queryRenderedFeatures` → feature-state `fill`), not only from the model.

| View | Result |
|---|---|
| Country, first paint (dark; `live-0.2-01`) | Aha 30% / 13% unchanged; model `rank-41`, 41 samples in use, every fill an exact LUT sample; legend 41 swatches, ticks 39 · 230 · 5,310; the three focused provinces render samples 40 / 39 |
| ดูทุกจังหวัด `?areas=all` (dark; `live-0.2-02`) | 77 provinces render **41 distinct fills, all exact LUT samples** |
| ต่อ 1 หมื่นคน, country | 31 rendered samples (ties at one decimal), ticks 1.0 · 2.9 · 11.3 |
| Bangkok districts + store-type matrix (dark; `live-0.2-03`) | 39 distinct rendered fills; matrix 12 × 5 cells, its own 41-swatch legend (17 samples in use, 1 · 3 · 204), numbers 8 · 27 · 10 · 8 on a backplate |
| ชลบุรี per-capita (light; `live-0.2-06`) | 11 districts render 10 samples (one tie), ticks 2.1 · 6.2 · 16.7; same HEX as dark |
| Siam Paragon (dark; `live-0.2-04`) | `eye` pitch 75 / FOV 24 / z17.58, x-ray 795 vertices, 7 see-through occluders from real tiles, crumbs end at Siam Paragon — unchanged from `46b4bb5` |
| 390×844 frame (dark; `live-0.2-05`) | narrow layout; legend title + switch on one row, ramp 271 px below with ticks apart; Aha card ends at y 692, legend starts at 706; no horizontal overflow |
| Native 1710 px (dark; `live-0.2-07`, `-08`) | ramp 320 px, swatches 7.75–7.76 px; Bangkok per-capita renders every district |
| Console | no messages on two native loads (`?areas=all`, `?province=BKK&areas=all&metric=capita`) |

The owner's theme preference (`auto`) was restored after the light-theme check.

### Venue level and two-point view

- **Harness** (`venue_qa.py`; stub tiles draw no massing, so occluders stay 0 here): unit สยาม lists “สถานที่ตามชื่อสาขา 4 แห่ง” first and draws 8 venue buildings (legend อาคารของสถานที่, the มุมสถาปนิก toggle disabled outside venue level); Siam Paragon from the list → crumbs end at Siam Paragon, `eye` pitch 75 / FOV 24 / z17.58, x-ray 795 vertices; toggle off → `cam=model`, pitch 60 / FOV 14, on again → `eye`; a store in Siam Paragon keeps `eye`, a click on the x-ray solid (340, 264) opens the venue; 2D → pitch 0, x-ray off; centralwOrld 16 buildings, z16.59, x-ray 2,949; Central Ramindra 1 point building (legend อาคารตามพิกัดสาขา), x-ray 363; สามเสน (สถานีรถไฟ) no building, `eye` on the store point at z16; dark crumb ย่าน returns to the unit with the venue buildings still drawn; 390×844 light/dark: sheet open = plan (pitch 0, z15.72), sheet closed = `eye` z16. No horizontal overflow anywhere.
- **Live on `46b4bb5`** (Chrome on macOS, OpenFreeMap tiles; desktop 1280×800 through a scaled same-origin frame, narrow 606×717): Siam Paragon `eye` pitch 75 / FOV 24 / z17.58, x-ray 795 vertices, 7 see-through occluders from real tiles, crumbs end at Siam Paragon (dark); unit สยาม draws Paragon blue with the venue list first, a building click opens the venue in `eye`; centralwOrld (light) z16.59, x-ray 2,949, 12 occluders; store `6823e48d` → x-ray click → venue; Central Ramindra point building with “อาคารตามพิกัดสาขา”, x-ray 363; 606 px: sheet open = plan, sheet closed = `eye` z16 with 11 occluders; no console errors; the owner's theme preference restored to `auto`.
- **Not verified:** a real phone (390 px was checked live only in a same-origin frame in desktop Chrome), Safari/iOS, the keyboard tour on the live site, AC02 / AC03 / AC05 fault paths.

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

## Venue/building join update — local verification (22 Oct historical baseline)

The expanded prepared join artifacts are recorded in `data/build-receipt.json → joinRefresh` and `data/building-sources.json`. Every source row has been evaluated against pinned footprint snapshots. This is dataset processing coverage, not proof that every physical building exists in the snapshots. Historical release 0.1 browser/live evidence below does not attest this update; the final published commit still needs its own release receipt and live byte check.

| Check | Prepared result |
|---|---|
| Name reconciliation | 3,625 linked rows from prior 3,493: +141 new, −9 removed, 1 reassignment; 105 new identities. Of the links, 248 have an independent source-point check, 3,374 retain a name without an anchor, and 3 require coordinate review. |
| Store invariants | All 27,607 source rows, coordinates, flags and administrative memberships retained; 3,542 registered venue identities |
| Named venue geometry | 29 venues / 76 features (29 host footprints + 47 display parts) / 44 name-linked store rows; independent of point containment |
| Combined point result | 806 `point_inside`, 9,328 `boundary_candidate`, 0 `ambiguous`, 17,473 `no_building`, 0 `unavailable`; 27,607 rows / 77 provinces |
| Decision source | Native host hit: 3,058 (315 inside / 2,743 boundary); verified reference hit: 12 (10 / 2); Microsoft gap fill: 24,537 (481 inside / 6,583 boundary / 17,473 no-hit) |
| Priority and comparison | Earlier boundary/ambiguous results are retained. Native no-hit can fall through with native coverage/status preserved; alternative providers are not unioned into extra hosts. `no_building` means no containing selected-source polygon, not physical absence. |
| Geometry and provenance | Original Polygon/MultiPolygon geometry and holes retained; chosen candidate IDs resolve; exact file hashes and provider provenance checked; no nearest assignment or point movement |
| Heights and rights | Source/model estimates stay estimates. Microsoft missing/-1 height stays null; 3 m is display-only. CDLA Permissive 2.0 agreement accompanies Microsoft data; OSM/3D-GloBFP/Open Buildings credits and license roles stay separate. |

Full local suite at the join update (`037ff18`): `node --test tests/*.test.js` — **129/129 passed**, 0 failed, 0 skipped. This includes combined-source priority/failure checks, candidate/source and all-row invariants, geometry holes/boundaries, native affine geometry metadata, provider/height facts, source agreements, privacy scan, cold-selection camera/URL and detail-context regressions, and the existing model/map tests. The 10 m guard is a geometric review threshold, not validated coordinate accuracy or an error radius. No match establishes tenancy, true shopfront, floor or operating status.

Cold-selection and URL regression checks: `node --test tests/url-state.test.js tests/spatial-fit-intent.test.js` — **9/9 passed**. The harness executes the actual production selection, async completion, map-install and URL-restore functions with network/render stand-ins. A cold selection fits the full building once when geometry is ready; data ready before the map is used in its single initial fit. Direct gestures cancel a pending fit, while programmatic camera animation does not; stale payloads, pins, absent geometry and closed detail do not cause late camera jumps. A direct Megabangna URL restores province `11` → district `1103` → unit `04110302` and the complete breadcrumb, including with invalid or stale area parameters. Filtered venue links use the same point-first member rule as clicking a venue. These checks preserve source coordinates and administrative memberships; they are local regression evidence, not a new live browser or release attestation.

Detail-context regression checks: `node --test tests/spatial-context.test.js` — **2/2 passed**. The actual spatial-update function and tile planner use the shipped Megabangna reference and municipality geometry. Store/venue detail now prioritizes host regions so tile `14/12774/7565` is included before the nine-tile cap; context exclusion can therefore inspect the host twin. Overlapping display parts share tile requests. Area views retain their compact-unit context and existing cap. No source geometry, point coordinate or administrative membership changes; these are local planning checks, with final rendered and live verification still separate.

Independent GEOS audit: all 27,607 rows and 13,628 source geometries checked, zero invalid geometry, containment, guard, priority or provenance errors; maximum boundary-distance difference 0.0005 m from output rounding. No source geometry repair was applied. Detailed external QA evidence is `combined-geos-audit.json`.

Rendered facts-only harness: the actual current `renderStore` and styles rendered native modeled height, Microsoft missing-height and Microsoft predicted-height fixtures at **390×844 and 1280×844, light/dark** (12 cases). Zero horizontal overflow, fact-row overlap or page errors; Thai narrow/desktop screenshots inspected directly. The source/height facts link official dataset pages and do not display the 3 m fallback as a measurement. This isolated panel check is not a map integration or live deployment check. Historical machine/LDS/browser/live records below retain their original release scope.

## Automated (unit) — historical release 0.1

Historical release 0.1: `npm test` — **65/65 passed** (Node 22) on that release working tree, against its shipped data files:

- **data** (`data.test.js`): every province geometry file holds all its districts and units (label point, bbox); every store has a detail record (full uuid, source tile; 178 blank addresses stay blank); icon fonts match their contracts; no private Drive/Sheet link in any shipped text file
- **model** (`model.test.js`): every source row, brand, type and area of the snapshot; production codes; filters never mutate rows; per-capita never invents a zero; names, nouns and production links; the build receipt reconciles the shipped rows with the API at every level
- **hierarchy** (`hierarchy.test.js`): selection normalisation; children cover their parent (77 provinces = 27,607 stores and 65,723,008 residents); every unit of the tested districts shows its API count, including border units (ทน.แหลมฉบัง 152 with 130 in ศรีราชา; คลองบางครุ 5, not a false zero); the country Aha (BKK · CBI · SPK, 30% / 13%, “less”); the recomputed Aha for ชลบุรี (79% / 63%), เขตวัฒนา (38% / 16%) and a brand filter; the k rule; the union of overlapping units; no population comparison for เขตดุสิต; per-capita ranking with missing population last; the unit insight of ทม.แสนสุข
- **scales** (`scales.test.js`): every LUT sample of `count` and `density.capita` equals the LDS package fixture; quantile classes on rounded values; zero vs no data; ink contrast ≥ 4.5:1
- **charts** (`chart-model.test.js`): shares sum to 100% at country level; Bangkok first by count, Phuket by per-capita; population shares omitted when incomplete; border units keep their full count in ranking and matrix while their share counts only the district's stores; matrix rows sum to their area
- **profile-model**, **breadcrumb**, **map-style** (stores layer, area layers, pictogram contract ↔ manifest), **pins**, **brand-logos**, **venue-logos** (registry validation, sha256 of every file), **massing**, **geometry**, **mvt**

## Machine contracts — historical release 0.1

`product-statement.json`, `product-brief.json` and `implementation-plan.json` validate against `handoff.schema.json` **1.0.0** (ajv 2020-12, 2026-10-22). The generated `handoff-manifest.json` is checked by the same schema at bundle time.

## LDS checks — historical release 0.1

- Package integrity: `verify.mjs` on the pinned LDS 0.9.7 package (`v0.9.7-owner.1`, release.json sha256 `0a936393…8516`, normative `d3085cbc…2d96`) — **PASS 9,769 / 9,769**, 65 package-level B-HUE warnings (not caused by this artifact).
- Artifact: `check-artifact.mjs index.html` (index + fonts.css, theme.css, styles.css, navigation.css, logos.css, grocery.css; 127 unique colours) — status FAIL for **24 basemap-only literal HEX values in `assets/theme.css`** (declared once per theme as `--basemap-*`, never data colours — the same accepted exception as Luxury Brands), plus the standard warning that scripts need rendered review. No other ungoverned colour, no prohibited alias. This static check is not a contrast, layout or accessibility certificate.

## Rendered harness (Playwright, Chromium, container) — historical release 0.1

The container cannot reach unpkg.com or tiles.openfreemap.org. The harness serves the repository on 127.0.0.1, fulfils the pinned MapLibre 5.6.2 JS/CSS from the npm package and answers the TileJSON with a stub whose tiles are empty, so the basemap is blank paper; data layers (areas, dots, pins, labels), panel, charts, table and camera are the real code paths. Screenshots are taken after `map.loaded()` and `areTilesLoaded()` (software WebGL needs ~2–4 s to tile the 77 province polygons). Log: `evidence/harness-0.1.log`, state per screenshot: `evidence/harness-0.1.json`.

| Viewport / theme | Flows checked | Result |
|---|---|---|
| 1280×800 light | first paint (core data ready 0.65 s): Aha “30% ของสาขาอยู่ใน 3 จังหวัดนี้ · ซึ่งมีคนแค่ 13% ของประเทศ”, focus BKK · CBI · SPK (8,228 rows), plan z4.37, legend จังหวัด · จำนวนสาขา (39–90 … 446–5,310); ดูทุกจังหวัด (`?areas=all`, every province filled); ต่อ 1 หมื่นคน (legend 1.0–2.3 … 4.6–11.3, density.capita fills); ชลบุรี via the Aha name (79% / 63%, crumbs ประเทศไทย › ชลบุรี); บางละมุง (78% ใน 2 อปท. นี้ / 61%); เมืองพัทยา (model preset pitch 60; label 364 = panel 364 = API; “มากกว่าค่าเฉลี่ยอำเภอบางละมุง 2.2 เท่า”); z15.6: 29 pins, 25 logos; store via pin (address “ต.นาเกลือ อ.บางละมุง ชลบุรี” loaded on demand, source 7-Eleven 29 ก.ย. 2569); crumb-province; charts ranking / mix / brands (matrix cells all 144×36 px); table (no CSV control); help (Escape closes) | pass — no page errors |
| deep links | `?district=1039` (38% / 16%, ย่าน, city preset pitch 56); `?district=1002` (“ยังไม่มีข้อมูลประชากรครบทุกย่าน จึงไม่เทียบกับจำนวนคน”); `?province=CBI&district=2004&metric=capita&view=mix&areas=all` (restored); `?search=zzzz` (empty state + reset); `?brand=MAKRO` (Aha recomputed: BKK · CBI · เชียงใหม่) | pass — no page errors |
| 1280×800 dark | first paint, กรุงเทพมหานคร (11% ใน 3 เขตนี้ / 9%), matrix, per-capita | pass — same data HEX, dark basemap tokens |
| 390×844 light + dark (touch) | compact Aha card on the map; bottom sheet; province from the sheet (plan); unit (crumbs fold behind “…”); sheet closed → map | pass — no horizontal overflow, no page errors |
| keyboard | at z15.5 one pin in the tab order (roving), ArrowRight moves focus, Enter opens the store; focus ring visible on toolbar buttons | pass |

Fixed during this pass: a unit straddling a district border showed fewer stores in its district's comparison (label) than in its own panel (เมืองพัทยา 362 vs 364; คลองบางครุ drawn as a measured zero with 5 stores) — units now show their full production count everywhere, while district shares count only the district's own stores (`hierarchy.js#comparisonRows`, `inArea`; tests added). After the first publish, pitched districts and units are framed on their outline vertices (`app.js#currentOutline`): the harness re-run on 40563f9 frames เขตวัฒนา at z13.02 instead of z12.62 at 1280×800, with all other figures above unchanged and no page errors.

## Live checks (Chrome on macOS, real tiles) — historical release 0.1

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

**40563f9 (outline fit; Pages run 39768527853, success 2026-10-22 11:10:30 UTC).** Loaded with a cache-busting query (Pages and the browser keep `index.html` ~10 min; the entry files carry `?v=20261022-g2`).

| Check | Result |
|---|---|
| เขตวัฒนา deep link (`live-11-watthana-outline-fit-dark-40563f9.jpg`) | city preset z13.57 (was z12.67 on the bbox fit at the same viewport); the district band spans the map width, the three focused Locales filled, dots in type colours |
| First paint (`live-12-country-aha-dark-40563f9.jpg`) | same Aha and fills as 9242f23; core panel immediate, map drawn after its tiles (6–14 s in this Chrome tab, which was not the foreground window) |
| Console | no errors and no warnings on either load (logo registries complete, no map-resource failures) |

Live byte attestation on 40563f9: `npm run verify:live` — **367 ok, 0 failed** (400-file manifest; `tests/`, `scripts/`, dotfiles and `package.json` are not published files) → `evidence/live-attestation-40563f9.json`. The final documentation commit is attested again in `RELEASE_RECEIPT.json`.

## Live byte attestation

`npm run verify:live` compares SHA-256 of every published file in the generated manifest with the bytes served by GitHub Pages (`cache: no-store`, cache-busting query). The result is in `evidence/live-attestation-<commit>.json` inside the bundle and summarised in `RELEASE_RECEIPT.json`. The manifest is generated from `git ls-files` of the release commit and is not tracked in git, so it cannot drift from the bytes it describes.

## Evidence files in the bundle

`evidence/` of the 0.2 bundle holds the 0.2 harness logs and screenshots (`harness-core.json`, `harness-venue.json`, `legend-qa.json`; core `d-*` / `m-*` / `a11y-*`, venue `v-*`, legend close-ups `legend-*`), the LDS outputs (`lds-verify.json`, `lds-check-index.txt`), the live screenshots of 0.2 (`live-0.2-*`) and the live attestation of the final commit. Harness screenshots show a blank basemap and no massing; the real-tile look is in the live screenshots. The 0.1 evidence stays in the 0.1 bundle.
