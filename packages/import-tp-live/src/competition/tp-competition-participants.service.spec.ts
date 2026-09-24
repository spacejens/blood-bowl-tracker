import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { CompetitionWithTeamEras } from '@blood-bowl-tracker/game-data';
import {
  CompetitionsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import {
  COMPETITION_TP_ID,
  ERA_ID,
  TP_SYSTEM_ID,
  upsertedCompetition,
} from './tp-competition.test-helpers';
import { TpCompetitionParticipantsService } from './tp-competition-participants.service';

const skipped = (rosterId: number): ImportError => ({
  item: { competition: COMPETITION_TP_ID, roster: rosterId },
  message: `Skipping roster ${rosterId} in competition ${COMPETITION_TP_ID}: its team is not imported, or has no team era in the competition's era.`,
});

describe('TpCompetitionParticipantsService', () => {
  let service: TpCompetitionParticipantsService;
  let teams: MockProxy<TeamsService>;
  let competitions: MockProxy<CompetitionsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    teams = mock<TeamsService>();
    competitions = mock<CompetitionsService>();
    errors = [];
    competitions.upsert.mockResolvedValue({
      competition: mock<CompetitionWithTeamEras>(),
      created: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionParticipantsService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: TeamsService, useValue: teams },
        { provide: CompetitionsService, useValue: competitions },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionParticipantsService);
  });

  const link = (participantRosterIds: number[]) =>
    service.linkParticipants({
      competition: upsertedCompetition(),
      participantRosterIds,
      errors,
    });

  it("links every registered roster's team era to the competition", async () => {
    teams.resolveBatch.mockResolvedValue([
      { found: true, id: 501 },
      { found: true, id: 502 },
    ]);
    teams.findTeamEraId.mockResolvedValueOnce(31).mockResolvedValueOnce(32);

    await expect(link([163386, 179769])).resolves.toEqual(
      new Map([
        [163386, 31],
        [179769, 32],
      ]),
    );
    expect(teams.resolveBatch).toHaveBeenCalledWith([
      { externalSystemId: TP_SYSTEM_ID, externalId: '163386' },
      { externalSystemId: TP_SYSTEM_ID, externalId: '179769' },
    ]);
    expect(teams.findTeamEraId).toHaveBeenNthCalledWith(1, 501, ERA_ID);
    expect(teams.findTeamEraId).toHaveBeenNthCalledWith(2, 502, ERA_ID);
    expect(competitions.upsert).toHaveBeenCalledWith({
      externalIds: [
        {
          externalSystemId: TP_SYSTEM_ID,
          externalId: String(COMPETITION_TP_ID),
        },
      ],
      teamEraIds: [31, 32],
    });
    expect(errors).toEqual([]);
  });

  it('asks about each roster once, even when it is listed twice', async () => {
    teams.resolveBatch.mockResolvedValue([{ found: true, id: 501 }]);
    teams.findTeamEraId.mockResolvedValue(31);

    await expect(link([163386, 163386])).resolves.toEqual(
      new Map([[163386, 31]]),
    );
    expect(teams.resolveBatch).toHaveBeenCalledWith([
      { externalSystemId: TP_SYSTEM_ID, externalId: '163386' },
    ]);
  });

  it('skips a roster whose team is not imported or has no team era in the era, linking the rest', async () => {
    teams.resolveBatch.mockResolvedValue([
      { found: false },
      { found: true, id: 502 },
      { found: true, id: 503 },
    ]);
    teams.findTeamEraId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(33);

    await expect(link([1, 2, 3])).resolves.toEqual(new Map([[3, 33]]));
    expect(errors).toEqual([skipped(1), skipped(2)]);
    expect(competitions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ teamEraIds: [33] }),
    );
  });

  it('links nothing and asks nothing for a competition with no registered teams', async () => {
    await expect(link([])).resolves.toEqual(new Map());
    expect(teams.resolveBatch).not.toHaveBeenCalled();
    expect(competitions.upsert).not.toHaveBeenCalled();
  });

  it('writes no link when no roster resolves', async () => {
    teams.resolveBatch.mockResolvedValue([{ found: false }]);

    await expect(link([1])).resolves.toEqual(new Map());
    expect(errors).toEqual([skipped(1)]);
    expect(competitions.upsert).not.toHaveBeenCalled();
  });

  it('records one error and resolves undefined when the link fails', async () => {
    teams.resolveBatch.mockResolvedValue([{ found: true, id: 501 }]);
    teams.findTeamEraId.mockResolvedValue(31);
    competitions.upsert.mockRejectedValue(new Error('db down'));

    await expect(link([163386])).resolves.toBeUndefined();
    expect(errors).toEqual([
      {
        item: { competition: COMPETITION_TP_ID, teamEraIds: [31] },
        message: `Failed to add the registered teams to competition ${COMPETITION_TP_ID}: db down`,
      },
    ]);
  });
});
