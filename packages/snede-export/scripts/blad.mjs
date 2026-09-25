/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @unwired-by-design development harness: several sections laid out on one
 * DXF sheet. Not a CI gate.
 *
 *   node scripts/blad.mjs <model.ifc> <out.dxf> "A:x=22600" "B:y=15400" "P:z=1000"
 *        [--diepte 0] [--plannen rij|wereld] [--eenheid mm|cm|m] [--tussenruimte 10000]
 *        [--tekst 500] [--driehoek 500] [--verborgen] [--wel-verborgen-in-snede] [--diagnose]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { GeometryProcessor } from '@ifc-lite/geometry';
import { exporteer, verslagAlsTekst, vlakUitTekst } from '../dist/index.js';

const args = process.argv.slice(2);
const optie = (naam, standaard) => {
  const i = args.indexOf(`--${naam}`);
  if (i < 0) return standaard;
  const [, waarde] = args.splice(i, 2);
  return waarde;
};
const diepte = Number(optie('diepte', 0));
const plannen = optie('plannen', 'rij');
const eenheid = optie('eenheid', 'mm');
const verborgenLijnen = args.includes('--verborgen');
if (verborgenLijnen) args.splice(args.indexOf('--verborgen'), 1);
const verborgenBinnenSnede = args.includes('--wel-verborgen-in-snede');
if (verborgenBinnenSnede) args.splice(args.indexOf('--wel-verborgen-in-snede'), 1);
const metDiagnose = args.includes('--diagnose');
if (metDiagnose) args.splice(args.indexOf('--diagnose'), 1);
const tussenruimte = Number(optie('tussenruimte', 10000));
const teksthoogte = Number(optie('tekst', 500));
const driehoek = Number(optie('driehoek', 500));
const [ifcPad, uitPad, ...vlakken] = args;
if (!ifcPad || !uitPad || !vlakken.length) {
  console.error('gebruik: blad <model.ifc> <out.dxf> "A:x=..." ["B:y=..." ...] [opties]');
  process.exit(2);
}

const bytes = new Uint8Array(await readFile(ifcPad));
const gp = new GeometryProcessor();
await gp.init();
const resultaat = await gp.process(bytes);
// Diagnostics mean a second pass over the model, so only on request.
const diagnose = metDiagnose ? gp.diagnoseGeometry(bytes) : undefined;
gp.dispose();

const { dxf, verslag } = await exporteer(resultaat.meshes, resultaat.coordinateInfo,
  vlakken.map((tekst) => vlakUitTekst(tekst, diepte)), {
    blad: { plannen, tussenruimte },
    annotatie: { teksthoogte, driehoek },
    dxf: { eenheid, verborgenLijnen },
    zicht: { verborgenBinnenSnede },
    diagnose,
  });
await writeFile(uitPad, dxf, 'utf8');
console.log(verslagAlsTekst(verslag));
console.log(`-> ${uitPad}`);
