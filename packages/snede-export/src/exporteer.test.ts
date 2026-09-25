/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { GeometryDiagnostics, MeshData } from '@ifc-lite/geometry';
import { exporteer } from './exporteer.js';
import { verslagAlsTekst } from './verslag.js';
import { vlakUitTekst } from './vlak.js';

/** Axis-aligned box in IFC mm as a mesh in the renderer frame (Y-up, metres). */
function blok(id: number, ifcType: string, [x0, x1]: number[], [y0, y1]: number[], [z0, z1]: number[]): MeshData {
  const hoeken: number[] = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) hoeken.push(x / 1000, z / 1000, -y / 1000);
  const vlakken = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  return {
    expressId: id, ifcType, positions: Float32Array.from(hoeken), normals: new Float32Array(hoeken.length),
    indices: Uint32Array.from(vlakken.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])), color: [1, 1, 1, 1],
  } as MeshData;
}

describe('exporteer', () => {
  const wand = blok(1, 'IfcWall', [0, 4000], [0, 200], [0, 3000]);
  const opening = blok(2, 'IfcOpeningElement', [1000, 2000], [0, 200], [0, 2100]);
  const kast = blok(3, 'IfcFurnishingElement', [500, 900], [300, 900], [0, 800]);
  const vlakken = [
    { ...vlakUitTekst('A:x=2500'), diepte: 1000 },
    { ...vlakUitTekst('P:z=1000'), diepte: 0 },
    { ...vlakUitTekst('L:x=99000'), diepte: 0 },
  ];

  it('reports per section and what was left out', async () => {
    const { dxf, verslag } = await exporteer([wand, opening, kast], undefined, vlakken, {
      verborgenElementen: new Set([3]),
    });
    expect(dxf).toContain('\nSNEDE_IfcWall\n');
    const [a, p, l] = verslag.snedes;
    expect(a.gesneden).toBe(1);
    expect(a.lijnen.snede).toBeGreaterThan(0);
    expect(a.openSnedeomtrekken).toEqual([]);
    expect(p.isPlan).toBe(true);
    expect(l.gesneden).toBe(0);
    expect(verslag.waarschuwingen).toEqual(['snede L raakt geen enkel element binnen de kijkdiepte']);
    expect(verslag.nietGetekend).toEqual([{ ifcType: 'IfcOpeningElement', aantal: 1 }]);
    expect(verslag.verborgenNietGeexporteerd).toBe(1);
    expect(verslag.geometrie).toBeUndefined();
  });

  it('passes model diagnostics through and renders a text report', async () => {
    const diagnose = {
      schemaVersion: 3, totalCsgFailures: 2, productsWithFailures: 1, hostsWithOpenings: 1,
      classification: { rectangular: 1, diagonal: 0, nonRectangular: 1, total: 2 },
      failuresByReason: [{ reason: 'KernelError', count: 2 }], silentNoOps: 0,
      rectFast: { fired: 0, openingsCut: 0, deferHostNotBox: 0, deferNotThrough: 0, deferOffFace: 0, deferNearEdge: 0, deferNoOpenings: 0 },
      worstHosts: [{ productId: 1, ifcType: 'IfcWall', openings: 2, csgFailures: 2, firstFailureLabel: 'KernelError' }],
      unsupportedItemsByType: [{ reason: 'IfcAdvancedBrep', count: 3 }],
    } as GeometryDiagnostics;
    const { verslag } = await exporteer([wand], undefined, vlakken.slice(0, 1), { diagnose });
    expect(verslag.geometrie?.slechtsteElementen[0]).toMatchObject({ entityId: 1, fouten: 2 });
    const tekst = verslagAlsTekst(verslag);
    expect(tekst).toContain('#1 IfcWall: 2 van 2 openingen mislukt (KernelError)');
    expect(tekst).toContain('IfcAdvancedBrep 3');
  });
});
