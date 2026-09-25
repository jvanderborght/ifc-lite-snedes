/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Registration witness for the Sections panel (saved section planes, DXF
 * export). Like the cost panel's witness, it asserts on registry data so a
 * revert fails an assertion instead of a module load.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE_PANELS } from './registry.js';

describe('WORKSPACE_PANELS — sections panel registration', () => {
  it('registers a sections entry in the right pane', () => {
    const entry = WORKSPACE_PANELS.find((p) => p.id === 'sections');
    assert.notEqual(entry, undefined, "WORKSPACE_PANELS is missing the 'sections' panel definition");
    assert.equal(entry?.title, 'Sections');
    assert.equal(entry?.region, 'side');
  });

  it('is appended, so the frozen Alt+N mapping of earlier panels is untouched', () => {
    assert.equal(WORKSPACE_PANELS[WORKSPACE_PANELS.length - 1].id, 'sections');
  });
});
