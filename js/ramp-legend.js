/**
 * Legend of a rank-41 scale (js/scales.js buildScale) — owner rule 2026-10-22:
 * every colour scale shows all 41 LDS samples.
 *
 *   - the full exact ramp as 41 discrete swatches in LUT order (never a CSS
 *     gradient: a gradient would interpolate between the approved samples);
 *   - a short mark under each sample that holds at least one compared value,
 *     so the colours in use are readable when only a few areas are compared;
 *   - value ticks at the lowest, middle (median) and highest shown values,
 *     placed at their samples (rank position, not linear distance);
 *   - a text alternative with the same values for screen readers.
 * Used by the map legend (app.js renderLegend) and the matrix legend
 * (charts.js). Pure: returns an HTML string; tested in tests/scales.test.js.
 */
import {STEPS} from './scales.js?v=20261025-fp3';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ROLE = {min: 'น้อยสุด', median: 'ค่ากลาง', max: 'มากสุด', only: 'ทุกพื้นที่'};

/**
 * @param model  buildScale() result
 * @param unit   unit read after a value (e.g. "สาขา"), used in tooltips and the text alternative
 * @param what   noun for what a sample holds (e.g. "พื้นที่", "ช่อง")
 */
export function rampHTML(model, {unit = '', what = 'พื้นที่'} = {}) {
  if (!model?.classes?.length || !Array.isArray(model.lut) || model.lut.length !== STEPS) return '';
  const used = new Map(model.classes.map(c => [c.index, c]));
  const after = unit ? ` ${unit}` : '';
  const swatches = model.lut.map((hex, i) => {
    const c = used.get(i);
    const title = c ? `ขั้นสี ${i + 1}/${STEPS} · ${c.label}${after} · ${c.areas} ${what}` : `ขั้นสี ${i + 1}/${STEPS}`;
    return `<i${c ? ' class="is-used"' : ''} style="background:${hex}" title="${esc(title)}"></i>`;
  }).join('');
  const ticks = model.ticks.map(t => `<span class="ramp-tick is-${t.role}" style="--at:${(((t.index + 0.5) / STEPS) * 100).toFixed(2)}%">${esc(t.label)}</span>`).join('');
  const aria = `ไล่สี ${STEPS} ขั้นของ LDS ตามลำดับค่า: ${model.ticks.map(t => `${ROLE[t.role]} ${t.label}`).join(' · ')}${after}`;
  return `<span class="ramp" role="img" aria-label="${esc(aria)}" data-steps="${STEPS}"><span class="ramp-bar" aria-hidden="true">${swatches}</span><span class="ramp-ticks" aria-hidden="true">${ticks}</span></span>`;
}
