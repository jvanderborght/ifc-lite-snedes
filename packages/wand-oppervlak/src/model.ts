/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which products make up each wall, read from the IFC data (no geometry).
 *
 * Two layouts are supported side by side:
 * - timber-frame exports (hsbCAD): the `IfcWall` has no body; every layer is
 *   a separate product under it through `IfcRelAggregates` (possibly nested),
 *   tagged with its zone in a property set (`Data.Zone` by default);
 * - single-body walls (Revit `IfcWallStandardCase`): the wall's own body is
 *   the only part, openings void it.
 * A wall with both (own body AND parts) simply contributes both.
 *
 * Doors, windows and opening elements are never parts of the wall face, even
 * when an exporter aggregates them under the wall (hsbCAD does).
 */

import { RelationshipType } from '@ifc-lite/data';

type Psets = ReadonlyArray<{ name: string; properties: ReadonlyArray<{ name: string; value: unknown }> }>;
type Qsets = ReadonlyArray<{ name: string; quantities: ReadonlyArray<{ name: string; value: unknown }> }>;

/** The slice of an `IfcDataStore` this module reads. */
export interface WallAreaStore {
  entities: {
    getName(id: number): string;
    getGlobalId(id: number): string;
    getTypeName(id: number): string;
  };
  entityIndex: { byType: { get(key: string): number[] | undefined } };
  relationships: {
    getRelated(id: number, relType: RelationshipType, direction: 'forward' | 'inverse'): number[];
  };
  getProperties(id: number): Psets;
  getQuantities?(id: number): Qsets;
  /** Model length unit in metres (0.001 for millimetres). */
  lengthUnitScale?: number;
}

export interface WallModelOptions {
  /** STEP type names (UPPERCASE) treated as walls. */
  wallTypes?: string[];
  /** IFC type names never counted as part of the wall face. */
  excludedPartTypes?: string[];
  /** Zone property; `null` disables zones (no per-side areas). */
  zone?: { psetName: string; propertyName: string } | null;
}

export const DEFAULT_WALL_TYPES = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'];
export const DEFAULT_EXCLUDED_PART_TYPES = ['IfcOpeningElement', 'IfcDoor', 'IfcWindow', 'IfcVirtualElement'];
export const DEFAULT_ZONE = { psetName: 'Data', propertyName: 'Zone' };
const OPENING_MARKER_TYPES = new Set(['IfcOpeningElement', 'IfcDoor', 'IfcWindow']);

/** Areas an exporter wrote itself, for comparison. Areas m², lengths m. */
export interface DeclaredQuantities {
  /** `GrossSideArea` from `Qto_WallBaseQuantities` (or Revit's IFC2x3 `BaseQuantities`). */
  grossSideArea: number | null;
  netSideArea: number | null;
  /** Name of the quantity set the side areas came from. */
  quantitySet: string | null;
  /** hsbCAD pset `Dimensions`: `Length` and `Base Height` (a rectangle, even for gables). */
  dimensionsLength: number | null;
  dimensionsHeight: number | null;
}

export interface WallParts {
  wallId: number;
  name: string;
  globalId: string;
  ifcType: string;
  /** The wall itself (when it has a body) plus every aggregated descendant
   *  that is not excluded by type. Products without geometry are harmless. */
  partIds: number[];
  /** Zone text per part id; parts without a zone are absent. */
  zones: Map<number, string>;
  /** IFC type name per part id. */
  partTypes: Map<number, string>;
  /** `IfcOpeningElement`s voiding the wall. */
  openingIds: number[];
  /** Everything that marks an opening in the wall: the voiding openings plus
   *  any `IfcOpeningElement`, `IfcDoor` or `IfcWindow` the wall aggregates
   *  (hsbCAD puts its doors, windows and some openings there). */
  openingMarkerIds: number[];
  /** IFC type name per marker id. */
  markerTypes: Map<number, string>;
  /** Wall that aggregates this one (Revit stacked walls), else null. Such a
   *  wall's parts are also counted under its parent: totals skip it. */
  parentWallId: number | null;
  declared: DeclaredQuantities;
}

function propertyValue(psets: Psets, psetName: string, propertyName: string): unknown {
  for (const pset of psets) {
    if (pset.name !== psetName) continue;
    for (const p of pset.properties) if (p.name === propertyName && p.value !== null && p.value !== undefined) return p.value;
  }
  return undefined;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function declaredQuantities(store: WallAreaStore, wallId: number): DeclaredQuantities {
  const scale = store.lengthUnitScale ?? 1;
  let grossSideArea: number | null = null, netSideArea: number | null = null, quantitySet: string | null = null;
  const qsets = [...(store.getQuantities?.(wallId) ?? [])];
  // The standard set wins over any other set carrying the same names.
  qsets.sort((a, b) => Number(b.name === 'Qto_WallBaseQuantities') - Number(a.name === 'Qto_WallBaseQuantities'));
  for (const q of qsets) {
    const g = num(q.quantities.find((x) => x.name === 'GrossSideArea')?.value);
    const n = num(q.quantities.find((x) => x.name === 'NetSideArea')?.value);
    if (g === null && n === null) continue;
    grossSideArea = g; netSideArea = n; quantitySet = q.name;
    break;
  }
  const psets = store.getProperties(wallId);
  const l = num(propertyValue(psets, 'Dimensions', 'Length'));
  const h = num(propertyValue(psets, 'Dimensions', 'Base Height'));
  return {
    grossSideArea, netSideArea, quantitySet,
    dimensionsLength: l === null ? null : l * scale,
    dimensionsHeight: h === null ? null : h * scale,
  };
}

export function collectWalls(store: WallAreaStore, options: WallModelOptions = {}): WallParts[] {
  const wallTypes = options.wallTypes ?? DEFAULT_WALL_TYPES;
  const excluded = new Set(options.excludedPartTypes ?? DEFAULT_EXCLUDED_PART_TYPES);
  const zoneRule = options.zone === undefined ? DEFAULT_ZONE : options.zone;
  const walls: WallParts[] = [];
  const seen = new Set<number>();
  for (const stepType of wallTypes) {
    for (const wallId of store.entityIndex.byType.get(stepType) ?? []) {
      if (seen.has(wallId)) continue;
      seen.add(wallId);
      const partIds = [wallId];
      const partTypes = new Map<number, string>([[wallId, store.entities.getTypeName(wallId)]]);
      const markers = new Set<number>();
      const markerTypes = new Map<number, string>();
      const stack = [wallId];
      const visited = new Set(stack);
      while (stack.length > 0) {
        const id = stack.pop() as number;
        for (const child of store.relationships.getRelated(id, RelationshipType.Aggregates, 'forward')) {
          if (visited.has(child)) continue;
          visited.add(child);
          stack.push(child);
          const type = store.entities.getTypeName(child);
          if (OPENING_MARKER_TYPES.has(type)) { markers.add(child); markerTypes.set(child, type); }
          if (excluded.has(type)) continue;
          partIds.push(child);
          partTypes.set(child, type);
        }
      }
      const zones = new Map<number, string>();
      if (zoneRule) {
        for (const id of partIds) {
          const z = propertyValue(store.getProperties(id), zoneRule.psetName, zoneRule.propertyName);
          if (z !== undefined && String(z).trim() !== '') zones.set(id, String(z).trim());
        }
      }
      const openingIds = store.relationships.getRelated(wallId, RelationshipType.VoidsElement, 'forward')
        .filter((id) => store.entities.getTypeName(id).startsWith('IfcOpening'));
      for (const id of openingIds) { markers.add(id); markerTypes.set(id, store.entities.getTypeName(id)); }
      walls.push({
        wallId,
        name: store.entities.getName(wallId),
        globalId: store.entities.getGlobalId(wallId),
        ifcType: store.entities.getTypeName(wallId),
        partIds, partTypes, zones, openingIds, openingMarkerIds: [...markers], markerTypes,
        parentWallId: store.relationships.getRelated(wallId, RelationshipType.Aggregates, 'inverse')
          .find((id) => wallTypes.includes(store.entities.getTypeName(id).toUpperCase())) ?? null,
        declared: declaredQuantities(store, wallId),
      });
    }
  }
  return walls.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
