/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Planar faces (outer loop plus optional inner loops) and their exact
 * projection onto the wall plane.
 *
 * Both geometry sources end up here: a triangle mesh is a set of one-loop
 * faces, an authored faceted B-rep keeps its polygons (with holes). Per row,
 * the crossings of all loop edges of one face are paired even-odd, which is
 * exact for any planar polygon with holes and needs no triangulation. Edges
 * are half-open in height, so a vertex exactly on a row centre is crossed
 * once. A face square to the wall projects to a line and adds nothing.
 */

import type { RowSpans } from './row-spans.js';
import { toLocal, type WallFrame } from './wall-frame.js';

export interface FaceSet {
  /** xyz triples. World: Y-up metres; after `toLocalFaces`: (along, across, up). */
  points: Float64Array;
  /** Loop k spans points loopStart[k] .. loopStart[k+1]-1. Length: loops + 1. */
  loopStart: Int32Array;
  /** Face f spans loops faceStart[f] .. faceStart[f+1]-1. Length: faces + 1. */
  faceStart: Int32Array;
}

export interface MeshPiece {
  /** xyz triples, metres (Y-up), relative to `origin` when given. */
  positions: Float32Array | Float64Array | number[];
  indices: Uint32Array | number[];
  origin?: readonly [number, number, number];
}

/** Triangle meshes as one-loop faces. */
export function meshFaces(pieces: readonly MeshPiece[]): FaceSet {
  let n = 0;
  for (const p of pieces) n += Math.floor(p.indices.length / 3);
  const points = new Float64Array(n * 9);
  let w = 0;
  for (const p of pieces) {
    const o = p.origin ?? [0, 0, 0];
    for (let t = 0; t + 2 < p.indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = p.indices[t + k] * 3;
        points[w++] = p.positions[i] + o[0];
        points[w++] = p.positions[i + 1] + o[1];
        points[w++] = p.positions[i + 2] + o[2];
      }
    }
  }
  const loopStart = Int32Array.from({ length: n + 1 }, (_, k) => 3 * k);
  const faceStart = Int32Array.from({ length: n + 1 }, (_, k) => k);
  return { points, loopStart, faceStart };
}

export function toLocalFaces(faces: FaceSet, frame: WallFrame): FaceSet {
  const p = faces.points;
  const out = new Float64Array(p.length);
  for (let i = 0; i + 2 < p.length; i += 3) {
    const l = toLocal(frame, p[i], p[i + 1], p[i + 2]);
    out[i] = l[0]; out[i + 1] = l[1]; out[i + 2] = l[2];
  }
  return { ...faces, points: out };
}

/** [u0, u1, v0, v1, h0, h1] of local faces. */
export type Box = [number, number, number, number, number, number];

export function boxOf(faces: FaceSet): Box {
  const b: Box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  const p = faces.points;
  for (let i = 0; i + 2 < p.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const x = p[i + a];
      if (x < b[2 * a]) b[2 * a] = x;
      if (x > b[2 * a + 1]) b[2 * a + 1] = x;
    }
  }
  return b;
}

/**
 * A face seen edge-on from the wall (its normal has no component through the
 * wall thickness, local axis 1) projects to a line: it adds no area, since
 * the faces of a solid that do face the wall cover the same projection (a
 * member across the frame projects through its end faces). Skipping it saves
 * its edges' row loops, which for a stud's side faces run the full height.
 * Relative tolerance: a face tilted less than this projects thinner than a
 * micrometre per metre.
 */
const EDGE_ON = 1e-6;

/** |normal · across| / |normal| of a planar loop (Newell), in local coordinates. */
function acrossShare(p: Float64Array, s: number, e: number): number {
  let nx = 0, ny = 0, nz = 0;
  for (let i = s; i < e; i++) {
    const a = 3 * i, b = 3 * (i + 1 < e ? i + 1 : s);
    nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
    ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
    nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
  }
  const len = Math.hypot(nx, ny, nz);
  return len > 0 ? Math.abs(ny) / len : 0;
}

/** A triangle is convex: per row, the span between its lowest and highest
 *  crossing (same half-open rule as the general case, no sort needed). */
function projectTriangle(target: RowSpans, p: Float64Array, o: number, uLo: number, uHi: number): void {
  const hMin = Math.min(p[o + 2], p[o + 5], p[o + 8]), hMax = Math.max(p[o + 2], p[o + 5], p[o + 8]);
  if (hMax === hMin) return;
  if (acrossShare(p, o / 3, o / 3 + 3) <= EDGE_ON) return;
  const [first, last] = target.rowRange(hMin, hMax);
  for (let j = first; j <= last; j++) {
    const hc = target.centre(j);
    if (hc < hMin || hc >= hMax) continue;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 3; k++) {
      const a = o + 3 * k, b = o + 3 * ((k + 1) % 3);
      const ha = p[a + 2], hb = p[b + 2];
      if (ha === hb || hc < Math.min(ha, hb) || hc >= Math.max(ha, hb)) continue;
      const u = p[a] + ((hc - ha) / (hb - ha)) * (p[b] - p[a]);
      if (u < lo) lo = u;
      if (u > hi) hi = u;
    }
    if (lo < uLo) lo = uLo;
    if (hi > uHi) hi = uHi;
    if (hi > lo) target.add(j, lo, hi);
  }
}

/** Add the orthogonal projection of local faces onto the wall plane, optionally clipped to [uLo, uHi]. */
export function projectFaces(target: RowSpans, faces: FaceSet, uLo = -Infinity, uHi = Infinity): void {
  const p = faces.points, ls = faces.loopStart, fs = faces.faceStart;
  // Crossings (row, u) of the current face, reused across faces.
  let rowOf = new Int32Array(64), uOf = new Float64Array(64);
  let count = new Int32Array(0), sorted = new Float64Array(0);
  for (let f = 0; f + 1 < fs.length; f++) {
    if (fs[f + 1] - fs[f] === 1 && ls[fs[f] + 1] - ls[fs[f]] === 3) {
      projectTriangle(target, p, 3 * ls[fs[f]], uLo, uHi);
      continue;
    }
    if (acrossShare(p, ls[fs[f]], ls[fs[f] + 1]) <= EDGE_ON) continue;
    let n = 0, rowLo = Infinity, rowHi = -Infinity;
    for (let k = fs[f]; k < fs[f + 1]; k++) {
      const s = ls[k], e = ls[k + 1];
      for (let i = s; i < e; i++) {
        const a = 3 * i, b = 3 * (i + 1 < e ? i + 1 : s);
        const ha = p[a + 2], hb = p[b + 2];
        if (ha === hb) continue;
        const lo = Math.min(ha, hb), hi = Math.max(ha, hb);
        const [first, last] = target.rowRange(lo, hi);
        for (let j = first; j <= last; j++) {
          const hc = target.centre(j);
          if (hc < lo || hc >= hi) continue; // half-open: a shared vertex counts once
          if (n === rowOf.length) {
            const r2 = new Int32Array(2 * n); r2.set(rowOf); rowOf = r2;
            const u2 = new Float64Array(2 * n); u2.set(uOf); uOf = u2;
          }
          rowOf[n] = j;
          uOf[n] = p[a] + ((hc - ha) / (hb - ha)) * (p[b] - p[a]);
          n++;
          if (j < rowLo) rowLo = j;
          if (j > rowHi) rowHi = j;
        }
      }
    }
    if (n === 0) continue;
    // Bucket the crossings by row (counting sort), then sort each row's few u values.
    const rows = rowHi - rowLo + 1;
    if (count.length < rows + 1) count = new Int32Array(rows + 1); else count.fill(0, 0, rows + 1);
    if (sorted.length < n) sorted = new Float64Array(n);
    for (let i = 0; i < n; i++) count[rowOf[i] - rowLo + 1]++;
    for (let r = 0; r < rows; r++) count[r + 1] += count[r];
    for (let i = 0; i < n; i++) sorted[count[rowOf[i] - rowLo]++] = uOf[i];
    // count[r] now holds the end of row r; pair even-odd within each row and
    // drop an odd leftover (open loop), as before.
    let s = 0;
    for (let r = 0; r < rows; r++) {
      const e = count[r];
      if (e - s > 2) sorted.subarray(s, e).sort();
      else if (e - s === 2 && sorted[s] > sorted[s + 1]) { const t = sorted[s]; sorted[s] = sorted[s + 1]; sorted[s + 1] = t; }
      for (let m = s; m + 1 < e; m += 2) {
        const a = Math.max(sorted[m], uLo), b = Math.min(sorted[m + 1], uHi);
        if (b > a) target.add(r + rowLo, a, b);
      }
      s = e;
    }
  }
}
