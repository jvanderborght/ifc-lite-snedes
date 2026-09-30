/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @unwired-by-design development harness: wall face area per wall for one IFC
 * file, printed as a tab-separated table (and optionally written as JSON for
 * comparison with an external reference). Not a CI gate.
 *
 *   pnpm --filter @ifc-lite/wand-oppervlak rapport <model.ifc> [out.json] [--folies] [--mesh]
 *
 * --folies keeps foils (parts <= 2 mm thick) in the silhouette; --mesh uses the
 * pipeline meshes only (no authored B-reps).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { GeometryProcessor } from '@ifc-lite/geometry';
import { IfcParser } from '@ifc-lite/parser';
import { authoredFaces, collectWalls, computeWallArea, totalOf } from '../dist/index.js';

const args = process.argv.slice(2);
const keepFoils = args.includes('--folies');
const meshOnly = args.includes('--mesh');
const [ifcPad, jsonPad] = args.filter((a) => !a.startsWith('--'));
if (!ifcPad) {
  console.error('gebruik: rapport <model.ifc> [out.json] [--folies]');
  process.exit(2);
}

const bytes = new Uint8Array(await readFile(ifcPad));
const t0 = performance.now();
const store = await new IfcParser().parseColumnar(bytes.buffer.slice(0));
const walls = collectWalls(store);
const t1 = performance.now();

const gp = new GeometryProcessor();
await gp.init();
const res = await gp.process(bytes);
gp.dispose();
const byId = new Map();
for (const m of res.meshes) {
  const cls = m.geometryClass ?? 0;
  if (cls === 1 || cls === 2) continue;
  const list = byId.get(m.expressId);
  if (list) list.push(m); else byId.set(m.expressId, [m]);
}
const t2 = performance.now();
const scale = store.lengthUnitScale ?? 1;
const geometry = {
  meshes: (id) => byId.get(id) ?? [],
  ...(meshOnly ? {} : { authored: (id) => authoredFaces(store, id, scale) }),
};
const results = walls.map((w) => computeWallArea(w, geometry, keepFoils ? { foilMaxThickness: 0 } : {}));
const t3 = performance.now();
console.error(`parse+wanden ${((t1 - t0) / 1000).toFixed(1)} s, geometrie ${((t2 - t1) / 1000).toFixed(1)} s, berekening ${((t3 - t2) / 1000).toFixed(1)} s`);

const m2 = (x) => (x === null || x === undefined ? '' : x.toFixed(3));
const mm = (x) => (x === null || x === undefined ? '' : (x * 1000).toFixed(0));
console.log(['wand', 'type', 'bron', 'delen', 'folies', 'geenGeo', 'open', 'openGeo', 'gaten', 'L', 'H', 'T', 'rechth', 'bruto', 'open.opp', 'netto', 'zijde+', 'zijde-', 'Qto bruto', 'Qto netto', 'Dim L', 'Dim H', 'Dim LxH'].join('\t'));
for (const r of results) {
  const d = r.declared;
  console.log([
    r.name + (r.parentWallId !== null ? ' (genest)' : ''), r.ifcType, r.source, r.partsCounted, r.foilsLeftOut, r.partsWithoutGeometry, r.openingCount, r.openingsWithGeometry, r.holeCount,
    mm(r.length), mm(r.height), mm(r.thickness), r.isRectangular ? 'ja' : 'nee',
    m2(r.grossArea), m2(r.openingArea), m2(r.netArea), m2(r.sidePlusArea), m2(r.sideMinusArea),
    m2(d.grossSideArea), m2(d.netSideArea), mm(d.dimensionsLength), mm(d.dimensionsHeight),
    d.dimensionsLength !== null && d.dimensionsHeight !== null ? m2(d.dimensionsLength * d.dimensionsHeight) : '',
  ].join('\t'));
}
const tot = totalOf(results);
console.log(['TOTAAL', `${tot.walls} wanden`, '', '', '', '', '', '', '', '', '', '', '', m2(tot.grossArea), m2(tot.openingArea), m2(tot.netArea), m2(tot.sidePlusArea), m2(tot.sideMinusArea)].join('\t'));
if (jsonPad) {
  await writeFile(jsonPad, JSON.stringify({ results, total: tot }, null, 1));
  console.error(`-> ${jsonPad}`);
}
