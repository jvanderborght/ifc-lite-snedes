/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Wall-analysis panel: one row per wall, with the columns the timber module
 * (NPR 2068 timber fraction first) and the wall-area module offer, a total
 * row, XLSX / CSV / HTML / text export, and row click to select the wall.
 *
 * Selection follows the two-channel rule (viewer AGENTS.md): the wall and
 * every element it aggregates go to both the global-id channel (highlight)
 * and the ref channel, first one primary. A timber-frame `IfcWall` usually
 * has no body, so selecting only the wall would highlight nothing.
 */

import { BrickWall, Download, Play, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RelationshipType } from '@ifc-lite/data';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/i18n/useTranslation';
import { downloadBlob, downloadFile, sanitizeFilename, stripExtension } from '@/lib/export/download';
import { allColumns, type WallAnalysisRow } from '@/lib/wall-analysis/columns';
import { toCsv, toHtml, toTxt } from '@/lib/wall-analysis/export-text';
import { matchesFilter, NO_FILTER, type WallFilter } from '@/lib/wall-analysis/filter';
import { WALL_KINDS, type WallKind } from '@/lib/wall-analysis/kind';
import { formatCell } from '@/lib/wall-analysis/table';
import { LEGACY_MODEL_ID } from '@/sdk/adapters/model-compat';
import { useViewerStore } from '@/store';
import { wallAnalysisTable } from './wallAnalysisLabels';
import { useWallAnalysis } from './useWallAnalysis';
import { WallKindFilter } from './WallKindFilter';

export interface WallAnalysisPanelProps {
  onClose?: () => void;
}

type ExportFormat = 'csv' | 'xlsx' | 'html' | 'txt';

function decimalSeparator(locale: string): string {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.';
  } catch (err) {
    console.warn('[wall-analysis] unknown locale for number format', err);
    return '.';
  }
}

function selectWall(row: WallAnalysisRow): void {
  const s = useViewerStore.getState();
  const store = row.modelId === LEGACY_MODEL_ID ? s.ifcDataStore : s.models.get(row.modelId)?.ifcDataStore;
  if (!store) return;
  const ids = [row.wallId];
  for (let i = 0; i < ids.length; i++) {
    for (const child of store.relationships.getRelated(ids[i], RelationshipType.Aggregates, 'forward')) if (!ids.includes(child)) ids.push(child);
  }
  const refs = ids.map((expressId) => ({ modelId: row.modelId, expressId }));
  const globalIds = ids.map((id) => s.toGlobalId(row.modelId, id));
  s.clearEntitySelection();
  s.setSelectedEntityIds(globalIds);
  s.setSelectedEntityId(globalIds[0]);
  s.addEntitiesToSelection(refs);
  s.setSelectedEntities(refs);
  if (s.cameraCallbacks.frameSelection) window.setTimeout(() => s.cameraCallbacks.frameSelection?.(), 50);
}

export function WallAnalysisPanel({ onClose }: WallAnalysisPanelProps) {
  const { t, locale } = useTranslation();
  const { models, status, run, computeVariants } = useWallAnalysis();
  const [excludeRaveling, setExcludeRaveling] = useState(false);
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState<WallFilter>(NO_FILTER);
  const decimal = decimalSeparator(locale);

  const allRows = useMemo(() => models.flatMap((m) => m.rows), [models]);
  const counts = useMemo(() => {
    const c = new Map<WallKind, number>();
    for (const r of allRows) c.set(r.kind, (c.get(r.kind) ?? 0) + 1);
    return c;
  }, [allRows]);
  // Table, totals, export and row selection all work on the rows the filter shows.
  const rows = useMemo(() => allRows.filter((r) => matchesFilter(filter, r)), [allRows, filter]);
  const withoutZones = models.filter((m) => !m.hasZones);
  // The comparison variants are computed only once "more columns" asks for them.
  const variantsPending = allRows.some((r) => r.variantsPending);
  useEffect(() => {
    if (more && variantsPending && status.kind === 'done') computeVariants();
  }, [more, variantsPending, status.kind, computeVariants]);
  const table = useMemo(() => {
    const kindLabel = (k: WallKind) => t(`wallAnalysis.kind.${k}`);
    const columns = allColumns({ excludeRaveling, more, multiModel: models.length > 1, kindLabel });
    const described = [
      ...(filter.kinds ? [t('wallAnalysis.setting.filterKinds', { kinds: WALL_KINDS.filter((k) => filter.kinds?.has(k)).map(kindLabel).join(', ') })] : []),
      ...(filter.query.trim() ? [t('wallAnalysis.setting.filterQuery', { query: filter.query.trim() })] : []),
    ];
    return wallAnalysisTable(t, rows, columns, { excludeRaveling, more, dateText: new Date().toLocaleDateString(locale), filter: described });
  }, [t, rows, models.length, excludeRaveling, more, locale, filter]);

  const exportAs = useCallback(async (format: ExportFormat) => {
    const names = [...new Set(rows.map((r) => stripExtension(r.modelName)))].join('-');
    const stem = sanitizeFilename(`${names}-${table.title}`, { fallback: 'wall-analysis' });
    if (format === 'csv') downloadFile(toCsv(table), `${stem}.csv`, 'text/csv;charset=utf-8');
    else if (format === 'txt') downloadFile(toTxt(table, decimal), `${stem}.txt`, 'text/plain;charset=utf-8');
    else if (format === 'html') downloadFile(toHtml(table, decimal, locale), `${stem}.html`, 'text/html;charset=utf-8');
    else {
      const { toXlsx } = await import('@/lib/wall-analysis/xlsx');
      downloadBlob(await toXlsx(table), `${stem}.xlsx`);
    }
  }, [rows, table, decimal, locale]);

  const running = status.kind === 'running';
  const message = status.kind === 'running' ? t('wallAnalysis.computing', { done: status.done, total: status.total })
    : status.kind === 'variants' ? t('wallAnalysis.computingVariants', { done: status.done, total: status.total })
    : status.kind === 'noModel' ? t('wallAnalysis.noModel')
      : status.kind === 'noScene' ? t('wallAnalysis.noScene')
        : status.kind === 'error' ? t('wallAnalysis.failed', { message: status.message })
          : status.kind === 'done' && allRows.length === 0 ? t('wallAnalysis.noWalls')
            : null;
  const cellClass = (i: number): string => (table.columns[i].kind === 'text' ? 'text-left' : 'text-right tabular-nums');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <BrickWall className="h-4 w-4 text-amber-700" />
        <span className="flex-1 text-sm font-medium">{t('wallAnalysis.title')}</span>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} title={t('wallAnalysis.close')}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <p className="w-full text-xs text-muted-foreground">{t('wallAnalysis.intro')}</p>
        <Button size="sm" onClick={() => run(more)} disabled={running}>
          {allRows.length > 0 ? <RotateCcw className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
          {allRows.length > 0 ? t('wallAnalysis.recompute') : t('wallAnalysis.compute')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={rows.length === 0 || running}>
              <Download className="mr-1 h-3.5 w-3.5" />
              {t('wallAnalysis.export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => { void exportAs('xlsx'); }}>{t('wallAnalysis.exportXlsx')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void exportAs('csv'); }}>{t('wallAnalysis.exportCsv')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void exportAs('html'); }}>{t('wallAnalysis.exportHtml')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void exportAs('txt'); }}>{t('wallAnalysis.exportTxt')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
        <div className="flex w-full flex-wrap items-center gap-4 pt-1 text-xs">
          <label className="flex items-center gap-2" title={t('wallAnalysis.ravelingHint')}>
            <Switch checked={excludeRaveling} onCheckedChange={setExcludeRaveling} aria-label={t('wallAnalysis.excludeRaveling')} />
            {t('wallAnalysis.excludeRaveling')}
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={more} onCheckedChange={setMore} aria-label={t('wallAnalysis.moreColumns')} />
            {t('wallAnalysis.moreColumns')}
          </label>
        </div>
      </div>
      {withoutZones.map((m) => (
        <p key={m.modelId} className="border-b bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {m.partsNotInWalls ? t('wallAnalysis.modelPartsNotInWalls', { model: m.modelName }) : t('wallAnalysis.modelWithoutZones', { model: m.modelName })}
        </p>
      ))}
      {allRows.length > 0 && <WallKindFilter counts={counts} filter={filter} onChange={setFilter} />}
      {allRows.length > 0 && rows.length === 0 && (
        <p className="p-3 text-xs text-muted-foreground">{t('wallAnalysis.filter.none')}</p>
      )}
      {rows.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c.id} className={`whitespace-nowrap border-b px-2 py-1 font-medium ${cellClass(i)}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((line, r) => (
                <tr key={`${rows[r].modelId}:${rows[r].wallId}`} className="cursor-pointer hover:bg-accent" onClick={() => selectWall(rows[r])}>
                  {line.map((v, i) => (
                    <td key={table.columns[i].id} className={`whitespace-nowrap border-b px-2 py-0.5 ${cellClass(i)}`}>
                      {formatCell(v, table.columns[i].kind, decimal, table.notDeterminable)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                {table.total.map((v, i) => (
                  <td key={table.columns[i].id} className={`whitespace-nowrap border-t-2 px-2 py-1 ${cellClass(i)}`}>
                    {formatCell(v, table.columns[i].kind, decimal, table.notDeterminable)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="p-3 text-xs text-muted-foreground">{t('wallAnalysis.selectHint')}</p>
        </div>
      )}
    </div>
  );
}
