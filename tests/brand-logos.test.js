import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {configureBrandLogos, getBrandLogo, brandLogoMarkup, normalizeBrandLabel} from '../js/brand-logos.js';
import {readJSON} from './helpers.js';

const catalog = readJSON('data/brand-logos.json');
const grocery = readJSON('data/grocery.json');
const sprite = fs.readFileSync(new URL('../assets/brand-logos.svg', import.meta.url), 'utf8');
beforeEach(() => configureBrandLogos(catalog, grocery.brands.map(b => ({brand: b.name}))));

test('all 17 brands resolve to an approved identity by name and by id', () => {
  const coverage = configureBrandLogos(catalog, grocery.brands.map(b => ({brand: b.name})));
  assert.equal(coverage.complete, true);
  assert.equal(coverage.catalogBrands, 17);
  assert.deepEqual(coverage.missingBrands, []);
  for (const b of grocery.brands) { assert.equal(getBrandLogo(b.name)?.id, b.id); assert.equal(getBrandLogo(b.id)?.id, b.id); }
  assert.equal(getBrandLogo('Lotus’s')?.id, 'LOTUSS', 'typographic apostrophe normalises');
  assert.equal(getBrandLogo('7-Eleven Booth'), null, 'no partial matching');
  assert.equal(normalizeBrandLabel('  Big   C '), 'big c');
});

test('the sprite embeds each sheet file byte-for-byte (sha256 of the data URI = tab 01_BRANDS logo_sha256)', () => {
  assert.equal(crypto.createHash('sha256').update(sprite).digest('hex'), catalog.meta.spriteSHA256);
  for (const b of catalog.brands) {
    const symbol = sprite.match(new RegExp(`<symbol id="${b.spriteId}"[\\s\\S]*?</symbol>`))?.[0];
    assert.ok(symbol, b.id);
    const uri = symbol.match(/href="data:([^;]+);base64,([^"]+)"/);
    assert.equal(uri[1], b.mime);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(uri[2], 'base64')).digest('hex'), b.sourceSHA256, b.id);
    assert.match(symbol, new RegExp(`<rect width="320" height="160" fill="${b.background}"/>`));
    assert.ok(!/drive\.google|googleusercontent/.test(b.sourceURL + (b.assetURL || '')), 'no private Drive URLs');
  }
});

test('markup uses only the local sprite and stays inside the 320×160 symbol', () => {
  for (const b of grocery.brands) {
    const markup = brandLogoMarkup(b.name);
    const href = markup.match(/href="([^"]+)"/)[1];
    assert.ok(href.startsWith(`assets/brand-logos.svg?v=${catalog.meta.spriteRevision}#logo-`));
    const [x, y, w, h] = markup.match(/viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/).slice(1).map(Number);
    assert.ok(x >= 0 && y >= 0 && x + w <= 320.001 && y + h <= 160.001);
    assert.match(markup, /aria-hidden="true"/);
  }
  assert.match(brandLogoMarkup('Tops', {decorative: false}), /role="img" aria-label="โลโก้ Tops"/);
});
