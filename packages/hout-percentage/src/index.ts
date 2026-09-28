/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Timber fraction of timber-frame walls: the frame-zone members of each wall,
 * with several volume and area definitions computed side by side so the user
 * can pick one. See `percentage.ts` for what each variant divides by.
 */

export { meshVolume, type MeshPiece, type VolumeResult } from './mesh-volume.js';
export { wallFrameFromPoints, convexHull, toLocal, type WallFrame } from './wall-frame.js';
export { RowSpans, addProjection, addSection, mergeIntervals } from './row-spans.js';
export { collectWalls, propertyText, DEFAULT_ZONE_RULE, type WallStore, type WallMembers, type ZoneRule } from './model.js';
export { computeWall, totalOf, variantsOf, VARIANT_IDS, type VariantId, type WallResult, type WallQuantities, type MeshLookup, type PercentageOptions } from './percentage.js';
export { authoredVolume, type EntityReader } from './brep-volume.js';
