/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Browser persistence for the Sections panel: the saved sections per model
 * and the global DXF export settings. Guarded like the other `ifc-lite:*`
 * keys: unreadable or malformed entries fall back to defaults with a warning,
 * writes report their failure instead of throwing.
 */

import type { useViewerStore } from '@/store';
import { saveJson, type SaveResult } from '@/lib/storage/save-result';
import { parseSections, serializeSections, type SavedSection } from './saved-section';

type ViewerState = ReturnType<typeof useViewerStore.getState>;

const SECTIONS_KEY_PREFIX = 'ifc-lite:saved-sections:';
const SETTINGS_KEY = 'ifc-lite:section-export-settings';

/**
 * Identity of the model a section list belongs to: the first visible model's
 * durable source fingerprint, or its file name when there is none.
 */
export function sectionsModelKey(state: ViewerState): string | null {
  for (const model of state.models.values()) {
    if (model.visible && model.geometryResult) return model.sourceFingerprint ?? model.name;
  }
  return null;
}

export function loadSavedSections(modelKey: string, newId: () => string): SavedSection[] {
  let text: string | null = null;
  try {
    text = localStorage.getItem(SECTIONS_KEY_PREFIX + modelKey);
  } catch (err) {
    console.warn('[sections] could not read saved sections', err);
    return [];
  }
  if (!text) return [];
  const parsed = parseSections(text);
  if (!parsed.ok) {
    console.warn(`[sections] ignoring saved sections for this model: ${parsed.error}`);
    return [];
  }
  return parsed.sections.map((s) => ({ ...s, id: newId() }));
}

export function storeSavedSections(modelKey: string, sections: readonly SavedSection[]): SaveResult {
  // Same format as the downloadable file, so one parser serves both.
  return saveJson(SECTIONS_KEY_PREFIX + modelKey, JSON.parse(serializeSections(sections)), 'the saved sections');
}

// ─── Export settings ────────────────────────────────────────────────────────

export type SectionExportUnit = 'mm' | 'cm' | 'm';
export type PlanPlacement = 'row' | 'world';

export interface SectionExportSettings {
  unit: SectionExportUnit;
  /** Plans in a row below the sections, or on world coordinates. */
  plans: PlanPlacement;
  /** Gap between drawings on the sheet, mm. */
  gap: number;
  /** Marker and title text height, mm (model size). */
  textHeight: number;
  /** Marker triangle side, mm (model size). */
  triangleSize: number;
  /** Write hidden lines (dashed layers). */
  hiddenLines: boolean;
  /** Also hidden lines inside a cut outline (behind a cut face). */
  hiddenInsideCut: boolean;
  /** Export elements that are hidden in the viewer. */
  exportHidden: boolean;
  /** Dash and gap of hidden lines, mm (model size). */
  dash: number;
  dashGap: number;
}

export const DEFAULT_SECTION_EXPORT_SETTINGS: Readonly<SectionExportSettings> = {
  unit: 'mm', plans: 'row', gap: 10_000, textHeight: 500, triangleSize: 500,
  hiddenLines: false, hiddenInsideCut: false, exportHidden: false, dash: 50, dashGap: 25,
};

const positive = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

/** Validate a stored or edited settings object field by field. */
export function normalizeSettings(raw: unknown): SectionExportSettings {
  const d = DEFAULT_SECTION_EXPORT_SETTINGS;
  const r = (raw ?? {}) as Partial<Record<keyof SectionExportSettings, unknown>>;
  return {
    unit: r.unit === 'cm' || r.unit === 'm' || r.unit === 'mm' ? r.unit : d.unit,
    plans: r.plans === 'world' || r.plans === 'row' ? r.plans : d.plans,
    gap: positive(r.gap, d.gap),
    textHeight: positive(r.textHeight, d.textHeight),
    triangleSize: positive(r.triangleSize, d.triangleSize),
    hiddenLines: typeof r.hiddenLines === 'boolean' ? r.hiddenLines : d.hiddenLines,
    hiddenInsideCut: typeof r.hiddenInsideCut === 'boolean' ? r.hiddenInsideCut : d.hiddenInsideCut,
    exportHidden: typeof r.exportHidden === 'boolean' ? r.exportHidden : d.exportHidden,
    dash: positive(r.dash, d.dash),
    dashGap: positive(r.dashGap, d.dashGap),
  };
}

export function loadExportSettings(): SectionExportSettings {
  try {
    const text = localStorage.getItem(SETTINGS_KEY);
    return normalizeSettings(text ? JSON.parse(text) : undefined);
  } catch (err) {
    console.warn('[sections] could not read export settings, using defaults', err);
    return { ...DEFAULT_SECTION_EXPORT_SETTINGS };
  }
}

export function storeExportSettings(settings: SectionExportSettings): SaveResult {
  return saveJson(SETTINGS_KEY, settings, 'the section export settings');
}
