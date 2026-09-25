/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import type { Lijn } from '../genereer.js';
import { naarSectionConfig, vlakUitTekst } from '../vlak.js';
import { zichtlijnen } from './index.js';

/** Axis-aligned box in IFC mm, as a mesh in the renderer frame (Y-up, metres). */
function blok(id: number, [x0, x1]: number[], [y0, y1]: number[], [z0, z1]: number[]): MeshData {
  const hoeken: number[] = [];
  for (const z of [z0, z1]) for (const y of [y0, y1]) for (const x of [x0, x1]) hoeken.push(x / 1000, z / 1000, -y / 1000);
  // Corner index = x + 2y + 4z (0/1 per axis); two triangles per face.
  const vlakken = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const indices = vlakken.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  return {
    expressId: id, ifcType: 'IfcWall', positions: Float32Array.from(hoeken),
    normals: new Float32Array(hoeken.length), indices: Uint32Array.from(indices),
    color: [1, 1, 1, 1],
  } as MeshData;
}

// Looking toward +Y from y = 0: DXF-X = world X, DXF-Y = world Z, depth = world Y.
const vlak = { ...vlakUitTekst('S:y=0'), diepte: 3000 };
const { config, offsetMm } = naarSectionConfig(vlak, undefined);

const sleutel = (l: Lijn): string => [l.a.x, l.a.y, l.b.x, l.b.y].map((v) => v.toFixed(3)).join(' ');
const genormaliseerd = (l: Lijn): Lijn => (l.a.x > l.b.x || (l.a.x === l.b.x && l.a.y > l.b.y) ? { ...l, a: l.b, b: l.a } : l);
const van = (lijnen: Lijn[], soort: string, id: number) => lijnen
  .filter((l) => l.soort === soort && l.entityId === id).map(genormaliseerd).map(sleutel).sort();

describe('zichtlijnen', () => {
  it('draws the outline of a box, not its triangle diagonals, and hides its back edges', () => {
    const lijnen = zichtlijnen([blok(1, [0, 1000], [100, 200], [0, 1000])], config, offsetMm, 3000, []);
    expect(van(lijnen, 'zicht', 1)).toEqual([
      '0.000 0.000 0.000 1000.000', '0.000 0.000 1000.000 0.000',
      '0.000 1000.000 1000.000 1000.000', '1000.000 0.000 1000.000 1000.000',
    ]);
    // The back face's edges coincide with the front outline in the drawing.
    expect(van(lijnen, 'verborgen', 1)).toHaveLength(4);
  });

  it('splits an edge exactly where a nearer element starts to cover it', () => {
    const voor = blok(1, [0, 1000], [100, 200], [0, 1000]);
    const achter = blok(2, [500, 1500], [500, 600], [0, 500]);
    const lijnen = zichtlijnen([voor, achter], config, offsetMm, 3000, []);
    expect(van(lijnen, 'zicht', 2)).toContain('1000.000 500.000 1500.000 500.000');
    expect(van(lijnen, 'verborgen', 2)).toContain('500.000 500.000 1000.000 500.000');
  });

  it('hides what lies behind the cut face of an element the plane cuts', () => {
    const gesneden = blok(1, [0, 1000], [-100, 100], [0, 1000]);
    const achter = blok(2, [200, 800], [300, 400], [200, 800]);
    const rand: Lijn[] = [[0, 0, 1000, 0], [1000, 0, 1000, 1000], [1000, 1000, 0, 1000], [0, 1000, 0, 0]]
      .map(([ax, ay, bx, by]) => ({ soort: 'snede', ifcType: 'IfcWall', entityId: 1, a: { x: ax, y: ay }, b: { x: bx, y: by } }));
    const lijnen = zichtlijnen([gesneden, achter], config, offsetMm, 3000, rand);
    expect(van(lijnen, 'zicht', 2)).toEqual([]);
    expect(van(lijnen, 'verborgen', 2).length).toBeGreaterThan(0);
  });

  it('draws no view line between the material layers of one element', () => {
    const laag = (x0: number, x1: number) => ({ ...blok(5, [x0, x1], [100, 200], [0, 1000]), geometryClass: 3 });
    const lijnen = zichtlijnen([laag(0, 500), laag(500, 1000)], config, offsetMm, 3000, []);
    expect(van(lijnen, 'zicht', 5)).not.toContain('500.000 0.000 500.000 1000.000');
    expect(van(lijnen, 'zicht', 5)).toContain('0.000 0.000 0.000 1000.000');
    // Two separate elements do keep the line where they meet.
    const los = zichtlijnen([blok(6, [0, 500], [100, 200], [0, 1000]), blok(7, [500, 1000], [100, 200], [0, 1000])],
      config, offsetMm, 3000, []);
    expect(van(los, 'zicht', 6)).toContain('500.000 0.000 500.000 1000.000');
  });

  it('ignores geometry beyond the view depth', () => {
    const ver = blok(3, [0, 1000], [4000, 4100], [0, 1000]);
    expect(zichtlijnen([ver], config, offsetMm, 3000, [])).toEqual([]);
  });
});
