/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Exact volume of a member as AUTHORED, straight from its `IfcFacetedBrep`
 * polygons, without triangulation and without the geometry pipeline.
 *
 * Why a second volume next to the mesh volume: the pipeline mirrors a wall's
 * `IfcOpeningElement`s onto every part the wall aggregates (IFC allows an
 * opening on a host whose body lives in its parts). Timber-frame exporters
 * already cut their members themselves, so on those models the extra cut only
 * removes timber that is really there — typically the bottom plate running
 * through under a door. This reader sees the member exactly as exported.
 *
 * Only faceted B-reps (optionally behind one `IfcMappedItem`) are read; any
 * other body returns null, and the caller reports the member as unmeasured.
 * Volume of a closed polyhedron: V = 1/3 * sum over faces of (A_f . p_f),
 * with A_f the signed area vector of the face (outer loop plus inner loops in
 * their authored orientation) and p_f any point in the face plane.
 */

export interface EntityReader {
  getEntity(id: number): { type: string; attributes: readonly unknown[] } | null;
}

const asRefs = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
const asRef = (v: unknown): number | null => (typeof v === 'number' ? v : null);

function shellVolume(reader: EntityReader, shellId: number): number | null {
  const shell = reader.getEntity(shellId);
  if (!shell) return null;
  let total = 0;
  for (const faceId of asRefs(shell.attributes[0])) {
    const face = reader.getEntity(faceId);
    if (!face) return null;
    let ax = 0, ay = 0, az = 0;
    let px = 0, py = 0, pz = 0, havePoint = false;
    for (const boundId of asRefs(face.attributes[0])) {
      const bound = reader.getEntity(boundId);
      const loopId = bound ? asRef(bound.attributes[0]) : null;
      const loop = loopId !== null ? reader.getEntity(loopId) : null;
      if (!bound || !loop || loop.type !== 'IFCPOLYLOOP') return null;
      const sense = String(bound.attributes[1]).toUpperCase() === '.F.' ? -1 : 1;
      const pts: number[][] = [];
      for (const pid of asRefs(loop.attributes[0])) {
        const p = reader.getEntity(pid);
        const c = p && Array.isArray(p.attributes[0]) ? (p.attributes[0] as number[]) : null;
        if (!c) return null;
        pts.push([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
      }
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        sx += a[1] * b[2] - a[2] * b[1];
        sy += a[2] * b[0] - a[0] * b[2];
        sz += a[0] * b[1] - a[1] * b[0];
      }
      ax += (sense * sx) / 2; ay += (sense * sy) / 2; az += (sense * sz) / 2;
      if (!havePoint && pts.length > 0) { [px, py, pz] = pts[0]; havePoint = true; }
    }
    total += (ax * px + ay * py + az * pz) / 3;
  }
  return total;
}

/** Volume factor of an `IfcCartesianTransformationOperator3D(nonUniform)`. */
function operatorScale3(reader: EntityReader, opId: number | null): number {
  const op = opId !== null ? reader.getEntity(opId) : null;
  if (!op) return 1;
  const s = typeof op.attributes[3] === 'number' ? (op.attributes[3] as number) : 1;
  if (op.type === 'IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM') {
    const s2 = typeof op.attributes[5] === 'number' ? (op.attributes[5] as number) : s;
    const s3 = typeof op.attributes[6] === 'number' ? (op.attributes[6] as number) : s;
    return Math.abs(s * s2 * s3);
  }
  return Math.abs(s * s * s);
}

function itemVolume(reader: EntityReader, itemId: number, depth: number): number | null {
  const item = reader.getEntity(itemId);
  if (!item || depth > 4) return null;
  if (item.type === 'IFCFACETEDBREP' || item.type === 'IFCFACETEDBREPWITHVOIDS') {
    const outer = asRef(item.attributes[0]);
    let v = outer !== null ? shellVolume(reader, outer) : null;
    if (v === null) return null;
    v = Math.abs(v);
    for (const voidId of asRefs(item.attributes[1])) {
      const hv = shellVolume(reader, voidId);
      if (hv === null) return null;
      v -= Math.abs(hv);
    }
    return v;
  }
  if (item.type === 'IFCMAPPEDITEM') {
    const map = reader.getEntity(asRef(item.attributes[0]) ?? -1);
    const repId = map ? asRef(map.attributes[1]) : null;
    const rep = repId !== null ? reader.getEntity(repId) : null;
    if (!rep) return null;
    let v = 0;
    for (const sub of asRefs(rep.attributes[3])) {
      const sv = itemVolume(reader, sub, depth + 1);
      if (sv === null) return null;
      v += sv;
    }
    return v * operatorScale3(reader, asRef(item.attributes[1]));
  }
  return null;
}

/**
 * Authored volume of a product's `Body` representation in m³, or null when the
 * body is not built from faceted B-reps. `lengthUnitScale` converts model
 * length units to metres (0.001 for millimetres).
 */
export function authoredVolume(reader: EntityReader, productId: number, lengthUnitScale: number): number | null {
  const product = reader.getEntity(productId);
  const shapeId = product ? asRef(product.attributes[6]) : null;
  const shape = shapeId !== null ? reader.getEntity(shapeId) : null;
  if (!shape) return null;
  let total = 0;
  let found = false;
  for (const repId of asRefs(shape.attributes[2])) {
    const rep = reader.getEntity(repId);
    if (!rep || rep.attributes[1] !== 'Body') continue;
    for (const itemId of asRefs(rep.attributes[3])) {
      const v = itemVolume(reader, itemId, 0);
      if (v === null) return null;
      total += v;
      found = true;
    }
  }
  return found ? total * lengthUnitScale ** 3 : null;
}
