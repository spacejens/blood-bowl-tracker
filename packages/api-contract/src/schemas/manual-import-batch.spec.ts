import { describe, expect, it } from 'vitest';

import {
  ManualImportBatchSchema,
  RecordManualImportBatchSchema,
} from './manual-import-batch';

describe('RecordManualImportBatchSchema', () => {
  const contentHash = 'a'.repeat(64);

  it('accepts a batch name and a lowercase hex SHA-256 digest', () => {
    expect(
      RecordManualImportBatchSchema.safeParse({
        name: '001-before-initial-sources',
        contentHash,
      }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(
      RecordManualImportBatchSchema.safeParse({ name: '', contentHash })
        .success,
    ).toBe(false);
  });

  it.each(['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)])(
    'rejects the digest %s',
    (bad) => {
      expect(
        RecordManualImportBatchSchema.safeParse({ name: 'x', contentHash: bad })
          .success,
      ).toBe(false);
    },
  );
});

describe('ManualImportBatchSchema', () => {
  it('coerces appliedAt to a Date', () => {
    const parsed = ManualImportBatchSchema.parse({
      name: '001-before-initial-sources',
      contentHash: 'a'.repeat(64),
      appliedAt: '2026-10-18T00:00:00.000Z',
    });
    expect(parsed.appliedAt).toEqual(new Date('2026-10-18T00:00:00.000Z'));
  });
});
