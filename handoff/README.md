# เริ่มงานต่อ — CityMETER Grocery

รุ่นส่งต่อ 0.1 · ปรับล่าสุด 22 ตุลาคม 2569 · ข้อมูลตรวจถึง 22 ตุลาคม 2569

ชุดนี้ส่งต่อให้ developer หรือ coding agent พัฒนาต่อจาก repository ที่ใช้งานจริง หลักของรุ่นนี้คือ **ถามคำถามเดียว — ร้านกระจุกที่ไหนเมื่อเทียบกับคน — ได้ทุกระดับพื้นที่ของ production** (ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน) ด้วยตัวเลขที่ตรงกับ CityMETER แสดงรายละเอียดเฉพาะส่วนที่ focus ส่วนอื่นให้เงียบ และทำให้ Product Statement เป็น winning strategy ที่ทุกส่วนของผลิตภัณฑ์ต้องรับใช้ โครงสร้างทั้งหมดยกมาจาก CityMETER Luxury Brands 0.5

Live: [Grocery](https://montri-th.github.io/grocery/) · Source: [GitHub](https://github.com/montri-th/grocery)

## อ่านตามลำดับนี้

| คนอ่าน | เครื่องอ่าน | ใช้ทำอะไร |
|---|---|---|
| [../PRODUCT_STATEMENT.md](../PRODUCT_STATEMENT.md) | [product-statement.json](product-statement.json) | Winning strategy: Who / What / Which / How, quality bar, ป้ายหลักฐาน, hypotheses — อ่านก่อนเปลี่ยนสิ่งที่หน้าแรกบอก |
| [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) | [product-brief.json](product-brief.json) | การตัดสินใจของเจ้าของ, ลำดับชั้นพื้นที่ + membership, ขอบเขตข้อมูลสามชั้น + focus modes, Aha “สาขากระจุกเทียบคน”, ตัวชี้วัดและสี, focus/quiet, basemap, มวลอาคาร, กล้อง, breadcrumb, แผงสี่โหมด, กราฟ, โลโก้, invariants INV01–INV23 |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | [implementation-plan.json](implementation-plan.json) | โมดูลและข้อต่อ, สายการสร้างข้อมูล, งาน P01–P12, backlog N01–N14, acceptance AC01–AC24, วิธีทดสอบและ release |
| [VERIFICATION.md](VERIFICATION.md) | [handoff-manifest.json](handoff-manifest.json) | ผลตรวจแยกระดับ (unit / rendered / live) และ hash ของทุกไฟล์ |
| README นี้ | [handoff.schema.json](handoff.schema.json) | สัญญาโครงสร้างของ JSON ทั้งสี่ (schema 1.0.0) |

`product-statement.json`, `product-brief.json` และ `implementation-plan.json` เขียนด้วยมือและต้องแก้คู่กับ Markdown ส่วน `handoff-manifest.json` สร้างด้วย `npm run handoff:manifest` เท่านั้นและไม่ถูก track ใน git (อยู่ใน bundle ที่ `source/handoff/handoff-manifest.json`) ห้ามแก้ hash ด้วยมือ

ใช้ [DATA_METHOD.md](../DATA_METHOD.md), [AREA_METHOD.md](../docs/AREA_METHOD.md), [CHART_SELECTION.md](../docs/CHART_SELECTION.md), [BUILD_CARD.md](../docs/BUILD_CARD.md) และ `data/build-receipt.json` เป็นบริบทผลิตภัณฑ์และข้อมูล

## เปิดในเครื่อง

```sh
npm start      # http://127.0.0.1:4173/
npm test       # 65 unit tests บนข้อมูลจริงและ fixtures
```

เป็น static site ไม่มี build step ไม่ต้อง `npm install` ต้องมี Node ≥ 20 และ Python 3 แผนที่ต้องเข้าถึง unpkg.com (MapLibre) และ tiles.openfreemap.org (tiles + glyphs; basemap สร้างเองใน `js/map-style.js`) ส่วนกราฟไม่ใช้ไลบรารีภายนอก ถ้าเครื่องทดสอบถูกบล็อก ใช้ harness แบบ stub tiles ใน VERIFICATION การเปิด `index.html` เป็นไฟล์โดยตรงจะนำไปเว็บสาธารณะ

## สิ่งที่ห้ามทำหล่น

- ลำดับชั้นและ key เป็นของ production: `province` = ตัวย่อ (BKK), `district` = รหัส 4 หลัก, `unit` = รหัส DOLA หรือ uuid ของ Locale; ห้ามสร้างพื้นที่ ขอบเขต หรือ id เอง
- สมาชิกภาพเป็นของ production (อำเภอจากตำบลของแหล่งข้อมูล, อปท./ย่านจาก overlay) — ห้ามแทนด้วย point-in-polygon; สร้างใหม่ด้วย `scripts/build-data.py` ซึ่งหยุดเมื่อยอดไม่ตรง API
- Aha “สาขากระจุกเทียบคน” คำนวณใหม่ทุกระดับและทุกตัวกรอง: ตัวเศษเป็น union (สาขาในสองพื้นที่นับครั้งเดียว) ส่วนแบ่งคนแสดงเฉพาะเมื่อทุกพื้นที่ย่อยมีประชากร; ตัวเลขใน JSON เป็น fixture ไม่ใช่ค่าคงที่
- ประชากรที่ไม่มีคือไม่มีข้อมูล ไม่ใช่ศูนย์ และไม่ประมาณ
- ขอบเขตข้อมูลสามชั้น: `filtered` ขับจุด Aha choropleth กราฟ; `scopeRows` ขับตัวเลขของพื้นที่; `rows` ขับหมุด ตาราง ตัวนับ
- focus + quiet: ส่วนที่โฟกัสมีสี ป้าย จุดสีประเภท หมุด/โลโก้ (z ≥ 14); ส่วนอื่นเป็นเส้นขอบ ป้ายจาง จุดเทาไม่มีโลโก้และไม่อยู่ใน tab order
- สีข้อมูล: LDS `count` / `density.capita` quantile บนค่าที่ปัด HEX เดียวกันสองธีม; measured_zero ≠ no_data ≠ out_of_scope; legend บอกตัวหาร
- หนึ่งแถวต่อหนึ่งจุด ไม่มี cluster พิกัดเดิม; หมุด ≤ 450 โลโก้ ≤ 250 เฉพาะ zoom ≥ 14 ในโฟกัส
- breadcrumb ประเทศไทย › จังหวัด › อำเภอ/เขต › อปท./ย่าน › สถานที่; ร้านไม่ใช่ crumb; ลิงก์ production ออกไปเท่านั้น
- สถานะ “อยู่ในรายการสาขาของแบรนด์” — ห้ามเขียนว่าเปิดอยู่หรือสร้างสถานะปิดเอง; สถานที่คือชื่อที่สาขาอ้างถึง ไม่ใช่ “อยู่ภายใน”
- ไม่มี Caveats/Research badge/CSV ใน UI; แหล่งข้อมูล วันที่ และความแม่นพิกัดอยู่ในรายละเอียดสาขา
- LDS 0.9.7 tokens เท่านั้น; ไอคอน nav-7 FILL 0 / wght 300; pictogram 9 glyph เป็นข้อยกเว้นทดลอง; ไม่มี decorative bracket หรือ colored left rail; focus ring มองเห็น; reduced motion
- ข้อมูลหลักต้องใช้ได้เมื่อแผนที่ไม่พร้อม; มี loading/slow/error/retry ที่ใช้งานได้

## เริ่มด้วยงานหนึ่งชิ้น

ใช้คำสั่งตั้งต้นนี้กับ coding agent แล้วแทน `Nxx` ด้วยงานใน backlog (หรือระบุงานใหม่):

```text
อ่าน AGENTS.md, PRODUCT_STATEMENT.md, handoff/PRODUCT_BRIEF.md และ handoff/product-brief.json
ทำเฉพาะงาน Nxx ใน handoff/IMPLEMENTATION_PLAN.md
ตรวจ source และสถานะจริงก่อนแก้ อย่าถือว่าทำเสร็จแล้ว
คงลำดับชั้นและ key ของ production, membership จาก production, ขอบเขตข้อมูลสามชั้น (filtered / scopeRows / rows) และ focus modes, Aha ทุกระดับ, focus + quiet, สีและ class ของ LDS, breadcrumb, source data, identities, coordinates และ LDS tokens
เพิ่มหรือปรับ tests ใน tests/ สำหรับพฤติกรรมที่เปลี่ยน แล้วตรวจ browser ที่ 390 และ 1280 ทั้งสองธีม
ส่งรายการไฟล์ที่แก้ ผลตรวจที่ทำจริง และประเด็นที่ยังไม่ยืนยัน
อย่าเปลี่ยนสูตร metric, การนับสมาชิก, taxonomy หรือสีข้อมูลเงียบ ๆ และอย่ารายงานว่าเผยแพร่แล้วจากผลในเครื่อง (ใช้ npm run verify:live)
```

## ตรวจความครบก่อนรับช่วง

1. `RELEASE_RECEIPT.json` ใน bundle ระบุ commit ที่เผยแพร่ ให้ `git checkout <commit>` แล้วเทียบ `handoff/handoff-manifest.json` กับไฟล์จริง (`npm run handoff:manifest` ต้องให้ hash เดิมบน working tree ที่สะอาด)
2. `npm test` ต้องผ่าน 65/65
3. `npm run verify:live` ต้องผ่านทุกไฟล์ที่เผยแพร่ (ดู `evidence/live-attestation-*.json` ใน bundle สำหรับผลตอนส่งมอบ)
4. เปิด 390 px และ desktop ทั้งสองธีม ไล่ flow: Aha ประเทศ → ดูทุกจังหวัด → ต่อ 1 หมื่นคน → จังหวัด → อำเภอ → อปท./ย่าน → ซูม 14 (หมุด + โลโก้) → สาขา → สถานที่ → breadcrumb ขึ้นทีละระดับ → กราฟสามมุมมอง → ตาราง → help

ชุดส่งต่อเผยแพร่เฉพาะ source/data/assets ที่อยู่ใน repository และบทสรุปประยุกต์ ไม่แนบ private Drive/Sheet URLs, credentials, brief ภายในฉบับเต็ม, ข้อมูลดิบ หรือ LDS/token library ทั้งชุด
