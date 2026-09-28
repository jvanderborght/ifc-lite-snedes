/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Registration witness for the Wall analysis panel (NPR timber fraction and
 * wall face area in one table). It replaced the separate "Timber fraction"
 * panel: one sidebar id, appended last so the frozen Alt+N order is untouched.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE_PANELS } from './registry.js';

describe('WORKSPACE_PANELS — wall analysis panel registration', () => {
  it('registers one wide wallAnalysis entry in the right pane, and no separate timber panel', () => {
    const entry = WORKSPACE_PANELS.find((p) => p.id === 'wallAnalysis');
    assert.notEqual(entry, undefined, "WORKSPACE_PANELS is missing the 'wallAnalysis' panel definition");
    assert.equal(entry?.title, 'Wall analysis');
    assert.equal(entry?.region, 'side');
    assert.equal(entry?.prefersWide, true);
    assert.equal(WORKSPACE_PANELS.some((p) => (p.id as string) === 'timberFraction'), false);
  });

  it('is appended last', () => {
    assert.equal(WORKSPACE_PANELS[WORKSPACE_PANELS.length - 1].id, 'wallAnalysis');
  });
});
