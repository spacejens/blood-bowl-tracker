import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialTeamsFetchService } from './tp-official-teams-fetch.service';

const API = 'https://tp.example/api/';
const TEAMS_PAGE = 'https://tp.example/blood-bowl/teams';
const RACES: TpOfficialRace[] = [
  { name: 'Orc', teamRaceCode: 'orc25', isOfficial: true, positions: [] },
];

describe('TpOfficialTeamsFetchService', () => {
  let service: TpOfficialTeamsFetchService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let parser: MockProxy<OfficialTeamsParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    const connection = mock<TpConnectionProvider>();
    connection.getBackendApiUrl.mockReturnValue(API);
    connection.getFrontendUrl.mockReturnValue('https://tp.example/blood-bowl/');
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    session.fetch.mockResolvedValue({ raw: true });
    parser = mock<OfficialTeamsParserService>();
    parser.parse.mockReturnValue(RACES);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialTeamsFetchService,
        { provide: TP_CONNECTION_PROVIDER, useValue: connection },
        { provide: TpFetcherService, useValue: fetcher },
        TpOfficialTeamsPathsService,
        { provide: OfficialTeamsParserService, useValue: parser },
        TpImportResultsService,
        TpUpsertRunnerService,
      ],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsFetchService);
  });

  it("fetches and parses the rules set's list with the teams page as referer", async () => {
    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2025', errors }),
    ).resolves.toEqual(RACES);
    expect(session.fetch).toHaveBeenCalledWith(
      `${API}rosters/masters?ruleSet=25`,
      { referer: TEAMS_PAGE },
    );
    expect(parser.parse).toHaveBeenCalledWith({ raw: true });
    expect(errors).toEqual([]);
  });

  it('fetches through a given session', async () => {
    const given = mock<TpFetchSession>();
    given.fetch.mockResolvedValue({});

    await service.fetchOfficialTeams({
      rulesSet: 'BB2025',
      errors,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(given.fetch).toHaveBeenCalledTimes(1);
  });

  it('records one error and fetches nothing for a rules set TP has no id for', async () => {
    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2016', errors }),
    ).resolves.toBeUndefined();
    expect(session.fetch).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { rulesSet: 'BB2016' },
        message:
          "Could not fetch TP's official team list for rules set BB2016: TP has no ruleSet id for it.",
      },
    ]);
  });

  it('records one error and yields undefined when the request fails', async () => {
    session.fetch.mockRejectedValue(new Error('status 403'));

    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2025', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { rulesSet: 'BB2025', path: 'rosters/masters?ruleSet=25' },
        message:
          "Could not fetch TP's official team list for rules set BB2025: status 403",
      },
    ]);
  });

  it('records one error and yields undefined when the response does not parse', async () => {
    parser.parse.mockImplementation(() => {
      throw new Error('Invalid TP official teams JSON: (root)');
    });

    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2025', errors }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { rulesSet: 'BB2025', path: 'rosters/masters?ruleSet=25' },
        message:
          "Could not parse TP's official team list for rules set BB2025: Invalid TP official teams JSON: (root)",
      },
    ]);
  });
});
