import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COUNT_SCALE, CAPITA_SCALE, SCALES, classColors, buildClasses, classify, quantileIntervals, displayValue, formatMetric, inkFor, contrastRatio} from '../js/scales.js';
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

test('quantile intervals are closed, ordered, non-overlapping and cover every measured value', () => {
  const m = realModel();
  for (const metric of ['count', 'capita']) {
    const values = summarizeChildren(m, m.rows, {province: -1, district: -1, unit: -1}).map(c => (metric === 'count' ? c.count : c.perCapita));
    const intervals = quantileIntervals(values, 5, metric);
    assert.equal(intervals.length, 5);
    for (let i = 0; i < intervals.length; i++) {
      assert.ok(intervals[i].lower <= intervals[i].upper);
      if (i) assert.ok(intervals[i].lower > intervals[i - 1].upper);
    }
    const model = buildClasses(values, {metric});
    assert.equal(model.method, 'quantile');
    for (const v of values) {
      const c = classify(v, model);
      const shown = displayValue(v, metric);
      const cls = model.classes.find(k => k.fill === c.fill && shown >= k.lower && shown <= k.upper);
      assert.ok(cls, `${metric} value ${v} sits in the class its colour says`);
    }
    // Quantiles: each class holds roughly a fifth of the 77 provinces.
    const sizes = model.classes.map(k => values.filter(v => { const s = displayValue(v, metric); return s >= k.lower && s <= k.upper; }).length);
    assert.ok(sizes.every(s => s >= 10 && s <= 22), `${metric} class sizes ${sizes}`);
  }
});

test('zero is measured_zero, unknown is no_data, never a ramp class; few values shrink the class count', () => {
  const model = buildClasses([0, 3, null, 7, 12], {metric: 'count'});
  assert.equal(classify(0, model).state, 'measured_zero');
  assert.equal(classify(0, model).outline, COUNT_SCALE.zeroOutline);
  assert.equal(classify(null, model).state, 'no_data');
  assert.equal(classify(null, model).fill, COUNT_SCALE.noData);
  assert.equal(model.zeroCount, 1);
  assert.equal(model.noDataCount, 1);
  assert.equal(model.classCount, 3, 'three distinct measured values → three classes');
  assert.equal(model.classes.at(-1).fill, COUNT_SCALE.lut[40], 'the top class keeps the darkest anchor');
  assert.equal(classify(0, buildClasses([0, 1.4], {metric: 'capita'})).fill, CAPITA_SCALE.lut[0]);
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

test('label ink on every class reaches the higher contrast of the two foundation inks', () => {
  for (const scale of [COUNT_SCALE, CAPITA_SCALE]) for (const hex of classColors(5, scale)) {
    const ink = inkFor(hex);
    const other = ink === '#182327' ? '#FFFFFF' : '#182327';
    assert.ok(contrastRatio(hex, ink) >= contrastRatio(hex, other));
    assert.ok(contrastRatio(hex, ink) >= 4.5, `${hex} with ${ink}`);
  }
});
