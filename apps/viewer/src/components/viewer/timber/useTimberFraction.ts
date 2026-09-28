/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Runs the timber-fraction calculation (`@ifc-lite/hout-percentage`) over
 * every loaded model, on request only.
 *
 * Geometry comes from the renderer's Scene, the same pieces the zone
 * apportionment reads (`getMeshDataPieces`, then the instanced fallback),
 * keyed by the federated global id — so federation needs no special case.
 * Members and zones come from each model's own `IfcDataStore`.
 *
 * The work is sliced per wall with a macrotask yield between walls, so the
 * UI stays responsive and the progress line moves.
 *
 * Teardown: results are cached per `IfcDataStore` object in a WeakMap, never
 * in the viewer store. A removed or replaced model drops its store, and with
 * it the cache entry; the panel re-derives which models are loaded from the
 * live `models` Map on every render, so it can never show a stale model.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authoredVolume, collectWalls, computeWall, type WallResult } from '@ifc-lite/hout-percentage';
import type { MeshData } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { getAllModelEntries } from '@/sdk/adapters/model-compat';
import { getGlobalRenderer } from '@/hooks/useBCF';

export interface TimberEntry {
  modelId: string;
  modelName: string;
  wall: WallResult;
}

export type TimberStatus =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done' }
  | { kind: 'noModel' }
  | { kind: 'noScene' }
  | { kind: 'error'; message: string };

const cache = new WeakMap<IfcDataStore, TimberEntry[]>();

const nextMacrotask = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

type ModelsState = Parameters<typeof getAllModelEntries>[0];

/** Opening meshes by (federated) global id, from every model's geometry result. */
function openingMeshes(): Map<number, MeshData[]> {
  const state = useViewerStore.getState();
  const results = state.models.size > 0 ? [...state.models.values()].map((m) => m.geometryResult) : [state.geometryResult];
  const out = new Map<number, MeshData[]>();
  for (const result of results) {
    for (const mesh of result?.meshes ?? []) {
      if (mesh.ifcType !== 'IfcOpeningElement' || (mesh.geometryClass ?? 0) === 2) continue;
      const list = out.get(mesh.expressId);
      if (list) list.push(mesh); else out.set(mesh.expressId, [mesh]);
    }
  }
  return out;
}

function loadedStores(state: ModelsState): Array<{ id: string; name: string; store: IfcDataStore }> {
  const out: Array<{ id: string; name: string; store: IfcDataStore }> = [];
  for (const [, model] of getAllModelEntries({ models: state.models, ifcDataStore: state.ifcDataStore })) {
    if (model.ifcDataStore) out.push({ id: model.id, name: model.name, store: model.ifcDataStore });
  }
  return out;
}

export function useTimberFraction(): { entries: TimberEntry[]; status: TimberStatus; run: () => void } {
  const models = useViewerStore((s) => s.models);
  const legacyStore = useViewerStore((s) => s.ifcDataStore);
  const [status, setStatus] = useState<TimberStatus>({ kind: 'idle' });
  const [revision, setRevision] = useState(0);
  const runToken = useRef(0);

  // Abandon a running calculation when the panel unmounts.
  useEffect(() => () => { runToken.current++; }, []);

  // `revision` re-reads the cache after a run; `models`/`legacyStore` after a load or removal.
  const entries = useMemo(() => {
    const out: TimberEntry[] = [];
    for (const m of loadedStores({ models, ifcDataStore: legacyStore })) out.push(...(cache.get(m.store) ?? []));
    return revision >= 0 ? out : [];
  }, [models, legacyStore, revision]);

  const run = useCallback(() => {
    const token = ++runToken.current;
    const stores = loadedStores(useViewerStore.getState());
    if (stores.length === 0) { setStatus({ kind: 'noModel' }); return; }
    const scene = getGlobalRenderer()?.getScene();
    if (!scene) { setStatus({ kind: 'noScene' }); return; }
    const toGlobalId = useViewerStore.getState().toGlobalId;
    const openings = openingMeshes();

    const jobs = stores.flatMap((m) => collectWalls(m.store).map((wall) => ({ m, wall })));
    const fresh = new Map<IfcDataStore, TimberEntry[]>(stores.map((m) => [m.store, []]));
    setStatus({ kind: 'running', done: 0, total: jobs.length });

    void (async () => {
      try {
        for (let i = 0; i < jobs.length; i++) {
          const { m, wall } = jobs[i];
          const scale = m.store.lengthUnitScale ?? 1;
          const result = computeWall(
            wall,
            (id) => {
              const g = toGlobalId(m.id, id);
              return scene.getMeshDataPieces(g) ?? scene.getInstancedMeshDataPieces?.(g) ?? openings.get(g) ?? [];
            },
            { authoredVolume: (id) => authoredVolume(m.store, id, scale) },
          );
          fresh.get(m.store)?.push({ modelId: m.id, modelName: m.name, wall: result });
          await nextMacrotask();
          if (token !== runToken.current) return;
          setStatus({ kind: 'running', done: i + 1, total: jobs.length });
        }
        for (const [store, list] of fresh) cache.set(store, list);
        setRevision((r) => r + 1);
        setStatus({ kind: 'done' });
      } catch (err) {
        console.error('[timber-fraction] calculation failed', err);
        if (token === runToken.current) setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
  }, []);

  return { entries, status, run };
}
