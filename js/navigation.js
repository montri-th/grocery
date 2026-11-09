/**
 * This demo's navigation on the shared header code: the titles of its controls and its pictogram subset. The
 * nav-7 glyphs and the help dialog are js/shell/navigation.js, the dataset picker js/shell/header.js
 * (citymeter-shell: edit those in every repository at once, js/shell/manifest.json).
 */
import {installNavigation, NAV_GLYPHS, NAV_ICON_CONTRACT} from './shell/navigation.js';
import {installHeader} from './shell/header.js';

export {NAV_GLYPHS, NAV_ICON_CONTRACT};

/**
 * Metric-tile pictograms (test exception approved by the owner 2026-10-22 for
 * CityMETER Luxury Brands; re-cut for Grocery from npm material-symbols@0.27.0).
 * Same family and axes as nav-7, a separate subset so the approved nav-7 bytes
 * stay unchanged. Roles → glyphs: brand shopping_basket · store storefront ·
 * venue pin_drop · area map · province location_city · district domain ·
 * population groups · capita person · type category.
 */
export const PICTOGRAM_CONTRACT = Object.freeze({
  family: 'LDS Material Symbols Rounded Pictogram',
  file: 'assets/icons/material-pictogram-300.woff2', bytes: 1936,
  sha256: '6a7584bdd72ea1d1c95af1f098661eff4a2c51c5eec6a911f9b3913228792c9f',
  manifest: 'assets/icons/material-pictogram-300.json',
  axes: Object.freeze({FILL: 0, wght: 300, GRAD: 0, opsz: 24}),
  glyphs: Object.freeze({brand: '\uE8CB', store: '\uEA12', venue: '\uE55E', area: '\uE55B', province: '\uE7F1', district: '\uE7EE', population: '\uF233', capita: '\uE7FD', type: '\uE574'}),
  status: 'test exception to LDS nav-7 (owner 2026-10-22; Luxury Brands → Grocery)',
  fallback: 'Text labels carry the meaning; pictograms stay hidden until the font has loaded.',
});
const TITLES = {
  'fit-map': 'ปรับแผนที่ให้เห็นพื้นที่ที่เลือกทั้งหมด',
  'country-map': 'กลับไปดูทั้งประเทศ',
  'bangkok-map': 'ไปที่กรุงเทพมหานคร',
  'toggle-3d': 'สลับมุมมอง 3 มิติ (อาคารทั้งเมือง) กับแผนผัง 2 มิติ',
  'toggle-eye': 'มุมสถาปนิก: เปอร์สเปกทีฟ 2 จุดที่ระดับสถานที่ อาคารรอบข้างจางลง อาคารที่บังสถานที่โปร่งใส',
  'toggle-areas': 'แสดงหรือซ่อนสีและขอบเขตพื้นที่',
  'mobile-panel': 'เปิดแผงข้อมูลและตัวกรอง',
  'open-help': 'เปิดวิธีใช้',
  'toggle-insights': 'เปิดหรือย่อกราฟเปรียบเทียบพื้นที่',
  'open-table': 'เปิดตารางสาขาตามตัวกรอง',
  'toggle-table': 'ปิดตารางและกลับไปแผนที่',
  'search': 'ค้นหาแบรนด์ สาขา สถานที่ อำเภอ อปท. หรือจังหวัด',
  'brand': 'เลือกแบรนด์',
  'type': 'เลือกประเภทร้าน',
  'province': 'เลือกจังหวัด',
  'district': 'เลือกอำเภอหรือเขต',
  'unit': 'เลือก อปท. หรือย่าน',
  'prev-page': 'ดูหน้าก่อนหน้าของตาราง',
  'next-page': 'ดูหน้าถัดไปของตาราง',
  'tab-ranking': 'เปรียบเทียบส่วนแบ่งสาขากับส่วนแบ่งประชากรของพื้นที่ย่อย',
  'tab-mix': 'ประเภทร้านในแต่ละพื้นที่ย่อย',
  'tab-brands': 'แบรนด์ในแต่ละพื้นที่ย่อย',
};

if (typeof document !== 'undefined') {
  installNavigation({titles: TITLES, pictogramProbe: PICTOGRAM_CONTRACT.glyphs.store});
  installHeader();
}
