/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Mesh geometry in drawing space: every vertex becomes (x, y, d) in mm, with
 * (x, y) the absolute drawing coordinates and d the view depth behind the
 * section plane (0 on the plane, positive away from the viewer).
 *
 * From that: the visible-candidate edges of each mesh (creases, silhouettes,
 * open and non-manifold edges) and the occluding triangles, both clipped to
 * the view band 0 <= d <= depth.
 */

import type { SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';

/** Point in drawing space: x, y (mm), view depth d (mm). */
export interface P3 { x: number; y: number; d: number }

export interface Rand { a: P3; b: P3 }

/** Crease angle above which an edge between two faces is drawn (degrees). */
export const KNIK_HOEK = 20;
/** Vertices closer than this (mm) are the same point when rebuilding topology. */
const LAS = 1e-3;
/** A third vertex nearer than this (mm) to the edge line counts as on it. */
const OP_LIJN = 1e-4;

type V = { x: number; y: number; z: number };
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Mesh vertices -> drawing space, using the exact basis handed to drawing-2d. */
export function naarTekenruimte(mesh: MeshData, config: SectionConfig, offsetMm: { x: number; y: number }): Float64Array {
  const cp = config.plane.customPlane;
  if (!cp) throw new Error('zicht: verwacht een customPlane');
  const o = mesh.origin ?? [0, 0, 0];
  const pos = mesh.positions;
  const uit = new Float64Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const r = { x: pos[i] + o[0] - cp.origin.x, y: pos[i + 1] + o[1] - cp.origin.y, z: pos[i + 2] + o[2] - cp.origin.z };
    uit[i] = 1000 * dot(cp.tangent, r) + offsetMm.x;
    uit[i + 1] = 1000 * dot(cp.bitangent, r) + offsetMm.y;
    // drawing-2d's normal points toward the viewer; depth grows away from it.
    uit[i + 2] = -1000 * dot(cp.normal, r);
  }
  return uit;
}

const punt = (v: Float64Array, i: number): P3 => ({ x: v[3 * i], y: v[3 * i + 1], d: v[3 * i + 2] });

/** Clip a segment to lo <= d <= hi; null if nothing is left. */
export function klipDiepte(a: P3, b: P3, lo: number, hi: number): Rand | null {
  let t0 = 0;
  let t1 = 1;
  const dd = b.d - a.d;
  for (const [grens, teken] of [[lo, 1], [hi, -1]] as const) {
    const fa = teken * (a.d - grens);
    const fb = teken * (b.d - grens);
    if (fa < 0 && fb < 0) return null;
    if (fa < 0) t0 = Math.max(t0, fa / (fa - fb));
    else if (fb < 0) t1 = Math.min(t1, fa / (fa - fb));
  }
  if (t1 < t0) return null;
  const op = (t: number): P3 => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), d: a.d + t * dd });
  return { a: op(t0), b: op(t1) };
}

/** Welded vertex id per vertex, so faces split for shading share their edges again. */
function lassen(v: Float64Array): Int32Array {
  const ids = new Int32Array(v.length / 3);
  const gezien = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const k = `${Math.round(v[3 * i] / LAS)},${Math.round(v[3 * i + 1] / LAS)},${Math.round(v[3 * i + 2] / LAS)}`;
    let id = gezien.get(k);
    if (id === undefined) { id = i; gezien.set(k, i); }
    ids[i] = id;
  }
  return ids;
}

/**
 * Is the edge a–b between faces with third vertices c1, c2 a drawn edge?
 * Winding-independent: the crease angle comes from the two faces' directions
 * away from the edge, the silhouette test from whether both faces fold to the
 * same side of the edge in the drawing.
 */
function isZichtrand(a: P3, b: P3, c1: P3, c2: P3, cosGrens: number): boolean {
  const e = { x: b.x - a.x, y: b.y - a.y, z: b.d - a.d };
  const ee = dot(e, e);
  if (ee === 0) return false;
  const loodrecht = (c: P3): V => {
    const w = { x: c.x - a.x, y: c.y - a.y, z: c.d - a.d };
    const s = dot(w, e) / ee;
    return { x: w.x - s * e.x, y: w.y - s * e.y, z: w.z - s * e.z };
  };
  const p1 = loodrecht(c1);
  const p2 = loodrecht(c2);
  const n = Math.sqrt(dot(p1, p1) * dot(p2, p2));
  // Flat continuation: p1 and p2 opposite (cos = -1). Crease when the fold
  // departs from flat by more than the crease angle.
  if (n > 0 && dot(p1, p2) / n > cosGrens) return true;
  const l2 = Math.hypot(e.x, e.y);
  if (l2 === 0) return false;
  const kant = (c: P3): number => (e.x * (c.y - a.y) - e.y * (c.x - a.x)) / l2;
  const k1 = kant(c1);
  const k2 = kant(c2);
  return Math.abs(k1) > OP_LIJN && Math.abs(k2) > OP_LIJN && k1 * k2 > 0;
}

/** Candidate visible edges of one mesh, clipped to the view band. */
export function zichtranden(v: Float64Array, indices: Uint32Array, diepte: number, knikHoek = KNIK_HOEK): Rand[] {
  const id = lassen(v);
  const derden = new Map<number, number[]>();
  const n = v.length / 3;
  for (let t = 0; t < indices.length; t += 3) {
    const h = [id[indices[t]], id[indices[t + 1]], id[indices[t + 2]]];
    for (let k = 0; k < 3; k++) {
      const p = h[k];
      const q = h[(k + 1) % 3];
      if (p === q) continue;
      const sleutel = Math.min(p, q) * n + Math.max(p, q);
      const lijst = derden.get(sleutel);
      if (lijst) lijst.push(h[(k + 2) % 3]); else derden.set(sleutel, [h[(k + 2) % 3]]);
    }
  }
  // cos of (180° - crease angle): folds sharper than that are drawn.
  const cosGrens = Math.cos(Math.PI - (knikHoek * Math.PI) / 180);
  const uit: Rand[] = [];
  for (const [sleutel, lijst] of derden) {
    const a = punt(v, Math.floor(sleutel / n));
    const b = punt(v, sleutel % n);
    const tekenen = lijst.length !== 2 || isZichtrand(a, b, punt(v, lijst[0]), punt(v, lijst[1]), cosGrens);
    if (!tekenen) continue;
    const r = klipDiepte(a, b, 0, diepte);
    if (r) uit.push(r);
  }
  return uit;
}

/**
 * Occluding triangles of one mesh, clipped to the view band (a triangle that
 * crosses the section plane keeps only its part behind it). Flat as
 * [x0, y0, d0, x1, y1, d1, x2, y2, d2] per triangle; triangles seen edge-on
 * are dropped, they cover no area.
 */
export function afdekkers(v: Float64Array, indices: Uint32Array, diepte: number, uit: number[]): void {
  for (let t = 0; t < indices.length; t += 3) {
    let veelhoek = [punt(v, indices[t]), punt(v, indices[t + 1]), punt(v, indices[t + 2])];
    for (const [grens, teken] of [[0, 1], [diepte, -1]] as const) {
      const f = (p: P3) => teken * (p.d - grens);
      if (veelhoek.every((p) => f(p) >= 0)) continue;
      const nieuw: P3[] = [];
      for (let i = 0; i < veelhoek.length; i++) {
        const p = veelhoek[i];
        const q = veelhoek[(i + 1) % veelhoek.length];
        const fp = f(p);
        const fq = f(q);
        if (fp >= 0) nieuw.push(p);
        if ((fp >= 0) !== (fq >= 0)) {
          const s = fp / (fp - fq);
          nieuw.push({ x: p.x + s * (q.x - p.x), y: p.y + s * (q.y - p.y), d: p.d + s * (q.d - p.d) });
        }
      }
      veelhoek = nieuw;
      if (veelhoek.length < 3) break;
    }
    for (let i = 1; i + 1 < veelhoek.length; i++) {
      const [a, b, c] = [veelhoek[0], veelhoek[i], veelhoek[i + 1]];
      const opp = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(opp) < 1e-6) continue;
      uit.push(a.x, a.y, a.d, b.x, b.y, b.d, c.x, c.y, c.d);
    }
  }
}
