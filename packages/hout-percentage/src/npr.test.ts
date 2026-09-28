/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { FaceSet } from '@ifc-lite/wand-geometrie';
import { computeNpr, nprTotal, type NprGeometry, type NprWall } from './npr.js';

/** Box as a faceted B-rep: x along, y up, z across (Y-up metres, like `authoredFaces`). */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): FaceSet {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return {
    points: Float64Array.from(quads.flatMap((q) => q.flatMap((i) => v[i]))),
    loopStart: Int32Array.from({ length: 7 }, (_, k) => 4 * k),
    faceStart: Int32Array.from({ length: 7 }, (_, k) => k),
  };
}

const T = 0.038, D = 0.14;
/** Member in the frame zone (across 0..140 mm): along x0..x1, up y0..y1. */
const member = (x0: number, x1: number, y0: number, y1: number): FaceSet => box(x0, y0, 0, x1, y1, D);
/** Opening marker through all layers. */
const marker = (x0: number, x1: number, y0: number, y1: number): FaceSet => box(x0, y0, -0.05, x1, y1, D + 0.1);

interface Part { faces: FaceSet; zone?: string; type?: string }

function wallOf(parts: Part[], markers: FaceSet[] = []): { wall: NprWall; geometry: NprGeometry } {
  const byId = new Map<number, FaceSet>();
  const zones = new Map<number, string>();
  const partTypes = new Map<number, string>();
  parts.forEach((p, i) => {
    byId.set(10 + i, p.faces);
    if (p.zone !== undefined) zones.set(10 + i, p.zone);
    partTypes.set(10 + i, p.type ?? 'IfcBeam');
  });
  markers.forEach((f, i) => byId.set(1000 + i, f));
  return {
    wall: { wallId: 1, partIds: [1, ...parts.map((_, i) => 10 + i)], zones, partTypes, openingMarkerIds: markers.map((_, i) => 1000 + i) },
    geometry: { meshes: () => [], authored: (id) => byId.get(id) ?? null },
  };
}

/**
 * Synthetic stand-in for the NPR 2068 example (figure E.9): a 6.681 x 2.7 m
 * element with two 1.3 m² windows. The example gives A_con 15.44 m² and
 * timber 1.80 m² (11.7 %); its member layout is not given, so this one is
 * ASSUMED: studs 38 mm at 600 mm centres from the left end plus an end stud,
 * one 38 mm bottom and top plate over the full length, both windows between
 * two regular studs (clear width 1.162 m, height 1.3 / 1.162 m) with a single
 * 38 mm sill and header and the interrupted middle stud as cripples.
 */
function e9(): { wall: NprWall; geometry: NprGeometry } {
  const L = 6.681, H = 2.7;
  const parts: FaceSet[] = [member(0, L, 0, T), member(0, L, H - T, H)];
  const windows = [[0.6 + T, 1.8], [4.2 + T, 5.4]] as const;
  const wh = 1.3 / (windows[0][1] - windows[0][0]);
  const sill = 0.9, head = sill + wh;
  const studs = [0, 0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2, 4.8, 5.4, 6.0, L - T];
  for (const x of studs) {
    const inWindow = windows.some(([a, b]) => x >= a && x + T <= b);
    if (!inWindow) { parts.push(member(x, x + T, T, H - T)); continue; }
    parts.push(member(x, x + T, T, sill - T), member(x, x + T, head + T, H - T));
  }
  for (const [a, b] of windows) parts.push(member(a, b, sill - T, sill), member(a, b, head, head + T));
  return wallOf(parts.map((faces) => ({ faces, zone: '0' })), windows.map(([a, b]) => marker(a, b, sill, head)));
}

const r2 = (x: number): number => Math.round(x * 100) / 100;
const r1pct = (x: number | null): number | null => (x === null ? null : Math.round(x * 1000) / 10);

describe('computeNpr', () => {
  it('reproduces the E.9 example: A_con 15.44 m², timber about 1.80 m² and 11.7 %', () => {
    const { wall, geometry } = e9();
    const r = computeNpr(wall, geometry);
    expect(r.status).toBe('ok');
    expect(r.source).toBe('authored');
    expect(r.openingCount).toBe(2);
    expect(r2(r.outlineArea)).toBe(18.04);
    expect(r2(r.openingArea)).toBe(2.6);
    expect(r2(r.aCon)).toBe(15.44);
    // 1.790 m² with the assumed layout (hand count: plates 0.5078, 10 full
    // studs 0.9971, cripples 0.1086, sills and headers 0.1766).
    expect(r.aB).toBeCloseTo(1.79012, 3);
    expect(Math.abs(r.aB - 1.8)).toBeLessThan(0.015);
    expect(Math.abs((r.fraction ?? 0) * 100 - 11.7)).toBeLessThan(0.15);
    expect(r2(r.aA)).toBe(r2(r.aCon - r.aB));
  });

  it('raveling: the timber within 40 mm of each window leaves A_con and A_b together', () => {
    const r = computeNpr(e9().wall, e9().geometry);
    // Per window: two jamb studs 38 x (h + 2 x 40) mm, sill and header 1.162 x 0.038,
    // plus 2 mm of the cripples below the sill and above the header.
    const wh = 1.3 / 1.162;
    const perWindow = 2 * T * (wh + 0.08) + 2 * 1.162 * T + 2 * 0.002 * T;
    expect(r.ravelingArea).toBeCloseTo(2 * perWindow, 3);
    expect(r.ravelingExcluded.aCon).toBeCloseTo(r.aCon - r.ravelingArea, 9);
    expect(r.ravelingExcluded.aB).toBeCloseTo(r.aB - r.ravelingArea, 9);
    expect(r1pct(r.ravelingExcluded.fraction)).toBe(9.5);
  });

  it('a cavity with only a small installation box in it stays in A_con', () => {
    const { wall, geometry } = e9();
    const withBox = wallOf(
      [...wall.partIds.slice(1).map((id) => ({ faces: geometry.authored?.(id) as FaceSet, zone: '0' }))],
      [...wall.openingMarkerIds.map((id) => geometry.authored?.(id) as FaceSet), marker(2.6, 2.7, 1.0, 1.1)],
    );
    const r = computeNpr(withBox.wall, withBox.geometry);
    expect(r.openingCount).toBe(2);
    expect(r2(r.aCon)).toBe(15.44);
  });

  it('a door without a bottom plate is a notch closed by its marker, not part of A_con', () => {
    const parts: Part[] = [
      { faces: member(0, 3, 2.7 - T, 2.7) },
      { faces: member(0, 1, 0, T) }, { faces: member(2, 3, 0, T) },
      { faces: member(0, T, T, 2.7 - T) }, { faces: member(1 - T, 1, T, 2.7 - T) },
      { faces: member(2, 2 + T, T, 2.7 - T) }, { faces: member(3 - T, 3, T, 2.7 - T) },
      { faces: member(1, 2, 2.1, 2.1 + T) },
    ].map((p) => ({ ...p, zone: '0' }));
    const { wall, geometry } = wallOf(parts, [marker(1, 2, -0.02, 2.1)]);
    const r = computeNpr(wall, geometry);
    expect(r.openingCount).toBe(1);
    expect(r.outlineArea).toBeCloseTo(3 * 2.7, 3);
    expect(r.openingArea).toBeCloseTo(1 * 2.1, 3);
    expect(r.aCon).toBeCloseTo(8.1 - 2.1, 3);
  });

  it('counts only zone-0 IfcBeam as timber; other zones do not widen the outline', () => {
    const { wall, geometry } = wallOf([
      { faces: member(0, 2, 0, 2), zone: '0' },
      { faces: box(-0.5, -0.5, D, 2.5, 2.5, D + 0.012), zone: '1', type: 'IfcPlate' },
    ]);
    const r = computeNpr(wall, geometry);
    expect(r.aCon).toBeCloseTo(4, 3);
    expect(r.aB).toBeCloseTo(4, 3);
  });

  it('says why a wall cannot be evaluated instead of giving a number', () => {
    const solid = wallOf([{ faces: member(0, 4, 0, 3), type: 'IfcWallStandardCase' }]);
    expect(computeNpr(solid.wall, solid.geometry).status).toBe('noZones');
    expect(computeNpr(solid.wall, solid.geometry).fraction).toBeNull();
    const noFrame = wallOf([{ faces: member(0, 4, 0, 3), zone: '1', type: 'IfcPlate' }]);
    expect(computeNpr(noFrame.wall, noFrame.geometry).status).toBe('noFrame');
  });

  it('totals are sums, and the fraction is sum over sum', () => {
    const a = computeNpr(e9().wall, e9().geometry);
    const b = computeNpr(wallOf([{ faces: member(0, 1, 0, 1), zone: '0' }]).wall, wallOf([{ faces: member(0, 1, 0, 1), zone: '0' }]).geometry);
    const t = nprTotal([a, b, computeNpr(wallOf([{ faces: member(0, 1, 0, 1) }]).wall, wallOf([{ faces: member(0, 1, 0, 1) }]).geometry)]);
    expect(t.walls).toBe(2);
    expect(t.aCon).toBeCloseTo(a.aCon + 1, 6);
    expect(t.fraction).toBeCloseTo((a.aB + 1) / (a.aCon + 1), 9);
  });
});
