/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { knipDubbeleLijnen } from './dubbel.js';
import type { Lijn, LijnSoort } from './genereer.js';

const lijn = (soort: LijnSoort, entityId: number, ax: number, ay: number, bx: number, by: number): Lijn =>
  ({ soort, ifcType: 'IfcWall', entityId, a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('knipDubbeleLijnen', () => {
  it('clips the part of a visible line under a cut line', () => {
    const { lijnen, weggeknipt } = knipDubbeleLijnen([
      lijn('zicht', 2, 0, 0, 3000, 0),
      lijn('snede', 1, 1000, 0, 2000, 0),
    ]);
    const zicht = lijnen.filter((l) => l.soort === 'zicht').map((l) => [l.a.x, l.b.x]);
    expect(zicht).toEqual([[0, 1000], [2000, 3000]]);
    expect(weggeknipt.zicht).toBeCloseTo(1000);
  });

  it('keeps one of two coinciding visible lines and drops hidden lines under them', () => {
    const { lijnen } = knipDubbeleLijnen([
      lijn('zicht', 1, 0, 0, 0, 1000),
      lijn('zicht', 2, 0, 1000, 0, 0),
      lijn('verborgen', 3, 0, 200, 0, 800),
    ]);
    expect(lijnen.map((l) => l.entityId)).toEqual([1]);
  });

  it('keeps parallel lines 1 mm apart and every cut line', () => {
    const { lijnen } = knipDubbeleLijnen([
      lijn('snede', 1, 0, 0, 1000, 0),
      lijn('snede', 2, 0, 0, 1000, 0),
      lijn('zicht', 3, 0, 1, 1000, 1),
    ]);
    expect(lijnen).toHaveLength(3);
  });
});
