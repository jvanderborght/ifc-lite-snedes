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
import { Afdekking, opParameter, TOL_VLAK, type Snedelijn } from './afdekking.js';
import { afdekkers, naarTekenruimte, zichtranden } from './randen.js';

/** Parts shorter than this (mm) in the drawing are dropped. */
const MIN_LENGTE = 1e-4;

export function zichtlijnen(
  meshes: MeshData[],
  config: SectionConfig,
  offsetMm: { x: number; y: number },
  diepte: number,
  snede: Lijn[],
): Lijn[] {
  const driehoeken: number[] = [];
  const kandidaten: { rand: ReturnType<typeof zichtranden>[number]; mesh: MeshData }[] = [];
  for (const mesh of meshes) {
    const v = naarTekenruimte(mesh, config, offsetMm);
    afdekkers(v, mesh.indices, diepte, driehoeken);
    for (const rand of zichtranden(v, mesh.indices, diepte)) {
      if (Math.max(rand.a.d, rand.b.d) < TOL_VLAK) continue;      // lies in the plane: on the cut
      if (Math.hypot(rand.b.x - rand.a.x, rand.b.y - rand.a.y) < MIN_LENGTE) continue; // seen end-on
      kandidaten.push({ rand, mesh });
    }
  }
  const snedelijnen: Snedelijn[] = snede.map((l) => ({ entityId: l.entityId, a: l.a, b: l.b }));
  const afdekking = new Afdekking(driehoeken, snedelijnen);

  const uit: Lijn[] = [];
  for (const { rand, mesh } of kandidaten) {
    const { zichtbaar, verborgen } = afdekking.verdeel(rand);
    for (const [soort, intervallen] of [['zicht', zichtbaar], ['verborgen', verborgen]] as const) {
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
