import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { MatchOutcomesService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import {
  AWAY_TEAM_ERA_ID,
  COMPETITION_ID,
  HOME_TEAM_ERA_ID,
  MATCH_DB_ID,
  MATCH_TP_ID,
  matchContext,
  tpMatch,
} from './tp-match.test-helpers';
import { TpMatchOutcomeService } from './tp-match-outcome.service';

describe('TpMatchOutcomeService', () => {
  let service: TpMatchOutcomeService;
  let outcomes: MockProxy<MatchOutcomesService>;
  let errors: ImportError[];

  beforeEach(async () => {
    outcomes = mock<MatchOutcomesService>();
    errors = [];
    outcomes.resolveForCompetition.mockResolvedValue({
      competitionId: COMPETITION_ID,
      resolvedMatchIds: [MATCH_DB_ID, 901],
      unresolvedMatchIds: [902],
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchOutcomeService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: MatchOutcomesService, useValue: outcomes },
      ],
    }).compile();
    service = moduleRef.get(TpMatchOutcomeService);
  });

  const resolve = (winner: 'home' | 'away' | 'draw' | undefined) =>
    service.resolveOutcome({
      match: tpMatch({ winner }),
      matchId: MATCH_DB_ID,
      context: matchContext(),
      errors,
    });

  it.each([
    ['home', HOME_TEAM_ERA_ID],
    ['away', AWAY_TEAM_ERA_ID],
    ['draw', null],
  ] as const)(
    "sends TP's %s winner as this match's only tie-break",
    async (winner, winnerTeamEraId) => {
      await expect(resolve(winner)).resolves.toBe(true);
      expect(outcomes.resolveForCompetition).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        overrides: [],
        tieBreaks: [{ matchId: MATCH_DB_ID, winnerTeamEraId }],
      });
    },
  );

  it('sends no tie-break when TP records no winner', async () => {
    await resolve(undefined);
    expect(outcomes.resolveForCompetition).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      overrides: [],
      tieBreaks: [],
    });
  });

  it("ignores other matches' unresolved outcomes", async () => {
    await expect(resolve('home')).resolves.toBe(true);
    expect(errors).toEqual([]);
  });

  it('records one error when this match stays unresolved', async () => {
    outcomes.resolveForCompetition.mockResolvedValue({
      competitionId: COMPETITION_ID,
      resolvedMatchIds: [],
      unresolvedMatchIds: [MATCH_DB_ID],
    });

    await expect(resolve(undefined)).resolves.toBe(false);
    expect(errors).toEqual([
      {
        item: { match: MATCH_TP_ID },
        message:
          `Could not determine the outcome of match ${MATCH_TP_ID}: its ` +
          'outcome could not be resolved automatically — neither its ' +
          "score, TP's own recorded winner, nor the bracket settle it.",
      },
    ]);
  });

  it('records one error when resolving fails', async () => {
    outcomes.resolveForCompetition.mockRejectedValue(new Error('db down'));

    await expect(resolve('home')).resolves.toBe(false);
    expect(errors).toEqual([
      {
        item: { match: MATCH_TP_ID },
        message: `Failed to resolve the outcome of match ${MATCH_TP_ID}: db down`,
      },
    ]);
  });
});
