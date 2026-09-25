/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planeBoxPolygon, sectionLines3D } from './section-lines3d.js';
import type { SavedSection } from './saved-section.js';

const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 8 } };

describe('planeBoxPolygon', () => {
  it('cuts a horizontal rectangle out of the box', () => {
    const poly = planeBoxPolygon({ x: 5, y: 1, z: 4 }, { x: 0, y: 1, z: 0 }, box);
    assert.equal(poly.length, 4);
    for (const q of poly) assert.equal(q.y, 1);
    const xs = poly.map((q) => q.x).sort((a, b) => a - b);
    assert.deepEqual(xs, [0, 0, 10, 10]);
  });

  it('orders the corners around the outline (no crossing diagonals)', () => {
    const poly = planeBoxPolygon({ x: 5, y: 1, z: 4 }, { x: 0, y: 1, z: 0 }, box);
    // Consecutive corners share an x or a z: they are box edges, not diagonals.
    poly.forEach((q, i) => {
      const r = poly[(i + 1) % poly.length];
      assert.ok(q.x === r.x || q.z === r.z);
    });
  });

  it('misses a plane outside the box', () => {
    assert.deepEqual(planeBoxPolygon({ x: 50, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, box), []);
  });
});

describe('sectionLines3D', () => {
  const section = (over: Partial<SavedSection>): SavedSection => ({
    id: 'a', name: 'A', origin: { x: 5000, y: -4000, z: 1000 }, direction: { x: 0, y: 0, z: -1 },
    depth: 0, shown: true, exported: true, ...over,
  });

  it('draws outline and arrow for a shown plan at its height (IFC z -> render y)', () => {
    const v = sectionLines3D([section({})], undefined, box);
    // 4 outline segments + 3 arrow segments, 6 numbers each.
    assert.equal(v.length, 7 * 6);
    assert.equal(v[1], 1);
    // The arrow points down (render -y), the view direction of a plan.
    const tipY = v[4 * 6 + 4];
    assert.ok(tipY < 1);
  });

  it('skips hidden sections and missing bounds', () => {
    assert.deepEqual(sectionLines3D([section({ shown: false })], undefined, box), []);
    assert.deepEqual(sectionLines3D([section({})], undefined, undefined), []);
  });
});
