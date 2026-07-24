import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblRacesImportService } from './bbl-races-import.service';
import { RaceListPageParser } from './race-list-page-parser';
import type { BblRace } from './race-page-parser';
import { RacePageParser } from './race-page-parser';

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

/** A source reader whose pages(type) yields the pages registered for that type. */
function makeReaderByType(
  pagesByType: Record<string, BblPage[]>,
): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages(type: string) {
      for (const p of pagesByType[type] ?? []) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

function upsertRaceOk(): (data: { name: string }) => Promise<{
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
      name: data.name,
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
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Deterministic collaborators (name resolution, error
 * building) mirror the real production logic so a regression in the service
 * under test still fails these tests.
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
  racesImport.upsertRace.mockImplementation(upsertRaceOk());

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forRace.mockImplementation((name) => name);

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
    ],
  }).compile();

  return {
    service: moduleRef.get(BblRacesImportService),
    mocks: { parser, listParser, racesImport, bootstrap, nameConfig },
  };
}

describe('BblRacesImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const { service, mocks } = await makeService(makeReader([page('Orc')]));

    await service.importRaces();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts the configured BBL system name when BBL_EXTERNAL_SYSTEM_NAME is set', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Orc', '16')]),
    );
    mocks.nameConfig.getBblSystemName.mockReturnValue('MyLeague');

    await service.importRaces();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts each race with a numeric BBL external ID and a Name external ID', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Orc', '16')]),
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
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

  it('deduplicates a race (by id) appearing on multiple team pages', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Orc', '16'), page('Orc', '16'), page('Elf', '6')]),
    );

    const { result } = await service.importRaces();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('skips team pages that have no race', async () => {
    const { service, mocks } = await makeService(
      makeReader([page(null), page('Elf')]),
    );

    const { result } = await service.importRaces();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it('records an error and continues when a race upsert fails', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Orc'), page('Elf')]),
    );
    mocks.racesImport.upsertRace.mockImplementationOnce((_data, errors) => {
      errors.push({ item: {}, message: 'Failed to import race "Orc"' });
      return Promise.resolve(undefined);
    });

    const { result } = await service.importRaces();

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('Orc'))).toBe(true);
  });

  it('records an error and continues when a team page fails to parse', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Orc'), page('Elf')]),
    );
    mocks.parser.extractRace.mockImplementationOnce(() => {
      throw new Error('bad page');
    });

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledTimes(1);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse team page'),
      ),
    ).toBe(true);
  });

  it('records a stringified error when a team page throws a non-Error value', async () => {
    const { service, mocks } = await makeService(makeReader([page('Orc')]));
    mocks.parser.extractRace.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });

    const { result } = await service.importRaces();

    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('bad page'))).toBe(
      true,
    );
  });

  it('records one error and skips races when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(makeReader([page('Orc')]));
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    const { result } = await service.importRaces();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).not.toHaveBeenCalled();
  });

  it('returns a map from each race BBL id to its local id', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Orc', '16'), page('Elf', '6')]),
    );
    mocks.racesImport.upsertRace.mockImplementation((data) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name,
        eras: [],
        createdAt: new Date('2026-01-01'),
        created: true,
      }),
    );

    const { raceIdsByBblId } = await service.importRaces();

    expect(raceIdsByBblId.get('16')).toBe(100);
    expect(raceIdsByBblId.get('6')).toBe(200);
  });

  it('returns a map from each race BBL id to its local id and name', async () => {
    const { service, mocks } = await makeService(
      makeReader([page('Orc', '16'), page('Elf', '6')]),
    );
    mocks.racesImport.upsertRace.mockImplementation((data) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name,
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
      makeReader([page('Orc', '16'), page('Elf', '6')]),
    );
    mocks.racesImport.upsertRace.mockImplementation((data) =>
      Promise.resolve({
        id: data.name === 'Orc' ? 100 : 200,
        name: data.name,
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
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([{ id: '48', name: 'College of Shadow' }])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(
      (p) => JSON.parse(p.params.races) as BblRace[],
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(2);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
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
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([{ id: '16', name: 'Orc (tl heading)' }])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(
      (p) => JSON.parse(p.params.races) as BblRace[],
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Orc' }),
      expect.any(Array),
    );
  });

  it('imports a race present only on old team pages and absent from tl', async () => {
    const { service, mocks } = await makeService(
      makeReaderByType({
        tm: [page('Retired Race', '22')],
        tl: [listPage([])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(
      (p) => JSON.parse(p.params.races) as BblRace[],
    );

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Retired Race' }),
      expect.any(Array),
    );
  });

  it('records an error and continues when a tl page fails to parse', async () => {
    const { service, mocks } = await makeService(
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(() => {
      throw new Error('bad race list page');
    });

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mocks.racesImport.upsertRace).toHaveBeenCalledTimes(1);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse race list page'),
      ),
    ).toBe(true);
  });

  it('records a stringified error when a tl page throws a non-Error value', async () => {
    const { service, mocks } = await makeService(
      makeReaderByType({
        tm: [page('Orc', '16')],
        tl: [listPage([])],
      }),
    );
    mocks.listParser.extractRaces.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad race list page';
    });

    const { result } = await service.importRaces();

    expect(result.imported).toBe(1);
    expect(
      result.errors.some((e) => e.message.includes('bad race list page')),
    ).toBe(true);
  });
});
