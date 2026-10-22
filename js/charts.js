/**
 * Area charts rendered as plain HTML — no chart vendor.
 *
 * Three views share the committed selection (chart-model.js):
 *  - ranking : the compared areas. With the count metric each row pairs the
 *              area's share of stores with its share of residents (the first
 *              Aha, area by area); with the per-capita metric it shows stores
 *              per 10,000 residents. Bars read the map's 41-sample colours.
 *  - mix     : areas × the five store types (store counts, numeric heat table)
 *  - brands  : areas × the leading brands (store counts)
 *
 * Colour: bars and cells use the LDS families of the map (count = dusty cyan →
 * navy, per-capita = salmon → rose; same HEX on both themes) with all 41
 * samples (js/scales.js rank-41; owner rule 2026-10-22). A matrix number whose
 * sample reaches 4.5:1 with neither ink sits on a neutral backplate. The population
 * share is a neutral bar with its own label, never a data colour. Every mark is
 * a real <button>, so keyboard and screen-reader users get the same drill-down
 * as pointer users; every click emits {type: 'area', level, index}.
 */
import {buildRankingModel, buildMatrixModel} from './chart-model.js';
import {buildScale, classify, formatMetric, STEPS} from './scales.js?v=20261022-v3';
import {rampHTML} from './ramp-legend.js?v=20261022-v3';
import {TYPE_SHORT} from './model.js';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const PCT = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 1, minimumFractionDigits: 1});
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => NUMBER.format(n);
const pct = n => `${PCT.format(n)}%`;
const LEVEL_NOUN = {province: 'จังหวัด', district: 'อำเภอ', unit: 'อปท.'};

function empty(element, message) {
  element.innerHTML = `<div class="chart-empty"><p>${esc(message)}</p></div>`;
}

function ranking(element, m, ctx, select) {
  const metric = ctx.metric;
  const values = m.children.map(c => (metric === 'capita' ? c.perCapita : c.count));
  const classes = buildScale(values, {metric});
  const list = m.children.filter(c => c.count > 0 || metric === 'capita');
  const noun = ctx.childNoun || LEVEL_NOUN[m.level] || 'พื้นที่';
  if (metric === 'capita') {
    const max = Math.max(0.1, ...list.map(c => c.perCapita ?? 0));
    element.innerHTML = `<p class="chart-caption">${num(m.children.length)} ${esc(noun)} · สาขาต่อประชากร 10,000 คน · สีเดียวกับแผนที่</p>
      <ol class="chart-bars">${list.map(c => {
        const cls = classify(c.perCapita, classes);
        const pressed = c.index === ctx.selectedIndex;
        const value = c.perCapita == null ? 'ไม่มีข้อมูลประชากร' : `${formatMetric(c.perCapita, 'capita')} ต่อ 1 หมื่นคน`;
        return `<li><button type="button" class="bar-row${pressed ? ' is-selected' : ''}" data-level="${esc(c.level)}" data-index="${c.index}" aria-pressed="${pressed}"
          aria-label="อันดับ ${c.rank} ${esc(c.name)}: ${esc(value)}, ${num(c.count)} สาขา">
          <span class="bar-rank data-number" aria-hidden="true">${c.rank}</span>
          <span class="bar-label">${esc(c.name)}</span>
          <span class="bar-track" aria-hidden="true"><span class="bar-fill${cls.state === 'no_data' ? ' is-no-data' : ''}" style="width:${c.perCapita == null ? 100 : Math.max(2, Math.round(((c.perCapita || 0) / max) * 100))}%;background:${cls.fill}"></span></span>
          <span class="bar-value" aria-hidden="true"><b class="data-number">${c.perCapita == null ? '—' : esc(formatMetric(c.perCapita, 'capita'))}</b><small>${num(c.count)} สาขา</small></span>
        </button></li>`;
      }).join('')}</ol>`;
  } else {
    const max = Math.max(1, ...list.map(c => Math.max(c.storeShare, c.popShare ?? 0)));
    element.innerHTML = `<p class="chart-caption">${num(m.withStores)} ${esc(noun)} ที่มีสาขา · ส่วนแบ่งสาขาเทียบส่วนแบ่งประชากร${m.popComplete ? '' : ' (ประชากรไม่ครบทุกพื้นที่ จึงแสดงเฉพาะสาขา)'}</p>
      <p class="chart-legend"><span class="legend-item"><i class="cue cue-stores" aria-hidden="true"></i>สาขา</span>${m.popComplete ? '<span class="legend-item"><i class="cue cue-people" aria-hidden="true"></i>ประชากร</span>' : ''}</p>
      <ol class="chart-bars paired">${list.map(c => {
        const cls = classify(c.count, classes);
        const pressed = c.index === ctx.selectedIndex;
        const people = c.popShare == null ? '' : `, ประชากร ${pct(c.popShare)}`;
        return `<li><button type="button" class="bar-row paired${pressed ? ' is-selected' : ''}" data-level="${esc(c.level)}" data-index="${c.index}" aria-pressed="${pressed}"
          aria-label="อันดับ ${c.rank} ${esc(c.name)}: ${num(c.count)} สาขา (${pct(c.storeShare)} ของสาขา${people}) กดเพื่อดูพื้นที่นี้">
          <span class="bar-rank data-number" aria-hidden="true">${c.rank}</span>
          <span class="bar-label">${esc(c.name)}</span>
          <span class="bar-pair" aria-hidden="true">
            <span class="bar-track"><span class="bar-fill" style="width:${Math.max(1.5, (c.storeShare / max) * 100)}%;background:${cls.fill}"></span></span>
            ${c.popShare == null ? '' : `<span class="bar-track people"><span class="bar-fill people" style="width:${Math.max(1.5, (c.popShare / max) * 100)}%"></span></span>`}
          </span>
          <span class="bar-value" aria-hidden="true"><b class="data-number">${pct(c.storeShare)}</b><small>${c.popShare == null ? `${num(c.count)} สาขา` : `คน ${pct(c.popShare)}`}</small></span>
        </button></li>`;
      }).join('')}</ol>`;
  }
  element.querySelectorAll('[data-index]').forEach(b => b.addEventListener('click', () => select({type: 'area', level: b.dataset.level, index: Number(b.dataset.index)})));
}

function matrix(element, m, ctx, select) {
  if (!m.areas.length) { empty(element, 'ไม่มีพื้นที่ที่มีสาขาในตัวกรองนี้'); return; }
  const classes = buildScale(m.cells.map(c => c.count), {metric: 'count'});
  const head = m.cols.map(c => `<th scope="col" title="${esc(c.name)}"><span class="matrix-col">${m.columns === 'types' ? `<i class="category-swatch type-${esc(c.id)}" aria-hidden="true"></i>${esc(TYPE_SHORT[c.id] || c.name)}` : esc(c.name)}</span></th>`).join('');
  const body = m.areas.map(a => {
    const pressed = a.index === ctx.selectedIndex;
    const cells = m.cols.map(c => {
      const count = m.cells.find(x => x.areaIndex === a.index && x.columnId === c.id)?.count || 0;
      const cls = classify(count, classes);
      const style = cls.state === 'measured_zero' ? `background:${cls.fill};color:${cls.ink};box-shadow:inset 0 0 0 2px ${cls.outline}` : `background:${cls.fill};color:${cls.ink}`;
      return `<td><button type="button" class="matrix-cell is-${cls.state}" data-level="${esc(a.level)}" data-index="${a.index}" style="${style}"
        aria-label="${esc(a.name)} × ${esc(c.name)}: ${num(count)} สาขา กดเพื่อดูพื้นที่นี้" title="${esc(a.name)} × ${esc(c.name)} — ${num(count)} สาขา"><span class="data-number${cls.plate ? ' has-plate' : ''}">${num(count)}</span></button></td>`;
    }).join('');
    return `<tr${pressed ? ' class="is-selected"' : ''}><th scope="row"><button type="button" class="matrix-row" data-level="${esc(a.level)}" data-index="${a.index}" aria-pressed="${pressed}">${esc(a.name)}<small class="data-number">${num(a.count)}</small></button></th>${cells}</tr>`;
  }).join('');
  const columns = `<colgroup><col class="matrix-head-col">${m.cols.map(() => '<col class="matrix-cell-col">').join('')}</colgroup>`;
  const noun = ctx.childNoun || LEVEL_NOUN[m.level] || 'พื้นที่';
  const what = m.columns === 'types' ? `${num(m.cols.length)} ประเภทร้าน` : `${num(m.cols.length)}/${num(m.totalColumns)} แบรนด์`;
  element.innerHTML = `<p class="chart-caption">${num(m.areas.length)}/${num(m.totalAreas)} ${esc(noun)} × ${what} · ตัวเลข = สาขา · สีเข้ม = มากกว่า</p>
    <div class="matrix-scroll"><table class="matrix" style="--matrix-columns:${m.cols.length}">${columns}<thead><tr><th scope="col" class="matrix-corner">${esc(noun)} · สาขา</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="chart-legend"><span class="legend-title">ระดับสี (สาขาในช่อง, ไล่ ${STEPS} ขั้นตามลำดับค่า):</span>${rampHTML(classes, {unit: 'สาขา', what: 'ช่อง'})}<span class="legend-step"><i class="legend-zero" aria-hidden="true"></i>0 = ไม่พบ</span></p>`;
  element.querySelectorAll('[data-index]').forEach(b => b.addEventListener('click', () => select({type: 'area', level: b.dataset.level, index: Number(b.dataset.index)})));
}

/**
 * Render one view into #elementId. Returns an idempotent disposer.
 * ctx = {model, rows, compareSel, metric, selectedIndex, childNoun}
 */
export function renderInsightChart({elementId, view = 'ranking', theme, ...ctx} = {}, onSelect = () => {}) {
  const element = document.getElementById(elementId);
  if (!element) return () => {};
  const select = typeof onSelect === 'function' ? onSelect : () => {};
  element.replaceChildren();
  if (theme) element.dataset.chartTheme = theme;
  const labels = {ranking: 'พื้นที่เรียงตามสาขาเทียบประชากร', mix: 'ประเภทร้านในแต่ละพื้นที่', brands: 'แบรนด์ในแต่ละพื้นที่'};
  element.setAttribute('aria-label', labels[view] || labels.ranking);
  if (!ctx.rows?.length) { empty(element, 'ไม่พบสาขาตามตัวกรอง'); return () => element.replaceChildren(); }
  try {
    if (view === 'mix' || view === 'brands') matrix(element, buildMatrixModel(ctx.model, ctx.rows, ctx.compareSel, view === 'brands' ? 'brands' : 'types'), ctx, select);
    else {
      const m = buildRankingModel(ctx.model, ctx.rows, ctx.compareSel, ctx.metric);
      if (!m.children.length) empty(element, 'ไม่มีพื้นที่ย่อยให้เปรียบเทียบ');
      else ranking(element, m, ctx, select);
    }
  } catch (error) {
    console.error('CityMETER insight chart could not render:', error);
    empty(element, 'แสดงกราฟไม่ได้ในขณะนี้ โปรดดูข้อมูลเดียวกันในตาราง');
  }
  return () => element.replaceChildren();
}
