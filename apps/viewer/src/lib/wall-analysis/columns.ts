/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The wall-analysis table: one row per wall, and a column contract that each
 * module fills in for its own per-wall result. The timber module
 * (`@ifc-lite/hout-percentage`) and the wall-area module
 * (`@ifc-lite/wand-oppervlak`) each offer a list of columns; the table,
 * the panel and every export are built from those lists alone.
 *
 * A column says how its total row is formed: a plain sum, no total, or a
 * ratio of two per-row sums (percentages are sum over sum, never a mean of
 * percentages). A cell can be "not determinable" (`ND`): the module cannot
 * produce a number for that wall (e.g. no zone information), which is shown
 * as such instead of a blank or a zero, and never enters a total.
 *
 * Labels are translation keys; the render side translates them.
 */

import type { NprResult, WallResult } from '@ifc-lite/hout-percentage';
import { WALL_AREA_COLUMNS, type WallAreaResult } from '@ifc-lite/wand-oppervlak';
import type { TranslationKey } from '@/i18n/en';
import type { WallKind, WallKindSource } from './kind';

export type CellKind = 'text' | 'int' | 'm' | 'mm' | 'm2' | 'm3' | 'pct';

/** "Not determinable" marker. */
export const ND: { readonly notDeterminable: true } = Object.freeze({ notDeterminable: true as const });
export type Cell = string | number | null | typeof ND;
export const isNd = (c: Cell): c is typeof ND => c === ND;

export interface WallAnalysisRow {
  modelId: string;
  modelName: string;
  wallId: number;
  name: string;
  ifcType: string;
  /** A wall aggregated by another wall: listed, but left out of every total. */
  nested: boolean;
  /** Exterior, interior, party wall, floor or roof (`kind.ts`), for filtering. */
  kind: WallKind;
  kindSource: WallKindSource;
  area: WallAreaResult | null;
  npr: NprResult;
  /** The comparison variants; null when the wall has no frame-zone timber. */
  timber: WallResult | null;
}

type Value = number | string | null | typeof ND;

export type ColumnTotal =
  | 'sum'
  | 'none'
  | { ratio: { num(row: WallAnalysisRow): number | null; den(row: WallAnalysisRow): number | null } };

export interface WallAnalysisColumn {
  id: string;
  labelKey: TranslationKey;
  /** Shown after the label, e.g. `m²`. */
  unit: '' | 'm' | 'mm' | 'm²' | 'm³' | '%';
  kind: CellKind;
  total: ColumnTotal;
  /** `primary` columns are always shown; `more` only with "more columns". */
  tier: 'primary' | 'more';
  value(row: WallAnalysisRow): Value;
}

export interface TimberColumnOptions {
  /** Take the raveling strip (≤ 40 mm next to window and door openings) out of A_con and A_b. */
  excludeRaveling: boolean;
}

// ---- timber module -------------------------------------------------------

const nprAreas = (r: WallAnalysisRow, o: TimberColumnOptions) => (o.excludeRaveling ? r.npr.ravelingExcluded : r.npr);
const nprOk = (r: WallAnalysisRow): boolean => r.npr.status === 'ok';

function nprColumn(id: string, labelKey: TranslationKey, unit: WallAnalysisColumn['unit'], kind: CellKind, tier: WallAnalysisColumn['tier'], total: ColumnTotal, pick: (r: WallAnalysisRow) => number | null): WallAnalysisColumn {
  return { id, labelKey, unit, kind, tier, total, value: (r) => (nprOk(r) ? pick(r) : ND) };
}

type Q = WallResult;
const env = (q: Q): number => q.envelopeArea;
const net = (q: Q): number => q.envelopeArea - q.openingArea;
/** Numerator and denominator per comparison variant, so the total is sum over sum (as `totalOf` in the timber module). */
const VARIANT_PARTS: Record<keyof WallResult['variants'], [(q: Q) => number, (q: Q) => number]> = {
  volumeGross: [(q) => q.timberVolume, (q) => env(q) * q.thickness],
  volumeNet: [(q) => q.timberVolume, (q) => net(q) * q.thickness],
  volumeGrossAuthored: [(q) => q.timberVolumeAuthored, (q) => env(q) * q.thickness],
  volumeNetAuthored: [(q) => q.timberVolumeAuthored, (q) => net(q) * q.thickness],
  sectionGross: [(q) => q.midSectionArea, env],
  sectionNet: [(q) => q.midSectionAreaOutsideOpenings, net],
  projectedGross: [(q) => q.projectedArea, env],
  unionVolumeGross: [(q) => q.timberUnionVolume, (q) => env(q) * q.thickness],
};

export function timberColumns(o: TimberColumnOptions): WallAnalysisColumn[] {
  const fraction: ColumnTotal = { ratio: { num: (r) => (nprOk(r) ? nprAreas(r, o).aB : null), den: (r) => (nprOk(r) ? nprAreas(r, o).aCon : null) } };
  const variants = (Object.keys(VARIANT_PARTS) as Array<keyof WallResult['variants']>).map((v): WallAnalysisColumn => {
    const [num, den] = VARIANT_PARTS[v];
    return {
      id: `timber.${v}`, labelKey: `wallAnalysis.col.variant.${v}`, unit: '%', kind: 'pct', tier: 'more',
      total: { ratio: { num: (r) => (r.timber && r.timber.variants[v] !== null ? num(r.timber) : null), den: (r) => (r.timber && r.timber.variants[v] !== null ? den(r.timber) : null) } },
      value: (r) => (r.timber ? r.timber.variants[v] : ND),
    };
  });
  return [
    nprColumn('timber.npr', 'wallAnalysis.col.nprFraction', '%', 'pct', 'primary', fraction, (r) => nprAreas(r, o).fraction),
    nprColumn('timber.aCon', 'wallAnalysis.col.aCon', 'm²', 'm2', 'primary', 'sum', (r) => nprAreas(r, o).aCon),
    nprColumn('timber.aA', 'wallAnalysis.col.aA', 'm²', 'm2', 'primary', 'sum', (r) => nprAreas(r, o).aA),
    nprColumn('timber.aB', 'wallAnalysis.col.aB', 'm²', 'm2', 'primary', 'sum', (r) => nprAreas(r, o).aB),
    nprColumn('timber.frameOpenings', 'wallAnalysis.col.frameOpenings', 'm²', 'm2', 'more', 'sum', (r) => r.npr.openingArea),
    nprColumn('timber.raveling', 'wallAnalysis.col.raveling', 'm²', 'm2', 'more', 'sum', (r) => r.npr.ravelingArea),
    {
      id: 'timber.volume', labelKey: 'wallAnalysis.col.timberVolumeAuthored', unit: 'm³', kind: 'm3', tier: 'more', total: 'sum',
      value: (r) => (r.timber ? (r.timber.variants.volumeGrossAuthored === null ? null : r.timber.timberVolumeAuthored) : ND),
    },
    ...variants,
  ];
}

// ---- wall-area module ----------------------------------------------------

/** Wall-area columns shown without "more columns"; the module offers the rest too. */
const AREA_PRIMARY = new Set(['length', 'height', 'grossArea', 'openingArea', 'netArea']);

/** The columns `@ifc-lite/wand-oppervlak` offers, in its own order and with its own totals. */
export function areaColumns(): WallAnalysisColumn[] {
  return WALL_AREA_COLUMNS.map((c) => ({
    id: `area.${c.id}`,
    labelKey: `wallAnalysis.col.area.${c.id}` as TranslationKey,
    unit: c.unit, kind: c.unit === 'm²' ? 'm2' : c.unit === 'm' ? 'm' : 'text',
    total: c.total, tier: AREA_PRIMARY.has(c.id) ? 'primary' : 'more',
    value: (r) => (r.area && r.area.partsCounted > 0 ? c.value(r.area) : ND),
  }));
}

// ---- the wall itself -----------------------------------------------------

/** `kindLabel` (render side, translated) adds the kind column after the wall name. */
export function wallColumns(multiModel: boolean, kindLabel?: (kind: WallKind) => string): WallAnalysisColumn[] {
  const text = (id: string, labelKey: TranslationKey, value: (r: WallAnalysisRow) => string): WallAnalysisColumn =>
    ({ id, labelKey, unit: '', kind: 'text', total: 'none', tier: 'primary', value });
  return [
    ...(multiModel ? [text('model', 'wallAnalysis.col.model', (r) => r.modelName)] : []),
    text('wall', 'wallAnalysis.col.wall', (r) => r.name),
    ...(kindLabel ? [text('kind', 'wallAnalysis.col.kind', (r) => kindLabel(r.kind))] : []),
  ];
}

/** All columns in display order: the wall, timber, area; `more` columns only when asked. */
export function allColumns(options: TimberColumnOptions & { multiModel: boolean; more: boolean; kindLabel?: (kind: WallKind) => string }): WallAnalysisColumn[] {
  const cols = [...wallColumns(options.multiModel, options.kindLabel), ...timberColumns(options), ...areaColumns()];
  return options.more ? cols : cols.filter((c) => c.tier === 'primary');
}
