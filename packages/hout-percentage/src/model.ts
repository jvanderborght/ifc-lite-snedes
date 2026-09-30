/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which members belong to which wall, read from the IFC data (no geometry).
 *
 * hsbCAD-style timber-frame exports put every member of a wall under the
 * `IfcWall` through `IfcRelAggregates`, and tag each member with its zone in a
 * property set (`Data.Zone` in the exports this was written against). The rule
 * is configurable because other exporters name the pset differently.
 *
 * Grouping starts from the MEMBERS, not from `IfcWall`: whatever aggregates a
 * matching member is treated as its wall (an `IfcWall`, an
 * `IfcElementAssembly`, ...), and members with no aggregating parent are kept
 * in a separate bucket rather than dropped.
 */

import { RelationshipType } from '@ifc-lite/data';

/** The slice of an `IfcDataStore` this module reads. */
export interface WallStore {
  entities: {
    getName(id: number): string;
    getGlobalId(id: number): string;
    getTypeName(id: number): string;
  };
  entityIndex: { byType: { get(key: string): number[] | undefined } };
  relationships: {
    getRelated(id: number, relType: RelationshipType, direction: 'forward' | 'inverse'): number[];
  };
  getProperties(id: number): ReadonlyArray<{ name: string; properties: ReadonlyArray<{ name: string; value: unknown }> }>;
}

export interface ZoneRule {
  /** Property set holding the zone, e.g. `Data`. */
  psetName: string;
  /** Property holding the zone, e.g. `Zone`. */
  propertyName: string;
  /** Zone value to count, compared as text (`0` matches `0` and `"0"`). */
  value: string;
  /** STEP type names (UPPERCASE) of the members to count, e.g. `IFCBEAM`. */
  stepTypes: string[];
}

export const DEFAULT_ZONE_RULE: ZoneRule = {
  psetName: 'Data',
  propertyName: 'Zone',
  value: '0',
  stepTypes: ['IFCBEAM'],
};

export interface WallMembers {
  /** Aggregating element, or -1 for the "no parent" bucket. */
  wallId: number;
  name: string;
  globalId: string;
  ifcType: string;
  /** Members matching the zone rule. */
  memberIds: number[];
  /** `IfcOpeningElement`s voiding the wall or aggregated under it. */
  openingIds: number[];
}

/** First non-empty value over every pset of that name (an element can carry "Data" twice, one with an empty Zone). */
export function propertyText(store: WallStore, id: number, psetName: string, propertyName: string): string | null {
  for (const pset of store.getProperties(id)) {
    if (pset.name !== psetName) continue;
    for (const p of pset.properties) {
      if (p.name !== propertyName || p.value === null || p.value === undefined) continue;
      const text = String(p.value);
      if (text.trim() !== '') return text;
    }
  }
  return null;
}

export function collectWalls(store: WallStore, rule: ZoneRule = DEFAULT_ZONE_RULE): WallMembers[] {
  const byWall = new Map<number, number[]>();
  for (const stepType of rule.stepTypes) {
    for (const id of store.entityIndex.byType.get(stepType) ?? []) {
      if (propertyText(store, id, rule.psetName, rule.propertyName) !== rule.value) continue;
      const parent = store.relationships.getRelated(id, RelationshipType.Aggregates, 'inverse')[0] ?? -1;
      const list = byWall.get(parent);
      if (list) list.push(id); else byWall.set(parent, [id]);
    }
  }
  const walls: WallMembers[] = [];
  for (const [wallId, memberIds] of byWall) {
    if (wallId < 0) {
      walls.push({ wallId, name: '(no parent)', globalId: '', ifcType: '', memberIds, openingIds: [] });
      continue;
    }
    const openings = new Set(store.relationships.getRelated(wallId, RelationshipType.VoidsElement, 'forward'));
    for (const child of store.relationships.getRelated(wallId, RelationshipType.Aggregates, 'forward')) {
      if (store.entities.getTypeName(child) === 'IfcOpeningElement') openings.add(child);
    }
    walls.push({
      wallId,
      name: store.entities.getName(wallId),
      globalId: store.entities.getGlobalId(wallId),
      ifcType: store.entities.getTypeName(wallId),
      memberIds,
      openingIds: [...openings],
    });
  }
  return walls.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
