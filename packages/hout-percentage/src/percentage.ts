/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Timber fraction of one wall's frame zone, several definitions side by side.
 *
 * Every denominator comes from the frame members themselves: the wall body in
 * these exports is usually empty, so the "frame envelope" is the box spanned by
 * the zone members in the wall's own axes (length x height x zone thickness).
 * Openings are taken from the `IfcOpeningElement` geometry that voids the
 * wall, projected onto the wall plane and clipped to that envelope.
 */

import { meshVolume, type MeshPiece } from './mesh-volume.js';
import { addProjection, addSection, differenceLength, RowSpans, toLocal, wallFrameFromPoints, type LocalTriangles, type WallFrame } from '@ifc-lite/wand-geometrie';
import type { WallMembers } from './model.js';

export const VARIANT_IDS = [
  'volumeGross',
  'volumeNet',
  'volumeGrossAuthored',
  'volumeNetAuthored',
  'sectionGross',
  'sectionNet',
  'projectedGross',
  'unionVolumeGross',
] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

export interface WallQuantities {
  /** Sum of the members' mesh volumes (m³); overlaps count twice. */
  timberVolume: number;
  /** Sum of the members' authored B-rep volumes (m³), see `brep-volume.ts`;
   *  members whose body could not be read are left out (listed in the result). */
  timberVolumeAuthored: number;
  /** Volume of the union of the members inside the zone band (m³), from
   *  sections between the members' across-extents. */
  timberUnionVolume: number;
  midSectionArea: number;
  midSectionAreaOutsideOpenings: number;
  projectedArea: number;
  length: number;
  height: number;
  thickness: number;
  envelopeArea: number;
  openingArea: number;
}

export interface WallResult extends WallQuantities {
  wallId: number;
  name: string;
  globalId: string;
  ifcType: string;
  memberCount: number;
  /** Members without any mesh (not counted). */
  membersWithoutGeometry: number[];
  /** Members whose mesh is not closed (volume not trustworthy). */
  openMembers: number[];
  /** Members without a readable authored B-rep (not in `timberVolumeAuthored`). */
  membersWithoutAuthoredVolume: number[];
  openingCount: number;
  openingsUsed: number;
  /** Across-extent of all members; differs from `thickness` when a member
   *  (e.g. a deep header) sticks out of the zone band. */
  fullThickness: number;
  /** Section rows closed by the open-surface fallback (see `addSection`). */
  sectionRowsRepaired: number;
  /** Fractions 0..1, null when the denominator is zero. */
  variants: Record<VariantId, number | null>;
}

export interface PercentageOptions {
  /** Row step for areas (m). Default 1 mm. */
  rowStep?: number;
  /** Uniform sections for the union volume when levels are too many. Default 24. */
  slices?: number;
  /** Authored volume per member (m�) or null; omit to skip those variants. */
  authoredVolume?: (expressId: number) => number | null;
}

/** Uniform sections for the union volume when members have too many distinct across-levels. */
const SLICES = 24;
const MAX_LEVELS = 64;
/** Largest section spacing (m) inside one level interval. */
const SUB_SLICE = 0.02;
/** Keeps the mid-plane off faces that sit exactly at half the zone thickness. */
const MID_OFFSET = 0.00037;

export type MeshLookup = (expressId: number) => readonly MeshPiece[];

function localTriangles(pieces: readonly MeshPiece[], frame: WallFrame): LocalTriangles {
  let n = 0;
  for (const p of pieces) n += Math.floor(p.indices.length / 3);
  const out = new Float64Array(n * 9);
  let w = 0;
  for (const p of pieces) {
    const o = p.origin ?? [0, 0, 0];
    for (let t = 0; t + 2 < p.indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = p.indices[t + k] * 3;
        const l = toLocal(frame, p.positions[i] + o[0], p.positions[i + 1] + o[1], p.positions[i + 2] + o[2]);
        out[w++] = l[0]; out[w++] = l[1]; out[w++] = l[2];
      }
    }
  }
  return out;
}

function zoneBand(members: readonly LocalTriangles[], volumes: readonly number[]): [number, number] | null {
  const counts = new Map<string, { n: number; w: number; lo: number; hi: number }>();
  members.forEach((tris, i) => {
    const [lo, hi] = bounds(tris, 1);
    const key = `${Math.round(lo * 1e4)},${Math.round(hi * 1e4)}`;
    const c = counts.get(key);
    if (c) { c.n++; c.w += volumes[i]; } else counts.set(key, { n: 1, w: volumes[i], lo, hi });
  });
  let best: { n: number; w: number; lo: number; hi: number } | null = null;
  for (const c of counts.values()) if (!best || c.w > best.w) best = c;
  return best && best.n > 1 ? [best.lo, best.hi] : null;
}

/** Intervals between the members' across-extents (their min and max) inside
 *  [v0, v1]; uniform `fallback` slices when there are too many levels. Holes
 *  or chamfers inside one interval are sampled at its midpoint only. */
function sliceIntervals(members: readonly LocalTriangles[], v0: number, v1: number, fallback: number): Array<[number, number]> {
  const levels = new Set<number>([Math.round(v0 * 1e5), Math.round(v1 * 1e5)]);
  for (const tris of members) {
    for (const x of bounds(tris, 1)) if (x > v0 && x < v1) levels.add(Math.round(x * 1e5));
  }
  if (levels.size > MAX_LEVELS) {
    return Array.from({ length: fallback }, (_, s) => [v0 + (s / fallback) * (v1 - v0), v0 + ((s + 1) / fallback) * (v1 - v0)] as [number, number]);
  }
  const sorted = [...levels].sort((a, b) => a - b).map((x) => x / 1e5);
  const out: Array<[number, number]> = [];
  for (let k = 0; k + 1 < sorted.length; k++) {
    const a = sorted[k], b = sorted[k + 1];
    if (b - a <= 1e-6) continue;
    // Sub-divide so holes drilled across a member are sampled, not skipped.
    const n = Math.max(1, Math.ceil((b - a) / SUB_SLICE));
    for (let i = 0; i < n; i++) out.push([a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n]);
  }
  return out;
}

function bounds(tris: LocalTriangles, axis: 0 | 1 | 2): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = axis; i < tris.length; i += 3) {
    if (tris[i] < lo) lo = tris[i];
    if (tris[i] > hi) hi = tris[i];
  }
  return [lo, hi];
}

const ratio = (a: number, b: number): number | null => (b > 1e-12 ? a / b : null);

export function variantsOf(q: WallQuantities, authored = true): Record<VariantId, number | null> {
  const envelopeVolume = q.envelopeArea * q.thickness;
  const netArea = q.envelopeArea - q.openingArea;
  return {
    volumeGross: ratio(q.timberVolume, envelopeVolume),
    volumeNet: ratio(q.timberVolume, netArea * q.thickness),
    volumeGrossAuthored: authored ? ratio(q.timberVolumeAuthored, envelopeVolume) : null,
    volumeNetAuthored: authored ? ratio(q.timberVolumeAuthored, netArea * q.thickness) : null,
    sectionGross: ratio(q.midSectionArea, q.envelopeArea),
    sectionNet: ratio(q.midSectionAreaOutsideOpenings, netArea),
    projectedGross: ratio(q.projectedArea, q.envelopeArea),
    unionVolumeGross: ratio(q.timberUnionVolume, envelopeVolume),
  };
}

export function computeWall(wall: WallMembers, meshes: MeshLookup, options: PercentageOptions = {}): WallResult {
  const rowStep = options.rowStep ?? 0.001;
  const slices = options.slices ?? SLICES;
  const membersWithoutGeometry: number[] = [];
  const openMembers: number[] = [];
  const membersWithoutAuthoredVolume: number[] = [];
  let timberVolumeAuthored = 0;
  const authored = options.authoredVolume !== undefined;
  const pieces = new Map<number, readonly MeshPiece[]>();
  const memberVolumes: number[] = [];
  let timberVolume = 0;
  const allPoints: number[] = [];
  for (const id of wall.memberIds) {
    if (options.authoredVolume) {
      const av = options.authoredVolume(id);
      if (av === null) membersWithoutAuthoredVolume.push(id); else timberVolumeAuthored += av;
    }
    const ps = meshes(id);
    if (ps.length === 0) { membersWithoutGeometry.push(id); continue; }
    pieces.set(id, ps);
    const v = meshVolume(ps);
    timberVolume += v.volume;
    memberVolumes.push(v.volume);
    if (!v.closed) openMembers.push(id);
    for (const p of ps) {
      const o = p.origin ?? [0, 0, 0];
      for (let i = 0; i + 2 < p.positions.length; i += 3) allPoints.push(p.positions[i] + o[0], p.positions[i + 1] + o[1], p.positions[i + 2] + o[2]);
    }
  }
  const base = { wallId: wall.wallId, name: wall.name, globalId: wall.globalId, ifcType: wall.ifcType, memberCount: wall.memberIds.length, membersWithoutGeometry, openMembers, membersWithoutAuthoredVolume, openingCount: wall.openingIds.length };
  const empty: WallQuantities = { timberVolume, timberVolumeAuthored, timberUnionVolume: 0, midSectionArea: 0, midSectionAreaOutsideOpenings: 0, projectedArea: 0, length: 0, height: 0, thickness: 0, envelopeArea: 0, openingArea: 0 };
  if (pieces.size === 0) return { ...base, ...empty, openingsUsed: 0, fullThickness: 0, sectionRowsRepaired: 0, variants: variantsOf(empty, authored) };

  const frame = wallFrameFromPoints(allPoints);
  const members = [...pieces.values()].map((ps) => localTriangles(ps, frame));
  let [u0, u1] = [Infinity, -Infinity], [bv0, bv1] = [Infinity, -Infinity], [h0, h1] = [Infinity, -Infinity];
  for (const tris of members) {
    const bu = bounds(tris, 0), bv = bounds(tris, 1), bh = bounds(tris, 2);
    u0 = Math.min(u0, bu[0]); u1 = Math.max(u1, bu[1]);
    bv0 = Math.min(bv0, bv[0]); bv1 = Math.max(bv1, bv[1]);
    h0 = Math.min(h0, bh[0]); h1 = Math.max(h1, bh[1]);
  }
  // Zone thickness: the (across-min, across-max) pair holding the most timber
  // volume (studs and plates, typically), so a glulam header deeper than the
  // studs does not widen the zone and short 60 mm packers do not narrow it.
  // Falls back to the full extent when no pair repeats.
  const [v0, v1] = zoneBand(members, memberVolumes) ?? [bv0, bv1];
  const length = u1 - u0, thickness = v1 - v0, height = h1 - h0;

  const projection = new RowSpans(h0, h1, rowStep);
  const mid = new RowSpans(h0, h1, rowStep);
  const vMid = (v0 + v1) / 2 + MID_OFFSET;
  let sectionRowsRepaired = 0;
  for (const tris of members) {
    addProjection(projection, tris);
    sectionRowsRepaired += addSection(mid, tris, vMid);
  }
  // Union volume by the midpoint rule between the members' across-extents:
  // between two such levels every prismatic member's section is constant, so
  // the midpoint is exact there (a slice count fixed in advance was not: a
  // 160 mm header in a 240 mm zone got 7 of 10 slices, i.e. 168 mm).
  let unionVolume = 0;
  for (const [a, b] of sliceIntervals(members, v0, v1, slices)) {
    const slice = new RowSpans(h0, h1, rowStep);
    for (const tris of members) sectionRowsRepaired += addSection(slice, tris, (a + b) / 2);
    unionVolume += slice.area(u0, u1) * (b - a);
  }

  const openings = new RowSpans(h0, h1, rowStep);
  let openingsUsed = 0;
  for (const id of wall.openingIds) {
    const ps = meshes(id);
    if (ps.length === 0) continue;
    const tris = localTriangles(ps, frame);
    const [ov0, ov1] = bounds(tris, 1);
    if (ov1 <= v0 || ov0 >= v1) continue; // does not reach the frame zone
    addProjection(openings, tris);
    openingsUsed++;
  }
  let openingArea = 0, midOutside = 0;
  for (let j = 0; j < openings.rows; j++) {
    const op = openings.merged(j).map((x) => Math.min(Math.max(x, u0), u1));
    for (let k = 0; k < op.length; k += 2) openingArea += op[k + 1] - op[k];
    midOutside += differenceLength(mid.merged(j), op);
  }
  openingArea *= rowStep;
  midOutside *= rowStep;

  const q: WallQuantities = {
    timberVolume,
    timberVolumeAuthored,
    timberUnionVolume: unionVolume,
    midSectionArea: mid.area(u0, u1),
    midSectionAreaOutsideOpenings: midOutside,
    projectedArea: projection.area(u0, u1),
    length, height, thickness,
    envelopeArea: length * height,
    openingArea,
  };
  return { ...base, ...q, openingsUsed, fullThickness: bv1 - bv0, sectionRowsRepaired, variants: variantsOf(q, authored) };
}

/** Totals: sums of numerators over sums of denominators (not a mean of
 *  percentages). The zone thickness differs per wall, so the total carries the
 *  envelope VOLUME, and its `thickness` is the volume-weighted mean. */
export function totalOf(results: readonly WallResult[]): WallQuantities & { variants: Record<VariantId, number | null>; memberCount: number } {
  const q: WallQuantities = { timberVolume: 0, timberVolumeAuthored: 0, timberUnionVolume: 0, midSectionArea: 0, midSectionAreaOutsideOpenings: 0, projectedArea: 0, length: 0, height: 0, thickness: 0, envelopeArea: 0, openingArea: 0 };
  let envelopeVolume = 0, netVolume = 0, memberCount = 0;
  const authored = results.some((r) => r.variants.volumeGrossAuthored !== null);
  for (const r of results) {
    for (const k of ['timberVolume', 'timberVolumeAuthored', 'timberUnionVolume', 'midSectionArea', 'midSectionAreaOutsideOpenings', 'projectedArea', 'length', 'envelopeArea', 'openingArea'] as const) q[k] += r[k];
    envelopeVolume += r.envelopeArea * r.thickness;
    netVolume += (r.envelopeArea - r.openingArea) * r.thickness;
    memberCount += r.memberCount;
  }
  q.thickness = q.envelopeArea > 0 ? envelopeVolume / q.envelopeArea : 0;
  const netArea = q.envelopeArea - q.openingArea;
  return {
    ...q,
    memberCount,
    variants: {
      volumeGross: ratio(q.timberVolume, envelopeVolume),
      volumeNet: ratio(q.timberVolume, netVolume),
      volumeGrossAuthored: authored ? ratio(q.timberVolumeAuthored, envelopeVolume) : null,
      volumeNetAuthored: authored ? ratio(q.timberVolumeAuthored, netVolume) : null,
      sectionGross: ratio(q.midSectionArea, q.envelopeArea),
      sectionNet: ratio(q.midSectionAreaOutsideOpenings, netArea),
      projectedGross: ratio(q.projectedArea, q.envelopeArea),
      unionVolumeGross: ratio(q.timberUnionVolume, envelopeVolume),
    },
  };
}
