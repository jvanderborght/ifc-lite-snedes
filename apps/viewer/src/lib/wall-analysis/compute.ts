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

export function analyseWall(store: AnalysisStore, wall: WallParts, meshes: MeshLookup, model: { id: string; name: string }): WallAnalysisRow {
  const scale = store.lengthUnitScale ?? 1;
  const faces = new Map<number, FaceSet | null>();
  const authored = (id: number): FaceSet | null => {
    if (!faces.has(id)) faces.set(id, authoredFaces(store, id, scale));
    return faces.get(id) ?? null;
  };
  const geometry = { meshes, authored };
  const area = computeWallArea(wall, geometry);
  const npr = computeNpr(wall, geometry);
  return {
    modelId: model.id,
    modelName: model.name,
    wallId: wall.wallId,
    name: wall.name,
    ifcType: wall.ifcType,
    nested: wall.parentWallId !== null,
    area,
    npr,
    timber: npr.status === 'ok' ? comparisonVariants(store, wall, meshes) : null,
  };
}
