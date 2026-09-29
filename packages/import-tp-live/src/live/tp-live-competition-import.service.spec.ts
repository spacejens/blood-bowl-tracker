import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import {
  TpBlockedError,
  TpFetcherService,
} from '@blood-bowl-tracker/scrape-tp';
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
import { TpExtraTrophyAwardsService } from './tp-extra-trophy-awards.service';
import { TpLiveCompetitionImportService } from './tp-live-competition-import.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const EXTRAS: ImportResult = { success: true, imported: 2, errors: [] };
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
  competitionId: 12,
};
const fetchFailure: ImportError = { item: 1, message: 'status 429' };
const CLEAN_MATCHES_BACKFILL: ImportResult = {
  success: true,
  imported: 2,
  errors: [],
};
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

const SKIPPED = {
  success: false,
  imported: 0,
  errors: [
    {
      item: { tournamentSlug: 's30' },
      message: 'skipped by the extras service',
    },
  ],
};

describe('TpLiveCompetitionImportService', () => {
  let service: TpLiveCompetitionImportService;
  let fetcher: MockProxy<TpFetcherService>;
  let session: MockProxy<TpFetchSession>;
  let bracketFetch: MockProxy<TpBracketFetchService>;
  let awardsFetch: MockProxy<TpAwardsFetchService>;
  let participantsBackfill: MockProxy<TpCompetitionParticipantsBackfillService>;
  let competitionImport: MockProxy<TpCompetitionImportService>;
  let matchesBackfill: MockProxy<TpCompetitionMatchesBackfillService>;
  let extraTrophyAwards: MockProxy<TpExtraTrophyAwardsService>;

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
    extraTrophyAwards = mock<TpExtraTrophyAwardsService>();
    extraTrophyAwards.computeExtras.mockResolvedValue(EXTRAS);
    extraTrophyAwards.skippedForBackfillErrors.mockReturnValue(SKIPPED);
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
        { provide: TpExtraTrophyAwardsService, useValue: extraTrophyAwards },
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
      extraTrophyAwards: EXTRAS,
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
      extraTrophyAwards: nothing,
      era: undefined,
    });
    expect(participantsBackfill.importRegisteredTeams).not.toHaveBeenCalled();
    expect(competitionImport.importCompetition).not.toHaveBeenCalled();
  });

  it('still imports the competition when the inscriptions fetch fails, with no teams and unknown awards', async () => {
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
      competitionId: 12,
    });

    const result = await importCompetition();

    expect(awardsFetch.fetchAwards).not.toHaveBeenCalled();
    expect(competitionImport.importCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ participantRosterIds: [] }),
    );
    expect(
      competitionImport.importCompetition.mock.calls[0]?.[0].awards,
    ).toBeUndefined();
    expect(result.teams).toEqual([]);
    expect(result.participation).toEqual({
      success: false,
      imported: 0,
      errors: [fetchFailure],
    });
  });

  it('still imports the competition when the awards fetch fails, with unknown awards', async () => {
    awardsFetch.fetchAwards.mockImplementation(({ errors }) => {
      errors.push(fetchFailure);
      return Promise.resolve(undefined);
    });
    competitionImport.importCompetition.mockResolvedValue({
      ...CORE,
      trophyAwards: nothing,
    });

    const result = await importCompetition();

    expect(
      competitionImport.importCompetition.mock.calls[0]?.[0].awards,
    ).toBeUndefined();
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
      extraTrophyAwards: nothing,
      era: undefined,
    });
  });

  it('stops at a TP block on the bracket instead of reporting it', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    bracketFetch.fetchBracket.mockRejectedValue(blocked);

    await expect(importCompetition()).rejects.toBe(blocked);
    expect(participantsBackfill.importRegisteredTeams).not.toHaveBeenCalled();
  });

  it('stops at a TP block while importing registered teams, importing no competition', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    participantsBackfill.importRegisteredTeams.mockRejectedValue(blocked);

    await expect(importCompetition()).rejects.toBe(blocked);
    expect(competitionImport.importCompetition).not.toHaveBeenCalled();
  });

  describe('extra trophy awards', () => {
    it('computes the extra trophy awards of a finished competition', async () => {
      const result = await importCompetition();

      expect(extraTrophyAwards.computeExtras).toHaveBeenCalledWith({
        competitionId: 12,
        tournamentSlug: 's30',
      });
      expect(result.extraTrophyAwards).toEqual(EXTRAS);
    });

    it('computes nothing for a competition with no awards yet', async () => {
      awardsFetch.fetchAwards.mockResolvedValue([]);

      const result = await importCompetition();

      expect(extraTrophyAwards.computeExtras).not.toHaveBeenCalled();
      expect(result.extraTrophyAwards).toEqual(nothing);
    });

    it('computes nothing when the awards fetch failed', async () => {
      awardsFetch.fetchAwards.mockResolvedValue(undefined);

      const result = await importCompetition();

      expect(extraTrophyAwards.computeExtras).not.toHaveBeenCalled();
      expect(result.extraTrophyAwards).toEqual(nothing);
    });

    it('computes nothing when the competition itself was not imported', async () => {
      competitionImport.importCompetition.mockResolvedValue({
        competition: { success: false, imported: 0, errors: [fetchFailure] },
        participation: nothing,
        trophyAwards: nothing,
        competitionCreated: false,
        competitionId: undefined,
      });

      await importCompetition();

      expect(extraTrophyAwards.computeExtras).not.toHaveBeenCalled();
    });

    it('computes the extras after backfilling the matches', async () => {
      matchesBackfill.backfill.mockResolvedValue(CLEAN_MATCHES_BACKFILL);
      competitionImport.importCompetition.mockResolvedValue({
        ...CORE,
        competitionCreated: true,
      });

      await importCompetition();

      const [backfillOrder] = matchesBackfill.backfill.mock.invocationCallOrder;
      const [extrasOrder] =
        extraTrophyAwards.computeExtras.mock.invocationCallOrder;
      expect(backfillOrder).toBeLessThan(extrasOrder);
    });

    it('keeps an extras failure in its own stage', async () => {
      const failed: ImportResult = {
        success: false,
        imported: 0,
        errors: [{ item: 1, message: 'database down' }],
      };
      extraTrophyAwards.computeExtras.mockResolvedValue(failed);

      const result = await importCompetition();

      expect(result.extraTrophyAwards).toEqual(failed);
      expect(result.trophyAwards).toEqual(one);
      expect(result.competition).toEqual(one);
      expect(result.participation).toEqual(CORE.participation);
      expect(result.era).toBe('Fourth era');
    });

    it('computes nothing, recording one error, when the match backfill of this import reported errors', async () => {
      competitionImport.importCompetition.mockResolvedValue({
        ...CORE,
        competitionCreated: true,
      });

      const result = await importCompetition();

      expect(extraTrophyAwards.computeExtras).not.toHaveBeenCalled();
      expect(extraTrophyAwards.skippedForBackfillErrors).toHaveBeenCalledWith(
        's30',
      );
      expect(result.extraTrophyAwards).toEqual(SKIPPED);
      expect(result.matchesBackfill).toEqual(MATCHES_BACKFILL);
      expect(result.competition).toEqual(one);
    });

    it('computes the extras when the match backfill of this import was clean', async () => {
      matchesBackfill.backfill.mockResolvedValue(CLEAN_MATCHES_BACKFILL);
      competitionImport.importCompetition.mockResolvedValue({
        ...CORE,
        competitionCreated: true,
      });

      const result = await importCompetition();

      expect(extraTrophyAwards.computeExtras).toHaveBeenCalledTimes(1);
      expect(result.extraTrophyAwards).toEqual(EXTRAS);
    });

    it('computes the extras when no match backfill ran', async () => {
      const result = await importCompetition();

      expect(matchesBackfill.backfill).not.toHaveBeenCalled();
      expect(result.extraTrophyAwards).toEqual(EXTRAS);
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
        extraTrophyAwards: nothing,
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
        competitionId: undefined,
      });

      const result = await importForced();

      expect(matchesBackfill.backfill).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('matchesBackfill');
    });
  });
});
