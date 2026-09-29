/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The active saved section is the Section tool's cut on screen, both ways:
 * dragging the cut with the tool's handle moves the section (along its own
 * normal only), and moving the section in the panel moves the cut. Leaving
 * the Section tool, or picking a plane that is not parallel, stops it.
 */

import { useEffect } from 'react';
import { nearestCardinalAxis } from '@ifc-lite/renderer';
import { visibleCoordinateInfo } from '@/lib/export/view-pdf/view-pdf-export-source';
import { customPlaneFor, followCut, sectionPosition } from '@/lib/sections/section-edit';
import { readCurrentCut } from '@/lib/sections/section-source';
import { useViewerStore } from '@/store';
import { revealSectionCut } from '@/store/section-active';
import type { CustomSectionPlane } from '@/store/types';

/** Moves smaller than this (mm) are rounding, not the user. */
const MOVE_TOLERANCE_MM = 0.01;
/** The Section tool arms face-pick shortly after it opens; undo that for this long after activating. */
const PICK_ARM_WINDOW_MS = 1500;

let activatedAt = 0;

function applyPlane(custom: CustomSectionPlane): void {
  const state = useViewerStore.getState();
  useViewerStore.setState({
    sectionPlane: {
      ...state.sectionPlane,
      axis: nearestCardinalAxis(custom.normal).axis,
      flipped: false,
      enabled: true,
      parked: false,
      custom,
    },
  });
}

/** Put a saved section on screen as the Section tool's cut and follow it. */
export function activateSavedSection(id: string): void {
  const state = useViewerStore.getState();
  const section = state.savedSections.find((s) => s.id === id);
  if (!section) return;
  applyPlane(customPlaneFor(section, visibleCoordinateInfo(state) ?? undefined));
  revealSectionCut(useViewerStore.getState);
  activatedAt = Date.now();
  useViewerStore.getState().setActiveSavedSection(id);
}

const sameNormal = (a: readonly number[], b: readonly number[]) =>
  Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > 1 - 1e-9 && a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0;

export function useActiveSavedSection(): void {
  useEffect(() => useViewerStore.subscribe((state, prev) => {
    const id = state.activeSavedSectionId;
    if (!id) return;
    const section = state.savedSections.find((s) => s.id === id);
    if (!section) { state.setActiveSavedSection(null); return; }
    if (state.sectionPickMode && Date.now() - activatedAt < PICK_ARM_WINDOW_MS) {
      state.setSectionPickMode(false);
      return;
    }
    if (state.activeTool !== 'section' && Date.now() - activatedAt > PICK_ARM_WINDOW_MS) {
      state.setActiveSavedSection(null);
      return;
    }
    const before = prev.savedSections.find((s) => s.id === id);
    const opening = Date.now() - activatedAt < PICK_ARM_WINDOW_MS;
    if (state.sectionPlane !== prev.sectionPlane && opening) {
      // The Section tool restores its last cardinal cut when it opens: put ours back.
      const target = customPlaneFor(section, visibleCoordinateInfo(state) ?? undefined);
      const current = state.sectionPlane.custom;
      const ours = current && !state.sectionPlane.flipped && sameNormal(current.normal, target.normal)
        && Math.abs(current.distance - target.distance) * 1000 <= MOVE_TOLERANCE_MM;
      if (!ours) applyPlane(target);
    } else if (state.sectionPlane !== prev.sectionPlane) {
      // The cut moved (drag handle, the tool's own input): follow it.
      const cut = readCurrentCut(state);
      if (!cut) return;
      const moved = followCut(section, cut);
      if (!moved) { state.setActiveSavedSection(null); return; }
      if (Math.abs(sectionPosition(moved) - sectionPosition(section)) > MOVE_TOLERANCE_MM) {
        state.updateSavedSection(id, { origin: moved.origin });
      }
    } else if (section !== before || id !== prev.activeSavedSectionId) {
      // The section moved (panel slider, flip): move the cut.
      const target = customPlaneFor(section, visibleCoordinateInfo(state) ?? undefined);
      const current = state.sectionPlane.custom;
      if (current && !state.sectionPlane.flipped && sameNormal(current.normal, target.normal)) {
        if (Math.abs(current.distance - target.distance) * 1000 > MOVE_TOLERANCE_MM) state.setSectionCustomDistance(target.distance);
      } else {
        applyPlane(target);
      }
    }
  }), []);
}
