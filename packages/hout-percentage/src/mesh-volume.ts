/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Enclosed volume of a triangle mesh by the divergence theorem, with the
 * checks that make the number trustworthy.
 *
 * The pipeline's `MeshData.indices` carry NO reliable winding (meshes are
 * double-sided by design), and positions are split per face for flat normals.
 * So the mesh is first welded on quantised positions, then every undirected
 * edge must be used exactly twice (closed, manifold), and the triangles are
 * re-oriented consistently by a flood fill over shared edges before the signed
 * tetrahedron sum is taken. A mesh that fails a check still gets a volume, but
 * `closed` is false and the caller must report it rather than trust it.
 */

/** Weld tolerance in metres: vertices closer than this are one vertex. */
const WELD_M = 1e-5;

export interface MeshPiece {
  /** xyz triples, metres, relative to `origin` when given. */
  positions: Float32Array | Float64Array | number[];
  indices: Uint32Array | number[];
  origin?: readonly [number, number, number];
}

export interface VolumeResult {
  /** Absolute enclosed volume in m³ (sum over pieces). */
  volume: number;
  /** Every undirected edge shared by exactly two triangles, in every piece. */
  closed: boolean;
  /** Edges used once (holes in the surface). */
  boundaryEdges: number;
  /** Edges used three or more times. */
  nonManifoldEdges: number;
  /** Triangles whose winding had to be flipped to agree with a neighbour. */
  flipped: number;
  triangles: number;
}

function weld(piece: MeshPiece): { tri: Uint32Array; xyz: Float64Array } {
  const p = piece.positions;
  const o = piece.origin ?? [0, 0, 0];
  const n = p.length / 3;
  const map = new Map<string, number>();
  const remap = new Uint32Array(n);
  const xyz: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = p[3 * i] + o[0];
    const y = p[3 * i + 1] + o[1];
    const z = p[3 * i + 2] + o[2];
    const key = `${Math.round(x / WELD_M)},${Math.round(y / WELD_M)},${Math.round(z / WELD_M)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = xyz.length / 3;
      map.set(key, id);
      xyz.push(x, y, z);
    }
    remap[i] = id;
  }
  const idx = piece.indices;
  const tri: number[] = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = remap[idx[t]], b = remap[idx[t + 1]], c = remap[idx[t + 2]];
    if (a === b || b === c || a === c) continue; // degenerate after welding
    tri.push(a, b, c);
  }
  return { tri: Uint32Array.from(tri), xyz: Float64Array.from(xyz) };
}

const edgeKey = (a: number, b: number): number => (a < b ? a * 0x200000 + b : b * 0x200000 + a);

/** Volume and closedness of one piece. */
function pieceVolume(piece: MeshPiece): VolumeResult {
  const { tri, xyz } = weld(piece);
  const nt = tri.length / 3;
  // edge -> triangles using it
  const edges = new Map<number, number[]>();
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(tri[3 * t + k], tri[3 * t + ((k + 1) % 3)]);
      const list = edges.get(key);
      if (list) list.push(t); else edges.set(key, [t]);
    }
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const list of edges.values()) {
    if (list.length === 1) boundaryEdges++;
    else if (list.length > 2) nonManifoldEdges++;
  }

  // Flood-fill orientation: a neighbour across a shared edge must traverse that
  // edge in the opposite direction.
  const dirOf = (t: number, a: number, b: number): number => {
    for (let k = 0; k < 3; k++) {
      const u = tri[3 * t + k], v = tri[3 * t + ((k + 1) % 3)];
      if (u === a && v === b) return 1;
      if (u === b && v === a) return -1;
    }
    return 0;
  };
  const flip = new Int8Array(nt); // 0 = unvisited, 1 = keep, -1 = flip
  let flipped = 0;
  let volume = 0;
  for (let seed = 0; seed < nt; seed++) {
    if (flip[seed] !== 0) continue;
    flip[seed] = 1;
    const stack = [seed];
    let shell = 0;
    while (stack.length > 0) {
      const t = stack.pop() as number;
      const s = flip[t];
      const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2];
      const [i0, i1] = s === 1 ? [b, c] : [c, b];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * i0], by = xyz[3 * i0 + 1], bz = xyz[3 * i0 + 2];
      const cx = xyz[3 * i1], cy = xyz[3 * i1 + 1], cz = xyz[3 * i1 + 2];
      shell += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      for (let k = 0; k < 3; k++) {
        const u = tri[3 * t + k], v = tri[3 * t + ((k + 1) % 3)];
        const list = edges.get(edgeKey(u, v)) as number[];
        if (list.length !== 2) continue;
        const nb = list[0] === t ? list[1] : list[0];
        if (flip[nb] !== 0) continue;
        // In t (after its own flip) the edge runs u->v times s; nb must run it opposite.
        const want = -s;
        const has = dirOf(nb, u, v);
        flip[nb] = has === want ? 1 : -1;
        if (flip[nb] === -1) flipped++;
        stack.push(nb);
      }
    }
    // Each connected shell is oriented independently; an inward-facing shell
    // gives a negative sum, so take its magnitude (nested shells are not
    // expected in framing members; a cavity would be over-counted here).
    volume += Math.abs(shell);
  }
  return {
    volume,
    closed: boundaryEdges === 0 && nonManifoldEdges === 0 && nt > 0,
    boundaryEdges,
    nonManifoldEdges,
    flipped,
    triangles: nt,
  };
}

/** Volume of an element made of one or more mesh pieces. */
export function meshVolume(pieces: readonly MeshPiece[]): VolumeResult {
  const total: VolumeResult = { volume: 0, closed: pieces.length > 0, boundaryEdges: 0, nonManifoldEdges: 0, flipped: 0, triangles: 0 };
  for (const piece of pieces) {
    const r = pieceVolume(piece);
    total.volume += r.volume;
    total.closed &&= r.closed;
    total.boundaryEdges += r.boundaryEdges;
    total.nonManifoldEdges += r.nonManifoldEdges;
    total.flipped += r.flipped;
    total.triangles += r.triangles;
  }
  return total;
}
