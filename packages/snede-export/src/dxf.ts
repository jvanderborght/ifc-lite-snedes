/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * DXF output: layers per IFC class (SNEDE_<class> for cut lines, ZICHT_<class>
 * for visible lines beyond the cut, VERBORGEN_<class> for hidden lines), ACI
 * colour per class, lineweight per line kind, lines chained into polylines.
 */

import { DxfR2000, type Eenheid, type Lijndikte, type Lijntype, type Punt } from './dxf/r2000.js';
import type { Lijn, LijnSoort } from './genereer.js';
import type { Annotatie, AnnotatieLaag } from './markering.js';
import { maakPolylijnen } from './polylijnen.js';

/** Default ACI colour per IFC class; unknown classes get 7 (white/black). */
export const STANDAARD_KLEUREN: Readonly<Record<string, number>> = {
  IfcWall: 1, IfcWallStandardCase: 1, IfcCurtainWall: 4, IfcSlab: 3,
  IfcRoof: 3, IfcBeam: 6, IfcColumn: 6, IfcMember: 4, IfcPlate: 5,
  IfcWindow: 140, IfcDoor: 30, IfcStair: 2, IfcStairFlight: 2, IfcRailing: 8,
  IfcCovering: 9, IfcFooting: 3, IfcBuildingElementProxy: 8,
  IfcFurnishingElement: 252,
};

interface LaagStijl { voorvoegsel: string; lijndikte: Lijndikte; lijntype: Lijntype }

/** Default layer style per line kind (prefix, lineweight, linetype). */
export const STANDAARD_LAAGSTIJL: Readonly<Record<LijnSoort, LaagStijl>> = {
  snede: { voorvoegsel: 'SNEDE', lijndikte: 50, lijntype: 'Continuous' },
  zicht: { voorvoegsel: 'ZICHT', lijndikte: 18, lijntype: 'Continuous' },
  verborgen: { voorvoegsel: 'VERBORGEN', lijndikte: 13, lijntype: 'DASHED' },
};

export interface DxfOpties {
  kleuren?: Readonly<Record<string, number>>;
  /** Include hidden lines (dashed layer). Default false. */
  verborgenLijnen?: boolean;
  /** Output unit; input lines are always mm. Default 'mm'. */
  eenheid?: Eenheid;
  /** Section markers and titles (mm, sheet coordinates). */
  annotaties?: Annotatie[];
  /** Dash and gap of hidden lines in model mm. Default 50 / 25 (1 / 0.5 mm on paper at 1:50). */
  streeppatroon?: { streep: number; gat: number };
}

export const STANDAARD_STREEPPATROON = { streep: 50, gat: 25 } as const;

/** Layers for annotations: name, ACI colour, lineweight. */
export const ANNOTATIELAGEN: Readonly<Record<AnnotatieLaag, { naam: string; aci: number; lijndikte: Lijndikte }>> = {
  markering: { naam: 'SNEDEMARKERING', aci: 7, lijndikte: 35 },
  titel: { naam: 'SNEDETITEL', aci: 7, lijndikte: 25 },
};

/** Millimetres per drawing unit. */
export const MM_PER: Readonly<Record<Eenheid, number>> = { mm: 1, cm: 10, m: 1000 };

const BEKENDE_KLASSEN = new Map(Object.keys(STANDAARD_KLEUREN).map((k) => [k.toUpperCase(), k]));

/**
 * IFC type names are stored uppercase in STEP; render them as IfcPascalCase.
 * Word boundaries are unknown for uppercase input, so known classes come
 * from the colour table and the rest becomes 'Ifc' + lowercase.
 */
export function klasseNaam(ifcType: string): string {
  const bekend = BEKENDE_KLASSEN.get(ifcType.toUpperCase());
  if (bekend) return bekend;
  if (/^Ifc[A-Z]/.test(ifcType)) return ifcType;
  const kleine = ifcType.toLowerCase();
  return kleine.startsWith('ifc') ? `Ifc${kleine.slice(3)}` : ifcType;
}

/** Write lines (already in drawing millimetres) to a DXF string. */
export function schrijfDxf(lijnen: Lijn[], opties: DxfOpties = {}): string {
  const kleuren = opties.kleuren ?? STANDAARD_KLEUREN;
  const eenheid = opties.eenheid ?? 'mm';
  const f = 1 / MM_PER[eenheid];
  const schaal = (p: Punt): Punt => ({ x: p.x * f, y: p.y * f });
  const patroon = opties.streeppatroon ?? STANDAARD_STREEPPATROON;
  const dxf = new DxfR2000(eenheid, { streep: patroon.streep * f, gat: patroon.gat * f });
  const gekozen = lijnen.filter((l) => l.soort !== 'verborgen' || opties.verborgenLijnen);
  // Chaining tolerances are in mm, so scale only when writing.
  for (const p of maakPolylijnen(gekozen)) {
    const klasse = klasseNaam(p.ifcType);
    const stijl = STANDAARD_LAAGSTIJL[p.soort];
    const laag = dxf.laag(`${stijl.voorvoegsel}_${klasse}`, kleuren[klasse] ?? 7, stijl.lijndikte, stijl.lijntype);
    const punten = p.punten.map(schaal);
    if (punten.length === 2 && !p.gesloten) dxf.lijn(punten[0], punten[1], laag);
    else dxf.polylijn(punten, p.gesloten, laag);
  }
  for (const a of opties.annotaties ?? []) {
    const stijl = ANNOTATIELAGEN[a.laag];
    const laag = dxf.laag(stijl.naam, stijl.aci, stijl.lijndikte);
    if (a.soort === 'lijn') dxf.lijn(schaal(a.a), schaal(a.b), laag);
    else if (a.soort === 'veelhoek') dxf.polylijn(a.punten.map(schaal), true, laag);
    else dxf.tekst(schaal(a.p), a.hoogte * f, a.waarde, laag, { horizontaal: 1, verticaal: 2 });
  }
  return dxf.toString();
}
