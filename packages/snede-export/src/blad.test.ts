/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { bladLijnen, legBladAan, type SnedeTekening } from './blad.js';
import type { Lijn } from './genereer.js';
import { vlakUitTekst } from './vlak.js';

/** Rectangle outline from (x0, y0) to (x1, y1) as cut lines. */
function rechthoek(x0: number, y0: number, x1: number, y1: number): Lijn[] {
  const h = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  return h.map((a, i) => ({ soort: 'snede', ifcType: 'IfcWall', entityId: 1, a, b: h[(i + 1) % 4] }));
}

const snede = (tekst: string, lijnen: Lijn[]): SnedeTekening => ({ vlak: vlakUitTekst(tekst), lijnen });

describe('legBladAan', () => {
  const a = snede('A:x=0', rechthoek(-3000, -500, 5000, 6000));
  const b = snede('B:y=0', rechthoek(20_000, 0, 32_000, 8000));
  const p = snede('P:z=1000', rechthoek(100, 200, 12_100, 8200));

  it('puts sections in one row with a fixed gap and keeps elevation', () => {
    const [ga, gb] = legBladAan([a, b]);
    expect(ga.kader).toEqual({ min: { x: 0, y: -500 }, max: { x: 8000, y: 6000 } });
    expect(gb.kader).toEqual({ min: { x: 18_000, y: 0 }, max: { x: 30_000, y: 8000 } });
    expect(ga.verschuiving.y).toBe(0);
    expect(gb.verschuiving.y).toBe(0);
  });

  it('honours a custom gap', () => {
    const [, gb] = legBladAan([a, b], { tussenruimte: 2000 });
    expect(gb.kader!.min.x).toBe(10_000);
  });

  it('puts plans in a row below the sections', () => {
    const [, , gp] = legBladAan([a, b, p]);
    expect(gp.isPlan).toBe(true);
    expect(gp.kader!.min.x).toBe(0);
    expect(gp.kader!.max.y).toBe(-500 - 10_000);
  });

  it('gives all plans the same Y shift', () => {
    const p2 = snede('Q:z=4000', rechthoek(0, 0, 6000, 4000));
    const [, gp, gq] = legBladAan([a, p, p2]);
    expect(gp.verschuiving.y).toBe(gq.verschuiving.y);
    expect(gq.kader!.min.x).toBe(12_000 + 10_000);
  });

  it('leaves plans on world coordinates when asked', () => {
    const [, gp] = legBladAan([a, p], { plannen: 'wereld' });
    expect(gp.verschuiving).toEqual({ x: 0, y: 0 });
  });

  it('skips empty sections without taking width', () => {
    const leeg = snede('L:x=99', []);
    const [, gl, gb] = legBladAan([a, leeg, b]);
    expect(gl.kader).toBeNull();
    expect(gb.kader!.min.x).toBe(18_000);
  });

  it('shifts the lines themselves', () => {
    const lijnen = bladLijnen(legBladAan([a, b]));
    expect(Math.min(...lijnen.map((l) => l.a.x))).toBe(0);
    expect(Math.max(...lijnen.map((l) => l.a.x))).toBe(30_000);
  });
});
