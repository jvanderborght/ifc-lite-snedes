/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Face area of one wall over ALL its layers, seen square to the wall.
 *
 * - net: the silhouette, i.e. the union of the orthogonal projections of all
 *   parts onto the wall plane. Wherever any layer is present counts once;
 *   openings (and any other spot without material) fall out by themselves.
 * - gross: the outline, i.e. the silhouette with every enclosed hole filled,
 *   plus the projection of the wall's `IfcOpeningElement`s clipped to the
 *   silhouette's extent. The openings matter for a door that reaches the
 *   bottom edge: it is a notch, not a hole, and only the opening closes it.
 * - openings = gross - net.
 * - per side: the silhouette of the layers outside the frame zone on that
 *   side (zone > 0 and zone < 0, hsbCAD convention), when zones are known.
 *
 * Nothing assumes a rectangle: gables, sloped tops and notches come out of
 * the row spans exactly (vertical edges exactly, sloped edges by the midpoint
 * rule per row, which is exact for straight edges).
 *
 * Foils (parts at most `foilMaxThickness` thick) are left out by default:
 * membranes are exported uncut and with laps well beyond the wall, which would
 * otherwise fill every window and add a strip above and below the wall.
 *
 * Geometry per wall comes from ONE source: the authored faceted B-reps of the
 * parts when every part has one and the wall has no body of its own (hsbCAD),
 * otherwise the pipeline meshes (Revit walls: their body is cut by their
 * openings there, as it should be). The pipeline also cuts a wall's openings
 * out of every PART, which removes real material wherever an opening element
 * is larger than the hole the exporter cut (see `brep.ts`).
 */

import { boxOf, meshFaces, projectFaces, toLocalFaces, type Box, type FaceSet, type MeshPiece } from './faces.js';
import { findHoles } from './holes.js';
import type { WallParts } from './model.js';
import { RowSpans } from './row-spans.js';
import { wallFrameFromPoints } from './wall-frame.js';

export interface WallGeometry {
  /** Pipeline mesh pieces of a product (Y-up metres). */
  meshes(expressId: number): readonly MeshPiece[];
  /** Authored faces of a product (Y-up metres, no origin shift), or null; see `authoredFaces`. */
  authored?(expressId: number): FaceSet | null;
}

export interface WallAreaOptions {
  /** Row step (m). Default 1 mm. */
  rowStep?: number;
  /** Parts no thicker than this (m, across the wall) are foils and left out. Default 2 mm; 0 keeps them. */
  foilMaxThickness?: number;
}

export interface WallAreaResult {
  /** Which geometry was used for this wall. */
  source: 'authored' | 'mesh';
  wallId: number;
  name: string;
  globalId: string;
  ifcType: string;
  parentWallId: number | null;
  /** Parts (incl. the wall itself) that have geometry and were counted. */
  partsCounted: number;
  /** Parts without any mesh (products without a body, e.g. tool data). */
  partsWithoutGeometry: number;
  /** Parts left out as foils. */
  foilsLeftOut: number;
  openingCount: number;
  openingsWithGeometry: number;
  /** Enclosed holes in the silhouette (before the openings are added). */
  holeCount: number;
  /** Extent along the wall, height, and across (all counted parts), m. */
  length: number;
  height: number;
  thickness: number;
  grossArea: number;
  netArea: number;
  openingArea: number;
  /** Gross equals length x height (within 0.001 m²). */
  isRectangular: boolean;
  /** Layers outside the frame zone, zone > 0 side and zone < 0 side; null without zones. */
  sidePlusArea: number | null;
  sideMinusArea: number | null;
  /** Silhouette per zone (m²), foils excluded, by zone number. */
  zoneAreas: Array<{ zone: string; area: number }>;
  declared: WallParts['declared'];
}

/** Frame zone across the wall: the across-extent shared by most zone-0 parts. */
function frameBand(parts: ReadonlyArray<{ box: Box; zone: string | undefined }>): [number, number] | null {
  const counts = new Map<string, { n: number; lo: number; hi: number }>();
  for (const p of parts) {
    if (p.zone !== '0') continue;
    const key = `${Math.round(p.box[2] * 1e4)},${Math.round(p.box[3] * 1e4)}`;
    const c = counts.get(key);
    if (c) c.n++; else counts.set(key, { n: 1, lo: p.box[2], hi: p.box[3] });
  }
  let best: { n: number; lo: number; hi: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best ? [best.lo, best.hi] : null;
}

const zoneNumber = (z: string | undefined): number | null => (z !== undefined && /^-?\d+$/.test(z) ? Number(z) : null);

/** Faces per part (and per opening) from one source, see the file comment. */
function pickSource(wall: WallParts, geometry: WallGeometry): { source: 'authored' | 'mesh'; parts: Map<number, FaceSet>; openings: Map<number, FaceSet>; withoutGeometry: number } {
  const own = geometry.meshes(wall.wallId).length > 0;
  if (geometry.authored && !own) {
    const parts = new Map<number, FaceSet>();
    let withoutGeometry = 0, fallback = false;
    for (const id of wall.partIds) {
      if (id === wall.wallId) continue;
      const f = geometry.authored(id);
      if (f) parts.set(id, f);
      else if (geometry.meshes(id).length > 0) { fallback = true; break; }
      else withoutGeometry++;
    }
    if (!fallback && parts.size > 0) {
      const openings = new Map<number, FaceSet>();
      for (const id of wall.openingIds) { const f = geometry.authored(id); if (f) openings.set(id, f); }
      return { source: 'authored', parts, openings, withoutGeometry };
    }
  }
  const parts = new Map<number, FaceSet>();
  let withoutGeometry = 0;
  for (const id of wall.partIds) {
    const ps = geometry.meshes(id);
    if (ps.length > 0) parts.set(id, meshFaces(ps));
    else if (id !== wall.wallId) withoutGeometry++;
  }
  const openings = new Map<number, FaceSet>();
  for (const id of wall.openingIds) { const ps = geometry.meshes(id); if (ps.length > 0) openings.set(id, meshFaces(ps)); }
  return { source: 'mesh', parts, openings, withoutGeometry };
}

export function computeWallArea(wall: WallParts, geometry: WallGeometry, options: WallAreaOptions = {}): WallAreaResult {
  const rowStep = options.rowStep ?? 0.001;
  const foilMax = options.foilMaxThickness ?? 0.002;
  const picked = pickSource(wall, geometry);
  const base = {
    source: picked.source, wallId: wall.wallId, name: wall.name, globalId: wall.globalId, ifcType: wall.ifcType, parentWallId: wall.parentWallId,
    partsWithoutGeometry: picked.withoutGeometry, openingCount: wall.openingIds.length, declared: wall.declared,
  };
  const empty = {
    ...base, partsCounted: 0, foilsLeftOut: 0, openingsWithGeometry: 0, holeCount: 0, length: 0, height: 0, thickness: 0,
    grossArea: 0, netArea: 0, openingArea: 0, isRectangular: false, sidePlusArea: null, sideMinusArea: null, zoneAreas: [],
  };
  if (picked.parts.size === 0) return empty;

  const all: number[] = [];
  for (const f of picked.parts.values()) for (let i = 0; i < f.points.length; i++) all.push(f.points[i]);
  const frame = wallFrameFromPoints(all);
  const parts = [...picked.parts].map(([id, f]) => {
    const faces = toLocalFaces(f, frame);
    return { id, faces, box: boxOf(faces), zone: wall.zones.get(id) };
  });
  const counted = parts.filter((p) => p.box[3] - p.box[2] > foilMax);
  if (counted.length === 0) return { ...empty, foilsLeftOut: parts.length };
  const ext: Box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const p of counted) for (let a = 0; a < 6; a += 2) { ext[a] = Math.min(ext[a], p.box[a]); ext[a + 1] = Math.max(ext[a + 1], p.box[a + 1]); }
  const [u0, u1, v0, v1, h0, h1] = ext;
  const spans = () => new RowSpans(h0, h1, rowStep);

  // Project every part once; all derived regions reuse its merged rows.
  const own = counted.map((p) => { const s = spans(); projectFaces(s, p.faces); return s; });
  const silhouette = spans();
  const byZone = new Map<string, RowSpans>();
  counted.forEach((p, i) => {
    silhouette.addFrom(own[i]);
    if (p.zone === undefined) return;
    let z = byZone.get(p.zone);
    if (!z) { z = spans(); byZone.set(p.zone, z); }
    z.addFrom(own[i]);
  });
  const netArea = silhouette.area();
  const holes = findHoles(silhouette);

  // Outline: silhouette plus the wall's openings, clipped to the silhouette's
  // bounding rectangle, holes filled. The openings close notches: a door
  // reaching the bottom edge, or a pocket cut into the top (hsbCAD exports
  // such cut-outs as opening elements, and its own Dimensions include them).
  const outline = spans();
  outline.addFrom(silhouette);
  let openingsWithGeometry = 0;
  for (const f of picked.openings.values()) {
    const faces = toLocalFaces(f, frame);
    const b = boxOf(faces);
    if (b[3] <= v0 || b[2] >= v1 || b[1] <= u0 || b[0] >= u1) continue; // misses the wall
    projectFaces(outline, faces, u0, u1);
    openingsWithGeometry++;
  }
  const grossArea = outline.area() + findHoles(outline).area;

  let sidePlusArea: number | null = null, sideMinusArea: number | null = null;
  const band = frameBand(counted);
  if (band) {
    const plus = spans(), minus = spans();
    counted.forEach((p, i) => {
      const z = zoneNumber(p.zone);
      const centre = (p.box[2] + p.box[3]) / 2;
      if (z === null || z === 0 || (centre >= band[0] && centre <= band[1])) return;
      (z > 0 ? plus : minus).addFrom(own[i]);
    });
    sidePlusArea = plus.area();
    sideMinusArea = minus.area();
  }
  const zoneAreas = [...byZone]
    .map(([zone, spans]) => ({ zone, area: spans.area() }))
    .sort((a, b) => (zoneNumber(a.zone) ?? Infinity) - (zoneNumber(b.zone) ?? Infinity) || a.zone.localeCompare(b.zone));

  const length = u1 - u0, height = h1 - h0;
  return {
    ...base,
    partsCounted: counted.length,
    foilsLeftOut: parts.length - counted.length,
    openingsWithGeometry,
    holeCount: holes.count,
    length, height, thickness: v1 - v0,
    grossArea, netArea, openingArea: grossArea - netArea,
    isRectangular: Math.abs(grossArea - length * height) < 0.001,
    sidePlusArea, sideMinusArea, zoneAreas,
  };
}

/** Totals over walls, skipping walls nested in another wall (their parts are in the parent). */
export function totalOf(results: readonly WallAreaResult[]): { walls: number; grossArea: number; netArea: number; openingArea: number; sidePlusArea: number; sideMinusArea: number } {
  const t = { walls: 0, grossArea: 0, netArea: 0, openingArea: 0, sidePlusArea: 0, sideMinusArea: 0 };
  for (const r of results) {
    if (r.parentWallId !== null) continue;
    t.walls++;
    t.grossArea += r.grossArea;
    t.netArea += r.netArea;
    t.openingArea += r.openingArea;
    t.sidePlusArea += r.sidePlusArea ?? 0;
    t.sideMinusArea += r.sideMinusArea ?? 0;
  }
  return t;
}
