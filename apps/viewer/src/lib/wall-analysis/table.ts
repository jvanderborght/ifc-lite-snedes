/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The wall-analysis table as plain data: header, one row of cells per wall,
 * and the total row, all derived from the column list (`columns.ts`). One
 * table feeds the panel and every export, so the screen and a spreadsheet can
 * only disagree if they were produced at different times.
 *
 * Labels arrive translated (`WallTableLabels`); this module never calls `t()`.
 *
 * Display precision follows NPR 2068 for areas and the timber fraction: m² on
 * two decimals, percentages on one. Values are kept unrounded in the cells,
 * so the total is formed from unrounded numbers.
 */

import { isNd, ND, type Cell, type CellKind, type WallAnalysisColumn, type WallAnalysisRow } from './columns';

export interface WallTableColumn { id: string; label: string; kind: CellKind }

export interface WallTableLabels {
  title: string;
  subtitle: string;
  /** Header text per column id (label with unit). */
  columns: Record<string, string>;
  notesHeader: string;
  totalLabel: string;
  notDeterminable: string;
  definitionsTitle: string;
  definitions: string[];
  /** Settings the numbers depend on (raveling on or off, ...), one line each. */
  settings: string[];
}

export interface WallTable {
  title: string;
  subtitle: string;
  definitionsTitle: string;
  definitions: string[];
  settings: string[];
  notDeterminable: string;
  columns: WallTableColumn[];
  rows: Cell[][];
  total: Cell[];
}

const DECIMALS: Record<CellKind, number> = { text: 0, int: 0, m: 3, mm: 0, m2: 2, m3: 3, pct: 1 };

function totalOf(col: WallAnalysisColumn, rows: readonly WallAnalysisRow[]): Cell {
  if (col.total === 'none') return col.kind === 'text' ? '' : null;
  if (col.total === 'sum') {
    let sum = 0, any = false;
    for (const r of rows) {
      const v = col.value(r);
      if (typeof v === 'number' && Number.isFinite(v)) { sum += v; any = true; }
    }
    return any ? sum : rows.some((r) => isNd(col.value(r))) ? ND : null;
  }
  let num = 0, den = 0;
  for (const r of rows) {
    const n = col.total.ratio.num(r), d = col.total.ratio.den(r);
    if (n === null || d === null || !Number.isFinite(n) || !Number.isFinite(d)) continue;
    num += n; den += d;
  }
  if (den > 1e-12) return num / den;
  return rows.some((r) => isNd(col.value(r))) ? ND : null;
}

/**
 * @param notes already-translated notes per row (same order as `rows`), shown
 *   in a last column when any row has one.
 */
export function buildWallTable(rows: readonly WallAnalysisRow[], columns: readonly WallAnalysisColumn[], labels: WallTableLabels, notes: readonly string[] = []): WallTable {
  const withNotes = notes.some((n) => n.length > 0);
  const header: WallTableColumn[] = columns.map((c) => ({ id: c.id, label: labels.columns[c.id] ?? c.id, kind: c.kind }));
  if (withNotes) header.push({ id: 'notes', label: labels.notesHeader, kind: 'text' });
  const cells = rows.map((r, i) => {
    const line: Cell[] = columns.map((c) => c.value(r));
    if (withNotes) line.push(notes[i] ?? '');
    return line;
  });
  const counted = rows.filter((r) => !r.nested);
  const total: Cell[] = columns.map((c) => totalOf(c, counted));
  const firstText = columns.findIndex((c) => c.kind === 'text');
  if (firstText >= 0) total[firstText] = labels.totalLabel;
  if (withNotes) total.push('');
  return {
    title: labels.title, subtitle: labels.subtitle, definitionsTitle: labels.definitionsTitle, definitions: labels.definitions,
    settings: labels.settings, notDeterminable: labels.notDeterminable, columns: header, rows: cells, total,
  };
}

/** Display text of one cell; `decimal` is the decimal separator to use. */
export function formatCell(value: Cell, kind: CellKind, decimal: string, notDeterminable: string): string {
  if (value === null || value === undefined) return '';
  if (isNd(value)) return notDeterminable;
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '';
  const n = kind === 'pct' ? value * 100 : kind === 'mm' ? value * 1000 : value;
  const s = n.toFixed(DECIMALS[kind]);
  // `-0.00` after rounding a tiny negative (float noise in A_a) reads as a real value.
  const clean = /^-0([.,]0*)?$/.test(s) ? s.slice(1) : s;
  return decimal === '.' ? clean : clean.replace('.', decimal);
}
