/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Export report: what went into the DXF per section, what was left out on
 * purpose, and where the model itself is unreliable (openings that could not
 * be cut, geometry ifc-lite could not build). Plain data, so the viewer can
 * render it and make element ids clickable; `verslagAlsTekst` for the CLI.
 */

import type { GeometryDiagnostics } from '@ifc-lite/geometry';
import type { LijnSoort } from './genereer.js';

export interface SnedeVerslag {
  naam: string;
  isPlan: boolean;
  diepte: number;
  /** Line segments per kind, after duplicate clipping, before chaining. */
  lijnen: Record<LijnSoort, number>;
  /** Elements the plane cuts. */
  gesneden: number;
  /**
   * Cut outlines that do not close (a sign of open or broken geometry),
   * largest gap first. `grootsteGat` in mm, Infinity for a lone open piece.
   */
  openSnedeomtrekken: { entityId: number; ifcType: string; grootsteGat: number }[];
  /** Length (mm) removed as duplicate lines, per kind. */
  weggeknipt: Record<LijnSoort, number>;
  rekentijdMs: number;
}

export interface ExportVerslag {
  snedes: SnedeVerslag[];
  /** Elements never drawn by design (openings, spaces, ...), per IFC class. */
  nietGetekend: { ifcType: string; aantal: number }[];
  /** Elements left out because they are hidden in the viewer. */
  verborgenNietGeexporteerd: number;
  /** From ifc-lite's geometry diagnostics, when supplied. */
  geometrie?: {
    /** Openings that failed to cut into a host they do overlap. */
    csgFouten: number;
    /**
     * Openings whose box does not even touch their host ("NoBoundsOverlap"):
     * nothing to cut, so no effect on the drawing. Counted apart so they do
     * not bury the real failures.
     */
    openingenBuitenElement: number;
    /** Hosts with openings that failed to cut; their cut can show a void as solid. */
    slechtsteElementen: { entityId: number; ifcType: string; openingen: number; fouten: number; reden?: string }[];
    /** Representation types ifc-lite could not build: these parts are missing from the drawing. */
    nietOndersteund: { ifcType: string; aantal: number }[];
  };
  waarschuwingen: string[];
  rekentijdMs: number;
}

const GEEN_OVERLAP = 'NoBoundsOverlap';

export function geometrieUitDiagnose(d: GeometryDiagnostics | undefined): ExportVerslag['geometrie'] {
  if (!d) return undefined;
  const buiten = d.failuresByReason.find((r) => r.reason === GEEN_OVERLAP)?.count ?? 0;
  return {
    csgFouten: d.totalCsgFailures - buiten,
    openingenBuitenElement: buiten,
    slechtsteElementen: d.worstHosts.filter((h) => h.csgFailures > 0 && h.firstFailureLabel !== GEEN_OVERLAP).map((h) => ({
      entityId: h.productId, ifcType: h.ifcType, openingen: h.openings, fouten: h.csgFailures, reden: h.firstFailureLabel,
    })),
    nietOndersteund: (d.unsupportedItemsByType ?? []).map((r) => ({ ifcType: r.reason, aantal: r.count })),
  };
}

// No gap wider than the weld tolerance: the outline branches (three pieces meet) rather than opens.
const gat = (v: number): string => (!Number.isFinite(v) ? 'los stuk' : v <= 0.1 ? 'vertakking'
  : `gat ${v < 1 ? v.toFixed(3) : v.toFixed(0)} mm`);
const mm = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(1)} m` : `${v.toFixed(0)} mm`);

/** Plain-text rendering (CLI, logs). */
export function verslagAlsTekst(v: ExportVerslag): string {
  const r: string[] = [`Exportverslag (${(v.rekentijdMs / 1000).toFixed(1)} s)`];
  for (const s of v.snedes) {
    r.push(`- ${s.naam}${s.isPlan ? ' (plan)' : ''}, kijkdiepte ${s.diepte} mm: ${s.gesneden} elementen gesneden; `
      + `lijnstukken snede ${s.lijnen.snede}, zicht ${s.lijnen.zicht}, verborgen ${s.lijnen.verborgen}; `
      + `dubbel weggeknipt: zicht ${mm(s.weggeknipt.zicht)}, verborgen ${mm(s.weggeknipt.verborgen)}; `
      + `${(s.rekentijdMs / 1000).toFixed(1)} s`);
    if (s.openSnedeomtrekken.length) {
      r.push(`    open snedeomtrek bij ${s.openSnedeomtrekken.length} element(en): `
        + s.openSnedeomtrekken.slice(0, 10).map((e) => `#${e.entityId} ${e.ifcType} (${gat(e.grootsteGat)})`).join(', ')
        + (s.openSnedeomtrekken.length > 10 ? ', ...' : ''));
    }
  }
  if (v.nietGetekend.length) {
    r.push(`Niet getekend (bewust): ${v.nietGetekend.map((n) => `${n.ifcType} ${n.aantal}`).join(', ')}`);
  }
  if (v.verborgenNietGeexporteerd) r.push(`Verborgen in de viewer, niet geëxporteerd: ${v.verborgenNietGeexporteerd} elementen`);
  const g = v.geometrie;
  if (g) {
    r.push(`Model: ${g.csgFouten} opening(en) niet uitgesneden`
      + (g.openingenBuitenElement ? ` (plus ${g.openingenBuitenElement} die hun element niet raken, zonder gevolg)` : ''));
    for (const e of g.slechtsteElementen) {
      r.push(`    #${e.entityId} ${e.ifcType}: ${e.fouten} van ${e.openingen} openingen mislukt${e.reden ? ` (${e.reden})` : ''}`);
    }
    if (g.nietOndersteund.length) {
      r.push(`Model: geometrie niet opgebouwd (ontbreekt in de tekening): ${g.nietOndersteund.map((n) => `${n.ifcType} ${n.aantal}`).join(', ')}`);
    }
  }
  for (const w of v.waarschuwingen) r.push(`Let op: ${w}`);
  return r.join('\n');
}
