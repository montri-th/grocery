import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COUNT_SCALE, CAPITA_SCALE, SCALES, STEPS, METHOD, classColors, buildScale, sampleIndexes, classify, displayValue, formatMetric, inkFor, contrastRatio} from '../js/scales.js';
import {rampHTML} from '../js/ramp-legend.js';
import {realModel} from './helpers.js';
import {summarizeChildren} from '../js/hierarchy.js';

const lds = JSON.parse(fs.readFileSync(new URL('./fixtures/lds-0.9.7-scales.json', import.meta.url))).scales;

test('both families are the exact LDS 0.9.7 light LUTs, versions and data states (same HEX on both themes)', () => {
  for (const [scale, id] of [[COUNT_SCALE, 'count'], [CAPITA_SCALE, 'density.capita']]) {
    const ref = lds[id];
    assert.equal(scale.scaleId, id);
    assert.deepEqual([...scale.lut], ref.lut);
    assert.equal(scale.lut.length, 41);
    assert.deepEqual(scale.anchors, ref.anchors);
    assert.equal(scale.scaleVersion, ref.scaleVersion);
    assert.equal(scale.noData, ref.noData);
    assert.equal(scale.zeroOutline, ref.zeroOutline);
    assert.equal(scale.themePolicy, ref.themePolicy);
    for (const n of [3, 5, 7, 9]) assert.deepEqual(classColors(n, scale), ref.classes[String(n)], `${id} ${n} classes`);
  }
  assert.throws(() => classColors(4));
  const theme = fs.readFileSync(new URL('../assets/theme.css', import.meta.url), 'utf8');
  lds['density.capita'].classes['5'].forEach((hex, i) => assert.ok(theme.includes(`--scale-capita-${i + 1}: ${hex};`), `theme token capita ${i + 1}`));
  lds.count.classes['5'].forEach((hex, i) => assert.ok(theme.includes(`--scale-count-${i + 1}: ${hex};`), `theme token count ${i + 1}`));
});

test('rank-41: every measured value takes one exact LDS sample by rank — lowest 0, highest 40, ties shared (owner rule 2026-10-22)', () => {
  assert.equal(STEPS, 41);
  assert.equal(METHOD, 'rank-41');
  const m = realModel();
  const expectSamples = {count: 41, capita: 31};
  for (const metric of ['count', 'capita']) {
    const values = summarizeChildren(m, m.rows, {province: -1, district: -1, unit: -1}).map(c => (metric === 'count' ? c.count : c.perCapita));
    const model = buildScale(values, {metric});
    const lut = SCALES[metric].lut;
    assert.equal(model.method, 'rank-41');
    assert.equal(model.steps, 41);
    assert.deepEqual([...model.lut], [...lut], 'the legend reads the exact family LUT');
    const runs = sampleIndexes(values, metric);
    assert.equal(runs[0].index, 0, 'lowest shown value → sample 0');
    assert.equal(runs.at(-1).index, 40, 'highest shown value → sample 40');
    for (let i = 1; i < runs.length; i++) {
      assert.ok(runs[i].value > runs[i - 1].value, 'distinct shown values ascend');
      assert.ok(runs[i].index >= runs[i - 1].index, 'a higher value never takes a lighter sample');
    }
    for (let i = 0; i < model.classes.length; i++) {
      const c = model.classes[i];
      assert.equal(c.fill, lut[c.index], `${metric} sample ${c.index} is the exact LUT HEX`);
      assert.ok(c.lower <= c.upper);
      if (i) { assert.ok(c.index > model.classes[i - 1].index); assert.ok(c.lower > model.classes[i - 1].upper, 'closed intervals never overlap'); }
    }
    for (const v of values) {
      const c = classify(v, model);
      assert.equal(c.state, 'measured');
      const shown = displayValue(v, metric);
      const cls = model.classes.find(k => k.index === c.sample);
      assert.ok(cls && shown >= cls.lower && shown <= cls.upper, `${metric} value ${v} sits in the sample its colour says`);
      assert.equal(c.fill, lut[c.sample]);
    }
    // A rank ramp spreads the 77 provinces over the samples instead of crowding them into the light end.
    assert.equal(model.classCount, expectSamples[metric], `${metric} samples in use`);
    assert.ok(model.classes.every(c => c.areas <= 7), `${metric} at most 7 provinces share a sample`);
    assert.equal(model.classes.reduce((n, c) => n + c.areas, 0), 77);
    // Order-independent: the map, its legend and the charts build from the same values in different orders.
    assert.deepEqual(buildScale([...values].reverse(), {metric}).classes, model.classes);
  }
});

test('ties share one sample at their mean position; one distinct value takes the darkest sample', () => {
  assert.deepEqual(sampleIndexes([5, 1, 1, 1, 3, 9], 'count').map(r => [r.value, r.count, r.index]), [[1, 3, 0], [3, 1, 20], [5, 1, 30], [9, 1, 40]]);
  assert.deepEqual(sampleIndexes([2.34, 2.31, 2.4], 'capita').map(r => [r.value, r.index]), [[2.3, 0], [2.4, 40]], 'ties are judged on shown (rounded) values');
  const single = buildScale([0, 5, 5], {metric: 'count'});
  assert.deepEqual(single.classes.map(c => c.index), [40]);
  assert.deepEqual(single.ticks.map(t => t.role), ['only']);
  assert.deepEqual(buildScale([null, 0], {metric: 'capita'}).classes, []);
});

test('zero is measured_zero, unknown is no_data, never a sample of the ramp', () => {
  const model = buildScale([0, 3, null, 7, 12], {metric: 'count'});
  assert.equal(classify(0, model).state, 'measured_zero');
  assert.equal(classify(0, model).fill, COUNT_SCALE.lut[0]);
  assert.equal(classify(0, model).outline, COUNT_SCALE.zeroOutline);
  assert.equal(classify(null, model).state, 'no_data');
  assert.equal(classify(null, model).fill, COUNT_SCALE.noData);
  assert.equal(model.zeroCount, 1);
  assert.equal(model.noDataCount, 1);
  assert.deepEqual(model.classes.map(c => c.index), [0, 20, 40], 'three distinct measured values → samples 0, 20, 40');
  assert.equal(model.classes.at(-1).fill, COUNT_SCALE.lut[40], 'the highest value keeps the darkest anchor');
  assert.equal(classify(0, buildScale([0, 1.4], {metric: 'capita'})).fill, CAPITA_SCALE.lut[0]);
  assert.equal(classify(5, model).sample, 0, 'a value between built values takes the class below it (3)');
  assert.equal(classify(8, model).sample, 20, 'a value between built values takes the class below it (7)');
});

test('display precision and formatting agree with classification', () => {
  assert.equal(displayValue(2.349, 'capita'), 2.3);
  assert.equal(displayValue(0.02, 'capita'), 0.1, 'a tiny positive per-capita is held at the lowest shown value');
  assert.equal(formatMetric(0.02, 'capita'), '<0.1');
  assert.equal(formatMetric(10.67, 'capita'), '10.7');
  assert.equal(formatMetric(5310, 'count'), '5,310');
  assert.equal(formatMetric(null, 'count'), '—');
  assert.ok(SCALES.count && SCALES.capita);
});

test('ink on every one of the 41 samples is the better foundation ink; a backplate where neither reaches 4.5:1', () => {
  const plates = {count: [27, 28, 29], capita: [31, 32, 33, 34, 35]};
  for (const metric of ['count', 'capita']) {
    const model = buildScale(Array.from({length: 41}, (_, i) => i + 1), {metric});
    assert.equal(model.classCount, 41, 'forty-one distinct values use all forty-one samples');
    for (const c of model.classes) {
      const other = c.ink === '#182327' ? '#FFFFFF' : '#182327';
      assert.ok(contrastRatio(c.fill, c.ink) >= contrastRatio(c.fill, other));
      assert.equal(c.plate, contrastRatio(c.fill, c.ink) < 4.5, `${metric} sample ${c.index}`);
    }
    assert.deepEqual(model.classes.filter(c => c.plate).map(c => c.index), plates[metric]);
    assert.equal(classify(model.classes[28].lower, model).plate, metric === 'count');
  }
  for (const scale of [COUNT_SCALE, CAPITA_SCALE]) for (const hex of classColors(5, scale)) assert.ok(contrastRatio(hex, inkFor(hex)) >= 4.5, `${hex} cue token with ${inkFor(hex)}`);
});

test('the legend shows all 41 exact samples as discrete swatches with min · median · max ticks', () => {
  const model = buildScale(Array.from({length: 41}, (_, i) => i + 1), {metric: 'count'});
  const html = rampHTML(model, {unit: 'สาขา', what: 'พื้นที่'});
  assert.deepEqual([...html.matchAll(/background:(#[0-9A-F]{6})/g)].map(x => x[1]), [...COUNT_SCALE.lut], '41 swatches in LUT order, exact HEX');
  assert.ok(!/gradient/i.test(html), 'no CSS gradient (it would interpolate between samples)');
  assert.equal((html.match(/class="is-used"/g) || []).length, 41);
  assert.deepEqual([...html.matchAll(/class="ramp-tick is-(\w+)"[^>]*>([^<]+)</g)].map(x => [x[1], x[2]]), [['min', '1'], ['median', '21'], ['max', '41']]);
  assert.match(html, /aria-label="ไล่สี 41 ขั้นของ LDS ตามลำดับค่า: น้อยสุด 1 · ค่ากลาง 21 · มากสุด 41 สาขา"/);
  const few = rampHTML(buildScale([2, 9, 9, 30], {metric: 'count'}), {unit: 'สาขา'});
  assert.equal((few.match(/class="is-used"/g) || []).length, 3, 'only the samples in use carry a mark');
  assert.equal((few.match(/<i[ >]/g) || []).length, 41, 'the whole ramp is always shown');
  assert.equal(rampHTML(buildScale([0, null], {metric: 'count'})), '', 'nothing measured → no ramp');
  const m = realModel();
  const country = buildScale(summarizeChildren(m, m.rows, {province: -1, district: -1, unit: -1}).map(c => c.count), {metric: 'count'});
  assert.deepEqual(country.ticks.map(t => [t.role, t.label, t.index]), [['min', '39', 0], ['median', '230', 20], ['max', '5,310', 40]]);
});

test('the machine brief declares the scale the code draws (handoff/product-brief.json ↔ js/scales.js)', () => {
  const brief = JSON.parse(fs.readFileSync(new URL('../handoff/product-brief.json', import.meta.url), 'utf8'));
  assert.equal(brief.metricContract.method, METHOD);
  assert.equal(brief.metricContract.steps, STEPS);
  assert.equal(brief.metricContract.metrics.count.scaleVersion, COUNT_SCALE.scaleVersion);
  assert.equal(brief.metricContract.metrics.capita.scaleVersion, CAPITA_SCALE.scaleVersion);
  assert.ok(brief.invariants.some(i => /all 41 exact LDS samples/.test(i.rule)), 'an invariant states the 41-sample rule');
});
