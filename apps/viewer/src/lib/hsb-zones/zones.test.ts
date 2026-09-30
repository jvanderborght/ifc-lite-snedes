/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupByZone, zoneOf, zoneState } from './zones.js';

describe('zoneOf', () => {
  it('reads Data.Zone and normalises numbers', () => {
    assert.equal(zoneOf([{ name: 'Other', properties: [{ name: 'Zone', value: 9 }] }, { name: 'Data', properties: [{ name: 'Zone', value: '-3' }] }]), '-3');
    assert.equal(zoneOf([{ name: 'Data', properties: [{ name: 'Zone', value: 0 }] }]), '0');
    assert.equal(zoneOf([{ name: 'Data', properties: [{ name: 'Zone', value: ' 02 ' }] }]), '2');
  });

  it('gives null without a zone', () => {
    assert.equal(zoneOf([]), null);
    assert.equal(zoneOf([{ name: 'Data', properties: [{ name: 'Zone', value: '' }] }]), null);
    assert.equal(zoneOf([{ name: 'Pset_WallCommon', properties: [{ name: 'Zone', value: 1 }] }]), null);
  });
});

describe('groupByZone', () => {
  it('sorts numeric zones, then text, then the elements without a zone', () => {
    const g = groupByZone([
      { id: 1, zone: '2' }, { id: 2, zone: null }, { id: 3, zone: '-5' }, { id: 4, zone: '10' },
      { id: 5, zone: '0' }, { id: 6, zone: '2' }, { id: 7, zone: 'A' },
    ])!;
    assert.deepEqual(g.map((z) => z.zone), ['-5', '0', '2', '10', 'A', null]);
    assert.deepEqual(g.find((z) => z.zone === '2')!.ids, [1, 6]);
  });

  it('gives null when no element has a zone', () => {
    assert.equal(groupByZone([{ id: 1, zone: null }]), null);
    assert.equal(groupByZone([]), null);
  });
});

describe('zoneState', () => {
  it('is shown, hidden or mixed', () => {
    assert.equal(zoneState([1, 2], new Set()), 'shown');
    assert.equal(zoneState([1, 2], new Set([1, 2, 3])), 'hidden');
    assert.equal(zoneState([1, 2], new Set([2])), 'mixed');
  });
});
