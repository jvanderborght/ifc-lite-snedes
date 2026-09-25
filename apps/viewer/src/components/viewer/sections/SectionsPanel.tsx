/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sections panel: a list of saved section planes, taken from the section
 * tool's cut, exported together to one DXF sheet (`@ifc-lite/snede-export`).
 */

import { Download, FileUp, Plus, Scissors, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n/useTranslation';
import { downloadFile, sanitizeFilename } from '@/lib/export/download';
import { nextSectionName, parseSections, serializeSections } from '@/lib/sections/saved-section';
import { readCurrentCut } from '@/lib/sections/section-source';
import { sectionsFileStem } from '@/lib/sections/storage';
import { useViewerStore } from '@/store';
import { activeSectionPlane } from '@/store/section-active';
import { SectionExportDialog } from './SectionExportDialog';
import { SectionRow } from './SectionRow';
import { newSectionId, useSavedSectionsPersistence } from './useSavedSectionsPersistence';

export interface SectionsPanelProps {
  onClose?: () => void;
}

export function SectionsPanel({ onClose }: SectionsPanelProps) {
  const { t } = useTranslation();
  useSavedSectionsPersistence();
  const sections = useViewerStore((s) => s.savedSections);
  const modelKey = useViewerStore((s) => s.savedSectionsModelKey);
  const hasCut = useViewerStore((s) => activeSectionPlane(s) !== null);
  const addSavedSection = useViewerStore((s) => s.addSavedSection);
  const replaceSavedSections = useViewerStore((s) => s.replaceSavedSections);
  const [exportOpen, setExportOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const addCurrent = () => {
    const cut = readCurrentCut(useViewerStore.getState());
    if (!cut) {
      toast.info(t('sectionsPanel.noActiveCut'));
      return;
    }
    addSavedSection({
      id: newSectionId(),
      name: nextSectionName(sections.map((s) => s.name)),
      origin: cut.origin,
      direction: cut.direction,
      depth: 0,
      shown: true,
      exported: true,
    });
  };

  const saveList = () => {
    const stem = sectionsFileStem(useViewerStore.getState());
    downloadFile(serializeSections(sections), `${sanitizeFilename(stem)}.sections.json`, 'application/json');
  };

  const loadList = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseSections(await file.text());
    if (!parsed.ok) {
      toast.error(t('sectionsPanel.loadFailed', { message: parsed.error }));
      return;
    }
    replaceSavedSections(parsed.sections.map((s) => ({ ...s, id: newSectionId() })), modelKey);
    toast.success(t('sectionsPanel.loaded', { count: parsed.sections.length }));
  };

  const exportable = sections.some((s) => s.exported);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Scissors className="h-4 w-4 text-sky-600" />
        <span className="flex-1 text-sm font-medium">{t('sectionsPanel.title')}</span>
        {modelKey && (
          <>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!sections.length} onClick={saveList}
              title={t('sectionsPanel.saveList')}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fileInput.current?.click()}
              title={t('sectionsPanel.loadList')}>
              <FileUp className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {onClose && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title={t('sectionsPanel.close')}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {!modelKey ? (
        <div className="p-3 text-xs text-muted-foreground">{t('sectionsPanel.noModel')}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
            <Button size="sm" variant="secondary" className="h-7" disabled={!hasCut} onClick={addCurrent}
              title={hasCut ? t('sectionsPanel.addCurrentHint') : t('sectionsPanel.noActiveCut')}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('sectionsPanel.addCurrent')}
            </Button>
            <Button size="sm" className="h-7" disabled={!exportable} onClick={() => setExportOpen(true)}
              title={exportable ? t('sectionsPanel.exportDxfHint') : t('sectionsPanel.nothingToExport')}>
              {t('sectionsPanel.exportDxf')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => { void loadList(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>
          {sections.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">{t('sectionsPanel.empty')}</div>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {sections.map((section, i) => (
                <SectionRow key={section.id} section={section} first={i === 0} last={i === sections.length - 1} />
              ))}
            </ul>
          )}
        </>
      )}
      <SectionExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}
