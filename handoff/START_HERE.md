# CityMETER Grocery — Developer Handoff

รุ่นเผยแพร่ 0.2 · 22 ต.ค. 2569 (รอบสอง) · ข้อมูลตรวจถึง 22 ต.ค. 2569

เริ่มอ่าน `source/handoff/README.md` จากนั้น Product Statement (`source/PRODUCT_STATEMENT.md` + `source/handoff/product-statement.json`), Product Brief และ Implementation Plan ในโฟลเดอร์ `source/handoff` ทั้ง `.md` และ `.json` ใช้คู่กัน

เข้าโฟลเดอร์ `source` แล้วรัน `npm test` และ `npm start` เปิด http://127.0.0.1:4173/

ชุดนี้มี source code (ES modules อ่านง่าย มีคอมเมนต์สัญญาทุกโมดูล), datasets (27,607 สาขา, 8,621 อปท./ย่าน พร้อม receipt กระทบยอดกับ production), verified assets (โลโก้แบรนด์ 17 + สถานที่ 128, sha256 ตรงชีต), 151 unit tests, rendered QA harness (`scripts/qa/`), JSON Schema 1.1.0, acceptance criteria AC01–AC33, task card สำหรับ coding agent, สคริปต์สร้างข้อมูล/manifest/bundle และตรวจ live bytes อ่าน `source/AGENTS.md` ก่อนแก้ไข

สถาปัตยกรรมยกจาก CityMETER Luxury Brands 0.5 (https://montri-th.github.io/luxurybrands/) เปลี่ยนหน่วยพื้นที่เป็นลำดับชั้นของ production (เจ้าของเลือก “A+อปท”) และ Aha เป็น “สาขากระจุกเทียบคน” (30% ของสาขาอยู่ใน 3 จังหวัด ซึ่งมีคนแค่ 13% ของประเทศ) รุ่น 0.2 เพิ่มระดับสถานที่และมุมสถาปนิกแบบเดียวกับ Luxury Brands และใช้สเกลสีครบ 41 ขั้นของ LDS ทุกจุด

เว็บจริง: https://montri-th.github.io/grocery/
Repository: https://github.com/montri-th/grocery

`RELEASE_RECEIPT.json` ผูกชุดส่งต่อกับ commit, ผล GitHub Pages และ live attestation ส่วน `evidence/` เป็นหลักฐานหน้าจอ (harness และ live) และผลเทียบ hash ของไฟล์บนเว็บ แยกจาก source ที่ commit แล้ว
