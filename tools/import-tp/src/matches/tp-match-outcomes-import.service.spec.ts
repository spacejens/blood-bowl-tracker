import type { ResolveMatchOutcomesResult } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MatchOutcomesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { ImportTpMatchOutcomesOptions } from './tp-match-outcomes-import.service';
import { TpMatchOutcomesImportService } from './tp-match-outcomes-import.service';

const COMPETITION_ID = 7;
const MATCH_TP_ID = 900;
const MATCH_DB_ID = 11;
const HOME_ROSTER_ID = 5001;
const AWAY_ROSTER_ID = 5002;
const HOME_TEAM_ERA_ID = 501;
const AWAY_TEAM_ERA_ID = 502;
const ERA_ID = 3;

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

/**
 * Reflects the real ImportResultService.result() shape (a pure field copy,
 * not branching logic to guard against drift) so a test can assert on the
 * returned result's errors/success directly, rather than only on the args
 * recorded via resultArgs().
 */
function useRealResult(importResults: MockProxy<ImportResultService>): void {
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));
}

function tpMatch(
  id: number,
  winner: 'home' | 'away' | 'draw' | undefined,
): TpMatch {
  return {
    id,
    playedDate: new Date('2021-05-15T18:00:00Z'),
    name: 'Round 1',
    homeTeamTpId: HOME_ROSTER_ID,
    awayTeamTpId: AWAY_ROSTER_ID,
    matchEvents: [],
    homeRosterPlayers: [],
    awayRosterPlayers: [],
    phaseType: 160,
    phaseOrder: 1,
    round: 1,
    winner,
  };
}

const DEFAULT_OUTCOME_RESULT: ResolveMatchOutcomesResult = {
  competitionId: COMPETITION_ID,
  resolvedMatchIds: [MATCH_DB_ID],
  unresolvedMatchIds: [],
};

async function makeService(options: {
  winner: 'home' | 'away' | 'draw' | undefined;
  resolveOutcomesResult?: ResolveMatchOutcomesResult;
  teamErasByRosterId?: Map<number, { id: number; eraId: number }[]>;
  eraIdByCompetitionId?: Map<number, number>;
}): Promise<{
  service: TpMatchOutcomesImportService;
  matchOutcomes: MockProxy<MatchOutcomesImportService>;
  importResults: MockProxy<ImportResultService>;
  runOptions: ImportTpMatchOutcomesOptions;
}> {
  const matchOutcomes = mock<MatchOutcomesImportService>();
  matchOutcomes.resolveOutcomes.mockResolvedValue(
    options.resolveOutcomesResult ?? DEFAULT_OUTCOME_RESULT,
  );
  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => args);
  importResults.result.mockReturnValue(CANNED_RESULT);

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpMatchOutcomesImportService,
      { provide: MatchOutcomesImportService, useValue: matchOutcomes },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();

  const runOptions: ImportTpMatchOutcomesOptions = {
    matchesByCompetitionId: new Map([
      [COMPETITION_ID, [tpMatch(MATCH_TP_ID, options.winner)]],
    ]),
    matchIdsByTpId: new Map([[MATCH_TP_ID, MATCH_DB_ID]]),
    eraIdByCompetitionId:
      options.eraIdByCompetitionId ?? new Map([[COMPETITION_ID, ERA_ID]]),
    teamErasByRosterId:
      options.teamErasByRosterId ??
      new Map([
        [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
        [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
      ]),
  };

  return {
    service: moduleRef.get(TpMatchOutcomesImportService),
    matchOutcomes,
    importResults,
    runOptions,
  };
}

describe('TpMatchOutcomesImportService', () => {
  it('sends the home team as a tie-break when TP says home won', async () => {
    const { service, matchOutcomes, runOptions } = await makeService({
      winner: 'home',
    });

    await service.importMatchOutcomes(runOptions);

    expect(matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      {
        competitionId: COMPETITION_ID,
        overrides: [],
        tieBreaks: [
          { matchId: MATCH_DB_ID, winnerTeamEraId: HOME_TEAM_ERA_ID },
        ],
      },
      expect.anything(),
    );
  });

  it('sends the away team as a tie-break when TP says away won', async () => {
    const { service, matchOutcomes, runOptions } = await makeService({
      winner: 'away',
    });

    await service.importMatchOutcomes(runOptions);

    expect(matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      {
        competitionId: COMPETITION_ID,
        overrides: [],
        tieBreaks: [
          { matchId: MATCH_DB_ID, winnerTeamEraId: AWAY_TEAM_ERA_ID },
        ],
      },
      expect.anything(),
    );
  });

  it('sends a null winner when TP says draw', async () => {
    const { service, matchOutcomes, runOptions } = await makeService({
      winner: 'draw',
    });

    await service.importMatchOutcomes(runOptions);

    expect(matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({
        tieBreaks: [{ matchId: MATCH_DB_ID, winnerTeamEraId: null }],
      }),
      expect.anything(),
    );
  });

  it('sends no tie-break when TP records no winner', async () => {
    const { service, matchOutcomes, runOptions } = await makeService({
      winner: undefined,
    });

    await service.importMatchOutcomes(runOptions);

    expect(matchOutcomes.resolveOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ tieBreaks: [] }),
      expect.anything(),
    );
  });

  it('never sends overrides: TP has no override list', async () => {
    const { service, matchOutcomes, runOptions } = await makeService({
      winner: 'home',
    });

    await service.importMatchOutcomes(runOptions);

    expect(matchOutcomes.resolveOutcomes.mock.calls[0][0].overrides).toEqual(
      [],
    );
  });

  it('skips a match whose winning roster has no team era in the competition era', async () => {
    const { service, matchOutcomes, importResults, runOptions } =
      await makeService({
        winner: 'home',
        // The home roster is only known under a different era than the
        // competition's, so it can't resolve to a team era here.
        teamErasByRosterId: new Map([
          [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID + 1 }]],
          [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
        ]),
      });
    useRealResult(importResults);

    const { result } = await service.importMatchOutcomes(runOptions);

    expect(matchOutcomes.resolveOutcomes.mock.calls[0][0].tieBreaks).toEqual(
      [],
    );
    expect(result.errors[0].message).toContain(
      'could not resolve its team era',
    );
  });

  it('skips a competition whose era is unknown', async () => {
    const { service, matchOutcomes, importResults, runOptions } =
      await makeService({
        winner: 'home',
        eraIdByCompetitionId: new Map(),
      });
    useRealResult(importResults);

    const { result } = await service.importMatchOutcomes(runOptions);

    expect(matchOutcomes.resolveOutcomes).not.toHaveBeenCalled();
    expect(result.errors[0].message).toContain('its era is unknown');
  });

  it('records an error naming the TP id for each unresolved match', async () => {
    const { service, importResults, runOptions } = await makeService({
      winner: 'home',
      resolveOutcomesResult: {
        competitionId: COMPETITION_ID,
        resolvedMatchIds: [],
        unresolvedMatchIds: [MATCH_DB_ID],
      },
    });
    useRealResult(importResults);

    const { result }: { result: ImportResult } =
      await service.importMatchOutcomes(runOptions);

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain(
      `Could not determine the outcome of match ${MATCH_TP_ID}`,
    );
  });

  it('counts every resolved match as imported', async () => {
    const { service, importResults, runOptions } = await makeService({
      winner: 'home',
    });

    await service.importMatchOutcomes(runOptions);

    expect(resultArgs(importResults).imported).toBe(
      DEFAULT_OUTCOME_RESULT.resolvedMatchIds.length,
    );
  });
});
