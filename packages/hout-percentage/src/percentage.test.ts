/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { computeWall, totalOf } from './percentage.js';
import { meshVolume, type MeshPiece } from './mesh-volume.js';
import type { WallMembers } from './model.js';

/**
 * Axis-aligned box in WALL coordinates (along, across, up; metres), placed in
 * Y-up world with the wall axis rotated by `angle` about the vertical and
 * shifted by `shift`. Built like the pipeline builds meshes: 4 separate
 * vertices per face (flat normals) and deliberately inconsistent winding.
 */
function box(lo: [number, number, number], hi: [number, number, number], angle = 0, shift: [number, number, number] = [0, 0, 0]): MeshPiece {
  const c = Math.cos(angle), s = Math.sin(angle);
  const world = (u: number, v: number, h: number): number[] => [u * c - v * s + shift[0], h + shift[1], u * s + v * c + shift[2]];
  const corner = (i: number): number[] => world(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]);
  const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const positions: number[] = [];
  const indices: number[] = [];
  faces.forEach((f, n) => {
    const b = positions.length / 3;
    for (const i of f) positions.push(...corner(i));
    // Every other face wound the wrong way round, as a double-sided mesher may emit.
    if (n % 2 === 0) indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), origin: [0, 0, 0] };
}

/** 1.2 m x 2.5 m frame, 240 mm deep: 3 studs of 45 mm + top and bottom plate of 45 mm. */
function frame(angle = 0, shift: [number, number, number] = [0, 0, 0]): Map<number, MeshPiece[]> {
  const T = 0.24, H = 2.5, t = 0.045;
  const m = new Map<number, MeshPiece[]>();
  m.set(1, [box([0, 0, 0], [1.2, T, t], angle, shift)]); // bottom plate
  m.set(2, [box([0, 0, H - t], [1.2, T, H], angle, shift)]); // top plate
  m.set(3, [box([0, 0, t], [t, T, H - t], angle, shift)]); // stud left
  m.set(4, [box([0.6 - t / 2, 0, t], [0.6 + t / 2, T, H - t], angle, shift)]); // stud middle
  m.set(5, [box([1.2 - t, 0, t], [1.2, T, H - t], angle, shift)]); // stud right
  return m;
}

const wall = (memberIds: number[], openingIds: number[] = []): WallMembers => ({ wallId: 100, name: 'W1', globalId: 'g', ifcType: 'IfcWall', memberIds, openingIds });

// Timber in the wall plane: 2 plates 1.2 x 0.045 + 3 studs 0.045 x 2.41.
const TIMBER_AREA = 2 * 1.2 * 0.045 + 3 * 0.045 * 2.41;
const ENVELOPE = 1.2 * 2.5;

describe('meshVolume', () => {
  it('measures a box with inconsistent winding exactly and calls it closed', () => {
    const v = meshVolume([box([0, 0, 0], [0.045, 0.24, 2.5])]);
    expect(v.volume).toBeCloseTo(0.045 * 0.24 * 2.5, 9);
    expect(v.closed).toBe(true);
    expect(v.flipped).toBeGreaterThan(0);
  });

  it('reports an open mesh', () => {
    const b = box([0, 0, 0], [1, 1, 1]);
    const open = { ...b, indices: b.indices.slice(0, b.indices.length - 6) };
    const v = meshVolume([open]);
    expect(v.closed).toBe(false);
    expect(v.boundaryEdges).toBe(4);
  });
});

describe('computeWall', () => {
  it('gives the known fraction for a plain frame, in every variant', () => {
    const meshes = frame();
    const r = computeWall(wall([1, 2, 3, 4, 5]), (id) => meshes.get(id) ?? []);
    const expected = TIMBER_AREA / ENVELOPE; // prismatic frame: volume and area fractions coincide
    expect(r.length).toBeCloseTo(1.2, 6);
    expect(r.height).toBeCloseTo(2.5, 6);
    expect(r.thickness).toBeCloseTo(0.24, 6);
    for (const id of ['volumeGross', 'volumeNet', 'sectionGross', 'sectionNet', 'projectedGross', 'unionVolumeGross'] as const) {
      expect(r.variants[id], id).toBeCloseTo(expected, 4);
    }
    expect(r.variants.volumeGrossAuthored).toBeNull(); // no authored reader given
    expect(r.openMembers).toEqual([]);
  });

  it('does not depend on how the wall is oriented or placed', () => {
    const plain = frame();
    const turned = frame(0.7, [12.3, 0.45, -8.1]);
    const a = computeWall(wall([1, 2, 3, 4, 5]), (id) => plain.get(id) ?? []);
    const b = computeWall(wall([1, 2, 3, 4, 5]), (id) => turned.get(id) ?? []);
    expect(b.length).toBeCloseTo(a.length, 5);
    expect(b.variants.volumeGross).toBeCloseTo(a.variants.volumeGross ?? 0, 5);
    expect(b.variants.sectionGross).toBeCloseTo(a.variants.sectionGross ?? 0, 3);
  });

  it('takes openings off the net denominator only', () => {
    const meshes = frame();
    // 0.4 x 1.0 m opening between the studs, deeper than the frame zone.
    meshes.set(9, [box([0.1, -0.05, 1.0], [0.5, 0.3, 2.0])]);
    const r = computeWall(wall([1, 2, 3, 4, 5], [9]), (id) => meshes.get(id) ?? []);
    expect(r.openingArea).toBeCloseTo(0.4, 4);
    expect(r.variants.volumeGross).toBeCloseTo(TIMBER_AREA / ENVELOPE, 4);
    expect(r.variants.volumeNet).toBeCloseTo(TIMBER_AREA / (ENVELOPE - 0.4), 4);
    expect(r.variants.sectionNet).toBeCloseTo(TIMBER_AREA / (ENVELOPE - 0.4), 3);
  });

  it('counts an overlap once in the union and twice in the plain sum', () => {
    const meshes = frame();
    meshes.set(6, [box([0.6 - 0.0225, 0, 1.0], [0.6 + 0.0225, 0.24, 1.5])]); // duplicate piece inside the middle stud
    const r = computeWall(wall([1, 2, 3, 4, 5, 6]), (id) => meshes.get(id) ?? []);
    expect(r.variants.volumeGross).toBeCloseTo((TIMBER_AREA + 0.045 * 0.5) / ENVELOPE, 4);
    expect(r.variants.unionVolumeGross).toBeCloseTo(TIMBER_AREA / ENVELOPE, 4);
  });

  it('keeps the zone band of the studs when a deeper header sticks out', () => {
    const meshes = frame();
    meshes.set(7, [box([0.05, 0, 2.2], [1.15, 0.28, 2.455])]); // 280 mm deep header
    const r = computeWall(wall([1, 2, 3, 4, 5, 7]), (id) => meshes.get(id) ?? []);
    expect(r.thickness).toBeCloseTo(0.24, 6);
    expect(r.fullThickness).toBeCloseTo(0.28, 6);
  });

  it('uses the authored volume when a reader is given', () => {
    const meshes = frame();
    const r = computeWall(wall([1, 2, 3, 4, 5]), (id) => meshes.get(id) ?? [], { authoredVolume: (id) => (id === 1 ? null : 0.01) });
    expect(r.timberVolumeAuthored).toBeCloseTo(0.04, 9);
    expect(r.membersWithoutAuthoredVolume).toEqual([1]);
    expect(r.variants.volumeGrossAuthored).toBeCloseTo(0.04 / (ENVELOPE * 0.24), 6);
  });

  it('totals as sum over sum, not as a mean of percentages', () => {
    const small = frame();
    const a = computeWall(wall([1, 2, 3, 4, 5]), (id) => small.get(id) ?? []);
    const b = computeWall(wall([3]), (id) => small.get(id) ?? []); // one stud alone: 100 %
    const t = totalOf([a, b]);
    const expected = (a.timberVolume + b.timberVolume) / (a.envelopeArea * a.thickness + b.envelopeArea * b.thickness);
    expect(t.variants.volumeGross).toBeCloseTo(expected, 9);
    expect(b.variants.volumeGross).toBeCloseTo(1, 6);
  });
});
