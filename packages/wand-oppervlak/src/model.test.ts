/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { RelationshipType } from '@ifc-lite/data';
import { collectWalls, type WallAreaStore } from './model.js';

/**
 * Wall 1 (hsbCAD style) aggregates a plate (zone 2), a beam (zone 0), a
 * window and a sub-assembly holding one more plate; opening 20 voids it.
 * Wall 2 (Revit style) carries Qto quantities and aggregates wall 3.
 */
function fakeStore(): WallAreaStore {
  const types: Record<number, string> = { 1: 'IfcWall', 2: 'IfcWall', 3: 'IfcWallStandardCase', 10: 'IfcPlate', 11: 'IfcBeam', 12: 'IfcWindow', 13: 'IfcElementAssembly', 14: 'IfcPlate', 20: 'IfcOpeningElement' };
  const children: Record<number, number[]> = { 1: [10, 11, 12, 13], 13: [14], 2: [3] };
  const zone: Record<number, string | number> = { 10: '2', 11: 0, 14: -2 };
  return {
    entities: { getName: (id) => `W${id}`, getGlobalId: (id) => `g${id}`, getTypeName: (id) => types[id] ?? '' },
    entityIndex: { byType: { get: (k) => ({ IFCWALL: [1, 2], IFCWALLSTANDARDCASE: [3] } as Record<string, number[]>)[k] } },
    relationships: {
      getRelated: (id, rel, dir) => {
        if (rel === RelationshipType.Aggregates && dir === 'forward') return children[id] ?? [];
        if (rel === RelationshipType.Aggregates && dir === 'inverse') return Object.keys(children).map(Number).filter((k) => children[k].includes(id));
        if (rel === RelationshipType.VoidsElement && dir === 'forward' && id === 1) return [20];
        return [];
      },
    },
    getProperties: (id) => [
      // The beam also carries a second, Revit-style "Data" set with an empty Zone, listed first.
      ...(id === 11 ? [{ name: 'Data', properties: [{ name: 'Zone', value: '' }] }] : []),
      ...(zone[id] === undefined ? [] : [{ name: 'Data', properties: [{ name: 'Zone', value: zone[id] }] }]),
      ...(id === 1 ? [{ name: 'Dimensions', properties: [{ name: 'Length', value: 6730 }, { name: 'Base Height', value: 3195 }] }] : []),
    ],
    getQuantities: (id) => (id === 2 ? [
      { name: 'BaseQuantities', quantities: [{ name: 'GrossSideArea', value: 1 }, { name: 'NetSideArea', value: 0.5 }] },
      { name: 'Qto_WallBaseQuantities', quantities: [{ name: 'GrossSideArea', value: 12 }, { name: 'NetSideArea', value: 10 }] },
    ] : []),
    lengthUnitScale: 0.001,
  };
}

describe('collectWalls', () => {
  it('collects nested parts, skips windows, reads zones (past an empty duplicate pset), openings and declared quantities', () => {
    const [w1, w2, w3] = collectWalls(fakeStore());
    expect(w1.partIds.sort((a, b) => a - b)).toEqual([1, 10, 11, 13, 14]);
    expect([...w1.zones]).toEqual([[10, '2'], [11, '0'], [14, '-2']]);
    expect(w1.openingIds).toEqual([20]);
    expect(w1.declared.dimensionsLength).toBeCloseTo(6.73, 9);
    expect(w1.declared.dimensionsHeight).toBeCloseTo(3.195, 9);
    expect(w2.declared).toMatchObject({ grossSideArea: 12, netSideArea: 10, quantitySet: 'Qto_WallBaseQuantities' });
    expect([w2.parentWallId, w3.parentWallId]).toEqual([null, 2]);
    expect(w2.partIds).toContain(3);
  });
});
