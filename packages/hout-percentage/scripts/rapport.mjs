/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @unwired-by-design development harness: timber fraction per wall for one
 * IFC file, printed as a table (and optionally written as JSON for comparison
 * with an external reference). Not a CI gate.
 *
 *   pnpm --filter @ifc-lite/hout-percentage rapport <model.ifc> [out.json]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { GeometryProcessor } from '@ifc-lite/geometry';
import { IfcParser } from '@ifc-lite/parser';
import { authoredVolume, collectWalls, computeWall, totalOf, VARIANT_IDS } from '../dist/index.js';

const [ifcPad, jsonPad] = process.argv.slice(2);
if (!ifcPad) {
  console.error('gebruik: rapport <model.ifc> [out.json]');
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
const results = walls.map((w) => computeWall(w, (id) => byId.get(id) ?? [], { authoredVolume: (id) => authoredVolume(store, id, scale) }));
const t3 = performance.now();
console.error(`parse+wanden ${((t1 - t0) / 1000).toFixed(1)} s, geometrie ${((t2 - t1) / 1000).toFixed(1)} s, berekening ${((t3 - t2) / 1000).toFixed(1)} s`);

const pct = (x) => (x === null ? '   -  ' : (100 * x).toFixed(2).padStart(6));
const kop = ['wand', 'GUID', 'n', 'L', 'H', 'T', 'open', 'Vhout', ...VARIANT_IDS.map((v) => v.slice(0, 10)), 'meld'];
console.log(kop.join('\t'));
for (const r of results) {
  const meld = [
    r.openMembers.length ? `open:${r.openMembers.length}` : '',
    r.membersWithoutGeometry.length ? `geengeo:${r.membersWithoutGeometry.length}` : '',
    r.membersWithoutAuthoredVolume.length ? `geenbrep:${r.membersWithoutAuthoredVolume.length}` : '',
    r.openingCount ? `opn:${r.openingsUsed}/${r.openingCount}` : '',
    Math.abs(r.fullThickness - r.thickness) > 1e-4 ? `Tvol:${(r.fullThickness * 1000).toFixed(1)}` : '',
    r.sectionRowsRepaired ? `hersteld:${r.sectionRowsRepaired}` : '',
  ].filter(Boolean).join(' ');
  console.log([
    r.name, r.globalId, r.memberCount,
    (r.length * 1000).toFixed(0), (r.height * 1000).toFixed(0), (r.thickness * 1000).toFixed(1),
    r.openingArea.toFixed(3), r.timberVolume.toFixed(4),
    ...VARIANT_IDS.map((v) => pct(r.variants[v])), meld,
  ].join('\t'));
}
const tot = totalOf(results.filter((r) => r.wallId >= 0));
console.log(['TOTAAL', '', tot.memberCount, '', '', '', tot.openingArea.toFixed(3), tot.timberVolume.toFixed(4), ...VARIANT_IDS.map((v) => pct(tot.variants[v])), ''].join('\t'));
if (jsonPad) {
  await writeFile(jsonPad, JSON.stringify({ results, total: tot }, null, 1));
  console.error(`-> ${jsonPad}`);
}
