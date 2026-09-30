/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import type { Lijn } from './genereer.js';
import { maakPolylijnen } from './polylijnen.js';

const lijn = (ax: number, ay: number, bx: number, by: number): Lijn =>
  ({ soort: 'snede', ifcType: 'IFCBEAM', entityId: 1, a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('maakPolylijnen', () => {
  it('closes an outline whose edge has a run of pieces shorter than the weld tolerance', () => {
    // Seen on a timber beam: 100.41 is within 0.1 mm of both 100.374 and 100.5,
    // which are 0.126 mm apart. In this order a non-transitive weld dropped
    // the only link between them and left the outline open.
    const lijnen = [
      lijn(200, 45, 100.5, 45),
      lijn(100.41, 45, 100.5, 45),
      lijn(100.374, 45, 100.41, 45),
      lijn(0, 45, 100.374, 45),
      lijn(0, 0, 0, 45),
      lijn(200, 0, 0, 0),
      lijn(200, 45, 200, 0),
    ];
    const [p, ...rest] = maakPolylijnen(lijnen);
    expect(rest).toHaveLength(0);
    expect(p.gesloten).toBe(true);
    expect(p.punten).toHaveLength(4);
  });

  it('keeps points further apart than the weld tolerance separate', () => {
    const [p] = maakPolylijnen([lijn(0, 0, 0.2, 0), lijn(0.2, 0, 0.4, 0)]);
    expect(p.gesloten).toBe(false);
    expect(p.punten.map((q) => q.x)).toEqual([0, 0.4]);
  });
});
