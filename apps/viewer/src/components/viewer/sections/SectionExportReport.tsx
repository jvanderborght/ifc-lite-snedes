/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The export report shown after a DXF export: per section what was drawn,
 * which cut outlines did not close, and where the model itself is unreliable.
 * Element ids are buttons that select the element in the model.
 */

import type { ExportVerslag } from '@ifc-lite/snede-export';
import { useTranslation } from '@/i18n/useTranslation';
import { useViewerStore } from '@/store';

export interface SectionExportReportProps {
  report: ExportVerslag;
  file: string;
  /** Local-to-global offset for ids in the model diagnostics. */
  diagnosticsIdOffset: number;
}

/** Two-channel selection (apps/viewer/AGENTS.md): global id for 3D, ref for the properties panel. */
function selectInModel(globalId: number): void {
  const s = useViewerStore.getState();
  const ref = s.resolveGlobalIdFromModels(globalId);
  s.clearEntitySelection();
  s.setSelectedEntityIds([globalId]);
  s.setSelectedEntityId(globalId);
  if (ref) {
    s.addEntitiesToSelection([ref]);
    s.setSelectedEntities([ref]);
  }
  if (s.cameraCallbacks.frameSelection) window.setTimeout(() => s.cameraCallbacks.frameSelection?.(), 50);
}

function ElementButton({ id, type }: { id: number; type: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
      onClick={() => selectInModel(id)} title={t('sectionsReport.selectElement')}>
      {`#${id} ${type}`}
    </button>
  );
}

export function SectionExportReport({ report, file, diagnosticsIdOffset }: SectionExportReportProps) {
  const { t } = useTranslation();
  const gap = (mm: number) => (!Number.isFinite(mm) ? t('sectionsReport.lonePiece')
    : mm <= 0.1 ? t('sectionsReport.branch') : t('sectionsReport.gap', { mm: mm < 1 ? mm.toFixed(3) : mm.toFixed(0) }));
  const g = report.geometrie;

  return (
    <div className="grid max-h-[60vh] gap-3 overflow-y-auto py-2 text-sm">
      <p className="text-muted-foreground">
        {t('sectionsReport.summary', { file, seconds: (report.rekentijdMs / 1000).toFixed(1) })}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-2 font-normal">{t('sectionsReport.section')}</th>
            <th className="py-1 pr-2 font-normal">{t('sectionsReport.cut')}</th>
            <th className="py-1 font-normal">{t('sectionsReport.lines')}</th>
          </tr>
        </thead>
        <tbody>
          {report.snedes.map((s) => (
            <tr key={s.naam} className="border-b align-top">
              <td className="py-1 pr-2 font-medium">{s.naam}</td>
              <td className="py-1 pr-2">{s.gesneden}</td>
              <td className="py-1">{`${s.lijnen.snede} / ${s.lijnen.zicht} / ${s.lijnen.verborgen}`}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.snedes.filter((s) => s.gesneden === 0 && s.lijnen.zicht === 0).map((s) => (
        <p key={`leeg-${s.naam}`} className="text-amber-700 dark:text-amber-400">
          {t('sectionsReport.emptySection', { name: s.naam })}
        </p>
      ))}

      {report.snedes.some((s) => s.openSnedeomtrekken.length) && (
        <div>
          <p className="font-medium">{t('sectionsReport.openOutlines')}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {report.snedes.flatMap((s) => s.openSnedeomtrekken.map((o) => (
              <li key={`${s.naam}-${o.entityId}`}>
                {`${s.naam}: `}<ElementButton id={o.entityId} type={o.ifcType} />{` (${gap(o.grootsteGat)})`}
              </li>
            )))}
          </ul>
        </div>
      )}

      {report.nietGetekend.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('sectionsReport.notDrawn', { list: report.nietGetekend.map((n) => `${n.ifcType} ${n.aantal}`).join(', ') })}
        </p>
      )}
      {report.verborgenNietGeexporteerd > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('sectionsReport.hiddenLeftOut', { count: report.verborgenNietGeexporteerd })}
        </p>
      )}

      {!g ? (
        <p className="text-xs text-muted-foreground">{t('sectionsReport.noDiagnostics')}</p>
      ) : (
        <div className="text-xs">
          {g.csgFouten > 0 && <p className="font-medium">{t('sectionsReport.failedOpenings', { count: g.csgFouten })}</p>}
          <ul className="mt-1 space-y-0.5">
            {g.slechtsteElementen.map((e) => (
              <li key={e.entityId}>
                <ElementButton id={e.entityId + diagnosticsIdOffset} type={e.ifcType} />
                {`: ${t('sectionsReport.openingFailure', { failed: e.fouten, total: e.openingen })}`}
                {e.reden ? ` (${e.reden})` : ''}
              </li>
            ))}
          </ul>
          {g.openingenBuitenElement > 0 && (
            <p className="mt-1 text-muted-foreground">{t('sectionsReport.openingsOutside', { count: g.openingenBuitenElement })}</p>
          )}
          {g.nietOndersteund.length > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              {t('sectionsReport.unsupported', { list: g.nietOndersteund.map((n) => `${n.ifcType} ${n.aantal}`).join(', ') })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
