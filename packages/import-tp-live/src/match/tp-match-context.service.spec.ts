import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { ExternalSystem } from '@blood-bowl-tracker/db';
import {
  CompetitionsService,
  ExternalSystemsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import {
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  COMPETITION_ID,
  COMPETITION_TP_ID,
  ERA_ID,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  MATCH_TP_ID,
  matchContext,
  TP_SYSTEM_ID,
  tpMatch,
} from './tp-match.test-helpers';
import { TpMatchContextService } from './tp-match-context.service';

const COMPETITION_ROW = {
  id: COMPETITION_ID,
  name: 'tLoEGBBL Säsong 30',
  type: 'season' as const,
  eraId: ERA_ID,
  startDate: '2026-01-10',
  endDate: '2026-06-20',
};

describe('TpMatchContextService', () => {
  let service: TpMatchContextService;
  let externalSystems: MockProxy<ExternalSystemsService>;
  let competitions: MockProxy<CompetitionsService>;
  let teams: MockProxy<TeamsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    externalSystems = mock<ExternalSystemsService>();
    competitions = mock<CompetitionsService>();
    teams = mock<TeamsService>();
    errors = [];
    externalSystems.upsert.mockResolvedValue({
      system: mock<ExternalSystem>({ id: TP_SYSTEM_ID }),
      created: false,
    });
    competitions.resolve.mockResolvedValue({ found: true, id: COMPETITION_ID });
    competitions.findById.mockResolvedValue(COMPETITION_ROW);
    teams.resolveBatch.mockResolvedValue([
      { found: true, id: 501 },
      { found: true, id: 502 },
    ]);
    teams.findTeamEraId
      .mockResolvedValueOnce(HOME_TEAM_ERA_ID)
      .mockResolvedValueOnce(AWAY_TEAM_ERA_ID);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchContextService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: ExternalSystemsService, useValue: externalSystems },
        { provide: CompetitionsService, useValue: competitions },
        { provide: TeamsService, useValue: teams },
      ],
    }).compile();
    service = moduleRef.get(TpMatchContextService);
  });

  const resolve = () =>
    service.resolve({
      match: tpMatch(),
      competitionTpId: COMPETITION_TP_ID,
      externalSystemName: 'TP',
      errors,
    });

  it('resolves the TP system, competition, era and both team eras', async () => {
    await expect(resolve()).resolves.toEqual(matchContext());
    expect(externalSystems.upsert).toHaveBeenCalledWith({
      name: 'TP',
      category: 'imported_data_source',
    });
    expect(competitions.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: String(COMPETITION_TP_ID),
    });
    expect(competitions.findById).toHaveBeenCalledWith(COMPETITION_ID);
    expect(teams.resolveBatch).toHaveBeenCalledWith([
      { externalSystemId: TP_SYSTEM_ID, externalId: String(HOME_ROSTER_ID) },
      { externalSystemId: TP_SYSTEM_ID, externalId: String(AWAY_ROSTER_ID) },
    ]);
    expect(teams.findTeamEraId).toHaveBeenNthCalledWith(1, 501, ERA_ID);
    expect(teams.findTeamEraId).toHaveBeenNthCalledWith(2, 502, ERA_ID);
    expect(errors).toEqual([]);
  });

  it('records one error and resolves nothing when the TP system cannot be set up', async () => {
    externalSystems.upsert.mockRejectedValue(new Error('db down'));

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: { externalSystems: ['TP'] }, message: 'db down' },
    ]);
    expect(competitions.resolve).not.toHaveBeenCalled();
  });

  it('records one error naming the competition when it is not imported', async () => {
    competitions.resolve.mockResolvedValue({ found: false });

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { match: MATCH_TP_ID, competition: COMPETITION_TP_ID },
        message: `Skipping match ${MATCH_TP_ID}: its competition (TP id ${COMPETITION_TP_ID}) is not imported.`,
      },
    ]);
    expect(competitions.findById).not.toHaveBeenCalled();
  });

  it('records the same error when the resolved competition row cannot be read', async () => {
    competitions.findById.mockResolvedValue(undefined);

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('is not imported');
  });

  it('records one error naming every roster whose team era is missing', async () => {
    teams.resolveBatch.mockResolvedValue([
      { found: false },
      { found: true, id: 502 },
    ]);
    teams.findTeamEraId.mockReset();
    teams.findTeamEraId.mockResolvedValue(undefined);

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { match: MATCH_TP_ID, rosters: [HOME_ROSTER_ID, AWAY_ROSTER_ID] },
        message: `Skipping match ${MATCH_TP_ID}: could not resolve the team era of roster(s) ${HOME_ROSTER_ID}, ${AWAY_ROSTER_ID} in its competition's era.`,
      },
    ]);
  });

  it('names only the roster whose team era is missing', async () => {
    teams.findTeamEraId.mockReset();
    teams.findTeamEraId
      .mockResolvedValueOnce(HOME_TEAM_ERA_ID)
      .mockResolvedValueOnce(undefined);

    await expect(resolve()).resolves.toBeUndefined();
    expect(errors[0].item).toEqual({
      match: MATCH_TP_ID,
      rosters: [AWAY_ROSTER_ID],
    });
  });
});
