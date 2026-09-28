/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Timber-fraction panel: one row per wall with the frame-zone timber share in
 * several definitions (`@ifc-lite/hout-percentage`), a total row, CSV / Excel
 * / HTML / text export, and row click to select the wall in 3D.
 *
 * Selection follows the two-channel rule (viewer AGENTS.md) the same way the
 * Cost panel does: every element the wall aggregates goes to both the
 * global-id channel (highlight) and the ref channel, first one primary. The
 * `IfcWall` itself usually has no body, so selecting only the wall would
 * highlight nothing.
 */

import { Download, Play, RotateCcw, Trees, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { RelationshipType } from '@ifc-lite/data';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/i18n/useTranslation';
import { downloadBlob, downloadFile, sanitizeFilename, stripExtension } from '@/lib/export/download';
import { formatCell, toCsv, toHtml, toTxt } from '@/lib/timber/table';
import { LEGACY_MODEL_ID } from '@/sdk/adapters/model-compat';
import { useViewerStore } from '@/store';
import { timberTable } from './timberLabels';
import { useTimberFraction, type TimberEntry } from './useTimberFraction';

export interface TimberFractionPanelProps {
  onClose?: () => void;
}

type ExportFormat = 'csv' | 'xlsx' | 'html' | 'txt';

function decimalSeparator(locale: string): string {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
  } catch (err) {
    console.warn('[timber-fraction] unknown locale for number format', err);
    return '.';
  }
}

export function TimberFractionPanel({ onClose }: TimberFractionPanelProps) {
  const { t, locale } = useTranslation();
  const { entries, status, run } = useTimberFraction();
  const decimal = decimalSeparator(locale);

  const table = useMemo(() => timberTable(t, entries, new Date().toLocaleDateString(locale)), [t, entries, locale]);

  const selectWall = useCallback((entry: TimberEntry) => {
    const s = useViewerStore.getState();
    const store = entry.modelId === LEGACY_MODEL_ID ? s.ifcDataStore : s.models.get(entry.modelId)?.ifcDataStore;
    if (!store || entry.wall.wallId < 0) return;
    const children = store.relationships.getRelated(entry.wall.wallId, RelationshipType.Aggregates, 'forward');
    const refs = children.map((expressId) => ({ modelId: entry.modelId, expressId }));
    const globalIds = children.map((id) => s.toGlobalId(entry.modelId, id));
    if (globalIds.length === 0) return;
    s.clearEntitySelection();
    s.setSelectedEntityIds(globalIds);
    s.setSelectedEntityId(globalIds[0]);
    s.addEntitiesToSelection(refs);
    s.setSelectedEntities(refs);
    if (s.cameraCallbacks.frameSelection) window.setTimeout(() => s.cameraCallbacks.frameSelection?.(), 50);
  }, []);

  const exportAs = useCallback(async (format: ExportFormat) => {
    const names = [...new Set(entries.map((e) => stripExtension(e.modelName)))].join('-');
    const stem = sanitizeFilename(`${names}-${table.title}`, { fallback: 'timber-fraction' });
    if (format === 'csv') downloadFile(toCsv(table), `${stem}.csv`, 'text/csv;charset=utf-8');
    else if (format === 'txt') downloadFile(toTxt(table, decimal), `${stem}.txt`, 'text/plain;charset=utf-8');
    else if (format === 'html') downloadFile(toHtml(table, decimal, locale), `${stem}.html`, 'text/html;charset=utf-8');
    else {
      const { toXlsx } = await import('@/lib/timber/xlsx');
      downloadBlob(await toXlsx(table), `${stem}.xlsx`);
    }
  }, [entries, table, decimal, locale]);

  const running = status.kind === 'running';
  const message = status.kind === 'running' ? t('timberFraction.computing', { done: status.done, total: status.total })
    : status.kind === 'noModel' ? t('timberFraction.noModel')
      : status.kind === 'noScene' ? t('timberFraction.noScene')
        : status.kind === 'error' ? t('timberFraction.failed', { message: status.message })
          : status.kind === 'done' && entries.length === 0 ? t('timberFraction.noWalls')
            : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Trees className="h-4 w-4 text-amber-700" />
        <span className="flex-1 text-sm font-medium">{t('timberFraction.title')}</span>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title={t('timberFraction.close')}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <p className="w-full text-xs text-muted-foreground">{t('timberFraction.intro')}</p>
        <Button size="sm" onClick={run} disabled={running}>
          {entries.length > 0 ? <RotateCcw className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
          {entries.length > 0 ? t('timberFraction.recompute') : t('timberFraction.compute')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={entries.length === 0 || running}>
              <Download className="mr-1 h-3.5 w-3.5" />
              {t('timberFraction.export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => { void exportAs('xlsx'); }}>{t('timberFraction.exportXlsx')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void exportAs('csv'); }}>{t('timberFraction.exportCsv')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void exportAs('html'); }}>{t('timberFraction.exportHtml')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void exportAs('txt'); }}>{t('timberFraction.exportTxt')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
      {entries.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap border-b px-2 py-1 font-medium ${c.kind === 'text' ? 'text-left' : 'text-right'}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={`${entries[r].modelId}:${entries[r].wall.wallId}`} className="cursor-pointer hover:bg-accent" onClick={() => selectWall(entries[r])}>
                  {row.map((v, i) => (
                    <td key={table.columns[i].key} className={`whitespace-nowrap border-b px-2 py-0.5 ${table.columns[i].kind === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                      {formatCell(v, table.columns[i].kind, decimal)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                {table.total.map((v, i) => (
                  <td key={table.columns[i].key} className={`whitespace-nowrap border-t-2 px-2 py-1 ${table.columns[i].kind === 'text' ? 'text-left' : 'text-right tabular-nums'}`}>
                    {formatCell(v, table.columns[i].kind, decimal)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="p-3 text-xs text-muted-foreground">{t('timberFraction.selectHint')}</p>
        </div>
      )}
    </div>
  );
}
