/**
 * Analytical scales of the area choropleth, rankings and matrices.
 *
 * Families (LDS 0.9.7, release v0.9.7-owner.1, color-srgb-10):
 *   count          — totals (สาขา). scaleVersion 4ff5c1fb…0980, dusty cyan → editorial navy.
 *   density.capita — stores per 10,000 registered residents. scaleVersion 0b49c15c…4ab1, salmon → rose.
 * DATAVIZ-02/03: the exact approved light 41-sample LUTs are consumed unchanged
 * on both themes; class colours are LUT[round(i × 40 / (n − 1))]; no interpolation.
 *
 * The consumer (this module) declares the classification: quantile classes
 * (n = 5, fewer when there are fewer distinct values) over the current
 * children's values, on values rounded to their display precision (integers
 * for counts, one decimal for per-capita) so a displayed number and its class
 * always agree. Outliers are not clamped: the top class simply runs to the
 * maximum. Zero is a measured fact (EVID-05 measured_zero: lowest class colour
 * + zero outline), never a class of the ramp; an unknown population is
 * no_data (neutral fill), never zero; areas outside the comparison are
 * out_of_scope (nothing drawn).
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
export const METRICS = Object.freeze({
  count: {label: 'จำนวนสาขา', short: 'สาขา', legend: 'จำนวนสาขา', step: 1, digits: 0},
  capita: {label: 'สาขาต่อประชากร 10,000 คน', short: 'ต่อ 1 หมื่นคน', legend: 'สาขาต่อประชากร 10,000 คน', step: 0.1, digits: 1},
});

/** Label ink on a class fill: the darker/lighter foundation text that reaches the higher contrast. */
export function inkFor(fill) {
  const dark = '#182327', light = '#FFFFFF';
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
}

/** Exact class colours for n ∈ {3,5,7,9}: index round(i × 40 / (n − 1)). */
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
 * Quantile classes over the measured positive values (display-rounded).
 * Returns closed intervals [lower, upper] in display units; with fewer distinct
 * values than n the number of classes shrinks so intervals never overlap.
 */
export function quantileIntervals(values, n = 5, metric = 'count') {
  const step = METRICS[metric]?.step ?? 1;
  const sorted = values.map(v => displayValue(v, metric)).filter(v => v != null && v > 0).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const uppers = [];
  for (let i = 1; i <= n; i++) {
    const q = sorted[Math.min(sorted.length - 1, Math.ceil((i * sorted.length) / n) - 1)];
    if (!uppers.length || q > uppers.at(-1)) uppers.push(q);
  }
  const fix = v => (metric === 'capita' ? Math.round(v * 10) / 10 : v);
  const intervals = [];
  let lower = sorted[0];
  for (const upper of uppers) { intervals.push({lower: fix(lower), upper: fix(upper)}); lower = fix(upper + step); }
  return intervals;
}

/**
 * Build the legend/class model for the current comparison.
 * `values` are the metric values of every compared area (null = no_data, 0 = measured_zero).
 */
export function buildClasses(values, {metric = 'count', n = 5} = {}) {
  const scale = SCALES[metric] || COUNT_SCALE;
  const list = Array.isArray(values) ? values : [];
  const intervals = quantileIntervals(list, n, metric);
  const colors = classColors(n, scale);
  const picks = intervals.map((_, i) => (intervals.length === 1 ? n - 1 : Math.round((i * (n - 1)) / (intervals.length - 1))));
  const fmt = v => formatMetric(v, metric);
  const classes = intervals.map((interval, i) => ({
    index: picks[i], lower: interval.lower, upper: interval.upper, fill: colors[picks[i]], ink: inkFor(colors[picks[i]]),
    label: interval.lower === interval.upper ? fmt(interval.lower) : `${fmt(interval.lower)}–${fmt(interval.upper)}`,
  }));
  const measured = list.map(v => displayValue(v, metric)).filter(v => v != null && v > 0);
  return {
    scaleId: scale.scaleId, scaleVersion: scale.scaleVersion, metric, unit: METRICS[metric]?.legend || scale.unit, method: 'quantile',
    classCount: classes.length, max: measured.length ? Math.max(...measured) : 0, classes,
    zero: {fill: colors[0], outline: scale.zeroOutline, label: '0'}, noData: {fill: scale.noData, label: 'ไม่มีข้อมูลประชากร'},
    zeroCount: list.filter(v => v === 0).length, noDataCount: list.filter(v => v == null || !Number.isFinite(v)).length,
  };
}

/**
 * Resolve one value to its EVID-05 state and visual treatment.
 * - measured: positive → class fill · measured_zero: 0 → lowest fill + zero outline
 * - no_data: unknown (e.g. per-capita without population) → neutral fill · out_of_scope → nothing drawn
 */
export function classify(value, model, state = 'measured') {
  if (state === 'out_of_scope') return {state, fill: null, ink: null, label: 'นอกขอบเขต'};
  if (state === 'no_data' || value == null || !Number.isFinite(value)) {
    return {state: 'no_data', fill: model?.noData?.fill || COUNT_SCALE.noData, ink: '#182327', label: 'ไม่มีข้อมูล'};
  }
  const metric = model?.metric || 'count';
  const v = displayValue(value, metric);
  if (v <= 0) return {state: 'measured_zero', fill: model.zero.fill, ink: inkFor(model.zero.fill), outline: model.zero.outline, label: '0'};
  const cls = model.classes.find(c => v >= c.lower && v <= c.upper) || model.classes.at(-1);
  if (!cls) { const lut = (SCALES[metric] || COUNT_SCALE).lut; return {state: 'measured', fill: lut[40], ink: inkFor(lut[40]), label: formatMetric(value, metric), classIndex: 4}; }
  return {state: 'measured', fill: cls.fill, ink: cls.ink, label: formatMetric(value, metric), classIndex: cls.index};
}

/** Equal-interval integer classes (kept for the count matrices of the chart tray). */
export function buildCountClasses(values, n = 5) {
  const measured = (Array.isArray(values) ? values : []).filter(v => Number.isFinite(v) && v > 0);
  return buildClasses(measured, {metric: 'count', n});
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
