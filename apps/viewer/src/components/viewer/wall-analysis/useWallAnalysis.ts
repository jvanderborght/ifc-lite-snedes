/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Runs the wall analysis (`lib/wall-analysis/compute.ts`) over every loaded
 * model, on request only.
 *
 * Geometry: the renderer's Scene pieces keyed by the federated global id
 * (`getMeshDataPieces`, then the instanced fallback), plus the opening
 * elements' meshes from each model's geometry result (the Scene does not keep
 * those). Walls, parts and zones come from each model's own `IfcDataStore`;
 * the authored B-reps are read from it too.
 *
 * The work is sliced per step of a wall (area, then NPR) with a macrotask
 * yield in between, so the viewer stays usable and the progress line moves.
 * The table is shown as soon as the main figures are in. The comparison
 * variants ("more columns", about a third of the work) are only computed when
 * asked for: right after the main pass when "more columns" is on, or later
 * through `computeVariants`, refreshing the table every few walls. A newer
 * run, or the panel unmounting, abandons the running one.
 *
 * Teardown: results, and the walls still waiting for their variants, are
 * cached per `IfcDataStore` object in WeakMaps, never in the viewer store. A
 * removed or replaced model drops its store, and with it the entries; the
 * panel re-derives which models are loaded from the live `models` Map on
 * every render, so it can never show a stale model.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MeshData } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { WallParts } from '@ifc-lite/wand-oppervlak';
import { useViewerStore } from '@/store';
import { getAllModelEntries } from '@/sdk/adapters/model-compat';
import { getGlobalRenderer } from '@/hooks/useBCF';
import type { WallAnalysisRow } from '@/lib/wall-analysis/columns';
import { addVariants, analyseWallSteps, planModel } from '@/lib/wall-analysis/compute';

export interface ModelAnalysis {
  modelId: string;
  modelName: string;
  hasZones: boolean;
  /** Zoned parts exist but hang under no wall (export without aggregation). */
  partsNotInWalls: boolean;
  rows: WallAnalysisRow[];
}

export type WallAnalysisStatus =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'variants'; done: number; total: number }
  | { kind: 'done' }
  | { kind: 'noModel' }
  | { kind: 'noScene' }
  | { kind: 'error'; message: string };

type PendingVariant = { index: number; wall: WallParts; modelId: string };

const cache = new WeakMap<IfcDataStore, ModelAnalysis>();
/** Walls whose comparison variants are not computed yet, per model store (row index into its cache entry). */
const pendingVariants = new WeakMap<IfcDataStore, PendingVariant[]>();

/**
 * Give the main thread back for one task. A MessageChannel message, not
 * setTimeout(0): browsers clamp timers in a background tab to about one per
 * second, which would stretch a run over many steps to minutes.
 */
const nextMacrotask = (): Promise<void> => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
  channel.port2.postMessage(null);
});

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

/** Mesh lookup by (model, express id): the Scene's pieces, then opening meshes; null without a Scene. */
function meshLookup(): ((modelId: string) => (id: number) => readonly MeshData[]) | null {
  const scene = getGlobalRenderer()?.getScene();
  if (!scene) return null;
  const toGlobalId = useViewerStore.getState().toGlobalId;
  const openings = openingMeshes();
  return (modelId: string) => (id: number) => {
    const g = toGlobalId(modelId, id);
    return scene.getMeshDataPieces(g) ?? scene.getInstancedMeshDataPieces?.(g) ?? openings.get(g) ?? [];
  };
}

export function useWallAnalysis(): {
  models: ModelAnalysis[];
  status: WallAnalysisStatus;
  run: (withVariants: boolean) => void;
  computeVariants: () => void;
} {
  const models = useViewerStore((s) => s.models);
  const legacyStore = useViewerStore((s) => s.ifcDataStore);
  const [status, setStatus] = useState<WallAnalysisStatus>({ kind: 'idle' });
  const [revision, setRevision] = useState(0);
  const runToken = useRef(0);

  useEffect(() => () => { runToken.current++; }, []);

  // `revision` re-reads the cache after a run; `models`/`legacyStore` after a load or removal.
  const analysed = useMemo(() => {
    const out: ModelAnalysis[] = [];
    for (const m of loadedStores({ models, ifcDataStore: legacyStore })) {
      const hit = cache.get(m.store);
      if (hit) out.push(hit);
    }
    return revision >= 0 ? out : [];
  }, [models, legacyStore, revision]);

  /** The variants pass over every loaded model's pending walls. */
  const variantsPass = useCallback(async (token: number): Promise<void> => {
    const lookup = meshLookup();
    if (!lookup) { setStatus({ kind: 'noScene' }); return; }
    const jobs = loadedStores(useViewerStore.getState()).flatMap((m) => {
      const entry = cache.get(m.store);
      return entry ? (pendingVariants.get(m.store) ?? []).map((p) => ({ ...p, store: m.store, entry })) : [];
    });
    for (let k = 0; k < jobs.length; k++) {
      if (k === 0) setStatus({ kind: 'variants', done: 0, total: jobs.length });
      const { store, entry, index, wall, modelId } = jobs[k];
      entry.rows[index] = addVariants(store, wall, lookup(modelId), entry.rows[index]);
      await nextMacrotask();
      if (token !== runToken.current) return;
      if (k % 5 === 4 || k === jobs.length - 1) {
        setRevision((r) => r + 1);
        setStatus({ kind: 'variants', done: k + 1, total: jobs.length });
      }
    }
    for (const j of jobs) pendingVariants.delete(j.store);
    setStatus({ kind: 'done' });
  }, []);

  const computeVariants = useCallback(() => {
    const token = ++runToken.current;
    variantsPass(token).catch((err) => {
      console.error('[wall-analysis] variants failed', err);
      if (token === runToken.current) setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    });
  }, [variantsPass]);

  const run = useCallback((withVariants: boolean) => {
    const token = ++runToken.current;
    const stores = loadedStores(useViewerStore.getState());
    if (stores.length === 0) { setStatus({ kind: 'noModel' }); return; }
    const lookup = meshLookup();
    if (!lookup) { setStatus({ kind: 'noScene' }); return; }

    const plans = stores.map((m) => ({ m, plan: planModel(m.store) }));
    const fresh = new Map<IfcDataStore, ModelAnalysis>(plans.map(({ m, plan }) => [m.store, { modelId: m.id, modelName: m.name, hasZones: plan.hasZones, partsNotInWalls: plan.partsNotInWalls, rows: [] }]));
    const jobs = plans.flatMap(({ m, plan }) => plan.walls.map((wall) => ({ m, wall })));
    setStatus({ kind: 'running', done: 0, total: jobs.length });
    const abandoned = () => token !== runToken.current;

    void (async () => {
      try {
        const pending = new Map<IfcDataStore, PendingVariant[]>();
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          const steps = analyseWallSteps(job.m.store, job.wall, lookup(job.m.id), { id: job.m.id, name: job.m.name });
          let step = steps.next();
          while (!step.done) {
            await nextMacrotask();
            if (abandoned()) return;
            step = steps.next();
          }
          const entry = fresh.get(job.m.store);
          const row = entry?.partsNotInWalls && step.value.npr.status === 'noZones' ? { ...step.value, partsNotInWall: true } : step.value;
          if (entry) {
            const index = entry.rows.push(row) - 1;
            if (row.variantsPending) {
              const list = pending.get(job.m.store) ?? [];
              list.push({ index, wall: job.wall, modelId: job.m.id });
              pending.set(job.m.store, list);
            }
          }
          await nextMacrotask();
          if (abandoned()) return;
          setStatus({ kind: 'running', done: i + 1, total: jobs.length });
        }
        for (const [store, entry] of fresh) {
          cache.set(store, entry);
          pendingVariants.set(store, pending.get(store) ?? []);
        }
        setRevision((r) => r + 1);
        if (withVariants) await variantsPass(token);
        else setStatus({ kind: 'done' });
      } catch (err) {
        console.error('[wall-analysis] calculation failed', err);
        if (token === runToken.current) setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
  }, [variantsPass]);

  return { models: analysed, status, run, computeVariants };
}
