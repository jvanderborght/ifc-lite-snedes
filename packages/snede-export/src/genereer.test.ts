/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { tekenSnede } from './genereer.js';
import { maakPolylijnen } from './polylijnen.js';
import { vlakUitTekst } from './vlak.js';

/** Axis-aligned box in IFC mm, as a mesh in the renderer frame (Y-up, metres). */
function blok(id: number, [x0, x1]: number[], [y0, y1]: number[], [z0, z1]: number[]): MeshData {
  const hoeken: number[] = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) hoeken.push(x / 1000, z / 1000, -y / 1000);
  const vlakken = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  return {
    expressId: id, ifcType: 'IfcBeam', positions: Float32Array.from(hoeken),
    normals: new Float32Array(hoeken.length), indices: Uint32Array.from(vlakken.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])),
    color: [1, 1, 1, 1],
  } as MeshData;
}

describe('tekenSnede on a plane that coincides with a face', () => {
  // 'y=0' looks toward +Y: the drawn part is y > 0.
  const vlak = vlakUitTekst('S:y=0');

  it('cuts an element touching the plane on the drawn side as a closed outline', async () => {
    const lijnen = await tekenSnede([blok(1, [0, 60], [0, 40], [0, 2400])], undefined, vlak);
    const omtrekken = maakPolylijnen(lijnen.filter((l) => l.soort === 'snede'));
    expect(omtrekken).toHaveLength(1);
    expect(omtrekken[0].gesloten).toBe(true);
    // Cut 0.01 mm inside the element: triangle diagonals chamfer a corner by
    // hundredths of a millimetre, so compare with the rectangle within 0.1 mm.
    for (const p of omtrekken[0].punten) {
      const opRand = Math.min(Math.abs(p.x), Math.abs(p.x - 60), Math.abs(p.y), Math.abs(p.y - 2400));
      expect(opRand).toBeLessThan(0.1);
    }
    const xs = omtrekken[0].punten.map((p) => p.x);
    const ys = omtrekken[0].punten.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round)).toEqual([0, 60, 0, 2400]);
  });

  it('leaves out an element touching the plane on the removed side', async () => {
    const lijnen = await tekenSnede([blok(2, [0, 60], [-40, 0], [0, 2400])], undefined, vlak);
    expect(lijnen.filter((l) => l.soort === 'snede')).toEqual([]);
  });
});
