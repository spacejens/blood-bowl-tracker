import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { createExternalSystemLookupServiceBase } from './external-system-lookup-base.service';
import { createReviewConfigServiceBase } from './review-config-base.service';

const CONFIG_PATH = Symbol('TEST_CONFIG_PATH');
const CONFIG_FILE_NAME = 'review-test-config.json5';

/**
 * Stands in for a review tool's own config service. Only ever supplied as a
 * mock under its own token, so the real JSON5 loading never runs here.
 */
@Injectable()
class TestConfigService extends createReviewConfigServiceBase({
  pathToken: CONFIG_PATH,
  fileName: CONFIG_FILE_NAME,
  overrideLabel: 'external test ids',
}) {}

/** Stands in for a review tool's own one-line lookup subclass. */
@Injectable()
class TestExternalSystemLookupService extends createExternalSystemLookupServiceBase(
  TestConfigService,
  CONFIG_FILE_NAME,
) {}

async function makeService(
  dbResult: MockDbResult,
  externalSystemName = 'BBL',
): Promise<TestExternalSystemLookupService> {
  const config = mock<TestConfigService>();
  config.getExternalSystemName.mockReturnValue(externalSystemName);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TestExternalSystemLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: TestConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(TestExternalSystemLookupService);
}

describe('createExternalSystemLookupServiceBase', () => {
  it('returns the id of the external system named for the source', async () => {
    const dbResult = mockDb([{ id: 7 }]);
    const service = await makeService(dbResult, 'BBL');

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

  it('names the source and the passed-in config file when nothing matches', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult, 'Nope');

    await expect(service.getSystemId('tp')).rejects.toThrow(
      'No external system named "Nope" exists in the database. Check ' +
        `tp.externalSystemName in ${CONFIG_FILE_NAME} and that the import ` +
        'has run against this database.',
    );
  });
});
