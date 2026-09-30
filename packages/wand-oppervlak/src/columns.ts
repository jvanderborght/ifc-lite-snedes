/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Column contract for a shared per-wall table ("wall analysis"): each module
 * offers columns over its own per-wall result, and the table computes the
 * total row per column from `total`. Labels are English source strings; the
 * viewer translates them through its catalogue.
 */

import type { WallAreaResult } from './area.js';

export interface WallColumn<R> {
  id: string;
  label: string;
  unit: 'm²' | 'm' | '';
  /** How the total row is formed: a plain sum, or no total. */
  total: 'sum' | 'none';
  value(result: R): number | null;
}

const col = (id: string, label: string, unit: WallColumn<WallAreaResult>['unit'], total: WallColumn<WallAreaResult>['total'], value: (r: WallAreaResult) => number | null): WallColumn<WallAreaResult> =>
  ({ id, label, unit, total, value });

export const WALL_AREA_COLUMNS: ReadonlyArray<WallColumn<WallAreaResult>> = [
  col('length', 'Length', 'm', 'none', (r) => r.length),
  col('height', 'Height', 'm', 'none', (r) => r.height),
  col('grossArea', 'Gross area', 'm²', 'sum', (r) => r.grossArea),
  col('openingArea', 'Openings', 'm²', 'sum', (r) => r.openingArea),
  col('netArea', 'Net area', 'm²', 'sum', (r) => r.netArea),
  col('sidePlusArea', 'Net area, zone + side', 'm²', 'sum', (r) => r.sidePlusArea),
  col('sideMinusArea', 'Net area, zone − side', 'm²', 'sum', (r) => r.sideMinusArea),
  col('declaredGross', 'GrossSideArea (IFC)', 'm²', 'sum', (r) => r.declared.grossSideArea),
  col('declaredNet', 'NetSideArea (IFC)', 'm²', 'sum', (r) => r.declared.netSideArea),
];
