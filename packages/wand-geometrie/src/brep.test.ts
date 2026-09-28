/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { authoredFaces, type EntityReader } from './brep.js';

/** A product placed at (1000, 2000, 0) mm, turned 90° about Z, whose body is a
 *  one-face B-rep behind a mapped item that shifts it by 10 mm along x. */
function reader(): { r: EntityReader; id: number } {
  const ents = new Map<number, { type: string; attributes: unknown[] }>();
  let next = 1;
  const add = (type: string, ...attributes: unknown[]): number => { ents.set(next, { type, attributes }); return next++; };
  const pt = (x: number, y: number, z: number) => add('IFCCARTESIANPOINT', [x, y, z]);
  const dir = (x: number, y: number, z: number) => add('IFCDIRECTION', [x, y, z]);
  const loop = add('IFCPOLYLOOP', [pt(0, 0, 0), pt(100, 0, 0), pt(100, 0, 50), pt(0, 0, 50)]);
  const face = add('IFCFACE', [add('IFCFACEOUTERBOUND', loop, '.T.')]);
  const brep = add('IFCFACETEDBREP', add('IFCCLOSEDSHELL', [face]));
  const map = add('IFCREPRESENTATIONMAP', add('IFCAXIS2PLACEMENT3D', pt(0, 0, 0), null, null), add('IFCSHAPEREPRESENTATION', null, 'Body', 'Brep', [brep]));
  const item = add('IFCMAPPEDITEM', map, add('IFCCARTESIANTRANSFORMATIONOPERATOR3D', null, null, pt(10, 0, 0), null, null));
  const shape = add('IFCPRODUCTDEFINITIONSHAPE', null, null, [add('IFCSHAPEREPRESENTATION', null, 'Body', 'MappedRepresentation', [item])]);
  const place = add('IFCLOCALPLACEMENT', null, add('IFCAXIS2PLACEMENT3D', pt(1000, 2000, 0), dir(0, 0, 1), dir(0, 1, 0)));
  const id = add('IFCPLATE', 'gid', null, 'P', null, null, place, shape);
  return { r: { getEntity: (k) => ents.get(k) ?? null }, id };
}

describe('authoredFaces', () => {
  it('places mapped faceted B-rep faces in world coordinates, Y-up metres', () => {
    const { r, id } = reader();
    const f = authoredFaces(r, id, 0.001);
    expect(f).not.toBeNull();
    const pts = Array.from(f!.points, (x) => +x.toFixed(9));
    // (0,0,0) -> +10 x -> turned: (0,10,0) -> placed: (1000,2010,0) mm -> Y-up m (x, z, -y).
    expect(pts.slice(0, 3)).toEqual([1, 0, -2.01]);
    expect(pts.slice(3, 6)).toEqual([1, 0, -2.11]);
    expect(pts.slice(6, 9)).toEqual([1, 0.05, -2.11]);
    expect([...f!.loopStart, ...f!.faceStart]).toEqual([0, 4, 0, 1]);
  });

  it('returns null for a body it cannot read', () => {
    const { r, id } = reader();
    const plate = r.getEntity(id)!;
    const shape = r.getEntity(plate.attributes[6] as number)!;
    const rep = r.getEntity((shape.attributes[2] as number[])[0])!;
    const broken: EntityReader = { getEntity: (id) => (id === (rep.attributes[3] as number[])[0] ? { type: 'IFCEXTRUDEDAREASOLID', attributes: [] } : r.getEntity(id)) };
    expect(authoredFaces(broken, id, 0.001)).toBeNull();
  });
});
