/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { NprResult } from '@ifc-lite/hout-percentage';
import type { WallAreaResult } from '@ifc-lite/wand-oppervlak';
import { allColumns, isNd, type WallAnalysisRow } from './columns';
import { toCsv, toHtml, toTxt } from './export-text';
import { buildWallTable, formatCell, type WallTableLabels } from './table';
import { toXlsx } from './xlsx';

const areas = (aCon: number, aB: number) => ({ aCon, aB, aA: aCon - aB, fraction: aCon > 0 ? aB / aCon : null });

function npr(aCon: number, aB: number, raveling = 0, status: NprResult['status'] = 'ok'): NprResult {
  return {
    ...areas(aCon, aB), status, source: status === 'ok' ? 'authored' : null, frameParts: 10, timberParts: 10, partsWithoutGeometry: 0,
    outlineArea: aCon + 1, openingArea: 1, openingCount: 1, ravelingArea: raveling, ravelingExcluded: areas(aCon - raveling, aB - raveling),
  };
}

function area(net: number): WallAreaResult {
  return {
    source: 'authored', wallId: 1, name: 'x', globalId: 'SECRET-GLOBAL-ID', ifcType: 'IfcWall', parentWallId: null, partsCounted: 3, partsWithoutGeometry: 0,
    foilsLeftOut: 0, openingCount: 0, openingsWithGeometry: 0, holeCount: 0, length: 5, height: 2.7, thickness: 0.3,
    grossArea: net + 1, netArea: net, openingArea: 1, isRectangular: true, sidePlusArea: null, sideMinusArea: null, zoneAreas: [],
    declared: { grossSideArea: null, netSideArea: null, quantitySet: null, dimensionsLength: null, dimensionsHeight: null },
  };
}

function row(name: string, over: Partial<WallAnalysisRow> = {}): WallAnalysisRow {
  return { modelId: 'm', modelName: 'model.ifc', wallId: 1, name, ifcType: 'IfcWall', nested: false, area: area(12), npr: npr(15.44, 1.8), timber: null, ...over };
}

const labels = (columns: string[]): WallTableLabels => ({
  title: 'Wall analysis', subtitle: 'sub', columns: Object.fromEntries(columns.map((c) => [c, `col ${c}`])), notesHeader: 'Notes',
  totalLabel: 'Total', notDeterminable: 'n.b.', definitionsTitle: 'Definitions', definitions: ['A_con: outline minus openings', 'NPR 2068'], settings: ['raveling included'],
});

function table(rows: WallAnalysisRow[], excludeRaveling = false, notes: string[] = []) {
  const cols = allColumns({ excludeRaveling, more: false, multiModel: false });
  return buildWallTable(rows, cols, labels(cols.map((c) => c.id)), notes);
}

const col = (t: ReturnType<typeof table>, id: string): number => t.columns.findIndex((c) => c.id === id);

describe('wall-analysis table', () => {
  it('puts the NPR timber fraction first after the wall name, with A_con, A_a and A_b', () => {
    const t = table([row('W1')]);
    assert.deepStrictEqual(t.columns.slice(0, 5).map((c) => c.id), ['wall', 'timber.npr', 'timber.aCon', 'timber.aA', 'timber.aB']);
    assert.strictEqual(formatCell(t.rows[0][1], 'pct', ',', 'n.b.'), '11,7');
    assert.strictEqual(formatCell(t.rows[0][2], 'm2', ',', 'n.b.'), '15,44');
  });

  it('totals: areas summed, the fraction as sum over sum, nested and n.b. walls left out', () => {
    const rows = [
      row('W1', { npr: npr(10, 1) }),
      row('W2', { npr: npr(30, 9) }),
      row('R1', { npr: npr(0, 0, 0, 'noZones') }),
      row('N', { nested: true, npr: npr(100, 100) }),
    ];
    const t = table(rows);
    assert.ok(isNd(t.rows[2][col(t, 'timber.npr')]));
    assert.strictEqual(t.total[col(t, 'timber.aCon')], 40);
    assert.strictEqual(t.total[col(t, 'timber.npr')], 10 / 40); // 25 %, not the mean 20 %
    assert.strictEqual(t.total[0], 'Total');
    assert.strictEqual(t.total[col(t, 'area.netArea')], 36); // three walls, nested one left out
  });

  it('a model without zones gives n.b. in every timber column and in the total, but keeps its wall areas', () => {
    const t = table([row('R1', { npr: npr(0, 0, 0, 'noZones') }), row('R2', { npr: npr(0, 0, 0, 'noZones') })]);
    for (const id of ['timber.npr', 'timber.aCon', 'timber.aB']) {
      assert.ok(isNd(t.rows[0][col(t, id)]), id);
      assert.ok(isNd(t.total[col(t, id)]), `${id} total`);
    }
    assert.strictEqual(t.total[col(t, 'area.netArea')], 24);
  });

  it('the raveling switch takes the strip out of A_con and A_b', () => {
    const t = table([row('W1', { npr: npr(15.44, 1.8, 0.36) })], true);
    assert.strictEqual(formatCell(t.rows[0][col(t, 'timber.aCon')], 'm2', ',', ''), '15,08');
    assert.strictEqual(formatCell(t.rows[0][col(t, 'timber.aB')], 'm2', ',', ''), '1,44');
  });

  it('CSV for Belgian Excel: BOM, semicolons, decimal comma, CRLF, formula guard on names', () => {
    const csv = toCsv(table([row('=HYPERLINK("x")'), row('W2')], false, ['', 'note']));
    assert.ok(csv.startsWith('﻿'));
    const lines = csv.slice(1).split('\r\n');
    assert.strictEqual(lines[0].split(';')[1], 'col timber.npr');
    assert.ok(lines[1].startsWith("'=HYPERLINK") || lines[1].startsWith('"\'=HYPERLINK'), lines[1]);
    assert.ok(lines[2].split(';').includes('11,7'));
    assert.ok(lines[2].split(';').includes('15,44'));
    assert.strictEqual(lines[3].split(';')[0], 'Total');
    assert.ok(!csv.includes('SECRET-GLOBAL-ID'));
  });

  it('HTML report carries the settings, the definitions and the NPR reference; no GlobalId anywhere', async () => {
    const t = table([row('W<1>')]);
    const html = toHtml(t, ',', 'nl');
    assert.ok(html.includes('W&lt;1&gt;'));
    assert.ok(html.includes('NPR 2068'));
    assert.ok(html.includes('raveling included'));
    assert.ok(!html.includes('SECRET-GLOBAL-ID'));
    const txt = toTxt(t, ',');
    assert.ok(txt.includes('11,7') && txt.includes('Definitions:'));
    const blob = await toXlsx(t);
    assert.ok(blob.size > 1000);
  });

  it('formats n.b., hides float noise like -0.00, and shows mm in millimetres', () => {
    assert.strictEqual(formatCell(-1e-9, 'm2', ',', 'n.b.'), '0,00');
    assert.strictEqual(formatCell(0.24, 'mm', ',', ''), '240');
    assert.strictEqual(formatCell(null, 'm2', ',', 'n.b.'), '');
  });
});
