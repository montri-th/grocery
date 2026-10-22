/**
 * Analytical scales of the area choropleth, rankings and matrices.
 *
 * Families (LDS 0.9.7, release v0.9.7-owner.1, color-srgb-10):
 *   count          — totals (สาขา). scaleVersion 4ff5c1fb…0980, dusty cyan → editorial navy.
 *   density.capita — stores per 10,000 registered residents. scaleVersion 0b49c15c…4ab1, salmon → rose.
 * DATAVIZ-02/03: the exact approved light 41-sample LUTs are consumed unchanged
 * on both themes; no interpolation and no derived colours.
 *
 * Owner rule (2026-10-22, release 0.2): every colour scale uses all 41 LDS
 * samples, never a five-class projection. The consumer (this module) declares
 * the classification `rank-41` over the values being compared:
 *   - values are first rounded to their display precision (integers for
 *     counts, one decimal for per-capita, a tiny positive held at 0.1 and shown
 *     "<0.1"), so a shown number and its colour always agree and equal shown
 *     values share one sample;
 *   - each distinct positive value takes its mid-rank among the compared
 *     values (ties share the mean position), stretched so the lowest value is
 *     sample 0 and the highest sample 40:
 *       sample = round(40 × (rank − rankLowest) / (rankHighest − rankLowest));
 *     a single distinct value takes sample 40;
 *   - each used sample therefore holds a closed interval of shown values
 *     [lower, upper] (on the display grid this is [lower, next lower)); the
 *     map, its legend, the rankings and the matrices read the same table.
 * Rank rather than linear magnitude: Bangkok holds 5,310 of 27,607 branches, so
 * a linear ramp would put 70 of the 77 provinces in the first five samples.
 * Outliers are not clamped: the highest sample simply holds the maximum.
 * Zero is a measured fact (EVID-05 measured_zero: sample 0 + zero outline),
 * never a sample of the ramp; an unknown population is no_data (neutral fill),
 * never zero; areas outside the comparison are out_of_scope (nothing drawn).
 * Text on a sample uses the foundation ink with the higher contrast; where
 * neither reaches 4.5:1 (count 27–29, density.capita 31–35) the number sits on
 * a neutral backplate (`plate`) instead of recolouring the sample.
 */
const FAMILY = (scaleId, unit, labelTh, anchors, lut, scaleVersion) => Object.freeze({
  scaleId, kind: 'sequential', unit, labelTh, anchors, lut: Object.freeze(lut),
  noData: '#D5DAD6', zeroOutline: '#7D877F', scaleVersion, themePolicy: 'identical-light-values-on-both-themes',
});

export const COUNT_SCALE = FAMILY('count', 'สาขา', 'จำนวนรวม', ['#F4F0E7', '#7DBAC0', '#213E70'], [
  '#F4F0E7', '#EEEDE5', '#E8EBE3', '#E3E8E1', '#DDE5DF', '#D7E3DD', '#D1E0DB', '#CBDDD9',
  '#C5DAD7', '#C0D8D6', '#BAD5D4', '#B4D2D2', '#AED0D0', '#A8CDCE', '#A2CACC', '#9CC8CA',
  '#96C5C8', '#90C2C6', '#8ABFC4', '#83BDC2', '#7DBAC0', '#78B3BC', '#73ADB8', '#6EA7B4',
  '#69A0B0', '#649AAC', '#5F93A8', '#5A8DA4', '#5587A0', '#50809C', '#4C7A98', '#477494',
  '#436E90', '#3E688C', '#3A6288', '#355C84', '#315680', '#2D507C', '#294A78', '#254474',
  '#213E70',
], '4ff5c1fb4be71ecd13c48685b38371b528bcd4ce369ce964a75354c2eb4d0980');

export const CAPITA_SCALE = FAMILY('density.capita', 'สาขาต่อประชากร 10,000 คน', 'ต่อประชากร', ['#FFF0ED', '#F3A076', '#B72B63'], [
  '#FFF0ED', '#FFECE7', '#FEE8E1', '#FEE4DB', '#FEE0D5', '#FDDCCF', '#FDD8CA', '#FCD4C4',
  '#FCD0BE', '#FBCCB8', '#FBC8B2', '#FAC4AC', '#F9C0A6', '#F9BCA0', '#F8B89A', '#F7B494',
  '#F6B08E', '#F6AC88', '#F5A882', '#F4A47C', '#F3A076', '#F09B75', '#ED9575', '#EB9074',
  '#E88B73', '#E58572', '#E28072', '#DF7A71', '#DC7570', '#D96F6F', '#D66A6E', '#D3646D',
  '#D05F6C', '#CD596B', '#CA536A', '#C74D69', '#C44768', '#C14167', '#BD3A65', '#BA3364',
  '#B72B63',
], '0b49c15c6f91e48db79f5c6bd9c729656c95cd6f3162941490c5c125111b4ab1');

export const SCALES = Object.freeze({count: COUNT_SCALE, capita: CAPITA_SCALE});
/** Number of exact LDS samples every scale uses, and the classification this module declares. */
export const STEPS = 41;
export const METHOD = 'rank-41';
export const METRICS = Object.freeze({
  count: {label: 'จำนวนสาขา', short: 'สาขา', legend: 'จำนวนสาขา', step: 1, digits: 0},
  capita: {label: 'สาขาต่อประชากร 10,000 คน', short: 'ต่อ 1 หมื่นคน', legend: 'สาขาต่อประชากร 10,000 คน', step: 0.1, digits: 1},
});

/** Label ink on a class fill: the darker/lighter foundation text that reaches the higher contrast. */
export function inkFor(fill) {
  const dark = '#182327', light = '#FFFFFF';
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
}

/**
 * Exact LDS class projections for n ∈ {3,5,7,9}: index round(i × 40 / (n − 1)).
 * Kept only for the single-colour cue tokens of assets/theme.css (samples
 * 0/10/20/30/40); data encoding always uses all 41 samples (buildScale).
 */
export function classColors(n = 5, scale = COUNT_SCALE) {
  if (![3, 5, 7, 9].includes(n)) throw new RangeError('Class count must be 3, 5, 7 or 9');
  return Array.from({length: n}, (_, i) => scale.lut[Math.round((i * 40) / (n - 1))]);
}

/** Round a value to the metric's display precision; a positive per-capita below 0.1 is held at 0.1 (shown as "<0.1"). */
export function displayValue(value, metric = 'count') {
  if (value == null || !Number.isFinite(value)) return null;
  if (metric === 'capita') return value > 0 ? Math.max(0.1, Math.round(value * 10) / 10) : 0;
  return Math.round(value);
}

const NUMBER = {count: new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0}), capita: new Intl.NumberFormat('th-TH', {minimumFractionDigits: 1, maximumFractionDigits: 1})};
/** Format a metric value as shown on screen ("<0.1" for tiny positive per-capita values). */
export function formatMetric(value, metric = 'count') {
  if (value == null || !Number.isFinite(value)) return '—';
  if (metric === 'capita' && value > 0 && value < 0.05) return '<0.1';
  return NUMBER[metric === 'capita' ? 'capita' : 'count'].format(displayValue(value, metric));
}

/**
 * Rank-41 positions of the measured positive values (display-rounded).
 * Returns the distinct shown values in ascending order:
 * [{value, count, rank, index}] where rank is the 0-based mid-rank among all
 * positive values and index the LDS sample 0…40.
 */
export function sampleIndexes(values, metric = 'count') {
  const shown = (Array.isArray(values) ? values : []).map(v => displayValue(v, metric)).filter(v => v != null && v > 0).sort((a, b) => a - b);
  const runs = [];
  for (let i = 0; i < shown.length;) {
    let j = i;
    while (j + 1 < shown.length && shown[j + 1] === shown[i]) j++;
    runs.push({value: shown[i], count: j - i + 1, rank: (i + j) / 2});
    i = j + 1;
  }
  if (!runs.length) return runs;
  const lowest = runs[0].rank, span = runs.at(-1).rank - lowest;
  return runs.map(r => ({...r, index: span > 0 ? Math.round(((r.rank - lowest) / span) * (STEPS - 1)) : STEPS - 1}));
}

/**
 * Build the scale model for the current comparison.
 * `values` are the metric values of every compared area (null = no_data, 0 = measured_zero).
 * classes: one per used sample, ascending — {index, lower, upper, areas, fill, ink, plate, label}.
 * ticks: the lowest, middle (median of the shown values) and highest values for the legend.
 */
export function buildScale(values, {metric = 'count'} = {}) {
  const scale = SCALES[metric] || COUNT_SCALE;
  const list = Array.isArray(values) ? values : [];
  const runs = sampleIndexes(list, metric);
  const fmt = v => formatMetric(v, metric);
  const bySample = new Map();
  for (const r of runs) {
    const c = bySample.get(r.index);
    if (c) { c.upper = r.value; c.areas += r.count; } else bySample.set(r.index, {index: r.index, lower: r.value, upper: r.value, areas: r.count});
  }
  const classes = [...bySample.values()].map(c => {
    const fill = scale.lut[c.index], ink = inkFor(fill);
    return {...c, fill, ink, plate: contrastRatio(fill, ink) < 4.5, label: c.lower === c.upper ? fmt(c.lower) : `${fmt(c.lower)}–${fmt(c.upper)}`};
  });
  const measuredCount = runs.reduce((sum, r) => sum + r.count, 0);
  let median = null;
  for (let seen = 0, i = 0; i < runs.length; i++) { seen += runs[i].count; if (seen > Math.floor((measuredCount - 1) / 2)) { median = runs[i]; break; } }
  const lowest = runs[0], highest = runs.at(-1);
  const tick = (r, role) => ({role, value: r.value, index: r.index, label: fmt(r.value)});
  const ticks = !runs.length ? [] : runs.length === 1 ? [tick(lowest, 'only')]
    : [tick(lowest, 'min'), ...(median && median !== lowest && median !== highest && median.index >= 8 && median.index <= 32 ? [tick(median, 'median')] : []), tick(highest, 'max')];
  return {
    scaleId: scale.scaleId, scaleVersion: scale.scaleVersion, metric, unit: METRICS[metric]?.legend || scale.unit, method: METHOD, steps: STEPS, lut: scale.lut,
    classCount: classes.length, measuredCount, min: lowest?.value ?? null, median: median?.value ?? null, max: highest?.value ?? 0, classes, ticks,
    zero: {fill: scale.lut[0], ink: inkFor(scale.lut[0]), outline: scale.zeroOutline, label: '0'}, noData: {fill: scale.noData, label: 'ไม่มีข้อมูลประชากร'},
    zeroCount: list.filter(v => v === 0).length, noDataCount: list.filter(v => v == null || !Number.isFinite(v)).length,
  };
}

/**
 * Resolve one value to its EVID-05 state and visual treatment.
 * - measured: positive → its LDS sample (0…40) · measured_zero: 0 → sample 0 + zero outline
 * - no_data: unknown (e.g. per-capita without population) → neutral fill · out_of_scope → nothing drawn
 */
export function classify(value, model, state = 'measured') {
  if (state === 'out_of_scope') return {state, fill: null, ink: null, label: 'นอกขอบเขต'};
  if (state === 'no_data' || value == null || !Number.isFinite(value)) {
    return {state: 'no_data', fill: model?.noData?.fill || COUNT_SCALE.noData, ink: '#182327', label: 'ไม่มีข้อมูล'};
  }
  const metric = model?.metric || 'count';
  const v = displayValue(value, metric);
  if (v <= 0) return {state: 'measured_zero', fill: model.zero.fill, ink: model.zero.ink, outline: model.zero.outline, label: '0', sample: 0};
  // The class holding v; a value outside the built table takes the nearest class below it (or the first).
  let cls = null;
  for (const c of model?.classes || []) { if (c.lower <= v) cls = c; else break; }
  cls = cls || model?.classes?.[0];
  if (!cls) { const lut = (SCALES[metric] || COUNT_SCALE).lut, fill = lut[STEPS - 1], ink = inkFor(fill); return {state: 'measured', fill, ink, plate: contrastRatio(fill, ink) < 4.5, label: formatMetric(value, metric), sample: STEPS - 1}; }
  return {state: 'measured', fill: cls.fill, ink: cls.ink, plate: cls.plate, label: formatMetric(value, metric), sample: cls.index};
}

/** Relative luminance (sRGB) for the build-time contrast check used in tests. */
export function contrastRatio(hexA, hexB) {
  const lum = hex => {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hexA), lum(hexB)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
