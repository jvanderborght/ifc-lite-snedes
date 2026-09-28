/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Layer colours per IFC class for the section export: an AutoCAD colour
 * index (ACI 1-255) per class, on top of the built-in table. Classes in the
 * model come first; a class left at its default is not stored.
 */

import { aciToCss } from '@ifc-lite/drawing-2d';
import { STANDAARD_KLEUREN } from '@ifc-lite/snede-export';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/useTranslation';
import { exportClasses } from '@/lib/sections/classes';
import { useViewerStore } from '@/store';

/** Colour of a class without override; unknown classes are drawn in ACI 7. */
const defaultAci = (cls: string): number => STANDAARD_KLEUREN[cls] ?? 7;

export interface SectionColourTableProps {
  colours: Record<string, number>;
  onChange: (colours: Record<string, number>) => void;
}

export function SectionColourTable({ colours, onChange }: SectionColourTableProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const models = useViewerStore((s) => s.models);
  // `models` changes when a model loads or hides; the class list follows.
  const classes = useMemo(() => exportClasses(useViewerStore.getState()), [models]);
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? [...classes.inModel, ...classes.others] : classes.inModel;

  const setColour = (cls: string, text: string) => {
    const v = Number(text);
    const next = { ...colours };
    if (Number.isInteger(v) && v >= 1 && v <= 255 && v !== defaultAci(cls)) next[cls] = v;
    else delete next[cls];
    onChange(next);
  };

  return (
    <div className="rounded border">
      <button type="button" className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-sm font-medium"
        onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {t('sectionsExport.colours')}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {t('sectionsExport.coloursChanged', { count: Object.keys(colours).length })}
        </span>
      </button>
      {open && (
        <div className="space-y-1 border-t px-2 py-2">
          <p className="text-xs text-muted-foreground">{t('sectionsExport.coloursHint')}</p>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {rows.map((cls) => {
              const aci = colours[cls] ?? defaultAci(cls);
              return (
                <div key={cls} className="flex items-center gap-2 text-xs">
                  <span className="h-3 w-3 shrink-0 rounded-sm border" style={{ background: aciToCss(aci) }} />
                  <span className="flex-1 truncate" title={cls}>{cls}</span>
                  <Input className="h-6 w-16 text-xs" inputMode="numeric" defaultValue={String(aci)}
                    key={`${cls}-${aci}`} aria-label={t('sectionsExport.colourFor', { cls })}
                    onBlur={(e) => setColour(cls, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setColour(cls, (e.target as HTMLInputElement).value); }} />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('sectionsExport.coloursInModel') : t('sectionsExport.coloursAll')}
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={!Object.keys(colours).length}
              onClick={() => onChange({})}>
              <RotateCcw className="mr-1 h-3 w-3" />
              {t('sectionsExport.coloursReset')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
