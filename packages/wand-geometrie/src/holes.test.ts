/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { findHoles } from './holes.js';
import { RowSpans } from './row-spans.js';

/** Region from a character grid, 1 m cells, top row first: '#' is material. */
function grid(rows: string[]): RowSpans {
  const s = new RowSpans(0, rows.length, 1);
  rows.forEach((line, i) => {
    const j = rows.length - 1 - i;
    [...line].forEach((c, u) => { if (c === '#') s.add(j, u, u + 1); });
  });
  return s;
}

describe('findHoles', () => {
  it('finds an enclosed hole and ignores a notch open to the outside', () => {
    expect(findHoles(grid(['#####', '#.#.#', '#####'])).areas).toEqual([1, 1]);
    expect(findHoles(grid(['#####', '#...#', '#.#.#'])).count).toBe(0); // U open at the bottom
    expect(findHoles(grid(['#####', '#..##', '##..#', '#####'])).areas).toEqual([4]); // one staggered hole
  });

  it('does not join gaps that only touch at a corner, and treats an empty row as outside', () => {
    expect(findHoles(grid(['###', '#.#', '##.'])).count).toBe(1); // touches the outside at a corner only
    expect(findHoles(grid(['#.#', '...', '###'])).count).toBe(0);
  });

  it('ignores hairline seams narrower than 0.1 mm', () => {
    const s = new RowSpans(0, 0.003, 0.001);
    for (let j = 0; j < 3; j++) { s.add(j, 0, 1); s.add(j, 1.00005, 2); }
    expect(findHoles(s).count).toBe(0);
  });
});
