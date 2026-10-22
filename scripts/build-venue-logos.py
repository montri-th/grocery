#!/usr/bin/env python3
"""Build the venue-logo registry (data/venue-logos.json + assets/venue-logos/ + assets/venue-logos-manifest.json).

  python3 scripts/build-venue-logos.py <sheet csv dir> <dir with the logo files>

Inputs: tabs 10_VENUE_LOGOS (one row per venue label: logo_key, logo_filename, logo_sha256, logo_role,
logo_source_url, logo_asset_url, logo_status) and 07_VENUES (venue candidates → logo_key), plus the 128 files
of the Drive folders "Grocery_Venue_Logos_Web" (91 new) and the Luxury Brands venue library (37 reused).
Every file is verified against the sheet sha256 and copied with unchanged bytes. The venue → logo link itself
lives in data/grocery.json (venues[].logo / role); this registry only approves the files.

UI backing per mark (measured in Chromium by scripts/measure-logos.mjs): transparent marks on the LDS
surface-soft stone #E5E9E6, light transparent marks on dark #182327, opaque files on their own background.
Collecting the files is not a trademark licence; shared operator/department-store banners keep their role.
"""
import csv, hashlib, json, shutil, subprocess, sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'assets' / 'venue-logos'
STONE, DARK, WHITE = '#E5E9E6', '#182327', '#FFFFFF'
MIME = {'png': 'image/png', 'jpeg': 'image/jpeg', 'jpg': 'image/jpeg', 'svg': 'image/svg+xml', 'webp': 'image/webp'}
PRIVATE = ('drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'googleusercontent.com')
ROLES = {'venue_specific': 'โลโก้ของสถานที่โดยตรง', 'venue_specific_composite': 'โลโก้ของสถานที่ (ภาพรวม)', 'parent_complex': 'โลโก้โครงการแม่',
         'parent_complex_symbol': 'สัญลักษณ์โครงการแม่', 'shared_department_store_banner': 'แบนเนอร์ห้างสรรพสินค้าที่ใช้ร่วมกัน',
         'shared_chain_banner': 'แบนเนอร์เครือที่ใช้ร่วมกัน', 'shared_operator_banner': 'แบนเนอร์ผู้ให้บริการที่ใช้ร่วมกัน (เช่น สถานีบริการน้ำมัน)'}


# Backing rule (shared with build-brand-logos.py): any transparency → stone, unless the artwork is light
# (mean opaque luminance > 0.8 or > 70 % very light pixels) → dark; fully opaque files keep their own corner
# colour (white when the corners disagree). OVERRIDES record a visual review where the measure misleads.
OVERRIDES = {'all-seasons-place.png': DARK}  # white wordmark under a large green/red symbol: unreadable on stone


def backing(name, m):
    if name in OVERRIDES: return OVERRIDES[name]
    if m['clearShare'] > 0.005:
        return DARK if (m['meanOpaqueLuminance'] > 0.8 or m['lightOpaqueShare'] > 0.7) else STONE
    return m['background'] if m['solid'] and m['background'] else WHITE


def public_url(value):
    try:
        u = urlparse((value or '').strip())
    except Exception:
        return None
    host = (u.hostname or '').lower()
    if u.scheme != 'https' or '.' not in host or any(host == h or host.endswith('.' + h) for h in PRIVATE): return None
    return value.strip()


def main(sheet, files):
    files = Path(files)
    labels = list(csv.DictReader(open(Path(sheet) / '10_VENUE_LOGOS.csv', encoding='utf-8')))
    venues = list(csv.DictReader(open(Path(sheet) / '07_VENUES.csv', encoding='utf-8')))
    measures = json.loads(subprocess.run(['node', str(ROOT / 'scripts' / 'measure-logos.mjs'), str(files)], capture_output=True, text=True, check=True, cwd=ROOT).stdout)
    by_key = {}
    for l in labels:
        if not l['logo_key']: continue
        e = by_key.setdefault(l['logo_key'], {'key': l['logo_key'], 'filename': l['logo_filename'], 'sha256': l['logo_sha256'].lower(), 'role': l['logo_role'],
                                               'sourcePage': None, 'assetURL': None, 'status': l['logo_status'], 'checkedOn': l['logo_checked_on'], 'labels': []})
        e['labels'].append(l['canonical_venue_name'] or l['venue_label'])
        e['sourcePage'] = e['sourcePage'] or public_url(l['logo_source_url'])
        e['assetURL'] = e['assetURL'] or public_url(l['logo_asset_url'])
    linked = {}
    for v in venues:
        if v['logo_key']: linked[v['logo_key']] = linked.get(v['logo_key'], 0) + int(float(v['observed_store_rows'] or 0))
    if OUT_DIR.exists(): shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)
    assets, manifest, issues = [], [], []
    for key, e in sorted(by_key.items()):
        src = files / e['filename']
        if not src.exists(): issues.append({'key': key, 'file': e['filename'], 'reason': 'missing'}); continue
        data = src.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != e['sha256']: issues.append({'key': key, 'file': e['filename'], 'reason': 'sha256 mismatch'}); continue
        m = measures[e['filename']]
        background = backing(e['filename'], m)
        shutil.copyfile(src, OUT_DIR / e['filename'])
        ext = e['filename'].rsplit('.', 1)[1].lower()
        assets.append({'key': key, 'file': f'assets/venue-logos/{e["filename"]}', 'mime': MIME[ext], 'bytes': len(data), 'sha256': digest,
                       'width': round(m['width'], 2), 'height': round(m['height'], 2), 'background': background, 'role': e['role'],
                       'sourcePage': e['sourcePage'], 'assetURL': e['assetURL'], 'sourceKind': 'official_venue' if e['status'] == 'ได้โลโก้สถานที่' else 'shared_or_other'})
        manifest.append({'path': f'assets/venue-logos/{e["filename"]}', 'key': key, 'sha256': digest, 'bytes': len(data), 'role': e['role'],
                         'sourcePage': e['sourcePage'], 'assetURL': e['assetURL'], 'status': e['status'], 'checkedOn': e['checkedOn'],
                         'labels': sorted(set(e['labels']))[:12], 'labelCount': len(set(e['labels'])), 'storeRows': linked.get(key, 0)})
    meta = {'asOf': '2026-10-22', 'version': '2026-10-22-r1', 'count': len(assets), 'expected': len(by_key), 'folder': 'assets/venue-logos/',
            'registry': 'CityMETER Grocery Thailand — Source Audit / Refresh Master 2026-10-22, tabs 07_VENUES and 10_VENUE_LOGOS',
            'status': 'complete' if not issues else f'partial: {len(assets)} of {len(by_key)} verified', 'roles': ROLES,
            'identityRole': 'Help recognise the place a branch name refers to (venue candidates); the venue name stays the record of identity',
            'backgroundRule': f'transparent marks on {STONE} (LDS surface-soft stone), light transparent marks on {DARK}, opaque files on their own background; artwork bytes unchanged',
            'licenseNote': 'การรวบรวมไฟล์ไม่ใช่ใบอนุญาตเครื่องหมายการค้า สิทธิ์ยังเป็นของเจ้าของ; แสดงเพื่อช่วยจำสถานที่ที่ชื่อสาขาอ้างถึงเท่านั้น',
            'venueLink': 'venue candidates come from an explicit phrase in the branch name or address (name_based_needs_review); not a confirmed inside relationship'}
    (ROOT / 'data' / 'venue-logos.json').write_text(json.dumps({'meta': meta, 'assets': assets, 'issues': issues}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    (ROOT / 'assets' / 'venue-logos-manifest.json').write_text(json.dumps({'checkedOn': '2026-10-22', 'source': meta['registry'], 'status': meta['status'], 'files': manifest, 'issues': issues}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'assets {len(assets)} of {len(by_key)} · issues {len(issues)} {issues[:3]}')
    bg = {}
    for a in assets: bg[a['background']] = bg.get(a['background'], 0) + 1
    print('backgrounds', bg)


if __name__ == '__main__':
    if len(sys.argv) < 3: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
