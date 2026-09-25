/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DXF output: layers per IFC class (SNEDE_<class> for cut lines, ZICHT_<class>
 * for visible lines beyond the cut, VERBORGEN_<class> for hidden lines), ACI
 * colour per class, units declared in the header.
 */

import { DxfWriter, Units } from '@tarikjabiri/dxf';
import type { Lijn, LijnSoort } from './genereer.js';

/** Default ACI colour per IFC class; unknown classes get 7 (white/black). */
export const STANDAARD_KLEUREN: Readonly<Record<string, number>> = {
  IfcWall: 1, IfcWallStandardCase: 1, IfcCurtainWall: 4, IfcSlab: 3,
  IfcRoof: 3, IfcBeam: 6, IfcColumn: 6, IfcMember: 4, IfcPlate: 5,
  IfcWindow: 140, IfcDoor: 30, IfcStair: 2, IfcStairFlight: 2, IfcRailing: 8,
  IfcCovering: 9, IfcFooting: 3, IfcBuildingElementProxy: 8,
  IfcFurnishingElement: 252,
};

const VOORVOEGSEL: Record<LijnSoort, string> = {
  snede: 'SNEDE', zicht: 'ZICHT', verborgen: 'VERBORGEN',
};

export interface DxfOpties {
  kleuren?: Readonly<Record<string, number>>;
  /** Include hidden lines (dashed layer). Default false. */
  verborgenLijnen?: boolean;
}

/** IFC type names are stored uppercase in STEP; render them as IfcPascalCase. */
export function klasseNaam(ifcType: string): string {
  if (/^Ifc[A-Z]/.test(ifcType)) return ifcType;
  const kleine = ifcType.toLowerCase();
  return kleine.startsWith('ifc') ? `Ifc${kleine.slice(3)}` : ifcType;
}

export function schrijfDxf(lijnen: Lijn[], opties: DxfOpties = {}): string {
  const kleuren = opties.kleuren ?? STANDAARD_KLEUREN;
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Millimeters);
  const lagen = new Set<string>();
  for (const l of lijnen) {
    if (l.soort === 'verborgen' && !opties.verborgenLijnen) continue;
    const klasse = klasseNaam(l.ifcType);
    const laag = `${VOORVOEGSEL[l.soort]}_${klasse}`;
    if (!lagen.has(laag)) {
      dxf.addLayer(laag, kleuren[klasse] ?? 7, 'CONTINUOUS');
      lagen.add(laag);
    }
    dxf.addLine({ x: l.a.x, y: l.a.y, z: 0 }, { x: l.b.x, y: l.b.y, z: 0 }, { layerName: laag });
  }
  return dxf.stringify();
}
