# CityMETER Grocery — Implementation Plan

รุ่นส่งต่อ 0.1 · ปรับเอกสาร 22 ตุลาคม 2569 · ข้อมูลตรวจถึง 22 ตุลาคม 2569 · ใช้คู่กับ [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md), [PRODUCT_STATEMENT.md](../PRODUCT_STATEMENT.md) และ [implementation-plan.json](implementation-plan.json)

รุ่น 0.1 ยกสถาปัตยกรรมของ CityMETER Luxury Brands 0.5 มาใช้กับชุดข้อมูล Grocery แล้วเปลี่ยนแกนจาก “ย่านเชิงวิเคราะห์” เป็น **ลำดับชั้นปกครองของ production** (ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน) และเปลี่ยน Aha เป็น **สาขากระจุกเทียบคน** ที่คำนวณใหม่ทุกระดับ เป้าหมายของแผนนี้คือให้ developer หรือ coding agent รับช่วงต่อได้โดยไม่ต้องเดาสถานะ รู้ว่าตัวเลขมาจากไหน และรู้ว่าอะไรคือ display-only กับอะไรคือข้อมูล

## สถาปัตยกรรมที่มีจริง

Static HTML/CSS และ JavaScript ES modules ไม่มี build step ไม่มี framework ไลบรารีภายนอกเพียงตัวเดียวคือ MapLibre GL 5.6.2 จาก URL ที่ pin ไว้ใน `js/vendors.js` บริการภายนอกคือ tile และ glyph ของ OpenFreeMap (basemap + มวลอาคาร) กราฟวาดเอง `npm start` เสิร์ฟผ่าน Python, `npm test` ใช้ Node test runner (Node ≥ 20) ไม่ต้อง `npm install` (`node_modules/playwright` เป็น symlink สำหรับ `scripts/measure-logos.mjs` เท่านั้น ไม่อยู่ใน git)

| ไฟล์ | หน้าที่ | ข้อต่อที่ต้องรักษา |
|---|---|---|
| `index.html` | โครงหน้าจอ: header + toolbar, map panel (legend + สวิตช์ตัวชี้วัด, การ์ด Aha มือถือ, status), ถาดกราฟ, ตาราง, แผงอ่านข้อมูล (breadcrumb บนสุด), help dialog, launch overlay | DOM IDs ที่ `app.js`/`navigation.js` ใช้; `?v=` บน entry files; ไม่มี CSV/caveat UI |
| `js/launch.js` | classic boot script, file bridge, loading/slow/error fallback | events `citymeter:ready`, `citymeter:load-error`; public origin `https://montri-th.github.io/grocery/` |
| `js/app.js` | state, selection `{province, district, unit}`, ขอบเขตข้อมูลสามชั้น + focus mode, panel modes + back stack, URL state, legend, map lifecycle, ติดตั้งชั้น spatial (stores → areas → massing), กล้อง | `update()` เป็นจุดเดียวที่คำนวณ selection, Aha, focus และ rows; `installSpatialLayers()` ติดตั้ง stores ก่อน areas (ลำดับ click) |
| `js/model.js` | `buildModel(grocery, areas)`: แถว, แบรนด์, ประเภท, พื้นที่, ดัชนี lookup, `filterRows`, `perCapita`, `productionURL`, คำนาม (`unitName`, `districtNoun`, `unitNoun`, `withNoun`) | ไม่แก้แถวต้นทาง; สาขากับแบรนด์ไม่ซ้ำแยกกัน; key 8 หลักไม่ชน |
| `js/hierarchy.js` | ลำดับชั้น, `areaRows`, `childrenOf`, `summarizeChildren`, `rankChildren`, `buildAha`, `buildUnitInsight`, `levelNouns`, `areaKey` | สมาชิกตาม production; union ใน Aha; ประชากรไม่ครบ = ไม่เทียบ |
| `js/scales.js` | LDS `count` + `density.capita` (LUT 41 ค่า, class 5), `buildClasses` (quantile บนค่าที่ปัด), `classify`, `formatMetric`, `inkFor` | ห้าม interpolate สีใหม่; HEX เดียวกันสองธีม; ศูนย์ ≠ ไม่มีข้อมูล |
| `js/area-layers.js` | choropleth สามระดับ (hit/fill/zero/outline/selected), `installAreaLabels` (ชิป HTML จัดการชน), `FILL_MAX_ZOOM`, `LABEL_MAX_ZOOM`, `bboxOfFeature` | สีผ่าน feature-state (`'transparent'` = ปิด); re-apply หลัง re-tile; fill ก่อน `waterway`; เส้นใต้ชั้นจุด |
| `js/stores-layer.js` | 27,607 WebGL dots (context/focus/selected), `focusExpression`, `typeColors` | หนึ่งจุดต่อแถว; โฟกัสเปลี่ยนแค่ filter; click ลงทะเบียนก่อนพื้นที่ |
| `js/pins.js` | หมุด HTML + โลโก้จาก zoom 14 (≤ 450 / ≤ 250), slot + leader line, keyboard | พิกัดต้นทางไม่เปลี่ยน; ไม่ทับ UI/ป้าย; context ไม่อยู่ใน tab order |
| `js/geo-store.js` | โหลดขอบเขตอำเภอ/อปท. และรายละเอียดสาขารายจังหวัด (cache, retry, timeout) | ล้มเหลวไม่ทำให้ส่วนอื่นหยุด |
| `js/spatial-store.js`, `js/spatial-layer.js` | โหลดผล point containment รายจังหวัดและรูปทรงอ้างอิงตามชื่อ แล้วเลือกชั้นแผนที่ 2D/3D | ชื่อ/จุดอ้างอิง/point containment แยกหลักฐาน; โหลดไม่สำเร็จไม่แปลว่าไม่มีอาคาร |
| `js/chart-model.js` / `js/charts.js` | โมเดลและ HTML ของกราฟ ranking (คู่สาขา–คน / ต่อคน) และ matrix (ประเภท / แบรนด์) | ทุก mark เป็น `<button>`; matrix ช่องเท่ากัน; แท่งประชากรไม่ใช่สีข้อมูล |
| `js/profile-model.js` | `typeMix`, `brandMix`, `venueRanking`, `describeStatus`, `describeGeometry`, `buildUnitProfile`, `buildVenueProfile`, `buildStoreDetail` | pure; ไม่ยกระดับความแม่นพิกัด; สถานะ “อยู่ในรายการสาขาของแบรนด์” |
| `js/panel.js` | HTML ของแผงทุกโหมด, `metricTile`/`heading` + pictogram, `metricSwitch`, ชิปตัวกรอง | pure strings; ปุ่มทุกตัวมี `data-action` |
| `js/breadcrumb.js` | crumbs ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน › สถานที่, `breadcrumbText` | ร้านไม่ใช่ crumb; ไม่สร้าง id เอง |
| `js/brand-logos.js`, `js/venue-logos.js` | ทะเบียนโลโก้ แบรนด์ (sprite) / สถานที่ (ไฟล์), markup พื้นรอง + บทบาท | ไม่ fuzzy; ชื่อยังเป็นตัวตน |
| `js/map-style.js`, `js/massing.js`, `js/mvt.js`, `js/geometry.js`, `js/camera.js` | basemap กระดาษ, มวลอาคารสองชั้น, MVT reader, offset/มุมโค้ง, กล้อง (ยกจาก Luxury Brands) | สีจาก `--basemap-*`; display-only; preset ไม่ขยับข้อมูล |
| `js/navigation.js` | nav-7 glyphs, `PICTOGRAM_CONTRACT` (9 glyph), toolbar titles, help dialog | visible labels, Escape, focus return |
| `js/vendors.js` | loader ของ MapLibre JS/CSS พร้อม timeout/retry | — |
| `styles.css`, `grocery.css`, `logos.css`, `navigation.css`, `assets/theme.css` | layout/panel/chrome/charts/crumbs; ป้ายพื้นที่ Aha bars สวิตช์ แท่งคู่; สีประเภท; icons/help; LDS tokens + basemap tokens | token-only colours (ข้อยกเว้นที่ประกาศ: basemap literals ใน theme.css) |

### สายการสร้างข้อมูล

| สคริปต์ | หน้าที่ | ผลลัพธ์ |
|---|---|---|
| `scripts/data/fetch-catalog.py` | `base/info` + `grocery/info` lv0/lv1 ของ 77 จังหวัด | รายชื่อ รหัส ประชากร ยอด (156 requests) |
| `scripts/data/fetch-geometry.py` | `grocery/info/geom/{id}/{TYPE}` | ขอบเขต 9,626 พื้นที่ |
| `scripts/data/assemble-geo.py`, `assign-geometry.py` | รวม GeoJSON เต็ม, หาระดับบนของ Locale ที่ไม่มีสาขาด้วยการซ้อนทับ | `*.full.geojson`, `ml-assignment.json` |
| `scripts/data/fetch-unit-membership.py`, `merge-unit-membership.mjs` | overlay tiles ของ 5,692 พื้นที่ที่มีสาขา → สมาชิก | `unit-membership.json` |
| `scripts/build-data.py` | รวมชีต + API + membership → ไฟล์เว็บ, ย่อขอบเขต (mapshaper), receipt; **หยุด** ถ้า membership ≠ API, key ชน หรือระดับบนอยู่นอกจังหวัด | `data/grocery.json`, `data/areas.json`, `data/geo/`, `data/detail/`, `data/build-receipt.json` |
| `scripts/build-brand-logos.py` (+ `measure-logos.mjs`) | ตรวจ sha256, วัดพื้นรอง, ฝังไบต์ต้นฉบับ | `assets/brand-logos.svg`, `data/brand-logos.json`, manifest |
| `scripts/build-venue-logos.py` (+ `measure-logos.mjs`) | ตรวจ sha256, วัดพื้นรอง, คัดลอกไบต์ | `assets/venue-logos/`, `data/venue-logos.json`, manifest |
| `scripts/build-pictogram-font.py` | ตัด subset 9 glyph จาก npm material-symbols 0.27.0 | `assets/icons/material-pictogram-300.woff2` + `.json` |
| `scripts/reconcile-venue-names.py` | เชื่อม qualified host alias + จังหวัดต้นทาง; ใช้จุดอ้างอิง venue ตรวจข้อขัดแย้งทางระยะ | `data/venue-joins.json`: 3,625 links (+141 / −9), 105 ตัวตนใหม่; 3 จุดรอตรวจพิกัด |
| `scripts/build-venue-references.py` | เชื่อม venue/source id ที่ยอมรับแล้วกับ geometry เดิมของชุด Luxury Brands | `data/venue-reference-buildings.json`: 29 venue / 76 features / 44 สาขาที่เชื่อมชื่อ |
| `scripts/build-reference-spatial-joins.mjs` | ทดสอบจุดเดิมกับ 29 host footprints โดยไม่เรียกเครือข่าย; คง holes และเกณฑ์ทบทวนขอบ 10 ม. | `data/spatial-joins.json`, `data/spatial/<จังหวัด>.json` ครบ 77 จังหวัด |
| `scripts/combine-spatial-sources.py` | รวม snapshot ตาม native host hit → verified reference hit → Microsoft gap fill; ไม่ยกระดับ boundary/ambiguity และไม่เรียกเครือข่าย | `data/spatial-joins.json`, `data/spatial/` ครบ 27,607 แถว / 77 จังหวัด |
| `scripts/build-handoff.mjs`, `scripts/verify-live.mjs` | manifest + ZIP, live byte attestation | hash จาก bytes จริง |

สคริปต์ `scripts/build-spatial-joins.mjs` เป็นงานทดลอง OpenFreeMap ที่ยังไม่เผยแพร่ ไม่ใช่สายการสร้างผล join สำหรับเว็บ ผลเดิมและ raw receipts อยู่นอก public repo; การดึง public instance เพิ่มต้องรักษาขอบเขตบริการ (4 requests, 3,000 tiles/50 MB และ User-Agent ระบุแอป) หรือมีหลักฐานการอนุญาตจากผู้ให้บริการสำหรับ batch ใหญ่กว่า ดู [DATA_METHOD.md](../DATA_METHOD.md) §11

## แผนงานและสถานะ

| ID | งานและผลลัพธ์ | สถานะ | หลักฐาน |
|---|---|---|---|
| P01 | สายการสร้างข้อมูล: ชีต + production API → ไฟล์เว็บ + receipt ที่กระทบยอดทุกระดับ | done | `data/build-receipt.json`, `tests/data.test.js` |
| P02 | ลำดับชั้นพื้นที่ + Aha “สาขากระจุกเทียบคน” ทุกระดับ + insight ระดับ อปท. | done | `tests/hierarchy.test.js` (fixture 30%/13%, union, ประชากรไม่ครบ, k) |
| P03 | ตัวชี้วัด `count` / `density.capita` + quantile บนค่าที่ปัด + EVID-05 | done | `tests/scales.test.js` (LUT ตรง LDS ทุกค่า, contrast) |
| P04 | ชั้นพื้นที่สามระดับ + ป้ายชิป + โหลดขอบเขตรายจังหวัด | done | `tests/map-style.test.js`; harness |
| P05 | ชั้นจุด WebGL + หมุด HTML/โลโก้ตั้งแต่ z14 + focus/quiet | done | `tests/map-style.test.js`, `tests/pins.test.js`; harness |
| P06 | แผงสี่โหมด + breadcrumb 5 ระดับ + URL state + back stack | done | `tests/breadcrumb.test.js`, `tests/profile-model.test.js`; harness |
| P07 | กราฟ ranking (คู่สาขา–คน / ต่อคน) + matrix ประเภท / แบรนด์ | done | `tests/chart-model.test.js`; harness |
| P08 | โลโก้แบรนด์ 17 + สถานที่ 128 (sha256 ตรงชีต, พื้นรองวัดจากงานศิลป์) | done | `tests/brand-logos.test.js`, `tests/venue-logos.test.js` |
| P09 | pictogram 9 glyph (ข้อยกเว้นทดลองที่ยกจาก Luxury Brands) | done | `tests/map-style.test.js` (contract ↔ manifest) |
| P10 | Product Statement + Brief + Plan + Verification + schema 1.0.0 | done | ajv 2020-12 (ดู VERIFICATION) |
| P11 | ตรวจหน้าจอ (harness) 1280/390 สองธีม, LDS artifact checker | done | `VERIFICATION.md` |
| P12 | เผยแพร่ GitHub Pages, live checks, live attestation, bundle | ดู `VERIFICATION.md` | `RELEASE_RECEIPT.json` ใน bundle |
| J01 | ปรับ store → venue จากชื่อ พร้อม source-point contradiction check | เตรียมข้อมูลแล้ว | `data/venue-joins.json`: 3,625 links, เพิ่ม 141 / ถอน 9 / เปลี่ยนตัวตน 1, ตัวตนใหม่ 105 |
| J02 | รูปทรงอ้างอิงตาม venue identity | เตรียมข้อมูลแล้ว | 29 venue / 76 features / 44 สาขาที่เชื่อมชื่อ; ไม่เท่ากับ point containment |
| J03 | point-in-footprint join แบบรวมแหล่ง | เตรียมข้อมูลแล้ว | 806 `point_inside`, 9,328 `boundary_candidate`, 17,473 `no_building`, 0 `unavailable`; ทุก 27,607 แถวมีสถานะ |
| J04 | rendered QA / เผยแพร่ / live attestation ของชุดที่ขยายแหล่งแล้ว | เตรียมข้อมูลครบ; release ต้องมีหลักฐานใหม่ | คง 29 venue reference แยกจากผลพิกัด ใช้ native + reference + Microsoft ตาม receipt; ผลเดิมของ 0.1 ไม่รับรองการเปลี่ยนชุดนี้ |

## งานถัดไปที่แนะนำ (backlog สำหรับ vibe coding)

| ID | งาน | ขอบเขต/เกณฑ์ |
|---|---|---|
| N01 | Playwright regression ใน CI: โหลดหน้า, Aha ประเทศ, เจาะ 3 ระดับ, สวิตช์ตัวชี้วัด, ร้าน, ธีม, 390/1280, fault-injection | harness แบบเดียวกับ VERIFICATION (vendored MapLibre + stub tiles) |
| N02 | ป้ายพื้นที่เป็น symbol layer ของ MapLibre แทน HTML overlay | คงชื่อ + ค่า + กดได้ + quiet |
| N03 | ร้านต่อคนตามระยะเดิน/ขับรถรอบจุด (catchment) | ต้องมีข้อมูลประชากรระดับกริดและการตัดสินใจของ product |
| N04 | เทียบเชนต่อเชนในพื้นที่ (ส่วนแบ่งของแต่ละเชน, ใครยังไม่มี) | ใช้ `filtered` เดียวกัน; ไม่บวกแบรนด์ข้ามพื้นที่ |
| N05 | ปรับ Lotus's เป็นข้อมูลสด (เว็บมีมากกว่า 58 สาขา) และรอบอัปเดตของทุกเชน | data owner |
| N06 | ตรวจสถานะเปิด–ปิดรายสาขา (ชีต `08_STATUS_AUDIT`) แล้วจึงเพิ่มสถานะที่แสดง | data owner; ห้ามสร้างสถานะปิดเอง |
| N07 | route ระดับอำเภอของ production และให้ demo ใช้ path เดียวกับ production | platform |
| N08 | ประสิทธิภาพบนมือถือ: แหล่งจุด 27,607 แถว, การโหลดขอบเขตรายจังหวัด, worker สำหรับ MVT decode | frontend |
| N09 | ประชากรของ 163 อปท./ย่านที่ขาด (เมื่อ production มี) | data owner; ห้ามประมาณ |
| N10 | ตรวจ venue candidate ที่ยังไม่มี anchor, 3 กรณีพิกัดขัดแย้ง และตรวจภาคสนามจุดที่ snapshot ยังไม่มีรูปทรงครอบ | data owner + frontend; ชื่อ/จุดอ้างอิง/รูปทรงไม่ใช้แทนหลักฐานกัน |
| N11 | ทดสอบสมมติฐาน Who/What/Which/How กับผู้ใช้สามกลุ่ม (statement §7) | product owner |
| N12 | ลงทะเบียนชุด pictogram (Luxury 8 + Grocery 9) ใน LDS เมื่อเจ้าของอนุมัติ แล้วยกเลิกข้อยกเว้น | design system owner |
| N13 | จุดที่ขาด 1 แถวของเกาะพะงัน (API 57 / tile 56) | platform |
| N14 | ตรวจสิทธิ์โลโก้ Big C จาก Wikimedia Commons (PD-textlogo vs CC BY-SA 4.0) ก่อนใช้นอกเดโม | owner / legal |

## เกณฑ์รับงาน

| ID | สถานการณ์ | ผลที่ต้องเห็น |
|---|---|---|
| AC01 | เปิดผ่าน HTTP/HTTPS | ข้อมูลหลักและแผงพร้อมก่อนแผนที่; launch overlay ปิดเมื่อ `citymeter:ready` |
| AC02 | เปิด `index.html` ผ่าน `file:` | เห็นลิงก์สาธารณะไป `https://montri-th.github.io/grocery/` โดยเก็บ query/hash |
| AC03 | core data ล้มเหลว | ข้อความสั้น ลิงก์ ลองใหม่; ไม่มี shell ว่าง |
| AC04 | ขอบเขตจังหวัด / รายละเอียดสาขา / โลโก้ ล้มเหลว | ตัวเลข ตาราง กราฟใช้ได้; ข้อความสั้นใน status หรือในช่องที่อยู่; ไม่มีภาพเสีย |
| AC05 | MapLibre timeout แล้วลองใหม่ | ข้อมูล ตาราง กราฟยังอยู่; ปุ่ม retry ใช้ได้; ไม่มี script ซ้อน |
| AC06 | เปลี่ยนตัวกรอง เลือกพื้นที่ focus auto/explicit/none ล้าง | Aha/choropleth/กราฟคำนวณใหม่จาก `filtered`; หมุด/ตาราง/ตัวนับใช้ `rows`; URL คืนสถานะได้ |
| AC07 | หลายสาขาพิกัดเดียวกัน | ทุกแถวมีจุดและหมุด; slot ใกล้ anchor; พิกัดไม่เปลี่ยน |
| AC08 | โลโก้หนาแน่น | หมุด ≤ 450, โลโก้ ≤ 250, เฉพาะ zoom ≥ 14 และในโฟกัส; ไม่ทับ UI/ป้าย |
| AC09 | desktop/mobile, light/dark | header 48 px; แผง/sheet ตามสัญญา; ไม่มี horizontal overflow ที่ 390 px; basemap ที่สร้างเองทั้งสองธีม |
| AC10 | คีย์บอร์ด/reduced motion | focus เห็นชัด; หมุด กราฟ แผง toolbar help ใช้คีย์บอร์ดได้; context dots ไม่อยู่ใน tab order |
| AC11 | ข้อความ dynamic | ไม่มี caveat/research badge/CSV; สถานะ “อยู่ในรายการสาขาของแบรนด์”; แหล่งข้อมูลและวันที่ถูก; missing ไม่แสดงเป็น 0 |
| AC12 | release/handoff | commit, live bytes, manifest hashes, bundle ตรงกัน; ไม่มี private Drive/Sheet URL หรือ secret |
| AC13 | focus + quiet | พื้นที่นอกโฟกัสเหลือเส้นขอบ ป้ายจาง; แถวนอกโฟกัสเป็นจุดเทาไม่มีหมุด/โลโก้ |
| AC14 | choropleth | ระดับสีตรง legend และกราฟอันดับ; quantile บนค่าที่ปัด; ศูนย์มีเส้นขอบศูนย์; ไม่มีข้อมูลเป็นสีกลาง; fill หายที่ zoom 9 / 12 / 14.5; HEX เดียวกันสองธีม |
| AC15 | Aha แรก | หน้าแรก “30% ของสาขาอยู่ใน 3 จังหวัดนี้ · ซึ่งมีคนแค่ 13% ของประเทศ” (กรุงเทพมหานคร · ชลบุรี · สมุทรปราการ, 8,228 จาก 27,607); ทุกระดับคำนวณใหม่; ดูทุก… (`?areas=all`) และเปรียบเทียบ… ใช้ได้; ตัวเลขไม่ hard-code |
| AC16 | เจาะลำดับชั้น | กดพื้นที่บนแผนที่ ป้าย อันดับ กราฟ หรือ select → จังหวัด › อำเภอ › อปท./ย่าน; ขอบเขตอำเภอ/อปท. โหลดเมื่อเปิดจังหวัด; URL ใช้ตัวย่อ/รหัส production |
| AC17 | สวิตช์ตัวชี้วัด | legend และอันดับสลับพร้อมกัน; ต่อคนของพื้นที่ไม่มีประชากร = “ไม่มีข้อมูล”; `?metric=capita` คืนสถานะ; กล้องไม่ขยับ |
| AC18 | membership | ยอด อปท./ย่านเท่ากับ API ทุกแห่ง; สาขาในสองพื้นที่นับทั้งสอง; ส่วนแบ่ง Aha นับครั้งเดียว |
| AC19 | ประชากรไม่ครบ | อำเภอที่มีพื้นที่ย่อยขาดประชากร (เช่น เขตดุสิต) แสดงส่วนแบ่งสาขาและบอกว่าไม่เทียบกับจำนวนคน |
| AC20 | breadcrumb | ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน › สถานที่ บนสุดของแผง; ร้านเป็นหัวเรื่อง; จอแคบพับเป็น “…”; crumb actions ล้างระดับที่ถูก; `document.title` ตรง crumbs |
| AC21 | กราฟ | ranking: แท่งคู่สาขา (สีระดับ) + คน (แท่งกลาง) หรือต่อคน; matrix: ทุกช่องเท่ากัน ตัวเลขทุกช่อง 0 มีเส้นขอบศูนย์; ทุก mark กดเจาะลงได้ |
| AC22 | product statement | MD + JSON มี Who/What/Which/How, quality bar, ป้ายหลักฐาน, hypotheses; JSON ทั้งสามผ่าน schema 1.0.0 |
| AC23 | โลโก้ | ทุกไฟล์ตรง sha256 ของทะเบียน; ไม่มีลิงก์ Drive; โลโก้ผู้ให้บริการ/เครือแสดงบทบาท; ไม่มีโลโก้ = ไม่มีกล่อง; ชื่อไม่เปลี่ยน |
| AC24 | รายละเอียดสาขา | ที่อยู่/ตำบล/uuid/tile โหลดเมื่อเปิด; ล้มเหลวบอก “โหลดที่อยู่ไม่สำเร็จ”; แหล่งข้อมูล + วันที่ + ข้อจำกัดพิกัด; ลิงก์ค้นหาสาขา แหล่งข้อมูล tile ต้นทาง CityMETER |
| AC25 | ชื่อ venue และ source point | ชื่อจาก alias ที่เจาะจง + จังหวัดเดียวกัน; จุด venue เป็น representative point ไม่ใช่ footprint; ตลาดที่เพิ่มใหม่ต้องไม่เกิน 300 ม. และ host ชนิดอื่นไม่เกิน 750 ม. เพื่อกันข้อขัดแย้ง ไม่ใช้หาร้านที่ใกล้ที่สุด |
| AC26 | อาคารอ้างอิงและ point containment | แสดงรูปทรงตามชื่อด้วย label แยก; ไม่เปลี่ยน `point_inside` จาก name join; เกณฑ์ขอบ 10 ม. ไม่ใช่ความแม่นพิกัด; 17,473 แถวที่ไม่พบรูปทรงครอบใน snapshot ไม่ใช่หลักฐานว่าไม่มีอาคารจริง; ไม่ย้ายพิกัด; missing height ไม่ใช้ 3 ม. เป็นค่าจริง |

## วิธีพัฒนาและทดสอบ

```sh
npm start                  # http://127.0.0.1:4173/
npm test                   # suite ปัจจุบันบนข้อมูลจริง (data/*.json) และ fixtures; ดูผลที่รันจริงใน VERIFICATION
npm run handoff:manifest   # เขียน handoff/handoff-manifest.json จาก bytes จริง (git ls-files)
npm run handoff:bundle     # + dist/CityMETER-Grocery-Developer-Handoff.zip
npm run verify:live        # เทียบ SHA-256 ของไฟล์บน GitHub Pages กับ manifest
```

ตรวจ browser ที่ 390 px และ 1280 px ทั้งสองธีม: Aha ประเทศ → ดูทุกจังหวัด → สวิตช์ต่อ 1 หมื่นคน → จังหวัด (Aha อำเภอ) → อำเภอ (Aha อปท./ย่าน) → อปท./ย่าน (เทียบค่าเฉลี่ยอำเภอ) → ซูม ≥ 14 (หมุด + โลโก้) → ร้าน (ที่อยู่โหลด) → สถานที่ → breadcrumb ขึ้นทีละระดับ → กราฟสามมุมมอง → ตาราง → help → ค้นหาที่ไม่พบ → permalink ถ้า CDN/tiles ถูกบล็อกในเครื่องทดสอบ ให้ vendored MapLibre จาก npm และ stub TileJSON ผ่าน request interception (วิธีใน VERIFICATION) แล้วยืนยันรูปลักษณ์จาก tile จริงบน live อีกครั้ง การอ่าน source ไม่เท่ากับทดสอบ browser จริง

จูนสดจาก console: `__citymeter.state.aha`, `__citymeter.selectArea({province: 9})`, `__citymeter.applyPreset('city')`, `__citymeter.fitCurrent()`

สร้างข้อมูลใหม่: ลำดับคำสั่งใน [DATA_METHOD.md](../DATA_METHOD.md) §13 (ข้อมูลดิบ ~370 MB ไม่ commit; ชีตเป็นเอกสารภายใน)

## Release บน GitHub Pages

Repository `https://github.com/montri-th/grocery` · branch `main` · Pages ใช้ branch deploy จาก root (มี `.nojekyll`; ไม่มี workflow ใน repo) · Live `https://montri-th.github.io/grocery/`

ขั้นตอน: `npm test` → bump `?v=` ใน `index.html` และ `version` ใน `package.json` → commit → `git push origin main` → รอ run `pages-build-deployment` สำเร็จ → `npm run handoff:manifest` บน commit ที่ push → `npm run verify:live` ต้องผ่านทุกไฟล์ → `npm run handoff:bundle -- --receipt <RELEASE_RECEIPT.json> --evidence <dir>` ห้ามรายงานว่าเผยแพร่แล้วจากผลในเครื่อง cache ของ Pages อยู่ที่ ~10 นาที จึงใช้ `?v=<release>` บน entry files และ `cache: 'no-store'` ใน verify

คง attribution ของ OpenFreeMap/OpenMapTiles/OpenStreetMap ไม่รวม governed LDS package ทั้งชุด ข้อมูลดิบ หรือชีตภายในลง repository
