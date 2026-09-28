/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Wall-plane geometry shared by the wall-analysis modules
 * (`@ifc-lite/wand-oppervlak`, `@ifc-lite/hout-percentage`): the wall's own
 * axes, exact projections onto the wall plane by row spans, a product's
 * authored faceted B-rep, enclosed holes, and region operations.
 */

export { wallFrameFromPoints, convexHull, toLocal, type WallFrame } from './wall-frame.js';
export { RowSpans, addProjection, addSection, mergeIntervals, differenceLength, type LocalTriangles } from './row-spans.js';
export { meshFaces, projectFaces, toLocalFaces, boxOf, type FaceSet, type MeshPiece, type Box } from './faces.js';
export { authoredFaces, type EntityReader } from './brep.js';
export { findHoles, holeGaps, type HoleResult, type Gap } from './holes.js';
export { fillHoles, difference, intersection, overlapArea, overlapLength, dilate, pieces, fromPieces, pieceOverlap, emptyLike, type Piece } from './regions.js';
