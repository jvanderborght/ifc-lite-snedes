/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Always-mounted host for saved sections: keeps the list in step with the
 * model (per-model browser storage) and draws every shown section in the 3D
 * view on the renderer's `sections` line channel. Renders nothing itself;
 * mounted next to `DrawingRuntimeHost` so the lines are there whether or not
 * the Sections panel is open.
 */

import { useEffect } from 'react';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { visibleCoordinateInfo } from '@/lib/export/view-pdf/view-pdf-export-source';
import { anchorWorldLineVertices } from '@/lib/renderer/line-overlay-rte';
import { sectionLines3D } from '@/lib/sections/section-lines3d';
import { useViewerStore } from '@/store';
import { useSavedSectionsPersistence } from './useSavedSectionsPersistence';

/** How long to keep retrying while the renderer is still starting up. */
const RENDERER_WAIT_MS = 10_000;

export function SavedSectionsHost() {
  useSavedSectionsPersistence();
  const sections = useViewerStore((s) => s.savedSections);
  const models = useViewerStore((s) => s.models);

  useEffect(() => {
    let timer: number | undefined;
    const started = Date.now();
    const upload = () => {
      const renderer = getGlobalRenderer();
      if (!renderer) {
        if (Date.now() - started < RENDERER_WAIT_MS) timer = window.setTimeout(upload, 250);
        return;
      }
      const info = visibleCoordinateInfo(useViewerStore.getState()) ?? undefined;
      const world = sectionLines3D(sections, info, info?.shiftedBounds);
      renderer.setLineOverlay('sections', world.length ? anchorWorldLineVertices(world) : null);
    };
    upload();
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [sections, models]);

  // Clear the channel when the host goes away (viewer torn down).
  useEffect(() => () => { getGlobalRenderer()?.setLineOverlay('sections', null); }, []);

  return null;
}
