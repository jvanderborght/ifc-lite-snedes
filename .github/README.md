# IFClite: sections & wall analysis fork

> **This is an unofficial fork of [IFClite](https://github.com/LTplus-AG/ifc-lite).**
> It is not affiliated with or endorsed by the IFClite project or its authors.
>
> - Official live app: **[ifclite.com](https://www.ifclite.com/)**
> - Official documentation: **[ifclite.dev](https://www.ifclite.dev/)**
> - Official source code: **[github.com/LTplus-AG/ifc-lite](https://github.com/LTplus-AG/ifc-lite)**
> - The original project README is kept unchanged in [`README.md`](../README.md).
>
> For anything that is not listed below, use the official project.

This fork adds a few features for timber-frame (prefab) engineering on top of the IFClite viewer:
saved section planes with a multi-section DXF export, a wall analysis panel (timber fraction and
wall area), and a view of hsbCAD zones. Everything else is IFClite as released upstream.

## Where to find it

| | |
|---|---|
| Branch | [`snedes`](https://github.com/jvanderborght/ifc-lite-snedes/tree/snedes) (the `main` branch mirrors upstream and is not used) |
| Based on | upstream release **v10.3.0**; upstream releases are merged in regularly |
| npm | nothing from this fork is published; the `@ifc-lite/*` names of the fork packages are local workspace names only |

## What this fork adds

### Sections panel (saved section planes)
- Save the section tool's cut as a named section (A, B, C, …), stored per model in the browser and
  as a JSON file (the JSON of an earlier in-house Python tool can be imported too).
- Saved sections are drawn in 3D in their own colour, with clickable name labels.
- Activate a saved section from its label or its row and move it along its normal (slider or exact
  distance in mm); reorder sections by dragging.

### Multi-section DXF export (`packages/snede-export`)
- All sections in **one DXF file** (own R2000 writer): vertical sections side by side with DXF-Y =
  world Z, plans below them or at world coordinates; units mm, cm or m.
- Cut lines and view lines (own hidden-line computation), optional hidden lines, closed polylines.
- Layers per IFC class with a configurable colour and lineweight table, or black and white.
- **Associative hatches** (ANSI31 or solid), Arial as the default text style.
- Section markers on the other sections and plans, titles, and an export report in the app.
- *Draw wall parts as modelled*: the viewer cuts a wall's openings into every part aggregated under
  the wall; for timber-frame exports the parts are rebuilt from their own B-rep instead.

### Wall analysis panel (Analyze → Data → Wall analysis)
- One row per wall: **timber fraction following NPR 2068:2026** (A_b / A_con, including the 40 mm
  frame-fixing rule) and the net and gross wall area over all layers.
- Filter by wall kind (exterior, interior, party wall, …), derived from the element number; totals
  and export follow the filter.
- Needs zone information on the parts of each wall (property set `Data`, property `Zone`, as hsbCAD
  exports it). Floors and roofs are not analysed yet.

### hsbCAD zones (Elements → Hierarchy → hsbCAD zones)
- Show or hide timber-frame parts per hsbCAD zone (property `Data.Zone`), as a hierarchy mode.

### Fixes
- A model reopened from the browser cache kept no length unit, so millimetre models were read as
  metres. The unit is now restored on a cached reload.

## Upstream contributions

Problems found in IFClite itself are reported upstream rather than only patched here:

- [LTplus-AG/ifc-lite#6027](https://github.com/LTplus-AG/ifc-lite/issues/6027): thin plates lost an
  edge in the 2D line merger, fixed upstream in
  [LTplus-AG/ifc-lite#6062](https://github.com/LTplus-AG/ifc-lite/pull/6062).

## Run it locally

Requirements: Node.js 22 and pnpm 10 (via corepack). The prebuilt WASM is fetched from npm, so no
Rust toolchain is needed for the viewer.

```bash
git clone -b snedes https://github.com/jvanderborght/ifc-lite-snedes.git
cd ifc-lite-snedes
corepack pnpm install
corepack pnpm build:wasm:fetch
corepack pnpm dev
```

## Licences

- **Code**: like IFClite, this fork is licensed under the
  [Mozilla Public License 2.0](../LICENSE). The IFClite code remains the work of its authors; files
  added by this fork carry the MPL-2.0 header, and files modified here remain under MPL-2.0. The
  complete source of the fork is this repository.
- **Third-party packages** keep their own licences (for example `earcut`, ISC, used by the section
  export).
- **Names and logos**: "IFClite" and its logo belong to their respective owners and are used here
  only to identify the upstream project.
- **NPR 2068** is a publication of NEN (© NEN). Its text is not included in this repository. The
  wall analysis is an independent implementation of its calculation method, not a certified tool:
  check results before relying on them.

This software is provided "as is", without warranty, as set out in sections 6 and 7 of the MPL-2.0.

## Questions and issues

This fork does not take issues. Problems with IFClite itself belong in the
[IFClite repository](https://github.com/LTplus-AG/ifc-lite/issues).
