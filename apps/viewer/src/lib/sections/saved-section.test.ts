/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  flipSection, isPlanSection, nextSectionName, parseSections, serializeSections, type SavedSection,
} from './saved-section.js';

const section = (over: Partial<SavedSection> = {}): SavedSection => ({
  id: 'a', name: 'A', origin: { x: 1000, y: 2000, z: 0 }, direction: { x: 0, y: 1, z: 0 },
  depth: 3000, shown: true, exported: true, ...over,
});

describe('nextSectionName', () => {
  it('counts A, B, C and skips names in use', () => {
    assert.equal(nextSectionName([]), 'A');
    assert.equal(nextSectionName(['A', 'B']), 'C');
    assert.equal(nextSectionName(['a', 'C']), 'B');
  });

  it('continues past Z like spreadsheet columns', () => {
    const az = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    assert.equal(nextSectionName(az), 'AA');
    assert.equal(nextSectionName([...az, 'AA']), 'AB');
  });
});

describe('flipSection / isPlanSection', () => {
  it('reverses the view direction only', () => {
    const f = flipSection(section());
    assert.deepEqual(f.direction, { x: -0, y: -1, z: -0 });
    assert.deepEqual(f.origin, section().origin);
  });

  it('recognises a horizontal plane as a plan', () => {
    assert.equal(isPlanSection({ direction: { x: 0, y: 0, z: -2 } }), true);
    assert.equal(isPlanSection({ direction: { x: 0, y: 1, z: 0 } }), false);
  });
});

describe('sections file', () => {
  it('round-trips a list without ids', () => {
    const text = serializeSections([section(), section({ id: 'b', name: 'P', direction: { x: 0, y: 0, z: -1 }, depth: 0 })]);
    const back = parseSections(text);
    assert.equal(back.ok, true);
    if (!back.ok) return;
    assert.equal(back.sections.length, 2);
    assert.equal(back.sections[1].name, 'P');
    assert.equal('id' in back.sections[0], false);
  });

  it('rejects other JSON, newer versions and incomplete sections with a reason', () => {
    assert.deepEqual(parseSections('{"a":1}'), { ok: false, error: 'Not an ifc-lite sections file.' });
    const newer = parseSections(JSON.stringify({ format: 'ifc-lite-sections', version: 99, sections: [] }));
    assert.equal(newer.ok, false);
    const broken = parseSections(JSON.stringify({
      format: 'ifc-lite-sections', version: 1, sections: [{ name: 'A', origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } }],
    }));
    assert.deepEqual(broken, { ok: false, error: 'Section 1 is incomplete.' });
    assert.equal(parseSections('not json').ok, false);
  });
});
