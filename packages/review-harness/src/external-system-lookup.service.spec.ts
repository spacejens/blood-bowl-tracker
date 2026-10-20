import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ExternalSystemLookupService } from './external-system-lookup.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<ExternalSystemLookupService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ExternalSystemLookupService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(ExternalSystemLookupService);
}

describe('ExternalSystemLookupService', () => {
  it('returns the id of the external system for the source', async () => {
    const service = await makeService(mockDb([{ id: 7 }]));

    await expect(service.getSystemId('bbl')).resolves.toBe(7);
  });

  it('queries the database only once per source', async () => {
    const dbResult = mockDb([{ id: 7 }]);
    const service = await makeService(dbResult);

    await service.getSystemId('bbl');
    await service.getSystemId('bbl');

    expect(dbResult.chains).toHaveLength(1);
  });

  it('memoizes per source, so a second source still issues its own query', async () => {
    const dbResult = mockDb([{ id: 7 }], [{ id: 9 }]);
    const service = await makeService(dbResult);

    await expect(service.getSystemId('bbl')).resolves.toBe(7);
    await expect(service.getSystemId('tp')).resolves.toBe(9);
    expect(dbResult.chains).toHaveLength(2);
  });

  it('names the shared BBL system when it is missing from the database', async () => {
    const service = await makeService(mockDb([]));

    await expect(service.getSystemId('bbl')).rejects.toThrow(
      'No external system named "tloeg.bbleague.se" exists in the database. ' +
        'Check that the bbl import has run against this database.',
    );
  });

  it('names the shared TP system when it is missing from the database', async () => {
    const service = await makeService(mockDb([]));

    await expect(service.getSystemId('tp')).rejects.toThrow(
      /No external system named "tourplay\.net"/,
    );
  });

  it('refuses the manual source, which has no external system of its own', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await expect(service.getSystemId('manual')).rejects.toThrow(
      'The manual source has no external system of its own.',
    );
    expect(dbResult.chains).toHaveLength(0);
  });
});
