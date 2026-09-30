/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What kind of element a wall row is, for filtering the table: exterior,
 * interior, party wall, floor or roof.
 *
 * The element number is the most reliable source in timber-frame exports:
 * a letter between digits, as in `00E12` or `C_01B27` (E exterior, B and I
 * interior, P party wall, F floor, R roof). The spatial tree is not (walls of
 * every kind under one "exterior walls" node) and `Pset_WallCommon.IsExternal`
 * is sometimes left false for every wall, so IsExternal is only used when the
 * name carries no code.
 */

export type WallKind = 'exterior' | 'interior' | 'party' | 'floor' | 'roof' | 'unknown';
export type WallKindSource = 'code' | 'isExternal' | 'none';

export const WALL_KINDS: readonly WallKind[] = ['exterior', 'interior', 'party', 'floor', 'roof', 'unknown'];

const CODE: Readonly<Record<string, WallKind>> = { E: 'exterior', B: 'interior', I: 'interior', P: 'party', F: 'floor', R: 'roof' };

/** Kind from the element number: the last letter that sits between digits. */
export function kindFromName(name: string): WallKind | null {
  const codes = [...name.matchAll(/\d([A-Za-z])(?=\d)/g)];
  if (!codes.length) return null;
  return CODE[codes[codes.length - 1][1].toUpperCase()] ?? null;
}

/** `IsExternal` from any property set of the wall; null when absent or unreadable. */
export function isExternalOf(psets: ReadonlyArray<{ properties: ReadonlyArray<{ name: string; value: unknown }> }>): boolean | null {
  for (const set of psets) {
    for (const p of set.properties) {
      if (p.name !== 'IsExternal') continue;
      const v = typeof p.value === 'string' ? p.value.trim().toUpperCase() : p.value;
      if (v === true || v === 'TRUE' || v === '.T.' || v === 'T') return true;
      if (v === false || v === 'FALSE' || v === '.F.' || v === 'F') return false;
    }
  }
  return null;
}

export function wallKind(name: string, isExternal: boolean | null): { kind: WallKind; source: WallKindSource } {
  const fromCode = kindFromName(name);
  if (fromCode) return { kind: fromCode, source: 'code' };
  if (isExternal !== null) return { kind: isExternal ? 'exterior' : 'interior', source: 'isExternal' };
  return { kind: 'unknown', source: 'none' };
}
