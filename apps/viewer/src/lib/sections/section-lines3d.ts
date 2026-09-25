/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * World-space line geometry that shows a saved section in the 3D view: the
 * outline of its plane clipped to the model's box, and an arrow from the
 * middle of that outline in the view direction. Renderer frame (Y-up,
 * metres, shifted), as `Renderer.setLineOverlay` takes it.
 */

import type { CoordinateInfo } from '@ifc-lite/geometry';
import { naarRenderPunt, naarRenderRichting } from '@ifc-lite/snede-export';
import type { SavedSection } from './saved-section';

type V3 = { x: number; y: number; z: number };

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: V3, b: V3, s = 1): V3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** Corners of the polygon where the plane (point p, unit normal n) cuts the box, in order. */
export function planeBoxPolygon(p: V3, n: V3, box: { min: V3; max: V3 }): V3[] {
  const { min, max } = box;
  const c = (i: number): V3 => ({ x: i & 1 ? max.x : min.x, y: i & 2 ? max.y : min.y, z: i & 4 ? max.z : min.z });
  const corners = Array.from({ length: 8 }, (_, i) => c(i));
  const edges: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) edges.push([i, i | bit]);
  const h = dot(n, p);
  const points: V3[] = [];
  for (const [i, j] of edges) {
    const a = dot(n, corners[i]) - h;
    const b = dot(n, corners[j]) - h;
    if ((a > 0 && b > 0) || (a < 0 && b < 0) || a === b) continue;
    const t = a / (a - b);
    const q = add(corners[i], sub(corners[j], corners[i]), t);
    if (!points.some((o) => Math.hypot(o.x - q.x, o.y - q.y, o.z - q.z) < 1e-9)) points.push(q);
  }
  if (points.length < 3) return [];
  const centre = points.reduce((s, q) => add(s, q, 1 / points.length), { x: 0, y: 0, z: 0 });
  const u = unit(sub(points[0], centre));
  const v = cross(n, u);
  return points
    .map((q) => ({ q, angle: Math.atan2(dot(sub(q, centre), v), dot(sub(q, centre), u)) }))
    .sort((a, b) => a.angle - b.angle)
    .map((e) => e.q);
}

/**
 * Flat [x0, y0, z0, x1, y1, z1, ...] segments for every shown section:
 * clipped outline plus a view-direction arrow.
 */
export function sectionLines3D(
  sections: readonly SavedSection[],
  info: CoordinateInfo | undefined,
  box: { min: V3; max: V3 } | undefined,
): number[] {
  if (!box) return [];
  const out: number[] = [];
  const seg = (a: V3, b: V3) => out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const diagonal = Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  for (const s of sections) {
    if (!s.shown || Math.hypot(s.direction.x, s.direction.y, s.direction.z) === 0) continue;
    const p = naarRenderPunt({ x: s.origin.x / 1000, y: s.origin.y / 1000, z: s.origin.z / 1000 }, info);
    const n = unit(naarRenderRichting(s.direction));
    const poly = planeBoxPolygon(p, n, box);
    if (!poly.length) continue;
    poly.forEach((q, i) => seg(q, poly[(i + 1) % poly.length]));
    // Arrow from the middle of the outline, one tenth of the model's diagonal long.
    const centre = poly.reduce((acc, q) => add(acc, q, 1 / poly.length), { x: 0, y: 0, z: 0 });
    const length = diagonal / 10;
    const tip = add(centre, n, length);
    seg(centre, tip);
    const side = unit(sub(poly[0], centre));
    const back = add(tip, n, -length / 4);
    seg(tip, add(back, side, length / 8));
    seg(tip, add(back, side, -length / 8));
  }
  return out;
}
