/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Timber fraction the NPR 2068 way (provisional reading, see below): an AREA
 * ratio in the projected wall plane, not a volume.
 *
 *   fraction = A_b / A_con,  A_a = A_con - A_b
 *
 * - A_con: the outline of the prefab element's frame zone (zone 0), minus
 *   its openings. An opening is bounded by the inner faces of the studs and
 *   plates around it, so it is taken from the frame itself: the empty pieces
 *   of the outline (between members) that are mostly covered by an opening
 *   marker (`IfcOpeningElement`, `IfcDoor`, `IfcWindow`). Empty pieces that
 *   are not openings (cavities between studs, whose insulation is usually not
 *   modelled) stay in A_con. The outline is the frame silhouette plus the
 *   markers (a door without a bottom plate is a notch, not a hole) with every
 *   enclosed hole filled; a notch no marker closes stays outside.
 * - A_b: the projection of the zone-0 timber members (IfcBeam), overlaps
 *   counted once. It lies inside A_con by construction.
 * - Raveling (the members kozijnen are fixed to): the timber within
 *   `ravelingMax` (40 mm) of a window or door opening, i.e. that member's
 *   width but at most 40 mm. `ravelingExcluded` gives the three areas with
 *   that strip taken out of both A_con and A_b. A window or door opening is
 *   one an `IfcDoor`/`IfcWindow` covers, or any opening of at least
 *   `frameOpeningMin` (joist pockets and service holes carry no kozijn).
 *
 * Only walls whose parts carry zones (hsbCAD `Data.Zone`) can be evaluated;
 * without zones the frame cannot be told from the rest (a solid Revit wall),
 * and the result says so instead of producing a number.
 *
 * Geometry comes from the authored faceted B-reps when every frame member has
 * one (the viewer mesh cuts the wall's openings out of the members too, e.g.
 * the bottom plate under a door); otherwise from the pipeline meshes, flagged
 * by `source`. Areas are exact along the wall and sampled per row (1 mm)
 * across; results are unrounded (the NPR rounds areas to 0.01 m²).
 */

import {
  boxOf, dilate, difference, fillHoles, fromPieces, intersection, meshFaces, pieceOverlap, pieces, projectFaces,
  RowSpans, toLocalFaces, wallFrameFromPoints, type FaceSet, type MeshPiece,
} from '@ifc-lite/wand-geometrie';

/** What `computeNpr` needs of a wall; `WallParts` of `@ifc-lite/wand-oppervlak` fits. */
export interface NprWall {
  wallId: number;
  partIds: readonly number[];
  zones: ReadonlyMap<number, string>;
  partTypes: ReadonlyMap<number, string>;
  openingMarkerIds: readonly number[];
  /** IFC type name per marker id (`IfcDoor` / `IfcWindow` mark window and door openings); missing entries count as plain openings. */
  markerTypes?: ReadonlyMap<number, string>;
}

export interface NprGeometry {
  /** Pipeline mesh pieces of a product (Y-up metres). */
  meshes(expressId: number): readonly MeshPiece[];
  /** Authored faces (Y-up metres, no origin shift) or null. */
  authored?(expressId: number): FaceSet | null;
}

export interface NprOptions {
  /** Row step (m). Default 1 mm. */
  rowStep?: number;
  /** Widest raveling strip (m). Default 40 mm. */
  ravelingMax?: number;
  /** Share of an empty piece a marker must cover for it to be an opening. Default 0.5. */
  openingShare?: number;
  /** Openings at least this large (m²) get raveling even without an IfcDoor/IfcWindow. Default 0.1. */
  frameOpeningMin?: number;
  /** Zone value of the frame. Default `0`. */
  frameZone?: string;
  /** IFC types that are timber members. Default IfcBeam. */
  timberTypes?: readonly string[];
  /** Parts no thicker than this (m, across the wall) are foils. Default 2 mm. */
  foilMaxThickness?: number;
}

export interface NprAreas {
  /** A_con (m²). */
  aCon: number;
  /** A_b, timber (m²). */
  aB: number;
  /** A_a = A_con - A_b (m²). */
  aA: number;
  /** A_b / A_con, 0..1; null when A_con is zero. */
  fraction: number | null;
}

/** `noZones`: no part of the wall has a zone. `noFrame`: zones, but no timber in the frame zone. `noGeometry`: frame members without any geometry. */
export type NprStatus = 'ok' | 'noZones' | 'noFrame' | 'noGeometry';

export interface NprResult extends NprAreas {
  status: NprStatus;
  source: 'authored' | 'mesh' | null;
  /** Frame-zone parts and timber members among them that were counted. */
  frameParts: number;
  timberParts: number;
  partsWithoutGeometry: number;
  /** Outline of the frame zone, openings included (m²). */
  outlineArea: number;
  openingArea: number;
  openingCount: number;
  /** Timber strip of at most `ravelingMax` next to openings (m²). */
  ravelingArea: number;
  ravelingExcluded: NprAreas;
}

const ratio = (a: number, b: number): number | null => (b > 1e-9 ? a / b : null);
const areas = (aCon: number, aB: number): NprAreas => ({ aCon, aB, aA: aCon - aB, fraction: ratio(aB, aCon) });

function empty(status: NprStatus, extra: Partial<NprResult> = {}): NprResult {
  const zero = areas(0, 0);
  return {
    ...zero, fraction: null, status, source: null, frameParts: 0, timberParts: 0, partsWithoutGeometry: 0,
    outlineArea: 0, openingArea: 0, openingCount: 0, ravelingArea: 0, ravelingExcluded: { ...zero, fraction: null }, ...extra,
  };
}

/** Faces of the frame parts and markers from ONE source (never mixed: the two differ by the pipeline's origin shift). */
function pickFaces(frameIds: readonly number[], markerIds: readonly number[], geometry: NprGeometry): { source: 'authored' | 'mesh'; frame: Map<number, FaceSet>; markers: Array<[number, FaceSet]>; without: number } {
  if (geometry.authored) {
    const frame = new Map<number, FaceSet>();
    let complete = true;
    for (const id of frameIds) {
      const f = geometry.authored(id);
      if (f) frame.set(id, f); else { complete = false; break; }
    }
    if (complete) {
      const markers: Array<[number, FaceSet]> = [];
      for (const id of markerIds) { const f = geometry.authored(id); if (f) markers.push([id, f]); }
      return { source: 'authored', frame, markers, without: 0 };
    }
  }
  const frame = new Map<number, FaceSet>();
  let without = 0;
  for (const id of frameIds) {
    const ps = geometry.meshes(id);
    if (ps.length > 0) frame.set(id, meshFaces(ps)); else without++;
  }
  const markers: Array<[number, FaceSet]> = [];
  for (const id of markerIds) { const ps = geometry.meshes(id); if (ps.length > 0) markers.push([id, meshFaces(ps)]); }
  return { source: 'mesh', frame, markers, without };
}

export function computeNpr(wall: NprWall, geometry: NprGeometry, options: NprOptions = {}): NprResult {
  const rowStep = options.rowStep ?? 0.001;
  const ravelingMax = options.ravelingMax ?? 0.04;
  const share = options.openingShare ?? 0.5;
  const zone = options.frameZone ?? '0';
  const timberTypes = new Set(options.timberTypes ?? ['IfcBeam']);
  const foilMax = options.foilMaxThickness ?? 0.002;
  const frameOpeningMin = options.frameOpeningMin ?? 0.1;

  if (wall.zones.size === 0) return empty('noZones');
  const frameIds = wall.partIds.filter((id) => id !== wall.wallId && wall.zones.get(id) === zone);
  const isTimber = (id: number): boolean => timberTypes.has(wall.partTypes.get(id) ?? '');
  if (!frameIds.some(isTimber)) return empty('noFrame');

  const picked = pickFaces(frameIds, wall.openingMarkerIds, geometry);
  if (picked.frame.size === 0) return empty('noGeometry', { partsWithoutGeometry: picked.without });
  const all: number[] = [];
  for (const f of picked.frame.values()) for (let i = 0; i < f.points.length; i++) all.push(f.points[i]);
  const frame = wallFrameFromPoints(all);
  const parts = [...picked.frame].map(([id, f]) => {
    const faces = toLocalFaces(f, frame);
    return { id, faces, box: boxOf(faces), timber: isTimber(id) };
  }).filter((p) => p.box[3] - p.box[2] > foilMax);
  const timber = parts.filter((p) => p.timber);
  if (timber.length === 0) return empty('noGeometry', { source: picked.source, partsWithoutGeometry: picked.without });

  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, h0 = Infinity, h1 = -Infinity;
  for (const { box } of parts) {
    u0 = Math.min(u0, box[0]); u1 = Math.max(u1, box[1]);
    v0 = Math.min(v0, box[2]); v1 = Math.max(v1, box[3]);
    h0 = Math.min(h0, box[4]); h1 = Math.max(h1, box[5]);
  }
  const spans = (): RowSpans => new RowSpans(h0, h1, rowStep);
  const material = spans(), wood = spans();
  for (const p of parts) {
    projectFaces(material, p.faces);
    if (p.timber) projectFaces(wood, p.faces);
  }
  const markers = spans(), kozijnen = spans();
  for (const [id, f] of picked.markers) {
    const faces = toLocalFaces(f, frame);
    const b = boxOf(faces);
    if (b[3] <= v0 || b[2] >= v1 || b[1] <= u0 || b[0] >= u1) continue; // misses the frame zone
    projectFaces(markers, faces, u0, u1);
    const type = wall.markerTypes?.get(id);
    if (type === 'IfcDoor' || type === 'IfcWindow') projectFaces(kozijnen, faces, u0, u1);
  }

  const withMarkers = spans();
  withMarkers.addFrom(material);
  withMarkers.addFrom(markers);
  const outline = fillHoles(withMarkers);
  const openings = pieces(difference(outline, material)).filter((p) => p.area > 1e-6 && pieceOverlap(p, markers) >= share * p.area);
  const openingRegion = fromPieces(outline, openings);
  const framed = openings.filter((p) => p.area >= frameOpeningMin || pieceOverlap(p, kozijnen) > 0);

  const outlineArea = outline.area();
  const openingArea = openingRegion.area();
  const aCon = outlineArea - openingArea;
  const aB = wood.area();
  const ravelingArea = framed.length > 0 ? intersection(dilate(fromPieces(outline, framed), ravelingMax), wood).area() : 0;
  return {
    ...areas(aCon, aB),
    status: 'ok',
    source: picked.source,
    frameParts: parts.length,
    timberParts: timber.length,
    partsWithoutGeometry: picked.without,
    outlineArea, openingArea, openingCount: openings.length,
    ravelingArea,
    ravelingExcluded: areas(aCon - ravelingArea, aB - ravelingArea),
  };
}

/** Totals: sums of the areas, fractions as sum over sum. Only `ok` results count. */
export function nprTotal(results: readonly NprResult[]): NprAreas & { ravelingArea: number; ravelingExcluded: NprAreas; walls: number } {
  let aCon = 0, aB = 0, rav = 0, walls = 0;
  for (const r of results) {
    if (r.status !== 'ok') continue;
    aCon += r.aCon; aB += r.aB; rav += r.ravelingArea; walls++;
  }
  return { ...areas(aCon, aB), ravelingArea: rav, ravelingExcluded: areas(aCon - rav, aB - rav), walls };
}
