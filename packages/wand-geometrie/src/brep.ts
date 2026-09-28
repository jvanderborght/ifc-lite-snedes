/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A product's `Body` as AUTHORED, straight from its `IfcFacetedBrep`
 * polygons, placed in world coordinates, without the geometry pipeline.
 *
 * Why: the pipeline mirrors a wall's `IfcOpeningElement`s onto every part the
 * wall aggregates. Timber-frame exporters cut their parts themselves, and
 * their opening elements are often larger than the real hole (installation
 * boxes through all layers, window openings reaching into the bottom plate),
 * so the mirrored cut removes material that is really there. Reading the
 * B-rep sees each part exactly as exported.
 *
 * Supported: faceted B-reps (with voids: outer shell only, since the voids are
 * inside it) directly or behind `IfcMappedItem`s, `IfcLocalPlacement` chains
 * with `IfcAxis2Placement3D`. Anything else returns null; the caller then
 * falls back to the pipeline mesh. Output is Y-up metres like the pipeline,
 * but WITHOUT its origin shift, so never mix the two within one wall.
 */

import type { FaceSet } from './faces.js';

export interface EntityReader {
  getEntity(id: number): { type: string; attributes: readonly unknown[] } | null;
}

type V3 = [number, number, number];
/** Affine 3x4, column-major axes: [xAxis, yAxis, zAxis, origin]. */
type M = [V3, V3, V3, V3];

const IDENTITY: M = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]];
const asRefs = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
const asRef = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3, s: number): V3 => [a[0] - s * b[0], a[1] - s * b[1], a[2] - s * b[2]];

function apply(m: M, p: V3): V3 {
  return [
    m[0][0] * p[0] + m[1][0] * p[1] + m[2][0] * p[2] + m[3][0],
    m[0][1] * p[0] + m[1][1] * p[1] + m[2][1] * p[2] + m[3][1],
    m[0][2] * p[0] + m[1][2] * p[1] + m[2][2] * p[2] + m[3][2],
  ];
}

/** a ∘ b (b applied first). */
function compose(a: M, b: M): M {
  const dir = (v: V3): V3 => [a[0][0] * v[0] + a[1][0] * v[1] + a[2][0] * v[2], a[0][1] * v[0] + a[1][1] * v[1] + a[2][1] * v[2], a[0][2] * v[0] + a[1][2] * v[1] + a[2][2] * v[2]];
  return [dir(b[0]), dir(b[1]), dir(b[2]), apply(a, b[3])];
}

function vec(reader: EntityReader, id: unknown): V3 | null {
  const e = asRef(id) !== null ? reader.getEntity(id as number) : null;
  const c = e && Array.isArray(e.attributes[0]) ? (e.attributes[0] as number[]) : null;
  return c ? [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0] : null;
}

/** Orthonormal frame from a z direction and an x hint (IFC BaseAxis rules, simplified). */
function axes(zHint: V3 | null, xHint: V3 | null): [V3, V3, V3] {
  const z = norm(zHint ?? [0, 0, 1]);
  let x = xHint ? sub(xHint, z, dot(xHint, z)) : null;
  if (!x || Math.hypot(...x) < 1e-12) x = Math.abs(z[0]) < 0.9 ? sub([1, 0, 0], z, z[0]) : sub([0, 1, 0], z, z[1]);
  x = norm(x);
  return [x, cross(z, x), z];
}

function axis2Placement(reader: EntityReader, id: unknown): M | null {
  const e = asRef(id) !== null ? reader.getEntity(id as number) : null;
  if (!e || e.type !== 'IFCAXIS2PLACEMENT3D') return null;
  const o = vec(reader, e.attributes[0]);
  if (!o) return null;
  const [x, y, z] = axes(vec(reader, e.attributes[1]), vec(reader, e.attributes[2]));
  return [x, y, z, o];
}

function placement(reader: EntityReader, id: unknown, depth = 0): M | null {
  if (id === null || id === undefined) return IDENTITY;
  const e = asRef(id) !== null ? reader.getEntity(id as number) : null;
  if (!e || e.type !== 'IFCLOCALPLACEMENT' || depth > 32) return null;
  const parent = placement(reader, e.attributes[0], depth + 1);
  const own = axis2Placement(reader, e.attributes[1]);
  return parent && own ? compose(parent, own) : null;
}

function operator(reader: EntityReader, id: unknown): M | null {
  const e = asRef(id) !== null ? reader.getEntity(id as number) : null;
  if (!e || !e.type.startsWith('IFCCARTESIANTRANSFORMATIONOPERATOR3D')) return null;
  const a = e.attributes;
  const o = vec(reader, a[2]);
  if (!o) return null;
  const [x, y, z] = axes(vec(reader, a[4]), vec(reader, a[0]));
  const s = typeof a[3] === 'number' ? a[3] : 1;
  const nonUniform = e.type === 'IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM';
  const s2 = nonUniform && typeof a[5] === 'number' ? a[5] : s;
  const s3 = nonUniform && typeof a[6] === 'number' ? a[6] : s;
  const sc = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
  return [sc(x, s), sc(y, s2), sc(z, s3), o];
}

interface Sink { points: number[]; loopStart: number[]; faceStart: number[] }

function addShell(reader: EntityReader, shellId: unknown, m: M, sink: Sink): boolean {
  const shell = asRef(shellId) !== null ? reader.getEntity(shellId as number) : null;
  if (!shell) return false;
  for (const faceId of asRefs(shell.attributes[0])) {
    const face = reader.getEntity(faceId);
    if (!face) return false;
    sink.faceStart.push(sink.loopStart.length);
    for (const boundId of asRefs(face.attributes[0])) {
      const bound = reader.getEntity(boundId);
      const loop = bound ? reader.getEntity(asRef(bound.attributes[0]) ?? -1) : null;
      if (!loop || loop.type !== 'IFCPOLYLOOP') return false;
      sink.loopStart.push(sink.points.length / 3);
      for (const pid of asRefs(loop.attributes[0])) {
        const p = vec(reader, pid);
        if (!p) return false;
        const w = apply(m, p);
        sink.points.push(w[0], w[1], w[2]);
      }
    }
  }
  return true;
}

function addItem(reader: EntityReader, itemId: number, m: M, sink: Sink, depth: number): boolean {
  const item = reader.getEntity(itemId);
  if (!item || depth > 4) return false;
  if (item.type === 'IFCFACETEDBREP' || item.type === 'IFCFACETEDBREPWITHVOIDS') return addShell(reader, item.attributes[0], m, sink);
  if (item.type !== 'IFCMAPPEDITEM') return false;
  const map = reader.getEntity(asRef(item.attributes[0]) ?? -1);
  const origin = map ? axis2Placement(reader, map.attributes[0]) : null;
  const target = operator(reader, item.attributes[1]);
  const rep = map ? reader.getEntity(asRef(map.attributes[1]) ?? -1) : null;
  if (!origin || !target || !rep) return false;
  const mm = compose(m, compose(target, origin));
  return asRefs(rep.attributes[3]).every((sub) => addItem(reader, sub, mm, sink, depth + 1));
}

/**
 * Authored `Body` faces of a product in world coordinates (Y-up, metres), or
 * null when the body is missing or not built from faceted B-reps.
 * `lengthUnitScale` converts model length units to metres.
 */
export function authoredFaces(reader: EntityReader, productId: number, lengthUnitScale: number): FaceSet | null {
  const product = reader.getEntity(productId);
  if (!product) return null;
  const place = placement(reader, product.attributes[5]);
  const shape = reader.getEntity(asRef(product.attributes[6]) ?? -1);
  if (!place || !shape) return null;
  const sink: Sink = { points: [], loopStart: [], faceStart: [] };
  let found = false;
  for (const repId of asRefs(shape.attributes[2])) {
    const rep = reader.getEntity(repId);
    if (!rep || rep.attributes[1] !== 'Body') continue;
    for (const itemId of asRefs(rep.attributes[3])) {
      if (!addItem(reader, itemId, place, sink, 0)) return null;
      found = true;
    }
  }
  if (!found) return null;
  // IFC Z-up model units -> Y-up metres (x, z, -y), as the geometry pipeline.
  const pts = new Float64Array(sink.points.length);
  for (let i = 0; i + 2 < pts.length; i += 3) {
    pts[i] = sink.points[i] * lengthUnitScale;
    pts[i + 1] = sink.points[i + 2] * lengthUnitScale;
    pts[i + 2] = -sink.points[i + 1] * lengthUnitScale;
  }
  sink.loopStart.push(sink.points.length / 3);
  sink.faceStart.push(sink.loopStart.length - 1);
  return { points: pts, loopStart: Int32Array.from(sink.loopStart), faceStart: Int32Array.from(sink.faceStart) };
}
