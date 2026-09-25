/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dutch (partial). Only the timber-fraction panel is translated so far; every
 * other key falls back to English one by one (see `../README.md`).
 */

import type { Catalogue } from '../registry';

export default {
  'timberFraction.title': 'Houtpercentage',
  'timberFraction.close': 'Sluiten',
  'timberFraction.intro': 'Aandeel hout in de regelwerkzone van elke wand: de IfcBeam-elementen met Data.Zone = 0 die onder de wand hangen. Meerdere definities naast elkaar.',
  'timberFraction.compute': 'Berekenen',
  'timberFraction.recompute': 'Opnieuw berekenen',
  'timberFraction.computing': 'Bezig… {done} van {total} wanden',
  'timberFraction.noModel': 'Geen IFC-model geladen.',
  'timberFraction.noWalls': 'Geen balken in zone 0 gevonden (IfcBeam met Data.Zone = 0 onder een wand).',
  'timberFraction.noScene': 'De 3D-scène is nog niet klaar. Wacht tot het model volledig geladen is.',
  'timberFraction.failed': 'Berekening mislukt: {message}',
  'timberFraction.selectHint': 'Klik op een rij om de onderdelen van de wand in 3D te selecteren.',
  'timberFraction.export': 'Exporteren',
  'timberFraction.exportCsv': 'CSV voor Excel (; en decimale komma)',
  'timberFraction.exportXlsx': 'Excel-werkmap (.xlsx)',
  'timberFraction.exportHtml': 'HTML-rapport',
  'timberFraction.exportTxt': 'Platte tekst (.txt)',
  'timberFraction.col.model': 'Model',
  'timberFraction.col.wall': 'Wand',
  'timberFraction.col.members': 'Balken zone 0',
  'timberFraction.col.length': 'Lengte (m)',
  'timberFraction.col.height': 'Hoogte (m)',
  'timberFraction.col.thickness': 'Zonedikte (mm)',
  'timberFraction.col.openingArea': 'Openingen (m²)',
  'timberFraction.col.timberVolume': 'Houtvolume, mesh (m³)',
  'timberFraction.col.timberVolumeAuthored': 'Houtvolume, B-rep (m³)',
  'timberFraction.col.notes': 'Opmerkingen',
  'timberFraction.variant.volumeGross': 'Volume bruto (%)',
  'timberFraction.variant.volumeNet': 'Volume netto (%)',
  'timberFraction.variant.volumeGrossAuthored': 'Volume bruto, B-rep (%)',
  'timberFraction.variant.volumeNetAuthored': 'Volume netto, B-rep (%)',
  'timberFraction.variant.sectionGross': 'Doorsnede bruto (%)',
  'timberFraction.variant.sectionNet': 'Doorsnede netto (%)',
  'timberFraction.variant.projectedGross': 'Projectie (%)',
  'timberFraction.variant.unionVolumeGross': 'Unievolume (%)',
  'timberFraction.definition.envelope': 'Regelwerkomhullende: lengte × hoogte die de balken van zone 0 beslaan in de eigen assen van de wand, maal de zonedikte (het dwarsbereik met het meeste houtvolume). De IfcWall zelf heeft vaak geen geometrie; er wordt niets uit gelezen.',
  'timberFraction.definition.volumeGross': 'Meshvolume van de balken in zone 0 ÷ volume van de omhullende.',
  'timberFraction.definition.volumeNet': 'Meshvolume van de balken in zone 0 ÷ ((lengte × hoogte − oppervlakte openingen) × zonedikte).',
  'timberFraction.definition.volumeGrossAuthored': 'Zoals „volume bruto”, maar met het exacte volume van elke balk uit zijn IfcFacetedBrep zoals geëxporteerd.',
  'timberFraction.definition.volumeNetAuthored': 'Zoals „volume netto”, met het B-rep-volume.',
  'timberFraction.definition.sectionGross': 'Houtoppervlakte in een doorsnede op halve zonedikte ÷ (lengte × hoogte).',
  'timberFraction.definition.sectionNet': 'Houtoppervlakte in die doorsnede buiten de openingen ÷ (lengte × hoogte − oppervlakte openingen).',
  'timberFraction.definition.projectedGross': 'Houtoppervlakte geprojecteerd op het wandvlak ÷ (lengte × hoogte).',
  'timberFraction.definition.unionVolumeGross': 'Volume van de unie van de balken binnen de zone (overlap telt één keer) ÷ volume van de omhullende.',
  'timberFraction.definition.openings': 'Openingen: de geometrie van de IfcOpeningElements die de wand uitsparen en tot in de regelwerkzone reiken, geprojecteerd op het wandvlak en begrensd tot de omhullende.',
  'timberFraction.definition.meshVsBrep': 'Mesh- en B-rep-volume verschillen waar de viewergeometrie de openingen van de wand ook uit haar onderdelen snijdt (bv. een onderregel die onder een deur doorloopt). Het B-rep-volume is de balk zoals geëxporteerd.',
  'timberFraction.definitions': 'Definities',
  'timberFraction.total': { one: 'Totaal ({count} wand)', other: 'Totaal ({count} wanden)' },
  'timberFraction.note.openMesh': { one: '{count} open mesh', other: '{count} open meshes' },
  'timberFraction.note.noGeometry': { one: '{count} zonder geometrie', other: '{count} zonder geometrie' },
  'timberFraction.note.noBrep': { one: '{count} zonder B-rep', other: '{count} zonder B-rep' },
  'timberFraction.note.deeper': 'onderdelen tot {mm} mm diep',
  'timberFraction.note.noParent': 'balken zonder bovenliggende wand',
  'timberFraction.reportTitle': 'Houtpercentage per wand',
  'timberFraction.reportSubtitle': '{model} · {date}',
  'timberFraction.sheetDefinitions': 'Definities',
} satisfies Catalogue;
