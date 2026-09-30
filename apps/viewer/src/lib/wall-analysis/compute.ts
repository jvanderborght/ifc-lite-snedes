/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One wall-analysis row from one wall: the wall-area module and the timber
 * module run over the same wall (`collectWalls` of `@ifc-lite/wand-oppervlak`
 * decides what a wall and its parts are), with the parts' authored B-reps read
 * once and shared by both.
 *
 * Pure: the viewer passes its mesh lookup in, so this runs the same in a test
 * over a parsed store.
 */

import { authoredVolume, computeNpr, computeWall, type WallResult } from '@ifc-lite/hout-percentage';
import { authoredFaces, collectWalls, computeWallArea, type EntityReader, type FaceSet, type MeshPiece, type WallAreaStore, type WallParts } from '@ifc-lite/wand-oppervlak';
import type { WallAnalysisRow } from './columns';
import { isExternalOf, wallKind } from './kind';

export type AnalysisStore = WallAreaStore & EntityReader;
export type MeshLookup = (expressId: number) => readonly MeshPiece[];

export interface ModelPlan {
  walls: WallParts[];
  /** Any wall part carries a zone: without, no timber figure can be determined for this model. */
  hasZones: boolean;
}

export function planModel(store: AnalysisStore): ModelPlan {
  const walls = collectWalls(store);
  return { walls, hasZones: walls.some((w) => w.zones.size > 0) };
}

const FRAME_ZONE = '0';

function comparisonVariants(store: AnalysisStore, wall: WallParts, meshes: MeshLookup): WallResult {
  const scale = store.lengthUnitScale ?? 1;
  const memberIds = wall.partIds.filter((id) => wall.zones.get(id) === FRAME_ZONE && wall.partTypes.get(id) === 'IfcBeam');
  const openingIds = wall.openingMarkerIds.filter((id) => wall.markerTypes.get(id) === 'IfcOpeningElement');
  return computeWall(
    { wallId: wall.wallId, name: wall.name, globalId: wall.globalId, ifcType: wall.ifcType, memberIds, openingIds },
    meshes,
    { authoredVolume: (id) => authoredVolume(store, id, scale) },
  );
}

/**
 * One wall's row in steps: the wall-area module, then the NPR timber
 * fraction. Each `yield` is a point where the caller may give the main thread
 * back (a large timber-frame wall takes up to a second per step). The
 * comparison variants are left pending (`variantsPending`) for a later pass,
 * see `addVariants`.
 */
export function* analyseWallSteps(store: AnalysisStore, wall: WallParts, meshes: MeshLookup, model: { id: string; name: string }): Generator<void, WallAnalysisRow> {
  const scale = store.lengthUnitScale ?? 1;
  const faces = new Map<number, FaceSet | null>();
  const authored = (id: number): FaceSet | null => {
    if (!faces.has(id)) faces.set(id, authoredFaces(store, id, scale));
    return faces.get(id) ?? null;
  };
  const geometry = { meshes, authored };
  const area = computeWallArea(wall, geometry);
  yield;
  const npr = computeNpr(wall, geometry);
  const kind = wallKind(wall.name, isExternalOf(store.getProperties(wall.wallId)));
  return {
    modelId: model.id,
    modelName: model.name,
    wallId: wall.wallId,
    name: wall.name,
    ifcType: wall.ifcType,
    nested: wall.parentWallId !== null,
    kind: kind.kind,
    kindSource: kind.source,
    area,
    npr,
    timber: null,
    variantsPending: npr.status === 'ok',
  };
}

/** The row with its comparison variants filled in (only for walls with an NPR result). */
export function addVariants(store: AnalysisStore, wall: WallParts, meshes: MeshLookup, row: WallAnalysisRow): WallAnalysisRow {
  if (!row.variantsPending) return row;
  return { ...row, timber: comparisonVariants(store, wall, meshes), variantsPending: false };
}

/** All at once (tests, scripts). */
export function analyseWall(store: AnalysisStore, wall: WallParts, meshes: MeshLookup, model: { id: string; name: string }): WallAnalysisRow {
  const steps = analyseWallSteps(store, wall, meshes, model);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return addVariants(store, wall, meshes, step.value);
}
