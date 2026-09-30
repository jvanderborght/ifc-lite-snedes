/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Translated labels, notes and definitions for the wall-analysis table.
 * Lives next to the panel (the render side) because `lib/wall-analysis/`
 * must not call `t()` itself.
 */

import type { TranslationKey } from '@/i18n/en';
import type { TranslationParameters } from '@/i18n/types';
import type { WallAnalysisColumn, WallAnalysisRow } from '@/lib/wall-analysis/columns';
import { buildWallTable, type WallTable } from '@/lib/wall-analysis/table';

type T = (key: TranslationKey, params?: TranslationParameters) => string;

export function rowNotes(t: T, r: WallAnalysisRow): string {
  const notes: string[] = [];
  if (r.npr.status === 'noZones') notes.push(r.partsNotInWall ? t('wallAnalysis.note.partsNotInWall') : t('wallAnalysis.note.noZones'));
  if (r.npr.status === 'noFrame') notes.push(t('wallAnalysis.note.noFrame'));
  if (r.npr.status === 'noGeometry') notes.push(t('wallAnalysis.note.noGeometry'));
  if (r.npr.status === 'ok' && r.npr.source === 'mesh') notes.push(t('wallAnalysis.note.meshSource'));
  if (r.npr.partsWithoutGeometry > 0) notes.push(t('wallAnalysis.note.partsWithoutGeometry', { count: r.npr.partsWithoutGeometry }));
  if (!r.area || r.area.partsCounted === 0) notes.push(t('wallAnalysis.note.noAreaGeometry'));
  if (r.nested) notes.push(t('wallAnalysis.note.nested'));
  if (r.kindSource === 'isExternal') notes.push(t('wallAnalysis.note.kindFromIsExternal'));
  if (r.kindSource === 'none') notes.push(t('wallAnalysis.note.kindUnknown'));
  return notes.join('; ');
}

export interface TableOptions {
  excludeRaveling: boolean;
  more: boolean;
  dateText: string;
  /** The active row filter in words, for the report settings; empty when all rows are shown. */
  filter: readonly string[];
}

export function wallAnalysisTable(t: T, rows: readonly WallAnalysisRow[], columns: readonly WallAnalysisColumn[], o: TableOptions): WallTable {
  const models = [...new Set(rows.map((r) => r.modelName))].join(', ');
  const counted = rows.filter((r) => !r.nested).length;
  const definitions = [
    t('wallAnalysis.definition.scope'),
    t('wallAnalysis.definition.kind'),
    t('wallAnalysis.definition.nprFraction'),
    t('wallAnalysis.definition.aCon'),
    t('wallAnalysis.definition.aB'),
    t('wallAnalysis.definition.aA'),
    t('wallAnalysis.definition.raveling'),
    t('wallAnalysis.definition.rounding'),
    t('wallAnalysis.definition.notDeterminable'),
    t('wallAnalysis.definition.areaGross'),
    t('wallAnalysis.definition.areaNet'),
    t('wallAnalysis.definition.areaOpenings'),
    ...(o.more ? [t('wallAnalysis.definition.areaSides'), t('wallAnalysis.definition.declared'), t('wallAnalysis.definition.variants')] : []),
    t('wallAnalysis.definition.totals'),
    t('wallAnalysis.definition.source'),
  ];
  return buildWallTable(rows, columns, {
    title: t('wallAnalysis.reportTitle'),
    subtitle: t('wallAnalysis.reportSubtitle', { model: models, date: o.dateText }),
    columns: Object.fromEntries(columns.map((c) => [c.id, t(c.labelKey)])),
    notesHeader: t('wallAnalysis.col.notes'),
    totalLabel: t('wallAnalysis.total', { count: counted }),
    notDeterminable: t('wallAnalysis.notDeterminable'),
    definitionsTitle: t('wallAnalysis.definitions'),
    definitions,
    settings: [
      o.excludeRaveling ? t('wallAnalysis.setting.ravelingExcluded') : t('wallAnalysis.setting.ravelingIncluded'),
      t('wallAnalysis.setting.provisional'),
      ...o.filter,
    ],
  }, rows.map((r) => rowNotes(t, r)));
}
