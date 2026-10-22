import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readJSON} from './helpers.js';

const root = new URL('../', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('public source receipts account for the pinned country release and include the required agreement bytes', () => {
  const data = readJSON('data/building-sources.json');
  const source = data.sources.microsoft;
  assert.equal(source.release, '2026-08-13');
  assert.equal(source.index.sha256, 'de61b569b0c23c364d61173632d8c5487ea30bf20912c55b9fa1ab4a89d01148');
  assert.equal(source.partitions.length, 142);
  assert.equal(new Set(source.partitions.map(p => p.quadkey)).size, 142);
  for (const p of source.partitions) {
    assert.match(p.quadkey, /^[0-3]{9}$/);
    assert.match(p.url, /^https:\/\/bfppub\.(?:z5\.web|blob)\.core\.windows\.net\/2026-08-13\//);
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    assert.match(p.candidateSubsetSHA256, /^[a-f0-9]{64}$/);
    assert.ok(p.bytes > 0 && p.sourceFootprints >= p.bboxCandidateFootprints);
    assert.equal(p.sourceHeightEstimateCandidates + p.unknownHeightCandidates, p.bboxCandidateFootprints);
    assert.ok(p.knownDetectionConfidenceCandidates <= p.bboxCandidateFootprints);
  }
  const sum = key => source.partitions.reduce((n, p) => n + p[key], 0);
  assert.equal(sum('bytes'), source.coverage.sourceCompressedBytes);
  assert.equal(sum('sourceFootprints'), source.coverage.sourceFootprints);
  assert.equal(sum('bboxCandidateFootprints'), source.coverage.bboxCandidateFootprints);
  assert.equal(sum('candidateSubsetBytes'), source.coverage.bboxCandidateBytes);
  assert.equal(sum('unknownHeightCandidates'), source.height.unknownHeightCandidates);
  assert.equal(sum('sourceHeightEstimateCandidates'), source.height.sourceEstimateCandidates);
  assert.equal(sum('knownDetectionConfidenceCandidates'), source.confidence.knownCandidates);
  assert.equal(Object.values(source.standalonePointCounts).reduce((a, b) => a + b, 0), source.coverage.inputStoreRows);
  const agreement = readFileSync(new URL(source.license.agreementPath, root));
  assert.equal(agreement.length, source.license.agreementBytes);
  assert.equal(digest(agreement), source.license.agreementSHA256);
  assert.match(agreement.toString(), /Community Data License Agreement.*Permissive.*Version 2\.0/);
  const reference = data.sources.venueReferences;
  const referenceBytes = readFileSync(new URL(reference.publicSubsetPath, root));
  assert.equal(digest(referenceBytes), reference.publicSubsetSHA256);
  assert.equal(referenceBytes.length, reference.publicSubsetBytes);
  assert.doesNotMatch(JSON.stringify(data), /\/Users\/|\/private\/|[A-Z]:\\|file:\/\//);
});

test('provider scripts are safe to inspect and require raw country output to stay outside the public repository', () => {
  const pythonHelp = spawnSync('python3', ['scripts/fetch-microsoft-buildings.py', '--help'], {cwd: root, encoding: 'utf8'});
  assert.equal(pythonHelp.status, 0, pythonHelp.stderr);
  assert.match(pythonHelp.stdout, /--work-dir/);
  const imported = spawnSync('python3', ['-c', 'import runpy,urllib.request; urllib.request.urlopen=lambda *a,**k: (_ for _ in ()).throw(RuntimeError("network forbidden")); runpy.run_path("scripts/fetch-microsoft-buildings.py",run_name="provider_library")'], {cwd: root, encoding: 'utf8'});
  assert.equal(imported.status, 0, imported.stderr);
  const pythonGuard = spawnSync('python3', ['scripts/fetch-microsoft-buildings.py', '--work-dir', '.'], {cwd: root, encoding: 'utf8'});
  assert.notEqual(pythonGuard.status, 0);
  assert.match(pythonGuard.stderr, /external work directory/);
  const nodeHelp = spawnSync(process.execPath, ['scripts/build-microsoft-spatial.mjs', '--help'], {cwd: root, encoding: 'utf8'});
  assert.equal(nodeHelp.status, 0, nodeHelp.stderr);
  const nodeGuard = spawnSync(process.execPath, ['scripts/build-microsoft-spatial.mjs', '--work-dir', '.'], {cwd: root, encoding: 'utf8'});
  assert.notEqual(nodeGuard.status, 0);
  assert.match(nodeGuard.stderr, /outside the public repository/);
});
