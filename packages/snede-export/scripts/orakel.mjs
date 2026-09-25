/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @unwired-by-design development harness: writes one section as DXF in
 * absolute world millimetres (no sheet layout) so an external reference
 * implementation can compare it line by line. Not a CI gate.
 *
 *   pnpm --filter @ifc-lite/snede-export orakel <model.ifc> <out.dxf> "S1:x=22600" [diepte_mm]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { GeometryProcessor } from '@ifc-lite/geometry';
import { geplaatsteMeshes, schrijfDxf, tekenSnede, vlakUitTekst } from '../dist/index.js';

const [ifcPad, uitPad, vlakTekst, diepteTekst] = process.argv.slice(2);
if (!ifcPad || !uitPad || !vlakTekst) {
  console.error('gebruik: orakel <model.ifc> <out.dxf> "S1:x=22600" [diepte_mm]');
  process.exit(2);
}

const t0 = performance.now();
const gp = new GeometryProcessor();
await gp.init();
const resultaat = await gp.process(new Uint8Array(await readFile(ifcPad)));
gp.dispose();
const meshes = geplaatsteMeshes(resultaat.meshes);
const t1 = performance.now();
console.log(`geometrie: ${meshes.length} meshes in ${((t1 - t0) / 1000).toFixed(1)} s`);
console.log('coordinateInfo:', JSON.stringify({
  originShift: resultaat.coordinateInfo?.originShift,
  wasmRtcOffset: resultaat.coordinateInfo?.wasmRtcOffset,
}));

const vlak = vlakUitTekst(vlakTekst, Number(diepteTekst ?? 0));
const lijnen = await tekenSnede(meshes, resultaat.coordinateInfo, vlak);
const telling = { snede: 0, zicht: 0, verborgen: 0 };
for (const l of lijnen) telling[l.soort]++;
console.log(`snede ${vlak.naam}: ${JSON.stringify(telling)} in ${((performance.now() - t1) / 1000).toFixed(1)} s`);
await writeFile(uitPad, schrijfDxf(lijnen), 'utf8');
console.log(`-> ${uitPad}`);
