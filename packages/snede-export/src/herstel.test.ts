/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { RelationshipType } from '@ifc-lite/data';
import type { FaceSet } from '@ifc-lite/wand-geometrie';
import { dubbelGesnedenOnderdelen, vlakkenNaarMesh, type HerstelStore } from './herstel.js';

/** Faces from loops of [x, y, z] points; each face is a list of loops (first = outer). */
function faceSet(faces: number[][][][]): FaceSet {
  const points: number[] = [];
  const loopStart: number[] = [];
  const faceStart: number[] = [];
  for (const face of faces) {
    faceStart.push(loopStart.length);
    for (const loop of face) {
      loopStart.push(points.length / 3);
      for (const p of loop) points.push(...p);
    }
  }
  loopStart.push(points.length / 3);
  // Sentinel, as authoredFaces writes it: the last face ends at the closing loop index.
  faceStart.push(loopStart.length - 1);
  return { points: Float64Array.from(points), loopStart: Int32Array.from(loopStart), faceStart: Int32Array.from(faceStart) };
}

/** Enclosed volume of a triangle mesh, orientation-independent per closed shell is not needed here: abs(sum). */
function volume(m: { positions: Float32Array; indices: Uint32Array }): number {
  let v = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((j) => m.positions[3 * m.indices[t + k] + j]));
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return Math.abs(v) / 6;
}

describe('vlakkenNaarMesh', () => {
  // Unit cube with outward-consistent quads.
  const cube = faceSet([
    [[[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]], [[[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [[[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [[[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]], [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  ]);

  it('triangulates every face and keeps the volume', () => {
    const m = vlakkenNaarMesh(cube, undefined)!;
    expect(m.indices.length / 3).toBe(12);
    expect(volume(m)).toBeCloseTo(1, 6);
  });

  it('keeps holes in a face open', () => {
    const plate = faceSet([[
      [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]],
      [[1, 1, 0], [1, 3, 0], [3, 3, 0], [3, 1, 0]],
    ]]);
    const m = vlakkenNaarMesh(plate, undefined)!;
    let area = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => [m.positions[3 * m.indices[t + k]], m.positions[3 * m.indices[t + k] + 1]]);
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    expect(area).toBeCloseTo(16 - 4, 6);
  });

  it('moves the mesh into the renderer frame via its origin', () => {
    const info = { originShift: { x: 10, y: 2, z: -3 }, wasmRtcOffset: { x: 100, y: 200, z: 5 } };
    const m = vlakkenNaarMesh(cube, info as never)!;
    // First point (0,0,0) Y-up world -> (0-100-10, 0-5-2, 0+200+3).
    expect(m.origin).toEqual([-110, -7, 203]);
    expect(Array.from(m.positions.slice(0, 3))).toEqual([0, 0, 0]);
  });
});

describe('dubbelGesnedenOnderdelen', () => {
  // 1 wall with opening 9; wall aggregates beam 2, layer slice 3, assembly 4 -> plate 5.
  const types: Record<number, string> = { 1: 'IfcWall', 2: 'IfcBeam', 3: 'IfcBuildingElementPart', 4: 'IfcElementAssembly', 5: 'IfcPlate', 9: 'IfcOpeningElement', 20: 'IfcWall', 21: 'IfcBeam' };
  const aggregates: Record<number, number[]> = { 1: [2, 3, 4], 4: [5], 20: [21] };
  const store: HerstelStore = {
    getEntity: () => null,
    entities: { getTypeName: (id) => types[id] ?? '' },
    entityIndex: { byType: new Map([['IFCOPENINGELEMENT', [9]]]) },
    relationships: {
      getRelated: (id, rel, dir) => {
        if (rel === RelationshipType.VoidsElement && dir === 'inverse') return id === 9 ? [1] : [];
        if (rel === RelationshipType.Aggregates && dir === 'forward') return aggregates[id] ?? [];
        return [];
      },
    },
  };

  it('takes every non-slice part under a host with openings, at any depth', () => {
    expect([...dubbelGesnedenOnderdelen(store)].sort()).toEqual([2, 4, 5]);
  });

  it('leaves parts of hosts without openings alone', () => {
    expect(dubbelGesnedenOnderdelen(store).has(21)).toBe(false);
  });
});
