/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CoordinateInfo } from '@ifc-lite/geometry';
import { vlakUitHalfruimte } from '@ifc-lite/snede-export';
import { resolveKeptHalfSpace } from '@/lib/export/view-pdf/view-section-plane';
import { customPlaneFor, followCut, positionRange, sectionPosition, withSectionPosition } from './section-edit.js';

const info = {
  wasmRtcOffset: { x: 100, y: 200, z: 5 },
  originShift: { x: 1, y: 2, z: 3 },
} as unknown as CoordinateInfo;

const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

describe('sectionPosition', () => {
  it('is the X coordinate of a section across X, whichever way it looks', () => {
    for (const dx of [1, -1]) {
      const s = { origin: { x: 2500, y: 10, z: 7 }, direction: { x: dx, y: 0, z: 0 } };
      assert.equal(sectionPosition(s), 2500);
      const moved = withSectionPosition(s, 4000);
      assert.deepEqual(moved.origin, { x: 4000, y: 10, z: 7 });
      assert.deepEqual(moved.direction, s.direction);
    }
  });

  it('is the level of a plan', () => {
    assert.equal(sectionPosition({ origin: { x: 5, y: 5, z: 1000 }, direction: { x: 0, y: 0, z: -1 } }), 1000);
  });
});

describe('positionRange', () => {
  it('spans the model box along the normal, in world mm', () => {
    // Renderer box 0..10 m along x maps to world x = rtc + shift + 0..10 m.
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 8 } };
    const r = positionRange({ direction: { x: -1, y: 0, z: 0 } }, info, box)!;
    near(r.min, 101_000);
    near(r.max, 111_000);
    assert.equal(positionRange({ direction: { x: 1, y: 0, z: 0 } }, info, undefined), null);
  });
});

describe('customPlaneFor', () => {
  it('round-trips through the cut the viewer keeps (same plane, same view direction)', () => {
    for (const direction of [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0.6, y: -0.8, z: 0 }]) {
      const saved = { origin: { x: 104_000, y: 199_000, z: 1234 }, direction };
      const custom = customPlaneFor(saved, info);
      const kept = resolveKeptHalfSpace({
        plane: { axis: 'down', position: 50, flipped: false, custom },
        sceneBounds: { min: { x: -1e3, y: -1e3, z: -1e3 }, max: { x: 1e3, y: 1e3, z: 1e3 } },
      });
      const back = vlakUitHalfruimte(kept, info, '');
      near(back.normaal.x, direction.x); near(back.normaal.y, direction.y); near(back.normaal.z, direction.z);
      near(sectionPosition({ origin: back.oorsprong, direction }), sectionPosition(saved), 1e-6);
    }
  });
});

describe('followCut', () => {
  const saved = { name: 'A', origin: { x: 1000, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } };

  it('shifts onto a parallel cut and keeps its own direction', () => {
    const moved = followCut(saved, { origin: { x: 1750, y: 300, z: 20 }, direction: { x: -1, y: 0, z: 0 } })!;
    assert.deepEqual(moved.origin, { x: 1750, y: 0, z: 0 });
    assert.deepEqual(moved.direction, saved.direction);
    assert.equal(moved.name, 'A');
  });

  it('refuses a cut that is not parallel', () => {
    assert.equal(followCut(saved, { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } }), null);
  });
});
