import {
  CoachesImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblCoachesImportService } from './bbl-coaches-import.service';
import { makeCoachRecord } from './bbl-coaches-import.test-helpers';
import { CoachPageParser } from './coach-page-parser';

function page(coachName: string | null): BblPage {
  return {
    type: 'tm',
    params: { coach: coachName ?? '' },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

/** A source reader whose pages() yields the given fake pages. */
function makeReader(pages: BblPage[]): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages() {
      for (const p of pages) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

interface Mocks {
  parser: MockProxy<CoachPageParser>;
  coachesImport: MockProxy<CoachesImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  pageParseError: MockProxy<PageParseErrorService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Mocks that gate assertions elsewhere in this file
 * (name resolution, error building) mirror the real, deterministic
 * production logic so a regression in the service under test still fails
 * these tests.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblCoachesImportService; mocks: Mocks }> {
  const parser = mock<CoachPageParser>();
  parser.extractCoach.mockImplementation((p) =>
    p.params.coach ? { name: p.params.coach } : null,
  );

  const coachesImport = mock<CoachesImportService>();
  coachesImport.upsertCoach.mockResolvedValue(makeCoachRecord());

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forCoach.mockImplementation((name) => name);

  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));

  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockImplementation(
    (pageParams, pageDescription, error) =>
      importResults.error({
        item: { page: pageParams },
        message: `Failed to parse ${pageDescription} page ${JSON.stringify(pageParams)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  );

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblCoachesImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: CoachPageParser, useValue: parser },
      { provide: CoachesImportService, useValue: coachesImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblCoachesImportService),
    mocks: {
      parser,
      coachesImport,
      bootstrap,
      nameConfig,
      nameExternalId,
      pageParseError,
    },
  };
}

describe('BblCoachesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const { service, mocks } = await makeService(makeReader([page('Hugo E')]));

    await service.importCoaches();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts the configured BBL system name when BBL_EXTERNAL_SYSTEM_NAME is set', async () => {
    const { service, mocks } = await makeService(makeReader([page('Hugo E')]));
    mocks.nameConfig.getBblSystemName.mockReturnValue('MyLeague');

    await service.importCoaches();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts each coach with exact-name BBL and Name external IDs', async () => {
    const { service, mocks } = await makeService(makeReader([page('Hugo E')]));

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(1);
    expect(mocks.coachesImport.upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Hugo E',
        externalIds: [
          { externalSystemId: 1, externalId: 'Hugo E' },
          { externalSystemId: 2, externalId: 'Hugo E' },
        ],
      },
      expect.any(Array),
    );
  });

  it('deduplicates a coach appearing on multiple team pages', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Hugo E'), page('Hugo E'), page('Tommy')]),
    );

    const { result } = await service.importCoaches();

    expect(mocks.coachesImport.upsertCoach).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('skips team pages that have no coach', async () => {
    const { service, mocks } = await makeService(
      makeReader([page(null), page('Tommy')]),
    );

    const { result } = await service.importCoaches();

    expect(mocks.coachesImport.upsertCoach).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it('records an error and continues when a coach upsert fails', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Hugo E'), page('Tommy')]),
    );
    mocks.coachesImport.upsertCoach.mockImplementationOnce((_data, errors) => {
      errors.push({ item: {}, message: 'Failed to import coach "Hugo E"' });
      return Promise.resolve(undefined);
    });

    const { result } = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('Hugo E'))).toBe(true);
  });

  it('records an error and continues when a team page fails to parse', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Hugo E'), page('Tommy')]),
    );
    mocks.parser.extractCoach.mockImplementationOnce(() => {
      throw new Error('bad page');
    });

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(1);
    expect(mocks.coachesImport.upsertCoach).toHaveBeenCalledTimes(1);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse team page'),
      ),
    ).toBe(true);
  });

  it('records a stringified error when a team page throws a non-Error value', async () => {
    const { service, mocks } = await makeService(makeReader([page('Hugo E')]));
    mocks.parser.extractCoach.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });

    const { result } = await service.importCoaches();

    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('bad page'))).toBe(
      true,
    );
  });

  it('records one error and skips coaches when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(makeReader([page('Hugo E')]));
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    const { result } = await service.importCoaches();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.coachesImport.upsertCoach).not.toHaveBeenCalled();
  });

  it('returns a coachIdsByName map from coach name to upserted db id', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Hugo E'), page('Roze Madder')]),
    );
    mocks.coachesImport.upsertCoach
      .mockResolvedValueOnce(makeCoachRecord())
      .mockResolvedValueOnce(makeCoachRecord({ id: 200, name: 'Roze Madder' }));

    const { coachIdsByName } = await service.importCoaches();

    expect(coachIdsByName.get('Hugo E')).toBe(100);
    expect(coachIdsByName.get('Roze Madder')).toBe(200);
  });
});
