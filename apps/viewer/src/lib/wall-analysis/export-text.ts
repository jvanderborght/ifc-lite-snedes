/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Text exports of the wall-analysis table: CSV, plain text and a
 * self-contained HTML report (definitions and settings included).
 *
 * CSV is written for Excel in a Belgian/Dutch locale: `;` between fields,
 * decimal comma, UTF-8 BOM so Excel does not read the file as ANSI, CRLF
 * line ends. Percentages are written as percent NUMBERS (11,7), not
 * fractions, so the column reads the same as on screen. Free text (wall
 * names, notes) goes through the shared formula guard (CWE-1236); numbers are
 * exempt so a negative value stays a number.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import type { Cell } from './columns';
import { formatCell, type WallTable } from './table';

const text = (table: WallTable, v: Cell, i: number, decimal: string): string =>
  formatCell(v, table.columns[i].kind, decimal, table.notDeterminable);

export function toCsv(table: WallTable): string {
  const line = (cells: Cell[]): string => cells
    .map((v, i) => escapeCsvCell(text(table, v, i, ','), { delimiter: ';', exemptNumbers: typeof v === 'number' }))
    .join(';');
  const out = [table.columns.map((c) => escapeCsvCell(c.label, { delimiter: ';' })).join(';')];
  for (const row of table.rows) out.push(line(row));
  out.push(line(table.total));
  return `﻿${out.join('\r\n')}\r\n`;
}

/** Monospace plain text: text columns left-aligned, numbers right-aligned. */
export function toTxt(table: WallTable, decimal: string): string {
  const cells = [table.columns.map((c) => c.label), ...[...table.rows, table.total].map((r) => r.map((v, i) => text(table, v, i, decimal)))];
  const widths = table.columns.map((_, i) => Math.max(...cells.map((r) => r[i].length)));
  const render = (r: string[]): string => r
    .map((s, i) => (table.columns[i].kind === 'text' ? s.padEnd(widths[i]) : s.padStart(widths[i])))
    .join('  ')
    .trimEnd();
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = [render(cells[0]), rule, ...cells.slice(1, -1).map(render), rule, render(cells[cells.length - 1])];
  const list = (items: string[]): string[] => items.map((d) => `- ${d}`);
  return [table.title, table.subtitle, ...list(table.settings), '', ...body, '', `${table.definitionsTitle}:`, ...list(table.definitions), ''].join('\r\n');
}

const escapeHtml = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Self-contained HTML report (inline CSS, no scripts, prints on A4 landscape). */
export function toHtml(table: WallTable, decimal: string, lang: string): string {
  const cls = (i: number): string => (table.columns[i].kind === 'text' ? 't' : 'n');
  const th = table.columns.map((c, i) => `<th class="${cls(i)}">${escapeHtml(c.label)}</th>`).join('');
  const tr = (r: Cell[], rowClass = ''): string => `<tr${rowClass ? ` class="${rowClass}"` : ''}>${r
    .map((v, i) => `<td class="${cls(i)}">${escapeHtml(text(table, v, i, decimal))}</td>`)
    .join('')}</tr>`;
  const li = (items: string[]): string => items.map((d) => `<li>${escapeHtml(d)}</li>`).join('');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font:12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1e293b;margin:24px}
h1{font-size:18px;margin:0 0 2px}p.sub{color:#64748b;margin:0 0 6px}ul.set{margin:0 0 16px;color:#475569}
table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #e2e8f0;padding:4px 6px;white-space:nowrap}
th{background:#334155;color:#fff;font-weight:600;position:sticky;top:0}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}td.t,th.t{text-align:left}
tr:nth-child(even) td{background:#f8fafc}
tr.total td{font-weight:700;border-top:2px double #334155;background:#fff}
h2{font-size:14px;margin:20px 0 6px}ul.def{margin:0;padding-left:18px;color:#334155}
</style></head><body>
<h1>${escapeHtml(table.title)}</h1><p class="sub">${escapeHtml(table.subtitle)}</p>
<ul class="set">${li(table.settings)}</ul>
<table><thead><tr>${th}</tr></thead><tbody>
${table.rows.map((r) => tr(r)).join('\n')}
${tr(table.total, 'total')}
</tbody></table>
<h2>${escapeHtml(table.definitionsTitle)}</h2><ul class="def">${li(table.definitions)}</ul>
</body></html>
`;
}
