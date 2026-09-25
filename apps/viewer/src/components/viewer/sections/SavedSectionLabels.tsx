/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Names of the shown saved sections over the 3D view, next to the blue
 * outlines `SavedSectionsHost` draws. An SVG layer projected per animation
 * frame, like `BasepointOverlay`: the renderer's own text pipeline carries
 * the IFC annotation labels as one replace-all upload, so a second label set
 * does not fit there without a renderer change.
 */

import { useEffect, useMemo, useRef } from 'react';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { visibleCoordinateInfo } from '@/lib/export/view-pdf/view-pdf-export-source';
import { sectionLabelAnchors } from '@/lib/sections/section-lines3d';
import { useViewerStore } from '@/store';

const LABEL_COLOUR = '#0b72d9';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function SavedSectionLabels() {
  const sections = useViewerStore((s) => s.savedSections);
  const models = useViewerStore((s) => s.models);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const anchors = useMemo(() => {
    const info = visibleCoordinateInfo(useViewerStore.getState()) ?? undefined;
    return sectionLabelAnchors(sections, info, info?.shiftedBounds);
    // `models` changes when a model loads or moves, which changes the frame.
  }, [sections, models]);

  useEffect(() => {
    if (anchors.length === 0) {
      if (svgRef.current) svgRef.current.innerHTML = '';
      return;
    }
    let raf = 0;
    const paint = () => {
      const renderer = getGlobalRenderer();
      const canvas = containerRef.current?.closest('[data-viewport]')?.querySelector('canvas') as HTMLCanvasElement | null;
      const svg = svgRef.current;
      if (renderer && canvas && svg) {
        const camera = renderer.getCamera();
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const parts: string[] = [];
        for (const a of anchors) {
          const screen = camera.projectToScreen(a.point, w, h);
          if (!screen) continue;
          parts.push(`<text x="${Math.round(screen.x) + 6}" y="${Math.round(screen.y) - 6}" font-family="ui-sans-serif, system-ui" font-size="13" font-weight="600" fill="${LABEL_COLOUR}" stroke="white" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${escapeXml(a.name)}</text>`);
        }
        svg.innerHTML = parts.join('');
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [anchors]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-30">
      <svg ref={svgRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
