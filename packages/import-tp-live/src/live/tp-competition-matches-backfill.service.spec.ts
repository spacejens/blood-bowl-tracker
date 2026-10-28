import type { ImportResult } from '@blood-bowl-tracker/api-contract';
import { ImportResultService } from '@blood-bowl-tracker/import-shared';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { bracketMatch } from '../match/tp-match.test-helpers';
import type { TpBracket } from './tp-bracket-fetch.service';
import { TpCompetitionMatchesBackfillService } from './tp-competition-matches-backfill.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import type { TpMatchDataImportResult } from './tp-match-data-import.service';
import { TpMatchDataImportService } from './tp-match-data-import.service';
import { TpMatchEventsImportedService } from './tp-match-events-imported.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const teamImported: TpLiveTeamImportResult = {
  team: one,
  players: one,
  era: 'Fourth era',
  teamEra: { id: 31, eraId: 40 },
  sppPlayers: [],
};
const IMPORTED: TpMatchDataImportResult = {
  homeTeam: teamImported,
  awayTeam: teamImported,
  match: one,
  participation: one,
  events: one,
  outcome: one,
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
    bracketMatch({ id: 3, winner: 'draw' }),
  ],
  playedDates: [new Date('2026-06-13')],
};

describe('TpCompetitionMatchesBackfillService', () => {
  let service: TpCompetitionMatchesBackfillService;
  let session: MockProxy<TpFetchSession>;
  let matchData: MockProxy<TpMatchDataImportService>;

  beforeEach(async () => {
    session = mock<TpFetchSession>();
    matchData = mock<TpMatchDataImportService>();
    matchData.importMatchData.mockResolvedValue(IMPORTED);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionMatchesBackfillService,
        ImportResultService,
        TpMatchEventsImportedService,
        { provide: TpMatchDataImportService, useValue: matchData },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionMatchesBackfillService);
  });

  const backfill = (bracket: TpBracket = BRACKET) =>
    service.backfill({
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session,
      bracket,
    });

  it("imports every completed match of the bracket, skipping those not played yet, under the competition's era and the given session", async () => {
    await expect(backfill()).resolves.toEqual({
      result: { success: true, imported: 2, errors: [] },
      sppPlayers: [],
      eventFailedPlayerIds: [],
    });
    expect(matchData.importMatchData).toHaveBeenCalledTimes(2);
    expect(matchData.importMatchData).toHaveBeenNthCalledWith(1, {
      matchId: 1,
      tournamentSlug: 's30',
      era: 'Fourth era',
      externalSystemName: EXTERNAL_SYSTEM_NAME,
      session,
      bracket: BRACKET,
    });
    expect(matchData.importMatchData).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ matchId: 3 }),
    );
  });

  it('returns the SPP facts of both teams of every backfilled match, also when another match fails', async () => {
    const withPlayers = (
      home: number,
      away: number,
    ): TpMatchDataImportResult => ({
      ...IMPORTED,
      homeTeam: {
        ...teamImported,
        sppPlayers: [{ playerId: home, reportedSppTotal: 3 }],
      },
      awayTeam: {
        ...teamImported,
        sppPlayers: [{ playerId: away, reportedSppTotal: 4 }],
      },
    });
    matchData.importMatchData
      .mockResolvedValueOnce(withPlayers(11, 12))
      .mockResolvedValueOnce(withPlayers(21, 22));
    const bracket: TpBracket = {
      ...BRACKET,
      matches: [
        bracketMatch({ id: 1 }),
        bracketMatch({ id: 3 }),
        bracketMatch({ id: 4 }),
      ],
    };
    matchData.importMatchData.mockRejectedValueOnce(new Error('db down'));

    const { sppPlayers } = await backfill(bracket);

    expect(sppPlayers).toEqual([
      { playerId: 11, reportedSppTotal: 3 },
      { playerId: 12, reportedSppTotal: 4 },
      { playerId: 21, reportedSppTotal: 3 },
      { playerId: 22, reportedSppTotal: 4 },
    ]);
  });

  it('returns, deduplicated, the players of both teams of every match whose events failed to import', async () => {
    const withPlayers = (
      homeIds: number[],
      awayIds: number[],
      events: ImportResult,
    ): TpMatchDataImportResult => ({
      ...IMPORTED,
      homeTeam: {
        ...teamImported,
        sppPlayers: homeIds.map((playerId) => ({ playerId })),
      },
      awayTeam: {
        ...teamImported,
        sppPlayers: awayIds.map((playerId) => ({ playerId })),
      },
      events,
    });
    const failedEvents: ImportResult = {
      success: false,
      imported: 0,
      errors: [{ item: 1, message: 'unknown player' }],
    };
    matchData.importMatchData
      .mockResolvedValueOnce(withPlayers([11, 12], [13], failedEvents))
      .mockResolvedValueOnce(withPlayers([21], [22], one))
      .mockResolvedValueOnce(withPlayers([11], [31], failedEvents));
    const bracket: TpBracket = {
      ...BRACKET,
      matches: [
        bracketMatch({ id: 1 }),
        bracketMatch({ id: 3 }),
        bracketMatch({ id: 4 }),
      ],
    };

    const { eventFailedPlayerIds, sppPlayers } = await backfill(bracket);

    expect(eventFailedPlayerIds).toEqual([11, 12, 13, 31]);
    expect(sppPlayers).toHaveLength(7);
  });

  describe('a match whose events were not imported', () => {
    const withTeams = (
      overrides: Partial<TpMatchDataImportResult>,
    ): TpMatchDataImportResult => ({
      ...IMPORTED,
      homeTeam: { ...teamImported, sppPlayers: [{ playerId: 11 }] },
      awayTeam: { ...teamImported, sppPlayers: [{ playerId: 12 }] },
      ...overrides,
    });
    const failed: ImportResult = {
      success: false,
      imported: 0,
      errors: [{ item: 1, message: 'broken' }],
    };

    it.each([
      [
        'a team import failed',
        {
          awayTeam: { ...teamImported, team: failed, sppPlayers: [] },
          match: failed,
          participation: nothing,
          events: nothing,
          outcome: nothing,
        },
        [11],
      ],
      [
        'participation was not linked',
        { participation: failed, events: nothing },
        [11, 12],
      ],
      [
        'participation was skipped without an error',
        { participation: nothing, events: nothing },
        [11, 12],
      ],
      ['the match row was not written', { match: nothing }, [11, 12]],
      ['the events reported errors', { events: failed }, [11, 12]],
    ] as const)(
      'has both teams players left out when %s',
      async (_name, overrides, expected) => {
        matchData.importMatchData.mockResolvedValue(
          withTeams(overrides as Partial<TpMatchDataImportResult>),
        );

        const { eventFailedPlayerIds } = await backfill({
          ...BRACKET,
          matches: [bracketMatch({ id: 1 })],
        });

        expect(eventFailedPlayerIds).toEqual(expected);
      },
    );

    it('leaves out nothing for a match whose events were imported', async () => {
      matchData.importMatchData.mockResolvedValue(withTeams({}));

      const { eventFailedPlayerIds } = await backfill({
        ...BRACKET,
        matches: [bracketMatch({ id: 1 })],
      });

      expect(eventFailedPlayerIds).toEqual([]);
    });
  });

  it('does not report players of a match whose only errors are in other stages', async () => {
    matchData.importMatchData.mockResolvedValue({
      ...IMPORTED,
      homeTeam: {
        ...teamImported,
        players: {
          success: false,
          imported: 0,
          errors: [{ item: 1, message: 'bad' }],
        },
        sppPlayers: [{ playerId: 11 }],
      },
      outcome: {
        success: false,
        imported: 0,
        errors: [{ item: 1, message: 'bad' }],
      },
    });

    const { eventFailedPlayerIds } = await backfill();

    expect(eventFailedPlayerIds).toEqual([]);
  });

  it('imports the matches one at a time, never in parallel', async () => {
    const events: string[] = [];
    matchData.importMatchData.mockImplementation(async ({ matchId }) => {
      events.push(`start ${matchId}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push(`end ${matchId}`);
      return IMPORTED;
    });

    await backfill();

    expect(events).toEqual(['start 1', 'end 1', 'start 3', 'end 3']);
  });

  it("collects every stage's errors, counting only matches whose row was written", async () => {
    matchData.importMatchData
      .mockResolvedValueOnce({
        ...IMPORTED,
        homeTeam: {
          team: {
            success: false,
            imported: 0,
            errors: [{ item: 7, message: 'no coach' }],
          },
          players: nothing,
          era: undefined,
          teamEra: undefined,
          sppPlayers: [],
        },
        match: {
          success: false,
          imported: 0,
          errors: [{ item: 1, message: 'status 403' }],
        },
        participation: nothing,
        events: nothing,
        outcome: nothing,
      })
      .mockResolvedValueOnce({
        ...IMPORTED,
        events: {
          success: false,
          imported: 3,
          errors: [{ item: 3, message: 'unknown player' }],
        },
      });

    await expect(backfill()).resolves.toEqual({
      result: {
        success: false,
        imported: 1,
        errors: [
          { item: 7, message: 'no coach' },
          { item: 1, message: 'status 403' },
          { item: 3, message: 'unknown player' },
        ],
      },
      sppPlayers: [],
      eventFailedPlayerIds: [],
    });
  });

  it('reports a match that throws and carries on with the rest', async () => {
    matchData.importMatchData
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(IMPORTED);

    await expect(backfill()).resolves.toEqual({
      result: {
        success: false,
        imported: 1,
        errors: [
          {
            item: { matchId: 1 },
            message: 'Unexpected error backfilling match 1: db down',
          },
        ],
      },
      sppPlayers: [],
      eventFailedPlayerIds: [],
    });
    expect(matchData.importMatchData).toHaveBeenCalledTimes(2);
  });

  it('stops at a TP block instead of going on to the next match', async () => {
    const blocked = new TpBlockedError(new Date('2026-09-29T12:05:00Z'));
    matchData.importMatchData.mockRejectedValueOnce(blocked);

    await expect(backfill()).rejects.toBe(blocked);
    expect(matchData.importMatchData).toHaveBeenCalledTimes(1);
  });

  it('imports nothing for a bracket with no completed match', async () => {
    await expect(
      backfill({
        ...BRACKET,
        matches: [bracketMatch({ id: 2, winner: undefined })],
      }),
    ).resolves.toEqual({
      result: nothing,
      sppPlayers: [],
      eventFailedPlayerIds: [],
    });
    expect(matchData.importMatchData).not.toHaveBeenCalled();
  });
});
