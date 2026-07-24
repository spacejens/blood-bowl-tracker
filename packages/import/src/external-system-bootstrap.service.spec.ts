import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportResultService } from './import-result.service';

describe('ExternalSystemBootstrapService', () => {
  let service: ExternalSystemBootstrapService;
  let externalSystemsImport: MockProxy<ExternalSystemsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    externalSystemsImport = mock<ExternalSystemsImportService>();
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((args) => args);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalSystemBootstrapService,
        {
          provide: ExternalSystemsImportService,
          useValue: externalSystemsImport,
        },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(ExternalSystemBootstrapService);
  });

  it('upserts every entry and returns ok with the ids in the same order', async () => {
    externalSystemsImport.upsertExternalSystem
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    await expect(
      service.bootstrap([
        { name: 'BBL', category: 'imported_data_source' },
        { name: 'Name', category: 'bookkeeping' },
      ]),
    ).resolves.toEqual({ ok: true, ids: [1, 2] });
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenNthCalledWith(
      1,
      'BBL',
      'imported_data_source',
    );
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenNthCalledWith(
      2,
      'Name',
      'bookkeeping',
    );
  });

  it('returns a not-ok result recording the names and message on failure', async () => {
    externalSystemsImport.upsertExternalSystem.mockRejectedValue(
      new Error('api down'),
    );

    await expect(
      service.bootstrap([
        { name: 'BBL', category: 'imported_data_source' },
        { name: 'Name', category: 'bookkeeping' },
      ]),
    ).resolves.toEqual({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'api down',
      },
    });
  });

  it('applies a caller-supplied prefix to the failure message', async () => {
    externalSystemsImport.upsertExternalSystem.mockRejectedValue(
      new Error('api down'),
    );

    await expect(
      service.bootstrap(
        [{ name: 'BBL', category: 'imported_data_source' }],
        'Failed to upsert external system: ',
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        item: { externalSystems: ['BBL'] },
        message: 'Failed to upsert external system: api down',
      },
    });
  });

  it('stringifies a non-Error throw', async () => {
    externalSystemsImport.upsertExternalSystem.mockRejectedValue('weird');

    await expect(
      service.bootstrap([{ name: 'BBL', category: 'imported_data_source' }]),
    ).resolves.toEqual({
      ok: false,
      error: { item: { externalSystems: ['BBL'] }, message: 'weird' },
    });
  });
});
