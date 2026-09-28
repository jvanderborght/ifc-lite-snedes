/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { RelationshipType } from '@ifc-lite/data';
import { collectWalls, type WallStore } from './model.js';
import { authoredVolume, type EntityReader } from './brep-volume.js';

/** Two walls: W2 has beams in zone 0 and 2 and one opening, W1 one zone-0 beam; beam 13 has no parent. */
function fakeStore(): WallStore {
  const types: Record<number, string> = { 1: 'IfcWall', 2: 'IfcWall', 10: 'IfcBeam', 11: 'IfcBeam', 12: 'IfcBeam', 13: 'IfcBeam', 20: 'IfcOpeningElement' };
  const zone: Record<number, string | number> = { 10: '0', 11: 0, 12: '2', 13: '0' };
  const parent: Record<number, number> = { 10: 2, 11: 1, 12: 2 };
  return {
    entities: {
      getName: (id) => `W${id}`,
      getGlobalId: (id) => `gid-${id}`,
      getTypeName: (id) => types[id] ?? '',
    },
    entityIndex: { byType: { get: (key) => (key === 'IFCBEAM' ? [10, 11, 12, 13] : undefined) } },
    relationships: {
      getRelated: (id, rel, dir) => {
        if (rel === RelationshipType.Aggregates && dir === 'inverse') return parent[id] !== undefined ? [parent[id]] : [];
        if (rel === RelationshipType.Aggregates && dir === 'forward') return Object.keys(parent).map(Number).filter((k) => parent[k] === id);
        if (rel === RelationshipType.VoidsElement && dir === 'forward' && id === 2) return [20];
        return [];
      },
    },
    getProperties: (id) => (zone[id] === undefined ? [] : [{ name: 'Data', properties: [{ name: 'Zone', value: zone[id] }] }]),
  };
}

describe('collectWalls', () => {
  it('groups zone-0 beams by their aggregating wall and keeps orphans apart', () => {
    const walls = collectWalls(fakeStore());
    expect(walls.map((w) => [w.name, w.memberIds, w.openingIds])).toEqual([
      ['(no parent)', [13], []],
      ['W1', [11], []],
      ['W2', [10], [20]],
    ]);
  });
});

describe('authoredVolume', () => {
  // Unit cube (model units) as a faceted B-rep behind a mapped item scaled by 2.
  function cubeReader(): EntityReader {
    const ents = new Map<number, { type: string; attributes: unknown[] }>();
    let next = 1000;
    const add = (type: string, attributes: unknown[]): number => { const id = next++; ents.set(id, { type, attributes }); return id; };
    const pt = (x: number, y: number, z: number): number => add('IFCCARTESIANPOINT', [[x, y, z]]);
    const P = [pt(0, 0, 0), pt(1, 0, 0), pt(1, 1, 0), pt(0, 1, 0), pt(0, 0, 1), pt(1, 0, 1), pt(1, 1, 1), pt(0, 1, 1)];
    // Outward-facing loops.
    const loops = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
    const faces = loops.map((l, i) => {
      const loop = add('IFCPOLYLOOP', [(i === 1 ? [...l].reverse() : l).map((k) => P[k])]);
      // Face 1 is authored reversed with Orientation .F., which must cancel out.
      return add('IFCFACE', [[add('IFCFACEOUTERBOUND', [loop, i === 1 ? '.F.' : '.T.'])]]);
    });
    const brep = add('IFCFACETEDBREP', [add('IFCCLOSEDSHELL', [faces])]);
    const mappedRep = add('IFCSHAPEREPRESENTATION', [null, 'Body', 'Brep', [brep]]);
    const map = add('IFCREPRESENTATIONMAP', [null, mappedRep]);
    const op = add('IFCCARTESIANTRANSFORMATIONOPERATOR3D', [null, null, null, 2, null]);
    const body = add('IFCSHAPEREPRESENTATION', [null, 'Body', 'MappedRepresentation', [add('IFCMAPPEDITEM', [map, op])]]);
    const shape = add('IFCPRODUCTDEFINITIONSHAPE', [null, null, [body]]);
    ents.set(1, { type: 'IFCBEAM', attributes: ['g', null, 'S', '', null, null, shape, null] });
    return { getEntity: (id) => ents.get(id) ?? null };
  }

  it('reads a mapped faceted B-rep exactly, with orientation and scale', () => {
    expect(authoredVolume(cubeReader(), 1, 0.001)).toBeCloseTo(8e-9, 18);
  });

  it('returns null for a body it cannot read', () => {
    const reader: EntityReader = { getEntity: (id) => (id === 1 ? { type: 'IFCBEAM', attributes: [] } : null) };
    expect(authoredVolume(reader, 1, 1)).toBeNull();
  });
});
