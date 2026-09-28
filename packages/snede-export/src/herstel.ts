/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Undo ifc-lite's second cut through pre-cut parts.
 *
 * ifc-lite copies a host's openings to every part aggregated under it
 * (`propagate_voids_to_parts`, rust/geometry/src/void_index.rs). That is meant
 * for layered walls split into `IfcBuildingElementPart` slices, which are not
 * cut yet. Timber-frame exports (hsbCAD) aggregate studs, plates and sheets
 * that are ALREADY cut to their openings; cutting them again removes timber
 * that is really there (e.g. the bottom plate under a door, lintels). On a
 * test model that was 2.3 % of all timber, up to 55 % of one member.
 *
 * For those parts the mesh is rebuilt from the authored faceted B-rep, which
 * is exactly what the model contains. Layer slices (`IfcBuildingElementPart`)
 * and parts without a faceted body keep ifc-lite's mesh.
 */

import earcut from 'earcut';
import { RelationshipType } from '@ifc-lite/data';
import type { CoordinateInfo, MeshData } from '@ifc-lite/geometry';
import { authoredFaces, type EntityReader, type FaceSet } from '@ifc-lite/wand-geometrie';

/** The part of a parsed IFC data store this needs. */
export interface HerstelStore extends EntityReader {
  lengthUnitScale?: number;
  entities: { getTypeName(id: number): string };
  entityIndex: { byType: Map<string, number[]> };
  relationships: { getRelated(id: number, rel: RelationshipType, direction: 'forward' | 'inverse'): number[] };
}

/** Layer slices are meant to receive the host's openings; everything else is pre-cut. */
const WEL_SNIJDEN = new Set(['IFCBUILDINGELEMENTPART', 'IFCOPENINGELEMENT', 'IFCOPENINGSTANDARDCASE']);

/**
 * Parts that ifc-lite cuts with their host's openings although they are no
 * layer slice: every aggregated descendant (any depth) of an element that has
 * openings, except layer slices and openings. Local express ids.
 */
export function dubbelGesnedenOnderdelen(store: HerstelStore): Set<number> {
  const hosts = new Set<number>();
  for (const type of ['IFCOPENINGELEMENT', 'IFCOPENINGSTANDARDCASE']) {
    for (const opening of store.entityIndex.byType.get(type) ?? []) {
      for (const host of store.relationships.getRelated(opening, RelationshipType.VoidsElement, 'inverse')) hosts.add(host);
    }
  }
  const uit = new Set<number>();
  const gezien = new Set<number>();
  for (const host of hosts) {
    const stapel = [...store.relationships.getRelated(host, RelationshipType.Aggregates, 'forward')];
    while (stapel.length) {
      const id = stapel.pop()!;
      if (gezien.has(id)) continue;                  // fan-in / cycle guard
      gezien.add(id);
      if (!WEL_SNIJDEN.has(store.entities.getTypeName(id).toUpperCase())) uit.add(id);
      stapel.push(...store.relationships.getRelated(id, RelationshipType.Aggregates, 'forward'));
    }
  }
  return uit;
}

/**
 * Triangulate faces (Y-up world metres) into a mesh in the renderer frame
 * (minus RTC offset and origin shift), positions relative to `origin` so
 * float32 keeps millimetre precision far from the world origin.
 */
export function vlakkenNaarMesh(faces: FaceSet, info: CoordinateInfo | undefined): { positions: Float32Array; indices: Uint32Array; origin: [number, number, number] } | null {
  const rtc = info?.wasmRtcOffset ?? { x: 0, y: 0, z: 0 };
  const s = info?.originShift ?? { x: 0, y: 0, z: 0 };
  // Y-up world (x, Z, -Y) -> renderer: subtract rtc (IFC axes) and the shift.
  const naarRender = (i: number): [number, number, number] => [
    faces.points[3 * i] - rtc.x - s.x,
    faces.points[3 * i + 1] - rtc.z - s.y,
    faces.points[3 * i + 2] + rtc.y - s.z,
  ];
  const n = faces.points.length / 3;
  if (n === 0) return null;
  const origin = naarRender(0);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = naarRender(i);
    positions[3 * i] = r[0] - origin[0];
    positions[3 * i + 1] = r[1] - origin[1];
    positions[3 * i + 2] = r[2] - origin[2];
  }
  const indices: number[] = [];
  const p = faces.points;
  for (let f = 0; f + 1 < faces.faceStart.length; f++) {
    const eersteLus = faces.faceStart[f];
    const laatsteLus = faces.faceStart[f + 1];
    if (laatsteLus <= eersteLus) continue;
    const a0 = faces.loopStart[eersteLus];
    const a1 = faces.loopStart[eersteLus + 1];
    // Newell normal of the outer loop picks the projection plane.
    let nx = 0; let ny = 0; let nz = 0;
    for (let i = a0; i < a1; i++) {
      const j = i + 1 < a1 ? i + 1 : a0;
      nx += (p[3 * i + 1] - p[3 * j + 1]) * (p[3 * i + 2] + p[3 * j + 2]);
      ny += (p[3 * i + 2] - p[3 * j + 2]) * (p[3 * i] + p[3 * j]);
      nz += (p[3 * i] - p[3 * j]) * (p[3 * i + 1] + p[3 * j + 1]);
    }
    const [ax, ay] = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? [1, 2]
      : Math.abs(ny) >= Math.abs(nz) ? [0, 2] : [0, 1];
    const plat: number[] = [];
    const gaten: number[] = [];
    const punt: number[] = [];
    for (let l = eersteLus; l < laatsteLus; l++) {
      if (faces.loopStart[l + 1] - faces.loopStart[l] < 3) continue;   // degenerate loop
      if (punt.length > 0) gaten.push(punt.length);
      for (let i = faces.loopStart[l]; i < faces.loopStart[l + 1]; i++) {
        plat.push(p[3 * i + ax], p[3 * i + ay]);
        punt.push(i);
      }
    }
    if (punt.length < 3) continue;
    // earcut picks its own winding; turn every triangle to the face's own
    // (Newell normal), so the shell keeps a consistent orientation. The
    // projection (ax, ay) keeps the normal's sign except when y was dropped.
    const nk = ax === 1 ? nx : ay === 2 ? ny : nz;
    const zin = Math.sign(nk) * (ax === 0 && ay === 2 ? -1 : 1);
    const drie = earcut(plat, gaten.length ? gaten : undefined, 2);
    for (let t = 0; t + 2 < drie.length; t += 3) {
      const [i, j, k] = [drie[t], drie[t + 1], drie[t + 2]];
      const opp = (plat[2 * j] - plat[2 * i]) * (plat[2 * k + 1] - plat[2 * i + 1])
        - (plat[2 * j + 1] - plat[2 * i + 1]) * (plat[2 * k] - plat[2 * i]);
      if (Math.sign(opp) === zin || zin === 0) indices.push(punt[i], punt[j], punt[k]);
      else indices.push(punt[i], punt[k], punt[j]);
    }
  }
  if (indices.length === 0) return null;
  return { positions, indices: Uint32Array.from(indices), origin };
}

/**
 * Replace the meshes of double-cut parts by meshes of their authored
 * B-rep. `idOffset` maps the store's local ids to the meshes' (federated)
 * express ids. Returns the new mesh list and the ids that were rebuilt.
 */
export function herstelOnderdelen(
  meshes: MeshData[],
  store: HerstelStore,
  info: CoordinateInfo | undefined,
  idOffset = 0,
): { meshes: MeshData[]; hersteld: number[] } {
  const kandidaten = dubbelGesnedenOnderdelen(store);
  if (kandidaten.size === 0) return { meshes, hersteld: [] };
  const scale = store.lengthUnitScale ?? 1;
  const vervangen = new Map<number, MeshData | null>();
  const uit: MeshData[] = [];
  for (const mesh of meshes) {
    const local = mesh.expressId - idOffset;
    if (!kandidaten.has(local)) { uit.push(mesh); continue; }
    if (!vervangen.has(mesh.expressId)) {
      const faces = authoredFaces(store, local, scale);
      const nieuw = faces && vlakkenNaarMesh(faces, info);
      vervangen.set(mesh.expressId, nieuw ? {
        ...mesh,
        positions: nieuw.positions,
        indices: nieuw.indices,
        origin: nieuw.origin,
        normals: new Float32Array(nieuw.positions.length),
      } : null);
      const v = vervangen.get(mesh.expressId);
      if (v) { uit.push(v); continue; }
    }
    // Already rebuilt (drop the other ifc-lite pieces), or no faceted body (keep them).
    if (vervangen.get(mesh.expressId) === null) uit.push(mesh);
  }
  const hersteld = [...vervangen].filter(([, v]) => v !== null).map(([id]) => id);
  return { meshes: uit, hersteld };
}
