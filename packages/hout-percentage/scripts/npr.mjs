/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @unwired-by-design development harness: the NPR 2068 timber fraction per
 * wall for one IFC file, from the authored B-reps only (no geometry
 * pipeline), printed as a tab-separated table. Not a CI gate.
 *
 *   pnpm --filter @ifc-lite/hout-percentage npr <model.ifc>
 */

import { readFile } from 'node:fs/promises';
import { IfcParser } from '@ifc-lite/parser';
import { authoredFaces, collectWalls } from '@ifc-lite/wand-oppervlak';
import { computeNpr, nprTotal } from '../dist/index.js';

const [ifcPad] = process.argv.slice(2);
if (!ifcPad) {
  console.error('gebruik: npr <model.ifc>');
  process.exit(2);
}
const bytes = new Uint8Array(await readFile(ifcPad));
const store = await new IfcParser().parseColumnar(bytes.buffer.slice(0));
const scale = store.lengthUnitScale ?? 1;
const geometry = { meshes: () => [], authored: (id) => authoredFaces(store, id, scale) };
const m2 = (x) => x.toFixed(2);
const pct = (x) => (x === null ? '' : (x * 100).toFixed(1));
console.log(['wand', 'status', 'bron', 'hout', 'openingen', 'omtrek', 'open.opp', 'A_con', 'A_b', 'A_a', '%', 'raveling', 'A_con excl.', 'A_b excl.', '% excl.'].join('\t'));
const results = [];
for (const wall of collectWalls(store)) {
  const r = computeNpr(wall, geometry);
  results.push(r);
  const x = r.ravelingExcluded;
  console.log([wall.name, r.status, r.source ?? '', r.timberParts, r.openingCount, m2(r.outlineArea), m2(r.openingArea), m2(r.aCon), m2(r.aB), m2(r.aA), pct(r.fraction), m2(r.ravelingArea), m2(x.aCon), m2(x.aB), pct(x.fraction)].join('\t'));
}
const t = nprTotal(results);
console.log(['TOTAAL', `${t.walls} wanden`, '', '', '', '', '', m2(t.aCon), m2(t.aB), m2(t.aA), pct(t.fraction), m2(t.ravelingArea), m2(t.ravelingExcluded.aCon), m2(t.ravelingExcluded.aB), pct(t.ravelingExcluded.fraction)].join('\t'));
