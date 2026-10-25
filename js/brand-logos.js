/**
 * Brand logos — identity support for store pins, lists and details.
 * Registry: data/brand-logos.json + sprite assets/brand-logos.svg (scripts/build-brand-logos.py,
 * 17 grocery brands from tab 01_BRANDS, sha256-verified, original bytes embedded unchanged).
 * Format artwork is a separate catalog collection with an explicit parent brand;
 * it can identify Foodplace without creating another grocery brand.
 * Lookup by the exact brand name or id (normalised: NFKC, case, quotes, dashes, spaces); no fuzzy matching.
 */
// Approved identity aliases only (none are needed for the 17 grocery brands; kept as the extension point).
const ALIASES = [['Lotuss', "Lotus's"], ['Seven Eleven', '7-Eleven'], ['ถูกดี', 'ถูกดี มีมาตรฐาน']];
const SPRITE_PATH = 'assets/brand-logos.svg';
const MIME_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']);
let registry = new Map(), byId = new Map(), formatRegistry = new Map(), formatById = new Map(), ambiguous = new Set(), issues = [], configured = false, spriteRevision = null;

export function normalizeBrandLabel(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u2010\u2011]/g, '-').replace(/\s+/g, ' ') : '';
}

function publicSourceURL(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
      /(^|\.)(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com|googleusercontent\.com)$/.test(host) ||
      /^[\d.]+$/.test(host) || host.includes(':')) return null;
    return url.href;
  } catch { return null; }
}

function approvedRecord(item) {
  if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim() ||
    !/^[a-z0-9_-]+$/i.test(item.id || '') || !/^logo-[a-z0-9_-]+$/.test(item.spriteId || '')) return null;
  const sourceURL = publicSourceURL(item.publicsourceURL || item.publicSourceURL || item.sourceURL);
  const assetURL = item.assetURL ? publicSourceURL(item.assetURL) : undefined;
  const width = Number(item.width), height = Number(item.height);
  if (!sourceURL || (item.assetURL && !assetURL) || !/^[a-f0-9]{64}$/i.test(item.sourceSHA256 || '') ||
    !MIME_TYPES.has(item.mime) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  const crop=item.viewportCrop,cropValid=crop&&[crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)&&crop.x>=0&&crop.y>=0&&crop.width>0&&crop.height>0&&crop.x+crop.width<=width+.01&&crop.y+crop.height<=height+.01;
  const ratio=cropValid?crop.width/crop.height:width/height,artWidth=Math.min(296,136*ratio),artHeight=Math.min(136,296/ratio);
  const presentation={x:160-artWidth/2-8,y:80-artHeight/2-8,width:artWidth+16,height:artHeight+16};
  return Object.freeze({presentation:Object.freeze(presentation),displayRatio:presentation.width/presentation.height,id: item.id, name: item.name.trim(), spriteId: item.spriteId,
    sourceURL, publicsourceURL: sourceURL, assetURL, sourceSHA256: item.sourceSHA256.toLowerCase(),
    mime: item.mime, width, height, background: /^#[0-9a-f]{6}$/i.test(item.background || '') ? item.background : null,
    sourceKind: typeof item.sourceKind === 'string' ? item.sourceKind : '',
    legacyName: typeof item.legacyName === 'string' ? item.legacyName : undefined,
    altTh: typeof item.altTh === 'string' ? item.altTh : '', altEn: typeof item.altEn === 'string' ? item.altEn : ''});
}

export function configureBrandLogos(catalog, rows = []) {
  const keys = new Map(), ids = new Map(), conflicts = new Set(), failures = [], spriteOwners = new Map();
  const formatKeys = new Map(), formatIds = new Map();
  const records = Array.isArray(catalog?.brands) ? catalog.brands : [];
  if (!Array.isArray(catalog?.brands)) failures.push({reason: 'invalid_catalog'});
  const revision = catalog?.meta?.spriteRevision;
  const validatedRevision = typeof revision === 'string' && /^(?:[a-f0-9]{12}|[a-f0-9]{64})$/i.test(revision)
    ? revision.slice(0, 12).toLowerCase() : null;
  if (revision !== undefined && revision !== null && !validatedRevision) failures.push({reason: 'invalid_sprite_revision'});
  const addKey = (label, record) => {
    const key = normalizeBrandLabel(label);
    if (!key || conflicts.has(key)) return;
    const previous = keys.get(key);
    if (previous && previous.id !== record.id) { keys.delete(key); conflicts.add(key); }
    else keys.set(key, record);
  };
  for (const item of records) {
    const record = approvedRecord(item);
    if (!record) { failures.push({id: String(item?.id || ''), name: String(item?.name || ''), reason: 'invalid_record'}); continue; }
    if (ids.has(record.id) || spriteOwners.has(record.spriteId)) {
      failures.push({id: record.id, name: record.name, reason: 'duplicate_identity_or_sprite'}); continue;
    }
    ids.set(record.id, record); spriteOwners.set(record.spriteId, record.id);
    addKey(record.name, record); addKey(record.id, record);
  }
  if (catalog?.formats !== undefined && !Array.isArray(catalog.formats)) failures.push({reason: 'invalid_format_catalog'});
  for (const item of Array.isArray(catalog?.formats) ? catalog.formats : []) {
    const record = approvedRecord(item);
    if (!record || !ids.has(item.parentBrandId) || ids.has(record.id) || formatIds.has(record.id) || spriteOwners.has(record.spriteId)) {
      failures.push({id: String(item?.id || ''), reason: 'invalid_format_or_parent'}); continue;
    }
    const format = Object.freeze({...record, parentBrandId: item.parentBrandId});
    formatIds.set(format.id, format); spriteOwners.set(format.spriteId, format.id);
    formatKeys.set(normalizeBrandLabel(format.id), format);
    formatKeys.set(normalizeBrandLabel(format.name), format);
  }
  // Alias targets must resolve to an approved catalog identity; no partial/fuzzy matching.
  for (const [alias, target] of ALIASES) {
    const record = ids.get(target) || keys.get(normalizeBrandLabel(target));
    if (record) addKey(alias, record);
  }
  registry = keys; byId = ids; ambiguous = conflicts; issues = failures; configured = Array.isArray(catalog?.brands);
  formatRegistry = formatKeys; formatById = formatIds;
  spriteRevision = validatedRevision;
  return logoCoverage(rows);
}

export function getBrandLogo(brand) {
  const key = normalizeBrandLabel(brand);
  return key && !ambiguous.has(key) ? registry.get(key) || null : null;
}

export function getFormatLogo(key) {
  return formatRegistry.get(normalizeBrandLabel(key)) || null;
}

function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

function logoMarkup(logo, {className = '', decorative = true} = {}) {
  if (!logo) return '';
  const classes = escapeMarkup(['brand-logo', typeof className === 'string' ? className.trim() : ''].filter(Boolean).join(' '));
  const accessible = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${escapeMarkup(logo.altTh || logo.altEn || logo.name)}"`;
  const title = decorative ? '' : `<title>${escapeMarkup(logo.name)}</title>`;
  const spritePath = spriteRevision ? `${SPRITE_PATH}?v=${spriteRevision}` : SPRITE_PATH;
  const box=logo.presentation,viewBox=[box.x,box.y,box.width,box.height].map(n=>Number(n.toFixed(3))).join(' ');
  return `<svg class="${classes}" viewBox="${viewBox}" style="--logo-ratio:${logo.displayRatio.toFixed(4)};--logo-backing:${logo.background||'#FFFFFF'}" ${accessible} focusable="false">${title}<use width="320" height="160" href="${spritePath}#${logo.spriteId}"></use></svg>`;
}

export function brandLogoMarkup(brand, {formatLogoKey = null, ...options} = {}) {
  const parent = getBrandLogo(brand), format = formatLogoKey ? getFormatLogo(formatLogoKey) : null;
  return logoMarkup(parent && format?.parentBrandId === parent.id ? format : parent, options);
}

export function logoCoverage(rows = []) {
  const values = Array.isArray(rows) ? rows : [];
  const labels = [...new Set(values.map(row => typeof row === 'string' ? row : row?.brand).filter(label => typeof label === 'string' && label.trim()))];
  const missingBrands = labels.filter(label => !getBrandLogo(label));
  const matchedRows = values.filter(row => getBrandLogo(typeof row === 'string' ? row : row?.brand)).length;
  const matchedIdentities = new Set(labels.map(label => getBrandLogo(label)?.id).filter(Boolean));
  return {configured, spriteRevision, totalRows: values.length, matchedRows, missingRows: values.length - matchedRows,
    totalBrands: labels.length, matchedBrands: labels.length - missingBrands.length, missingBrands,
    matchedIdentities: matchedIdentities.size, catalogBrands: byId.size,
    catalogFormats: formatById.size,
    ambiguousBrands: labels.filter(label => ambiguous.has(normalizeBrandLabel(label))),
    aliasConflicts: [...ambiguous], invalidCatalog: issues.map(issue => ({...issue})),
    complete: configured && !issues.length && !ambiguous.size && !missingBrands.length && matchedRows === values.length};
}
