/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Remove visible and hidden line pieces that lie collinearly on a line
 * already kept, in order of precedence cut > visible > hidden. Typical cases: the bottom plate under a
 * cut wall seen exactly behind the cut line, a row of identical beams whose
 * edges coincide in projection, a hidden edge under a visible one. They add
 * nothing to the drawing but double lines. Same idea as
 * verwijder_dubbele_lijnen in the reference tool, extended to every kind.
 */

import type { Lijn, LijnSoort } from './genereer.js';

const VOORRANG: readonly LijnSoort[] = ['snede', 'zicht', 'verborgen'];
const CEL = 1000;

export interface DubbelResultaat {
  lijnen: Lijn[];
  /** Removed length in mm per line kind. */
  weggeknipt: Record<LijnSoort, number>;
}

export function knipDubbeleLijnen(lijnen: Lijn[], tol = 1e-3): DubbelResultaat {
  const bewaard: Lijn[] = [];
  const bak = new Map<string, number[]>();
  const cellen = (l: Lijn, doe: (k: string) => void): void => {
    for (let i = Math.floor(Math.min(l.a.x, l.b.x) / CEL); i <= Math.floor(Math.max(l.a.x, l.b.x) / CEL); i++) {
      for (let j = Math.floor(Math.min(l.a.y, l.b.y) / CEL); j <= Math.floor(Math.max(l.a.y, l.b.y) / CEL); j++) doe(`${i},${j}`);
    }
  };
  const bewaar = (l: Lijn): void => {
    const k = bewaard.push(l) - 1;
    cellen(l, (c) => { const lijst = bak.get(c); if (lijst) lijst.push(k); else bak.set(c, [k]); });
  };
  const weggeknipt: Record<LijnSoort, number> = { snede: 0, zicht: 0, verborgen: 0 };

  for (const soort of VOORRANG) {
    for (const l of lijnen) {
      if (l.soort !== soort) continue;
      // Cut lines are never clipped: every element keeps its own closed outline,
      // also where it touches a neighbour (polylines, hatching).
      if (soort === 'snede') { bewaar(l); continue; }
      const L =Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
      if (L <= tol) continue;
      const r = { x: (l.b.x - l.a.x) / L, y: (l.b.y - l.a.y) / L };
      const afstand = (p: { x: number; y: number }) => Math.abs((p.x - l.a.x) * -r.y + (p.y - l.a.y) * r.x);
      const langs = (p: { x: number; y: number }) => ((p.x - l.a.x) * r.x + (p.y - l.a.y) * r.y) / L;
      const kandidaten = new Set<number>();
      cellen(l, (c) => { for (const k of bak.get(c) ?? []) kandidaten.add(k); });
      const stukken: [number, number][] = [];
      for (const k of kandidaten) {
        const m = bewaard[k];
        if (afstand(m.a) > tol || afstand(m.b) > tol) continue;          // not collinear
        const [t0, t1] = [langs(m.a), langs(m.b)].sort((p, q) => p - q);
        const [s0, s1] = [Math.max(t0, 0), Math.min(t1, 1)];
        if ((s1 - s0) * L > tol) stukken.push([s0, s1]);
      }
      if (!stukken.length) { bewaar(l); continue; }
      stukken.sort((p, q) => p[0] - q[0]);
      const op = (t: number) => ({ x: l.a.x + t * (l.b.x - l.a.x), y: l.a.y + t * (l.b.y - l.a.y) });
      let t = 0;
      const nieuw: Lijn[] = [];
      for (const [s0, s1] of [...stukken, [1, 1] as [number, number]]) {
        if ((s0 - t) * L > tol) nieuw.push({ ...l, a: op(t), b: op(s0) });
        if (s1 > t) { weggeknipt[soort] += (Math.min(s1, 1) - Math.max(s0, t)) * L; t = s1; }
      }
      // Pieces are only added after the whole line is split, so a line never clips itself.
      nieuw.forEach(bewaar);
    }
  }
  return { lijnen: bewaard, weggeknipt };
}
