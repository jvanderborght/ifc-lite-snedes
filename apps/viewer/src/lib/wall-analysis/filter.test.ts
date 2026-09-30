/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, NO_FILTER, toggleKind } from './filter.js';
import type { WallKind } from './kind.js';

const present: WallKind[] = ['exterior', 'interior', 'party'];

describe('toggleKind', () => {
  it('shows only the clicked kind when all were shown', () => {
    assert.deepEqual([...toggleKind(null, 'exterior', present)!], ['exterior']);
  });

  it('adds and removes kinds, and falls back to all when empty or complete', () => {
    const one = toggleKind(null, 'exterior', present);
    const two = toggleKind(one, 'party', present);
    assert.deepEqual([...two!].sort(), ['exterior', 'party']);
    assert.equal(toggleKind(two, 'interior', present), null);
    assert.equal(toggleKind(one, 'exterior', present), null);
  });
});

describe('matchesFilter', () => {
  const wand = { kind: 'exterior' as const, name: 'D_00E12' };

  it('passes everything without a filter', () => {
    assert.equal(matchesFilter(NO_FILTER, wand), true);
  });

  it('filters on kind and on a case-insensitive name part', () => {
    assert.equal(matchesFilter({ kinds: new Set(['interior']), query: '' }, wand), false);
    assert.equal(matchesFilter({ kinds: new Set(['exterior']), query: ' d_00 ' }, wand), true);
    assert.equal(matchesFilter({ kinds: null, query: 'E13' }, wand), false);
  });
});
