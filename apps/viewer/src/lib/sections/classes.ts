/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * IFC classes that get their own DXF layers in a section export: the classes
 * of the visible models' geometry, named like the layers (`klasseNaam`), minus
 * the ones the export never draws, plus the classes of the built-in colour
 * table, so the table can be edited before a model has them.
 */

import { klasseNaam, NIET_TEKENEN, STANDAARD_KLEUREN } from '@ifc-lite/snede-export';
import type { useViewerStore } from '@/store';

type ViewerState = ReturnType<typeof useViewerStore.getState>;

export function exportClasses(state: ViewerState): { inModel: string[]; others: string[] } {
  const seen = new Set<string>();
  for (const model of state.models.values()) {
    if (!model.visible) continue;
    for (const mesh of model.geometryResult?.meshes ?? []) {
      if (!mesh.ifcType || NIET_TEKENEN.has(mesh.ifcType.toUpperCase())) continue;
      seen.add(klasseNaam(mesh.ifcType));
    }
  }
  const inModel = [...seen].sort();
  const others = Object.keys(STANDAARD_KLEUREN).filter((c) => !seen.has(c)).sort();
  return { inModel, others };
}
