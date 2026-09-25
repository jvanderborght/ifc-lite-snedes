/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Saved section planes (the "Sections" panel) for the multi-section DXF
 * export. The list is model-relative: it belongs to the model identified by
 * `savedSectionsModelKey` and is persisted per model by the panel
 * (`lib/sections/storage.ts`), not by this slice — actions stay pure store
 * updates so they are testable without localStorage.
 */

import type { StateCreator } from 'zustand';
import type { SavedSection } from '@/lib/sections/saved-section';

export interface SavedSectionsSlice {
  savedSections: SavedSection[];
  /** Identity of the model the list belongs to; null until one is loaded. */
  savedSectionsModelKey: string | null;
  addSavedSection: (section: SavedSection) => void;
  updateSavedSection: (id: string, patch: Partial<Omit<SavedSection, 'id'>>) => void;
  removeSavedSection: (id: string) => void;
  moveSavedSection: (id: string, delta: -1 | 1) => void;
  /** Replace the whole list, e.g. after loading a file or switching model. */
  replaceSavedSections: (sections: SavedSection[], modelKey: string | null) => void;
}

export const createSavedSectionsSlice: StateCreator<SavedSectionsSlice, [], [], SavedSectionsSlice> = (set) => ({
  savedSections: [],
  savedSectionsModelKey: null,

  addSavedSection: (section) => set((s) => ({ savedSections: [...s.savedSections, section] })),

  updateSavedSection: (id, patch) => set((s) => ({
    savedSections: s.savedSections.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)),
  })),

  removeSavedSection: (id) => set((s) => ({ savedSections: s.savedSections.filter((sec) => sec.id !== id) })),

  moveSavedSection: (id, delta) => set((s) => {
    const i = s.savedSections.findIndex((sec) => sec.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= s.savedSections.length) return {};
    const next = [...s.savedSections];
    [next[i], next[j]] = [next[j], next[i]];
    return { savedSections: next };
  }),

  replaceSavedSections: (sections, modelKey) => set({ savedSections: sections, savedSectionsModelKey: modelKey }),
});
