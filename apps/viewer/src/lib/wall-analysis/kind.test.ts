/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isExternalOf, kindFromName, wallKind } from './kind.js';

describe('kindFromName', () => {
  it('reads the letter between the digits of the element number', () => {
    assert.equal(kindFromName('00E12'), 'exterior');
    assert.equal(kindFromName('00B22'), 'interior');
    assert.equal(kindFromName('00I05'), 'interior');
    assert.equal(kindFromName('D_00P03'), 'party');
    assert.equal(kindFromName('C_01B27'), 'interior');
    assert.equal(kindFromName('01F02'), 'floor');
    assert.equal(kindFromName('02r01'), 'roof');
  });

  it('gives null without a known code', () => {
    assert.equal(kindFromName('Basic Wall:Interior 100'), null);
    assert.equal(kindFromName('00X12'), null);
    assert.equal(kindFromName(''), null);
  });
});

describe('wallKind', () => {
  const psets = (value: unknown) => [{ properties: [{ name: 'Reference', value: 'x' }, { name: 'IsExternal', value }] }];

  it('prefers the element number over IsExternal', () => {
    assert.deepEqual(wallKind('D_00E12', false), { kind: 'exterior', source: 'code' });
  });

  it('falls back to IsExternal, then to unknown', () => {
    assert.deepEqual(wallKind('Wall A', isExternalOf(psets(true))), { kind: 'exterior', source: 'isExternal' });
    assert.deepEqual(wallKind('Wall A', isExternalOf(psets('.F.'))), { kind: 'interior', source: 'isExternal' });
    assert.deepEqual(wallKind('Wall A', isExternalOf([])), { kind: 'unknown', source: 'none' });
  });
});
