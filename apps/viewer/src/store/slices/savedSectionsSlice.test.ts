/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import type { SavedSection } from '@/lib/sections/saved-section';
import { createSavedSectionsSlice, type SavedSectionsSlice } from './savedSectionsSlice.js';

const section = (name: string): SavedSection => ({
  id: name, name, origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, depth: 0, shown: true, exported: true,
});

function store() {
  const s = create<SavedSectionsSlice>()(createSavedSectionsSlice);
  s.getState().replaceSavedSections(['A', 'B', 'C', 'D'].map(section), 'm');
  return s;
}

const names = (s: ReturnType<typeof store>) => s.getState().savedSections.map((x) => x.name).join('');

describe('moveSavedSectionTo', () => {
  it('moves a section up or down to the drop index', () => {
    const s = store();
    s.getState().moveSavedSectionTo('D', 0);
    assert.equal(names(s), 'DABC');
    s.getState().moveSavedSectionTo('D', 3);
    assert.equal(names(s), 'ABCD');
    s.getState().moveSavedSectionTo('A', 2);
    assert.equal(names(s), 'BCAD');
  });

  it('clamps the index and ignores unknown ids', () => {
    const s = store();
    s.getState().moveSavedSectionTo('A', 99);
    assert.equal(names(s), 'BCDA');
    s.getState().moveSavedSectionTo('X', 0);
    assert.equal(names(s), 'BCDA');
  });
});

describe('activeSavedSectionId', () => {
  it('is cleared when the active section is removed or the list is replaced', () => {
    const s = store();
    s.getState().setActiveSavedSection('B');
    s.getState().removeSavedSection('C');
    assert.equal(s.getState().activeSavedSectionId, 'B');
    s.getState().removeSavedSection('B');
    assert.equal(s.getState().activeSavedSectionId, null);
    s.getState().setActiveSavedSection('A');
    s.getState().replaceSavedSections([], 'other');
    assert.equal(s.getState().activeSavedSectionId, null);
  });
});
