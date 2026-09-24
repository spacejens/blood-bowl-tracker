import type {
  ImportResult,
  TpMatchImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  AWAY_ROSTER_ID,
  bracketMatch,
  HOME_ROSTER_ID,
  MATCH_TP_ID,
  tpMatch,
} from '../match/tp-match.test-helpers';
import { TpMatchImportService } from '../match/tp-match-import.service';
import { TpImportResultsService } from '../tp-import-results.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpLiveCompetitionUpsertService } from './tp-live-competition-upsert.service';
import { TpLiveMatchImportService } from './tp-live-match-import.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpMatchFetchService } from './tp-match-fetch.service';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const teamImported: TpLiveTeamImportResult = {
  team: one,
  players: one,
  era: 'Fourth era',
};
const teamNotImported: TpLiveTeamImportResult = {
  team: {
    success: false,
    imported: 0,
    errors: [{ item: 1, message: 'no coach' }],
  },
  players: nothing,
  era: undefined,
};
const notAttemptedTeam: TpLiveTeamImportResult = {
  team: nothing,
  players: nothing,
  era: undefined,
};
const BRACKET: TpBracket = {
  tournament: { id: 18442, name: 'Säsong 30', ruleSet: 25, phases: [], categoryIds: [22308] },
  matches: [bracketMatch()],
  playedDates: [new Date('2026-06-13')],
};
const CORE: TpMatchImportResult = {
  match: one,
  participation: one,
  events: { success: true, imported: 14, errors: [] },
  outcome: one,
};

describe('TpLiveMatchImportService', () => {
  let service: TpLiveMatchImportService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let matchFetch: MockProxy<TpMatchFetchService>;
  let bracketFetch: MockProxy<TpBracketFetchService>;
  let teamImport: MockProxy<TpLiveTeamImportService>;
  let competitionUpsert: MockProxy<TpLiveCompetitionUpsertService>;
  let matchImport: MockProxy<TpMatchImportService>;

  beforeEach(async () => {
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    matchFetch = mock<TpMatchFetchService>();
    bracketFetch = mock<TpBracketFetchService>();
    teamImport = mock<TpLiveTeamImportService>();
    competitionUpsert = mock<TpLiveCompetitionUpsertService>();
    matchImport = mock<TpMatchImportService>();
    matchFetch.fetchMatch.mockResolvedValue(tpMatch());
    teamImport.importTeam.mockResolvedValue(teamImported);
    bracketFetch.fetchBracket.mockResolvedValue(BRACKET);
    competitionUpsert.upsertCompetition.mockResolvedValue(true);
    matchImport.importMatch.mockResolvedValue(CORE);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveMatchImportService,
        TpImportResultsService,
        { provide: TpFetcherService, useValue: fetcher },
        { provide: TpMatchFetchService, useValue: matchFetch },
        { provide: TpBracketFetchService, useValue: bracketFetch },
        { provide: TpLiveTeamImportService, useValue: teamImport },
        {
          provide: TpLiveCompetitionUpsertService,
          useValue: competitionUpsert,
        },
        { provide: TpMatchImportService, useValue: matchImport },
      ],
    }).compile();
    service = moduleRef.get(TpLiveMatchImportService);
  });

  const importMatch = () =>
    service.importMatch({ matchId: MATCH_TP_ID, tournamentSlug: 's30' });

  it('imports the match, both teams, the competition, then the match data, through one session', async () => {
    await expect(importMatch()).resolves.toEqual({
      competition: one,
      homeTeam: teamImported,
      awayTeam: teamImported,
      ...CORE,
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
      session,
      matchEmbeddedPlayers: tpMatch().homeRosterPlayers,
    });
    expect(teamImport.importTeam).toHaveBeenNthCalledWith(2, {
      rosterId: AWAY_ROSTER_ID,
      era: 'Fourth era',
      session,
      matchEmbeddedPlayers: tpMatch().awayRosterPlayers,
    });
    expect(bracketFetch.fetchBracket).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      errors: [],
      session,
    });
    expect(competitionUpsert.upsertCompetition).toHaveBeenCalledWith({
      tournament: BRACKET.tournament,
      playedDates: BRACKET.playedDates,
      era: 'Fourth era',
      errors: [],
    });
    expect(matchImport.importMatch).toHaveBeenCalledWith({
      match: tpMatch(),
      bracket: BRACKET.matches,
      competitionTpId: 18442,
      externalSystemName: 'TP',
    });
  });

  it('passes an explicit era to the home team, and a given session throughout', async () => {
    const given = mock<TpFetchSession>();

    await service.importMatch({
      matchId: MATCH_TP_ID,
      tournamentSlug: 's30',
      era: 'Fourth era',
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(teamImport.importTeam).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ era: 'Fourth era', session: given }),
    );
  });

  it('reports a match fetch failure and attempts nothing else', async () => {
    matchFetch.fetchMatch.mockImplementation(({ errors }) => {
      errors.push({ item: { matchId: MATCH_TP_ID }, message: 'status 403' });
      return Promise.resolve(undefined);
    });

    const result = await importMatch();

    expect(result.match).toEqual({
      success: false,
      imported: 0,
      errors: [{ item: { matchId: MATCH_TP_ID }, message: 'status 403' }],
    });
    expect(result.homeTeam).toEqual(notAttemptedTeam);
    expect(teamImport.importTeam).not.toHaveBeenCalled();
  });

  it('refuses a match with no recorded result', async () => {
    matchFetch.fetchMatch.mockResolvedValue(tpMatch({ winner: undefined }));

    const result = await importMatch();

    expect(result.match).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: { matchId: MATCH_TP_ID },
          message: `TP match ${MATCH_TP_ID} is not completed yet (it has no recorded result); only completed matches are imported.`,
        },
      ],
    });
    expect(teamImport.importTeam).not.toHaveBeenCalled();
  });

  it('stops after a home team that was not imported', async () => {
    teamImport.importTeam.mockResolvedValue(teamNotImported);

    const result = await importMatch();

    expect(result.homeTeam).toEqual(teamNotImported);
    expect(result.awayTeam).toEqual(notAttemptedTeam);
    expect(teamImport.importTeam).toHaveBeenCalledTimes(1);
    expect(bracketFetch.fetchBracket).not.toHaveBeenCalled();
  });

  it('stops after an away team that was not imported', async () => {
    teamImport.importTeam
      .mockResolvedValueOnce(teamImported)
      .mockResolvedValueOnce(teamNotImported);

    const result = await importMatch();

    expect(result.awayTeam).toEqual(teamNotImported);
    expect(result.competition).toEqual(nothing);
    expect(bracketFetch.fetchBracket).not.toHaveBeenCalled();
  });

  it('reports a bracket fetch failure on the competition and imports no match data', async () => {
    bracketFetch.fetchBracket.mockImplementation(({ errors }) => {
      errors.push({ item: 1, message: 'status 429' });
      return Promise.resolve(undefined);
    });

    const result = await importMatch();

    expect(result.competition).toEqual({
      success: false,
      imported: 0,
      errors: [{ item: 1, message: 'status 429' }],
    });
    expect(result.match).toEqual(nothing);
    expect(competitionUpsert.upsertCompetition).not.toHaveBeenCalled();
    expect(matchImport.importMatch).not.toHaveBeenCalled();
  });

  it('reports a competition upsert failure and imports no match data', async () => {
    competitionUpsert.upsertCompetition.mockImplementation(({ errors }) => {
      errors.push({ item: 1, message: 'no group' });
      return Promise.resolve(false);
    });

    const result = await importMatch();

    expect(result.competition.success).toBe(false);
    expect(matchImport.importMatch).not.toHaveBeenCalled();
  });

  it('catches an unexpected exception instead of throwing, reporting it on the match', async () => {
    matchImport.importMatch.mockRejectedValue(new Error('db down'));

    const result = await importMatch();

    expect(result.match).toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: { matchId: MATCH_TP_ID },
          message: `Unexpected error importing match ${MATCH_TP_ID}: db down`,
        },
      ],
    });
  });
});
