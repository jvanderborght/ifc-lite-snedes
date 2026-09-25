/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { CoordinateInfo } from '@ifc-lite/geometry';
import { naarRenderPunt, vanRenderPunt, vlakUitHalfruimte } from './vlak.js';

const info = {
  originShift: { x: 10, y: 2, z: -30 },
  wasmRtcOffset: { x: 1000, y: 2000, z: 5 },
} as unknown as CoordinateInfo;

// Component-wise, so -0 and +0 compare equal.
const gelijk = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): void => {
  expect(a.x).toBeCloseTo(b.x, 12);
  expect(a.y).toBeCloseTo(b.y, 12);
  expect(a.z).toBeCloseTo(b.z, 12);
};

describe('renderer frame <-> IFC world', () => {
  it('round-trips a point', () => {
    const p = { x: 12.5, y: -7.25, z: 3.5 };
    const terug = vanRenderPunt(naarRenderPunt(p, info), info);
    expect(terug.x).toBeCloseTo(p.x, 9);
    expect(terug.y).toBeCloseTo(p.y, 9);
    expect(terug.z).toBeCloseTo(p.z, 9);
  });

  it('turns a kept lower half-space into a plan looking down at its height', () => {
    // Keep render y <= 1 m: a horizontal cut, the viewer looks down into the kept half.
    const vlak = vlakUitHalfruimte({ normal: { x: 0, y: 2, z: 0 }, offset: 2 }, undefined, 'P');
    gelijk(vlak.normaal, { x: 0, y: 0, z: -1 });
    expect(vlak.oorsprong.z).toBeCloseTo(1000);
    expect(vlak.diepte).toBe(0);
  });

  it('puts a vertical cut at its world position, shift included', () => {
    // Keep render x <= 0.5 m, i.e. IFC X <= 0.5 + rtc.x + shift.x.
    const vlak = vlakUitHalfruimte({ normal: { x: 1, y: 0, z: 0 }, offset: 0.5 }, info, 'A', 3000);
    gelijk(vlak.normaal, { x: -1, y: 0, z: 0 });
    expect(vlak.oorsprong.x).toBeCloseTo((0.5 + 1000 + 10) * 1000);
    expect(vlak.diepte).toBe(3000);
  });
});
