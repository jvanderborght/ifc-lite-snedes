/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * hsbCAD zones: timber-frame exports tag every part (stud, sheet, batten,
 * foil) with the zone of the element it belongs to, in property set `Data`,
 * property `Zone` (0 the frame, negative and positive zones the layers on
 * either side). These are properties, not `IfcZone` groups, so the Groups
 * tab of the hierarchy does not show them; this groups the elements by that
 * value for the zone list.
 */

type Psets = ReadonlyArray<{ name: string; properties: ReadonlyArray<{ name: string; value: unknown }> }>;

export const ZONE_PSET = 'Data';
export const ZONE_PROPERTY = 'Zone';

/** The hsbCAD zone of an element as text ("0", "-3", ...), or null without one. */
export function zoneOf(psets: Psets): string | null {
  for (const set of psets) {
    if (set.name !== ZONE_PSET) continue;
    for (const p of set.properties) {
      if (p.name !== ZONE_PROPERTY || p.value === null || p.value === undefined) continue;
      const text = String(p.value).trim();
      if (!text) continue;
      const n = Number(text);
      return Number.isFinite(n) ? String(n) : text;
    }
  }
  return null;
}

export interface ZoneGroup {
  /** Zone value, or null for the elements without a zone. */
  zone: string | null;
  /** Federated (global) ids, as the visibility actions take them. */
  ids: number[];
}

/**
 * Group elements by zone: numeric zones in ascending order (-5 … 5, 10),
 * other text after them, the elements without a zone last. `null` when no
 * element carries a zone at all (not a zoned timber-frame model).
 */
export function groupByZone(items: Iterable<{ id: number; zone: string | null }>): ZoneGroup[] | null {
  const byZone = new Map<string | null, number[]>();
  for (const { id, zone } of items) {
    const list = byZone.get(zone);
    if (list) list.push(id); else byZone.set(zone, [id]);
  }
  if (![...byZone.keys()].some((z) => z !== null)) return null;
  const rank = (z: string | null): [number, number, string] => {
    if (z === null) return [2, 0, ''];
    const n = Number(z);
    return Number.isFinite(n) ? [0, n, z] : [1, 0, z];
  };
  return [...byZone.entries()]
    .map(([zone, ids]) => ({ zone, ids }))
    .sort((a, b) => {
      const [ga, na, ta] = rank(a.zone);
      const [gb, nb, tb] = rank(b.zone);
      return ga - gb || na - nb || ta.localeCompare(tb);
    });
}

/** Shown, hidden or partly hidden, from the ids currently hidden. */
export function zoneState(ids: readonly number[], hidden: ReadonlySet<number>): 'shown' | 'hidden' | 'mixed' {
  let n = 0;
  for (const id of ids) if (hidden.has(id)) n++;
  return n === 0 ? 'shown' : n === ids.length ? 'hidden' : 'mixed';
}
