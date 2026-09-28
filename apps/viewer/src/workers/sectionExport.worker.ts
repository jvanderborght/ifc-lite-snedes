/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Off-main-thread section export: cuts, view lines and the DXF writer run
 * here, so the viewer stays responsive during an export of several seconds.
 * The caller rebuilds pre-cut parts on the main thread first (that needs the
 * data store, which does not cross into a worker) and sends plain meshes.
 */

import { exporteer, type ExportOpties, type ExportVerslag, type Snedevlak } from '@ifc-lite/snede-export';
import type { CoordinateInfo, MeshData } from '@ifc-lite/geometry';

/** What a section export needs of a mesh; everything else stays behind. */
export interface SectionExportMesh {
  expressId: number;
  ifcType?: string;
  geometryClass?: number;
  positions: Float32Array;
  indices: Uint32Array;
  origin?: [number, number, number];
}

export interface SectionExportWorkerRequest {
  type: 'export';
  id: number;
  meshes: SectionExportMesh[];
  info: CoordinateInfo | undefined;
  planes: Snedevlak[];
  /** Everything but `herstel`, which is applied before the meshes are sent. */
  options: Omit<ExportOpties, 'herstel'>;
}

export type SectionExportWorkerResponse =
  | { type: 'complete'; id: number; dxf: string; report: ExportVerslag }
  | { type: 'error'; id: number; message: string };

export function slimMesh(m: MeshData): SectionExportMesh {
  return { expressId: m.expressId, ifcType: m.ifcType, geometryClass: m.geometryClass, positions: m.positions, indices: m.indices, origin: m.origin };
}

/** The export itself, callable from either thread. */
export async function runSectionExport(request: Omit<SectionExportWorkerRequest, 'type' | 'id'>): Promise<{ dxf: string; report: ExportVerslag }> {
  // The generator reads positions, indices, origin, ids and classes only.
  const meshes = request.meshes as unknown as MeshData[];
  const { dxf, verslag } = await exporteer(meshes, request.info, request.planes, request.options);
  return { dxf, report: verslag };
}

const isWorkerScope =
  typeof self !== 'undefined' &&
  typeof (globalThis as { window?: unknown }).window === 'undefined' &&
  typeof (self as unknown as Worker).postMessage === 'function';

if (isWorkerScope) {
  self.onmessage = async (event: MessageEvent<SectionExportWorkerRequest>) => {
    const request = event.data;
    if (!request || request.type !== 'export') return;
    try {
      const { dxf, report } = await runSectionExport(request);
      const reply: SectionExportWorkerResponse = { type: 'complete', id: request.id, dxf, report };
      (self as unknown as Worker).postMessage(reply);
    } catch (error) {
      const reply: SectionExportWorkerResponse = {
        type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error),
      };
      (self as unknown as Worker).postMessage(reply);
    }
  };
}
