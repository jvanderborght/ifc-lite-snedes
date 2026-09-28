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

/** A triangle is convex: per row, the span between its lowest and highest
 *  crossing (same half-open rule as the general case, no sort needed). */
function projectTriangle(target: RowSpans, p: Float64Array, o: number, uLo: number, uHi: number): void {
  const hMin = Math.min(p[o + 2], p[o + 5], p[o + 8]), hMax = Math.max(p[o + 2], p[o + 5], p[o + 8]);
  if (hMax === hMin) return;
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
  const hits: number[] = []; // row, u pairs of the current face
  for (let f = 0; f + 1 < fs.length; f++) {
    if (fs[f + 1] - fs[f] === 1 && ls[fs[f] + 1] - ls[fs[f]] === 3) {
      projectTriangle(target, p, 3 * ls[fs[f]], uLo, uHi);
      continue;
    }
    hits.length = 0;
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
          hits.push(j, p[a] + ((hc - ha) / (hb - ha)) * (p[b] - p[a]));
        }
      }
    }
    if (hits.length === 0) continue;
    const order = Array.from({ length: hits.length / 2 }, (_, i) => i)
      .sort((x, y) => hits[2 * x] - hits[2 * y] || hits[2 * x + 1] - hits[2 * y + 1]);
    for (let m = 0; m + 1 < order.length; m += 2) {
      const r0 = hits[2 * order[m]], r1 = hits[2 * order[m + 1]];
      if (r0 !== r1) { m--; continue; } // odd row (open loop): resynchronise on the next row
      const a = Math.max(hits[2 * order[m] + 1], uLo), b = Math.min(hits[2 * order[m + 1] + 1], uHi);
      if (b > a) target.add(r0, a, b);
    }
  }
}
