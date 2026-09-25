/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Saved section planes for the multi-section DXF export (`@ifc-lite/snede-export`).
 *
 * A saved section is stored in IFC WORLD coordinates (Z-up, millimetres), not
 * in the viewer's slider terms (axis + percent of the scene bounds): a
 * percentage moves when another model is added or the bounds change, a world
 * plane does not. Converting from the live cut happens once, when the user
 * saves it (see `section-source.ts`).
 */

import type { Snedevlak } from '@ifc-lite/snede-export';

export interface WorldVec3 { x: number; y: number; z: number }

export interface SavedSection {
  id: string;
  /** Short name shown in markers and titles ("A" gives "A-A"). */
  name: string;
  /** A point on the plane, IFC world, mm. */
  origin: WorldVec3;
  /** View direction (into the part that is drawn), IFC world. */
  direction: WorldVec3;
  /** View depth behind the plane in mm; 0 draws the cut only. */
  depth: number;
  /** Drawn as a line in the 3D view and on 2D plans. */
  shown: boolean;
  /** Included in the DXF export. */
  exported: boolean;
}

/** Next free name in the sequence A..Z, AA..AZ, BA.. (spreadsheet-column style). */
export function nextSectionName(existing: readonly string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toUpperCase()));
  for (let i = 0; ; i++) {
    const name = columnName(i);
    if (!taken.has(name)) return name;
  }
}

function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function toSnedevlak(section: SavedSection): Snedevlak {
  return { naam: section.name, oorsprong: section.origin, normaal: section.direction, diepte: section.depth };
}

export function flipSection(section: SavedSection): SavedSection {
  const d = section.direction;
  return { ...section, direction: { x: -d.x, y: -d.y, z: -d.z } };
}

/** Horizontal plane (a plan)? */
export function isPlanSection(section: Pick<SavedSection, 'direction'>): boolean {
  const d = section.direction;
  const len = Math.hypot(d.x, d.y, d.z);
  return len > 0 && Math.abs(d.z) / len > 1 - 1e-9;
}

// ─── File format ────────────────────────────────────────────────────────────

export const SECTIONS_FILE_FORMAT = 'ifc-lite-sections';
export const SECTIONS_FILE_VERSION = 1;

export interface SectionsFile {
  format: typeof SECTIONS_FILE_FORMAT;
  version: number;
  sections: Omit<SavedSection, 'id'>[];
}

export function serializeSections(sections: readonly SavedSection[]): string {
  const file: SectionsFile = {
    format: SECTIONS_FILE_FORMAT,
    version: SECTIONS_FILE_VERSION,
    sections: sections.map(({ id: _id, ...rest }) => rest),
  };
  return JSON.stringify(file, null, 2);
}

export type ParseSectionsResult =
  | { ok: true; sections: Omit<SavedSection, 'id'>[] }
  | { ok: false; error: string };

const isFiniteVec = (v: unknown): v is WorldVec3 =>
  typeof v === 'object' && v !== null
  && ['x', 'y', 'z'].every((k) => Number.isFinite((v as Record<string, unknown>)[k]));

/** Parse and validate a sections file; never throws. */
export function parseSections(text: string): ParseSectionsResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `Not a JSON file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const file = data as Partial<SectionsFile> | null;
  if (!file || file.format !== SECTIONS_FILE_FORMAT) return { ok: false, error: 'Not an ifc-lite sections file.' };
  if (typeof file.version !== 'number' || file.version > SECTIONS_FILE_VERSION) {
    return { ok: false, error: `Unsupported sections file version ${String(file.version)}.` };
  }
  if (!Array.isArray(file.sections)) return { ok: false, error: 'The file lists no sections.' };
  const sections: Omit<SavedSection, 'id'>[] = [];
  for (const [i, raw] of file.sections.entries()) {
    const s = raw as Partial<SavedSection>;
    const d = s.direction;
    if (typeof s.name !== 'string' || !isFiniteVec(s.origin) || !isFiniteVec(d) || Math.hypot(d.x, d.y, d.z) === 0) {
      return { ok: false, error: `Section ${i + 1} is incomplete.` };
    }
    sections.push({
      name: s.name,
      origin: { x: s.origin.x, y: s.origin.y, z: s.origin.z },
      direction: { x: d.x, y: d.y, z: d.z },
      depth: Number.isFinite(s.depth) && (s.depth as number) >= 0 ? (s.depth as number) : 0,
      shown: s.shown !== false,
      exported: s.exported !== false,
    });
  }
  return { ok: true, sections };
}
