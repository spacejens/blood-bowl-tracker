import {
  BBL_EXTERNAL_SYSTEM_NAME,
  NAF_EXTERNAL_SYSTEM_NAME,
  NAME_EXTERNAL_SYSTEM_NAME,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
import { describe, expect, it } from 'vitest';

import {
  BATCH_001,
  externalSystemNamesIn,
  listBatches,
  readRawBatch,
} from './curated-data.test-helpers';

const DEFINED_SYSTEM_NAMES: readonly string[] = [
  BBL_EXTERNAL_SYSTEM_NAME,
  TP_EXTERNAL_SYSTEM_NAME,
  NAME_EXTERNAL_SYSTEM_NAME,
  NAF_EXTERNAL_SYSTEM_NAME,
];

describe('curated data external-system names', () => {
  it.each(listBatches())(
    'uses only the shared external-system names in %s',
    (batch) => {
      const unknown = [...externalSystemNamesIn(readRawBatch(batch))].filter(
        (name) => !DEFINED_SYSTEM_NAMES.includes(name),
      );

      expect(unknown).toEqual([]);
    },
  );

  it('finds every shared system the initial seed references', () => {
    // Guards the walk itself: if it stopped finding names, the check above
    // would pass vacuously.
    expect([...externalSystemNamesIn(readRawBatch(BATCH_001))].sort()).toEqual(
      [...DEFINED_SYSTEM_NAMES].sort(),
    );
  });

  it('reports a misspelled system name nested in a cross-reference', () => {
    const names = externalSystemNamesIn({
      externalSystems: [
        { name: 'tourplay.net', category: 'imported_data_source' },
      ],
      trophyAwards: [{ competition: { system: 'TP', id: '1' } }],
    });

    expect([...names].sort()).toEqual(['TP', 'tourplay.net']);
  });
});
