/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Areas in the wall plane by horizontal scanlines.
 *
 * Each row (a fixed height step) holds exact intervals along the wall, so a
 * vertical stud edge costs no sampling error at all; only horizontal edges are
 * sampled, at row centres. With a 1 mm step and members on whole millimetres
 * that is exact too. Overlapping members are merged per row, so an area is
 * always the area of the UNION, never a double count.
 *
 * Storage is flat on purpose: a wall has thousands of rows and dozens of
 * sections, and per-row JS arrays made the collector dominate the run time.
 *
 * All coordinates are wall-local (along, across, up) in metres; see
 * `wall-frame.ts`.
 *
 * Copied from `@ifc-lite/hout-percentage` (branch `houtpercentage`, not yet
 * merged); the two copies should become one shared wall-analysis module.
 */

/** Intervals closer than this (m) merge: closes float32 seams between the
 *  triangles of one face (they would otherwise read as hairline holes). */
const MERGE_TOLERANCE = 1e-5;

/** Growable flat Float64 buffer of fixed-width records. */
class Records {
  data = new Float64Array(1024);
  length = 0;
  constructor(readonly width: number) {}
  push2(a: number, b: number): void {
    this.reserve(2);
    this.data[this.length++] = a; this.data[this.length++] = b;
  }
  push3(a: number, b: number, c: number): void {
    this.reserve(3);
    this.data[this.length++] = a; this.data[this.length++] = b; this.data[this.length++] = c;
  }
  private reserve(n: number): void {
    if (this.length + n <= this.data.length) return;
    const next = new Float64Array(this.data.length * 2);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  get count(): number {
    return this.length / this.width;
  }
}

/**
 * Bucket `count` records of `width` numbers by the integer row in field 0
 * (rows 0..rows-1) and sort each bucket by field 1. Returns CSR offsets and the
 * reordered field-1 (and field-2 when present) values.
 */
function bucketByRow(rec: Records, rows: number): { start: Int32Array; a: Float64Array; b: Float64Array } {
  const n = rec.count, w = rec.width, d = rec.data;
  const start = new Int32Array(rows + 1);
  for (let i = 0; i < n; i++) start[d[i * w] + 1]++;
  for (let j = 0; j < rows; j++) start[j + 1] += start[j];
  const fill = start.slice(0, rows);
  const a = new Float64Array(n), b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = fill[d[i * w]]++;
    a[k] = d[i * w + 1];
    b[k] = w > 2 ? d[i * w + 2] : 0;
  }
  // Insertion sort per row on `a` (rows hold a handful of entries).
  for (let j = 0; j < rows; j++) {
    for (let k = start[j] + 1; k < start[j + 1]; k++) {
      const ka = a[k], kb = b[k];
      let m = k - 1;
      while (m >= start[j] && a[m] > ka) { a[m + 1] = a[m]; b[m + 1] = b[m]; m--; }
      a[m + 1] = ka; b[m + 1] = kb;
    }
  }
  return { start, a, b };
}

export class RowSpans {
  readonly rows: number;
  private readonly raw = new Records(3);
  private cache: { start: Int32Array; a: Float64Array; b: Float64Array } | null = null;

  constructor(readonly h0: number, readonly h1: number, readonly dh: number) {
    this.rows = Math.max(0, Math.ceil((h1 - h0) / dh - 1e-9));
  }

  centre(j: number): number {
    return this.h0 + (j + 0.5) * this.dh;
  }

  /** Row indices whose centre lies in [lo, hi]. */
  rowRange(lo: number, hi: number): [number, number] {
    const first = Math.max(0, Math.ceil((lo - this.h0) / this.dh - 0.5));
    const last = Math.min(this.rows - 1, Math.floor((hi - this.h0) / this.dh - 0.5));
    return [first, last];
  }

  add(j: number, a: number, b: number): void {
    if (b > a) {
      this.raw.push3(j, a, b);
      this.cache = null;
    }
  }

  private merge(): { start: Int32Array; a: Float64Array; b: Float64Array } {
    if (this.cache) return this.cache;
    const { start, a, b } = bucketByRow(this.raw, this.rows);
    // Merge overlapping intervals in place, row by row, compacting the arrays.
    const outStart = new Int32Array(this.rows + 1);
    let w = 0;
    for (let j = 0; j < this.rows; j++) {
      outStart[j] = w;
      let k = start[j];
      if (k === start[j + 1]) continue;
      let ca = a[k], cb = b[k];
      for (k++; k < start[j + 1]; k++) {
        if (a[k] <= cb + MERGE_TOLERANCE) { if (b[k] > cb) cb = b[k]; }
        else { a[w] = ca; b[w] = cb; w++; ca = a[k]; cb = b[k]; }
      }
      a[w] = ca; b[w] = cb; w++;
    }
    outStart[this.rows] = w;
    this.cache = { start: outStart, a, b };
    return this.cache;
  }

  /** Add the merged intervals of `other` (same rows: same h0, h1 and step). */
  addFrom(other: RowSpans): void {
    if (other.rows !== this.rows || other.h0 !== this.h0 || other.dh !== this.dh) throw new Error('RowSpans.addFrom: row layout differs');
    const { start, a, b } = other.merge();
    for (let j = 0; j < this.rows; j++) for (let k = start[j]; k < start[j + 1]; k++) this.raw.push3(j, a[k], b[k]);
    this.cache = null;
  }

  /** Merged, sorted intervals of row `j` as a flat [a0, b0, a1, b1, ...]. */
  merged(j: number): number[] {
    const { start, a, b } = this.merge();
    const out: number[] = [];
    for (let k = start[j]; k < start[j + 1]; k++) out.push(a[k], b[k]);
    return out;
  }

  /** Union area, optionally clipped to [uLo, uHi]. */
  area(uLo = -Infinity, uHi = Infinity): number {
    const { start, a, b } = this.merge();
    let total = 0;
    const n = start[this.rows];
    for (let k = 0; k < n; k++) {
      const lo = a[k] > uLo ? a[k] : uLo, hi = b[k] < uHi ? b[k] : uHi;
      if (hi > lo) total += hi - lo;
    }
    return total * this.dh;
  }
}

export function mergeIntervals(flat: readonly number[]): number[] {
  const n = flat.length / 2;
  if (n === 0) return [];
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => flat[2 * x] - flat[2 * y]);
  const out: number[] = [];
  let a = flat[2 * order[0]], b = flat[2 * order[0] + 1];
  for (let k = 1; k < n; k++) {
    const i = order[k];
    const s = flat[2 * i], e = flat[2 * i + 1];
    if (s <= b) b = Math.max(b, e);
    else { out.push(a, b); a = s; b = e; }
  }
  out.push(a, b);
  return out;
}

/** Local triangles: flat xyz (along, across, up) triples, 9 numbers per triangle. */
export type LocalTriangles = Float64Array;

/** Add the orthogonal projection of triangles onto the wall plane, optionally
 *  clipped to [uLo, uHi] along the wall. */
export function addProjection(target: RowSpans, tris: LocalTriangles, uLo = -Infinity, uHi = Infinity): void {
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const u0 = tris[t], u1 = tris[t + 3], u2 = tris[t + 6];
    const h0 = tris[t + 2], h1 = tris[t + 5], h2 = tris[t + 8];
    const [first, last] = target.rowRange(Math.min(h0, h1, h2), Math.max(h0, h1, h2));
    for (let j = first; j <= last; j++) {
      const hc = target.centre(j);
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 3; k++) {
        const ha = k === 0 ? h0 : k === 1 ? h1 : h2, hb = k === 0 ? h1 : k === 1 ? h2 : h0;
        const ua = k === 0 ? u0 : k === 1 ? u1 : u2, ub = k === 0 ? u1 : k === 1 ? u2 : u0;
        if ((ha <= hc && hc <= hb) || (hb <= hc && hc <= ha)) {
          if (hb === ha) {
            lo = Math.min(lo, ua, ub); hi = Math.max(hi, ua, ub);
          } else {
            const x = ua + ((hc - ha) / (hb - ha)) * (ub - ua);
            lo = Math.min(lo, x); hi = Math.max(hi, x);
          }
        }
      }
      if (lo < uLo) lo = uLo;
      if (hi > uHi) hi = uHi;
      if (hi > lo) target.add(j, lo, hi);
    }
  }
}
