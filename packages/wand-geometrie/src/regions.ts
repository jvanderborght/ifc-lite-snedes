/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Region operations on row spans that share one row layout (same h0, h1 and
 * step): holes filled, difference, square dilation, overlap area, and the
 * connected pieces of a region.
 *
 * All of them work row by row on the merged intervals, so they inherit the
 * row-span precision: exact along the wall, one row step across rows.
 */

import { holeGaps, type Gap } from './holes.js';
import { RowSpans } from './row-spans.js';

/** Overlap below this (m) does not connect two runs of neighbouring rows. */
const TOUCH = 1e-6;
/** Differences narrower than this (m) are float noise, not regions: 1 µm. */
const SLIVER = 1e-6;

function sameLayout(a: RowSpans, b: RowSpans): void {
  if (a.rows !== b.rows || a.h0 !== b.h0 || a.dh !== b.dh) throw new Error('regions: row layout differs');
}

export const emptyLike = (s: RowSpans): RowSpans => new RowSpans(s.h0, s.h1, s.dh);

/** `spans` with every enclosed hole filled: the outline of a region. */
export function fillHoles(spans: RowSpans): RowSpans {
  const out = emptyLike(spans);
  out.addFrom(spans);
  for (const hole of holeGaps(spans)) for (const g of hole) out.add(g.row, g.a, g.b);
  return out;
}

/** Row intervals of `a` not covered by `b`, as flat [a0, b0, ...]. */
function rowDifference(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  let m = 0;
  for (let k = 0; k < a.length; k += 2) {
    let lo = a[k];
    const hi = a[k + 1];
    while (m < b.length && b[m + 1] <= lo) m += 2;
    let n = m;
    while (n < b.length && b[n] < hi) {
      if (b[n] - lo > SLIVER) out.push(lo, b[n]);
      lo = Math.max(lo, b[n + 1]);
      n += 2;
    }
    if (hi - lo > SLIVER) out.push(lo, hi);
  }
  return out;
}

/** a minus b. */
export function difference(a: RowSpans, b: RowSpans): RowSpans {
  sameLayout(a, b);
  const out = emptyLike(a);
  for (let j = 0; j < a.rows; j++) {
    const d = rowDifference(a.merged(j), b.merged(j));
    for (let k = 0; k < d.length; k += 2) out.add(j, d[k], d[k + 1]);
  }
  return out;
}

/** Length of the overlap of two merged, sorted interval lists. */
export function overlapLength(a: readonly number[], b: readonly number[]): number {
  let total = 0, m = 0;
  for (let k = 0; k < a.length; k += 2) {
    while (m < b.length && b[m + 1] <= a[k]) m += 2;
    for (let n = m; n < b.length && b[n] < a[k + 1]; n += 2) {
      total += Math.max(0, Math.min(a[k + 1], b[n + 1]) - Math.max(a[k], b[n]));
    }
  }
  return total;
}

/** Area of a ∩ b (m²). */
export function overlapArea(a: RowSpans, b: RowSpans): number {
  sameLayout(a, b);
  let total = 0;
  for (let j = 0; j < a.rows; j++) total += overlapLength(a.merged(j), b.merged(j));
  return total * a.dh;
}

/** a ∩ b. */
export function intersection(a: RowSpans, b: RowSpans): RowSpans {
  return difference(a, difference(a, b));
}

/**
 * Square (Chebyshev) dilation by `d` metres: every point within `d` along the
 * wall AND within `d` in height of the region. Rows outside the layout are
 * dropped.
 */
export function dilate(spans: RowSpans, d: number): RowSpans {
  const out = emptyLike(spans);
  const k = Math.round(d / spans.dh);
  for (let j = 0; j < spans.rows; j++) {
    const m = spans.merged(j);
    if (m.length === 0) continue;
    for (let i = Math.max(0, j - k); i <= Math.min(spans.rows - 1, j + k); i++) {
      for (let n = 0; n < m.length; n += 2) out.add(i, m[n] - d, m[n + 1] + d);
    }
  }
  return out;
}

export interface Piece {
  /** The piece's runs, one or more per row. */
  runs: Gap[];
  /** Area (m²). */
  area: number;
}

/** Connected pieces of a region; runs of neighbouring rows join when they overlap along the wall. */
export function pieces(spans: RowSpans): Piece[] {
  const runs: Gap[] = [];
  const rowStart = new Int32Array(spans.rows + 1);
  for (let j = 0; j < spans.rows; j++) {
    rowStart[j] = runs.length;
    const m = spans.merged(j);
    for (let k = 0; k < m.length; k += 2) runs.push({ row: j, a: m[k], b: m[k + 1] });
  }
  rowStart[spans.rows] = runs.length;
  const parent = Int32Array.from({ length: runs.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  for (let i = 0; i < runs.length; i++) {
    const g = runs[i], j = g.row + 1;
    if (j >= spans.rows) continue;
    for (let k = rowStart[j]; k < rowStart[j + 1]; k++) {
      const h = runs[k];
      if (Math.min(g.b, h.b) - Math.max(g.a, h.a) <= TOUCH) continue;
      const ri = find(i), rk = find(k);
      if (ri !== rk) parent[rk] = ri;
    }
  }
  const byRoot = new Map<number, Piece>();
  for (let i = 0; i < runs.length; i++) {
    const r = find(i);
    const p = byRoot.get(r) ?? { runs: [], area: 0 };
    p.runs.push(runs[i]);
    p.area += (runs[i].b - runs[i].a) * spans.dh;
    byRoot.set(r, p);
  }
  return [...byRoot.values()];
}

/** Region made of the given pieces. */
export function fromPieces(layout: RowSpans, list: readonly Piece[]): RowSpans {
  const out = emptyLike(layout);
  for (const p of list) for (const g of p.runs) out.add(g.row, g.a, g.b);
  return out;
}

/** Area of one piece that lies inside `region` (m²). */
export function pieceOverlap(piece: Piece, region: RowSpans): number {
  let total = 0;
  for (const g of piece.runs) total += overlapLength([g.a, g.b], region.merged(g.row));
  return total * region.dh;
}
