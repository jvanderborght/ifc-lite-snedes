/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** One saved section in the Sections panel: name, depth and its toggles. */

import { ArrowDown, ArrowUp, ArrowLeftRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/useTranslation';
import { flipSection, isPlanSection, type SavedSection } from '@/lib/sections/saved-section';
import { useViewerStore } from '@/store';

export interface SectionRowProps {
  section: SavedSection;
  first: boolean;
  last: boolean;
}

export function SectionRow({ section, first, last }: SectionRowProps) {
  const { t } = useTranslation();
  const update = useViewerStore((s) => s.updateSavedSection);
  const remove = useViewerStore((s) => s.removeSavedSection);
  const move = useViewerStore((s) => s.moveSavedSection);
  // Depth is edited as text so an empty or half-typed field does not snap back.
  const [depthText, setDepthText] = useState(String(section.depth));
  const plan = isPlanSection(section);
  const o = section.origin;

  const commitDepth = () => {
    const value = Number(depthText.replace(',', '.'));
    if (Number.isFinite(value) && value >= 0) update(section.id, { depth: value });
    else setDepthText(String(section.depth));
  };

  return (
    <li className="space-y-1.5 border-b px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={section.exported}
          onChange={(e) => update(section.id, { exported: e.target.checked })}
          aria-label={t('sectionsPanel.exported')}
          title={t('sectionsPanel.exported')}
        />
        <Input
          className="h-7 w-20 text-sm font-medium"
          value={section.name}
          onChange={(e) => update(section.id, { name: e.target.value })}
          aria-label={t('sectionsPanel.name')}
        />
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {plan ? t('sectionsPanel.kindPlan') : t('sectionsPanel.kindSection')}
        </span>
        <span className="flex-1" />
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={first}
          onClick={() => move(section.id, -1)} title={t('sectionsPanel.moveUp')}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={last}
          onClick={() => move(section.id, 1)} title={t('sectionsPanel.moveDown')}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6"
          onClick={() => remove(section.id)} title={t('sectionsPanel.remove')}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2 pl-6">
        <label className="flex items-center gap-1 text-xs text-muted-foreground" title={t('sectionsPanel.depthHint')}>
          {t('sectionsPanel.depth')}
          <Input
            className="h-7 w-20 text-xs"
            inputMode="decimal"
            value={depthText}
            onChange={(e) => setDepthText(e.target.value)}
            onBlur={commitDepth}
            onKeyDown={(e) => { if (e.key === 'Enter') commitDepth(); }}
          />
        </label>
        <Button variant="ghost" size="icon" className="h-6 w-6"
          onClick={() => update(section.id, { direction: flipSection(section).direction })} title={t('sectionsPanel.flip')}>
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6"
          onClick={() => update(section.id, { shown: !section.shown })}
          title={section.shown ? t('sectionsPanel.hide') : t('sectionsPanel.show')}>
          {section.shown ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="pl-6 text-[10px] text-muted-foreground">
        {t('sectionsPanel.position', { x: o.x.toFixed(0), y: o.y.toFixed(0), z: o.z.toFixed(0) })}
      </div>
    </li>
  );
}
