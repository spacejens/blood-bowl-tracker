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

import { upsertedCompetition } from '../competition/tp-competition.test-helpers';
import { TpCompetitionUpsertService } from '../competition/tp-competition-upsert.service';
import {
  bracketMatch,
  MATCH_TP_ID,
  tpMatch,
} from '../match/tp-match.test-helpers';
import { TpImportResultsService } from '../tp-import-results.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpCompetitionMatchesBackfillService } from './tp-competition-matches-backfill.service';
import type { TpParticipantsBackfillResult } from './tp-competition-participants-backfill.service';
import { TpCompetitionParticipantsBackfillService } from './tp-competition-participants-backfill.service';
import { TpLiveMatchImportService } from './tp-live-match-import.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import type { TpMatchTeamsImport } from './tp-match-data-import.service';
import { TpMatchDataImportService } from './tp-match-data-import.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

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
const TEAMS_READY: TpMatchTeamsImport = {
  matchFetch: nothing,
  homeTeam: teamImported,
  awayTeam: teamImported,
  ready: { match: tpMatch(), era: 'Fourth era' },
};
const BRACKET: TpBracket = {
  tournament: {
    id: 18442,
    name: 'Säsong 30',
    ruleSet: 25,
    phases: [],
    categoryIds: [22308],
  },
  matches: [bracketMatch(), bracketMatch({ id: 662797, winner: undefined })],
  playedDates: [new Date('2026-06-13')],
};
const CORE: TpMatchImportResult = {
  match: one,
  participation: one,
  events: { success: true, imported: 14, errors: [] },
  outcome: one,
};
const PARTICIPANTS_BACKFILL: TpParticipantsBackfillResult = {
  teams: [{ rosterId: 163386, ...teamImported }],
  participation: one,
  trophyAwards: nothing,
};
const MATCHES_BACKFILL: ImportResult = {
  success: true,
  imported: 1,
  errors: [],
};

describe('TpLiveMatchImportService', () => {
  let service: TpLiveMatchImportService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let bracketFetch: MockProxy<TpBracketFetchService>;
  let competitionUpsert: MockProxy<TpCompetitionUpsertService>;
  let matchData: MockProxy<TpMatchDataImportService>;
  let participantsBackfill: MockProxy<TpCompetitionParticipantsBackfillService>;
  let matchesBackfill: MockProxy<TpCompetitionMatchesBackfillService>;

  beforeEach(async () => {
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    bracketFetch = mock<TpBracketFetchService>();
    competitionUpsert = mock<TpCompetitionUpsertService>();
    matchData = mock<TpMatchDataImportService>();
    matchData.importTeams.mockResolvedValue(TEAMS_READY);
    bracketFetch.fetchBracket.mockResolvedValue(BRACKET);
    competitionUpsert.upsertCompetition.mockResolvedValue(
      upsertedCompetition(),
    );
    matchData.writeMatch.mockResolvedValue(CORE);
    participantsBackfill = mock<TpCompetitionParticipantsBackfillService>();
    matchesBackfill = mock<TpCompetitionMatchesBackfillService>();
    participantsBackfill.backfill.mockResolvedValue(PARTICIPANTS_BACKFILL);
    matchesBackfill.backfill.mockResolvedValue(MATCHES_BACKFILL);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveMatchImportService,
        TpImportResultsService,
        { provide: TpFetcherService, useValue: fetcher },
        { provide: TpBracketFetchService, useValue: bracketFetch },
        {
          provide: TpCompetitionUpsertService,
          useValue: competitionUpsert,
        },
        { provide: TpMatchDataImportService, useValue: matchData },
        {
          provide: TpCompetitionParticipantsBackfillService,
          useValue: participantsBackfill,
        },
        {
          provide: TpCompetitionMatchesBackfillService,
          useValue: matchesBackfill,
        },
      ],
    }).compile();
    service = moduleRef.get(TpLiveMatchImportService);
  });

  const importMatch = () =>
    service.importMatch({
      matchId: MATCH_TP_ID,
      tournamentSlug: 's30',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

  it("imports the match's teams, the competition, then the match, through one session", async () => {
    await expect(importMatch()).resolves.toEqual({
      competition: one,
      homeTeam: teamImported,
      awayTeam: teamImported,
      ...CORE,
    });
    expect(matchData.importTeams).toHaveBeenCalledWith({
      matchId: MATCH_TP_ID,
      tournamentSlug: 's30',
      era: undefined,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session,
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
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      errors: [],
    });
    expect(matchData.writeMatch).toHaveBeenCalledWith({
      match: tpMatch(),
      bracket: BRACKET,
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });

  it('passes an explicit era and a given session through', async () => {
    const given = mock<TpFetchSession>();

    await service.importMatch({
      matchId: MATCH_TP_ID,
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(matchData.importTeams).toHaveBeenCalledWith(
      expect.objectContaining({ era: 'Fourth era', session: given }),
    );
  });

  it("reports the match fetch on the match stage, and attempts nothing else, when the match's teams are not ready", async () => {
    const failedFetch: ImportResult = {
      success: false,
      imported: 0,
      errors: [{ item: { matchId: MATCH_TP_ID }, message: 'status 403' }],
    };
    matchData.importTeams.mockResolvedValue({
      matchFetch: failedFetch,
      homeTeam: notAttemptedTeam,
      awayTeam: notAttemptedTeam,
      ready: undefined,
    });

    await expect(importMatch()).resolves.toEqual({
      competition: nothing,
      homeTeam: notAttemptedTeam,
      awayTeam: notAttemptedTeam,
      match: failedFetch,
      participation: nothing,
      events: nothing,
      outcome: nothing,
    });
    expect(bracketFetch.fetchBracket).not.toHaveBeenCalled();
    expect(matchData.writeMatch).not.toHaveBeenCalled();
  });

  it('keeps a team that was not imported in the result, and fetches no bracket', async () => {
    matchData.importTeams.mockResolvedValue({
      matchFetch: nothing,
      homeTeam: teamImported,
      awayTeam: teamNotImported,
      ready: undefined,
    });

    const result = await importMatch();

    expect(result.homeTeam).toEqual(teamImported);
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
    expect(matchData.writeMatch).not.toHaveBeenCalled();
  });

  it('reports a competition upsert failure and imports no match data', async () => {
    competitionUpsert.upsertCompetition.mockImplementation(({ errors }) => {
      errors.push({ item: 1, message: 'no group' });
      return Promise.resolve(undefined);
    });

    const result = await importMatch();

    expect(result.competition.success).toBe(false);
    expect(matchData.writeMatch).not.toHaveBeenCalled();
  });

  it('catches an unexpected exception instead of throwing, reporting it on the match', async () => {
    matchData.writeMatch.mockRejectedValue(new Error('db down'));

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

  it('backfills nothing when the competition was already imported', async () => {
    const result = await importMatch();

    expect(participantsBackfill.backfill).not.toHaveBeenCalled();
    expect(matchesBackfill.backfill).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('participantsBackfill');
    expect(result).not.toHaveProperty('matchesBackfill');
  });

  describe('when its competition upsert created the competition', () => {
    beforeEach(() => {
      competitionUpsert.upsertCompetition.mockResolvedValue(
        upsertedCompetition({ created: true }),
      );
    });

    it("backfills the competition's registered teams, then every completed match, after importing its own match", async () => {
      await expect(importMatch()).resolves.toEqual({
        competition: one,
        homeTeam: teamImported,
        awayTeam: teamImported,
        ...CORE,
        participantsBackfill: PARTICIPANTS_BACKFILL,
        matchesBackfill: MATCHES_BACKFILL,
      });
      expect(participantsBackfill.backfill).toHaveBeenCalledWith({
        tournamentSlug: 's30',
        categoryIds: [22308],
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
        competition: upsertedCompetition({ created: true }),
      });
      expect(matchesBackfill.backfill).toHaveBeenCalledWith({
        tournamentSlug: 's30',
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
        bracket: BRACKET,
      });
      const [writeOrder] = matchData.writeMatch.mock.invocationCallOrder;
      const [participantsOrder] =
        participantsBackfill.backfill.mock.invocationCallOrder;
      const [matchesOrder] = matchesBackfill.backfill.mock.invocationCallOrder;
      expect(writeOrder).toBeLessThan(participantsOrder);
      expect(participantsOrder).toBeLessThan(matchesOrder);
    });

    it('still backfills when its own match row could not be written', async () => {
      matchData.writeMatch.mockResolvedValue({
        match: {
          success: false,
          imported: 0,
          errors: [{ item: 1, message: 'unclassifiable' }],
        },
        participation: nothing,
        events: nothing,
        outcome: nothing,
      });

      const result = await importMatch();

      expect(result.match.imported).toBe(0);
      expect(result.matchesBackfill).toEqual(MATCHES_BACKFILL);
    });
  });
});
