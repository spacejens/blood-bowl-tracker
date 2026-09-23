import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type {
  CompetitionWithTeamEras,
  MatchWithTeamEras,
} from '@blood-bowl-tracker/game-data';
import {
  CompetitionsService,
  MatchesService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import {
  AWAY_TEAM_ERA_ID,
  bracketMatch,
  COMPETITION_ID,
  COMPETITION_TP_ID,
  HOME_TEAM_ERA_ID,
  MATCH_DB_ID,
  MATCH_TP_ID,
  matchContext,
  TP_SYSTEM_ID,
  tpMatch,
} from './tp-match.test-helpers';
import { TpMatchCategoryService } from './tp-match-category.service';
import { TpMatchUpsertService } from './tp-match-upsert.service';

const MATCH_EXTERNAL_IDS = [
  { externalSystemId: TP_SYSTEM_ID, externalId: String(MATCH_TP_ID) },
];

describe('TpMatchUpsertService', () => {
  let service: TpMatchUpsertService;
  let classifier: MockProxy<TpMatchCategoryService>;
  let matches: MockProxy<MatchesService>;
  let competitions: MockProxy<CompetitionsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    classifier = mock<TpMatchCategoryService>();
    matches = mock<MatchesService>();
    competitions = mock<CompetitionsService>();
    errors = [];
    matches.upsert.mockResolvedValue({
      match: mock<MatchWithTeamEras>({ id: MATCH_DB_ID }),
      created: true,
    });
    competitions.upsert.mockResolvedValue({
      competition: mock<CompetitionWithTeamEras>({ id: COMPETITION_ID }),
      created: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchUpsertService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: TpMatchCategoryService, useValue: classifier },
        { provide: MatchesService, useValue: matches },
        { provide: CompetitionsService, useValue: competitions },
      ],
    }).compile();
    service = moduleRef.get(TpMatchUpsertService);
  });

  describe('upsertMatch', () => {
    const bracket = [bracketMatch(), bracketMatch({ id: 1, round: 1 })];
    const upsertMatch = () =>
      service.upsertMatch({
        match: tpMatch(),
        bracket,
        context: matchContext(),
        errors,
      });

    it('classifies the match against its bracket and upserts it under its competition', async () => {
      classifier.classify.mockReturnValue('normal');

      await expect(upsertMatch()).resolves.toBe(MATCH_DB_ID);
      expect(classifier.classify).toHaveBeenCalledWith({
        match: tpMatch(),
        competitionType: 'season',
        competitionMatches: bracket,
      });
      expect(matches.upsert).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        playedAt: tpMatch().playedDate,
        name: 'Matchday 2',
        category: 'normal',
        externalIds: MATCH_EXTERNAL_IDS,
        teamEraIds: [],
      });
      expect(errors).toEqual([]);
    });

    it('records one error and upserts nothing when the match is not part of the given bracket', async () => {
      const foreignBracket = [bracketMatch({ id: 999, round: 1 })];

      await expect(
        service.upsertMatch({
          match: tpMatch(),
          bracket: foreignBracket,
          context: matchContext(),
          errors,
        }),
      ).resolves.toBeUndefined();
      expect(errors).toEqual([
        {
          item: { match: MATCH_TP_ID },
          message: `Skipping match ${MATCH_TP_ID}: it is not part of the given bracket, so it does not belong to the imported competition.`,
        },
      ]);
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(matches.upsert).not.toHaveBeenCalled();
    });

    it('records one error and upserts nothing when the match cannot be classified', async () => {
      classifier.classify.mockImplementation(() => {
        throw new Error('unanticipated bracket shape');
      });

      await expect(upsertMatch()).resolves.toBeUndefined();
      expect(errors).toEqual([
        {
          item: { match: MATCH_TP_ID },
          message: `Skipping match ${MATCH_TP_ID}: unanticipated bracket shape`,
        },
      ]);
      expect(matches.upsert).not.toHaveBeenCalled();
    });

    it('records one error when the upsert fails', async () => {
      classifier.classify.mockReturnValue('normal');
      matches.upsert.mockRejectedValue(new Error('category mismatch'));

      await expect(upsertMatch()).resolves.toBeUndefined();
      expect(errors).toEqual([
        {
          item: { match: MATCH_TP_ID },
          message: `Failed to upsert match ${MATCH_TP_ID}: category mismatch`,
        },
      ]);
    });
  });

  describe('syncParticipation', () => {
    const teamEraIds = [HOME_TEAM_ERA_ID, AWAY_TEAM_ERA_ID];
    const sync = () =>
      service.syncParticipation({
        match: tpMatch(),
        context: matchContext(),
        errors,
      });

    it('links both team eras to the match and to its competition', async () => {
      await expect(sync()).resolves.toBe(true);
      expect(matches.upsert).toHaveBeenCalledWith({
        externalIds: MATCH_EXTERNAL_IDS,
        teamEraIds,
      });
      expect(competitions.upsert).toHaveBeenCalledWith({
        externalIds: [
          {
            externalSystemId: TP_SYSTEM_ID,
            externalId: String(COMPETITION_TP_ID),
          },
        ],
        teamEraIds,
      });
      expect(errors).toEqual([]);
    });

    it('records one error and skips the competition when linking the match fails', async () => {
      matches.upsert.mockRejectedValue(new Error('boom'));

      await expect(sync()).resolves.toBe(false);
      expect(errors).toEqual([
        {
          item: { match: MATCH_TP_ID, teamEraIds },
          message: `Failed to link the teams of match ${MATCH_TP_ID}: boom`,
        },
      ]);
      expect(competitions.upsert).not.toHaveBeenCalled();
    });

    it('records one error when adding the teams to the competition fails', async () => {
      competitions.upsert.mockRejectedValue(new Error('boom'));

      await expect(sync()).resolves.toBe(false);
      expect(errors).toEqual([
        {
          item: { competition: COMPETITION_TP_ID, teamEraIds },
          message: `Failed to add the teams of match ${MATCH_TP_ID} to competition ${COMPETITION_TP_ID}: boom`,
        },
      ]);
    });
  });
});
