/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Position of the active saved section: a slider over the model's extent
 * along the section normal and the exact position in mm. Both move the
 * section along its own normal; the cut on screen follows
 * (`useActiveSavedSection`).
 */

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/useTranslation';
import { visibleCoordinateInfo } from '@/lib/export/view-pdf/view-pdf-export-source';
import type { SavedSection } from '@/lib/sections/saved-section';
import { positionRange, sectionPosition, withSectionPosition } from '@/lib/sections/section-edit';
import { useViewerStore } from '@/store';

/** Slider resolution: steps over the model extent. */
const SLIDER_STEPS = 10_000;

const formatMm = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

export function SectionMoveControls({ section }: { section: SavedSection }) {
  const { t } = useTranslation();
  const update = useViewerStore((s) => s.updateSavedSection);
  const models = useViewerStore((s) => s.models);
  const range = useMemo(() => {
    const info = visibleCoordinateInfo(useViewerStore.getState()) ?? undefined;
    return positionRange(section, info, info?.shiftedBounds);
    // Only the direction and the model box matter; `models` changes with the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.direction, models]);
  const position = sectionPosition(section);
  // Typed as text so a half-typed number does not jump; synced when the section moves elsewhere.
  const [text, setText] = useState(formatMm(position));
  useEffect(() => { setText(formatMm(position)); }, [position]);

  const moveTo = (value: number) => {
    if (Number.isFinite(value)) update(section.id, { origin: withSectionPosition(section, value).origin });
  };
  const commitText = () => {
    const value = Number(text.replace(',', '.'));
    if (Number.isFinite(value)) moveTo(value);
    else setText(formatMm(position));
  };
  const step = range ? Math.round(((position - range.min) / (range.max - range.min)) * SLIDER_STEPS) : 0;
  const percent = range ? ((position - range.min) / (range.max - range.min)) * 100 : 0;

  return (
    <div className="min-w-0 space-y-1 pl-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <label className="flex items-center gap-1">
          {t('sectionsPanel.positionMm')}
          <Input
            className="h-7 w-24 text-xs font-mono"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => { if (e.key === 'Enter') commitText(); }}
          />
        </label>
        {range && <span className="whitespace-nowrap font-mono">{percent.toFixed(1)} %</span>}
      </div>
      {range && (
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={Math.min(SLIDER_STEPS, Math.max(0, step))}
          onChange={(e) => moveTo(range.min + ((range.max - range.min) * Number(e.target.value)) / SLIDER_STEPS)}
          aria-label={t('sectionsPanel.positionSlider')}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
        />
      )}
    </div>
  );
}
