import type { ImportResult } from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  AWAY_ROSTER_ID,
  HOME_ROSTER_ID,
  MATCH_TP_ID,
  tpMatch,
} from '../match/tp-match.test-helpers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpLiveMatchTeamsImportService } from './tp-live-match-teams-import.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpMatchFetchService } from './tp-match-fetch.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const teamImported: TpLiveTeamImportResult = {
  team: one,
  players: one,
  era: 'Fourth era',
  teamEra: { id: 31, eraId: 40 },
};
const teamNotImported: TpLiveTeamImportResult = {
  team: {
    success: false,
    imported: 0,
    errors: [{ item: 1, message: 'no coach' }],
  },
  players: nothing,
  era: undefined,
  teamEra: undefined,
};
const notAttemptedTeam: TpLiveTeamImportResult = {
  team: nothing,
  players: nothing,
  era: undefined,
  teamEra: undefined,
};

describe('TpLiveMatchTeamsImportService', () => {
  let service: TpLiveMatchTeamsImportService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let matchFetch: MockProxy<TpMatchFetchService>;
  let teamImport: MockProxy<TpLiveTeamImportService>;

  beforeEach(async () => {
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    matchFetch = mock<TpMatchFetchService>();
    matchFetch.fetchMatch.mockResolvedValue(tpMatch({ winner: undefined }));
    teamImport = mock<TpLiveTeamImportService>();
    teamImport.importTeam.mockResolvedValue(teamImported);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveMatchTeamsImportService,
        TpImportResultsService,
        { provide: TpFetcherService, useValue: fetcher },
        { provide: TpMatchFetchService, useValue: matchFetch },
        { provide: TpLiveTeamImportService, useValue: teamImport },
      ],
    }).compile();
    service = moduleRef.get(TpLiveMatchTeamsImportService);
  });

  const importMatchTeams = (era?: string) =>
    service.importMatchTeams({
      matchId: MATCH_TP_ID,
      tournamentSlug: 's30',
      era,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

  it("imports an unfinished match's home team, then its away team in the home team's era, through one fresh session, without error", async () => {
    await expect(importMatchTeams()).resolves.toEqual({
      match: nothing,
      homeTeam: teamImported,
      awayTeam: teamImported,
    });
    expect(matchFetch.fetchMatch).toHaveBeenCalledWith({
      matchId: MATCH_TP_ID,
      tournamentSlug: 's30',
      errors: [],
      session,
    });
    expect(teamImport.importTeam).toHaveBeenNthCalledWith(1, {
      rosterId: HOME_ROSTER_ID,
      era: undefined,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session,
      matchEmbeddedPlayers: [],
    });
    expect(teamImport.importTeam).toHaveBeenNthCalledWith(2, {
      rosterId: AWAY_ROSTER_ID,
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session,
      matchEmbeddedPlayers: [],
    });
  });

  it('imports the teams of a completed match too', async () => {
    matchFetch.fetchMatch.mockResolvedValue(tpMatch());

    await expect(importMatchTeams()).resolves.toEqual({
      match: nothing,
      homeTeam: teamImported,
      awayTeam: teamImported,
    });
  });

  it('passes an explicit era to the home team', async () => {
    await importMatchTeams('Third era');

    expect(teamImport.importTeam).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ era: 'Third era' }),
    );
  });

  it('fetches through a given session, starting none', async () => {
    const given = mock<TpFetchSession>();

    await service.importMatchTeams({
      matchId: MATCH_TP_ID,
      tournamentSlug: 's30',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(matchFetch.fetchMatch).toHaveBeenCalledWith(
      expect.objectContaining({ session: given }),
    );
  });

  it('reports a match fetch failure and imports no team', async () => {
    matchFetch.fetchMatch.mockImplementation(({ errors }) => {
      errors.push({
        item: { matchId: MATCH_TP_ID },
        message: 'Could not fetch TP match 662796: status 429',
      });
      return Promise.resolve(undefined);
    });

    await expect(importMatchTeams()).resolves.toEqual({
      match: {
        success: false,
        imported: 0,
        errors: [
          {
            item: { matchId: MATCH_TP_ID },
            message: 'Could not fetch TP match 662796: status 429',
          },
        ],
      },
      homeTeam: notAttemptedTeam,
      awayTeam: notAttemptedTeam,
    });
    expect(teamImport.importTeam).not.toHaveBeenCalled();
  });

  it('leaves the away team unattempted when the home team was not imported', async () => {
    teamImport.importTeam.mockResolvedValueOnce(teamNotImported);

    await expect(importMatchTeams()).resolves.toEqual({
      match: nothing,
      homeTeam: teamNotImported,
      awayTeam: notAttemptedTeam,
    });
    expect(teamImport.importTeam).toHaveBeenCalledTimes(1);
  });

  it('reports an away team that was not imported', async () => {
    teamImport.importTeam
      .mockResolvedValueOnce(teamImported)
      .mockResolvedValueOnce(teamNotImported);

    await expect(importMatchTeams()).resolves.toEqual({
      match: nothing,
      homeTeam: teamImported,
      awayTeam: teamNotImported,
    });
  });

  it('reports an unexpected error on the match stage instead of throwing', async () => {
    matchFetch.fetchMatch.mockRejectedValue(new Error('database down'));

    await expect(importMatchTeams()).resolves.toEqual({
      match: {
        success: false,
        imported: 0,
        errors: [
          {
            item: { matchId: MATCH_TP_ID },
            message: `Unexpected error importing the teams of match ${MATCH_TP_ID}: database down`,
          },
        ],
      },
      homeTeam: notAttemptedTeam,
      awayTeam: notAttemptedTeam,
    });
  });

  it('reports a non-Error rejection as a string', async () => {
    matchFetch.fetchMatch.mockRejectedValue('boom');

    const result = await importMatchTeams();

    expect(result.match.errors[0]?.message).toBe(
      `Unexpected error importing the teams of match ${MATCH_TP_ID}: boom`,
    );
  });
});
