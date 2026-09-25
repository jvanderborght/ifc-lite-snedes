/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VARIANT_IDS, type WallResult } from '@ifc-lite/hout-percentage';
import { buildTimberTable, formatCell, toCsv, toHtml, toTxt, type ColumnKey, type TimberLabels } from './table';
import { toXlsx } from './xlsx';

function wall(name: string, over: Partial<WallResult> = {}): WallResult {
  return {
    wallId: 1, name, globalId: 'gid', ifcType: 'IfcWall', memberCount: 5,
    membersWithoutGeometry: [], openMembers: [], membersWithoutAuthoredVolume: [],
    openingCount: 0, openingsUsed: 0, fullThickness: 0.24, sectionRowsRepaired: 0,
    timberVolume: 0.1, timberVolumeAuthored: 0.11, timberUnionVolume: 0.1,
    midSectionArea: 0.4, midSectionAreaOutsideOpenings: 0.4, projectedArea: 0.4,
    length: 1.2, height: 2.5, thickness: 0.24, envelopeArea: 3, openingArea: 0,
    variants: { volumeGross: 0.1389, volumeNet: 0.1389, volumeGrossAuthored: 0.1528, volumeNetAuthored: 0.1528, sectionGross: 0.1333, sectionNet: 0.1333, projectedGross: 0.1333, unionVolumeGross: 0.1389 },
    ...over,
  };
}

const columns = Object.fromEntries(
  (['model', 'wall', 'members', 'length', 'height', 'thickness', 'openingArea', 'timberVolume', 'timberVolumeAuthored', 'notes', ...VARIANT_IDS] as ColumnKey[])
    .map((k) => [k, `col ${k}`]),
) as Record<ColumnKey, string>;
const labels: TimberLabels = { title: 'Title', subtitle: 'Sub', definitionsTitle: 'Defs', columns, definitions: ['d1'], totalLabel: 'Total' };

describe('timber table exports', () => {
  it('writes CSV for Belgian Excel: BOM, semicolons, decimal comma, CRLF', () => {
    const csv = toCsv(buildTimberTable([{ modelName: 'm', wall: wall('W1'), notes: '' }], labels));
    assert.ok(csv.startsWith('﻿'));
    const lines = csv.slice(1).split('\r\n');
    assert.strictEqual(lines[0].split(';')[0], 'col wall');
    const row = lines[1].split(';');
    assert.strictEqual(row[0], 'W1');
    assert.strictEqual(row[2], '1,200'); // length in m
    assert.ok(row.includes('13,89')); // volume gross in percent
    assert.strictEqual(lines[2].split(';')[0], 'Total');
  });

  it('neutralises a formula-looking wall name in CSV and quotes a semicolon', () => {
    const csv = toCsv(buildTimberTable([{ modelName: 'm', wall: wall('=HYPERLINK("x")'), notes: 'a; b' }], labels));
    const row = csv.split('\r\n')[1];
    assert.ok(row.startsWith(`"'=HYPERLINK(""x"")"`), row);
    assert.ok(row.endsWith('"a; b"'), row);
  });

  it('adds a model column only when several models are listed', () => {
    const one = buildTimberTable([{ modelName: 'a', wall: wall('W1'), notes: '' }], labels);
    const two = buildTimberTable([{ modelName: 'a', wall: wall('W1'), notes: '' }, { modelName: 'b', wall: wall('W2'), notes: '' }], labels);
    assert.strictEqual(one.columns[0].key, 'wall');
    assert.strictEqual(two.columns[0].key, 'model');
  });

  it('totals as sum over sum', () => {
    const t = buildTimberTable([{ modelName: 'a', wall: wall('W1'), notes: '' }, { modelName: 'a', wall: wall('W2', { timberVolume: 0.3 }), notes: '' }], labels);
    const i = t.columns.findIndex((c) => c.key === 'volumeGross');
    assert.ok(Math.abs((t.total[i] as number) - 0.4 / (2 * 3 * 0.24)) < 1e-12);
  });

  it('escapes HTML and aligns plain text', () => {
    const table = buildTimberTable([{ modelName: 'm', wall: wall('<b>W1</b>'), notes: '' }], labels);
    const html = toHtml(table, ',', 'nl');
    assert.ok(html.includes('&lt;b&gt;W1&lt;/b&gt;'));
    assert.ok(!html.includes('<b>W1'));
    assert.ok(html.includes('<html lang="nl">'));
    const txt = toTxt(table, '.').split('\r\n');
    assert.strictEqual(txt[0], 'Title');
    assert.ok(txt.some((l) => l.startsWith('<b>W1</b>')));
  });

  it('formats cells per kind', () => {
    assert.strictEqual(formatCell(0.16924, 'pct', ','), '16,92');
    assert.strictEqual(formatCell(240, 'mm', '.'), '240.0');
    assert.strictEqual(formatCell(null, 'm3', ','), '');
  });

  it('writes an xlsx workbook', async () => {
    const blob = await toXlsx(buildTimberTable([{ modelName: 'm', wall: wall('W1'), notes: '' }], labels));
    const head = new Uint8Array(await blob.arrayBuffer()).subarray(0, 2);
    assert.deepStrictEqual([...head], [0x50, 0x4b]); // zip container
  });
});
