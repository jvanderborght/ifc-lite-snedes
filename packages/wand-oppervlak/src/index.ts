/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Wall face area per `IfcWall` over all layers: gross outline, net (openings
 * out) and per side, correct for non-rectangular walls. See `area.ts` for the
 * definitions and `model.ts` for which products count as the wall.
 */

export { collectWalls, declaredQuantities, DEFAULT_WALL_TYPES, DEFAULT_EXCLUDED_PART_TYPES, DEFAULT_ZONE, type WallAreaStore, type WallModelOptions, type WallParts, type DeclaredQuantities } from './model.js';
export { computeWallArea, totalOf, type WallGeometry, type WallAreaOptions, type WallAreaResult } from './area.js';
// The geometry lives in the shared `@ifc-lite/wand-geometrie`; re-exported so
// callers of this module need no second import for the B-rep reader.
export { authoredFaces, type EntityReader, type FaceSet, type MeshPiece } from '@ifc-lite/wand-geometrie';
export { WALL_AREA_COLUMNS, type WallColumn } from './columns.js';
