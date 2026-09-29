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

  it('hatches closed cut outlines per element on its own layer, only when asked', () => {
    expect(schrijfDxf(vierkant)).not.toContain('\nHATCH\n');
    const dxf = schrijfDxf(vierkant, { arcering: { soort: 'ansi31' } });
    expect(dxf.match(/\nHATCH\n/g)).toHaveLength(1);
    expect(dxf).toContain('\nARCERING_IfcWall\n');
    expect(dxf).toContain('\nANSI31\n');
    expect(dxf).toContain('\n 41\n20.0\n');          // pattern scale in model mm
    const vol = schrijfDxf(vierkant, { arcering: { soort: 'vol' }, eenheid: 'm' });
    expect(vol).toContain('\nSOLID\n');
  });

  it('makes the hatch associative to its outline polylines, holes included', () => {
    const gat = vierkant.map((l) => ({ ...l, a: { x: 250 + l.a.x / 2, y: 250 + l.a.y / 2 }, b: { x: 250 + l.b.x / 2, y: 250 + l.b.y / 2 } }));
    const open: Lijn = { soort: 'snede', ifcType: 'IFCWALL', entityId: 7, a: { x: 2000, y: 0 }, b: { x: 3000, y: 0 } };
    const r = schrijfDxf([...vierkant, ...gat, open], { arcering: { soort: 'ansi31' } }).split('\n').map((s) => s.trim());
    /** Group-code/value pairs of every entity, keyed by handle. */
    const entiteiten = new Map<string, { type: string; paren: [string, string][] }>();
    const start = r.indexOf('ENTITIES');
    let huidig: { type: string; paren: [string, string][] } | undefined;
    for (let i = start + 1; i < r.length - 1 && r[i + 1] !== 'ENDSEC'; i += 2) {
      if (r[i] === '0') { huidig = { type: r[i + 1], paren: [] }; continue; }
      if (r[i] === '5' && huidig) entiteiten.set(r[i + 1], huidig);
      huidig?.paren.push([r[i], r[i + 1]]);
    }
    const [hatchHandle, hatch] = [...entiteiten].find(([, e]) => e.type === 'HATCH')!;
    const waarde = (e: { paren: [string, string][] }, code: string) => e.paren.find(([c]) => c === code)?.[1];
    expect(waarde(hatch, '71')).toBe('1');
    const i97 = hatch.paren.flatMap(([c], i) => (c === '97' ? [i] : []));
    expect(i97.map((i) => hatch.paren[i][1])).toEqual(['1', '1']);
    const bronnen = i97.map((i) => hatch.paren[i + 1][1]);
    for (const b of bronnen) {
      const pl = entiteiten.get(b)!;
      expect(pl.type).toBe('LWPOLYLINE');
      // Reactor block right after the handle, pointing back at the hatch.
      expect(pl.paren.slice(1, 4)).toEqual([['102', '{ACAD_REACTORS'], ['330', hatchHandle], ['102', '}']]);
    }
    // The open cut line is drawn but carries no reactor.
    const lijn = [...entiteiten.values()].find((e) => e.type === 'LINE')!;
    expect(lijn.paren.some(([c]) => c === '102')).toBe(false);
  });

  it('writes every layer in ACI 7 in black and white', () => {
    /** ACI colour (group 62) of the LAYER record with this name. */
    const laagkleur = (dxf: string, naam: string): string => {
      const r = dxf.split('\n').map((s) => s.trim());
      const i = r.findIndex((v, j) => v === naam && r[j - 1] === '2');
      return r[r.indexOf('62', i) + 1];
    };
    const opties = {
      arcering: { soort: 'ansi31' as const },
      annotaties: [{ soort: 'tekst' as const, laag: 'titel' as const, p: { x: 0, y: 0 }, hoogte: 250, waarde: 'A-A' }],
    };
    const kleur = schrijfDxf(vierkant, opties);
    expect(laagkleur(kleur, 'SNEDE_IfcWall')).toBe('1');
    expect(laagkleur(kleur, 'ARCERING_IfcWall')).toBe('1');
    const zw = schrijfDxf(vierkant, { ...opties, zwartWit: true, kleuren: { IfcWall: 3 } });
    for (const laag of ['SNEDE_IfcWall', 'ARCERING_IfcWall', 'SNEDETITEL']) expect(laagkleur(zw, laag)).toBe('7');
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
