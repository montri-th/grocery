# CityMETER: Grocery Thailand

**Live demo: [montri-th.github.io/grocery](https://montri-th.github.io/grocery/)** · [Source repository](https://github.com/montri-th/grocery)

ร้านกระจุกที่ไหนเมื่อเทียบกับคน: เห็นทันทีว่าสาขาของ 17 เชนค้าปลีกอาหาร (ร้านสะดวกซื้อ ซูเปอร์มาร์เก็ต ไฮเปอร์มาร์เก็ต ค้าส่ง ร้านขายยา) กระจุกอยู่จังหวัดไหน เมื่อเทียบกับจำนวนคนที่อาศัยอยู่ แล้วถามคำถามเดียวกันซ้ำในระดับอำเภอ/เขต และ อปท./ย่าน จนลงถึงสาขาจริงพร้อมแหล่งข้อมูล รุ่น 0.1 (22 ต.ค. 2569) ทำแบบเดียวกับ [CityMETER Luxury Brands](https://montri-th.github.io/luxurybrands/) 0.5 — map-first, LDS 0.9.7, focus + quiet, basemap กระดาษ, breadcrumb แบบ production, แผงสี่โหมด, กราฟ ตาราง โลโก้ และชุดส่งต่อสำหรับ developer

**Snapshot: 22 Oct 2026 · Record grain: one source row of a chain (สาขา) · Artifact status: public research demo, not production.**

ข้อมูลคือสิ่งที่ [CityMETER production](https://landometer.com/v3/citymeter?d=grocery) แสดง: **27,607 สาขา** (ยอดรวมของ CityMETER 27,608 — ต่าง 1 แถวที่เกาะพะงัน) ของ 17 แบรนด์ ใน 77 จังหวัด 928 อำเภอ/เขต และ 8,621 อปท./ย่าน (7,774 อปท. + 847 ย่านในกรุงเทพฯ) ประชากรตามทะเบียนราษฎร พ.ค. 2569 รวม 65,723,008 คน → **4.2 สาขาต่อ 1 หมื่นคน** ทั้งประเทศ

ข้อค้นพบแรก (ไม่กรอง): **30% ของสาขาอยู่ใน 3 จังหวัด — กรุงเทพฯ ชลบุรี สมุทรปราการ — ซึ่งมีคนแค่ 13% ของประเทศ** หน้าเว็บคำนวณตัวเลขนี้ใหม่ทุกระดับและทุกตัวกรอง ไม่ใช่ค่าคงที่

ยอดทุก อปท./ย่านตรงกับ API ของ production (8,621/8,621) เพราะใช้สมาชิกภาพจาก production เอง ไม่ได้เดาด้วยระยะทาง ทุกแถวมีแหล่งข้อมูลและวันที่ของแหล่ง (หน้าค้นหาสาขาของแบรนด์ 29–30 ก.ย. 2569 หรือข้อมูลเดิม 12 พ.ค. 2567) สถานะทุกแถวคือ “อยู่ในรายการสาขาของแบรนด์” — ยังไม่มีการตรวจเปิด–ปิดทีละสาขา

## ใช้งาน

```sh
npm start
```

เปิด <http://127.0.0.1:4173> เพื่อพัฒนาในเครื่อง; เปิดไฟล์ index.html โดยตรงจะนำไปยังเว็บสาธารณะด้านบน ข้อมูลหลักโหลดก่อน แผนที่ (MapLibre GL 5.6.2 จาก unpkg + OpenFreeMap vector tiles) โหลดภายหลังพร้อมสถานะและปุ่มลองใหม่ ขอบเขตอำเภอ/อปท. และรายละเอียดสาขาโหลดเมื่อเปิดจังหวัด/สาขา ไม่ต้อง build หรือติดตั้ง dependencies (Node ≥ 20 สำหรับ tests/scripts, Python 3 สำหรับ server) กราฟวาดด้วย HTML ภายในโปรเจกต์

```sh
npm test
```

ชุดทดสอบ 65 ข้อรันบนข้อมูลจริงที่หน้าเว็บใช้: การกระทบยอดกับ production, ลำดับชั้นพื้นที่และ Aha ทุกระดับ (รวม union ของสาขาที่อยู่สองพื้นที่ อปท. ที่คร่อมเขตอำเภอ และกรณีประชากรไม่ครบ), สเกล `count` / `density.capita` ตรง LDS ทุกค่าและ quantile, กราฟ, โปรไฟล์ อปท./สถานที่/สาขา, breadcrumb, ชั้นจุดและพื้นที่บนแผนที่, หมุด, โลโก้ (sha256), basemap, มวลอาคาร ส่วนความอ่านง่ายและพฤติกรรมในเบราว์เซอร์ตรวจแยกต่างหาก (`handoff/VERIFICATION.md`) สคริปต์ `npm run handoff:manifest`, `npm run handoff:bundle` และ `npm run verify:live` สร้าง manifest/bundle และเทียบ hash กับไฟล์บนเว็บจริง

## สิ่งที่สำรวจได้

- **ข้อค้นพบก่อน ตัวกรองทีหลัง:** แผงเปิดด้วย “X% ของสาขาอยู่ใน k พื้นที่นี้ ซึ่งมีคน[แค่] Y%” พร้อมแท่งเทียบสาขา–คน และแผนที่โฟกัส k พื้นที่นั้นแล้ว ปุ่ม “ดูทุก…” ยกเลิกโฟกัส (`?areas=all`) ปุ่ม “เปรียบเทียบ…” เปิดกราฟ ชื่อพื้นที่กดเพื่อเจาะลง
- **คำถามเดียวทุกระดับ:** ประเทศ → จังหวัด → อำเภอ/เขต → อปท./ย่าน (กรุงเทพฯ ใช้ Locale ของ CityMETER) ระดับ อปท./ย่านบอกว่าสาขาต่อคนมากกว่าหรือน้อยกว่าค่าเฉลี่ยของอำเภอ และอันดับในอำเภอ
- **จำนวน ↔ ต่อคน:** สวิตช์ในคำอธิบายแผนที่และในอันดับ: จำนวนสาขา (LDS `count`) หรือสาขาต่อ 1 หมื่นคน (LDS `density.capita`) quantile 5 ระดับ HEX เดียวกันทั้งสองธีม พื้นที่ไม่มีประชากรแสดง “ไม่มีข้อมูล” ไม่ใช่ศูนย์
- **focus + quiet:** เฉพาะพื้นที่ที่โฟกัสมีสี ป้าย และจุดสีประเภท ส่วนอื่นเหลือเส้นขอบ ป้ายจาง และจุดเทาเล็ก ๆ ที่ยังคง “1 จุด = 1 สาขา”
- **ทุกสาขาบนแผนที่:** 27,607 จุด WebGL ไม่รวมจุด ไม่ย้ายพิกัด ซูมถึง 14 จุดในโฟกัสกลายเป็นหมุดพร้อมโลโก้แบรนด์ (≤ 450 หมุด, ≤ 250 โลโก้) ใช้คีย์บอร์ดได้
- **รายละเอียดสาขา:** ประเภท รูปแบบ สถานะ ที่อยู่ ตำบล พื้นที่ สถานที่ตามชื่อสาขา (พร้อมโลโก้และบทบาท) พิกัดและระดับความแม่น แหล่งข้อมูลและวันที่ uuid ลิงก์ค้นหาสาขาของแบรนด์ / tile ต้นทาง / CityMETER และสาขาของแบรนด์เดียวกันในพื้นที่
- **breadcrumb:** ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน › สถานที่ ด้วยรหัสเดียวกับ production (`?province=CBI&district=2004&unit=<DOLA>`)
- **กราฟสามมุมมอง:** สาขาเทียบคน (แท่งคู่ หรือต่อคน) · ประเภทร้าน (ตารางตัวเลข ช่องเท่ากัน) · แบรนด์ — ทุกแท่งและช่องเป็นปุ่มจริงและใช้สีระดับเดียวกับแผนที่
- **ตัวกรอง:** ค้นหา (หลายคำ: แบรนด์ ชื่อสาขา พื้นที่ สถานที่) แบรนด์ ประเภทร้าน และเลือกจังหวัด › อำเภอ › อปท. จาก disclosure พร้อมชิป; URL เก็บทุกสถานะ
- **3D:** มวลอาคารทั้งเมืองจาก OpenStreetMap เป็นบริบทเงียบ อปท./ย่านขนาดเล็กมีอาคารมุมโค้ง กล้องแบบโมเดลเมือง (FOV 14°) ปุ่ม 3D สลับเป็นแผนผัง

โครงสร้างหน้าจอยึด CityMETER production และ Luxury Brands: header 48 px แผนที่เต็ม viewport ที่เหลือ แผงขวา `min(max(300px, 28%), 440px)` และถาดกราฟซ้อนด้านล่างที่ย่อได้ (52 px) จอมือถือแนวตั้งใช้ bottom sheet ไม่เกิน 64dvh พร้อมการ์ด Aha ย่อบนแผนที่เมื่อแผงปิด

basemap ทั้งสองธีมสร้างเองใน `js/map-style.js` บน [OpenFreeMap](https://openfreemap.org/) vector tiles (OpenMapTiles schema, ข้อมูล OpenStreetMap) ด้วยสี `--basemap-*` ใน `assets/theme.css` โดยคง attribution ของ OpenFreeMap, OpenMapTiles และ OpenStreetMap

## Data and method

อ่าน [Product statement](PRODUCT_STATEMENT.md), [DATA_METHOD.md](DATA_METHOD.md) และ [หน่วยพื้นที่](docs/AREA_METHOD.md) ก่อนตีความผล จำนวนสาขาในข้อมูลไม่ใช่ส่วนแบ่งตลาด ยอดขาย กำลังซื้อ ความอิ่มตัว หรือความครบถ้วนของร้านขายของชำในไทย และ “ต่อ 1 หมื่นคน” เป็นอัตราส่วนกับประชากรตามทะเบียน ไม่ใช่คำกล่าวอ้างเรื่องพฤติกรรม

- Research master ใน Google Sheets (internal working reference; public demo data: [data/grocery.json](data/grocery.json), กระทบยอดใน [data/build-receipt.json](data/build-receipt.json))
- [CityMETER Grocery](https://landometer.com/v3/citymeter?d=grocery) และ API สาธารณะของ CityMETER (ยอด ประชากร ขอบเขต สมาชิกภาพ)
- หน้าค้นหาสาขาของแต่ละแบรนด์ (ลิงก์ต่อแถวใน `data/grocery.json → sources`)

## Assets and verification

ใช้ LDS **0.9.7 / v0.9.7-owner.1** (standalone-0.9.7-r1, color-srgb-10) พร้อม fonts และเฉพาะค่าที่หน้านี้ใช้จริง: foundation pairs, semantic states, map roles, data states, categorical series 1–10 ใน [assets/theme.css](assets/theme.css) และ LUT 41 ค่าของ `count` กับ `density.capita` ใน [js/scales.js](js/scales.js) (ไม่แนบคลัง LDS ทั้งชุด) ไฟล์ asset ของ LDS บันทึก byte length และ SHA-256 ใน [assets/manifest.json](assets/manifest.json) และทุกไฟล์ของ repository บันทึกใน `handoff/handoff-manifest.json` ของชุดส่งต่อ ผลตรวจ hash ไม่ใช่การรับรองว่า demo ผ่านการตรวจ UI หรือ production ต้องรายงานผลหน้าจอจริงแยก (ดู `handoff/VERIFICATION.md`)

โลโก้แบรนด์ 17 แบรนด์ (แหล่งทางการ 14, retailer/อ้างอิง 3) ฝังไบต์ต้นฉบับใน [assets/brand-logos.svg](assets/brand-logos.svg) ตัดเฉพาะขอบว่างรอบนอก ดู [manifest](assets/brand-logos-manifest.json) และ [catalog](data/brand-logos.json) โลโก้สถานที่ 128 ไฟล์ใน [assets/venue-logos/](assets/venue-logos/) ([ทะเบียน](data/venue-logos.json)) ทุกไฟล์ตรวจ sha256 ตรงกับชีต เครื่องหมายเป็นของเจ้าของ การแสดงเพื่อระบุตัวตนใน demo ไม่สื่อถึงการรับรองหรือสิทธิ์ใช้งานทั่วไป และ “สถานที่” คือชื่อที่สาขาอ้างถึง ไม่ใช่การยืนยันว่าร้านอยู่ภายใน

ไฟล์นี้เป็น research/demo snapshot ยังต้องจัดทำรอบอัปเดต การตรวจสถานะรายสาขา และสิทธิ์ข้อมูลก่อนยกระดับเป็น production dataset
