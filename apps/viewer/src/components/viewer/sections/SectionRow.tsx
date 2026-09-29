/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** One saved section in the Sections panel: name, depth and its toggles. */

import { ArrowLeftRight, Eye, EyeOff, GripVertical, Move, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/useTranslation';
import { flipSection, isPlanSection, type SavedSection } from '@/lib/sections/saved-section';
import { useViewerStore } from '@/store';
import { SectionMoveControls } from './SectionMoveControls';
import { activateSavedSection } from './useActiveSavedSection';

export interface SectionRowProps {
  section: SavedSection;
  index: number;
  /** Drag and drop reordering, driven by the panel. */
  drag: {
    dragging: boolean;
    /** Where the dragged row would land relative to this one, when it is the drop target. */
    dropEdge: 'top' | 'bottom' | null;
    onStart: (index: number) => void;
    onOver: (index: number) => void;
    onEnd: () => void;
    onDrop: (index: number) => void;
  };
}

export function SectionRow({ section, index, drag }: SectionRowProps) {
  const { t } = useTranslation();
  const update = useViewerStore((s) => s.updateSavedSection);
  const remove = useViewerStore((s) => s.removeSavedSection);
  const move = useViewerStore((s) => s.moveSavedSection);
  const active = useViewerStore((s) => s.activeSavedSectionId === section.id);
  const setActive = useViewerStore((s) => s.setActiveSavedSection);
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
    <li
      className={[
        // Both edges reserve 2px so the drop line does not reflow the list.
        'space-y-1.5 border-y-2 border-transparent py-2 pl-1 pr-3 shadow-[inset_0_-1px_0_hsl(var(--border))] transition-[border-color,opacity]',
        active ? 'bg-sky-500/10' : '',
        drag.dropEdge === 'top' ? 'border-t-primary' : drag.dropEdge === 'bottom' ? 'border-b-primary' : '',
        drag.dragging ? 'opacity-40' : '',
      ].join(' ')}
      data-section-id={section.id}
      onDragOver={(e) => { e.preventDefault(); drag.onOver(index); }}
      onDrop={(e) => { e.preventDefault(); drag.onDrop(index); }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', section.id);
            drag.onStart(index);
          }}
          onDragEnd={drag.onEnd}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); move(section.id, -1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); move(section.id, 1); }
          }}
          role="button"
          tabIndex={0}
          aria-label={t('sectionsPanel.reorder')}
          title={t('sectionsPanel.reorder')}
          className="flex-shrink-0 cursor-grab rounded-sm text-muted-foreground/60 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={section.exported}
          onChange={(e) => update(section.id, { exported: e.target.checked })}
          aria-label={t('sectionsPanel.exported')}
          title={t('sectionsPanel.exported')}
        />
        <Input
          className="h-7 w-16 max-w-32 shrink-0 grow text-sm font-medium"
          value={section.name}
          onChange={(e) => update(section.id, { name: e.target.value })}
          aria-label={t('sectionsPanel.name')}
        />
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
          {plan ? t('sectionsPanel.kindPlan') : t('sectionsPanel.kindSection')}
        </span>
        <Button variant={active ? 'secondary' : 'ghost'} size="icon" className="h-6 w-6" aria-pressed={active}
          onClick={() => (active ? setActive(null) : activateSavedSection(section.id))}
          title={active ? t('sectionsPanel.stopMoving') : t('sectionsPanel.moveSection')}>
          <Move className="h-3.5 w-3.5" />
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
      {active && <SectionMoveControls section={section} />}
      <div className="pl-6 text-[10px] text-muted-foreground">
        {t('sectionsPanel.position', { x: o.x.toFixed(0), y: o.y.toFixed(0), z: o.z.toFixed(0) })}
      </div>
    </li>
  );
}
