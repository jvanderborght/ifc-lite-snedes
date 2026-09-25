/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The wall's own axes, derived from the geometry of its frame members.
 *
 * Timber-frame exports often carry an `IfcWall` without any representation
 * (the wall is only a container for its members), so there is no wall body to
 * read an axis from. The frame members are enough: their footprint on the
 * horizontal plane is a long thin rectangle, and the minimum-area bounding
 * rectangle of its convex hull recovers the length and thickness directions
 * exactly for a straight wall.
 *
 * Coordinates follow the geometry pipeline: WebGL Y-up, metres.
 */

export interface WallFrame {
  /** World point (Y-up, m) that local (0,0,0) maps to. */
  origin: [number, number, number];
  /** Unit horizontal direction along the wall length (x, z components of Y-up world). */
  along: [number, number];
  /** Unit horizontal direction through the thickness. */
  across: [number, number];
}

type P2 = [number, number];

function cross(o: P2, a: P2, b: P2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone chain; returns the hull counter-clockwise. */
export function convexHull(points: readonly P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Frame from world points (Y-up, m). The minimum-area rectangle has one side
 * on a hull edge, so only hull-edge directions need testing; the longer side
 * of the winner is the wall length.
 */
export function wallFrameFromPoints(points: ArrayLike<number>): WallFrame {
  const flat: P2[] = [];
  let minY = Infinity;
  // Quantise to 0.1 mm so the hull does not see thousands of near-duplicates.
  const seen = new Set<string>();
  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    if (y < minY) minY = y;
    const key = `${Math.round(x * 1e4)},${Math.round(z * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flat.push([x, z]);
  }
  const hull = convexHull(flat);
  let best = { area: Infinity, dir: [1, 0] as P2 };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    const d: P2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let lo0 = Infinity, hi0 = -Infinity, lo1 = Infinity, hi1 = -Infinity;
    for (const p of hull) {
      const s = p[0] * d[0] + p[1] * d[1];
      const t = -p[0] * d[1] + p[1] * d[0];
      lo0 = Math.min(lo0, s); hi0 = Math.max(hi0, s);
      lo1 = Math.min(lo1, t); hi1 = Math.max(hi1, t);
    }
    const area = (hi0 - lo0) * (hi1 - lo1);
    // Prefer the direction whose extent is the longer side.
    const dir: P2 = hi0 - lo0 >= hi1 - lo1 ? d : [-d[1], d[0]];
    if (area < best.area - 1e-12) best = { area, dir };
  }
  const along = best.dir;
  const across: P2 = [-along[1], along[0]];
  return { origin: [0, Number.isFinite(minY) ? minY : 0, 0], along, across };
}

/** World (Y-up) point to wall-local (along, across, up), in metres. */
export function toLocal(frame: WallFrame, x: number, y: number, z: number): [number, number, number] {
  const dx = x - frame.origin[0], dz = z - frame.origin[2];
  return [
    dx * frame.along[0] + dz * frame.along[1],
    dx * frame.across[0] + dz * frame.across[1],
    y - frame.origin[1],
  ];
}
