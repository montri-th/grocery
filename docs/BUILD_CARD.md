# CityMETER Grocery — first useful value

This Build Card records the first-use contract for this research demo (same form as CityMETER Luxury Brands). It uses LDS 0.9.7, release `v0.9.7-owner.1`, standalone document `lds-0.9.7-landometer-standalone-r1`, SHA-256 `d3085cbc0a50195f1cbf0c77b1d77c0d19b84364daf2948eb367348d65432d96`. It is not a blanket conformance or browser-pass certificate.

## First Aha — AHA-01

**First useful understanding (owner choice 2026-10-22, “สาขากระจุกเทียบคน”):** where the grocery stores in the selection concentrate relative to where people live — at the level the user is looking at. The user can start from the country, without learning any filter first, and ask the same question one level down with a single click.

Default copy (release 0.1): **“30% ของสาขาอยู่ใน 3 จังหวัดนี้ · ซึ่งมีคนแค่ 13% ของประเทศ”** — กรุงเทพมหานคร, ชลบุรี and สมุทรปราการ hold **8,228 of 27,607 stores** (29.80%) and **8,445,076 of 65,723,008 registered residents** (12.85%). Every figure is computed from the data, never written into markup. The map opens on Thailand (plan preset, the country is wider than 0.3°) with those three provinces focused automatically — class fill, labels and coloured dots only inside the focus; the other provinces are outline-only and their stores grey context dots.

**One useful action:** the default state already focuses the returned `top` children (focus mode `auto`). The visible actions are “ดูทุกจังหวัด”, which lifts the automatic focus (`?areas=all`) while keeping the filters, and “เปรียบเทียบจังหวัด”, which opens the paired stores-vs-people ranking. When focus is off, the action becomes “โฟกัส 3 จังหวัดนี้”. Each named area is a drill-down button: the province view asks the same question of its districts (ชลบุรี: “79% ของสาขาในชลบุรีอยู่ใน 3 อำเภอนี้ ซึ่งมีคนแค่ 63% ของจังหวัด”), the district view of its local units or Bangkok Locales (เขตวัฒนา: 38% vs 16%). When a filter changes, the insight, its denominators and the automatic focus are recomputed; the default figures never describe a new selection. The default share URL carries no `areas` parameter.

The insight opens the reading panel before any filter (filters are collapsed in a disclosure). On narrow portrait screens, the same finding and action appear in a compact map card with the breadcrumb while the bottom sheet is closed. No onboarding modal, decorative left rail or bracket accent is used.

## Evidence cue and calculation

Sources: [data/grocery.json](../data/grocery.json) and [data/areas.json](../data/areas.json), checked 2026-10-22, reconciled with the production API in [data/build-receipt.json](../data/build-receipt.json). Calculation: [buildAha](../js/hierarchy.js), applied to rows already selected by `filterRows`.

1. Children of the current area: country → 77 provinces, province → its districts, district → its local units (production membership).
2. Rank children by store count, then Thai name, then key; take k = 3 when there are at least nine children, 2 from four, else 1 (children with stores only).
3. Numerator: stores of the current area that belong to any of the k children — a **union**, so the 15 stores sitting in two overlapping units count once. Denominator: all stores of the current area.
4. Population share: population of the k children ÷ population of all children, only when **every** child has a registered population (ทะเบียนราษฎร พ.ค. 2569 as used by CityMETER). Otherwise the comparison is omitted and the copy says so — population is never estimated.
5. “แค่” only when the rounded population share is lower than the rounded store share.

| Default area | Production key | Stores | Registered residents |
|---|---|---:|---:|
| กรุงเทพมหานคร | `BKK` | 5,310 | 5,409,726 |
| ชลบุรี | `CBI` | 1,761 | 1,650,550 |
| สมุทรปราการ | `SPK` | 1,157 | 1,384,800 |

These are descriptive shares within the 17 chains CityMETER shows, not a census of grocery stores, a sales measure, a saturation or potential claim, or evidence of consumer behaviour. The pure API returns `{level, childLevel, area, nouns, total, brands, children, top, k, topCount, share, popComplete, popShare, populationTotal, populationTop, comparison, missingPopulation}` and never changes the rows. At the unit level there is no Aha: `buildUnitInsight` compares the unit's stores per 10,000 residents with its district and ranks it among the district's units.

If no child has a store in the filter, the panel shows the store count only (no Aha, no focus). An empty selection shows “ไม่พบสาขาตามตัวกรองนี้” with a reset action.

## Prerequisites and safe paths — AHA-01-A / AHA-01-B

- **Essential for the insight:** `data/grocery.json` and `data/areas.json` must load and parse on an HTTP(S) origin. A local-file delivery uses the provided bridge to the public URL; browser origin protections are not bypassed.
- **Not prerequisites:** account, personal information, location or device permission, sharing, chart libraries, WebGL, map tiles, province boundaries, store details or logo images.
- The textual insight renders as soon as the core data is ready. MapLibre loads separately with a timeout and a retry; district/unit boundaries and store details load per province and fail soft. A map failure leaves the insight, charts and table usable; the table is the safe read-only route.
- A missing core dataset gets an actionable error/retry route; a missing optional resource is never presented as proof that the data is empty.

## Icon contract — ICON-01

UI icons use the approved Material Symbols Rounded nav-7 subset: `open_in_new`, `menu`, `close`, `light_mode`, `dark_mode`, `contrast`, `groups` (axes `FILL 0`, `wght 300`, `GRAD 0`, `opsz 24`; `assets/icons/material-nav-300.woff2`, SHA-256 `d7e283106ed2898726b24504c4e0f5ad524292984a90a4d29553c7dcf53b9657`, Apache 2.0). Metric tiles and section headings use a separate 9-glyph pictogram subset of the same family (`assets/icons/material-pictogram-300.woff2`, 1,936 bytes, SHA-256 `6a7584bdd72ea1d1c95af1f098661eff4a2c51c5eec6a911f9b3913228792c9f`, manifest `material-pictogram-300.json`, built by `scripts/build-pictogram-font.py` from npm `material-symbols@0.27.0`) — the test exception the owner approved for Luxury Brands on 2026-10-22, carried over; the nav-7 bytes are unchanged.

Map and data actions (ดูทั้งหมด, ประเทศไทย, กรุงเทพฯ, พื้นที่, 3D, the metric switch) remain visible text because the approved subset has no exact glyph for them. `menu` is used only for the mobile data sheet. Keep icon style separate from brand and venue identity images and from the store-type colours. Retain visible labels and focus when an icon font fails.

## Verification scope

[hierarchy.test.js](../tests/hierarchy.test.js) checks selection normalisation, children that cover their parent (77 provinces sum to 27,607 stores and 65,723,008 residents), the country Aha (BKK · CBI · SPK, 30% / 13%, “less”), the recomputed Aha for ชลบุรี (79% / 63%), เขตวัฒนา (38% / 16%) and a brand filter, the k rule, the union of overlapping units, units that straddle a district border keeping their full production count (ทน.แหลมฉบัง 152, คลองบางครุ 5), the omitted population comparison of เขตดุสิต, per-capita ranking with missing population last, and the unit insight of ทม.แสนสุข. Together with the original chart/model/data/map/logo/massing tests, these formed the historical 65-test suite of release 0.1. The join update adds separate name, reference-geometry, containment and UI-contract tests; actual run scope is recorded in [VERIFICATION.md](../handoff/VERIFICATION.md). Unit tests establish numerical and source-selection behaviour; first-paint visibility, map actions, responsive Thai layout, keyboard operation, vendor failure and live deployment require their own evidence.

## Store, venue and building evidence — 2026-10-22 join update

The reading contract keeps three relations separate:

| Relation | Prepared coverage | Meaning |
|---|---|---|
| Store → venue name | 3,625 linked rows: 141 new, 9 removed from the prior 3,493, one identity reassignment; 105 new venue identities | Exact qualified host-name/alias plus source-province checks. Of the links, 248 also match an independent venue representative point; 3,374 retain a name candidate without an anchor; 3 require coordinate review. Name and point proximity do not prove tenancy. |
| Named venue → reference geometry | 29 venues, 76 original features (29 host footprints + 47 display parts), linked by name/source identity to 44 store rows | Show as “อาคารของสถานที่ตามชื่อสาขา”. Those 44 rows are not a count of points inside the footprints. |
| Plotted store point → chosen-source footprint | 806 `point_inside`, 9,328 `boundary_candidate`, 0 `ambiguous`, 17,473 `no_building`, 0 `unavailable` across all 27,607 rows | Every row was evaluated against pinned snapshots. Dataset-wide processing does not imply all physical buildings are present; no-hit means no containing source polygon. |

The 10 m guard is a geometric review threshold, not measured coordinate accuracy or an error radius. The local join preserves the source coordinates, original Polygon/MultiPolygon geometry and holes. Overlapping display parts do not create duplicate hosts. No nearest-building fallback, snap, tenancy/floor inference or operating-status upgrade is allowed. Heights retain their source/display role; unknown height is not a measurement. Microsoft missing/-1 height stays null in the source fact; the 3 m extrusion is display-only. Store facts link the footprint provider’s official page and distinguish estimated from missing height.

Prepared evidence is in [venue-joins.json](../data/venue-joins.json), [venue-reference-buildings.json](../data/venue-reference-buildings.json), [spatial-joins.json](../data/spatial-joins.json) and the appended join receipt in [build-receipt.json](../data/build-receipt.json). Source priority is native host hit → verified reference host hit → Microsoft gap fill; an earlier boundary/ambiguous result is never promoted by a later interior result. Decisions: 3,058 native (315 inside / 2,743 boundary), 12 reference (10 / 2), 24,537 Microsoft (481 inside / 6,583 boundary / 17,473 no-hit). Native no-hit fallback and provider differences remain in the receipt. The sources retain ODbL/CC BY 4.0 or Microsoft CDLA Permissive 2.0 as applicable; see [building-sources.json](../data/building-sources.json). The broader OpenFreeMap extraction remains withheld outside the public repository and is not an input. These expanded prepared files require final release/live attestation; the 29 named venues remain an independent reference relation.
