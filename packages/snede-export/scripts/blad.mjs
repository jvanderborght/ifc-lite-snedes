/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @unwired-by-design development harness: several sections laid out on one
 * DXF sheet. Not a CI gate.
 *
 *   node scripts/blad.mjs <model.ifc> <out.dxf> "A:x=22600" "B:y=15400" "P:z=1000"
 *        [--diepte 0] [--plannen rij|wereld] [--eenheid mm|cm|m] [--tussenruimte 10000]
 *        [--tekst 500] [--driehoek 500]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { GeometryProcessor } from '@ifc-lite/geometry';
import {
  annotaties, bladLijnen, geplaatsteMeshes, legBladAan, schrijfDxf, tekenSnede, vlakUitTekst,
} from '../dist/index.js';

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
const tussenruimte = Number(optie('tussenruimte', 10000));
const teksthoogte = Number(optie('tekst', 500));
const driehoek = Number(optie('driehoek', 500));
const [ifcPad, uitPad, ...vlakken] = args;
if (!ifcPad || !uitPad || !vlakken.length) {
  console.error('gebruik: blad <model.ifc> <out.dxf> "A:x=..." ["B:y=..." ...] [opties]');
  process.exit(2);
}

const gp = new GeometryProcessor();
await gp.init();
const resultaat = await gp.process(new Uint8Array(await readFile(ifcPad)));
gp.dispose();
const meshes = geplaatsteMeshes(resultaat.meshes);

const tekeningen = [];
for (const tekst of vlakken) {
  const vlak = vlakUitTekst(tekst, diepte);
  tekeningen.push({ vlak, lijnen: await tekenSnede(meshes, resultaat.coordinateInfo, vlak) });
}
const geplaatst = legBladAan(tekeningen, { plannen, tussenruimte });
for (const g of geplaatst) {
  const k = g.kader;
  const r = (v) => v.toFixed(0);
  console.log(`${g.vlak.naam}${g.isPlan ? ' (plan)' : ''}: ${g.lijnen.length} lijnen, verschuiving (${r(g.verschuiving.x)}, ${r(g.verschuiving.y)})`
    + (k ? `, kader (${r(k.min.x)}, ${r(k.min.y)}) - (${r(k.max.x)}, ${r(k.max.y)})` : ', leeg'));
}
await writeFile(uitPad, schrijfDxf(bladLijnen(geplaatst), {
  eenheid, annotaties: annotaties(geplaatst, { teksthoogte, driehoek }),
}), 'utf8');
console.log(`-> ${uitPad}`);
