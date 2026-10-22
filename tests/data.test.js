import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {realModel, readJSON} from './helpers.js';
import {PICTOGRAM_CONTRACT, NAV_ICON_CONTRACT} from '../js/navigation.js';

const m = realModel();

test('every province has a geometry file holding all its districts and local units', () => {
  const frames = readJSON('data/geo/provinces.json');
  assert.equal(frames.features.length, 77);
  assert.ok(frames.features.every(f => m.provinceByCode.has(f.id)));
  for (const p of m.provinces) {
    const fc = readJSON(`data/geo/p/${p.code}.json`);
    const d = new Set(fc.features.filter(f => f.properties.l === 'd').map(f => f.properties.k));
    const u = new Set(fc.features.filter(f => f.properties.l === 'u').map(f => f.properties.k));
    for (const di of m.districtsOf[p.index]) assert.ok(d.has(m.districts[di].code), `${p.code} district ${m.districts[di].code}`);
    for (const di of m.districtsOf[p.index]) for (const ui of m.unitsOf[di]) assert.ok(u.has(m.units[ui].key), `${p.code} unit ${m.units[ui].key}`);
    for (const f of fc.features.filter(x => x.properties.l === 'u')) {
      assert.equal(f.properties.c.length, 2, 'label point');
      assert.equal(f.properties.b.length, 4, 'bbox');
    }
    assert.ok(Array.isArray(p.bbox) && Array.isArray(p.label));
  }
});

test('every store has a detail record (full source uuid, address, source tile) in its province file', () => {
  const byProvince = new Map();
  for (const r of m.rows) {
    const code = m.provinces[r.p].code;
    if (!byProvince.has(code)) byProvince.set(code, readJSON(`data/detail/${code}.json`));
    const d = byProvince.get(code);
    const rec = d.rows[r.key];
    assert.ok(rec, r.key);
    assert.ok(rec[0].replace(/-/g, '').startsWith(r.key), 'short key = first 8 hex digits of the uuid');
    assert.match(rec[4], /^\d+\/\d+$/, 'z10 tile x/y');
  }
  const blank = m.rows.filter(r => r.flags & 2).length;
  assert.equal(blank, 178, 'blank source addresses stay blank (sheet audit A07)');
});

test('pictogram and nav-7 icon fonts are the files their contracts name', () => {
  for (const c of [PICTOGRAM_CONTRACT, NAV_ICON_CONTRACT]) {
    const bytes = fs.readFileSync(new URL(`../${c.file}`, import.meta.url));
    assert.equal(bytes.length, c.bytes, c.file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), c.sha256, c.file);
  }
  const manifest = readJSON('assets/icons/material-pictogram-300.json');
  for (const [role, g] of Object.entries(manifest.glyphs)) assert.equal(PICTOGRAM_CONTRACT.glyphs[role].codePointAt(0).toString(16).toUpperCase(), g.codepoint.slice(2), role);
});

test('no private Drive or Sheet link is shipped (data, docs, handoff, code)', () => {
  const root = new URL('../', import.meta.url);
  const skip = new Set(['node_modules', '.git', 'dist', 'evidence', '.handoff-stage']);
  const files = [];
  const walk = rel => {
    for (const e of fs.readdirSync(new URL(rel, root), {withFileTypes: true})) {
      if (skip.has(e.name)) continue;
      const path = `${rel}${e.name}`;
      if (e.isDirectory()) walk(`${path}/`);
      else if (/\.(json|md|html|js|mjs|py|css|txt)$/.test(e.name)) files.push(path);
    }
  };
  walk('');
  assert.ok(files.length > 50);
  // Actual links only (the logo build scripts keep a bare-domain guard list that rejects such URLs).
  const privateLink = /https?:\/\/(docs\.google\.com\/(spreadsheets|document|file)|drive\.google\.com\/|drive\.usercontent\.google\.com\/|sheets\.google\.com\/)/i;
  for (const f of files) assert.doesNotMatch(fs.readFileSync(new URL(f, root), 'utf8'), privateLink, f);
});
