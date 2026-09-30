/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Excel workbook of the wall-analysis table. Uses `exceljs`, which the viewer
 * already ships for the Lists export and loads as a lazy chunk, so this adds
 * no dependency and nothing to the first-paint bundle.
 *
 * Unlike CSV, a workbook carries real numbers with a number format, so it
 * opens correctly in every Excel locale: percentages are stored as fractions
 * with a `0.0%` format, areas with `0.00`. "Not determinable" cells are text.
 */

import { neutralizeSpreadsheetFormula } from '@/lib/lists/export/model';
import { isNd, type Cell, type CellKind } from './columns';
import type { WallTable } from './table';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const NUM_FMT: Record<CellKind, string | undefined> = {
  text: undefined, int: '0', m: '0.000', mm: '0', m2: '0.00', m3: '0.000', pct: '0.0%',
};

export async function toXlsx(table: WallTable): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IFC-Lite';
  const ws = wb.addWorksheet(table.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 + table.settings.length }] });

  ws.addRow([neutralizeSpreadsheetFormula(table.title)]).font = { bold: true, size: 14 };
  ws.addRow([neutralizeSpreadsheetFormula(table.subtitle)]).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
  for (const s of table.settings) ws.addRow([neutralizeSpreadsheetFormula(s)]).font = { size: 9, color: { argb: 'FF475569' } };
  const header = ws.addRow(table.columns.map((c) => neutralizeSpreadsheetFormula(c.label)));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; });

  table.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(10, Math.min(c.kind === 'text' ? 40 : 24, c.label.length + 2));
    const fmt = NUM_FMT[c.kind];
    if (fmt) col.numFmt = fmt;
  });

  const values = (r: Cell[]) => r.map((v, i) => {
    if (isNd(v)) return table.notDeterminable;
    if (typeof v === 'string') return neutralizeSpreadsheetFormula(v);
    // The mm column is displayed in millimetres; store it that way too.
    return typeof v === 'number' && table.columns[i].kind === 'mm' ? v * 1000 : v;
  });
  for (const r of table.rows) ws.addRow(values(r));
  const total = ws.addRow(values(table.total));
  total.font = { bold: true };
  total.eachCell((cell) => { cell.border = { top: { style: 'double', color: { argb: 'FF334155' } } }; });

  const defs = wb.addWorksheet(table.definitionsTitle.slice(0, 31));
  defs.getColumn(1).width = 120;
  defs.addRow([neutralizeSpreadsheetFormula(table.definitionsTitle)]).font = { bold: true };
  for (const d of table.definitions) defs.addRow([neutralizeSpreadsheetFormula(d)]).alignment = { wrapText: true };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: XLSX_MIME });
}
