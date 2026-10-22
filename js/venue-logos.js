/**
 * Venue logos — identity support for the place a branch name refers to (venue
 * candidates of the research sheet: shopping centres, fuel stations, hospitals,
 * campuses …). Registry: data/venue-logos.json (scripts/build-venue-logos.py,
 * 128 files verified against tab 10_VENUE_LOGOS sha256, bytes unchanged in
 * assets/venue-logos/). The venue → logo link travels with the venue record in
 * data/grocery.json (venues[].logo, venues[].role); nothing is fuzzy-matched.
 *
 * Rules: the venue name stays the record of identity; a logo never changes a
 * row, a name, a coordinate or a status. Shared banners (fuel-station operator,
 * department store, chain) and parent-complex marks keep their role so the UI
 * can say so. Collecting the files is not a trademark licence.
 */
const FILE_PATTERN = /^assets\/venue-logos\/[A-Za-z0-9._-]+\.(svg|png|jpe?g|webp)$/;
const MIME_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']);
export const ROLE_LABELS = Object.freeze({
  venue_specific: '', venue_specific_composite: '', parent_complex: 'โลโก้โครงการแม่', parent_complex_symbol: 'สัญลักษณ์โครงการแม่',
  shared_department_store_banner: 'โลโก้ห้างสรรพสินค้าในเครือ', shared_chain_banner: 'โลโก้เครือ', shared_operator_banner: 'โลโก้ผู้ให้บริการ', none: '',
});
let assets = new Map(), meta = {}, configured = false;

function approvedAsset(item) {
  if (!item || typeof item !== 'object' || !/^VL-[a-f0-9]{16}$/.test(item.key || '') || !FILE_PATTERN.test(item.file || '')) return null;
  const width = Number(item.width), height = Number(item.height);
  if (!MIME_TYPES.has(item.mime) || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !(width > 0) || !(height > 0)) return null;
  return Object.freeze({key: item.key, file: item.file, mime: item.mime, width, height, sha256: item.sha256,
    background: /^#[0-9A-Fa-f]{6}$/.test(item.background || '') ? item.background : '#E5E9E6',
    sourcePage: typeof item.sourcePage === 'string' ? item.sourcePage : '', sourceKind: item.sourceKind || ''});
}

/** Load the registry; returns coverage figures and rejected records (never throws on a bad catalog). */
export function configureVenueLogos(catalog) {
  assets = new Map(); meta = {};
  const issues = [];
  const list = Array.isArray(catalog?.assets) ? catalog.assets : [];
  if (!Array.isArray(catalog?.assets)) issues.push({reason: 'invalid_catalog'});
  for (const item of list) { const a = approvedAsset(item); if (a) assets.set(a.key, a); else issues.push({reason: 'invalid_asset', key: item?.key}); }
  meta = catalog?.meta && typeof catalog.meta === 'object' ? catalog.meta : {};
  configured = true;
  return {assets: assets.size, issues, complete: issues.length === 0};
}

/** The logo of a venue record ({name, logo, role}); null when none. */
export function getVenueLogo(venue) {
  if (!configured || !venue?.logo) return null;
  const asset = assets.get(venue.logo);
  if (!asset) return null;
  const role = venue.role || 'venue_specific';
  return {...asset, role, roleLabel: ROLE_LABELS[role] ?? '', altTh: `โลโก้ ${venue.name || ''}`.trim()};
}

/**
 * Markup: a backplate box with the image (decorative unless `decorative: false`).
 * `size` sm (list rows, 28 px tall) | md (store facts, 36 px) | lg (venue heading, 56 px).
 */
export function venueLogoMarkup(venue, {className = '', size = 'sm', decorative = true} = {}) {
  const logo = getVenueLogo(venue);
  if (!logo) return '';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const role = logo.roleLabel ? ` data-role="${esc(logo.role)}" title="${esc(logo.roleLabel)}"` : ` data-role="${esc(logo.role)}"`;
  return `<span class="venue-logo venue-logo-${esc(size)}${className ? ' ' + esc(className) : ''}" style="--venue-logo-bg:${esc(logo.background)}"${role}><img src="${esc(logo.file)}" width="${Math.round(logo.width)}" height="${Math.round(logo.height)}" alt="${decorative ? '' : esc(logo.altTh)}" loading="lazy" decoding="async"></span>`;
}

export function venueLogoMeta() { return {...meta, count: assets.size}; }
