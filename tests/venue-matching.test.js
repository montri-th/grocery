import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/venue-name-matching.json', import.meta.url)));
const result = spawnSync('python3', [new URL('../scripts/reconcile-venue-names.py', import.meta.url).pathname, '--evaluate-fixtures'], {input: JSON.stringify(fixtures), encoding: 'utf8'});
assert.equal(result.status, 0, result.stderr);
const actual = new Map(JSON.parse(result.stdout).map(r => [r.id, r]));

for (const f of fixtures) test(`venue identity: ${f.id}`, () => {
  const r = actual.get(f.id);
  assert.equal(r.blocked, f.expectedBlocked);
  if (!f.expectedBlocked) assert.deepEqual(r.matches, f.expectedMatches);
  if (f.expectedEligibleDetail !== undefined) assert.equal(r.eligibleDetail, f.expectedEligibleDetail);
});

test('English host identity uses a token boundary: Park Village does not become K Village', () => {
  assert.deepEqual(actual.get('park-village-false').matches, []);
});

test('branch-prefix whitespace is stripped with real regex whitespace', () => {
  assert.equal(actual.get('megabangna-real').strippedLabel, 'Megabangna');
  assert.equal(actual.get('ally-ramkamhaeng').strippedLabel, 'สัมมากร เพลส รามคำแหง');
});

test('Pattaya branch labels require a geographic distinction', () => {
  assert.ok(actual.get('central-pattaya-ambiguous').referenceDistanceM > 750);
  assert.ok(actual.get('central-pattaya-beach').referenceDistanceM <= 750);
});
