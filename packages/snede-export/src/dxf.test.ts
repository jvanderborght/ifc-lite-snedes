/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { schrijfDxf } from './dxf.js';
import type { Lijn } from './genereer.js';

/** Value of the first occurrence of a header variable. */
function kopwaarde(dxf: string, naam: string): string {
  const r = dxf.split('\n');
  const i = r.indexOf(naam);
  return r[i + 2];
}

/** All (x, y) vertex values of LWPOLYLINE entities. */
function hoekpunten(dxf: string): number[] {
  const r = dxf.split('\n').map((s) => s.trim());
  const uit: number[] = [];
  const start = r.indexOf('ENTITIES');
  // 'ENTITIES' is the value of a (2, name) pair, so pairs resume right after it.
  for (let i = start + 1; i < r.length - 1; i += 2) {
    if (r[i] === '10' || r[i] === '20') uit.push(Number(r[i + 1]));
  }
  return uit;
}

const vierkant: Lijn[] = [
  [{ x: 0, y: 0 }, { x: 1000, y: 0 }], [{ x: 1000, y: 0 }, { x: 1000, y: 1000 }],
  [{ x: 1000, y: 1000 }, { x: 0, y: 1000 }], [{ x: 0, y: 1000 }, { x: 0, y: 0 }],
].map(([a, b]) => ({ soort: 'snede', ifcType: 'IFCWALL', entityId: 7, a, b }));

describe('schrijfDxf', () => {
  it('writes millimetres by default', () => {
    const dxf = schrijfDxf(vierkant);
    expect(kopwaarde(dxf, '$INSUNITS')).toBe('4');
    expect(Math.max(...hoekpunten(dxf))).toBe(1000);
  });

  it('scales to metres and sets $INSUNITS', () => {
    const dxf = schrijfDxf(vierkant, { eenheid: 'm' });
    expect(kopwaarde(dxf, '$INSUNITS')).toBe('6');
    expect(Math.max(...hoekpunten(dxf))).toBe(1);
  });

  it('writes hidden lines only when asked, dashed, with the pattern in model size', () => {
    const verborgen = vierkant.map((l) => ({ ...l, soort: 'verborgen' as const }));
    expect(schrijfDxf(verborgen)).not.toContain('\nVERBORGEN_IfcWall\n');
    const mm = schrijfDxf(verborgen, { verborgenLijnen: true });
    expect(mm).toContain('\nVERBORGEN_IfcWall\n');
    // DASHED: total length, dash, gap (negative).
    expect(mm).toContain('\nDASHED\n');
    expect(mm).toContain(' 40\n75.0\n 49\n50.0\n 74\n0\n 49\n-25.0\n');
    const m = schrijfDxf(verborgen, { verborgenLijnen: true, eenheid: 'm', streeppatroon: { streep: 100, gat: 50 } });
    expect(m).toContain(' 40\n0.15\n 49\n0.1\n 74\n0\n 49\n-0.05\n');
  });

  it('escapes non-ASCII text for the ANSI_1252 code page', () => {
    const dxf = schrijfDxf([], {
      annotaties: [{ soort: 'tekst', laag: 'titel', p: { x: 0, y: 0 }, hoogte: 250, waarde: 'Gevel é' }],
    });
    expect(dxf).toContain('\nGevel \\U+00E9\n');
    expect(dxf).toContain('\nSNEDETITEL\n');
  });

  it('closes a square into one polyline on the class layer', () => {
    const dxf = schrijfDxf(vierkant, { eenheid: 'cm' });
    expect(dxf.match(/\nLWPOLYLINE\n/g)).toHaveLength(1);
    expect(dxf).toContain('\nSNEDE_IfcWall\n');
    expect(Math.max(...hoekpunten(dxf))).toBe(100);
  });
});
