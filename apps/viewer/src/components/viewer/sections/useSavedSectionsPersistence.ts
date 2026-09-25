/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keep the saved-sections list in step with the model on screen: load the
 * list remembered for that model when it changes, and remember every edit.
 * Idempotent, so both the panel and the 3D overlay can mount it.
 */

import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n/useTranslation';
import { loadSavedSections, sectionsModelKey, storeSavedSections } from '@/lib/sections/storage';
import { useViewerStore } from '@/store';

export const newSectionId = (): string => crypto.randomUUID();

export function useSavedSectionsPersistence(): void {
  const { t } = useTranslation();
  const modelKey = useViewerStore(sectionsModelKey);
  const sections = useViewerStore((s) => s.savedSections);
  const listKey = useViewerStore((s) => s.savedSectionsModelKey);
  const replaceSavedSections = useViewerStore((s) => s.replaceSavedSections);
  const warned = useRef(false);

  useEffect(() => {
    if (modelKey === listKey) return;
    replaceSavedSections(modelKey ? loadSavedSections(modelKey, newSectionId) : [], modelKey);
  }, [modelKey, listKey, replaceSavedSections]);

  useEffect(() => {
    if (!listKey || listKey !== modelKey) return;
    const result = storeSavedSections(listKey, sections);
    // One toast per session: a blocked store fails on every edit.
    if (!result.ok && !warned.current) {
      warned.current = true;
      toast.error(t('sectionsPanel.storeFailed', { message: result.message }));
    }
  }, [sections, listKey, modelKey, t]);
}
