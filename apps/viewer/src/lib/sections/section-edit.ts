/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Moving a saved section along its own normal (it is never rotated), and
 * handing it to the viewer's Section tool so the cut shows on screen and the
 * tool's drag handle moves it.
 *
 * The position is a signed distance in IFC world mm along the normal, with
 * the sign chosen so the normal's largest component is positive: for a
 * section across X that is simply its X coordinate, for a plan its level.
 */

import type { CoordinateInfo } from '@ifc-lite/geometry';
import { planeBasis } from '@ifc-lite/renderer';
import { naarRenderPunt, naarRenderRichting, vanRenderPunt } from '@ifc-lite/snede-export';
import type { CustomSectionPlane } from '@/store/types';
import type { SavedSection, WorldVec3 } from './saved-section';

type V3 = WorldVec3;

const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** Unit normal of the section with its largest component positive. */
export function positionAxis(section: Pick<SavedSection, 'direction'>): V3 {
  const n = unit(section.direction);
  const big = [n.x, n.y, n.z].reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  return big < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
}

/** Signed distance of the plane along `positionAxis`, IFC world mm. */
export function sectionPosition(section: Pick<SavedSection, 'origin' | 'direction'>): number {
  return dot(section.origin, positionAxis(section));
}

/** The section moved along its normal so `sectionPosition` becomes `position`. */
export function withSectionPosition<T extends Pick<SavedSection, 'origin' | 'direction'>>(section: T, position: number): T {
  const n = positionAxis(section);
  const d = position - sectionPosition(section);
  const o = section.origin;
  return { ...section, origin: { x: o.x + n.x * d, y: o.y + n.y * d, z: o.z + n.z * d } };
}

/**
 * Range of `sectionPosition` over the model box (renderer frame, as
 * `coordinateInfo.shiftedBounds`): the slider runs from one end of the model
 * to the other along the section normal.
 */
export function positionRange(
  section: Pick<SavedSection, 'direction'>,
  info: CoordinateInfo | undefined,
  box: { min: V3; max: V3 } | undefined,
): { min: number; max: number } | null {
  if (!box) return null;
  const n = positionAxis(section);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 8; i++) {
    const r = { x: i & 1 ? box.max.x : box.min.x, y: i & 2 ? box.max.y : box.min.y, z: i & 4 ? box.max.z : box.min.z };
    const w = vanRenderPunt(r, info);
    const s = dot({ x: w.x * 1000, y: w.y * 1000, z: w.z * 1000 }, n);
    min = Math.min(min, s);
    max = Math.max(max, s);
  }
  return max - min > 1e-6 ? { min, max } : null;
}

/**
 * The Section tool's plane for this saved section (renderer frame), with
 * `flipped: false`: the tool keeps `dot(p, normal) <= distance` and looks
 * along `-normal`, so the normal is the reversed view direction.
 */
export function customPlaneFor(section: Pick<SavedSection, 'origin' | 'direction'>, info: CoordinateInfo | undefined): CustomSectionPlane {
  const r = unit(naarRenderRichting(section.direction));
  const normal: [number, number, number] = [-r.x, -r.y, -r.z];
  const p = naarRenderPunt({ x: section.origin.x / 1000, y: section.origin.y / 1000, z: section.origin.z / 1000 }, info);
  const basis = planeBasis(normal);
  return {
    normal,
    distance: p.x * normal[0] + p.y * normal[1] + p.z * normal[2],
    pickedAt: [p.x, p.y, p.z],
    tangent: basis.tangent,
    bitangent: basis.bitangent,
  };
}

/**
 * Follow a cut that was moved on screen: the saved section keeps its own
 * direction and is only shifted onto the cut. Returns null when the cut is no
 * longer parallel to the section (the user picked another plane), so the
 * caller stops following instead of rotating the section.
 */
export function followCut<T extends Pick<SavedSection, 'origin' | 'direction'>>(section: T, cut: { origin: V3; direction: V3 }): T | null {
  const n = unit(section.direction);
  if (Math.abs(dot(n, unit(cut.direction))) < 1 - 1e-6) return null;
  const d = dot({ x: cut.origin.x - section.origin.x, y: cut.origin.y - section.origin.y, z: cut.origin.z - section.origin.z }, n);
  const o = section.origin;
  return { ...section, origin: { x: o.x + n.x * d, y: o.y + n.y * d, z: o.z + n.z * d } };
}
