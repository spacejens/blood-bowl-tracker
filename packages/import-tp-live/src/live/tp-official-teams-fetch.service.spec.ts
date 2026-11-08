import type {
  ImportError,
  TpOfficialRace,
} from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import type { TpBaseUrls } from '@blood-bowl-tracker/tp-paths';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpOfficialTeamsFetchService } from './tp-official-teams-fetch.service';
import { TpRequestFetchService } from './tp-request-fetch.service';

const API = 'https://tp.example/api/';
const TEAMS_PAGE = 'https://tp.example/blood-bowl/teams';
const RACES: TpOfficialRace[] = [
  { name: 'Orc', teamRaceCode: 'orc25', isOfficial: true, positions: [] },
];

describe('TpOfficialTeamsFetchService', () => {
  let service: TpOfficialTeamsFetchService;
  let requestFetch: MockProxy<TpRequestFetchService>;
  let parser: MockProxy<OfficialTeamsParserService>;
  let errors: ImportError[];

  beforeEach(async () => {
    requestFetch = mock<TpRequestFetchService>();
    const baseUrls = mock<TpBaseUrls>();
    baseUrls.getBackendApiUrl.mockReturnValue(API);
    baseUrls.getFrontendBaseUrl.mockReturnValue(
      'https://tp.example/blood-bowl/',
    );
    requestFetch.baseUrls.mockReturnValue(baseUrls);
    requestFetch.fetch.mockResolvedValue({ content: { raw: true } });
    parser = mock<OfficialTeamsParserService>();
    parser.parse.mockReturnValue(RACES);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialTeamsFetchService,
        { provide: TpRequestFetchService, useValue: requestFetch },
        TpOfficialTeamsPathsService,
        { provide: OfficialTeamsParserService, useValue: parser },
        ImportResultService,
        UpsertRecorderService,
      ],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsFetchService);
  });

  it("requests and parses the rules set's list with the teams page as referer", async () => {
    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2025', errors }),
    ).resolves.toEqual(RACES);
    expect(requestFetch.fetch).toHaveBeenCalledWith({
      request: {
        path: 'rosters/masters?ruleSet=25',
        url: `${API}rosters/masters?ruleSet=25`,
        referer: TEAMS_PAGE,
      },
      what: "TP's official team list for rules set BB2025",
      item: { rulesSet: 'BB2025', path: 'rosters/masters?ruleSet=25' },
      errors,
      session: undefined,
    });
    expect(parser.parse).toHaveBeenCalledWith({ raw: true });
    expect(errors).toEqual([]);
  });

  it('passes the given session on', async () => {
    const given = mock<TpFetchSession>();

    await service.fetchOfficialTeams({
      rulesSet: 'BB2025',
      errors,
      session: given,
    });

    expect(requestFetch.fetch.mock.calls[0][0].session).toBe(given);
  });

  it('records one error and fetches nothing for a rules set TP has no id for', async () => {
    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2016', errors }),
    ).resolves.toBeUndefined();
    expect(requestFetch.fetch).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { rulesSet: 'BB2016' },
        message:
          "Could not fetch TP's official team list for rules set BB2016: TP has no ruleSet id for it.",
      },
    ]);
  });

  it('yields undefined without parsing when the request fails', async () => {
    requestFetch.fetch.mockResolvedValue(undefined);

    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2025', errors }),
    ).resolves.toBeUndefined();
    expect(parser.parse).not.toHaveBeenCalled();
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

  it('lets a TP block stop the import', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    requestFetch.fetch.mockRejectedValue(blocked);

    await expect(
      service.fetchOfficialTeams({ rulesSet: 'BB2025', errors }),
    ).rejects.toBe(blocked);
  });
});
