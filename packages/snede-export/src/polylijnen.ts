/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Chain loose line segments into polylines: per element and line kind, walk
 * the segment graph into the longest possible chains, close chains that
 * return to their start, and drop vertices that lie exactly on a straight
 * run. Weld 0.1 mm, collinearity 0.1 µm: faces of a layer thinner than 0.1 mm
 * weld into one, anything thicker (a 0.2 mm foil) keeps both faces.
 */

import type { Lijn, LijnSoort } from './genereer.js';
import type { Punt } from './dxf/r2000.js';

export interface Polylijn {
  soort: LijnSoort;
  ifcType: string;
  entityId: number;
  punten: Punt[];
  gesloten: boolean;
}

// mm: endpoints closer than this are the same vertex. Timber-frame drawings
// need 0.5-1 mm; 0.1 mm also absorbs float32 gaps (seen up to ~8 µm).
const LAS = 0.1;
const RECHT = 1e-4;        // mm: max distance of a dropped vertex from its run

/**
 * Vertex welding with a grid of cell LAS: a point joins an existing vertex
 * within LAS found in its own or a neighbouring cell, so two close points on
 * either side of a cell border still weld.
 */
class Lasser {
  private cellen = new Map<string, { k: string; p: Punt }[]>();
  private n = 0;

  sleutel(p: Punt): string {
    const i = Math.floor(p.x / LAS);
    const j = Math.floor(p.y / LAS);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const v of this.cellen.get(`${i + di},${j + dj}`) ?? []) {
          if (Math.hypot(v.p.x - p.x, v.p.y - p.y) <= LAS) return v.k;
        }
      }
    }
    const k = String(this.n++);
    const c = `${i},${j}`;
    const lijst = this.cellen.get(c);
    if (lijst) lijst.push({ k, p }); else this.cellen.set(c, [{ k, p }]);
    return k;
  }
}

function vereenvoudig(punten: Punt[], gesloten: boolean): Punt[] {
  const uit: Punt[] = [];
  const n = punten.length;
  for (let i = 0; i < n; i++) {
    const p = punten[i];
    const vorige = uit.length ? uit[uit.length - 1] : (gesloten ? punten[n - 1] : null);
    const volgende = i + 1 < n ? punten[i + 1] : (gesloten ? uit[0] ?? punten[0] : null);
    if (vorige && volgende) {
      const dx = volgende.x - vorige.x;
      const dy = volgende.y - vorige.y;
      const L = Math.hypot(dx, dy);
      const afstand = L > 0 ? Math.abs((p.x - vorige.x) * dy - (p.y - vorige.y) * dx) / L : 0;
      const tussen = L > 0 && ((p.x - vorige.x) * dx + (p.y - vorige.y) * dy) / (L * L);
      if (afstand <= RECHT && typeof tussen === 'number' && tussen > 0 && tussen < 1) continue;
    }
    uit.push(p);
  }
  return uit;
}

function ketens(segmenten: Lijn[]): { punten: Punt[]; gesloten: boolean }[] {
  const knopen = new Map<string, Punt>();
  const buren = new Map<string, { naar: string; seg: number }[]>();
  const verbind = (a: string, b: string, seg: number): void => {
    if (!buren.has(a)) buren.set(a, []);
    buren.get(a)!.push({ naar: b, seg });
  };
  const lasser = new Lasser();
  segmenten.forEach((s, i) => {
    const a = lasser.sleutel(s.a);
    const b = lasser.sleutel(s.b);
    if (a === b) return;                       // degenerate after welding
    if (!knopen.has(a)) knopen.set(a, s.a);
    if (!knopen.has(b)) knopen.set(b, s.b);
    verbind(a, b, i);
    verbind(b, a, i);
  });
  const gebruikt = new Set<number>();
  const loop = (start: string): string[] => {
    const pad = [start];
    let huidig = start;
    for (;;) {
      const volgende = (buren.get(huidig) ?? []).find((r) => !gebruikt.has(r.seg));
      if (!volgende) return pad;
      gebruikt.add(volgende.seg);
      pad.push(volgende.naar);
      huidig = volgende.naar;
    }
  };
  const uit: { punten: Punt[]; gesloten: boolean }[] = [];
  const onbenut = (k: string) => (buren.get(k) ?? []).some((r) => !gebruikt.has(r.seg));
  // Open chains start at vertices with odd degree, so they are not cut short.
  const volgorde = [...buren.keys()].sort((p, q) => (buren.get(q)!.length % 2) - (buren.get(p)!.length % 2));
  for (const start of volgorde) {
    while (onbenut(start)) {
      const pad = loop(start);
      const gesloten = pad.length > 3 && pad[0] === pad[pad.length - 1];
      const punten = (gesloten ? pad.slice(0, -1) : pad).map((k) => knopen.get(k)!);
      uit.push({ punten: vereenvoudig(punten, gesloten), gesloten });
    }
  }
  return uit;
}

export function maakPolylijnen(lijnen: Lijn[]): Polylijn[] {
  const groepen = new Map<string, Lijn[]>();
  for (const l of lijnen) {
    const k = `${l.soort}|${l.ifcType}|${l.entityId}`;
    if (!groepen.has(k)) groepen.set(k, []);
    groepen.get(k)!.push(l);
  }
  const uit: Polylijn[] = [];
  for (const groep of groepen.values()) {
    const { soort, ifcType, entityId } = groep[0];
    for (const k of ketens(groep)) {
      if (k.punten.length >= 2) uit.push({ soort, ifcType, entityId, ...k });
    }
  }
  return uit;
}
