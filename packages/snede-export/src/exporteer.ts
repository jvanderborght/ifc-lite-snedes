/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One export: several section planes -> one DXF sheet plus an export report.
 * This is the entry point for the viewer; the dev scripts call the same.
 */

import type { CoordinateInfo, GeometryDiagnostics, MeshData } from '@ifc-lite/geometry';
import { bladLijnen, legBladAan, type BladOpties, type SnedeTekening } from './blad.js';
import { schrijfDxf, type DxfOpties } from './dxf.js';
import { NIET_TEKENEN, tekenSnedeDetail, type LijnSoort } from './genereer.js';
import { annotaties, type AnnotatieOpties } from './markering.js';
import { maakPolylijnen } from './polylijnen.js';
import type { Snedevlak } from './vlak.js';
import { geometrieUitDiagnose, type ExportVerslag, type SnedeVerslag } from './verslag.js';
import type { ZichtOpties } from './zicht/index.js';

export interface ExportOpties {
  /** Element ids hidden in the viewer; left out of the export. */
  verborgenElementen?: ReadonlySet<number>;
  blad?: BladOpties;
  annotatie?: AnnotatieOpties;
  dxf?: Omit<DxfOpties, 'annotaties'>;
  zicht?: ZichtOpties;
  /** ifc-lite's geometry diagnostics for this model, if the caller has them. */
  diagnose?: GeometryDiagnostics;
}

/**
 * Largest gap (mm) in an open outline: for each open end, the distance to the
 * nearest other open end; the largest of those. Infinity for a lone piece.
 */
function grootsteGat(einden: { x: number; y: number }[]): number {
  let grootste = 0;
  einden.forEach((e, i) => {
    let dichtst = Infinity;
    einden.forEach((o, j) => { if (j !== i) dichtst = Math.min(dichtst, Math.hypot(o.x - e.x, o.y - e.y)); });
    grootste = Math.max(grootste, dichtst);
  });
  return grootste;
}

export async function exporteer(
  alleMeshes: MeshData[],
  info: CoordinateInfo | undefined,
  vlakken: Snedevlak[],
  opties: ExportOpties = {},
): Promise<{ dxf: string; verslag: ExportVerslag }> {
  const t0 = performance.now();
  const verborgen = opties.verborgenElementen;
  const nietGetekend = new Map<string, Set<number>>();
  const verborgenGeteld = new Set<number>();
  const meshes = alleMeshes.filter((m) => {
    const cls = m.geometryClass ?? 0;
    if (cls !== 0 && cls !== 3) return false;                       // type library, not the model
    const type = m.ifcType ?? '';
    if (NIET_TEKENEN.has(type.toUpperCase())) {
      if (!nietGetekend.has(type)) nietGetekend.set(type, new Set());
      nietGetekend.get(type)!.add(m.expressId);
      return false;
    }
    if (verborgen?.has(m.expressId)) { verborgenGeteld.add(m.expressId); return false; }
    return true;
  });

  const tekeningen: SnedeTekening[] = [];
  const snedes: SnedeVerslag[] = [];
  const waarschuwingen: string[] = [];
  for (const vlak of vlakken) {
    const ts = performance.now();
    const { lijnen, weggeknipt } = await tekenSnedeDetail(meshes, info, vlak, opties.zicht);
    tekeningen.push({ vlak, lijnen });
    const telling: Record<LijnSoort, number> = { snede: 0, zicht: 0, verborgen: 0 };
    for (const l of lijnen) telling[l.soort]++;
    const snede = lijnen.filter((l) => l.soort === 'snede');
    const open = new Map<number, { ifcType: string; einden: { x: number; y: number }[] }>();
    for (const p of maakPolylijnen(snede)) {
      if (p.gesloten) continue;
      const o = open.get(p.entityId) ?? { ifcType: p.ifcType, einden: [] };
      o.einden.push(p.punten[0], p.punten[p.punten.length - 1]);
      open.set(p.entityId, o);
    }
    snedes.push({
      naam: vlak.naam, isPlan: false, diepte: vlak.diepte, lijnen: telling,
      gesneden: new Set(snede.map((l) => l.entityId)).size,
      openSnedeomtrekken: [...open].map(([entityId, o]) => ({ entityId, ifcType: o.ifcType, grootsteGat: grootsteGat(o.einden) }))
        .sort((p, q) => q.grootsteGat - p.grootsteGat),
      weggeknipt, rekentijdMs: performance.now() - ts,
    });
    if (!lijnen.length) waarschuwingen.push(`snede ${vlak.naam} raakt geen enkel element binnen de kijkdiepte`);
  }

  const geplaatst = legBladAan(tekeningen, opties.blad);
  geplaatst.forEach((g, i) => { snedes[i].isPlan = g.isPlan; });
  const dxf = schrijfDxf(bladLijnen(geplaatst), { ...opties.dxf, annotaties: annotaties(geplaatst, opties.annotatie) });

  return {
    dxf,
    verslag: {
      snedes,
      nietGetekend: [...nietGetekend].map(([ifcType, ids]) => ({ ifcType, aantal: ids.size }))
        .sort((a, b) => b.aantal - a.aantal),
      verborgenNietGeexporteerd: verborgenGeteld.size,
      geometrie: geometrieUitDiagnose(opties.diagnose),
      waarschuwingen,
      rekentijdMs: performance.now() - t0,
    },
  };
}
