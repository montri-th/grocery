import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {configureBrandLogos, getBrandLogo, getFormatLogo, brandLogoMarkup, normalizeBrandLabel} from '../js/brand-logos.js?v=20261025-fp1';
import {readJSON} from './helpers.js';

const catalog = readJSON('data/brand-logos.json');
const grocery = readJSON('data/grocery.json');
const manifest = readJSON('assets/brand-logos-manifest.json');
const baseline = readJSON('tests/fixtures/brand-logos-baseline-2026-10-22.json');
const sprite = fs.readFileSync(new URL('../assets/brand-logos.svg', import.meta.url), 'utf8');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const symbolFor = id => sprite.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`))?.[0];
beforeEach(() => configureBrandLogos(catalog, grocery.brands.map(b => ({brand: b.name}))));

test('catalog brands resolve by name and id while source baseline identities stay intact', () => {
  const coverage = configureBrandLogos(catalog, grocery.brands.map(b => ({brand: b.name})));
  assert.equal(coverage.complete, true);
  assert.equal(coverage.catalogBrands, catalog.brands.length);
  assert.equal(catalog.meta.count, catalog.brands.length);
  assert.equal(catalog.brands.length, baseline.count, 'Foodplace is a subformat, not another brand');
  assert.equal(coverage.catalogFormats, catalog.formats.length);
  assert.equal(catalog.meta.formatCount, catalog.formats.length);
  assert.equal(grocery.brands.length, baseline.count);
  assert.deepEqual(coverage.missingBrands, []);
  for (const b of catalog.brands) { assert.equal(getBrandLogo(b.name)?.id, b.id); assert.equal(getBrandLogo(b.id)?.id, b.id); }
  for (const b of grocery.brands) assert.equal(getBrandLogo(b.name)?.id, b.id, 'baseline source identity unchanged');
  const refreshed = configureBrandLogos(catalog, [...grocery.brands.map(b => ({brand: b.name})), {brand: 'Big C', formatLogoKey: 'BIG_C_FOODPLACE'}]);
  assert.equal(refreshed.complete, true);
  assert.equal(refreshed.matchedIdentities, catalog.brands.length);
  assert.equal(getBrandLogo('BIG_C_FOODPLACE'), null, 'format key never becomes a brand identity');
  assert.equal(getBrandLogo('Big C Foodplace'), null);
  assert.equal(getFormatLogo('BIG_C_FOODPLACE')?.parentBrandId, 'BIG_C');
  assert.equal(getBrandLogo('Big C')?.id, 'BIG_C', 'Foodplace does not replace generic Big C');
  assert.equal(getBrandLogo('Big C Bangkok Marché'), null, 'local-concept alias needs a deliberate identity mapping');
  assert.equal(getBrandLogo('Lotus’s')?.id, 'LOTUSS', 'typographic apostrophe normalises');
  assert.equal(getBrandLogo('7-Eleven Booth'), null, 'no partial matching');
  assert.equal(normalizeBrandLabel('  Big   C '), 'big c');
});

test('the sprite embeds each catalog artwork byte-for-byte', () => {
  assert.equal(sha256(sprite), catalog.meta.spriteSHA256);
  for (const b of [...catalog.brands, ...catalog.formats]) {
    const symbol = symbolFor(b.spriteId);
    assert.ok(symbol, b.id);
    const uri = symbol.match(/href="data:([^;]+);base64,([^"]+)"/);
    assert.equal(uri[1], b.mime);
    assert.equal(sha256(Buffer.from(uri[2], 'base64')), b.sourceSHA256, b.id);
    assert.match(symbol, new RegExp(`<rect width="320" height="160" fill="${b.background}"/>`));
    assert.ok(!/drive\.google|googleusercontent/.test(b.sourceURL + (b.assetURL || '')), 'no private Drive URLs');
  }
});

test('all 17 approved baseline records, provenance and sprite definitions are unchanged', () => {
  assert.equal(baseline.count, baseline.brands.length);
  for (const b of baseline.brands) {
    const record = catalog.brands.find(x => x.id === b.id);
    const source = manifest.files.find(x => x.brand === b.id);
    assert.equal(sha256(JSON.stringify(record)), b.catalogRecordSHA256, `${b.id} catalog metadata`);
    assert.equal(sha256(JSON.stringify(source)), b.manifestRecordSHA256, `${b.id} source metadata`);
    assert.equal(sha256(symbolFor(b.spriteId)), b.symbolSHA256, `${b.id} exact symbol definition`);
    assert.equal(record.sourceSHA256, b.sourceSHA256, `${b.id} original artwork`);
  }
});

test('Foodplace embeds the verified local SVG and separates its derivative hash from the 2023 PDF', () => {
  const record = catalog.formats.find(b => b.id === 'BIG_C_FOODPLACE');
  const source = manifest.formatFiles.find(b => b.format === record.id);
  const bytes = fs.readFileSync(new URL('../assets/brand-logos/big_c_foodplace.svg', import.meta.url));
  const embedded = Buffer.from(symbolFor(record.spriteId).match(/href="data:image\/svg\+xml;base64,([^"]+)"/)[1], 'base64');
  assert.deepEqual(embedded, bytes);
  assert.equal(sha256(bytes), record.sourceSHA256);
  assert.equal(record.sourceSHA256, source.sha256);
  assert.equal(record.derivativeSHA256, source.derivativeSHA256);
  assert.equal(record.derivativeSHA256, record.sourceSHA256);
  assert.notEqual(record.sourceDocumentSHA256, record.derivativeSHA256);
  assert.equal(record.sourceDocumentSHA256, '28db6a6108833e36c0637341dcb5d733024a1a86d6decd2534ca9116b400a860');
  assert.equal(record.sourceDocumentPeriod, '3Q2023');
  assert.equal(record.retrievedOn, '2026-10-25');
  assert.equal(record.extraction.page, 35);
  assert.equal(record.extraction.locator, 'Resources/XObject/Meta978');
  assert.equal(record.artifactKind, 'official_source_derivative');
  assert.equal(record.sourceKind, 'official_brand');
  assert.equal(record.parentBrandId, 'BIG_C');
  assert.equal(record.entityType, 'retail_subformat');
  assert.equal(manifest.count, baseline.count);
  assert.equal(manifest.files.length, baseline.count);
  assert.equal(manifest.formatCount, catalog.formats.length);
  assert.equal(source.status, 'official_source_derivative');
  assert.equal(record.background, '#FFFFFF', 'black place lettering keeps a light backing in both themes');
  assert.deepEqual(record.viewportCrop, {x: 0, y: 0, width: 73.56, height: 30}, 'full original export canvas');
  assert.doesNotMatch(bytes.toString(), /<script\b|<foreignObject\b|\son\w+\s*=|(?:href|src)="(?:https?:|file:|\/\/)|@import/i);
});

test('Foodplace artwork is selected only for its Big C parent, by name or id', () => {
  assert.match(brandLogoMarkup('Big C', {formatLogoKey: 'BIG_C_FOODPLACE'}), /#logo-big_c_foodplace/);
  assert.match(brandLogoMarkup('BIG_C', {formatLogoKey: 'BIG_C_FOODPLACE'}), /#logo-big_c_foodplace/);
  assert.match(brandLogoMarkup('Big C', {formatLogoKey: 'unknown'}), /#logo-big_c"/);
  assert.match(brandLogoMarkup('Tops', {formatLogoKey: 'BIG_C_FOODPLACE'}), /#logo-tops/);
  assert.doesNotMatch(brandLogoMarkup('Tops', {formatLogoKey: 'BIG_C_FOODPLACE'}), /#logo-big_c_foodplace/);
  assert.equal(brandLogoMarkup('unknown', {formatLogoKey: 'BIG_C_FOODPLACE'}), '');
  assert.match(brandLogoMarkup('Big C', {formatLogoKey: 'BIG_C_FOODPLACE', decorative: false}), /role="img" aria-label="โลโก้ Big C Foodplace"/);
  const bad = structuredClone(catalog);
  bad.formats[0].parentBrandId = 'unknown';
  const coverage = configureBrandLogos(bad);
  assert.equal(coverage.complete, false);
  assert.equal(coverage.catalogBrands, baseline.count);
  assert.equal(getFormatLogo('BIG_C_FOODPLACE'), null, 'unapproved parent cannot claim format artwork');
});

test('markup uses only the local sprite and stays inside the 320×160 symbol', () => {
  for (const b of catalog.brands) {
    const markup = brandLogoMarkup(b.name);
    const href = markup.match(/href="([^"]+)"/)[1];
    assert.ok(href.startsWith(`assets/brand-logos.svg?v=${catalog.meta.spriteRevision}#logo-`));
    const [x, y, w, h] = markup.match(/viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/).slice(1).map(Number);
    assert.ok(x >= 0 && y >= 0 && x + w <= 320.001 && y + h <= 160.001);
    assert.match(markup, /aria-hidden="true"/);
  }
  assert.match(brandLogoMarkup('Tops', {decorative: false}), /role="img" aria-label="โลโก้ Tops"/);
});
