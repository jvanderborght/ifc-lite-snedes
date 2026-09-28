/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ExportVerslag } from '@ifc-lite/snede-export';
import { exportSectionsOffThread, type SectionExportWorkerLike } from './export-worker-client.js';
import type { SectionExportWorkerRequest, SectionExportWorkerResponse } from '@/workers/sectionExport.worker.js';

const job = { meshes: [], info: undefined, planes: [], options: {} };

/** A fake worker that answers every request with `reply(request)`. */
function fakeWorker(reply: (r: SectionExportWorkerRequest) => SectionExportWorkerResponse): SectionExportWorkerLike & { terminated: boolean } {
  const w: SectionExportWorkerLike & { terminated: boolean } = {
    onmessage: null, onerror: null, terminated: false,
    postMessage(r) { queueMicrotask(() => w.onmessage?.({ data: reply(r) } as MessageEvent<SectionExportWorkerResponse>)); },
    terminate() { w.terminated = true; },
  };
  return w;
}

describe('exportSectionsOffThread', () => {
  it('resolves with the worker answer and terminates the worker', async () => {
    const worker = fakeWorker((r) => ({ type: 'complete', id: r.id, dxf: 'DXF', report: { snedes: [] } as unknown as ExportVerslag }));
    const out = await exportSectionsOffThread(job, { workerFactory: () => worker });
    assert.equal(out.dxf, 'DXF');
    assert.equal(worker.terminated, true);
  });

  it('rejects with the worker error message', async () => {
    const worker = fakeWorker((r) => ({ type: 'error', id: r.id, message: 'kapot' }));
    await assert.rejects(exportSectionsOffThread(job, { workerFactory: () => worker }), /kapot/);
    assert.equal(worker.terminated, true);
  });

  it('exports on this thread when no worker can be started', async () => {
    const out = await exportSectionsOffThread(job, { workerFactory: () => { throw new Error('no workers here'); } });
    assert.match(out.dxf, /^ {2}0\nSECTION\n/);
    assert.deepEqual(out.report.snedes, []);
  });
});
