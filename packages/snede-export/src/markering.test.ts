/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { legBladAan, type SnedeTekening } from './blad.js';
import type { Lijn } from './genereer.js';
import { annotaties, klipLijn, snijlijn } from './markering.js';
import { vlakUitTekst } from './vlak.js';

function rechthoek(x0: number, y0: number, x1: number, y1: number): Lijn[] {
  const h = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  return h.map((a, i) => ({ soort: 'snede', ifcType: 'IfcWall', entityId: 1, a, b: h[(i + 1) % 4] }));
}
const snede = (tekst: string, lijnen: Lijn[]): SnedeTekening => ({ vlak: vlakUitTekst(tekst), lijnen });

// Building 0..12 000 (X) x 0..8000 (Y) x 0..6000 (Z).
// A: x = 4000, looks toward -X, so DXF-X = world Y. P: plan at z = 1000.
const A = snede('A:x=4000', rechthoek(0, 0, 8000, 6000));
const P = snede('P:z=1000', rechthoek(0, 0, 12_000, 8000));
const Q = snede('Q:z=4000', rechthoek(0, 0, 12_000, 8000));

describe('snijlijn', () => {
  const [ga, gp, gq] = legBladAan([A, P, Q], { plannen: 'wereld' });

  it('draws a plan level as a horizontal line at its elevation, looking down', () => {
    const l = snijlijn(ga, gp)!;
    expect(l.p.y).toBeCloseTo(1000);
    expect(Math.abs(l.r.x)).toBeCloseTo(1);
    expect(l.kijk.x).toBeCloseTo(0);
    expect(l.kijk.y).toBeCloseTo(-1);
  });

  it('draws a vertical section on a plan at its world X, looking toward -X', () => {
    const l = snijlijn(gp, ga)!;
    expect(l.p.x).toBeCloseTo(4000);
    expect(Math.abs(l.r.y)).toBeCloseTo(1);
    expect(l.kijk.x).toBeCloseTo(-1);
  });

  it('gives no marker between parallel plans', () => {
    expect(snijlijn(gp, gq)).toBeNull();
  });
});

describe('klipLijn', () => {
  const k = { min: { x: 0, y: 0 }, max: { x: 10, y: 5 } };
  it('clips to the rectangle', () => {
    expect(klipLijn({ x: 3, y: 2 }, { x: 0, y: 1 }, k)).toEqual([{ x: 3, y: 0 }, { x: 3, y: 5 }]);
  });
  it('misses outside', () => {
    expect(klipLijn({ x: 11, y: 2 }, { x: 0, y: 1 }, k)).toBeNull();
  });
});

describe('annotaties', () => {
  const alles = annotaties(legBladAan([A, P, Q], { plannen: 'wereld' }), { teksthoogte: 250, driehoek: 250 });

  it('titles every drawing', () => {
    const titels = alles.filter((a) => a.laag === 'titel' && a.soort === 'tekst');
    expect(titels.map((t) => t.soort === 'tekst' && t.waarde)).toEqual(['A-A', 'P-P', 'Q-Q']);
  });

  it('marks both ends: P and Q on A, A on P and on Q', () => {
    const namen = alles.filter((a) => a.laag === 'markering' && a.soort === 'tekst')
      .map((a) => a.soort === 'tekst' && a.waarde);
    expect(namen.sort()).toEqual(['A', 'A', 'A', 'A', 'P', 'P', 'Q', 'Q']);
  });

  it('puts marker ends outside the drawing and triangles pointing the view way', () => {
    const [ga, gp] = legBladAan([A, P], { plannen: 'wereld' });
    const opA = annotaties([ga, gp]).filter((a) => a.laag === 'markering');
    const driehoeken = opA.filter((a) => a.soort === 'veelhoek');
    // On A, P's triangles point down: apex below the base, which lies at y = 1000.
    const eerste = driehoeken[0];
    expect(eerste.soort === 'veelhoek' && Math.min(...eerste.punten.map((p) => p.y))).toBeLessThan(1000);
    const lijnen = opA.filter((a) => a.soort === 'lijn');
    const xs = lijnen.flatMap((l) => (l.soort === 'lijn' ? [l.a.x] : []));
    expect(Math.min(...xs)).toBeLessThan(ga.kader!.min.x);
    expect(Math.max(...xs)).toBeGreaterThan(ga.kader!.max.x);
  });
});
