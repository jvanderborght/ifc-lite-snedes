/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotations on a laid-out sheet:
 * - section markers: where another section plane crosses this drawing, only
 *   the two ends are drawn, each a short line piece, a triangle pointing in
 *   that section's view direction and its name;
 * - a title ("A-A") centred below every drawing.
 * Sizes are fixed model sizes in mm, independent of the output unit.
 */

import type { GeplaatsteTekening, Kader } from './blad.js';
import type { Punt } from './dxf/r2000.js';
import { tekenassen, type Vec3 } from './vlak.js';

export type AnnotatieLaag = 'markering' | 'titel';

export type Annotatie =
  | { soort: 'lijn'; laag: AnnotatieLaag; a: Punt; b: Punt }
  | { soort: 'veelhoek'; laag: AnnotatieLaag; punten: Punt[] }
  | { soort: 'tekst'; laag: AnnotatieLaag; p: Punt; hoogte: number; waarde: string };

export interface AnnotatieOpties {
  /** Text height in mm. Default 500. */
  teksthoogte?: number;
  /** Side of the direction triangle in mm. Default 500. */
  driehoek?: number;
}

export const STANDAARD_TEKSTHOOGTE = 500;
export const STANDAARD_DRIEHOEK = 500;

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
const plus = (p: Punt, q: Punt, s = 1): Punt => ({ x: p.x + q.x * s, y: p.y + q.y * s });

/**
 * Title text for a section. Plain hyphen: an en dash would need the \U+2013
 * escape in an R2000 file, which not every DXF reader decodes.
 */
export const titel = (naam: string): string => `${naam}-${naam}`;

/** Clip the infinite 2D line p + t·r to a rectangle (Liang–Barsky); null if it misses. */
export function klipLijn(p: Punt, r: Punt, k: Kader): [Punt, Punt] | null {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [rc, pc, lo, hi] of [[r.x, p.x, k.min.x, k.max.x], [r.y, p.y, k.min.y, k.max.y]]) {
    if (Math.abs(rc) < 1e-12) {
      if (pc < lo || pc > hi) return null;
      continue;
    }
    const a = (lo - pc) / rc;
    const b = (hi - pc) / rc;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? [plus(p, r, t0), plus(p, r, t1)] : null;
}

/**
 * Where section `ander` crosses drawing `doel`, in doel's sheet coordinates:
 * a point, the line direction and the view direction of `ander` (both 2D
 * unit vectors). Null for parallel planes.
 */
export function snijlijn(doel: GeplaatsteTekening, ander: GeplaatsteTekening):
  { p: Punt; r: Punt; kijk: Punt } | null {
  const T = tekenassen(doel.vlak);
  const S = tekenassen(ander.vlak);
  const d = cross(S.n, T.n);
  const d2 = dot(d, d);
  if (d2 < 1e-12) return null;
  const hS = dot(S.n, ander.vlak.oorsprong);
  const hT = dot(T.n, doel.vlak.oorsprong);
  // Point on both planes: (hS (nT x d) + hT (d x nS)) / |d|^2.
  const a = cross(T.n, d);
  const b = cross(d, S.n);
  const P = {
    x: (hS * a.x + hT * b.x) / d2, y: (hS * a.y + hT * b.y) / d2, z: (hS * a.z + hT * b.z) / d2,
  };
  const naar2d = (v: Vec3): Punt => ({ x: dot(T.u, v), y: dot(T.v, v) });
  const eenheid = (v: Punt): Punt => { const l = Math.hypot(v.x, v.y); return { x: v.x / l, y: v.y / l }; };
  return {
    p: plus(naar2d(P), doel.verschuiving),
    r: eenheid(naar2d(d)),
    kijk: eenheid(naar2d(S.n)),
  };
}

/** Markers of all other sections on every drawing, plus a title below each. */
export function annotaties(geplaatst: GeplaatsteTekening[], opties: AnnotatieOpties = {}): Annotatie[] {
  const h = opties.teksthoogte ?? STANDAARD_TEKSTHOOGTE;
  const s = opties.driehoek ?? STANDAARD_DRIEHOEK;
  const stuk = 4 * s;          // marker line piece at each end
  const marge = stuk;          // ends sit outside the extents, so the piece never overlaps the drawing
  const uit: Annotatie[] = [];

  for (const doel of geplaatst) {
    const k = doel.kader;
    if (!k) continue;
    uit.push({
      soort: 'tekst', laag: 'titel', hoogte: h, waarde: titel(doel.vlak.naam),
      // Below the labels of markers that end under the drawing.
      p: { x: (k.min.x + k.max.x) / 2, y: k.min.y - marge - 4 * h },
    });
    const ruim: Kader = { min: { x: k.min.x - marge, y: k.min.y - marge }, max: { x: k.max.x + marge, y: k.max.y + marge } };
    for (const ander of geplaatst) {
      if (ander === doel) continue;
      const lijn = snijlijn(doel, ander);
      const ends = lijn && klipLijn(lijn.p, lijn.r, ruim);
      if (!lijn || !ends) continue;
      for (const [eind, naarBuiten] of [[ends[0], { x: -lijn.r.x, y: -lijn.r.y }], [ends[1], lijn.r]] as const) {
        uit.push({ soort: 'lijn', laag: 'markering', a: eind, b: plus(eind, naarBuiten, -stuk) });
        const basis = plus(eind, naarBuiten, -s);
        uit.push({
          soort: 'veelhoek', laag: 'markering', punten: [
            plus(basis, naarBuiten, s / 2),
            plus(basis, naarBuiten, -s / 2),
            plus(basis, lijn.kijk, (s * Math.sqrt(3)) / 2),
          ],
        });
        uit.push({ soort: 'tekst', laag: 'markering', hoogte: h, waarde: ander.vlak.naam, p: plus(eind, naarBuiten, 1.5 * h) });
      }
    }
  }
  return uit;
}
