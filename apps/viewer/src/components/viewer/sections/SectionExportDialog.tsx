/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Export dialog for the Sections panel. Opens with the saved default
 * settings; changes apply to this export only unless "Save as default" is
 * pressed. After the export the dialog shows the report.
 */

import type { ExportVerslag } from '@ifc-lite/snede-export';
import { Loader2, Scissors } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useTranslation } from '@/i18n/useTranslation';
import { buildExportFilename, downloadFile } from '@/lib/export/download';
import { toSnedevlak } from '@/lib/sections/saved-section';
import { readSectionExportSource } from '@/lib/sections/section-source';
import {
  loadExportSettings, normalizeSettings, sectionsFileStem, storeExportSettings, type SectionExportSettings,
} from '@/lib/sections/storage';
import { useViewerStore } from '@/store';
import { SectionColourTable } from './SectionColourTable';
import { SectionExportReport } from './SectionExportReport';

export interface SectionExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Done { report: ExportVerslag; file: string; diagnosticsIdOffset: number }

/** A numeric setting edited as text; invalid input falls back to the default on export. */
function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <Label className="w-48" htmlFor={id}>{label}</Label>
      <Input id={id} className="h-8 w-28" inputMode="decimal" defaultValue={String(value)}
        onChange={(e) => onChange(Number(e.target.value.replace(',', '.')))} />
    </div>
  );
}

export function SectionExportDialog({ open, onOpenChange }: SectionExportDialogProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SectionExportSettings>(loadExportSettings);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  // Remounts the text fields after the settings are reloaded (they are uncontrolled while typing).
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSettings(loadExportSettings());
    setDone(null);
    setFormKey((k) => k + 1);
  }, [open]);

  const set = <K extends keyof SectionExportSettings>(key: K, value: SectionExportSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const saveDefaults = () => {
    const result = storeExportSettings(normalizeSettings(settings));
    if (result.ok) toast.success(t('sectionsExport.defaultsSaved'));
    else toast.error(result.message);
  };

  const runExport = async () => {
    setBusy(true);
    // Let the spinner paint before the main-thread part (gathering, rebuilding) starts.
    await new Promise((r) => window.setTimeout(r, 30));
    try {
      const s = normalizeSettings(settings);
      const state = useViewerStore.getState();
      const source = readSectionExportSource(state, s.exportHidden);
      if (source.meshes.length === 0) {
        toast.error(t('sectionsExport.noGeometry'));
        return;
      }
      const { herstelOnderdelen, STANDAARD_KLEUREN } = await import('@ifc-lite/snede-export');
      const planes = state.savedSections.filter((sec) => sec.exported).map(toSnedevlak);
      // Rebuilding pre-cut parts needs the data store, so it runs here; the
      // cutting and writing run in a worker to keep the viewer responsive.
      let meshes = source.meshes;
      let rebuilt = 0;
      for (const { store, idOffset } of s.partsAsModelled ? source.herstel : []) {
        const r = herstelOnderdelen(meshes, store, source.coordinateInfo, idOffset);
        meshes = r.meshes;
        rebuilt += r.hersteld.length;
      }
      const { exportSectionsOffThread } = await import('@/lib/sections/export-worker-client');
      const { slimMesh } = await import('@/workers/sectionExport.worker');
      const { dxf, report: verslag } = await exportSectionsOffThread({ meshes: meshes.map(slimMesh), info: source.coordinateInfo, planes, options: {
        blad: { plannen: s.plans === 'row' ? 'rij' : 'wereld', tussenruimte: s.gap },
        annotatie: { teksthoogte: s.textHeight, driehoek: s.triangleSize },
        dxf: {
          eenheid: s.unit, verborgenLijnen: s.hiddenLines, streeppatroon: { streep: s.dash, gat: s.dashGap },
          kleuren: { ...STANDAARD_KLEUREN, ...s.classColours }, zwartWit: s.blackAndWhite,
          arcering: s.hatch === 'none' ? undefined
            : s.hatch === 'solid' ? { soort: 'vol' } : { soort: 'ansi31', schaal: s.hatchScale },
        },
        zicht: { verborgenBinnenSnede: s.hiddenInsideCut },
        diagnose: source.diagnostics,
      } });
      verslag.herbouwdUitBrep = rebuilt;
      // The mesh set arrives with hidden elements already removed, so the count comes from the source.
      verslag.verborgenNietGeexporteerd = source.hiddenLeftOut.size;
      const file = buildExportFilename(`${sectionsFileStem(state)}-sections`, 'dxf');
      downloadFile(dxf, file, 'application/dxf');
      setDone({ report: verslag, file, diagnosticsIdOffset: source.diagnosticsIdOffset });
    } catch (err) {
      console.error('[sections] export failed', err);
      toast.error(t('sectionsExport.failed', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            {done ? t('sectionsReport.title') : t('sectionsExport.title')}
          </DialogTitle>
          {!done && <DialogDescription>{t('sectionsExport.description')}</DialogDescription>}
        </DialogHeader>

        {done ? (
          <SectionExportReport report={done.report} file={done.file} diagnosticsIdOffset={done.diagnosticsIdOffset} />
        ) : (
          <div key={formKey} className="grid max-h-[65vh] gap-3 overflow-y-auto py-2 pr-1">
            <div className="flex items-center gap-4">
              <Label className="w-48">{t('sectionsExport.unit')}</Label>
              <Select value={settings.unit} onValueChange={(v) => set('unit', v as SectionExportSettings['unit'])}>
                <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mm">{t('sectionsExport.unitMm')}</SelectItem>
                  <SelectItem value="cm">{t('sectionsExport.unitCm')}</SelectItem>
                  <SelectItem value="m">{t('sectionsExport.unitM')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <Label className="w-48">{t('sectionsExport.plans')}</Label>
              <Select value={settings.plans} onValueChange={(v) => set('plans', v as SectionExportSettings['plans'])}>
                <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="row">{t('sectionsExport.plansRow')}</SelectItem>
                  <SelectItem value="world">{t('sectionsExport.plansWorld')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumberField id="sections-gap" label={t('sectionsExport.gap')} value={settings.gap} onChange={(v) => set('gap', v)} />
            <NumberField id="sections-text" label={t('sectionsExport.textHeight')} value={settings.textHeight} onChange={(v) => set('textHeight', v)} />
            <NumberField id="sections-triangle" label={t('sectionsExport.triangleSize')} value={settings.triangleSize} onChange={(v) => set('triangleSize', v)} />
            <div className="flex items-center gap-4">
              <Label className="w-48" htmlFor="sections-hidden-lines">{t('sectionsExport.hiddenLines')}</Label>
              <Switch id="sections-hidden-lines" checked={settings.hiddenLines} onCheckedChange={(v) => set('hiddenLines', v)} />
            </div>
            {settings.hiddenLines && (
              <>
                <div className="flex items-center gap-4">
                  <Label className="w-48" htmlFor="sections-hidden-inside">{t('sectionsExport.hiddenInsideCut')}</Label>
                  <Switch id="sections-hidden-inside" checked={settings.hiddenInsideCut} onCheckedChange={(v) => set('hiddenInsideCut', v)} />
                </div>
                <div className="flex items-center gap-4">
                  <Label className="w-48">{t('sectionsExport.dash')}</Label>
                  <Input className="h-8 w-20" inputMode="decimal" defaultValue={String(settings.dash)}
                    aria-label={t('sectionsExport.dash')}
                    onChange={(e) => set('dash', Number(e.target.value.replace(',', '.')))} />
                  <Input className="h-8 w-20" inputMode="decimal" defaultValue={String(settings.dashGap)}
                    aria-label={t('sectionsExport.dash')}
                    onChange={(e) => set('dashGap', Number(e.target.value.replace(',', '.')))} />
                </div>
              </>
            )}
            <div className="flex items-center gap-4">
              <Label className="w-48" htmlFor="sections-export-hidden">{t('sectionsExport.exportHidden')}</Label>
              <Switch id="sections-export-hidden" checked={settings.exportHidden} onCheckedChange={(v) => set('exportHidden', v)} />
            </div>
            <div className="flex items-center gap-4">
              <Label className="w-48">{t('sectionsExport.hatch')}</Label>
              <Select value={settings.hatch} onValueChange={(v) => set('hatch', v as SectionExportSettings['hatch'])}>
                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('sectionsExport.hatchNone')}</SelectItem>
                  <SelectItem value="ansi31">{t('sectionsExport.hatchAnsi31')}</SelectItem>
                  <SelectItem value="solid">{t('sectionsExport.hatchSolid')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settings.hatch === 'ansi31' && (
              <NumberField id="sections-hatch-scale" label={t('sectionsExport.hatchScale')} value={settings.hatchScale} onChange={(v) => set('hatchScale', v)} />
            )}
            <div className="flex items-start gap-4">
              <Label className="w-48" htmlFor="sections-parts-as-modelled">{t('sectionsExport.partsAsModelled')}</Label>
              <div className="flex flex-1 flex-col gap-1">
                <Switch id="sections-parts-as-modelled" checked={settings.partsAsModelled} onCheckedChange={(v) => set('partsAsModelled', v)} />
                <p className="text-xs text-muted-foreground">{t('sectionsExport.partsAsModelledHint')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Label className="w-48" htmlFor="sections-black-and-white">{t('sectionsExport.blackAndWhite')}</Label>
              <Switch id="sections-black-and-white" checked={settings.blackAndWhite} onCheckedChange={(v) => set('blackAndWhite', v)} />
            </div>
            {!settings.blackAndWhite && (
              <SectionColourTable colours={settings.classColours} onChange={(c) => set('classColours', c)} />
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>{t('sectionsReport.close')}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={saveDefaults} disabled={busy}>{t('sectionsExport.saveDefaults')}</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('sectionsExport.cancel')}</Button>
              <Button onClick={() => { void runExport(); }} disabled={busy}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('sectionsExport.exporting')}</> : t('sectionsExport.export')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
