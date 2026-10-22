#!/usr/bin/env python3
"""Build the brand-logo sprite and registry for the 17 Grocery brands.

  python3 scripts/build-brand-logos.py <sheet csv dir> <dir with the logo files>

Inputs: tab 01_BRANDS (logo_filename, logo_sha256, logo_source_url, logo_asset_url, logo_status, logo_notes)
and the files from the Drive folder "Grocery_Brand_Logos_Web" (downloaded by the owner's approval 2026-10-22).
Every file is verified against the sheet sha256 before use. Outputs:
  assets/brand-logos.svg             one <symbol viewBox="0 0 320 160"> per brand, original bytes embedded unchanged
  data/brand-logos.json              registry read by js/brand-logos.js
  assets/brand-logos-manifest.json   provenance per file (source page, asset URL, sha256, rights note)

Same contract as CityMETER Luxury Brands: deterministic viewport trim of transparent or solid-neutral outer
whitespace only (with a safety margin); UI backing = LDS surface-soft stone #E5E9E6 for transparent marks,
dark #182327 for light marks, the file's own white #FFFFFF for opaque white sources. No recolouring, inversion,
ink cropping or tracing. Collecting the files is not a trademark licence.
"""
import base64, csv, hashlib, json, subprocess, sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
STONE, DARK, WHITE = '#E5E9E6', '#182327', '#FFFFFF'
MIME = {'svg': 'image/svg+xml', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
PRIVATE = ('drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'googleusercontent.com')


def public_url(value):
    try:
        u = urlparse((value or '').strip())
    except Exception:
        return None
    host = (u.hostname or '').lower()
    if u.scheme != 'https' or '.' not in host or any(host == h or host.endswith('.' + h) for h in PRIVATE): return None
    return value.strip()


# Backing rule (shared with build-venue-logos.py): any transparency → stone, unless the artwork is light
# (mean opaque luminance > 0.8 or > 70 % very light pixels) → dark; fully opaque files keep their own corner
# colour (white when the corners disagree). OVERRIDES record a visual review where the measure misleads.
OVERRIDES = {}


def backing(name, m):
    if name in OVERRIDES: return OVERRIDES[name]
    if m['clearShare'] > 0.005:
        return DARK if (m['meanOpaqueLuminance'] > 0.8 or m['lightOpaqueShare'] > 0.7) else STONE
    return m['background'] if m['solid'] and m['background'] else WHITE


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def main(sheet, files):
    files = Path(files)
    rows = list(csv.DictReader(open(Path(sheet) / '01_BRANDS.csv', encoding='utf-8')))
    measures = json.loads(subprocess.run(['node', str(ROOT / 'scripts' / 'measure-logos.mjs'), str(files)], capture_output=True, text=True, check=True, cwd=ROOT).stdout)
    symbols, brands, manifest, issues = [], [], [], []
    rows.sort(key=lambda b: b['brand_id'])
    for b in rows:
        fn = b['logo_filename']
        path = files / fn
        if not path.exists(): issues.append({'brand': b['brand_id'], 'reason': 'missing file'}); continue
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != b['logo_sha256'].lower(): issues.append({'brand': b['brand_id'], 'reason': 'sha256 mismatch'}); continue
        m = measures[fn]
        w, h = float(m['width']), float(m['height'])
        ink = m['ink'] or {'x': 0, 'y': 0, 'width': w, 'height': h}
        trim = m['transparent'] or m['neutral']
        if trim:
            margin = max(1.0, 0.02 * max(ink['width'], ink['height']))
            x0, y0 = max(0.0, ink['x'] - margin), max(0.0, ink['y'] - margin)
            x1, y1 = min(w, ink['x'] + ink['width'] + margin), min(h, ink['y'] + ink['height'] + margin)
            crop = {'x': round(x0, 2), 'y': round(y0, 2), 'width': round(x1 - x0, 2), 'height': round(y1 - y0, 2)}
        else:
            crop = {'x': 0, 'y': 0, 'width': round(w, 2), 'height': round(h, 2)}
        background = backing(fn, m)
        ext = fn.rsplit('.', 1)[1].lower()
        mime = MIME[ext]
        sprite_id = 'logo-' + b['brand_id'].lower()
        uri = f'data:{mime};base64,' + base64.b64encode(data).decode()
        symbols.append(f'<symbol id="{sprite_id}" viewBox="0 0 320 160"><title>{esc(b["brand_name"])}</title><rect width="320" height="160" fill="{background}"/>'
                       f'<svg x="12" y="12" width="296" height="136" viewBox="{crop["x"]} {crop["y"]} {crop["width"]} {crop["height"]}" preserveAspectRatio="xMidYMid meet" overflow="hidden">'
                       f'<image x="0" y="0" width="{round(w, 2)}" height="{round(h, 2)}" preserveAspectRatio="xMidYMid meet" href="{uri}"/></svg></symbol>')
        official = b['logo_status'] == 'ได้ไฟล์จากแบรนด์'
        source = public_url(b['logo_source_url'])
        asset = public_url(b['logo_asset_url'])
        if not source: issues.append({'brand': b['brand_id'], 'reason': 'no public source page'}); continue
        record = {'id': b['brand_id'], 'name': b['brand_name'], 'spriteId': sprite_id, 'sourceURL': source, 'sourceSHA256': digest,
                  'mime': mime, 'width': round(w, 2), 'height': round(h, 2), 'bytes': len(data), 'background': background,
                  'sourceKind': 'official_brand' if official else 'retailer_or_reference', 'altTh': f'โลโก้ {b["brand_name"]}', 'altEn': f'{b["brand_name"]} logo',
                  'viewportCrop': crop}
        if asset: record['assetURL'] = asset
        brands.append(record)
        manifest.append({'brand': b['brand_id'], 'name': b['brand_name'], 'file': fn, 'sha256': digest, 'bytes': len(data), 'mime': mime,
                         'sourcePage': source, 'assetURL': asset, 'status': b['logo_status'], 'checkedOn': b['logo_checked_on'],
                         'notes': b['logo_notes'], 'background': background, 'viewportCrop': crop})
    sprite = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>' + ''.join(symbols) + '</defs></svg>\n'
    (ROOT / 'assets' / 'brand-logos.svg').write_text(sprite, encoding='utf-8')
    sprite_sha = hashlib.sha256(sprite.encode('utf-8')).hexdigest()
    counts = {'official': sum(1 for b in brands if b['sourceKind'] == 'official_brand'), 'reference': sum(1 for b in brands if b['sourceKind'] != 'official_brand')}
    transformation = ('Original approved logo bytes embedded unchanged as SVG image data URI; deterministic viewport trim of transparent or '
                      f'solid-neutral outer whitespace only with safety margin. Added UI backing is LDS surface-soft stone {STONE} for '
                      f'{sum(1 for b in brands if b["background"] == STONE)} marks, original white {WHITE} for {sum(1 for b in brands if b["background"] == WHITE)} '
                      f'opaque-white sources and dark {DARK} for {sum(1 for b in brands if b["background"] == DARK)} light marks. No source image recoloring, inversion, ink cropping or tracing.')
    meta = {'asOf': '2026-10-22', 'version': '2026-10-22-r1', 'count': len(brands), 'spriteURL': 'assets/brand-logos.svg', 'spriteSHA256': sprite_sha,
            'spriteRevision': sprite_sha[:12], 'symbolViewBox': '0 0 320 160', 'officialBrandSources': counts['official'],
            'retailerOrReferenceSources': counts['reference'], 'missingAssets': 17 - len(brands),
            'identityRole': 'Identify each grocery brand in CityMETER Grocery store pins, lists and details',
            'transformation': transformation,
            'rights': 'Brand marks remain the property of their owners. Identification in this owner-requested public demo does not imply endorsement or a trademark license.'}
    (ROOT / 'data' / 'brand-logos.json').write_text(json.dumps({'meta': meta, 'brands': brands}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    (ROOT / 'assets' / 'brand-logos-manifest.json').write_text(json.dumps({'version': meta['version'], 'createdOn': '2026-10-22', 'count': len(brands),
        'publicationBasis': {'kind': 'user_requested_brand_identity_display', 'scope': 'Identify brands in the owner-requested public CityMETER Grocery demo: store pins, lists and details.',
                             'rightsStatement': 'Brand marks remain owned by their respective owners. This request and manifest do not grant additional trademark rights, imply endorsement or establish a new image license.'},
        'transformation': transformation, 'sprite': {'path': 'assets/brand-logos.svg', 'sha256': sprite_sha}, 'files': manifest, 'issues': issues}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'brands {len(brands)} / {len(rows)} · issues {issues} · sprite {len(sprite)} bytes {sprite_sha[:12]}')
    for b in brands: print(f"  {b['id']:16} {b['background']} crop {b['viewportCrop']} {b['sourceKind']}")


if __name__ == '__main__':
    if len(sys.argv) < 3: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
