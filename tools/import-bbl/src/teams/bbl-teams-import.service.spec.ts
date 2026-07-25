import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { CoachPageParser } from '../coaches/coach-page-parser';
import { RacePageParser } from '../races/race-page-parser';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblTeamsImportService } from './bbl-teams-import.service';
import { TeamPageParser } from './team-page-parser';

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
 * only what BblTeamsImportService hands to build() and that it pushes
 * build()'s return value onto the errors list.
 */
const CANNED_PAGE_PARSE_ERROR: ImportError = {
  item: { page: 'canned' },
  message: 'canned page parse error',
};

/**
 * A fake team page carrying the team id/name, the race's BBL id, and the coach
 * name in params for the stub parsers.
 */
function page(opts: {
  teamId?: string;
  teamName?: string;
  raceBblId?: string;
  coachName?: string;
}): BblPage {
  return {
    type: 'tm',
    params: {
      t: opts.teamId ?? '',
      teamName: opts.teamName ?? '',
      raceBblId: opts.raceBblId ?? '',
      coachName: opts.coachName ?? '',
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

interface Mocks {
  teamParser: MockProxy<TeamPageParser>;
  raceParser: MockProxy<RacePageParser>;
  coachParser: MockProxy<CoachPageParser>;
  teamsImport: MockProxy<TeamsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
  nameConfig: MockProxy<ExternalSystemNameConfigService>;
  nameExternalId: MockProxy<NameExternalIdService>;
  importResults: MockProxy<ImportResultService>;
  pageParseError: MockProxy<PageParseErrorService>;
}

/**
 * The full upsertTeam result record (TeamsImportService.upsertTeam resolves
 * the API's Team + created shape). This service only checks the result's
 * truthiness, so the field values are unremarkable defaults.
 */
function makeTeamRecord() {
  return {
    id: 1,
    name: 'Team',
    raceId: 500,
    coachId: 900,
    eras: [],
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. ImportResultService.result and
 * PageParseErrorService.build return canned values (see the constants above);
 * tests assert what this service passes to them, not what they compute.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblTeamsImportService; mocks: Mocks }> {
  const teamParser = mock<TeamPageParser>();
  teamParser.extractTeam.mockImplementation((p) =>
    p.params.t ? { id: p.params.t, name: p.params.teamName } : null,
  );

  const raceParser = mock<RacePageParser>();
  raceParser.extractRace.mockImplementation((p) =>
    p.params.raceBblId ? { id: p.params.raceBblId, name: 'RaceName' } : null,
  );

  const coachParser = mock<CoachPageParser>();
  coachParser.extractCoach.mockImplementation((p) =>
    p.params.coachName ? { name: p.params.coachName } : null,
  );

  const teamsImport = mock<TeamsImportService>();
  teamsImport.upsertTeam.mockResolvedValue(makeTeamRecord());

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  // `forTeam` is a pure identity passthrough with no branching or formatting,
  // so there is no algorithm here that can drift out of sync with the real
  // NameExternalIdService — exempt from the canned-response rule.
  nameExternalId.forTeam.mockImplementation((name) => name);

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
      BblTeamsImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: TeamPageParser, useValue: teamParser },
      { provide: RacePageParser, useValue: raceParser },
      { provide: CoachPageParser, useValue: coachParser },
      { provide: TeamsImportService, useValue: teamsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblTeamsImportService),
    mocks: {
      teamParser,
      raceParser,
      coachParser,
      teamsImport,
      bootstrap,
      nameConfig,
      nameExternalId,
      importResults,
      pageParseError,
    },
  };
}

const raceIds = new Map<string, number>([['16', 500]]);
const coachIds = new Map<string, number>([['Hugo E', 900]]);

describe('BblTeamsImportService', () => {
  it('upserts the BBL and Name external systems', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    await service.importTeams(raceIds, coachIds);

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts the configured BBL system name when set', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );
    mocks.nameConfig.getBblSystemName.mockReturnValue('MyLeague');

    await service.importTeams(raceIds, coachIds);

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith([
      { name: 'MyLeague', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('upserts a team with its resolved raceId/coachId and page-id + name external IDs', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    const { teamsByName } = await service.importTeams(raceIds, coachIds);

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledWith(
      {
        name: '40 grinders',
        raceId: 500,
        coachId: 900,
        eras: [],
        externalIds: [
          { externalSystemId: 1, externalId: '40g' },
          { externalSystemId: 2, externalId: '40 grinders' },
        ],
      },
      expect.any(Array),
    );
    expect(teamsByName.get('40 grinders')).toEqual({
      name: '40 grinders',
      raceId: 500,
      coachId: 900,
      eras: [],
      externalIds: [
        { externalSystemId: 1, externalId: '40g' },
        { externalSystemId: 2, externalId: '40 grinders' },
      ],
    });
  });

  it('deduplicates a team (by id) appearing on multiple pages', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    await service.importTeams(raceIds, coachIds);

    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
  });

  it('skips pages with no team', async () => {
    const { service, mocks } = await makeService(
      makeReader([page({ raceBblId: '16', coachName: 'Hugo E' })]),
    );

    await service.importTeams(raceIds, coachIds);

    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(resultArgs(mocks.importResults).imported).toBe(0);
  });

  it('records an error and skips a team whose race id is not in the map', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '999',
          coachName: 'Hugo E',
        }),
      ]),
    );

    await service.importTeams(raceIds, coachIds);

    const { errors } = resultArgs(mocks.importResults);
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(
      errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('records an error and skips a team with no race on the page', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({ teamId: '40g', teamName: '40 grinders', coachName: 'Hugo E' }),
      ]),
    );

    await service.importTeams(raceIds, coachIds);

    const { errors } = resultArgs(mocks.importResults);
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(
      errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('records an error and skips a team whose coach name is not in the map', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Nobody',
        }),
      ]),
    );

    await service.importTeams(raceIds, coachIds);

    const { errors } = resultArgs(mocks.importResults);
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(
      errors.some((e) => e.message.includes('could not resolve coach')),
    ).toBe(true);
  });

  it('records an error and continues when a team upsert fails', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );
    mocks.teamsImport.upsertTeam.mockImplementationOnce((_data, errors) => {
      errors.push({
        item: {},
        message: 'Failed to import team "40 grinders"',
      });
      return Promise.resolve(undefined);
    });

    await service.importTeams(raceIds, coachIds);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors.some((e) => e.message.includes('40 grinders'))).toBe(true);
  });

  it('records an error and continues when a page fails to parse', async () => {
    const { service, mocks } = await makeService(
      makeReader([page({ teamId: '40g', teamName: '40 grinders' })]),
    );
    mocks.teamParser.extractTeam.mockImplementation(() => {
      throw new Error('bad page');
    });

    await service.importTeams(raceIds, coachIds);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { t: '40g', teamName: '40 grinders', raceBblId: '', coachName: '' },
      'team',
      new Error('bad page'),
    );
  });

  it('passes a non-Error thrown team-page value straight through to PageParseErrorService', async () => {
    const { service, mocks } = await makeService(
      makeReader([page({ teamId: '40g', teamName: '40 grinders' })]),
    );
    mocks.teamParser.extractTeam.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });

    await service.importTeams(raceIds, coachIds);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { t: '40g', teamName: '40 grinders', raceBblId: '', coachName: '' },
      'team',
      'bad page',
    );
  });

  it('records one error and skips teams when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });

    await service.importTeams(raceIds, coachIds);

    const { errors } = resultArgs(mocks.importResults);
    expect(errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
  });

  it('returns a map from each team page code to its resolved race id', async () => {
    const { service } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    const { teamRaceIdsByCode } = await service.importTeams(raceIds, coachIds);

    expect(teamRaceIdsByCode.get('40g')).toBe(500);
  });

  it('returns teamsByCode keyed by the team BBL code', async () => {
    const { service } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    const { teamsByName, teamsByCode } = await service.importTeams(
      raceIds,
      coachIds,
    );

    // same UpsertTeam object is indexed under both name and code
    const code = '40g';
    const name = '40 grinders';
    expect(teamsByCode.get(code)).toEqual(teamsByName.get(name));
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service } = await makeService(
      makeReader([
        page({
          teamId: '40g',
          teamName: '40 grinders',
          raceBblId: '16',
          coachName: 'Hugo E',
        }),
      ]),
    );

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result).toBe(CANNED_RESULT);
  });
});
