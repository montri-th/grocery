/**
 * Chart models for the bottom tray — the children of the compared area (77
 * provinces, a province's districts, a district's local units; at unit level
 * the unit's siblings). Pure: no DOM.
 *
 *  ranking — per child: stores, share of the area's stores, share of the
 *            children's population, stores per 10,000 residents;
 *  matrix  — children × store types, or children × brands (store counts).
 * Shares use the same counting as the Aha (hierarchy.js); population shares are
 * given only when every child has a registered population.
 */
import {TYPE_ORDER} from './model.js';
import {summarizeChildren, rankChildren, areaRows, comparisonRows, CHILD_LEVEL, levelOf} from './hierarchy.js';

export function buildRankingModel(model, rows, compareSel, metric = 'count') {
  const summary = summarizeChildren(model, rows, compareSel);
  const total = areaRows(rows, compareSel).length;
  const popComplete = summary.length > 0 && summary.every(c => c.pop != null);
  const popTotal = popComplete ? summary.reduce((s, c) => s + c.pop, 0) : null;
  const children = rankChildren(summary, metric).map((c, i) => ({
    ...c, rank: i + 1,
    // Share of the compared area's own stores (as in the Aha); `count` stays the child's full count.
    storeShare: total ? (c.inArea / total) * 100 : 0,
    popShare: popComplete && popTotal ? (c.pop / popTotal) * 100 : null,
  }));
  return {level: CHILD_LEVEL[levelOf(compareSel)], children, total, popComplete, popTotal, metric,
    withStores: children.filter(c => c.count > 0).length};
}

/**
 * children × columns matrix of store counts. columns: 'types' (5 fixed, series
 * order) or 'brands' (the leading brands of the compared rows).
 */
export function buildMatrixModel(model, rows, compareSel, columns = 'types', {areaLimit = 12, columnLimit = 8} = {}) {
  const level = CHILD_LEVEL[levelOf(compareSel)];
  // Every member of a shown child counts in its row (a unit keeps its full production count).
  const scoped = comparisonRows(model, rows, compareSel);
  const ranked = rankChildren(summarizeChildren(model, rows, compareSel), 'count').filter(c => c.count > 0);
  const areas = ranked.slice(0, areaLimit);
  const ids = new Set(areas.map(a => a.index));
  const keyOf = r => (columns === 'brands' ? r.b : r.type);
  let cols;
  if (columns === 'brands') {
    const counts = new Map();
    for (const r of scoped) counts.set(r.b, (counts.get(r.b) || 0) + 1);
    cols = [...counts].sort((a, b) => b[1] - a[1]).slice(0, columnLimit).map(([b, count]) => ({id: b, key: model.brands[b].id, name: model.brands[b].name, count}));
  } else {
    cols = TYPE_ORDER.map(t => ({id: t, key: t, name: model.typeById.get(t)?.th || t, count: scoped.filter(r => r.type === t).length})).filter(c => c.count > 0);
  }
  const childOf = r => (level === 'province' ? [r.p] : level === 'district' ? [r.d] : r.u.filter(i => model.units[i].d === compareSel.district));
  const cell = new Map();
  for (const r of scoped) for (const ci of childOf(r)) {
    if (!ids.has(ci)) continue;
    const k = `${ci}|${keyOf(r)}`;
    cell.set(k, (cell.get(k) || 0) + 1);
  }
  const cells = areas.flatMap(a => cols.map(c => ({areaIndex: a.index, areaName: a.name, columnId: c.id, columnName: c.name, count: cell.get(`${a.index}|${c.id}`) || 0})));
  return {level, columns, areas, cols, cells, totalAreas: ranked.length, totalColumns: columns === 'brands' ? new Set(scoped.map(r => r.b)).size : cols.length};
}
