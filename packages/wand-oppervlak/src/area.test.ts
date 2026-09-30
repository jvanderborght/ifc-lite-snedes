/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { computeWallArea, totalOf, type WallGeometry } from './area.js';
import type { FaceSet, MeshPiece } from '@ifc-lite/wand-geometrie';
import type { WallParts } from './model.js';

type P2 = [number, number];

/** Prism from a polygon in the wall plane (x along, y up; Y-up metres) between z0 and z1 across. */
function prism(poly: P2[], z0: number, z1: number): FaceSet {
  const pts: number[] = [], loops: number[] = [], faces: number[] = [];
  const face = (ring: Array<[number, number, number]>) => {
    faces.push(loops.length);
    loops.push(pts.length / 3);
    for (const p of ring) pts.push(...p);
  };
  face(poly.map(([x, y]) => [x, y, z0]));
  face([...poly].reverse().map(([x, y]) => [x, y, z1]));
  poly.forEach(([x, y], i) => {
    const [x2, y2] = poly[(i + 1) % poly.length];
    face([[x, y, z0], [x2, y2, z0], [x2, y2, z1], [x, y, z1]]);
  });
  loops.push(pts.length / 3);
  faces.push(loops.length - 1);
  return { points: Float64Array.from(pts), loopStart: Int32Array.from(loops), faceStart: Int32Array.from(faces) };
}

const rect = (x0: number, y0: number, x1: number, y1: number): P2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Box as a triangle mesh (12 triangles), Y-up metres. */
function boxMesh(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): MeshPiece {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const q = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  return { positions: v.flat(), indices: q.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]) };
}

const declared = { grossSideArea: null, netSideArea: null, quantitySet: null, dimensionsLength: null, dimensionsHeight: null };

/** A wall without a body of its own (id 1) whose parts 10.. are the given prisms. */
function wallOf(parts: Array<{ faces: FaceSet; zone?: string }>, openings: FaceSet[] = [], parentWallId: number | null = null): { wall: WallParts; geometry: WallGeometry } {
  const byId = new Map<number, FaceSet>();
  const zones = new Map<number, string>();
  parts.forEach((p, i) => { byId.set(10 + i, p.faces); if (p.zone !== undefined) zones.set(10 + i, p.zone); });
  openings.forEach((f, i) => byId.set(100 + i, f));
  const wall: WallParts = {
    wallId: 1, name: 'W', globalId: 'g', ifcType: 'IfcWall',
    partIds: [1, ...parts.map((_, i) => 10 + i)], zones, partTypes: new Map(),
    openingIds: openings.map((_, i) => 100 + i), openingMarkerIds: openings.map((_, i) => 100 + i), markerTypes: new Map(), parentWallId, declared,
  };
  return { wall, geometry: { meshes: () => [], authored: (id) => byId.get(id) ?? null } };
}

describe('computeWallArea', () => {
  it('rectangle: gross = net = length x height', () => {
    const { wall, geometry } = wallOf([{ faces: prism(rect(0, 0, 4, 3), 0, 0.2) }]);
    const r = computeWallArea(wall, geometry);
    expect(r.source).toBe('authored');
    expect(r.grossArea).toBeCloseTo(12, 6);
    expect(r.netArea).toBeCloseTo(12, 6);
    expect(r.isRectangular).toBe(true);
    expect([r.length, r.height, r.thickness].map((x) => +x.toFixed(6))).toEqual([4, 3, 0.2]);
  });

  it('gable wall: exact area of the pentagon, not length x height', () => {
    const gable: P2[] = [[0, 0], [6, 0], [6, 2.5], [3, 4], [0, 2.5]];
    const { wall, geometry } = wallOf([{ faces: prism(gable, 0, 0.3) }]);
    const r = computeWallArea(wall, geometry);
    expect(r.grossArea).toBeCloseTo(19.5, 4);
    expect(r.netArea).toBeCloseTo(19.5, 4);
    expect(r.isRectangular).toBe(false);
  });

  it('window framed by four parts: the hole is gross but not net', () => {
    const { wall, geometry } = wallOf([
      { faces: prism(rect(0, 0, 1.5, 3), 0, 0.2) },
      { faces: prism(rect(2.5, 0, 4, 3), 0, 0.2) },
      { faces: prism(rect(1.5, 0, 2.5, 0.9), 0, 0.2) },
      { faces: prism(rect(1.5, 2.1, 2.5, 3), 0, 0.2) },
    ]);
    const r = computeWallArea(wall, geometry);
    expect(r.grossArea).toBeCloseTo(12, 6);
    expect(r.netArea).toBeCloseTo(10.8, 6);
    expect(r.openingArea).toBeCloseTo(1.2, 6);
    expect(r.holeCount).toBe(1);
  });

  it('door reaching the floor is a notch: only its opening element closes it', () => {
    const parts = [
      { faces: prism(rect(0, 0, 1.5, 3), 0, 0.2) },
      { faces: prism(rect(2.5, 0, 4, 3), 0, 0.2) },
      { faces: prism(rect(1.5, 2.1, 2.5, 3), 0, 0.2) },
    ];
    const without = computeWallArea(wallOf(parts).wall, wallOf(parts).geometry);
    expect(without.grossArea).toBeCloseTo(9.9, 6);
    // Opening deeper and lower than the wall: clipped to the wall's extent.
    const w = wallOf(parts, [prism(rect(1.5, -0.2, 2.5, 2.1), -0.1, 0.3)]);
    const r = computeWallArea(w.wall, w.geometry);
    expect(r.openingsWithGeometry).toBe(1);
    expect(r.grossArea).toBeCloseTo(12, 6);
    expect(r.netArea).toBeCloseTo(9.9, 6);
  });

  it('leaves foils out by default, keeps them on request', () => {
    const parts = [
      { faces: prism(rect(0, 0, 4, 3), 0, 0.2) },
      { faces: prism(rect(-0.1, -0.3, 4.1, 3.8), 0.2, 0.201) }, // membrane with laps
    ];
    const { wall, geometry } = wallOf(parts);
    const r = computeWallArea(wall, geometry);
    expect(r.foilsLeftOut).toBe(1);
    expect(r.grossArea).toBeCloseTo(12, 6);
    expect(computeWallArea(wall, geometry, { foilMaxThickness: 0 }).grossArea).toBeCloseTo(4.2 * 4.1, 6);
  });

  it('reads a keyhole face (hole joined to the outline by a bridge edge) as a hole', () => {
    const keyhole: P2[] = [[0, 0], [2, 0], [2, 2], [1, 2], [1, 1.5], [0.8, 1.5], [0.8, 1.2], [1.2, 1.2], [1.2, 1.5], [1, 1.5], [1, 2], [0, 2]];
    const { wall, geometry } = wallOf([{ faces: prism(keyhole, 0, 0.012) }]);
    const r = computeWallArea(wall, geometry);
    expect(r.netArea).toBeCloseTo(4 - 0.4 * 0.3, 6);
    expect(r.grossArea).toBeCloseTo(4, 6);
  });

  it('per side: layers outside the frame zone, by zone sign', () => {
    const { wall, geometry } = wallOf([
      { faces: prism(rect(0, 0, 4, 3), 0, 0.2), zone: '0' },
      { faces: prism(rect(0, 0, 0.045, 3), 0, 0.2), zone: '0' },
      { faces: prism(rect(0, 0, 4, 2.5), 0.2, 0.212), zone: '2' }, // outer board, shorter
      { faces: prism(rect(0.1, 0, 3.9, 3), -0.0125, 0), zone: '-2' }, // inner board, narrower
      { faces: prism(rect(0.5, 0, 1, 3), 0.05, 0.15), zone: '-5' }, // insulation inside the frame
    ]);
    const r = computeWallArea(wall, geometry);
    expect(r.sidePlusArea).toBeCloseTo(10, 6);
    expect(r.sideMinusArea).toBeCloseTo(11.4, 6);
    expect(r.zoneAreas.map((z) => z.zone)).toEqual(['-5', '-2', '0', '2']);
  });

  it('uses the pipeline mesh for a wall with a body of its own, and has no sides without zones', () => {
    const wall: WallParts = { wallId: 1, name: 'R', globalId: 'g', ifcType: 'IfcWallStandardCase', partIds: [1], zones: new Map(), partTypes: new Map(), openingIds: [], openingMarkerIds: [], markerTypes: new Map(), parentWallId: null, declared };
    const r = computeWallArea(wall, { meshes: (id) => (id === 1 ? [boxMesh(0, 0, 0, 5, 2.8, 0.1)] : []), authored: () => null });
    expect(r.source).toBe('mesh');
    expect(r.grossArea).toBeCloseTo(14, 6);
    expect(r.sidePlusArea).toBeNull();
  });

  it('totals skip walls nested in another wall', () => {
    const a = wallOf([{ faces: prism(rect(0, 0, 4, 3), 0, 0.2) }]);
    const b = wallOf([{ faces: prism(rect(0, 0, 2, 3), 0, 0.2) }], [], 1);
    const t = totalOf([computeWallArea(a.wall, a.geometry), computeWallArea(b.wall, b.geometry)]);
    expect(t.walls).toBe(1);
    expect(t.grossArea).toBeCloseTo(12, 6);
  });
});
