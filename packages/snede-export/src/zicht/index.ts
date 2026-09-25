/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * View lines behind a section: own edge extraction and exact hidden-line
 * removal, replacing drawing-2d's projection stage. drawing-2d draws only
 * outlines (no inner creases) and classifies visibility against a 1024 px
 * depth raster sampled 10 times per line, which is far from the 0.1 mm this
 * export is held to.
 */

import type { SectionConfig } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import type { Lijn } from '../genereer.js';
import { Afdekking, opParameter, TOL_VLAK, zonder, type Snedelijn } from './afdekking.js';
import { afdekkers, naarTekenruimte, zichtranden } from './randen.js';

/** Parts shorter than this (mm) in the drawing are dropped. */
const MIN_LENGTE = 1e-4;

/**
 * Meshes in drawing space, with the material-layer slices of one element
 * (geometryClass 3) joined into one mesh, so edge extraction sees the
 * element's outer faces and not the faces between its layers.
 */
function* perElement(meshes: MeshData[], config: SectionConfig, offsetMm: { x: number; y: number }):
  Generator<{ mesh: MeshData; v: Float64Array; indices: Uint32Array }> {
  const lagen = new Map<number, MeshData[]>();
  for (const mesh of meshes) {
    if ((mesh.geometryClass ?? 0) !== 3) {
      yield { mesh, v: naarTekenruimte(mesh, config, offsetMm), indices: mesh.indices };
      continue;
    }
    const lijst = lagen.get(mesh.expressId);
    if (lijst) lijst.push(mesh); else lagen.set(mesh.expressId, [mesh]);
  }
  for (const schijven of lagen.values()) {
    const delen = schijven.map((m) => naarTekenruimte(m, config, offsetMm));
    const v = new Float64Array(delen.reduce((s, d) => s + d.length, 0));
    const indices = new Uint32Array(schijven.reduce((s, m) => s + m.indices.length, 0));
    let pv = 0;
    let pi = 0;
    schijven.forEach((m, k) => {
      v.set(delen[k], pv);
      for (let i = 0; i < m.indices.length; i++) indices[pi + i] = m.indices[i] + pv / 3;
      pv += delen[k].length;
      pi += m.indices.length;
    });
    yield { mesh: schijven[0], v, indices };
  }
}

export interface ZichtOpties {
  /**
   * Keep hidden lines inside a cut outline (behind a cut face, e.g. the studs
   * behind a sheathing board the plane runs through). Default false.
   */
  verborgenBinnenSnede?: boolean;
}

export function zichtlijnen(
  meshes: MeshData[],
  config: SectionConfig,
  offsetMm: { x: number; y: number },
  diepte: number,
  snede: Lijn[],
  opties: ZichtOpties = {},
): Lijn[] {
  const driehoeken: number[] = [];
  const kandidaten: { rand: ReturnType<typeof zichtranden>[number]; mesh: MeshData }[] = [];
  for (const { mesh, v, indices } of perElement(meshes, config, offsetMm)) {
    afdekkers(v, indices, diepte, driehoeken);
    for (const rand of zichtranden(v, indices, diepte)) {
      if (Math.max(rand.a.d, rand.b.d) < TOL_VLAK) continue;      // lies in the plane: on the cut
      if (Math.hypot(rand.b.x - rand.a.x, rand.b.y - rand.a.y) < MIN_LENGTE) continue; // seen end-on
      kandidaten.push({ rand, mesh });
    }
  }
  const snedelijnen: Snedelijn[] = snede.map((l) => ({ entityId: l.entityId, a: l.a, b: l.b }));
  const afdekking = new Afdekking(driehoeken, snedelijnen);

  const uit: Lijn[] = [];
  for (const { rand, mesh } of kandidaten) {
    const deel = afdekking.verdeel(rand);
    const verborgen = opties.verborgenBinnenSnede ? deel.verborgen : zonder(deel.verborgen, deel.binnenSnede);
    for (const [soort, intervallen] of [['zicht', deel.zichtbaar], ['verborgen', verborgen]] as const) {
      for (const [t0, t1] of intervallen) {
        const a = opParameter(rand, t0);
        const b = opParameter(rand, t1);
        if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_LENGTE) continue;
        uit.push({
          soort,
          ifcType: mesh.ifcType || 'IfcBuildingElementProxy',
          entityId: mesh.expressId,
          a: { x: a.x, y: a.y },
          b: { x: b.x, y: b.y },
        });
      }
    }
  }
  return uit;
}
