/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SECTION_EXPORT_SETTINGS, normalizeSettings } from './storage.js';

describe('normalizeSettings', () => {
  it('fills a missing or broken store with the defaults', () => {
    assert.deepEqual(normalizeSettings(undefined), DEFAULT_SECTION_EXPORT_SETTINGS);
    assert.deepEqual(normalizeSettings('nonsense'), DEFAULT_SECTION_EXPORT_SETTINGS);
  });

  it('keeps valid fields and replaces invalid ones one by one', () => {
    const s = normalizeSettings({ unit: 'm', plans: 'world', gap: -5, textHeight: 250, dash: Number.NaN, hiddenLines: 'yes' });
    assert.equal(s.unit, 'm');
    assert.equal(s.plans, 'world');
    assert.equal(s.gap, DEFAULT_SECTION_EXPORT_SETTINGS.gap);
    assert.equal(s.textHeight, 250);
    assert.equal(s.dash, DEFAULT_SECTION_EXPORT_SETTINGS.dash);
    assert.equal(s.hiddenLines, false);
  });

  it('defaults match the agreed drawing conventions', () => {
    const d = DEFAULT_SECTION_EXPORT_SETTINGS;
    assert.deepEqual([d.unit, d.gap, d.textHeight, d.triangleSize, d.dash, d.dashGap], ['mm', 10_000, 500, 500, 50, 25]);
    assert.equal(d.hiddenInsideCut, false);
  });
});
