/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sheet layout: all sections of one export in one drawing.
 *
 * - Non-horizontal sections form one row, left to right in list order, with a
 *   fixed gap between their extents. Only X is shifted, so DXF-Y stays the
 *   world elevation (IFC 0 = DXF-Y 0) and all sections line up vertically.
 * - Horizontal sections (plans) either go in a row below the sections, all
 *   with the same Y shift so their world Y stays comparable, or stay on world
 *   X/Y.
 */

import type { Lijn } from './genereer.js';
import type { Punt } from './dxf/r2000.js';
import { tekenassen, type Snedevlak } from './vlak.js';

export type PlanPlaatsing = 'rij' | 'wereld';

export interface BladOpties {
  /** Gap between drawings in mm. Default 10 000. */
  tussenruimte?: number;
  /** Plans in a row below the sections, or on world coordinates. Default 'rij'. */
  plannen?: PlanPlaatsing;
}

export interface SnedeTekening {
  vlak: Snedevlak;
  lijnen: Lijn[];
}

export interface Kader { min: Punt; max: Punt }

export interface GeplaatsteTekening extends SnedeTekening {
  /** Added to every drawing coordinate of this section (mm). */
  verschuiving: Punt;
  /** Extents after shifting; null for a section without lines. */
  kader: Kader | null;
  isPlan: boolean;
}

export const STANDAARD_TUSSENRUIMTE = 10_000;

export function isPlan(vlak: Snedevlak): boolean {
  return Math.abs(tekenassen(vlak).n.z) > 1 - 1e-9;
}

export function kaderVan(lijnen: Lijn[]): Kader | null {
  if (!lijnen.length) return null;
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const l of lijnen) {
    for (const p of [l.a, l.b]) {
      min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y);
      max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y);
    }
  }
  return { min, max };
}

const verschuif = (k: Kader | null, d: Punt): Kader | null => k && {
  min: { x: k.min.x + d.x, y: k.min.y + d.y },
  max: { x: k.max.x + d.x, y: k.max.y + d.y },
};

/** Place every section; returns them in input order with their shift. */
export function legBladAan(tekeningen: SnedeTekening[], opties: BladOpties = {}): GeplaatsteTekening[] {
  const gap = opties.tussenruimte ?? STANDAARD_TUSSENRUIMTE;
  const kaders = tekeningen.map((t) => kaderVan(t.lijnen));
  const plan = tekeningen.map((t) => isPlan(t.vlak));
  const shift: Punt[] = tekeningen.map(() => ({ x: 0, y: 0 }));

  // A row starting at X = 0; empty drawings take no width.
  const rij = (indices: number[]): void => {
    let cursor = 0;
    for (const i of indices) {
      const k = kaders[i];
      if (!k) { shift[i].x = cursor; continue; }
      shift[i].x = cursor - k.min.x;
      cursor += k.max.x - k.min.x + gap;
    }
  };

  const sneden = tekeningen.map((_, i) => i).filter((i) => !plan[i]);
  const plannen = tekeningen.map((_, i) => i).filter((i) => plan[i]);
  rij(sneden);

  if ((opties.plannen ?? 'rij') === 'rij' && plannen.length) {
    rij(plannen);
    const onderkantSneden = Math.min(...sneden.map((i) => kaders[i]?.min.y ?? Infinity));
    const bovenkantPlannen = Math.max(...plannen.map((i) => kaders[i]?.max.y ?? -Infinity));
    if (Number.isFinite(onderkantSneden) && Number.isFinite(bovenkantPlannen)) {
      const dy = onderkantSneden - gap - bovenkantPlannen;
      for (const i of plannen) shift[i].y = dy;
    }
  }

  return tekeningen.map((t, i) => ({
    ...t,
    verschuiving: shift[i],
    kader: verschuif(kaders[i], shift[i]),
    isPlan: plan[i],
  }));
}

/** All lines of the laid-out sheet, shifted into place. */
export function bladLijnen(geplaatst: GeplaatsteTekening[]): Lijn[] {
  return geplaatst.flatMap(({ lijnen, verschuiving: d }) => lijnen.map((l) => ({
    ...l,
    a: { x: l.a.x + d.x, y: l.a.y + d.y },
    b: { x: l.b.x + d.x, y: l.b.y + d.y },
  })));
}
