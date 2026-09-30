/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Timber fraction of timber-frame walls: the NPR 2068 area ratio in the wall
 * plane (`npr.ts`, the primary figure), and several volume and area
 * definitions side by side for comparison (`percentage.ts`). The wall-plane
 * geometry is shared with the wall-area module (`@ifc-lite/wand-geometrie`).
 */

export { meshVolume, type MeshPiece, type VolumeResult } from './mesh-volume.js';
export { collectWalls, propertyText, DEFAULT_ZONE_RULE, type WallStore, type WallMembers, type ZoneRule } from './model.js';
export { computeWall, totalOf, variantsOf, VARIANT_IDS, type VariantId, type WallResult, type WallQuantities, type MeshLookup, type PercentageOptions } from './percentage.js';
export { authoredVolume, type EntityReader } from './brep-volume.js';
export { computeNpr, nprTotal, type NprWall, type NprGeometry, type NprOptions, type NprAreas, type NprResult, type NprStatus } from './npr.js';
