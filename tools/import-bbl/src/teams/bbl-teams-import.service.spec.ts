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
 * collaborator mocked. Deterministic collaborators (name resolution, error
 * building) mirror the real production logic so a regression in the service
 * under test still fails these tests.
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
  nameExternalId.forTeam.mockImplementation((name) => name);

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

    const { result, teamsByName } = await service.importTeams(
      raceIds,
      coachIds,
    );

    expect(result.imported).toBe(1);
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

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(mocks.teamsImport.upsertTeam).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
  });

  it('skips pages with no team', async () => {
    const { service, mocks } = await makeService(
      makeReader([page({ raceBblId: '16', coachName: 'Hugo E' })]),
    );

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
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

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('records an error and skips a team with no race on the page', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        page({ teamId: '40g', teamName: '40 grinders', coachName: 'Hugo E' }),
      ]),
    );

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve race')),
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

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(mocks.teamsImport.upsertTeam).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve coach')),
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

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.success).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('40 grinders'))).toBe(
      true,
    );
  });

  it('records an error and continues when a page fails to parse', async () => {
    const { service, mocks } = await makeService(
      makeReader([page({ teamId: '40g', teamName: '40 grinders' })]),
    );
    mocks.teamParser.extractTeam.mockImplementation(() => {
      throw new Error('bad page');
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.imported).toBe(0);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse team page'),
      ),
    ).toBe(true);
  });

  it('records a stringified error when a page throws a non-Error value', async () => {
    const { service, mocks } = await makeService(
      makeReader([page({ teamId: '40g', teamName: '40 grinders' })]),
    );
    mocks.teamParser.extractTeam.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'bad page';
    });

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('bad page'))).toBe(
      true,
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

    const { result } = await service.importTeams(raceIds, coachIds);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.errors[0].item).toEqual({
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

    const { result, teamsByName, teamsByCode } = await service.importTeams(
      raceIds,
      coachIds,
    );

    expect(result.success).toBe(true);
    // same UpsertTeam object is indexed under both name and code
    const code = '40g';
    const name = '40 grinders';
    expect(teamsByCode.get(code)).toEqual(teamsByName.get(name));
  });
});
