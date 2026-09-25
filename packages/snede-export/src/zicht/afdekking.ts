/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Exact hidden-line removal in drawing space. For each edge the parameter
 * intervals hidden by an occluder are solved analytically (double precision,
 * no raster):
 * - behind a triangle: inside its 2D projection (three linear constraints)
 *   and farther than the triangle's plane there (one more);
 * - behind a section cap: inside the cut outline of an element that the plane
 *   cuts (even-odd over that element's cut lines), deeper than the plane.
 * The cut meshes are open at the plane, so without the caps an element seen
 * through its own cut face would show everything inside it.
 */

import type { P3, Rand } from './randen.js';

/** An occluder must be at least this much (mm) nearer to hide an edge. */
export const TOL_DIEPTE = 0.05;
/** Edges closer than this (mm) to the plane lie in it: they are on the cut already. */
export const TOL_VLAK = 0.05;
/** Inside tolerance (mm): touching an occluder's outline counts as inside. */
const TOL_BINNEN = 1e-5;

type Interval = [number, number];

/** Uniform 2D grid over item bounding boxes. */
class Rooster {
  private cellen = new Map<number, number[]>();
  private stempel: Int32Array;
  private ronde = 0;

  constructor(private cel: number, aantal: number) {
    this.stempel = new Int32Array(aantal);
  }

  private sleutel = (i: number, j: number): number => i * 2_000_003 + j;

  voegToe(item: number, x0: number, y0: number, x1: number, y1: number): void {
    for (let i = Math.floor(x0 / this.cel); i <= Math.floor(x1 / this.cel); i++) {
      for (let j = Math.floor(y0 / this.cel); j <= Math.floor(y1 / this.cel); j++) {
        const k = this.sleutel(i, j);
        const lijst = this.cellen.get(k);
        if (lijst) lijst.push(item); else this.cellen.set(k, [item]);
      }
    }
  }

  /** Items whose cells overlap the box, each once. */
  zoek(x0: number, y0: number, x1: number, y1: number, doe: (item: number) => void): void {
    this.ronde++;
    for (let i = Math.floor(x0 / this.cel); i <= Math.floor(x1 / this.cel); i++) {
      for (let j = Math.floor(y0 / this.cel); j <= Math.floor(y1 / this.cel); j++) {
        for (const item of this.cellen.get(this.sleutel(i, j)) ?? []) {
          if (this.stempel[item] === this.ronde) continue;
          this.stempel[item] = this.ronde;
          doe(item);
        }
      }
    }
  }
}

/** Narrow [lo, hi] to where c0 + c1·t >= 0; returns false if empty. */
function beperk(iv: Interval, c0: number, c1: number): boolean {
  if (Math.abs(c1) < 1e-15) return c0 >= 0;
  const t = -c0 / c1;
  if (c1 > 0) iv[0] = Math.max(iv[0], t); else iv[1] = Math.min(iv[1], t);
  return iv[0] < iv[1];
}

export interface Snedelijn { entityId: number; a: { x: number; y: number }; b: { x: number; y: number } }

export class Afdekking {
  private driehoeken: Float64Array;
  private rooster: Rooster;
  private kappen = new Map<number, { segs: Snedelijn[]; x0: number; y0: number; x1: number; y1: number }>();
  private snedeRooster: Rooster;
  private snedelijnen: Snedelijn[];

  constructor(driehoeken: number[], snedelijnen: Snedelijn[]) {
    this.driehoeken = Float64Array.from(driehoeken);
    const n = this.driehoeken.length / 9;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (let i = 0; i < this.driehoeken.length; i += 3) {
      x0 = Math.min(x0, this.driehoeken[i]); x1 = Math.max(x1, this.driehoeken[i]);
      y0 = Math.min(y0, this.driehoeken[i + 1]); y1 = Math.max(y1, this.driehoeken[i + 1]);
    }
    const opp = n ? Math.max((x1 - x0) * (y1 - y0), 1) : 1;
    const cel = Math.min(Math.max(Math.sqrt(opp / Math.max(n, 1)) * 2, 50), 5000);
    this.rooster = new Rooster(cel, n);
    for (let t = 0; t < n; t++) {
      const b = 9 * t;
      const d = this.driehoeken;
      this.rooster.voegToe(t,
        Math.min(d[b], d[b + 3], d[b + 6]), Math.min(d[b + 1], d[b + 4], d[b + 7]),
        Math.max(d[b], d[b + 3], d[b + 6]), Math.max(d[b + 1], d[b + 4], d[b + 7]));
    }

    this.snedelijnen = snedelijnen;
    this.snedeRooster = new Rooster(cel, snedelijnen.length);
    snedelijnen.forEach((s, i) => {
      this.snedeRooster.voegToe(i, Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.max(s.a.x, s.b.x), Math.max(s.a.y, s.b.y));
      let k = this.kappen.get(s.entityId);
      if (!k) { k = { segs: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; this.kappen.set(s.entityId, k); }
      k.segs.push(s);
      k.x0 = Math.min(k.x0, s.a.x, s.b.x); k.x1 = Math.max(k.x1, s.a.x, s.b.x);
      k.y0 = Math.min(k.y0, s.a.y, s.b.y); k.y1 = Math.max(k.y1, s.a.y, s.b.y);
    });
  }

  /** Interval of the edge hidden by triangle t, or null. */
  private achterDriehoek(r: Rand, t: number): Interval | null {
    const d = this.driehoeken;
    const b = 9 * t;
    const [ax, ay, ad, bx, by, bd, cx, cy, cd] = [d[b], d[b + 1], d[b + 2], d[b + 3], d[b + 4], d[b + 5], d[b + 6], d[b + 7], d[b + 8]];
    if (Math.min(ad, bd, cd) >= Math.max(r.a.d, r.b.d) - TOL_DIEPTE) return null;
    const ex = r.b.x - r.a.x;
    const ey = r.b.y - r.a.y;
    const opp = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const s = Math.sign(opp);
    const iv: Interval = [0, 1];
    const hoeken = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
    for (const [px, py, qx, qy] of hoeken) {
      const kx = qx - px;
      const ky = qy - py;
      const l = Math.hypot(kx, ky);
      // s·cross(q - p, S(t) - p) >= -tol·|q - p|
      const c0 = s * (kx * (r.a.y - py) - ky * (r.a.x - px)) + TOL_BINNEN * l;
      const c1 = s * (kx * ey - ky * ex);
      if (!beperk(iv, c0, c1)) return null;
    }
    // Triangle plane as depth = α·x + β·y + γ.
    const α = ((bd - ad) * (cy - ay) - (cd - ad) * (by - ay)) / opp;
    const β = ((cd - ad) * (bx - ax) - (bd - ad) * (cx - ax)) / opp;
    const dT0 = ad + α * (r.a.x - ax) + β * (r.a.y - ay);
    const dT1 = α * ex + β * ey;
    // Hidden where edge depth - triangle depth - tol >= 0.
    if (!beperk(iv, r.a.d - dT0 - TOL_DIEPTE, (r.b.d - r.a.d) - dT1)) return null;
    return iv;
  }

  private binnenKap(x: number, y: number): boolean {
    for (const k of this.kappen.values()) {
      if (x < k.x0 || x > k.x1 || y < k.y0 || y > k.y1) continue;
      let binnen = false;
      for (const s of k.segs) {
        if ((s.a.y > y) !== (s.b.y > y)) {
          const xs = s.a.x + ((y - s.a.y) / (s.b.y - s.a.y)) * (s.b.x - s.a.x);
          if (xs > x) binnen = !binnen;
        }
      }
      if (binnen) return true;
    }
    return false;
  }

  /** Intervals of the edge hidden by section caps. */
  private achterKap(r: Rand): Interval[] {
    const ex = r.b.x - r.a.x;
    const ey = r.b.y - r.a.y;
    const knopen = [0, 1];
    const dd = r.b.d - r.a.d;
    if (Math.abs(dd) > 1e-15) {
      const t = (TOL_VLAK - r.a.d) / dd;
      if (t > 0 && t < 1) knopen.push(t);
    }
    this.snedeRooster.zoek(Math.min(r.a.x, r.b.x), Math.min(r.a.y, r.b.y), Math.max(r.a.x, r.b.x), Math.max(r.a.y, r.b.y), (i) => {
      const s = this.snedelijnen[i];
      const fx = s.b.x - s.a.x;
      const fy = s.b.y - s.a.y;
      const noemer = ex * fy - ey * fx;
      if (Math.abs(noemer) < 1e-12) return;
      const t = ((s.a.x - r.a.x) * fy - (s.a.y - r.a.y) * fx) / noemer;
      const u = ((s.a.x - r.a.x) * ey - (s.a.y - r.a.y) * ex) / noemer;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) knopen.push(t);
    });
    knopen.sort((p, q) => p - q);
    const uit: Interval[] = [];
    for (let i = 0; i + 1 < knopen.length; i++) {
      const [t0, t1] = [knopen[i], knopen[i + 1]];
      if (t1 - t0 < 1e-12) continue;
      const tm = (t0 + t1) / 2;
      if (r.a.d + tm * dd <= TOL_VLAK) continue;
      if (this.binnenKap(r.a.x + tm * ex, r.a.y + tm * ey)) uit.push([t0, t1]);
    }
    return uit;
  }

  /** Split an edge into its visible and hidden parts (parameter intervals). */
  verdeel(r: Rand): { zichtbaar: Interval[]; verborgen: Interval[] } {
    const verborgen: Interval[] = this.achterKap(r);
    this.rooster.zoek(Math.min(r.a.x, r.b.x), Math.min(r.a.y, r.b.y), Math.max(r.a.x, r.b.x), Math.max(r.a.y, r.b.y), (t) => {
      const iv = this.achterDriehoek(r, t);
      if (iv) verborgen.push(iv);
    });
    verborgen.sort((p, q) => p[0] - q[0]);
    const samen: Interval[] = [];
    for (const iv of verborgen) {
      const laatste = samen[samen.length - 1];
      if (laatste && iv[0] <= laatste[1] + 1e-12) laatste[1] = Math.max(laatste[1], iv[1]);
      else samen.push([iv[0], iv[1]]);
    }
    const zichtbaar: Interval[] = [];
    let t = 0;
    for (const [a, b] of samen) {
      if (a > t) zichtbaar.push([t, a]);
      t = Math.max(t, b);
    }
    if (t < 1) zichtbaar.push([t, 1]);
    return { zichtbaar, verborgen: samen };
  }
}

export const opParameter = (r: Rand, t: number): P3 => ({
  x: r.a.x + t * (r.b.x - r.a.x), y: r.a.y + t * (r.b.y - r.a.y), d: r.a.d + t * (r.b.d - r.a.d),
});
