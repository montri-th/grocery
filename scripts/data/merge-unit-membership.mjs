// Decode the per-unit overlay tiles (grocery/overlayMvt z10, inTileType=MUNICIPALITY|LOCALE)
// and build the source-native outlet → ML unit membership. Compares each unit's
// decoded member count with the API aggregate (grocery/info/lv1 ML totalCount).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {parseVectorTile} from '../../js/mvt.js';
const RAW = process.argv[2], OUT = process.argv[3];
const lv0 = JSON.parse(fs.readFileSync(path.join(RAW, 'base-lv0.json'))).value;
const apiCount = new Map(), kindOf = new Map(), provinceOf = new Map(), nameOf = new Map();
for (const p of lv0.provinceInfos) {
  const b = JSON.parse(fs.readFileSync(path.join(RAW, 'base-lv1', p.id + '.json'))).value;
  const g = JSON.parse(fs.readFileSync(path.join(RAW, 'grocery-lv1-ML', p.id + '.json'))).value;
  const stats = {...(g.municipalityDatas || {}), ...(g.localeDatas || {})};
  for (const [kind, list] of [['M', b.municipalityInfos], ['L', b.localeInfos]]) for (const m of list) {
    apiCount.set(m.id, stats[m.id]?.rows?.[0]?.totalCount ?? 0); kindOf.set(m.id, kind); provinceOf.set(m.id, p.code); nameOf.set(m.id, m.nameTh);
  }
}
const dir = path.join(RAW, 'ml-overlay');
const members = new Map(); // unit -> Set(outlet)
const outletUnits = new Map(); // outlet -> Set(unit)
const props = new Map(); // outlet -> properties (first seen)
let tiles = 0, features = 0, emptyTiles = 0;
for (const unit of fs.readdirSync(dir)) {
  const set = new Set();
  for (const f of fs.readdirSync(path.join(dir, unit))) {
    const bytes = zlib.gunzipSync(fs.readFileSync(path.join(dir, unit, f)));
    tiles++;
    if (!bytes.length) { emptyTiles++; continue; }
    const vt = parseVectorTile(bytes);
    const layer = vt.layers['layer-grocery-detail'];
    if (!layer) { emptyTiles++; continue; }
    for (const feat of layer.features) {
      const id = feat.properties?.id;
      if (!id) continue;
      features++;
      set.add(id);
      if (!props.has(id)) props.set(id, feat.properties);
    }
  }
  members.set(unit, set);
  for (const id of set) { if (!outletUnits.has(id)) outletUnits.set(id, new Set()); outletUnits.get(id).add(unit); }
}
let exact = 0, diff = [];
for (const [unit, n] of apiCount) {
  if (n <= 0) continue;
  const got = members.get(unit)?.size ?? 0;
  if (got === n) exact++; else diff.push({unit, name: nameOf.get(unit), kind: kindOf.get(unit), province: provinceOf.get(unit), api: n, decoded: got});
}
const multi = [...outletUnits].filter(([, s]) => s.size > 1).map(([id, s]) => ({id, units: [...s]}));
// Every unit an outlet belongs to (15 outlets sit in two overlapping units at the source).
const membership = Object.fromEntries([...outletUnits].map(([id, s]) => [id, [...s].sort()]));
const result = {
  generatedFrom: 'grocery/overlayMvt z10 per ML unit (inTileType MUNICIPALITY|LOCALE)',
  unitsWithApiCount: [...apiCount.values()].filter(n => n > 0).length, unitsFetched: members.size,
  tiles, emptyTiles, features, outlets: outletUnits.size,
  exactUnits: exact, mismatchedUnits: diff.length, multiUnitOutlets: multi.length,
  mismatches: diff, multi, membership,
};
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(JSON.stringify({...result, membership: undefined, mismatches: diff.slice(0, 10), multi: multi.slice(0, 5)}, null, 1));
