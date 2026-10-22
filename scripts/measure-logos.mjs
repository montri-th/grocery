// Measure logo files in Chromium: natural size and the ink box after trimming
// transparent or solid-neutral outer whitespace (the same rule as the Luxury
// Brands sprite). Usage: node scripts/measure-logos.mjs <dir> > measures.json
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => /\.(svg|png|jpe?g|webp)$/i.test(f)).sort();
const mime = f => ({svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp'})[f.split('.').pop().toLowerCase()];
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const out = {};
for (const f of files) {
  const bytes = fs.readFileSync(path.join(dir, f));
  const uri = `data:${mime(f)};base64,${bytes.toString('base64')}`;
  out[f] = await page.evaluate(async uri => {
    const img = new Image();
    img.src = uri;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.max(1, Math.min(8, 1600 / Math.max(w, h)));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, cw, ch);
    const d = g.getImageData(0, 0, cw, ch).data;
    const px = (x, y) => { const i = (y * cw + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    // Border colour: the four corners must agree for a solid background.
    const corners = [px(0, 0), px(cw - 1, 0), px(0, ch - 1), px(cw - 1, ch - 1)];
    const transparent = corners.every(p => p[3] < 8);
    const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 24 && Math.abs(a[3] - b[3]) <= 8;
    const solid = !transparent && corners.every(p => near(p, corners[0])) && corners[0][3] > 247;
    const bg = corners[0];
    const neutral = solid && Math.max(bg[0], bg[1], bg[2]) - Math.min(bg[0], bg[1], bg[2]) <= 12;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, opaquePixels = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const p = px(x, y);
      if (p[3] > 247) opaquePixels++;
      const ink = transparent ? p[3] >= 8 : (neutral ? !near(p, bg) : true);
      if (ink) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    }
    // Backing decision inputs, independent of the trim: share of (semi)transparent pixels, and the mean
    // luminance / very-light share of the opaque pixels (alpha > 127) — the artwork a backing must carry.
    let clear = 0, opaqueN = 0, lumSum = 0, light = 0;
    for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) {
      const p = px(x, y);
      if (p[3] < 128) { clear++; continue; }
      opaqueN++; const lum = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; lumSum += lum; if (lum > 0.86) light++;
    }
    const sampled = clear + opaqueN;
    return {width: w, height: h, scale, transparent, solid, neutral, background: solid ? '#' + bg.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() : null,
      ink: x1 >= 0 ? {x: x0 / scale, y: y0 / scale, width: (x1 - x0 + 1) / scale, height: (y1 - y0 + 1) / scale} : null,
      opaqueShare: opaquePixels / (cw * ch), clearShare: sampled ? clear / sampled : 0, meanOpaqueLuminance: opaqueN ? lumSum / opaqueN : 0, lightOpaqueShare: opaqueN ? light / opaqueN : 0};
  }, uri);
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
