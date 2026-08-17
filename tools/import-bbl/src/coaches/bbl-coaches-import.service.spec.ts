import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CoachesImportService,
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { mockBblSourceReader } from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblCoachesImportService } from './bbl-coaches-import.service';
import { makeCoachRecord } from './bbl-coaches-import.test-helpers';
import { CoachPageParser } from './coach-page-parser';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

/**
 * The canned ImportError the mocked PageParseErrorService.build returns.
 * PageParseErrorService's own message template — including the
 * `error instanceof Error ? error.message : String(error)` branch — is
 * covered by ../source/page-parse-error.service.spec.ts. This spec asserts
 * only what BblCoachesImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

function page(coachName: string | null): BblPage {
  return {
    type: 'tm',
    params: { coach: coachName ?? '' },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

interface Mocks {
  parser: MockProxy<CoachPageParser>;
  coachesImport: MockProxy<CoachesImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
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
  // `forCoach` is a pure identity passthrough with no branching or
  // formatting, so there is no algorithm here that can drift out of sync with
  // the real NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forCoach.mockImplementation((name) => name);

  const importResults = mock<ImportResultService>();
  // `error` is a pure identity field copy with no branching or formatting, so
  // there is no algorithm here that can drift out of sync with the real
  // ImportResultService — exempt from the canned-response rule.
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockReturnValue(CANNED_RESULT);

  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockReturnValue(CANNED_PAGE_PARSE_ERROR);

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
      importResults,
      pageParseError,
    },
  };
}

describe('BblCoachesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Hugo E')]),
    );

    await service.importCoaches();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts the configured BBL system name when BBL_EXTERNAL_SYSTEM_NAME is set', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Hugo E')]),
    );
    mocks.nameConfig.getBblSystemName.mockReturnValue('MyLeague');

    await service.importCoaches();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts each coach with exact-name BBL and Name external IDs', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Hugo E')]),
    );

    await service.importCoaches();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
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
      mockBblSourceReader([page('Hugo E'), page('Hugo E'), page('Tommy')]),
    );

    await service.importCoaches();

    expect(mocks.coachesImport.upsertCoach).toHaveBeenCalledTimes(2);
    expect(resultArgs(mocks.importResults).imported).toBe(2);
  });

  it('skips team pages that have no coach', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page(null), page('Tommy')]),
    );

    await service.importCoaches();

    expect(mocks.coachesImport.upsertCoach).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
  });

  it('records an error and continues when a coach upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Hugo E'), page('Tommy')]),
    );
    mocks.coachesImport.upsertCoach.mockImplementationOnce((_data, errors) => {
      errors.push({ item: {}, message: 'Failed to import coach "Hugo E"' });
      return Promise.resolve(undefined);
    });

    await service.importCoaches();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('Hugo E'))).toBe(true);
  });

  it('records an error and continues when a team page fails to parse', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Hugo E'), page('Tommy')]),
    );
    mocks.parser.extractCoach.mockImplementationOnce(() => {
      throw new Error('bad page');
    });

    await service.importCoaches();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.coachesImport.upsertCoach).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { coach: 'Hugo E' },
      'team',
      new Error('bad page'),
    );
  });

  it('passes a non-Error thrown team-page value straight through to PageParseErrorService', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Hugo E')]),
    );
    mocks.parser.extractCoach.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });

    await service.importCoaches();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { coach: 'Hugo E' },
      'team',
      'bad page',
    );
  });

  it('records one error and skips coaches when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Hugo E')]),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importCoaches();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({ externalSystems: ['BBL', 'Name'] });
    expect(mocks.coachesImport.upsertCoach).not.toHaveBeenCalled();
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService(
      mockBblSourceReader([page('Hugo E')]),
    );

    const { result } = await service.importCoaches();

    expect(result).toBe(CANNED_RESULT);
  });
});
