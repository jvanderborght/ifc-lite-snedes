# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""@unwired-by-design independent cross-check of the wall areas, not a CI gate
(needs ifcopenshell and shapely, which CI does not install).

A different method on purpose: ifcopenshell tessellation instead of the wasm
pipeline or the TS B-rep reader, and exact polygon unions (shapely) instead of
row spans. Same definitions as `src/area.ts`: foils (<= 2 mm) left out, net =
silhouette of all parts, gross = silhouette plus openings (clipped to the
silhouette's bounding rectangle) with holes filled, sides = layers outside the
frame zone by zone sign.

    python controle.py <model.ifc> [wall name or express id ...]      -> JSON lines
    python controle.py <model.ifc> ... --vergelijk <rapport.json>     -> differences

Known difference: ifcopenshell fills holes that hsbCAD writes as "keyhole"
faces (the hole joined to the outline by a doubled bridge edge); the TS reader
keeps them, so its net and side areas are lower on such walls.
"""
import collections
import json
import sys

import numpy as np
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element as ue
from shapely import union_all
from shapely.geometry import MultiPoint, Polygon, box

SKIP = ('IfcOpeningElement', 'IfcDoor', 'IfcWindow', 'IfcVirtualElement')
GRID = 1e-5   # 0.01 mm
FOIL = 0.002  # parts up to 2 mm thick are foils

# ifcopenshell cuts a wall's openings out of its aggregated parts too, like the
# ifc-lite pipeline; parts are read as exported, only a wall's own body is cut.
CUT = ifcopenshell.geom.settings()
CUT.set('use-world-coords', True)
RAW = ifcopenshell.geom.settings()
RAW.set('use-world-coords', True)
RAW.set('disable-opening-subtractions', True)


def parts_of(wall):
    out, stack = [], [wall]
    while stack:
        for rel in stack.pop().IsDecomposedBy or []:
            for o in rel.RelatedObjects:
                stack.append(o)
                if not any(o.is_a(t) for t in SKIP):
                    out.append(o)
    return out


def triangles(e, settings):
    if not e.Representation:
        return None
    try:
        s = ifcopenshell.geom.create_shape(settings, e)
    except Exception:
        return None
    v = np.array(s.geometry.verts).reshape(-1, 3)
    f = np.array(s.geometry.faces).reshape(-1, 3)
    return v[f] if len(f) else None  # (n, 3, 3), Z-up metres


def silhouette(u, h):
    polys = [p for p in (Polygon(list(zip(u[k], h[k]))) for k in range(len(u))) if p.area > 1e-9]
    return union_all(polys, grid_size=GRID) if polys else Polygon()


def filled(g):
    return union_all([Polygon(p.exterior) for p in getattr(g, 'geoms', [g]) if not p.is_empty], grid_size=GRID)


def zone(e):
    z = ue.get_psets(e).get('Data', {}).get('Zone')
    return None if z is None else str(z).strip()


def analyse(wall):
    own = triangles(wall, CUT)
    items = ([(wall, own)] if own is not None else []) + [(p, triangles(p, RAW)) for p in parts_of(wall)]
    items = [(e, t) for e, t in items if t is not None]
    if not items:
        return {'wand': wall.Name, 'fout': 'geen geometrie'}
    xy = np.unique(np.round(np.concatenate([t[:, :, :2].reshape(-1, 2) for _, t in items]), 5), axis=0)
    c = np.array(MultiPoint([tuple(p) for p in xy]).convex_hull.minimum_rotated_rectangle.exterior.coords)[:4]
    e1, e2 = c[1] - c[0], c[2] - c[1]
    along = e1 / np.linalg.norm(e1) if np.linalg.norm(e1) >= np.linalg.norm(e2) else e2 / np.linalg.norm(e2)
    across = np.array([-along[1], along[0]])

    def project(t):
        d = t[:, :, :2]
        return d @ along, d @ across, t[:, :, 2]

    per, foils = [], 0
    for e, t in items:
        u, a, h = project(t)
        if a.max() - a.min() <= FOIL:
            foils += 1
            continue
        per.append((silhouette(u, h), a.min(), a.max(), zone(e)))
    net = union_all([p[0] for p in per], grid_size=GRID)
    ops = []
    for rel in wall.HasOpenings:
        t = triangles(rel.RelatedOpeningElement, CUT)
        if t is not None:
            u, _, h = project(t)
            ops.append(silhouette(u, h))
    opening = union_all(ops, grid_size=GRID).intersection(box(*net.bounds)) if ops else Polygon()
    gross = filled(union_all([net, opening], grid_size=GRID))
    out = {
        'wand': wall.Name, 'id': wall.id(), 'type': wall.is_a(), 'delen': len(items), 'folies': foils,
        'openingenIfc': len(wall.HasOpenings), 'openingenMetGeo': len(ops),
        'bruto': round(gross.area, 4), 'netto': round(net.area, 4),
    }
    frame = collections.Counter((round(lo, 4), round(hi, 4)) for _, lo, hi, z in per if z == '0')
    if frame:
        lo, hi = frame.most_common(1)[0][0]
        for key, sign in (('zijdePlus', 1), ('zijdeMin', -1)):
            geo = [s for s, a0, a1, z in per
                   if z and z.lstrip('-').isdigit() and int(z) * sign > 0 and not lo - 1e-4 <= (a0 + a1) / 2 <= hi + 1e-4]
            out[key] = round(union_all(geo, grid_size=GRID).area, 4) if geo else 0.0
    return out


def compare(rows, report):
    ts = {r['wallId']: r for r in json.load(open(report, encoding='utf-8'))['results']}
    keys = (('bruto', 'grossArea'), ('netto', 'netArea'), ('zijdePlus', 'sidePlusArea'), ('zijdeMin', 'sideMinusArea'))
    for p in rows:
        t = ts.get(p.get('id'))
        if not t or 'bruto' not in p:
            continue
        d = {k: round((t[tk] or 0) - (p.get(k) or 0), 4) for k, tk in keys}
        print(f"{p['wand'][:50]:<50} TS-Py m2: {d}")


if __name__ == '__main__':
    args = sys.argv[1:]
    report = args[args.index('--vergelijk') + 1] if '--vergelijk' in args else None
    if report:
        i = args.index('--vergelijk')
        args = args[:i] + args[i + 2:]
    model = ifcopenshell.open(args[0])
    wanted = set(args[1:])
    rows = []
    for w in model.by_type('IfcWall'):
        if wanted and w.Name not in wanted and str(w.id()) not in wanted:
            continue
        rows.append(analyse(w))
        if not report:
            print(json.dumps(rows[-1]), flush=True)
    if report:
        compare(rows, report)
