/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { projectFaces, type FaceSet } from './faces.js';
import { RowSpans } from './row-spans.js';

type V = [number, number, number];

/** A box as six quad faces in wall-local coordinates (along, across, up), each corner mapped by `f`. */
function box([u0, u1]: number[], [v0, v1]: number[], [h0, h1]: number[], f: (p: V) => V = (p) => p): FaceSet {
  const c = (i: number): V => f([i & 1 ? u1 : u0, i & 2 ? v1 : v0, i & 4 ? h1 : h0]);
  const quads = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  return {
    points: Float64Array.from(quads.flatMap((q) => q.flatMap((i) => c(i)))),
    loopStart: Int32Array.from({ length: 7 }, (_, k) => 4 * k),
    faceStart: Int32Array.from({ length: 7 }, (_, k) => k),
  };
}

function projected(faces: FaceSet): number {
  const spans = new RowSpans(-1, 4, 0.001);
  projectFaces(spans, faces);
  return spans.area();
}

describe('projectFaces', () => {
  it('projects a stud to its face in the wall plane', () => {
    expect(projected(box([0, 0.038], [0, 0.14], [0, 2.6]))).toBeCloseTo(0.038 * 2.6, 6);
  });

  it('still counts a member across the frame (through the wall), by its end faces', () => {
    // 60 x 120 mm section, 0.3 m long through the thickness.
    expect(projected(box([1, 1.06], [0, 0.3], [1.2, 1.32]))).toBeCloseTo(0.06 * 0.12, 6);
  });

  it('projects a diagonal brace in the wall plane to its full area', () => {
    const a = Math.PI / 6;
    const rot = ([u, v, h]: V): V => [u * Math.cos(a) - h * Math.sin(a), v, u * Math.sin(a) + h * Math.cos(a)];
    expect(projected(box([0, 0.045], [0, 0.07], [0, 2], rot))).toBeCloseTo(0.045 * 2, 4);
  });

  it('keeps the long faces of a member leaning out of the wall plane', () => {
    // Stud 38 x 140 x 2600 mm tilted 10 degrees about the along axis: the
    // projected height is L cos t + d sin t, and the side faces are not edge-on.
    const t = (10 * Math.PI) / 180;
    const tilt = ([u, v, h]: V): V => [u, v * Math.cos(t) - h * Math.sin(t), v * Math.sin(t) + h * Math.cos(t)];
    expect(projected(box([0, 0.038], [0, 0.14], [0, 2.6], tilt))).toBeCloseTo(0.038 * (2.6 * Math.cos(t) + 0.14 * Math.sin(t)), 4);
  });
});
