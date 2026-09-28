/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Main-thread client for `workers/sectionExport.worker.ts`: one worker per
 * export, terminated when it answers. Falls back to running the export on
 * this thread when no worker can be started (tests, restricted contexts).
 */

import type { ExportVerslag } from '@ifc-lite/snede-export';
import type {
  SectionExportWorkerRequest,
  SectionExportWorkerResponse,
} from '@/workers/sectionExport.worker.js';

export type SectionExportJob = Omit<SectionExportWorkerRequest, 'type' | 'id'>;

export interface SectionExportWorkerLike {
  onmessage: ((event: MessageEvent<SectionExportWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SectionExportWorkerRequest): void;
  terminate(): void;
}

/** A section export can take a while on a large model; give up after this. */
export const SECTION_EXPORT_TIMEOUT_MS = 300_000;

const defaultFactory = (): SectionExportWorkerLike =>
  new Worker(new URL('../../workers/sectionExport.worker.ts', import.meta.url), { type: 'module' }) as unknown as SectionExportWorkerLike;

export async function exportSectionsOffThread(
  job: SectionExportJob,
  options: { workerFactory?: () => SectionExportWorkerLike; timeoutMs?: number } = {},
): Promise<{ dxf: string; report: ExportVerslag }> {
  let worker: SectionExportWorkerLike;
  try {
    if (!options.workerFactory && typeof Worker === 'undefined') throw new Error('no Worker in this context');
    worker = (options.workerFactory ?? defaultFactory)();
  } catch (error) {
    console.warn('[sections] export worker unavailable, exporting on the main thread', error);
    const { runSectionExport } = await import('@/workers/sectionExport.worker.js');
    return runSectionExport(job);
  }
  const id = 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => settle(() => reject(new Error('The section export worker stopped responding'))),
      options.timeoutMs ?? SECTION_EXPORT_TIMEOUT_MS);
    function settle(fn: () => void): void {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      fn();
    }
    worker.onmessage = (event) => {
      const m = event.data;
      if (!m || m.id !== id) return;
      if (m.type === 'complete') settle(() => resolve({ dxf: m.dxf, report: m.report }));
      else settle(() => reject(new Error(m.message)));
    };
    worker.onerror = (event) => settle(() => reject(new Error(event.message || 'The section export worker failed')));
    worker.postMessage({ type: 'export', id, ...job });
  });
}
