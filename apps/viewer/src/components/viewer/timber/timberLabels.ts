/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Translated labels and per-wall notes for the timber-fraction table. Lives
 * next to the panel (the render side) because `lib/timber/table.ts` must not
 * call `t()` itself.
 */

import { VARIANT_IDS, type WallResult } from '@ifc-lite/hout-percentage';
import type { TranslationKey } from '@/i18n/en';
import type { TranslationParameters } from '@/i18n/types';
import { buildTimberTable, type ColumnKey, type TimberRowInput, type TimberTable } from '@/lib/timber/table';
import type { TimberEntry } from './useTimberFraction';

type T = (key: TranslationKey, params?: TranslationParameters) => string;

const COLUMN_KEYS: Record<Exclude<ColumnKey, (typeof VARIANT_IDS)[number]>, TranslationKey> = {
  model: 'timberFraction.col.model',
  wall: 'timberFraction.col.wall',
  members: 'timberFraction.col.members',
  length: 'timberFraction.col.length',
  height: 'timberFraction.col.height',
  thickness: 'timberFraction.col.thickness',
  openingArea: 'timberFraction.col.openingArea',
  timberVolume: 'timberFraction.col.timberVolume',
  timberVolumeAuthored: 'timberFraction.col.timberVolumeAuthored',
  notes: 'timberFraction.col.notes',
};

export function wallNotes(t: T, w: WallResult): string {
  const notes: string[] = [];
  if (w.wallId < 0) notes.push(t('timberFraction.note.noParent'));
  if (w.openMembers.length) notes.push(t('timberFraction.note.openMesh', { count: w.openMembers.length }));
  if (w.membersWithoutGeometry.length) notes.push(t('timberFraction.note.noGeometry', { count: w.membersWithoutGeometry.length }));
  if (w.membersWithoutAuthoredVolume.length) notes.push(t('timberFraction.note.noBrep', { count: w.membersWithoutAuthoredVolume.length }));
  if (w.fullThickness - w.thickness > 1e-4) notes.push(t('timberFraction.note.deeper', { mm: (w.fullThickness * 1000).toFixed(0) }));
  return notes.join('; ');
}

export function timberTable(t: T, entries: readonly TimberEntry[], dateText: string): TimberTable {
  const columns = Object.fromEntries(Object.entries(COLUMN_KEYS).map(([k, key]) => [k, t(key)])) as Record<ColumnKey, string>;
  for (const v of VARIANT_IDS) columns[v] = t(`timberFraction.variant.${v}`);
  const models = [...new Set(entries.map((e) => e.modelName))].join(', ');
  const rows: TimberRowInput[] = entries.map((e) => ({ modelName: e.modelName, wall: e.wall, notes: wallNotes(t, e.wall) }));
  return buildTimberTable(rows, {
    title: t('timberFraction.reportTitle'),
    subtitle: t('timberFraction.reportSubtitle', { model: models, date: dateText }),
    definitionsTitle: t('timberFraction.definitions'),
    columns,
    definitions: [
      t('timberFraction.definition.envelope'),
      t('timberFraction.definition.openings'),
      ...VARIANT_IDS.map((v) => `${t(`timberFraction.variant.${v}`)}: ${t(`timberFraction.definition.${v}`)}`),
      t('timberFraction.definition.meshVsBrep'),
    ],
    totalLabel: t('timberFraction.total', { count: entries.filter((e) => e.wall.wallId >= 0).length }),
  });
}
