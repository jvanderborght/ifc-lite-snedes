/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `savedSectionsSlice`'s teardown. The list is tied to the model it was made
 * for (world coordinates of that model), so a session reset and clearing all
 * models drop it; the per-model copy in localStorage is untouched and comes
 * back when that model is opened again. Removing one model of a federation
 * leaves it: the list follows the first visible model and is re-keyed by the
 * panel when that changes.
 */

import { defineSliceTeardown, notApplicable } from '../teardown.js';

export const savedSectionsTeardown = defineSliceTeardown(
  'savedSectionsSlice',
  ['savedSections', 'savedSectionsModelKey'],
  {
    'session-reset': () => ({ savedSections: [], savedSectionsModelKey: null }),
    'model-removed': notApplicable,
    'all-models-cleared': () => ({ savedSections: [], savedSectionsModelKey: null }),
  },
);
