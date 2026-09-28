/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Enclosed holes of a row-span region: the gaps that cannot reach the
 * outside. Filling them turns the silhouette of a wall (material only) into
 * its outline (material plus enclosed openings), whatever the outline's shape.
 *
 * Per row, the complement of the merged spans is two outer runs (before the
 * first span, after the last) and zero or more inner gaps. Inner gaps of
 * neighbouring rows that overlap along the wall belong to the same region;
 * a region is exterior as soon as one of its gaps lies in the first or last
 * row, or overlaps an outer run (or an empty row) of a neighbouring row.
 * Everything else is a hole. Connectivity is edge-wise: gaps that only touch
 * at a corner do not join.
 */

import type { RowSpans } from './row-spans.js';

/** Overlap below this (m) does not connect two gaps: 1 µm, far below the row step. */
const TOUCH = 1e-6;
/** Gaps narrower than this (m) are seams between parts, not holes: 0.1 mm. */
const MIN_GAP = 1e-4;

export interface HoleResult {
  /** Number of enclosed holes. */
  count: number;
  /** Their total area (m²). */
  area: number;
  /** Per hole: area (m²), sorted large to small. */
  areas: number[];
}

interface Gap { row: number; a: number; b: number }

export function findHoles(spans: RowSpans): HoleResult {
  const gaps: Gap[] = [];
  const rowStart = new Int32Array(spans.rows + 1);
  const rowFirst = new Float64Array(spans.rows).fill(NaN);
  const rowLast = new Float64Array(spans.rows).fill(NaN);
  for (let j = 0; j < spans.rows; j++) {
    rowStart[j] = gaps.length;
    const m = spans.merged(j);
    if (m.length === 0) continue;
    rowFirst[j] = m[0];
    rowLast[j] = m[m.length - 1];
    for (let k = 1; k + 1 < m.length; k += 2) if (m[k + 1] - m[k] >= MIN_GAP) gaps.push({ row: j, a: m[k], b: m[k + 1] });
  }
  rowStart[spans.rows] = gaps.length;

  const parent = Int32Array.from({ length: gaps.length }, (_, i) => i);
  const exterior = new Uint8Array(gaps.length);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const touchesOuter = (g: Gap, j: number): boolean => {
    if (j < 0 || j >= spans.rows || Number.isNaN(rowFirst[j])) return true;
    return g.a < rowFirst[j] - TOUCH || g.b > rowLast[j] + TOUCH;
  };

  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    if (touchesOuter(g, g.row - 1) || touchesOuter(g, g.row + 1)) exterior[i] = 1;
    const j = g.row + 1;
    if (j >= spans.rows) continue;
    for (let k = rowStart[j]; k < rowStart[j + 1]; k++) {
      const h = gaps[k];
      if (Math.min(g.b, h.b) - Math.max(g.a, h.a) <= TOUCH) continue;
      const ri = find(i), rk = find(k);
      if (ri !== rk) parent[rk] = ri;
    }
  }
  const outside = new Set<number>();
  for (let i = 0; i < gaps.length; i++) if (exterior[i]) outside.add(find(i));
  const byRoot = new Map<number, number>();
  for (let i = 0; i < gaps.length; i++) {
    const r = find(i);
    if (outside.has(r)) continue;
    byRoot.set(r, (byRoot.get(r) ?? 0) + (gaps[i].b - gaps[i].a) * spans.dh);
  }
  const areas = [...byRoot.values()].sort((x, y) => y - x);
  return { count: areas.length, area: areas.reduce((s, x) => s + x, 0), areas };
}
