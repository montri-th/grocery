#!/usr/bin/env node
/**
 * Attest the public release: exact HTTP 200, expected final host/path, a MIME
 * type appropriate for the extension, and SHA-256 matching the local manifest.
 * Four bounded workers fetch public files. Every failure retains its exact path.
 *
 * node scripts/verify-live.mjs [--base https://montri-th.github.io/grocery/]
 *   [--manifest handoff/handoff-manifest.json] [--out evidence/live-attestation.json]
 */
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve, dirname, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {
  '.html': ['text/html'], '.css': ['text/css'],
  '.js': ['application/javascript', 'text/javascript'],
  '.mjs': ['application/javascript', 'text/javascript'],
  '.json': ['application/json'], '.geojson': ['application/geo+json', 'application/json'],
  '.svg': ['image/svg+xml'], '.png': ['image/png'],
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.gif': ['image/gif'],
  '.webp': ['image/webp'], '.avif': ['image/avif'],
  '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'],
  '.woff': ['font/woff', 'application/font-woff', 'application/x-font-woff'],
  '.woff2': ['font/woff2'], '.ttf': ['font/ttf', 'application/x-font-ttf'],
  '.otf': ['font/otf', 'application/x-font-opentype'],
  '.md': ['text/markdown', 'text/plain'], '.txt': ['text/plain'],
  '.pdf': ['application/pdf'], '.zip': ['application/zip'],
  '.xml': ['application/xml', 'text/xml'],
  '.webmanifest': ['application/manifest+json', 'application/json'],
};
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const withoutQuery = input => { const u = new URL(input); u.search = ''; u.hash = ''; return u.href; };
const published = p => !p.startsWith('tests/') && !p.startsWith('scripts/') && !p.startsWith('.') && p !== 'package.json';
export const expectedMimeTypes = path => path === '/' ? mimeTypes['.html'] : mimeTypes[extname(path).toLowerCase()] || (extname(path) === '' ? ['text/plain'] : []);

export async function attestFile(file, base, fetcher = fetch) {
  const expected = new URL(file.path === '/' ? './' : file.path, base);
  expected.search = ''; expected.hash = '';
  const baseURL = new URL(base);
  const expectedMimes = expectedMimeTypes(file.path);
  const result = {path: file.path, url: expected.href, finalUrl: null, status: 0,
    contentType: null, expectedMimeTypes: expectedMimes, bytes: 0, sha256: null,
    expectedSha256: file.sha256, checks: {httpStatus: false, finalUrl: false, contentType: false, sha256: false}, ok: false};
  try {
    if (expected.origin !== baseURL.origin || !expected.pathname.startsWith(baseURL.pathname)) throw new Error('Requested path is outside the expected site base');
    const request = new URL(expected); request.searchParams.set('attest', String(Date.now()));
    const response = await fetcher(request.href, {cache: 'no-store', signal: AbortSignal.timeout(30000)});
    result.status = response.status;
    result.finalUrl = withoutQuery(response.url);
    result.contentType = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    const finalURL = new URL(response.url);
    const bytes = Buffer.from(await response.arrayBuffer());
    result.bytes = bytes.length;
    result.sha256 = sha256(bytes);
    result.checks = {
      httpStatus: response.status === 200,
      finalUrl: finalURL.origin === expected.origin && finalURL.pathname === expected.pathname,
      contentType: expectedMimes.includes(result.contentType),
      sha256: result.sha256 === file.sha256,
    };
    result.ok = Object.values(result.checks).every(Boolean);
    if (!result.ok) result.error = Object.entries(result.checks).filter(([, pass]) => !pass).map(([check]) => check).join(', ');
  } catch (error) {
    result.error = String(error.message || error);
  }
  return result;
}

export async function attestFiles(files, base, fetcher = fetch, concurrency = 4) {
  const results = new Array(files.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(4, Math.max(1, concurrency), files.length)}, async () => {
    while (next < files.length) {
      const i = next++;
      results[i] = await attestFile(files[i], base, fetcher);
    }
  }));
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
  const baseURL = new URL(opt('--base', 'https://montri-th.github.io/grocery/'));
  if (!baseURL.pathname.endsWith('/')) baseURL.pathname += '/';
  baseURL.search = ''; baseURL.hash = '';
  const base = baseURL.href;
  const out = resolve(opt('--out', join(root, 'evidence/live-attestation.json')));
  const manifest = JSON.parse(readFileSync(resolve(opt('--manifest', join(root, 'handoff/handoff-manifest.json'))), 'utf8'));
  const files = manifest.files.filter(f => published(f.path));
  const index = manifest.files.find(f => f.path === 'index.html');
  if (index) files.push({...index, path: '/'});
  const results = await attestFiles(files, base);
  const report = {
    checkedAt: new Date().toISOString(), baseUrl: base, concurrency: 4,
    requirements: ['HTTP 200', 'expected final origin and path', 'MIME for extension', 'SHA-256'],
    manifestCommit: manifest.sourceCommit, manifestGeneratedAt: manifest.generatedAt,
    passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length,
    failedPaths: results.filter(r => !r.ok).map(r => r.path), results,
  };
  mkdirSync(dirname(out), {recursive: true});
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(`live attestation: ${report.passed} ok, ${report.failed} failed → ${out}`);
  for (const r of results.filter(r => !r.ok)) console.log(`  MISMATCH ${r.path} status=${r.status} ${r.error || ''}`);
  process.exitCode = report.failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
