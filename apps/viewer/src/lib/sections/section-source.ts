/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Read what the multi-section DXF export needs from the live viewer.
 *
 * The mesh set comes from the 3D-view PDF export's source (`readViewPdfSource`)
 * so both exports draw the model the screen shows: GPU-instanced occurrences
 * materialized (they are absent from `geometryResult.meshes`), every
 * visibility channel folded, type-library geometry dropped. Two things differ
 * from the PDF:
 *
 *  - Hidden elements can be kept (the export setting "export hidden
 *    elements"); isolation always applies.
 *  - Instanced pieces carry no `ifcType`, but the DXF puts every class on its
 *    own layer and never draws openings or spaces, so the type is looked up in
 *    the owning model's data store.
 *
 * The current cut is converted with `resolveKeptHalfSpace`, the same
 * derivation the on-screen clip uses (building rotation and flip included), so
 * a saved section is exactly the cut the user saw.
 */

import type { CoordinateInfo, GeometryDiagnostics, MeshData } from '@ifc-lite/geometry';
import { vlakUitHalfruimte } from '@ifc-lite/snede-export';
import { collectViewMeshes } from '@/lib/export/view-pdf/collect-view-meshes';
import { readViewPdfSource, resolveSectionInput, visibleCoordinateInfo } from '@/lib/export/view-pdf/view-pdf-export-source';
import { resolveKeptHalfSpace } from '@/lib/export/view-pdf/view-section-plane';
import type { useViewerStore } from '@/store';
import type { WorldVec3 } from './saved-section';

type ViewerState = ReturnType<typeof useViewerStore.getState>;

export interface SectionExportSource {
  meshes: MeshData[];
  coordinateInfo: CoordinateInfo | undefined;
  /** Ids of hidden elements that were left out (for the report). */
  hiddenLeftOut: Set<number>;
  /** Diagnostics of the first visible model, when its load path captured them. */
  diagnostics: GeometryDiagnostics | undefined;
  /** Add to a diagnostics product id (local to that model) to get a global id. */
  diagnosticsIdOffset: number;
}

/** Meshes and frame for an export. `includeHidden` keeps elements hidden in the viewer. */
export function readSectionExportSource(state: ViewerState, includeHidden: boolean): SectionExportSource {
  const { view } = readViewPdfSource(state);
  const hidden = view.hiddenEntities ?? new Set<number>();
  const shown = collectViewMeshes(view);
  const meshes = includeHidden ? collectViewMeshes({ ...view, hiddenEntities: null }) : shown;
  const hiddenLeftOut = new Set<number>();
  if (!includeHidden && hidden.size) {
    for (const m of collectViewMeshes({ ...view, hiddenEntities: null })) if (hidden.has(m.expressId)) hiddenLeftOut.add(m.expressId);
  }
  return {
    meshes: withIfcTypes(state, meshes),
    coordinateInfo: visibleCoordinateInfo(state) ?? undefined,
    hiddenLeftOut,
    diagnostics: firstVisibleModel(state)?.diagnostics ?? undefined,
    diagnosticsIdOffset: firstVisibleModel(state)?.idOffset ?? 0,
  };
}

function firstVisibleModel(state: ViewerState) {
  for (const model of state.models.values()) if (model.visible && model.geometryResult) return model;
  return undefined;
}

/** Fill `ifcType` on meshes that lack it (instanced pieces) from their model's data store. */
function withIfcTypes(state: ViewerState, meshes: MeshData[]): MeshData[] {
  if (meshes.every((m) => m.ifcType)) return meshes;
  const models = [...state.models.values()];
  const cache = new Map<number, string | undefined>();
  const typeOf = (globalId: number): string | undefined => {
    if (cache.has(globalId)) return cache.get(globalId);
    let type: string | undefined;
    if (models.length === 0) {
      type = state.ifcDataStore?.entities?.getTypeName(globalId) ?? undefined;
    } else {
      for (const model of models) {
        const offset = model.idOffset ?? 0;
        if (globalId > offset && globalId <= offset + (model.maxExpressId ?? 0)) {
          type = model.ifcDataStore?.entities?.getTypeName(globalId - offset) ?? undefined;
          break;
        }
      }
    }
    cache.set(globalId, type);
    return type;
  };
  return meshes.map((m) => (m.ifcType ? m : { ...m, ifcType: typeOf(m.expressId) }));
}

/**
 * The cut currently on screen as a world plane (IFC, mm), or null when no cut
 * is active or its bounds are not known yet.
 */
export function readCurrentCut(state: ViewerState): { origin: WorldVec3; direction: WorldVec3 } | null {
  const section = resolveSectionInput(state);
  if (!section) return null;
  const vlak = vlakUitHalfruimte(resolveKeptHalfSpace(section), visibleCoordinateInfo(state) ?? undefined, '');
  return { origin: vlak.oorsprong, direction: vlak.normaal };
}
