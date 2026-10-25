/**
 * Reading panel views as HTML strings. Pure: no DOM access, no map.
 *
 * Every actionable element carries data-action (and data-id / data-value) and
 * the app binds one delegated click handler. Actions:
 *   select-area (data-level, data-index) · select-store · select-venue · filter-brand · filter-type
 *   back · explore-top · clear-focus · open-charts · open-table · clear-filter · set-metric
 *
 * Copy is Thai, short and natural (owner rule from Luxury Brands: no caveats on
 * screen — provenance lives in the store facts, help and docs). Units:
 * สาขา = one source row of a chain; แบรนด์ = distinct brands; ประชากร = registered
 * residents; ต่อ 1 หมื่นคน = stores per 10,000 residents. Missing is never zero.
 * Metric tiles and section headings carry pictograms (Material Symbols Rounded
 * subset, js/navigation.js PICTOGRAM_CONTRACT); the text is the meaning.
 */
import {safeURL, withNoun} from './model.js?v=20261025-fp2';
import {brandLogoMarkup, getBrandLogo} from './brand-logos.js?v=20261025-fp2';
import {venueLogoMarkup, getVenueLogo} from './venue-logos.js?v=20261025-fp2';
import {formatMetric} from './scales.js?v=20261025-fp2';
import {readOperationalEvidence, readHostLocationEvidence} from './profile-model.js?v=20261025-fp2';

const NUMBER = new Intl.NumberFormat('th-TH', {maximumFractionDigits: 0});
const DEC1 = new Intl.NumberFormat('th-TH', {minimumFractionDigits: 1, maximumFractionDigits: 1});
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const num = n => (Number.isFinite(n) ? NUMBER.format(n) : '—');
const pct = n => `${NUMBER.format(Math.round(n))}%`;
const pop = n => (Number.isFinite(n) && n > 0 ? NUMBER.format(n) : '—');

export function link(url, label, cls = 'source-link') {
  const u = safeURL(url);
  return u ? `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
}

export function thaiDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

export function statusPill(status) {
  if (!status) return '';
  return `<span class="status-pill tone-${esc(status.tone)}" title="${esc(status.detail)}">${esc(status.label)}</span>`;
}

/** Metric tile with a pictogram (decorative); `display` overrides the formatted value. */
export function metricTile(value, label, kind = '', display = null) {
  return `<div class="metric${kind ? ` metric-${kind}` : ''}"><i class="metric-symbol pictogram pic-${esc(kind || 'plain')}" aria-hidden="true"></i><strong class="data-number">${esc(display ?? num(value))}</strong><span>${esc(label)}</span></div>`;
}
/** Section heading with a pictogram. */
export const heading = (kind, text, id = '') => `<h3${id ? ` id="${esc(id)}"` : ''}><i class="pictogram pic-${esc(kind)}" aria-hidden="true"></i>${esc(text)}</h3>`;

const areaButton = (a, label = a.name) => `<button type="button" class="link-button" data-action="select-area" data-level="${esc(a.level)}" data-index="${a.index}">${esc(label)}</button>`;

/** Store-type bars (fixed series order). */
export function typeBars(mix) {
  if (!mix.length) return '<p class="hint">ไม่มีสาขาในตัวกรองนี้</p>';
  const max = Math.max(1, ...mix.map(t => t.count));
  return `<ul class="mix-list" aria-label="ประเภทร้าน (สาขา)">${mix.map(t => `
    <li><button type="button" class="mix-button" data-action="filter-type" data-value="${esc(t.id)}" aria-label="${esc(t.th)} ${num(t.count)} สาขา (${pct(t.share * 100)}) กดเพื่อดูเฉพาะประเภทนี้">
      <span class="mix-label"><i class="category-swatch type-${esc(t.id)}" aria-hidden="true"></i>${esc(t.th)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill type-${esc(t.id)}" style="width:${Math.max(2, Math.round((t.count / max) * 100))}%"></span></span>
      <span class="mix-value data-number" aria-hidden="true">${num(t.count)}<small>${pct(t.share * 100)}</small></span></button></li>`).join('')}</ul>`;
}

/** Brand rows with logos (top `limit`). */
export function brandRows(mix, limit = 8) {
  if (!mix.length) return '';
  const max = Math.max(1, ...mix.map(b => b.count));
  return `<ul class="brand-mix" aria-label="แบรนด์ (สาขา)">${mix.slice(0, limit).map(b => `
    <li><button type="button" class="brand-mix-row" data-action="filter-brand" data-value="${esc(b.brand.id)}" aria-label="${esc(b.brand.name)} ${num(b.count)} สาขา (${pct(b.share * 100)}) กดเพื่อดูเฉพาะแบรนด์นี้">
      ${getBrandLogo(b.brand.name) ? brandLogoMarkup(b.brand.name, {className: 'mix-logo'}) : '<span class="mix-logo"></span>'}
      <span class="brand-mix-name">${esc(b.brand.name)}</span>
      <span class="mix-track" aria-hidden="true"><span class="mix-fill brand-fill" style="width:${Math.max(2, Math.round((b.count / max) * 100))}%"></span></span>
      <span class="mix-value data-number" aria-hidden="true">${num(b.count)}<small>${pct(b.share * 100)}</small></span></button></li>`).join('')}</ul>
    ${mix.length > limit ? `<p class="hint">อีก ${num(mix.length - limit)} แบรนด์ในตาราง</p>` : ''}`;
}

/** Metric switch (map + rankings): จำนวนสาขา | ต่อประชากร. */
export function metricSwitch(metric) {
  return `<div class="metric-switch" role="group" aria-label="ตัวเลขบนแผนที่">
    <button type="button" data-action="set-metric" data-value="count" aria-pressed="${metric === 'count'}">จำนวนสาขา</button>
    <button type="button" data-action="set-metric" data-value="capita" aria-pressed="${metric === 'capita'}">ต่อ 1 หมื่นคน</button></div>`;
}

/* ---------- Overview (country · province · district) ---------- */

/**
 * ctx = {aha, focusMode ('auto'|'explicit'|'none'), focusNames, metric, summary {count, brands, pop, perCapita, areaName},
 *        ranking [{area,index,level,name,count,perCapita,fill}], typeMix, brandMix, venues, nouns, asOf, levelLabel}
 */
export function renderOverview(ctx) {
  const {aha, focusMode = 'auto', metric, summary, ranking = [], nouns} = ctx;
  let ahaHTML;
  if (!summary.count) {
    ahaHTML = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบแรก</p><h2>ไม่พบสาขาตามตัวกรองนี้</h2>
      <div class="aha-actions"><button type="button" data-action="clear-filter" data-id="all" class="btn">ล้างตัวกรอง</button></div></section>`;
  } else if (aha && aha.top.length) {
    const k = aha.top.length;
    const where = aha.level === 'country' ? '' : `ใน${esc(aha.nouns.areaName)}`;
    const childThis = `${esc(aha.nouns.child)}${aha.nouns.child.endsWith('.') ? ' ' : ''}นี้`;
    const headline = `ของสาขา${where}อยู่ใน${k > 1 ? ` ${num(k)} ` : ''}${childThis}`;
    const compare = aha.popShare == null
      ? `<p class="aha-compare">ยังไม่มีข้อมูลประชากรครบ${esc(withNoun('ทุก', aha.nouns.child))} จึงไม่เทียบกับจำนวนคน</p>`
      : `<p class="aha-compare">ซึ่งมีคน${aha.comparison === 'less' ? 'แค่' : ''} <strong class="data-number">${pct(aha.popShare)}</strong> ของ${esc(aha.nouns.area)}</p>`;
    const bars = aha.popShare == null ? '' : `<div class="aha-bars" aria-hidden="true">
        <span class="aha-bar"><span class="aha-bar-label">สาขา</span><span class="aha-bar-track"><span class="aha-bar-fill stores" style="width:${Math.max(2, aha.share)}%"></span></span><b class="data-number">${pct(aha.share)}</b></span>
        <span class="aha-bar"><span class="aha-bar-label">คน</span><span class="aha-bar-track"><span class="aha-bar-fill people" style="width:${Math.max(2, aha.popShare)}%"></span></span><b class="data-number">${pct(aha.popShare)}</b></span></div>`;
    const names = aha.top.map(t => areaButton(t.area, t.name)).join(' · ');
    const toggle = focusMode === 'auto'
      ? `<button type="button" data-action="clear-focus" class="btn">${esc(withNoun('ดูทุก', aha.nouns.child))}</button>`
      : focusMode === 'explicit'
        ? `<button type="button" data-action="clear-focus" class="btn">${esc(withNoun('ดูทุก', aha.nouns.child))}</button>`
        : `<button type="button" data-action="explore-top" class="btn primary">โฟกัส ${num(k)} ${childThis}</button>`;
    if (focusMode === 'explicit') {
      ahaHTML = `<section class="aha is-focused" aria-label="ข้อค้นพบ"><p class="eyebrow">กำลังสำรวจ ${num(ctx.focusNames.length)} ${esc(aha.nouns.child)}</p>
        <h2>${ctx.focusNames.map(a => areaButton(a.area, a.name)).join(' · ')}</h2>
        <p class="aha-copy"><strong class="data-number">${num(summary.focusCount)}</strong> สาขา · <strong class="data-number">${num(summary.focusBrands)}</strong> แบรนด์</p>
        <div class="aha-actions">${toggle}<button type="button" data-action="open-charts" class="btn quiet">${esc(withNoun('เปรียบเทียบ', aha.nouns.child))}</button></div></section>`;
    } else {
      ahaHTML = `<section class="aha${focusMode === 'auto' ? ' is-auto' : ''}" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบแรก</p>
        <h2><span class="aha-number data-number">${pct(aha.share)}</span><span class="aha-headline">${headline}</span></h2>
        ${compare}${bars}
        <p class="aha-copy">${names}<br><strong class="data-number">${num(aha.topCount)}</strong> จาก ${num(aha.total)} สาขา</p>
        <div class="aha-actions">${toggle}<button type="button" data-action="open-charts" class="btn quiet">${esc(withNoun('เปรียบเทียบ', aha.nouns.child))}</button></div></section>`;
    }
  } else {
    ahaHTML = `<section class="aha" aria-label="ข้อค้นพบ"><p class="eyebrow">ข้อค้นพบแรก</p><h2>${num(summary.count)} สาขา</h2></section>`;
  }
  const metrics = `<section class="metrics" aria-label="ตัวเลขของ${esc(summary.areaName)}">
    ${metricTile(summary.count, 'สาขา', 'store')}
    ${metricTile(summary.brands, 'แบรนด์', 'brand')}
    ${metricTile(summary.pop, 'ประชากร', 'population', pop(summary.pop))}
    ${metricTile(summary.perCapita, 'ต่อ 1 หมื่นคน', 'capita', formatMetric(summary.perCapita, 'capita'))}
  </section>`;
  const rankTitle = metric === 'capita' ? `${nouns.child}ที่มีสาขาต่อคนมากที่สุด` : `${nouns.child}ที่มีสาขามากที่สุด`;
  const top = ranking.slice(0, 10);
  const max = Math.max(metric === 'capita' ? 0.1 : 1, ...top.map(a => (metric === 'capita' ? a.perCapita ?? 0 : a.count)));
  const rankList = top.length ? `<section class="panel-section" aria-labelledby="rank-title">
    <div class="section-heading">${heading(nouns.childPictogram || 'area', rankTitle, 'rank-title')}<span class="hint">${num(ranking.length)} ${esc(nouns.child)}</span></div>
    ${metricSwitch(metric)}
    <ol class="rank-list">${top.map((a, i) => {
      const value = metric === 'capita' ? a.perCapita : a.count;
      const shown = metric === 'capita' ? formatMetric(a.perCapita, 'capita') : num(a.count);
      return `<li><button type="button" class="rank-row${a.quiet ? ' is-quiet' : ''}" data-action="select-area" data-level="${esc(a.level)}" data-index="${a.index}"
        aria-label="อันดับ ${i + 1} ${esc(a.name)} ${num(a.count)} สาขา ${a.perCapita == null ? '' : `${formatMetric(a.perCapita, 'capita')} ต่อ 1 หมื่นคน`}">
        <span class="rank-index data-number" aria-hidden="true">${i + 1}</span>
        <span class="rank-name">${esc(a.name)}<small>${metric === 'capita' ? `${num(a.count)} สาขา` : (a.perCapita == null ? 'ไม่มีข้อมูลประชากร' : `${formatMetric(a.perCapita, 'capita')} ต่อ 1 หมื่นคน`)}</small></span>
        <span class="rank-track" aria-hidden="true"><span class="rank-fill" style="width:${value == null ? 0 : Math.max(3, Math.round((value / max) * 100))}%;background:${esc(a.fill || 'var(--scale-count-3)')}"></span></span>
        <span class="rank-value data-number" aria-hidden="true">${esc(shown)}</span></button></li>`;
    }).join('')}</ol>
    ${ranking.length > top.length ? `<button type="button" class="btn quiet more" data-action="open-charts">ดูทั้ง ${num(ranking.length)} ${esc(nouns.child)}ในกราฟ</button>` : ''}
  </section>` : '';
  const types = `<section class="panel-section"><div class="section-heading">${heading('type', 'ประเภทร้าน')}<span class="hint">สาขา · สัดส่วน</span></div>${typeBars(ctx.typeMix)}</section>`;
  const brands = ctx.brandMix.length ? `<section class="panel-section"><div class="section-heading">${heading('brand', 'แบรนด์')}<span class="hint">${num(ctx.brandMix.length)} แบรนด์</span></div>${brandRows(ctx.brandMix)}</section>` : '';
  const sourceCount = ctx.supplementalPointRows ? ` · ${num(ctx.sourcePointRows)} จุดจาก CityMETER + ${num(ctx.supplementalPointRows)} สาขาเพิ่มจากแบรนด์ (${esc(thaiDate(ctx.refreshCheckedOn))})` : '';
  return `${ahaHTML}${metrics}${rankList}${types}${brands}<p class="hint panel-foot">CityMETER Grocery · ข้อมูล ${esc(thaiDate(ctx.asOf))}${sourceCount} · ${num(ctx.apiTotal)} สาขาตามยอดใน CityMETER</p>`;
}

/* ---------- Local unit (อปท. / ย่าน) ---------- */

export function renderUnit(p) {
  if (!p) return '';
  const ins = p.insight;
  let compare = '';
  if (ins?.ratio != null && Number.isFinite(ins.ratio)) {
    const r = ins.ratio;
    const word = r >= 1.15 ? `มากกว่าค่าเฉลี่ย${esc(p.districtLabel)} ${DEC1.format(r)} เท่า` : r <= 0.87 ? `น้อยกว่าค่าเฉลี่ย${esc(p.districtLabel)} (${DEC1.format(r)} เท่า)` : `ใกล้ค่าเฉลี่ย${esc(p.districtLabel)}`;
    compare = `<p class="unit-compare">สาขาต่อคน${word}<small>${formatMetric(p.perCapita, 'capita')} เทียบ ${formatMetric(ins.districtPerCapita, 'capita')} ต่อ 1 หมื่นคน</small></p>`;
  } else if (!p.pop) compare = '<p class="unit-compare is-muted">ไม่มีข้อมูลประชากรของพื้นที่นี้ จึงไม่คิดสาขาต่อคน</p>';
  // สถานที่ is the next crumb below อปท./ย่าน (release 0.2): listed first, each row opens the venue level.
  const venues = p.venues.length ? `<section class="panel-section"><div class="section-heading">${heading('venue', 'สถานที่ตามชื่อสาขา')}<span class="hint">${num(p.venues.length)} แห่ง</span></div>
    <ul class="venue-list">${p.venues.slice(0, 10).map(v => venueRow(v)).join('')}</ul>
    ${p.venues.length > 10 ? `<p class="hint">+ อีก ${num(p.venues.length - 10)} แห่งในตาราง</p>` : ''}</section>` : '';
  return `<section class="detail-head">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      <p class="eyebrow">${esc(p.kind)}${ins?.rank ? ` · อันดับ ${num(ins.rank)} จาก ${num(ins.siblings)} ใน${esc(p.districtLabel)}` : ''}</p>
      <h2>${esc(p.name)}</h2><p class="subtle">${areaButton(p.district, p.districtLabel)} · ${areaButton(p.province)}${p.nameEn ? ` · ${esc(p.nameEn)}` : ''}</p>
      <div class="metrics compact">${metricTile(p.count, 'สาขา', 'store')}${metricTile(p.brands, 'แบรนด์', 'brand')}${metricTile(p.pop, 'ประชากร', 'population', pop(p.pop))}${metricTile(p.perCapita, 'ต่อ 1 หมื่นคน', 'capita', formatMetric(p.perCapita, 'capita'))}</div>
      ${compare}
      <div class="detail-actions"><button type="button" class="btn" data-action="open-table">ดูสาขา</button><button type="button" class="btn quiet" data-action="open-charts">เปรียบเทียบใน${esc(p.districtLabel)}</button></div>
    </section>
    ${venues}
    <section class="panel-section"><div class="section-heading">${heading('type', 'ประเภทร้าน')}<span class="hint">สาขา · สัดส่วน</span></div>${typeBars(p.typeMix)}</section>
    ${p.brandMix.length ? `<section class="panel-section"><div class="section-heading">${heading('brand', 'แบรนด์')}<span class="hint">${num(p.brandMix.length)} แบรนด์</span></div>${brandRows(p.brandMix)}</section>` : ''}
    <section class="panel-section boundary"><div class="section-heading"><h3>ขอบเขตพื้นที่</h3><span class="hint">${p.areaKm2 ? `${DEC1.format(p.areaKm2)} ตร.กม.` : ''}</span></div>
      <p class="subtle">${p.unit.kind === 'L' ? 'ย่าน (Locale) ของกรุงเทพมหานครใน CityMETER' : `รหัส อปท. ${esc(p.unit.key)} (กรมส่งเสริมการปกครองท้องถิ่น)`} · ขอบเขตและประชากรจาก CityMETER</p>
      <p class="links">${link(p.production, 'ดูพื้นที่นี้ใน CityMETER')}</p>
    </section>`;
}

function venueRow(v) {
  const logo = getVenueLogo(v.venue);
  return `<li><button type="button" class="venue-row${logo ? ' has-logo' : ''}" data-action="select-venue" data-id="${v.venue.index}" aria-label="${esc(v.venue.name)} ${num(v.count)} สาขา">
    ${venueLogoMarkup(v.venue, {size: 'sm'})}<span class="venue-name">${esc(v.venue.name)}<small>${esc(v.venue.typeTh)}</small></span>
    <span class="venue-count data-number">${num(v.count)}<small>สาขา</small></span></button></li>`;
}
export {venueRow};

/** A usable result, an explicit missing state, or a retry; never a tenancy claim. */
function buildingFactMarkup(fact) {
  if (!fact) return '';
  const sources = (fact.sources || []).map(source => link(source.url, source.label) || esc(source.label)).filter(Boolean).join(' · ');
  return `<span>${esc(fact.label)}</span>${fact.detail ? `<br><span class="hint">${esc(fact.detail)}</span>` : ''}${fact.heightLabel ? `<br><span class="hint">${esc(fact.heightLabel)}</span>` : ''}${sources ? `<br><span class="hint">แหล่งอาคาร: ${sources}</span>` : ''}${fact.state === 'unavailable' ? '<br><button type="button" class="link-button" data-action="retry-spatial">ลองโหลดข้อมูลอาคารอีกครั้ง</button>' : ''}`;
}

/* ---------- Venue candidate ---------- */

export function renderVenue(v, extra = {}) {
  if (!v) return '';
  const logo = getVenueLogo(v.venue);
  const rows = v.rows.map(r => `<li><button type="button" class="brand-row" data-action="select-store" data-id="${esc(r.key)}">${brandLogoMarkup(r.brand, {formatLogoKey: r.formatLogoKey})}<span><strong>${esc(r.brand)}</strong><br><span class="small muted">${esc(r.name)}</span></span></button></li>`).join('');
  return `<section class="detail-head venue${logo ? ' has-venue-logo' : ''}">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      ${logo ? venueLogoMarkup(v.venue, {size: 'lg', className: 'detail-venue-logo', decorative: false}) : ''}
      <p class="eyebrow">${esc(v.venue.typeTh)}${logo?.roleLabel ? ` · <span class="venue-logo-role">${esc(logo.roleLabel)}</span>` : ''}</p>
      <h2>${esc(v.venue.name)}</h2>
      <p class="subtle">${v.unit ? `${areaButton(v.unit, v.unitLabel)} · ` : ''}${areaButton(v.district, v.districtLabel)} · ${areaButton(v.province)}</p>
      <div class="metrics compact">${metricTile(v.count, 'สาขา', 'store')}${metricTile(v.brands, 'แบรนด์', 'brand')}</div>
      <p class="hint">ชื่อสาขาหรือที่อยู่ระบุสถานที่นี้</p>
      ${extra.building || extra.buildingReference ? `<dl class="facts">${extra.buildingReference ? `<dt>อาคารสถานที่</dt><dd>${buildingFactMarkup(extra.buildingReference)}</dd>` : ''}${extra.building ? `<dt>อาคารตามพิกัด</dt><dd>${buildingFactMarkup(extra.building)}</dd>` : ''}</dl>` : ''}
    </section>
    <section class="panel-section"><div class="section-heading">${heading('store', 'สาขา')}<span class="hint">${num(v.rows.length)}</span></div><ul class="outlet-list">${rows}</ul></section>`;
}

/* ---------- Store ---------- */

export function renderStore(d, extra = {}) {
  if (!d) return '';
  const r = d.row;
  const logo = getBrandLogo(r.brand);
  const activity = r.supplemental ? readOperationalEvidence(d.operationalEvidence) : null;
  const hostLocation = r.supplemental ? readHostLocationEvidence(d.hostLocationEvidence) : null;
  const coords = Number.isFinite(r.lat) ? `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}` : 'ยังไม่มีพิกัด';
  const address = extra.detail
    ? (extra.detail.address ? esc(extra.detail.address) : '<span class="hint">แหล่งข้อมูลไม่ระบุที่อยู่</span>')
    : (extra.detailError ? '<span class="hint">โหลดที่อยู่ไม่สำเร็จ</span>' : '<span class="hint">กำลังโหลดที่อยู่…</span>');
  const place = [
    ...d.units.map(u => areaButton(u, extra.unitLabel?.(u) || u.name)),
    areaButton(d.district, extra.districtLabel || d.district.name),
    areaButton(d.province),
  ].join(' · ');
  const tile = extra.detail?.tile ? `https://landometer.com/api/v2/citymeter-v3/grocery/overlayMvt/10/${extra.detail.tile}?inTileType=SUBDISTRICT&inTileId=${encodeURIComponent(extra.detail.tileArea || '')}` : '';
  const nearbyTitle = d.nearbyScope === 'unit' ? `${r.brand} อื่นในพื้นที่เดียวกัน` : `${r.brand} อื่นในอำเภอเดียวกัน`;
  return `<section class="detail-head store">
      <button type="button" class="btn quiet back" data-action="back">กลับ</button>
      ${logo ? brandLogoMarkup(r.brand, {className: 'detail-logo', decorative: false, formatLogoKey: r.formatLogoKey}) : ''}
      <p class="eyebrow"><i class="category-swatch type-${esc(r.type)}" aria-hidden="true"></i> ${esc(d.type.th)}${d.format ? ` · ${esc(d.format)}` : ''}</p>
      <h2>${esc(r.brand)}</h2>
      <p class="subtle">${esc(r.name)}</p>
      <p class="store-status">${statusPill(d.status)}</p>
      <dl class="facts">
        <dt>ที่อยู่</dt><dd class="fact-address">${address}${extra.detail?.subdistrict ? `<br><span class="hint">ตำบล/แขวง${esc(extra.detail.subdistrict)}</span>` : ''}</dd>
        ${hostLocation ? `<dt>ชั้นและอาคาร</dt><dd title="ชั้นร้านและจำนวนชั้นอาคารตามข้อมูลผู้ใช้">${esc(hostLocation.selectedStoreFloor)} · อาคารจอดรถ ${num(hostLocation.ownerReportedStoreys)} ชั้น<br><span class="hint">${link(hostLocation.sourceURL, 'ข้อมูลผู้ใช้')} · ${esc(thaiDate(hostLocation.checkedOn))}</span></dd>` : ''}
        <dt>พื้นที่</dt><dd>${place}</dd>
        ${d.venue ? `<dt>สถานที่</dt><dd class="fact-venue">${venueLogoMarkup(d.venue, {size: 'md'})}<span><button type="button" class="link-button" data-action="select-venue" data-id="${d.venue.index}">${esc(d.venue.name)}</button><br><span class="hint">${esc(d.venue.typeTh)} · ตามชื่อสาขา</span></span></dd>` : ''}
        ${extra.buildingReference ? `<dt>อาคารสถานที่</dt><dd>${buildingFactMarkup(extra.buildingReference)}</dd>` : ''}
        ${extra.building ? `<dt>อาคารตามพิกัด</dt><dd>${buildingFactMarkup(extra.building)}</dd>` : ''}
        <dt>พิกัด</dt><dd><span class="data-number">${esc(coords)}</span><br><span class="hint" title="${esc(d.geometry.note)}">${esc(d.geometry.label)}${d.coLocated ? ` · ร่วมพิกัดกับอีก ${num(d.coLocated)} สาขา` : ''}</span></dd>
        <dt>แหล่งข้อมูล</dt><dd>${esc(d.source?.label || '')}${d.source?.date ? `<br><span class="hint">${esc(d.source.date)}</span>` : ''}</dd>
        ${d.formatEvidence ? `<dt>ข้อมูลรูปแบบร้าน</dt><dd>${link(d.formatEvidence.url, d.formatEvidence.name)} · ${esc(thaiDate(d.formatEvidence.checkedOn))}${d.formatEvidence.sourceFormat && d.formatEvidence.sourceFormat !== d.format ? `<br><span class="hint">รูปแบบในข้อมูลเดิม: ${esc(d.formatEvidence.sourceFormat)}</span>` : ''}</dd>` : ''}
        ${activity ? `<dt>กิจกรรมล่าสุด</dt><dd title="ประกาศรับสมัครของนายจ้าง ไม่ใช่การตรวจยืนยันการเปิดหน้าร้าน">${link(activity.url, 'รับสมัครพนักงานสาขานี้')} · ${esc(thaiDate(activity.sourcePublishedOn))}</dd>` : ''}
        ${r.supplemental && r.refresh?.evidence?.contactStatusType === 'inactive' ? `<dt>สถานะในแหล่งข้อมูล</dt><dd>${esc(d.status.detail)}</dd>` : ''}
        ${extra.detail?.uuid ? `<dt>รหัส</dt><dd><span class="data-number id-text">${esc(extra.detail.uuid)}</span></dd>` : ''}
      </dl>
      <p class="links">${link(d.brand.locatorURL, 'ค้นหาสาขาของแบรนด์')} ${link(d.source?.url && d.source.url !== d.brand.locatorURL ? d.source.url : '', 'แหล่งข้อมูล')} ${link(tile, 'tile ต้นทาง')} ${link(d.production, 'ดูใน CityMETER')}</p>
    </section>
    <section class="panel-section"><div class="section-heading">${heading('store', nearbyTitle)}<span class="hint">${num(d.nearbyCount)} สาขา · ${num(d.brandInProvince)} ใน${esc(d.province.name)}</span></div>
      ${d.nearby.length ? `<ul class="outlet-list">${d.nearby.slice(0, 10).map(s => `<li><button type="button" class="brand-row" data-action="select-store" data-id="${esc(s.key)}"><span><strong>${esc(s.name)}</strong><br><span class="small muted">${esc(extra.placeOf?.(s) || '')}</span></span></button></li>`).join('')}</ul>` : '<p class="hint">ไม่มี</p>'}
      <div class="detail-actions"><button type="button" class="btn quiet" data-action="filter-brand" data-value="${esc(d.brand.id)}">ดูเฉพาะ ${esc(r.brand)}</button></div>
    </section>`;
}

/* ---------- Active filter chips ---------- */

export function renderFilterChips(values, labels) {
  const chips = [];
  const push = (key, text) => chips.push(`<li><button type="button" class="filter-chip" data-action="clear-filter" data-id="${esc(key)}" aria-label="ล้างตัวกรอง ${esc(text)}"><span>${esc(text)}</span><i aria-hidden="true">×</i></button></li>`);
  if (values.search) push('search', `ค้นหา “${values.search}”`);
  if (values.brand) push('brand', labels.brand[values.brand] || values.brand);
  if (values.type) push('type', labels.type[values.type] || values.type);
  if (values.format) push('format', labels.format?.[values.format] || values.format);
  return chips.length ? `<ul class="filter-chips" aria-label="ตัวกรองที่ใช้อยู่">${chips.join('')}<li><button type="button" class="filter-chip clear-all" data-action="clear-filter" data-id="all">ล้างทั้งหมด</button></li></ul>` : '';
}
