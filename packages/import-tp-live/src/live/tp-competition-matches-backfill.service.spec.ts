import type { ImportResult } from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { bracketMatch } from '../match/tp-match.test-helpers';
import { TpImportResultsService } from '../tp-import-results.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import { TpCompetitionMatchesBackfillService } from './tp-competition-matches-backfill.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import type { TpMatchDataImportResult } from './tp-match-data-import.service';
import { TpMatchDataImportService } from './tp-match-data-import.service';

const EXTERNAL_SYSTEM_NAME = 'some-external-system';

const nothing: ImportResult = { success: true, imported: 0, errors: [] };
const one: ImportResult = { success: true, imported: 1, errors: [] };
const teamImported: TpLiveTeamImportResult = {
  team: one,
  players: one,
  era: 'Fourth era',
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
        TpImportResultsService,
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
      success: true,
      imported: 2,
      errors: [],
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
      success: false,
      imported: 1,
      errors: [
        { item: 7, message: 'no coach' },
        { item: 1, message: 'status 403' },
        { item: 3, message: 'unknown player' },
      ],
    });
  });

  it('reports a match that throws and carries on with the rest', async () => {
    matchData.importMatchData
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(IMPORTED);

    await expect(backfill()).resolves.toEqual({
      success: false,
      imported: 1,
      errors: [
        {
          item: { matchId: 1 },
          message: 'Unexpected error backfilling match 1: db down',
        },
      ],
    });
    expect(matchData.importMatchData).toHaveBeenCalledTimes(2);
  });

  it('imports nothing for a bracket with no completed match', async () => {
    await expect(
      backfill({
        ...BRACKET,
        matches: [bracketMatch({ id: 2, winner: undefined })],
      }),
    ).resolves.toEqual(nothing);
    expect(matchData.importMatchData).not.toHaveBeenCalled();
  });
});
