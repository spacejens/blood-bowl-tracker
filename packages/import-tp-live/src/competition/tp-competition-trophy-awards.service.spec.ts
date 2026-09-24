import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TrophyAward } from '@blood-bowl-tracker/db';
import {
  CompetitionGroupsService,
  TrophiesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import {
  COMPETITION_GROUP_ID,
  COMPETITION_ID,
  COMPETITION_TP_ID,
  TP_SYSTEM_ID,
  upsertedCompetition,
} from './tp-competition.test-helpers';
import { TpCompetitionTrophyAwardsService } from './tp-competition-trophy-awards.service';

const TEAM_ERAS = new Map([
  [163386, 31],
  [179769, 32],
]);
const GOLD: TpAward = { id: 1, awardType: 1, rosterId: 179769 };
const STUNTY: TpAward = {
  id: 2,
  awardType: 100,
  name: 'Best Stunty',
  rosterId: 163386,
};

describe('TpCompetitionTrophyAwardsService', () => {
  let service: TpCompetitionTrophyAwardsService;
  let competitionGroups: MockProxy<CompetitionGroupsService>;
  let trophies: MockProxy<TrophiesService>;
  let trophyAwards: MockProxy<TrophyAwardsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    competitionGroups = mock<CompetitionGroupsService>();
    trophies = mock<TrophiesService>();
    trophyAwards = mock<TrophyAwardsService>();
    errors = [];
    competitionGroups.listAllForApi.mockResolvedValue([
      {
        id: COMPETITION_GROUP_ID,
        name: 'Major Season',
        leagueId: 1,
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 99,
        name: 'Chaos Cup',
        leagueId: 1,
        createdAt: new Date('2026-01-01'),
      },
    ]);
    trophies.resolve.mockResolvedValue({ found: true, id: 900 });
    trophyAwards.upsert.mockResolvedValue({
      trophyAward: mock<TrophyAward>(),
      created: true,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionTrophyAwardsService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: CompetitionGroupsService, useValue: competitionGroups },
        { provide: TrophiesService, useValue: trophies },
        { provide: TrophyAwardsService, useValue: trophyAwards },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionTrophyAwardsService);
  });

  const importAwards = (awards: TpAward[]) =>
    service.importAwards({
      competition: upsertedCompetition(),
      awards,
      teamEraIdsByRosterId: TEAM_ERAS,
      errors,
    });

  it("records each award as a team award, resolving its trophy by the award's key in the competition's group", async () => {
    trophies.resolve
      .mockResolvedValueOnce({ found: true, id: 901 })
      .mockResolvedValueOnce({ found: true, id: 905 });

    await expect(importAwards([GOLD, STUNTY])).resolves.toBe(2);
    expect(trophies.resolve).toHaveBeenNthCalledWith(1, {
      externalSystemId: TP_SYSTEM_ID,
      externalId: '1-Major Season',
    });
    expect(trophies.resolve).toHaveBeenNthCalledWith(2, {
      externalSystemId: TP_SYSTEM_ID,
      externalId: 'Best Stunty-Major Season',
    });
    expect(trophyAwards.upsert).toHaveBeenNthCalledWith(1, {
      trophyId: 901,
      competitionId: COMPETITION_ID,
      teamEraId: 32,
      playerId: null,
    });
    expect(trophyAwards.upsert).toHaveBeenNthCalledWith(2, {
      trophyId: 905,
      competitionId: COMPETITION_ID,
      teamEraId: 31,
      playerId: null,
    });
    expect(errors).toEqual([]);
  });

  it('falls back to the numeric award type when the name is empty', async () => {
    await importAwards([{ ...GOLD, name: '' }]);

    expect(trophies.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: '1-Major Season',
    });
  });

  it('does nothing, and reads no group, for a competition with no awards yet', async () => {
    await expect(importAwards([])).resolves.toBe(0);
    expect(competitionGroups.listAllForApi).not.toHaveBeenCalled();
  });

  it('records one error and writes nothing when the group is not curated', async () => {
    competitionGroups.listAllForApi.mockResolvedValue([]);

    await expect(importAwards([GOLD, STUNTY])).resolves.toBe(0);
    expect(errors).toEqual([
      {
        item: { competition: COMPETITION_TP_ID },
        message: `Skipping trophy awards for competition ${COMPETITION_TP_ID}: its competition group ${COMPETITION_GROUP_ID} is not in the curated competition-group catalog.`,
      },
    ]);
    expect(trophyAwards.upsert).not.toHaveBeenCalled();
  });

  it('skips an award whose roster is not a linked participant, recording the rest', async () => {
    await expect(
      importAwards([{ ...GOLD, rosterId: 555 }, STUNTY]),
    ).resolves.toBe(1);
    expect(errors).toEqual([
      {
        item: { competition: COMPETITION_TP_ID, trophy: '1-Major Season' },
        message: `Skipping the "1-Major Season" award in competition ${COMPETITION_TP_ID}: roster 555 is not a linked participant of the competition.`,
      },
    ]);
  });

  it('reports an unresolvable trophy key once, summarizing its further rows', async () => {
    trophies.resolve.mockResolvedValue({ found: false });

    await expect(
      importAwards([GOLD, { ...GOLD, id: 3 }, { ...GOLD, id: 4 }]),
    ).resolves.toBe(0);
    expect(trophies.resolve).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([
      {
        item: { competition: COMPETITION_TP_ID, trophy: '1-Major Season' },
        message: `Skipping the "1-Major Season" award in competition ${COMPETITION_TP_ID}: no curated trophy has the TP external id "1-Major Season".`,
      },
      {
        item: { trophy: '1-Major Season' },
        message:
          'Skipped 2 further award row(s) referencing the "1-Major Season" trophy key: it could not be resolved (see the earlier error for this key).',
      },
    ]);
  });

  it('resolves a shared key once, recording each tied winner', async () => {
    await expect(
      importAwards([GOLD, { ...GOLD, id: 3, rosterId: 163386 }]),
    ).resolves.toBe(2);
    expect(trophies.resolve).toHaveBeenCalledTimes(1);
    expect(trophyAwards.upsert).toHaveBeenCalledTimes(2);
  });

  it('records one error for an award upsert failure and does not count it', async () => {
    trophyAwards.upsert.mockRejectedValue(new Error('scope mismatch'));

    await expect(importAwards([GOLD])).resolves.toBe(0);
    expect(errors).toEqual([
      {
        item: {
          competition: COMPETITION_TP_ID,
          trophy: '1-Major Season',
          roster: 179769,
        },
        message: `Failed to record the "1-Major Season" award in competition ${COMPETITION_TP_ID}: scope mismatch`,
      },
    ]);
  });
});
