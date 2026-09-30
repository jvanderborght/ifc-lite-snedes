/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Row filter bar of the wall-analysis table: one toggle per wall kind
 * present (with its count) and a name search; the logic is in
 * `lib/wall-analysis/filter.ts`.
 */

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/useTranslation';
import { toggleKind, type WallFilter } from '@/lib/wall-analysis/filter';
import { WALL_KINDS, type WallKind } from '@/lib/wall-analysis/kind';

export interface WallKindFilterProps {
  counts: ReadonlyMap<WallKind, number>;
  filter: WallFilter;
  onChange: (filter: WallFilter) => void;
}

export function WallKindFilter({ counts, filter, onChange }: WallKindFilterProps) {
  const { t } = useTranslation();
  const present = WALL_KINDS.filter((k) => (counts.get(k) ?? 0) > 0);
  const chip = (active: boolean) =>
    `rounded-full border px-2 py-0.5 text-xs ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b p-3" title={t('wallAnalysis.filter.hint')}>
      <button type="button" className={chip(filter.kinds === null)} aria-pressed={filter.kinds === null}
        onClick={() => onChange({ ...filter, kinds: null })}>
        {t('wallAnalysis.filter.all')}
      </button>
      {present.map((k) => {
        const active = filter.kinds !== null && filter.kinds.has(k);
        return (
          <button key={k} type="button" className={chip(active)} aria-pressed={active}
            onClick={() => onChange({ ...filter, kinds: toggleKind(filter.kinds, k, present) })}>
            {t(`wallAnalysis.kind.${k}`)} ({counts.get(k)})
          </button>
        );
      })}
      <label className="ml-auto flex items-center gap-1">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input className="h-7 w-36 text-xs" value={filter.query} placeholder={t('wallAnalysis.filter.search')}
          aria-label={t('wallAnalysis.filter.search')} onChange={(e) => onChange({ ...filter, query: e.target.value })} />
      </label>
    </div>
  );
}
