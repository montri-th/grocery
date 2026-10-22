import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {attestFile, attestFiles} from '../scripts/verify-live.mjs';

const base = 'https://montri-th.github.io/grocery/';
const body = Buffer.from('{"ok":true}\n');
const file = {path: 'data/example.json', sha256: createHash('sha256').update(body).digest('hex')};
const response = (override = {}) => ({status: 200, url: `${base}${file.path}`, headers: new Headers({'content-type': 'application/json; charset=utf-8'}), arrayBuffer: async () => body, ...override});

test('live attestation requires 200, expected final URL, correct MIME and exact bytes', async () => {
  const valid = await attestFile(file, base, async () => response());
  assert.equal(valid.ok, true);
  for (const [check, override] of [
    ['httpStatus', {status: 206}],
    ['finalUrl', {url: 'https://example.org/grocery/data/example.json'}],
    ['finalUrl', {url: `${base}index.html`}],
    ['contentType', {headers: new Headers({'content-type': 'text/html'})}],
    ['sha256', {arrayBuffer: async () => Buffer.from('wrong bytes')}],
  ]) {
    const result = await attestFile(file, base, async () => response(override));
    assert.equal(result.ok, false, check);
    assert.equal(result.checks[check], false, check);
    assert.equal(result.path, file.path, 'failure preserves the exact requested path');
  }
});

test('network failures become path-specific JSON results and root document needs HTML MIME', async () => {
  const failed = await attestFile(file, base, async () => { throw new Error('test network failure'); });
  assert.equal(failed.path, file.path);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /test network failure/);
  const root = await attestFile({...file, path: '/'}, base, async () => response({url: base, headers: new Headers({'content-type': 'text/html'})}));
  assert.equal(root.ok, true);
});

test('live attestation preserves manifest order and caps concurrent public fetches at four', async () => {
  let active = 0, peak = 0;
  const files = Array.from({length: 9}, (_, i) => ({...file, path: `data/${i}.json`}));
  const results = await attestFiles(files, base, async url => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return response({url});
  }, 99);
  assert.equal(peak, 4);
  assert.deepEqual(results.map(r => r.path), files.map(f => f.path));
  assert.ok(results.every(r => r.ok));
});
