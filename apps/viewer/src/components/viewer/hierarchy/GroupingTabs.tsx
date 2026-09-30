/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hierarchy panel's grouping tabs (spatial, class, type, materials,
 * groups, hsbCAD zones). Shared by the single- and multi-model layouts of
 * `HierarchyPanel`.
 */

import { Building2, Columns3, FileBox, Layers, Network, Palette, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n';
import type { TranslationKey } from '@/i18n/en';
import type { HierarchyMode } from '@/store';

const TABS: ReadonlyArray<{ mode: HierarchyMode; Icon: LucideIcon; label: TranslationKey; tooltip: TranslationKey }> = [
  { mode: 'spatial', Icon: Building2, label: 'hierarchy.panel.grouping.spatial', tooltip: 'hierarchy.panel.grouping.spatial' },
  { mode: 'type', Icon: Layers, label: 'hierarchy.panel.grouping.class', tooltip: 'hierarchy.panel.grouping.class' },
  { mode: 'ifc-type', Icon: FileBox, label: 'hierarchy.panel.grouping.type', tooltip: 'hierarchy.panel.grouping.type' },
  { mode: 'material', Icon: Palette, label: 'hierarchy.panel.grouping.material', tooltip: 'hierarchy.panel.grouping.materialsTooltip' },
  { mode: 'groups', Icon: Network, label: 'hierarchy.panel.grouping.groups', tooltip: 'hierarchy.panel.grouping.groupsTooltip' },
  { mode: 'hsb-zones', Icon: Columns3, label: 'hierarchy.panel.grouping.hsbZones', tooltip: 'hierarchy.panel.grouping.hsbZonesTooltip' },
];

export function GroupingTabs({ mode, onChange }: { mode: HierarchyMode; onChange: (mode: HierarchyMode) => void }) {
  const { t } = useTranslation();
  return (
    <div className="hierarchy-grouping-tabs flex gap-1 mt-2">
      {TABS.map(({ mode: m, Icon, label, tooltip }) => (
        <Button
          key={m}
          variant={mode === m ? 'default' : 'outline'}
          size="sm"
          className="h-6 text-[10px] flex-1 min-w-0 rounded-none uppercase tracking-wider"
          onClick={() => onChange(m)}
          title={t(tooltip)}
        >
          <Icon className="h-3 w-3 shrink-0 panel-compact-icon" />
          <span className="panel-compact-text">{t(label)}</span>
        </Button>
      ))}
    </div>
  );
}
