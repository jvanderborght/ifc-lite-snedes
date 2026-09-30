/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hierarchy's "hsbCAD zones" view: one checkbox per zone (pset Data,
 * property Zone, see `lib/hsb-zones/zones.ts`) with its element count,
 * across every loaded model. Unticking hides that zone's elements through
 * the same `hideEntities` the Hide command uses, so "Show all" brings them
 * back too; the tick state is read back from the hidden set.
 *
 * Zones are read once per `IfcDataStore` (WeakMap cache) from the element
 * types timber-frame exports use; a removed model drops its store and entry.
 */

import { useMemo } from 'react';
import type { IfcDataStore } from '@ifc-lite/parser';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n';
import { groupByZone, zoneOf, zoneState, type ZoneGroup } from '@/lib/hsb-zones/zones';
import { getAllModelEntries } from '@/sdk/adapters/model-compat';
import { useViewerStore } from '@/store';

/** STEP types that carry hsbCAD zones (parts) or that the list should still offer (containers, openings fillers). */
const ZONED_TYPES = [
  'IFCBEAM', 'IFCMEMBER', 'IFCPLATE', 'IFCBUILDINGELEMENTPART', 'IFCBUILDINGELEMENTPROXY', 'IFCCOVERING',
  'IFCCOLUMN', 'IFCSLAB', 'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWINDOW', 'IFCDOOR', 'IFCDISCRETEACCESSORY',
  'IFCMECHANICALFASTENER', 'IFCFASTENER', 'IFCELEMENTASSEMBLY',
];

const cache = new WeakMap<IfcDataStore, Array<{ id: number; zone: string | null }>>();

function zonesOfStore(store: IfcDataStore): Array<{ id: number; zone: string | null }> {
  const hit = cache.get(store);
  if (hit) return hit;
  const out: Array<{ id: number; zone: string | null }> = [];
  for (const type of ZONED_TYPES) {
    for (const id of store.entityIndex.byType.get(type) ?? []) out.push({ id, zone: zoneOf(store.getProperties(id)) });
  }
  cache.set(store, out);
  return out;
}

export function HsbZonesView() {
  const { t } = useTranslation();
  const models = useViewerStore((s) => s.models);
  const legacyStore = useViewerStore((s) => s.ifcDataStore);
  const hidden = useViewerStore((s) => s.hiddenEntities);
  const hideEntities = useViewerStore((s) => s.hideEntities);
  const showEntities = useViewerStore((s) => s.showEntities);

  const groups = useMemo((): ZoneGroup[] | null => {
    const toGlobalId = useViewerStore.getState().toGlobalId;
    const items: Array<{ id: number; zone: string | null }> = [];
    for (const [, model] of getAllModelEntries({ models, ifcDataStore: legacyStore })) {
      if (!model.ifcDataStore) continue;
      for (const { id, zone } of zonesOfStore(model.ifcDataStore)) items.push({ id: toGlobalId(model.id, id), zone });
    }
    return groupByZone(items);
  }, [models, legacyStore]);

  if (!groups) {
    return <p className="p-3 text-xs text-muted-foreground">{t('hierarchy.hsbZones.empty')}</p>;
  }
  const all = groups.flatMap((g) => g.ids);
  return (
    <div className="flex-1 overflow-auto p-2 text-xs">
      <p className="px-1 pb-2 text-muted-foreground">{t('hierarchy.hsbZones.intro')}</p>
      <div className="flex flex-wrap gap-1 px-1 pb-2">
        <Button size="sm" variant="outline" className="h-6 flex-1 text-[11px]" onClick={() => showEntities(all)}>
          {t('hierarchy.hsbZones.showAll')}
        </Button>
        <Button size="sm" variant="outline" className="h-6 flex-1 text-[11px]" onClick={() => hideEntities(all)}>
          {t('hierarchy.hsbZones.hideAll')}
        </Button>
      </div>
      <ul>
        {groups.map((g) => {
          const state = zoneState(g.ids, hidden);
          const label = g.zone === null ? t('hierarchy.hsbZones.noZone') : t('hierarchy.hsbZones.zone', { zone: g.zone });
          return (
            <li key={g.zone ?? '-'}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={state !== 'hidden'}
                  ref={(el) => { if (el) el.indeterminate = state === 'mixed'; }}
                  onChange={() => (state === 'shown' ? hideEntities(g.ids) : showEntities(g.ids))}
                />
                <span className="flex-1 font-medium">{label}</span>
                <span className="tabular-nums text-muted-foreground">{g.ids.length}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
