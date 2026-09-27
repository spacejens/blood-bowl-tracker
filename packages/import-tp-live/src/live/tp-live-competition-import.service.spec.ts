import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { TpCoreCompetitionImportResult } from '../competition/tp-competition-import.service';
import { TpCompetitionImportService } from '../competition/tp-competition-import.service';
import { bracketMatch } from '../match/tp-match.test-helpers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpAwardsFetchService } from './tp-awards-fetch.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpCompetitionMatchesBackfillService } from './tp-competition-matches-backfill.service';
import type { TpRegisteredTeamsImport } from './tp-competition-participants-backfill.service';
import { TpCompetitionParticipantsBackfillService } from './tp-competition-participants-backfill.service';
import { TpLiveCompetitionImportService } from './tp-live-competition-import.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';

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
const BRACKET: TpBracket = {
  tournament: {
    id: 18442,
    name: 'Säsong 30',
    ruleSet: 25,
    phases: [],
    categoryIds: [22308],
  },
  matches: [
    bracketMatch({ id: 1 }),
    bracketMatch({ id: 2, winner: undefined }),
  ],
  playedDates: [new Date('2026-01-10'), new Date('2026-06-20')],
};
const AWARD: TpAward = { id: 24112, awardType: 1, rosterId: 179769 };
const CORE: TpCoreCompetitionImportResult = {
  competition: one,
  participation: { success: true, imported: 2, errors: [] },
  trophyAwards: one,
  competitionCreated: false,
};
const fetchFailure: ImportError = { item: 1, message: 'status 429' };
const MATCHES_BACKFILL: ImportResult = {
  success: false,
  imported: 1,
  errors: [{ item: { matchId: 3 }, message: 'status 403' }],
};

/** Both registered teams, imported with the given results. */
function registered(
  first: TpLiveTeamImportResult,
  second: TpLiveTeamImportResult,
): TpRegisteredTeamsImport {
  return {
    rosterIds: [163386, 179769],
    teams: [
      { rosterId: 163386, ...first },
      { rosterId: 179769, ...second },
    ],
    errors: [],
  };
}

describe('TpLiveCompetitionImportService', () => {
  let service: TpLiveCompetitionImportService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let bracketFetch: MockProxy<TpBracketFetchService>;
  let awardsFetch: MockProxy<TpAwardsFetchService>;
  let participantsBackfill: MockProxy<TpCompetitionParticipantsBackfillService>;
  let competitionImport: MockProxy<TpCompetitionImportService>;
  let matchesBackfill: MockProxy<TpCompetitionMatchesBackfillService>;

  beforeEach(async () => {
    fetcher = mock<TpFetcherService>();
    session = mock<TpFetchSession>();
    fetcher.createSession.mockReturnValue(session);
    bracketFetch = mock<TpBracketFetchService>();
    awardsFetch = mock<TpAwardsFetchService>();
    participantsBackfill = mock<TpCompetitionParticipantsBackfillService>();
    competitionImport = mock<TpCompetitionImportService>();
    bracketFetch.fetchBracket.mockResolvedValue(BRACKET);
    participantsBackfill.importRegisteredTeams.mockResolvedValue(
      registered(teamImported, teamImported),
    );
    awardsFetch.fetchAwards.mockResolvedValue([AWARD]);
    competitionImport.importCompetition.mockResolvedValue(CORE);
    matchesBackfill = mock<TpCompetitionMatchesBackfillService>();
    matchesBackfill.backfill.mockResolvedValue(MATCHES_BACKFILL);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveCompetitionImportService,
        TpImportResultsService,
        { provide: TpFetcherService, useValue: fetcher },
        { provide: TpBracketFetchService, useValue: bracketFetch },
        { provide: TpAwardsFetchService, useValue: awardsFetch },
        {
          provide: TpCompetitionParticipantsBackfillService,
          useValue: participantsBackfill,
        },
        { provide: TpCompetitionImportService, useValue: competitionImport },
        {
          provide: TpCompetitionMatchesBackfillService,
          useValue: matchesBackfill,
        },
      ],
    }).compile();
    service = moduleRef.get(TpLiveCompetitionImportService);
  });

  const importCompetition = () =>
    service.importCompetition({
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });

  it('fetches the bracket, imports the registered teams, fetches the awards, then imports the competition, through one session', async () => {
    await expect(importCompetition()).resolves.toEqual({
      competition: one,
      teams: [
        { rosterId: 163386, ...teamImported },
        { rosterId: 179769, ...teamImported },
      ],
      participation: CORE.participation,
      trophyAwards: one,
      era: 'Fourth era',
    });
    expect(bracketFetch.fetchBracket).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      errors: [],
      session,
    });
    expect(participantsBackfill.importRegisteredTeams).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      categoryIds: [22308],
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session,
    });
    expect(awardsFetch.fetchAwards).toHaveBeenCalledWith({
      tournamentSlug: 's30',
      errors: [],
      session,
    });
    expect(competitionImport.importCompetition).toHaveBeenCalledWith({
      tournament: { id: 18442, name: 'Säsong 30' },
      playedDates: BRACKET.playedDates,
      era: 'Fourth era',
      participantRosterIds: [163386, 179769],
      awards: [AWARD],
      externalSystemName: EXTERNAL_SYSTEM_NAME,
    });
  });

  it('fetches through a given session', async () => {
    const given = mock<TpFetchSession>();

    await service.importCompetition({
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session: given,
    });

    expect(fetcher.createSession).not.toHaveBeenCalled();
    expect(bracketFetch.fetchBracket).toHaveBeenCalledWith(
      expect.objectContaining({ session: given }),
    );
    expect(participantsBackfill.importRegisteredTeams).toHaveBeenCalledWith(
      expect.objectContaining({ session: given }),
    );
  });

  it('reports a bracket fetch failure and attempts nothing else', async () => {
    bracketFetch.fetchBracket.mockImplementation(({ errors }) => {
      errors.push(fetchFailure);
      return Promise.resolve(undefined);
    });

    await expect(importCompetition()).resolves.toEqual({
      competition: { success: false, imported: 0, errors: [fetchFailure] },
      teams: [],
      participation: nothing,
      trophyAwards: nothing,
      era: undefined,
    });
    expect(participantsBackfill.importRegisteredTeams).not.toHaveBeenCalled();
    expect(competitionImport.importCompetition).not.toHaveBeenCalled();
  });

  it('still imports the competition when the inscriptions fetch fails, with no teams and no awards', async () => {
    participantsBackfill.importRegisteredTeams.mockResolvedValue({
      rosterIds: undefined,
      teams: [],
      errors: [fetchFailure],
    });
    competitionImport.importCompetition.mockResolvedValue({
      competition: one,
      participation: nothing,
      trophyAwards: nothing,
      competitionCreated: false,
    });

    const result = await importCompetition();

    expect(awardsFetch.fetchAwards).not.toHaveBeenCalled();
    expect(competitionImport.importCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ participantRosterIds: [], awards: [] }),
    );
    expect(result.teams).toEqual([]);
    expect(result.participation).toEqual({
      success: false,
      imported: 0,
      errors: [fetchFailure],
    });
  });

  it('still imports the competition when the awards fetch fails, with no awards', async () => {
    awardsFetch.fetchAwards.mockImplementation(({ errors }) => {
      errors.push(fetchFailure);
      return Promise.resolve(undefined);
    });
    competitionImport.importCompetition.mockResolvedValue({
      ...CORE,
      trophyAwards: nothing,
    });

    const result = await importCompetition();

    expect(competitionImport.importCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ awards: [] }),
    );
    expect(result.trophyAwards).toEqual({
      success: false,
      imported: 0,
      errors: [fetchFailure],
    });
  });

  it('keeps going when a team cannot be imported, reporting it in teams', async () => {
    participantsBackfill.importRegisteredTeams.mockResolvedValue(
      registered(teamNotImported, teamImported),
    );

    const result = await importCompetition();

    expect(result.teams).toEqual([
      { rosterId: 163386, ...teamNotImported },
      { rosterId: 179769, ...teamImported },
    ]);
    expect(competitionImport.importCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ participantRosterIds: [163386, 179769] }),
    );
  });

  it('catches an unexpected exception instead of throwing, keeping already-imported teams', async () => {
    competitionImport.importCompetition.mockRejectedValue(new Error('db down'));

    await expect(importCompetition()).resolves.toEqual({
      competition: {
        success: false,
        imported: 0,
        errors: [
          {
            item: { tournamentSlug: 's30' },
            message: 'Unexpected error importing competition s30: db down',
          },
        ],
      },
      teams: [
        { rosterId: 163386, ...teamImported },
        { rosterId: 179769, ...teamImported },
      ],
      participation: nothing,
      trophyAwards: nothing,
      era: undefined,
    });
  });

  describe('without an explicit era', () => {
    const importWithoutEra = () =>
      service.importCompetition({
        tournamentSlug: 's30',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
      });
    const noEraFailure = (message: string): ImportResult => ({
      success: false,
      imported: 0,
      errors: [{ item: { tournamentSlug: 's30' }, message }],
    });
    const NO_TEAM_ERA =
      'Could not resolve an era for competition s30: none of its registered teams was imported under an era. Pass an era explicitly.';
    const NO_REGISTERED_TEAMS =
      'Could not resolve an era for competition s30: no registered teams were found to resolve an era from. Pass an era explicitly.';

    it('imports each team without forcing an era, then imports the competition under the era they agree on', async () => {
      const result = await importWithoutEra();

      expect(participantsBackfill.importRegisteredTeams).toHaveBeenCalledWith(
        expect.objectContaining({ era: undefined }),
      );
      expect(competitionImport.importCompetition).toHaveBeenCalledWith(
        expect.objectContaining({ era: 'Fourth era' }),
      );
      expect(result.era).toBe('Fourth era');
      expect(result.competition).toEqual(one);
    });

    it('ignores a team that resolved no era when the others agree', async () => {
      participantsBackfill.importRegisteredTeams.mockResolvedValue(
        registered(teamNotImported, teamImported),
      );

      const result = await importWithoutEra();

      expect(competitionImport.importCompetition).toHaveBeenCalledWith(
        expect.objectContaining({ era: 'Fourth era' }),
      );
      expect(result.era).toBe('Fourth era');
    });

    it('fails the competition stage when the teams resolved different eras, keeping the teams', async () => {
      const fifthEraTeam = { ...teamImported, era: 'Fifth era' };
      participantsBackfill.importRegisteredTeams.mockResolvedValue(
        registered(teamImported, fifthEraTeam),
      );

      await expect(importWithoutEra()).resolves.toEqual({
        competition: noEraFailure(
          'Could not resolve an era for competition s30: its registered teams were imported under different eras (Fourth era, Fifth era). Pass an era explicitly.',
        ),
        teams: [
          { rosterId: 163386, ...teamImported },
          { rosterId: 179769, ...fifthEraTeam },
        ],
        participation: nothing,
        trophyAwards: nothing,
        era: undefined,
      });
      expect(awardsFetch.fetchAwards).not.toHaveBeenCalled();
      expect(competitionImport.importCompetition).not.toHaveBeenCalled();
    });

    it('fails the competition stage when no team resolved an era', async () => {
      participantsBackfill.importRegisteredTeams.mockResolvedValue(
        registered(teamNotImported, teamNotImported),
      );

      const result = await importWithoutEra();

      expect(result.competition).toEqual(noEraFailure(NO_TEAM_ERA));
      expect(result.teams).toHaveLength(2);
      expect(competitionImport.importCompetition).not.toHaveBeenCalled();
    });

    it('fails the competition stage when the competition has no registered teams', async () => {
      participantsBackfill.importRegisteredTeams.mockResolvedValue({
        rosterIds: [],
        teams: [],
        errors: [],
      });

      const result = await importWithoutEra();

      expect(result.competition).toEqual(noEraFailure(NO_REGISTERED_TEAMS));
      expect(result.era).toBeUndefined();
    });

    it('keeps an inscriptions fetch failure in participation when it leaves no era to resolve', async () => {
      participantsBackfill.importRegisteredTeams.mockResolvedValue({
        rosterIds: undefined,
        teams: [],
        errors: [fetchFailure],
      });

      const result = await importWithoutEra();

      expect(result.participation).toEqual({
        success: false,
        imported: 0,
        errors: [fetchFailure],
      });
      expect(result.competition).toEqual(noEraFailure(NO_REGISTERED_TEAMS));
      expect(competitionImport.importCompetition).not.toHaveBeenCalled();
    });
  });

  describe('match backfill', () => {
    const importForced = () =>
      service.importCompetition({
        tournamentSlug: 's30',
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        forceMatchBackfill: true,
      });

    it('backfills no match of a competition that was already imported', async () => {
      const result = await importCompetition();

      expect(matchesBackfill.backfill).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('matchesBackfill');
    });

    it("backfills every completed match of a newly created competition, under its era, through the import's session", async () => {
      competitionImport.importCompetition.mockResolvedValue({
        ...CORE,
        competitionCreated: true,
      });

      const result = await importCompetition();

      expect(matchesBackfill.backfill).toHaveBeenCalledWith({
        tournamentSlug: 's30',
        era: 'Fourth era',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
        session,
        bracket: BRACKET,
      });
      expect(result.matchesBackfill).toEqual(MATCHES_BACKFILL);
      expect(result.competition).toEqual(one);
    });

    it('backfills the matches of an already-imported competition when forced', async () => {
      const result = await importForced();

      expect(matchesBackfill.backfill).toHaveBeenCalledTimes(1);
      expect(result.matchesBackfill).toEqual(MATCHES_BACKFILL);
    });

    it('backfills under the era the teams agreed on when none is given', async () => {
      competitionImport.importCompetition.mockResolvedValue({
        ...CORE,
        competitionCreated: true,
      });

      await service.importCompetition({
        tournamentSlug: 's30',
        externalSystemName: EXTERNAL_SYSTEM_NAME,
      });

      expect(matchesBackfill.backfill).toHaveBeenCalledWith(
        expect.objectContaining({ era: 'Fourth era' }),
      );
    });

    it('backfills no match when the competition itself was not imported, even when forced', async () => {
      competitionImport.importCompetition.mockResolvedValue({
        competition: { success: false, imported: 0, errors: [fetchFailure] },
        participation: nothing,
        trophyAwards: nothing,
        competitionCreated: false,
      });

      const result = await importForced();

      expect(matchesBackfill.backfill).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('matchesBackfill');
    });
  });
});
