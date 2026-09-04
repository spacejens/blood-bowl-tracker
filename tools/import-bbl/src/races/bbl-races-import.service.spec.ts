import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  mockBblSourceReader,
  mockBblSourceReaderByType,
} from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import { BblRaceNameService } from '../source/bbl-race-name.service';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblRacesImportService } from './bbl-races-import.service';
import { RaceListPageParser } from './race-list-page-parser';
import type { BblRace } from './race-page-parser';
import { RacePageParser } from './race-page-parser';

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
 * only what BblRacesImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

/**
 * A fake team page carrying its race name and numeric BBL id in params for the
 * stub parser. The id defaults to one derived from the name so distinct races
 * get distinct ids; pass an explicit id to control it.
 */
function page(raceName: string | null, id?: string): BblPage {
  return {
    type: 'tm',
    params: {
      race: raceName ?? '',
      raceId: raceName ? (id ?? `id-${raceName}`) : '',
    },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

/** A fake tl (race-list) page carrying a JSON array of races in params. */
function listPage(races: BblRace[]): BblPage {
  return {
    type: 'tl',
    params: { races: JSON.stringify(races) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function upsertRaceOk(): (data: { name?: string }) => Promise<{
  id: number;
  name: string;
  eras: number[];
  createdAt: Date;
  created: boolean;
}> {
  let nextId = 100;
  return (data) =>
    Promise.resolve({
      id: nextId++,
      // UpsertRaceSchema.name is optional to support partial-upsert
      // payloads, but this test's own fixtures always supply a race name,
      // so it is safe to assert non-null here.
      name: data.name!,
      eras: [],
      createdAt: new Date('2026-01-01'),
      created: true,
    });
}

interface Mocks {
  parser: MockProxy<RacePageParser>;
  listParser: MockProxy<RaceListPageParser>;
  racesImport: MockProxy<RacesImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
  bblRaceName: MockProxy<BblRaceNameService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblRacesImportService; mocks: Mocks }> {
  const parser = mock<RacePageParser>();
  parser.extractRace.mockImplementation((p) =>
    p.params.race ? { id: p.params.raceId, name: p.params.race } : null,
  );

  const listParser = mock<RaceListPageParser>();
  listParser.extractRaces.mockReturnValue([]);

  const racesImport = mock<RacesImportService>();
  racesImport.upsert.mockImplementation(upsertRaceOk());

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  // `forRace` is a pure identity passthrough with no branching or formatting,
  // so there is no algorithm here that can drift out of sync with the real
  // NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forRace.mockImplementation((name) => name);

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

  const bblRaceName = mock<BblRaceNameService>();
  // Canned pass-through default: these tests assert which race name the
  // service under test hands to the canonicalizer and to forRace, not what
  // the canonicalizer computes -- that is BblRaceNameService's own spec's
  // job. The suffix-stripping test below overrides this with a canned value.
  bblRaceName.canonical.mockImplementation((name) => name);

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblRacesImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: RacePageParser, useValue: parser },
      { provide: RaceListPageParser, useValue: listParser },
      { provide: RacesImportService, useValue: racesImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
      { provide: BblRaceNameService, useValue: bblRaceName },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblRacesImportService),
    mocks: {
      parser,
      listParser,
      racesImport,
      bootstrap,
      nameConfig,
      importResults,
      pageParseError,
      bblRaceName,
    },
  };
}

describe('BblRacesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc')]),
    );

    await service.importRaces();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts the configured BBL system name when BBL_EXTERNAL_SYSTEM_NAME is set', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc', '16')]),
    );
    mocks.nameConfig.getBblSystemName.mockReturnValue('MyLeague');

    await service.importRaces();

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts each race with a numeric BBL external ID and a Name external ID', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc', '16')]),
    );

    await service.importRaces();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.racesImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Orc',
        eras: [],
        externalIds: [
          { externalSystemId: 1, externalId: '16' },
          { externalSystemId: 2, externalId: 'Orc' },
        ],
      },
      expect.any(Array),
    );
  });

  it('canonicalizes the scraped race name for both the display name and the Name external ID', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Dark Elf Team', '13')]),
    );
    // Canned value: BblRaceNameService's own suffix-stripping is covered by
    // ../source/bbl-race-name.service.spec.ts.
    mocks.bblRaceName.canonical.mockReturnValue('Dark Elf');

    const { racesByBblId } = await service.importRaces();

    expect(mocks.bblRaceName.canonical).toHaveBeenCalledWith('Dark Elf Team');
    expect(mocks.racesImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Dark Elf',
        eras: [],
        externalIds: [
          { externalSystemId: 1, externalId: '13' },
          { externalSystemId: 2, externalId: 'Dark Elf' },
        ],
      },
      expect.any(Array),
    );
    // The BBL-id map keeps the raw scraped name on purpose: it feeds only
    // log/error messages in the downstream positions import.
    expect(racesByBblId.get('13')?.name).toBe('Dark Elf Team');
  });

  it('deduplicates a race (by id) appearing on multiple team pages', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([
        page('Orc', '16'),
        page('Orc', '16'),
        page('Elf', '6'),
      ]),
    );

    await service.importRaces();

    expect(mocks.racesImport.upsert).toHaveBeenCalledTimes(2);
    expect(resultArgs(mocks.importResults).imported).toBe(2);
  });

  it('skips team pages that have no race', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page(null), page('Elf')]),
    );

    await service.importRaces();

    expect(mocks.racesImport.upsert).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
  });

  it('records an error and continues when a race upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc'), page('Elf')]),
    );
    mocks.racesImport.upsert.mockImplementationOnce((_data, errors) => {
      errors.push({ item: {}, message: 'Failed to import race "Orc"' });
      return Promise.resolve(undefined);
    });

    await service.importRaces();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('Orc'))).toBe(true);
  });

  it('records an error and continues when a team page fails to parse', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc'), page('Elf')]),
    );
    mocks.parser.extractRace.mockImplementationOnce(() => {
      throw new Error('bad page');
    });

    await service.importRaces();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.racesImport.upsert).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { race: 'Orc', raceId: 'id-Orc' },
      'team',
      new Error('bad page'),
    );
  });

  it('passes a non-Error thrown team-page value straight through to PageParseErrorService', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc')]),
    );
    mocks.parser.extractRace.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });

    await service.importRaces();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { race: 'Orc', raceId: 'id-Orc' },
      'team',
      'bad page',
    );
  });

  it('records one error and skips races when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc')]),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importRaces();

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({ externalSystems: ['BBL', 'Name'] });
    expect(mocks.racesImport.upsert).not.toHaveBeenCalled();
  });

  it('returns a map from each race BBL id to its local id and name', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc', '16'), page('Elf', '6')]),
    );
    mocks.racesImport.upsert.mockImplementation((data) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name!, // fixtures always supply a race name
        eras: [],
        createdAt: new Date('2026-01-01'),
        created: true,
      }),
    );

    const { racesByBblId } = await service.importRaces();

    expect(racesByBblId.get('16')).toEqual({ id: 100, name: 'Orc' });
    expect(racesByBblId.get('6')).toEqual({ id: 200, name: 'Elf' });
  });

  it('returns a map from each race local id to its upsert data', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReader([page('Orc', '16'), page('Elf', '6')]),
    );
    mocks.racesImport.upsert.mockImplementation((data) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name!, // fixtures always supply a race name
        eras: [],
        createdAt: new Date('2026-01-01'),
        created: true,
      }),
    );

    const { racesByRaceId } = await service.importRaces();

    expect(racesByRaceId.get(100)).toEqual({
      name: 'Orc',
      eras: [],
      externalIds: [
        { externalSystemId: 1, externalId: '16' },
        { externalSystemId: 2, externalId: 'Orc' },
      ],
    });
    expect(racesByRaceId.get(200)).toEqual({
      name: 'Elf',
      eras: [],
      externalIds: [
        { externalSystemId: 1, externalId: '6' },
        { externalSystemId: 2, externalId: 'Elf' },
      ],
    });
  });

  it('imports a race found only on the tl page (no team page)', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([{ id: '48', name: 'College of Shadow' }])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(
      (p) => JSON.parse(p.params.races) as BblRace[],
    );

    await service.importRaces();

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.racesImport.upsert).toHaveBeenCalledWith(
      {
        name: 'College of Shadow',
        eras: [],
        externalIds: [
          { externalSystemId: 1, externalId: '48' },
          { externalSystemId: 2, externalId: 'College of Shadow' },
        ],
      },
      expect.any(Array),
    );
  });

  it('does not re-import a race already found via a team page (first pass wins)', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([{ id: '16', name: 'Orc (tl heading)' }])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(
      (p) => JSON.parse(p.params.races) as BblRace[],
    );

    await service.importRaces();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.racesImport.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.racesImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Orc' }),
      expect.any(Array),
    );
  });

  it('imports a race present only on old team pages and absent from tl', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        tm: [page('Retired Race', '22')],
        tl: [listPage([])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(
      (p) => JSON.parse(p.params.races) as BblRace[],
    );

    await service.importRaces();

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.racesImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Retired Race' }),
      expect.any(Array),
    );
  });

  it('records an error and continues when a tl page fails to parse', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(() => {
      throw new Error('bad race list page');
    });

    await service.importRaces();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.racesImport.upsert).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { races: '[]' },
      'race list',
      new Error('bad race list page'),
    );
  });

  it('passes a non-Error thrown race-list-page value straight through to PageParseErrorService', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad race list page';
    });

    await service.importRaces();

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { races: '[]' },
      'race list',
      'bad race list page',
    );
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService(
      mockBblSourceReader([page('Orc', '16')]),
    );

    const { result } = await service.importRaces();

    expect(result).toBe(CANNED_RESULT);
  });
});
