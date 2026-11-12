/**
 * The search box of CityMETER · Grocery (0.5.0; owner 2026-11-12 12:05, VERBATIM: “ศึกษาแนวคิดเรื่อง Fuzzy search แล้ว
 * implement กับ demo web ให้ได้ user benefit สูงสุดตาม user intent ในขณะนั้น และตาม product statement”): the names
 * js/find.js gives js/shell/fuzzy.js, read from the shipped data, and what a name typed opens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {realModel} from './helpers.js';
import {createIndex, key1, STEP} from '../js/shell/fuzzy.js';
import {SEARCH_KINDS, SEARCH_HEADS, SEARCH_HINT, searchEntries, searchNote, storeTitle} from '../js/find.js';

let built = null;
function index() {
  if (!built) {
    const model = realModel();
    const idx = createIndex({kinds: SEARCH_KINDS, heads: SEARCH_HEADS});
    idx.addAll(searchEntries(model));
    built = {idx, model};
  }
  return built;
}
const top = (result, n = 5) => result.items.slice(0, n).map(i => `${i.entry.kind}:${i.entry.id}`);

test('every place, filter, hosting place and store of the data can be found by name', () => {
  const {idx, model} = index();
  const entries = [...searchEntries(model)];
  const nameless = entries.filter(e => !key1(e.name || '') && !key1(e.nameEn || '')).length;
  assert.ok(idx.size > 30000 && entries.length - idx.size <= nameless, `${idx.size} of ${entries.length} entries: only one whose name has no letter (${nameless}) is left out`);
  assert.deepEqual([...new Set(entries.map(e => e.kind))].sort(), SEARCH_KINDS.map(k => k.id).sort(), 'every kind the list names has entries');
  assert.equal(entries.filter(e => e.kind === 'store').length, model.rows.length, 'every store');
  // A store typed as the page lists it is on the first screens of results.
  const rows = entries.filter(e => e.kind === 'store').filter((_, i) => i % 911 === 0);
  let missed = 0;
  for (const e of rows) if (!idx.search(e.name, {province: e.province}).items.slice(0, 40).some(i => i.entry.kind === 'store' && i.entry.id === e.id)) missed++;
  assert.equal(missed, 0, `${rows.length} typed as listed`);
});

test('a name typed opens the level that asks the question again: a place before a store, one exact place chosen ahead', () => {
  const {idx, model} = index();
  let r = idx.search('จ.ภูเก็ต');
  assert.deepEqual([top(r, 1)[0], r.preselect?.kind, r.total], ['province:PKT', 'province', 1]);
  assert.equal(top(idx.search('phuket'), 1)[0], 'province:PKT');
  r = idx.search('อ.หาดใหญ่');
  assert.deepEqual([top(r, 1)[0], r.preselect?.id], ['district:9011', '9011']);
  r = idx.search('หาดใหญ่ สงขลา');
  assert.deepEqual([top(r, 1)[0], r.items[0].step], ['district:9011', STEP.within]);
  r = idx.search('โคราช');
  assert.deepEqual([top(r, 1)[0], r.items[0].matched], ['province:NMA', 'โคราช']);
  // An อปท. by the name it is listed under, by its full word, or by its own name alone.
  const hatyai = model.units.find(u => u.prefix === 'ทน.' && u.name === 'หาดใหญ่');
  for (const typed of ['ทน.หาดใหญ่', 'เทศบาลนครหาดใหญ่']) {
    r = idx.search(typed);
    assert.deepEqual([top(r, 1)[0], r.preselect?.id], [`unit:${hatyai.key}`, hatyai.key], typed);
  }
  r = idx.search('หาดใหญ่');
  assert.deepEqual([top(r, 2), r.preselect?.id], [['district:9011', `unit:${hatyai.key}`], '9011'], 'the อำเภอ is written so and is chosen ahead; the city goes by the name too and is the next row');
  r = idx.search('บ้านเก่า');
  assert.ok(r.items.slice(0, 3).every(i => i.entry.kind === 'unit' && i.step === STEP.name) && r.preselect === null, 'three อบต. go by the name: the reader says which');
  // A Bangkok ย่าน, with its lead word.
  r = idx.search('ย่านอารีย์');
  assert.deepEqual([r.items[0].entry.kind, r.items[0].entry.name, r.preselect?.kind], ['locale', 'อารีย์', 'locale']);
  // A brand, a store type and a store format are filters.
  r = idx.search('7-eleven');
  assert.deepEqual([top(r, 1)[0], r.preselect?.kind], ['brand:SEVEN_ELEVEN', 'brand']);
  r = idx.search('สะดวกซื้อ');
  assert.deepEqual([top(r, 1)[0], r.preselect?.kind], ['type:C_STORE', 'type']);
  r = idx.search('tops daily');
  assert.deepEqual([r.items[0].entry.kind, r.items[0].entry.name, r.preselect?.kind], ['format', 'Tops Daily', 'format']);
  r = idx.search('big c');
  assert.deepEqual([r.items.slice(0, 2).map(i => i.entry.kind), r.preselect], [['brand', 'format'], null], 'a brand and a format share the name: the reader says which');
  // A place that hosts stores, and a store: never chosen ahead.
  r = idx.search('siam paragon');
  assert.deepEqual([r.items[0].entry.kind, r.preselect], ['venue', null]);
  r = idx.search('makro samsen');
  assert.deepEqual([r.items[0].entry.kind, r.items[0].entry.name, r.preselect], ['store', 'Makro Samsen', null]);
});

test('a store is named as the page lists it: the brand, then the branch', () => {
  assert.equal(storeTitle({brand: '7-Eleven', name: 'ถนนข้าวสาร'}), '7-Eleven ถนนข้าวสาร');
  assert.equal(storeTitle({brand: 'Big C', name: 'BigC มหาสารคาม'}), 'BigC มหาสารคาม', 'a branch name that begins with the brand is left as it is');
  assert.equal(storeTitle({brand: 'MaxValu', name: 'MaxValue หลักสี่'}), 'MaxValue หลักสี่');
  assert.equal(storeTitle({brand: "Lotus's", name: 'โลตัส โก เฟรช แยกพิชัย'}), "Lotus's โลตัส โก เฟรช แยกพิชัย");
  const {idx} = index();
  const r = idx.search('7-eleven ถนนข้าวสาร');
  assert.ok(r.items[0]?.entry.kind === 'store' && r.items[0].entry.name.startsWith('7-Eleven ถนนข้าวสาร'), r.items[0]?.entry.name);
});

test('a name typed another way is still found, and a guess is said to be one', () => {
  const {idx} = index();
  let r = idx.search('เชียงใหม');
  assert.deepEqual([top(r, 1)[0], r.items[0].show], ['province:CMI', 'spelling']);
  r = idx.search('จ.เชียงหใม่');
  assert.deepEqual([top(r, 1)[0], r.items[0].show, r.preselect], ['province:CMI', 'near', null]);
  r = idx.search("g=up'.s,j");
  assert.deepEqual([r.layout, top(r, 1)[0], r.items[0].show, r.preselect], ['เชียงใหม่', 'province:CMI', 'near', null]);
  assert.equal(idx.search('zzzzqqqq').total, 0);
});

test('the list says what an entry is and where, and the page opens every kind it lists', () => {
  const {idx, model} = index();
  const note = entry => searchNote(entry, model);
  const of = (typed, kind) => idx.search(typed).items.find(i => i.entry.kind === kind).entry;
  assert.equal(note(of('ภูเก็ต', 'province')), 'จังหวัด');
  assert.equal(note(of('อ.หาดใหญ่', 'district')), 'อำเภอ · สงขลา');
  assert.equal(note(of('เขตปทุมวัน', 'district')), 'เขต · กรุงเทพมหานคร');
  assert.equal(note(of('ทน.หาดใหญ่', 'unit')), 'เทศบาลนคร · หาดใหญ่ · สงขลา');
  assert.equal(note(of('ย่านอารีย์', 'locale')), 'ย่าน · พญาไท · กรุงเทพมหานคร');
  assert.equal(note(of('7-eleven', 'brand')), 'แบรนด์');
  assert.equal(note(of('สะดวกซื้อ', 'type')), 'ประเภทร้าน');
  assert.equal(note(of('tops daily', 'format')), 'รูปแบบร้าน');
  assert.equal(note(of('siam paragon', 'venue')), 'ศูนย์การค้า · ปทุมวัน · กรุงเทพมหานคร');
  assert.equal(note(of('makro samsen', 'store')), 'ค้าส่ง · ดุสิต · กรุงเทพมหานคร');
  // A row names what it is and where: no number of its own, no caveat, nothing left empty.
  let seen = 0;
  for (const e of searchEntries(model)) {
    if ((e.kind === 'store' || e.kind === 'unit' || e.kind === 'venue') && seen++ % 97) continue;
    const line = note(e);
    assert.ok(line && !/ไม่ใช่|อาจ|ยังไม่ได้/.test(line.split(' · ')[0]) && !/ ·  ·|^ · | · $/.test(line), `${e.kind} ${e.name}: ${line}`);
  }
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  for (const k of SEARCH_KINDS) assert.ok(app.includes(`entry.kind === '${k.id}'`), `js/app.js opens a ${k.id}`);
  assert.ok(SEARCH_HINT.startsWith('ลอง'));
  // The page keeps the words of the text filter as it always did (js/model.js#filterRows reads every word).
  assert.ok(app.includes("f === 'search' && !state.finder ? 200 : 0"), 'without the list the box filters as it is typed in');
});
