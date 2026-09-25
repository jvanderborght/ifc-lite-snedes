/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A section plane in IFC world coordinates (Z-up, millimetres), and its
 * translation to a drawing-2d `SectionConfig` in the renderer frame.
 *
 * Drawing axes (identical to the reference Python tool, so its checks can
 * compare output 1:1): looking along `normaal`, DXF-X = normaal x Z (right),
 * DXF-Y = up. For a horizontal plane looking down, DXF-X = X and DXF-Y = Y.
 * 2D coordinates are absolute world coordinates, so a vertical section keeps
 * elevation 0 at DXF-Y 0.
 */

import type { SectionConfig } from '@ifc-lite/drawing-2d';
import { createSectionConfig } from '@ifc-lite/drawing-2d';
import type { CoordinateInfo } from '@ifc-lite/geometry';

export interface Vec3 { x: number; y: number; z: number }

export interface Snedevlak {
  naam: string;
  /** A point on the plane, IFC world, mm. */
  oorsprong: Vec3;
  /** View direction (unit length is not required), IFC world. */
  normaal: Vec3;
  /** View depth behind the plane in mm; 0 = section lines only. */
  diepte: number;
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a.x, a.y, a.z));

/** Drawing axes (u = DXF-X, v = DXF-Y) as IFC world unit vectors. */
export function tekenassen(vlak: Snedevlak): { u: Vec3; v: Vec3; n: Vec3 } {
  const n = unit(vlak.normaal);
  const z = { x: 0, y: 0, z: 1 };
  const c = cross(n, z);
  if (Math.hypot(c.x, c.y, c.z) < 1e-9) {
    // Horizontal plane. Looking down gives a normal plan (X right, Y up).
    return { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: n.z < 0 ? 1 : -1, z: 0 }, n };
  }
  const u = unit(c);
  return { u, v: unit(cross(u, n)), n };
}

/** 'S1:x=22600' / 'S2:y=15400' / 'S3:z=1000' (+ optional diepte). */
export function vlakUitTekst(tekst: string, diepte = 0): Snedevlak {
  const [naam, rest] = [tekst.slice(0, tekst.indexOf(':')), tekst.slice(tekst.indexOf(':') + 1)];
  const [as, waarde] = rest.split('=');
  const i = 'xyz'.indexOf(as.trim().toLowerCase());
  if (i < 0) throw new Error(`Onbekend vlak '${tekst}' (verwacht x=, y= of z=)`);
  const p = Number(waarde);
  const o = { x: i === 0 ? p : 0, y: i === 1 ? p : 0, z: i === 2 ? p : 0 };
  // Same convention as the Python tool: x= looks toward -X, y= toward +Y, z= down.
  const n = { x: i === 0 ? -1 : 0, y: i === 1 ? 1 : 0, z: i === 2 ? -1 : 0 };
  return { naam, oorsprong: o, normaal: n, diepte };
}

/**
 * IFC world (Z-up, metres) -> renderer frame (Y-up, metres, minus the RTC
 * offset and origin shift). Mirrors `dxfWorldShift` / `dxfElevationRenderY`
 * in apps/viewer/src/hooks/dxfUnderlayMath.ts.
 */
export function naarRenderPunt(p: Vec3, info: CoordinateInfo | undefined): Vec3 {
  const rtc = info?.wasmRtcOffset ?? { x: 0, y: 0, z: 0 };
  const s = info?.originShift ?? { x: 0, y: 0, z: 0 };
  return { x: p.x - rtc.x - s.x, y: p.z - rtc.z - s.y, z: -p.y + rtc.y - s.z };
}

export function naarRenderRichting(d: Vec3): Vec3 {
  return { x: d.x, y: d.z, z: -d.y };
}

/** Renderer frame (Y-up, metres, shifted) -> IFC world (Z-up, metres). Inverse of naarRenderPunt. */
export function vanRenderPunt(r: Vec3, info: CoordinateInfo | undefined): Vec3 {
  const rtc = info?.wasmRtcOffset ?? { x: 0, y: 0, z: 0 };
  const s = info?.originShift ?? { x: 0, y: 0, z: 0 };
  return { x: r.x + rtc.x + s.x, y: -(r.z + s.z) + rtc.y, z: r.y + rtc.z + s.y };
}

export function vanRenderRichting(d: Vec3): Vec3 {
  return { x: d.x, y: -d.z, z: d.y };
}

/**
 * A section plane from the half-space the viewer's cut keeps, in the
 * renderer frame: keep `dot(p, normal) <= offset` (the viewer's
 * `resolveKeptHalfSpace`). The viewer looks into the kept half, so the view
 * direction is -normal. Result in IFC world mm.
 */
export function vlakUitHalfruimte(
  halfruimte: { normal: Vec3; offset: number },
  info: CoordinateInfo | undefined,
  naam: string,
  diepte = 0,
): Snedevlak {
  const lengte = Math.hypot(halfruimte.normal.x, halfruimte.normal.y, halfruimte.normal.z);
  const n = scale(halfruimte.normal, 1 / lengte);
  const opVlak = scale(n, halfruimte.offset / lengte);
  return {
    naam,
    oorsprong: scale(vanRenderPunt(opVlak, info), 1000),
    normaal: vanRenderRichting(scale(n, -1)),
    diepte,
  };
}

/**
 * drawing-2d config for this plane. Always the custom-plane path, so the 2D
 * basis is exactly (u, v). drawing-2d keeps the half-space with negative
 * signed depth and views along -normal, so it gets the reversed view
 * direction as its normal.
 */
export function naarSectionConfig(vlak: Snedevlak, info: CoordinateInfo | undefined): {
  config: SectionConfig;
  /** Add to drawing-2d 2D output (metres) to get absolute DXF mm: 1000 * p + offset. */
  offsetMm: { x: number; y: number };
} {
  const { u, v, n } = tekenassen(vlak);
  const oM = scale(vlak.oorsprong, 1 / 1000);
  const origin = naarRenderPunt(oM, info);
  const normal = naarRenderRichting(scale(n, -1));
  const config = createSectionConfig('z', 0, {
    projectionDepth: Math.max(vlak.diepte / 1000, 1e-3),
    projectionBelowDepth: Math.max(vlak.diepte / 1000, 1e-3),
    projectionAboveDepth: 1e-3,
    includeHiddenLines: true,
  });
  config.plane.customPlane = {
    normal,
    distance: dot(normal, origin),
    origin,
    tangent: naarRenderRichting(u),
    bitangent: naarRenderRichting(v),
  };
  return { config, offsetMm: { x: dot(u, vlak.oorsprong), y: dot(v, vlak.oorsprong) } };
}
