/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One section plane -> classified 2D lines in absolute drawing millimetres.
 */

import { Drawing2DGenerator } from '@ifc-lite/drawing-2d';
import type { DrawingLine } from '@ifc-lite/drawing-2d';
import type { CoordinateInfo, MeshData } from '@ifc-lite/geometry';
import { naarSectionConfig, type Snedevlak } from './vlak.js';
import { zichtlijnen, type ZichtOpties } from './zicht/index.js';
import { knipDubbeleLijnen } from './dubbel.js';

/** Line kinds in the export: cut, visible beyond the cut, hidden beyond the cut. */
export type LijnSoort = 'snede' | 'zicht' | 'verborgen';

export interface Lijn {
  soort: LijnSoort;
  ifcType: string;
  entityId: number;
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/**
 * IFC classes that are not building parts and are never drawn: opening
 * volumes (their void is already cut from the host), spaces, annotations,
 * grids and virtual elements. Compared case-insensitively because STEP stores
 * type names uppercase.
 */
export const NIET_TEKENEN: ReadonlySet<string> = new Set([
  'IFCOPENINGELEMENT', 'IFCOPENINGSTANDARDCASE', 'IFCSPACE', 'IFCANNOTATION',
  'IFCGRID', 'IFCVIRTUALELEMENT',
]);

/**
 * Placed building geometry only: occurrences (class 0) and layer slices
 * (class 3). Type-library templates (1, 2) would otherwise be cut on top of
 * the drawing (see GEOM_CLASS_* in packages/geometry/src/geometry-class.ts).
 */
export function geplaatsteMeshes(meshes: MeshData[], uitsluiten?: ReadonlySet<number>): MeshData[] {
  return meshes.filter((m) => {
    const cls = m.geometryClass ?? 0;
    if (cls !== 0 && cls !== 3) return false;
    if (m.ifcType && NIET_TEKENEN.has(m.ifcType.toUpperCase())) return false;
    return !uitsluiten?.has(m.expressId);
  });
}

function soortVan(l: DrawingLine): LijnSoort | null {
  if (l.category === 'cut') return 'snede';
  if (l.category === 'annotation') return null;
  return l.visibility === 'hidden' ? 'verborgen' : 'zicht';
}

export async function tekenSnede(
  meshes: MeshData[],
  info: CoordinateInfo | undefined,
  vlak: Snedevlak,
  opties: ZichtOpties = {},
): Promise<Lijn[]> {
  const { config, offsetMm } = naarSectionConfig(vlak, info);
  const generator = new Drawing2DGenerator();
  try {
    await generator.initialize();
    // drawing-2d supplies the cut lines only; view lines come from zicht/.
    const tekening = await generator.generate(meshes, config, {
      useGPU: false,
      includeProjection: false,
      includeEdges: false,
      includeHiddenLines: false,
      // drawing-2d's merger treats segments within 1 mm as collinear and merges
      // them, which collapses both faces of a 1 mm foil into one line. Chaining
      // happens in our own polyline step with a tight tolerance instead.
      mergeLines: false,
    });
    const naarMm = (p: { x: number; y: number }) => ({
      x: p.x * 1000 + offsetMm.x,
      y: p.y * 1000 + offsetMm.y,
    });
    const lijnen: Lijn[] = [];
    for (const l of tekening.lines) {
      const soort = soortVan(l);
      if (!soort) continue;
      lijnen.push({
        soort,
        ifcType: l.ifcType || 'IfcBuildingElementProxy',
        entityId: l.entityId,
        a: naarMm(l.line.start),
        b: naarMm(l.line.end),
      });
    }
    if (vlak.diepte <= 0) return lijnen;
    lijnen.push(...zichtlijnen(meshes, config, offsetMm, vlak.diepte, lijnen, opties));
    return knipDubbeleLijnen(lijnen).lijnen;
  } finally {
    generator.dispose();
  }
}
