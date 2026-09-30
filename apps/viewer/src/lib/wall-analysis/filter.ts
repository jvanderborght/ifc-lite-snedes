/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Row filter of the wall-analysis table: wall kinds shown and a name search.
 * Kind selection works like a spreadsheet slicer: clicking a kind while all
 * are shown shows only that kind; further clicks add or remove kinds; the
 * selection is never empty and falls back to "all".
 */

import type { WallKind } from './kind';

export interface WallFilter {
  /** Kinds shown; null = all. */
  kinds: ReadonlySet<WallKind> | null;
  query: string;
}

export const NO_FILTER: WallFilter = { kinds: null, query: '' };

export function matchesFilter(f: WallFilter, row: { kind: WallKind; name: string }): boolean {
  if (f.kinds && !f.kinds.has(row.kind)) return false;
  const q = f.query.trim().toLowerCase();
  return !q || row.name.toLowerCase().includes(q);
}

/** Next kind selection after clicking `kind`, given the kinds present in the table. */
export function toggleKind(kinds: ReadonlySet<WallKind> | null, kind: WallKind, present: readonly WallKind[]): ReadonlySet<WallKind> | null {
  if (!kinds) return new Set([kind]);
  const next = new Set(kinds);
  if (next.has(kind)) next.delete(kind); else next.add(kind);
  if (next.size === 0 || present.every((k) => next.has(k))) return null;
  return next;
}
