#!/usr/bin/env node
/** Append a Foodplace subformat logo without adding a brand or rebuilding baseline logos.
 * Run: node scripts/append-foodplace-logo.mjs
 * The checked-in SVG is an exact export of the Foodplace Form from BJC's public
 * 3Q2023 presentation, not a claim that its artwork was issued in 2026.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
// Preserve existing array-entry bytes, including JSON number formatting. Only
// the catalog-level metadata and the one appended Foodplace entry are written.
function memberSpan(text, key) {
  const match = new RegExp(`"${key}"\\s*:\\s*`).exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  let quoted = false, escaped = false, depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') { quoted = false; if (!depth) return {start, end: i + 1}; }
    } else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      if (--depth === 0) return {start, end: i + 1};
    } else if (!depth && (c === ',' || c === '\n')) return {start, end: i};
  }
  throw new Error(`Unterminated JSON member: ${key}`);
}
function replaceMember(text, key, value) {
  const span = memberSpan(text, key);
  if (!span) return text.replace('{\n', `{\n "${key}": ${JSON.stringify(value)},\n`);
  const formatted = JSON.stringify(value, null, 1).replace(/\n/g, '\n ');
  return text.slice(0, span.start) + formatted + text.slice(span.end);
}
function appendArrayEntry(text, key, value) {
  const span = memberSpan(text, key);
  if (!span) return text.replace(/\n}\s*$/, `,\n "${key}": [\n${JSON.stringify(value, null, 1).split('\n').map(line => '  ' + line).join('\n')}\n ]\n}\n`);
  const body = text.slice(span.start + 1, span.end - 1);
  const trailing = body.match(/\s*$/)[0];
  const entry = JSON.stringify(value, null, 1).split('\n').map(line => '  ' + line).join('\n');
  return text.slice(0, span.start + 1) + body.slice(0, body.length - trailing.length) + ',\n' + entry + trailing + text.slice(span.end - 1);
}
const filename = 'assets/brand-logos/big_c_foodplace.svg';
const bytes = fs.readFileSync(new URL(filename, root));
const derivativeSHA256 = 'cd5bcbf04287ab56f1b6d8dd4f05c69e26f0d19c5c97f2f0051e0fe99bf1ff63';
const sourceDocumentSHA256 = '28db6a6108833e36c0637341dcb5d733024a1a86d6decd2534ca9116b400a860';
if (hash(bytes) !== derivativeSHA256) throw new Error('Foodplace SVG differs from the visually verified export');

let catalogText = read('data/brand-logos.json'), manifestText = read('assets/brand-logos-manifest.json');
const catalog = JSON.parse(catalogText);
const manifest = JSON.parse(manifestText);
const baseline = JSON.parse(read('tests/fixtures/brand-logos-baseline-2026-10-22.json'));
let sprite = read('assets/brand-logos.svg');
const getSymbol = id => sprite.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`))?.[0];
const verifyBaseline = () => {
  for (const b of baseline.brands) {
    if (hash(JSON.stringify(catalog.brands.find(x => x.id === b.id))) !== b.catalogRecordSHA256 ||
        hash(JSON.stringify(manifest.files.find(x => x.brand === b.id))) !== b.manifestRecordSHA256 ||
        hash(getSymbol(b.spriteId) || '') !== b.symbolSHA256) throw new Error(`Approved baseline changed: ${b.id}`);
  }
};
verifyBaseline();

const provenance = {
  artifactKind: 'official_source_derivative', sourceKind: 'official_brand',
  sourceDocumentPeriod: '3Q2023', artworkSourceDate: '2023-09 snapshot', retrievedOn: '2026-10-25',
  sourceDocumentSHA256, derivativeSHA256,
  extraction: {
    page: 35, locator: 'Resources/XObject/Meta978',
    sourceFormContentSHA256: 'a2bc56cd07acfc8c370a7c9ec9c546669f04b513eb90e9065f7caf9a4e8fe6f0',
    sourceFormBBox: [0, 0, 238.3, 96.449], sourceFormMatrix: [0.30214, 0, 0, 0.74651, 0, 0],
    sourcePageClip: [298.68, 314.4, 73.56, 30],
    sourcePageCTM: [1.0217, -0.000000377, -0.000000377, 0.41667, 298.68, 314.4],
    method: 'Isolate exact original PDF vector Form, retaining its matrix and source page linear placement/clip; remove page translation only. Export standalone PDF to self-contained SVG using pdftocairo -svg. No tracing, redrawing, recoloring or ink cropping.'
  },
  variantNote: 'Exact official 2023 source variant. Retrieval in 2026 does not establish a 2026 artwork release or current brand guideline. Newer official social lockups were observed only in seasonal or branch-labeled originals and were not substituted.',
  visualQA: {status: 'passed', checkedOn: '2026-10-25', result: 'Compared original source page and complete standalone light/dark renders. Use light backing for black place lettering.'}
};
const sourceURL = 'https://api.lcp.setgroup.or.th/file/presentation/6180';
const crop = {x: 0, y: 0, width: 73.56, height: 30};
const record = {
  id: 'BIG_C_FOODPLACE', name: 'Big C Foodplace', spriteId: 'logo-big_c_foodplace',
  entityType: 'retail_subformat', parentBrandId: 'BIG_C',
  sourceURL, sourceSHA256: derivativeSHA256, mime: 'image/svg+xml', width: 73.56, height: 30,
  bytes: bytes.length, background: '#FFFFFF', sourceKind: 'official_brand',
  altTh: 'โลโก้ Big C Foodplace', altEn: 'Big C Foodplace logo', viewportCrop: crop,
  assetURL: sourceURL + '#page=35', localAssetURL: filename, ...provenance
};
const file = {
  format: record.id, parentBrandId: 'BIG_C', name: record.name, file: 'big_c_foodplace.svg', localPath: filename,
  sha256: derivativeSHA256, bytes: bytes.length, mime: record.mime, sourcePage: sourceURL,
  assetURL: record.assetURL, status: 'official_source_derivative', checkedOn: '2026-10-25',
  notes: 'Original Foodplace vector Form from the official BJC presentation published on the SET platform. Preserve the 2023 source date. SVG derivative hash is distinct from the original PDF hash. Public presentation has a Confidential footer; no independent trademark or redistribution license inferred.',
  background: record.background, viewportCrop: crop, ...provenance
};
const uri = `data:${record.mime};base64,${bytes.toString('base64')}`;
const symbol = `<symbol id="${record.spriteId}" viewBox="0 0 320 160"><title>${record.name}</title><rect width="320" height="160" fill="${record.background}"/>` +
  `<svg x="12" y="12" width="296" height="136" viewBox="0 0 73.56 30" preserveAspectRatio="xMidYMid meet" overflow="hidden">` +
  `<image x="0" y="0" width="73.56" height="30" preserveAspectRatio="xMidYMid meet" href="${uri}"/></svg></symbol>`;
if (catalog.brands.some(x => x.id === record.id)) throw new Error('Foodplace is a subformat of BIG_C, not another brand');
const existing = catalog.formats?.find(x => x.id === record.id);
if (existing) {
  if (JSON.stringify(existing) !== JSON.stringify(record) || getSymbol(record.spriteId) !== symbol ||
      JSON.stringify(manifest.formatFiles?.find(x => x.format === record.id)) !== JSON.stringify(file)) {
    throw new Error('Foodplace already exists with different artwork or metadata; review before replacing');
  }
} else {
  if (getSymbol(record.spriteId) || manifest.formatFiles?.some(x => x.format === record.id)) throw new Error('Partial Foodplace integration requires review');
  const end = '</defs></svg>\n';
  if (!sprite.endsWith(end)) throw new Error('Unexpected sprite structure');
  sprite = sprite.slice(0, -end.length) + symbol + end;
  catalogText = appendArrayEntry(catalogText, 'formats', record);
  manifestText = appendArrayEntry(manifestText, 'formatFiles', file);
  (catalog.formats ??= []).push(record);
  (manifest.formatFiles ??= []).push(file);
}
verifyBaseline();
const spriteSHA256 = hash(sprite);
const formatTransformation = 'Foodplace is a subformat under BIG_C, with separate artwork: official-source SVG derivative from the 2023 presentation, embedded byte-for-byte with light #FFFFFF backing and its full untrimmed viewBox. The 17 baseline brand artworks, records and definitions are unchanged.';
Object.assign(catalog.meta, {
  spriteSHA256, spriteRevision: spriteSHA256.slice(0, 12),
  formatCount: catalog.formats.length, formatsAsOf: '2026-10-25', formatsVersion: '2026-10-25-foodplace-r1',
  formatTransformation
});
Object.assign(manifest, {formatsUpdatedOn: '2026-10-25', formatCount: manifest.formatFiles.length,
  formatTransformation, sprite: {...manifest.sprite, sha256: spriteSHA256}});
catalogText = replaceMember(catalogText, 'meta', catalog.meta);
for (const key of ['formatsUpdatedOn', 'formatCount', 'formatTransformation', 'sprite']) manifestText = replaceMember(manifestText, key, manifest[key]);
// Parse before writing: a malformed append must never replace the catalog.
if (JSON.stringify(JSON.parse(catalogText)) !== JSON.stringify(catalog)) throw new Error('Catalog serialization mismatch');
const parsedManifest = JSON.parse(manifestText);
if (JSON.stringify(parsedManifest.files) !== JSON.stringify(manifest.files)) throw new Error('Manifest serialization mismatch');
if (JSON.stringify(parsedManifest.formatFiles) !== JSON.stringify(manifest.formatFiles)) throw new Error('Format manifest serialization mismatch');
fs.writeFileSync(new URL('assets/brand-logos.svg', root), sprite);
fs.writeFileSync(new URL('data/brand-logos.json', root), catalogText);
fs.writeFileSync(new URL('assets/brand-logos-manifest.json', root), manifestText);
console.log(JSON.stringify({brandCount: catalog.brands.length, formatCount: catalog.formats.length, preservedBaseline: baseline.count, derivativeSHA256, sourceDocumentSHA256, spriteSHA256}));
