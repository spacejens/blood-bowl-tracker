import type { TpOfficialTeamsImportResult } from '@blood-bowl-tracker/api-contract';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpOfficialTeamsImportService } from '../official-teams/tp-official-teams-import.service';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpLiveOfficialTeamsImportService } from './tp-live-official-teams-import.service';
import { TpOfficialTeamsFetchService } from './tp-official-teams-fetch.service';

const ONE = { success: true, imported: 1, errors: [] };
const WRITTEN: TpOfficialTeamsImportResult = {
  races: ONE,
  positions: ONE,
  characteristics: ONE,
  keywords: ONE,
  startingSkills: ONE,
  positionCharacteristics: [],
};
const RACES: TpOfficialRace[] = [
  { name: 'Orc', teamRaceCode: 'orc', isOfficial: true, positions: [] },
  { name: 'Dwarf', teamRaceCode: 'dwarf', isOfficial: true, positions: [] },
];

describe('TpLiveOfficialTeamsImportService', () => {
  let service: TpLiveOfficialTeamsImportService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let officialTeamsFetch: MockProxy<TpOfficialTeamsFetchService>;
  let officialTeamsImport: MockProxy<TpOfficialTeamsImportService>;

  beforeEach(async () => {
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    officialTeamsFetch = mock<TpOfficialTeamsFetchService>();
    officialTeamsFetch.fetchOfficialTeams.mockResolvedValue(RACES);
    officialTeamsImport = mock<TpOfficialTeamsImportService>();
    officialTeamsImport.importOfficialTeams.mockResolvedValue(WRITTEN);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveOfficialTeamsImportService,
        TpImportResultsService,
        TpOfficialTeamsPathsService,
        { provide: TpFetcherService, useValue: fetcher },
        { provide: TpOfficialTeamsFetchService, useValue: officialTeamsFetch },
        {
          provide: TpOfficialTeamsImportService,
          useValue: officialTeamsImport,
        },
      ],
    }).compile();
    service = moduleRef.get(TpLiveOfficialTeamsImportService);
  });

  it('fetches and writes every known rules set through one shared session, under TP', async () => {
    const result = await service.importOfficialTeams();

    expect(fetcher.createSession).toHaveBeenCalledTimes(1);
    expect(
      officialTeamsFetch.fetchOfficialTeams.mock.calls.map(([options]) => [
        options.rulesSet,
        options.session,
      ]),
    ).toEqual([
      ['BB2020', session],
      ['DB2021', session],
      ['BB2025', session],
    ]);
    expect(officialTeamsImport.importOfficialTeams).toHaveBeenCalledWith({
      rulesSet: 'BB2020',
      races: RACES,
      externalSystemName: 'TP',
    });
    expect(result.rulesSets).toEqual(
      ['BB2020', 'DB2021', 'BB2025'].map((rulesSet) => ({
        rulesSet,
        fetch: { success: true, imported: 2, errors: [] },
        write: WRITTEN,
      })),
    );
  });

  it('fetches through a given session', async () => {
    const given = mock<TpFetchSession>();

    await service.importOfficialTeams({ session: given });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(officialTeamsFetch.fetchOfficialTeams.mock.calls[0][0].session).toBe(
      given,
    );
  });

  it('writes nothing for a rules set that fails to fetch, and still imports the others', async () => {
    officialTeamsFetch.fetchOfficialTeams.mockImplementationOnce(
      ({ errors }) => {
        errors.push({ item: { rulesSet: 'BB2020' }, message: 'status 403' });
        return Promise.resolve(undefined);
      },
    );

    const result = await service.importOfficialTeams();

    expect(result.rulesSets[0]).toEqual({
      rulesSet: 'BB2020',
      fetch: {
        success: false,
        imported: 0,
        errors: [{ item: { rulesSet: 'BB2020' }, message: 'status 403' }],
      },
      write: undefined,
    });
    expect(officialTeamsImport.importOfficialTeams).toHaveBeenCalledTimes(2);
    expect(result.rulesSets.map((entry) => entry.write)).toEqual([
      undefined,
      WRITTEN,
      WRITTEN,
    ]);
  });

  it('reports an unexpected error for one rules set when creating the session fails, and still imports the others', async () => {
    fetcher.createSession.mockImplementationOnce(() => {
      throw new Error('no cookie jar available');
    });

    const result = await service.importOfficialTeams();

    expect(result.rulesSets[0]).toEqual({
      rulesSet: 'BB2020',
      fetch: {
        success: false,
        imported: 0,
        errors: [
          {
            item: { rulesSet: 'BB2020' },
            message:
              "Unexpected error importing TP's official team list for rules set BB2020: no cookie jar available",
          },
        ],
      },
      write: undefined,
    });
    expect(fetcher.createSession).toHaveBeenCalledTimes(2);
    expect(result.rulesSets[1].write).toBe(WRITTEN);
    expect(result.rulesSets[2].write).toBe(WRITTEN);
  });

  it('reports an unexpected error for one rules set and still imports the others', async () => {
    officialTeamsImport.importOfficialTeams.mockRejectedValueOnce(
      new Error('connection reset'),
    );

    const result = await service.importOfficialTeams();

    expect(result.rulesSets[0]).toEqual({
      rulesSet: 'BB2020',
      fetch: {
        success: false,
        imported: 0,
        errors: [
          {
            item: { rulesSet: 'BB2020' },
            message:
              "Unexpected error importing TP's official team list for rules set BB2020: connection reset",
          },
        ],
      },
      write: undefined,
    });
    expect(result.rulesSets[1].write).toBe(WRITTEN);
    expect(result.rulesSets[2].write).toBe(WRITTEN);
  });
});
