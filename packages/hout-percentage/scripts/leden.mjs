/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @unwired-by-design development harness: per-member volume and closedness
 * for the named walls, as JSON lines, to compare member by member with an
 * external reference. Not a CI gate.
 *
 *   node scripts/leden.mjs <model.ifc> <wall name> [<wall name> ...]
 */

import { readFile } from 'node:fs/promises';
import { GeometryProcessor } from '@ifc-lite/geometry';
import { IfcParser } from '@ifc-lite/parser';
import { collectWalls, meshVolume } from '../dist/index.js';

const [ifcPad, ...namen] = process.argv.slice(2);
const bytes = new Uint8Array(await readFile(ifcPad));
const store = await new IfcParser().parseColumnar(bytes.buffer.slice(0));
const gp = new GeometryProcessor();
await gp.init();
const res = await gp.process(bytes);
gp.dispose();
const byId = new Map();
for (const m of res.meshes) {
  if ((m.geometryClass ?? 0) === 1 || (m.geometryClass ?? 0) === 2) continue;
  const list = byId.get(m.expressId);
  if (list) list.push(m); else byId.set(m.expressId, [m]);
}
for (const w of collectWalls(store).filter((x) => namen.includes(x.name))) {
  for (const id of w.memberIds) {
    const v = meshVolume(byId.get(id) ?? []);
    console.log(JSON.stringify({ wand: w.name, id, gid: store.entities.getGlobalId(id), vol: v.volume, closed: v.closed, boundary: v.boundaryEdges, nonManifold: v.nonManifoldEdges, flipped: v.flipped, tris: v.triangles, pieces: (byId.get(id) ?? []).length }));
  }
}
