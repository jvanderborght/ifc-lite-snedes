/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The timber-fraction table as plain data, and its text exports (CSV, TXT,
 * HTML). One model feeds the panel and every export, so a spreadsheet and the
 * screen can only disagree if they were produced at different times.
 *
 * Labels arrive already translated (`TimberLabels`): this module never calls
 * `t()` itself (i18n brief: translate where rendered).
 *
 * Number formats: CSV is written for Excel in a Belgian/Dutch locale — `;`
 * between fields, decimal comma, UTF-8 BOM so Excel does not read the file as
 * ANSI, CRLF line ends. Percentages are written as percent NUMBERS (16,92),
 * not fractions, so the column reads the same as on screen.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import { totalOf, VARIANT_IDS, type VariantId, type WallResult } from '@ifc-lite/hout-percentage';

export type CellKind = 'text' | 'int' | 'm' | 'mm' | 'm2' | 'm3' | 'pct';
export type Cell = string | number | null;

export type ColumnKey =
  | 'model' | 'wall' | 'members' | 'length' | 'height' | 'thickness'
  | 'openingArea' | 'timberVolume' | 'timberVolumeAuthored' | VariantId | 'notes';

export interface TimberColumn { key: ColumnKey; label: string; kind: CellKind }

export interface TimberRowInput {
  modelName: string;
  wall: WallResult;
  /** Already-translated notes for this wall (open meshes, ...). */
  notes: string;
}

export interface TimberLabels {
  title: string;
  subtitle: string;
  definitionsTitle: string;
  columns: Record<ColumnKey, string>;
  definitions: string[];
  totalLabel: string;
}

export interface TimberTable {
  title: string;
  subtitle: string;
  definitionsTitle: string;
  definitions: string[];
  columns: TimberColumn[];
  rows: Cell[][];
  total: Cell[];
}

const KIND: Record<ColumnKey, CellKind> = {
  model: 'text', wall: 'text', members: 'int', length: 'm', height: 'm', thickness: 'mm',
  openingArea: 'm2', timberVolume: 'm3', timberVolumeAuthored: 'm3', notes: 'text',
  volumeGross: 'pct', volumeNet: 'pct', volumeGrossAuthored: 'pct', volumeNetAuthored: 'pct',
  sectionGross: 'pct', sectionNet: 'pct', projectedGross: 'pct', unionVolumeGross: 'pct',
};

const DECIMALS: Record<CellKind, number> = { text: 0, int: 0, m: 3, mm: 1, m2: 3, m3: 4, pct: 2 };

export function buildTimberTable(input: readonly TimberRowInput[], labels: TimberLabels): TimberTable {
  const multiModel = new Set(input.map((r) => r.modelName)).size > 1;
  const keys: ColumnKey[] = [
    ...(multiModel ? (['model'] as const) : []),
    'wall', 'members', 'length', 'height', 'thickness', 'openingArea', 'timberVolume', 'timberVolumeAuthored',
    ...VARIANT_IDS, 'notes',
  ];
  const columns = keys.map((key) => ({ key, label: labels.columns[key], kind: KIND[key] }));
  const valueOf = (r: TimberRowInput, key: ColumnKey): Cell => {
    const w = r.wall;
    switch (key) {
      case 'model': return r.modelName;
      case 'wall': return w.name;
      case 'members': return w.memberCount;
      case 'length': return w.length;
      case 'height': return w.height;
      case 'thickness': return w.thickness * 1000;
      case 'openingArea': return w.openingArea;
      case 'timberVolume': return w.timberVolume;
      case 'timberVolumeAuthored': return w.variants.volumeGrossAuthored === null ? null : w.timberVolumeAuthored;
      case 'notes': return r.notes;
      default: return w.variants[key];
    }
  };
  const rows = input.map((r) => keys.map((k) => valueOf(r, k)));
  // Walls only: the "no parent" bucket has no envelope of its own worth adding.
  const t = totalOf(input.filter((r) => r.wall.wallId >= 0).map((r) => r.wall));
  const total = keys.map((k): Cell => {
    switch (k) {
      case 'model': return '';
      case 'wall': return labels.totalLabel;
      case 'notes': case 'length': case 'height': return '';
      case 'members': return t.memberCount;
      case 'thickness': return null;
      case 'openingArea': return t.openingArea;
      case 'timberVolume': return t.timberVolume;
      case 'timberVolumeAuthored': return t.variants.volumeGrossAuthored === null ? null : t.timberVolumeAuthored;
      default: return t.variants[k];
    }
  });
  return { title: labels.title, subtitle: labels.subtitle, definitionsTitle: labels.definitionsTitle, definitions: labels.definitions, columns, rows, total };
}

/** Display text of one cell; `decimal` is the decimal separator to use. */
export function formatCell(value: Cell, kind: CellKind, decimal: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '';
  const n = kind === 'pct' ? value * 100 : value;
  const s = n.toFixed(DECIMALS[kind]);
  return decimal === '.' ? s : s.replace('.', decimal);
}

/** CSV for Excel in a nl-BE / nl-NL locale (see module doc). */
export function toCsv(table: TimberTable): string {
  const line = (cells: Cell[]): string => cells
    .map((v, i) => {
      const kind = table.columns[i].kind;
      const text = formatCell(v, kind, ',');
      // Numbers are exempt from the formula guard; free text (wall names, notes) is not.
      return escapeCsvCell(text, { delimiter: ';', exemptNumbers: typeof v === 'number' });
    })
    .join(';');
  const out = [table.columns.map((c) => escapeCsvCell(c.label, { delimiter: ';' })).join(';')];
  for (const row of table.rows) out.push(line(row));
  out.push(line(table.total));
  return `﻿${out.join('\r\n')}\r\n`;
}

/** Monospace plain text: text columns left-aligned, numbers right-aligned. */
export function toTxt(table: TimberTable, decimal: string): string {
  const cells = [table.columns.map((c) => c.label), ...[...table.rows, table.total].map((r) => r.map((v, i) => formatCell(v, table.columns[i].kind, decimal)))];
  const widths = table.columns.map((_, i) => Math.max(...cells.map((r) => r[i].length)));
  const render = (r: string[]): string => r
    .map((s, i) => (table.columns[i].kind === 'text' ? s.padEnd(widths[i]) : s.padStart(widths[i])))
    .join('  ')
    .trimEnd();
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = [render(cells[0]), rule, ...cells.slice(1, -1).map(render), rule, render(cells[cells.length - 1])];
  const defs = table.definitions.map((d) => `- ${d}`);
  return [table.title, table.subtitle, '', ...body, '', `${table.definitionsTitle}:`, ...defs, ''].join('\r\n');
}

const escapeHtml = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Self-contained HTML report (inline CSS, no scripts, prints on A4 landscape). */
export function toHtml(table: TimberTable, decimal: string, lang: string): string {
  const th = table.columns.map((c) => `<th class="${c.kind === 'text' ? 't' : 'n'}">${escapeHtml(c.label)}</th>`).join('');
  const tr = (r: Cell[], cls = ''): string => `<tr${cls ? ` class="${cls}"` : ''}>${r
    .map((v, i) => `<td class="${table.columns[i].kind === 'text' ? 't' : 'n'}">${escapeHtml(formatCell(v, table.columns[i].kind, decimal))}</td>`)
    .join('')}</tr>`;
  const defs = table.definitions.map((d) => `<li>${escapeHtml(d)}</li>`).join('');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1e293b;margin:24px}
h1{font-size:18px;margin:0 0 2px}p.sub{color:#64748b;margin:0 0 16px}
table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #e2e8f0;padding:4px 6px;white-space:nowrap}
th{background:#334155;color:#fff;font-weight:600;position:sticky;top:0}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}td.t,th.t{text-align:left}
tr:nth-child(even) td{background:#f8fafc}
tr.total td{font-weight:700;border-top:2px double #334155;background:#fff}
h2{font-size:14px;margin:20px 0 6px}ul{margin:0;padding-left:18px;color:#334155}
</style></head><body>
<h1>${escapeHtml(table.title)}</h1><p class="sub">${escapeHtml(table.subtitle)}</p>
<table><thead><tr>${th}</tr></thead><tbody>
${table.rows.map((r) => tr(r)).join('\n')}
${tr(table.total, 'total')}
</tbody></table>
<h2>${escapeHtml(table.definitionsTitle)}</h2><ul>${defs}</ul>
</body></html>
`;
}
