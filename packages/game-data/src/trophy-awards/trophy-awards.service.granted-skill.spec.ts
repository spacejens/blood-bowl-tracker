import { DB, trophyAwards } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerSkillsService } from '../player-skills/player-skills.service';
import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { UnspentSppDecisionService } from '../spp/unspent-spp-decision.service';
import {
  TrophyAwardGrantedSkillError,
  TrophyAwardsService,
} from './trophy-awards.service';
import { uniqueViolation } from './trophy-awards.test-helpers';

const playerTrophyRow = [
  { recipientKind: 'player', competitionGroupId: 1, leagueId: null },
];
const teamTrophyRow = [
  { recipientKind: 'team', competitionGroupId: 1, leagueId: null },
];
const matchingCompetitionRow = [{ competitionGroupId: 1 }];
const playerRow = [{ teamEraId: 3 }];
const skillRow = [{ id: 11 }];
const awardWithoutSkill = {
  id: 10,
  trophyId: 1,
  competitionId: 2,
  teamEraId: 3,
  playerId: 4,
  grantedSkillId: null,
  createdAt: new Date('2026-01-01'),
};
const awardWithSkill = { ...awardWithoutSkill, grantedSkillId: 11 };
const playerAward = { trophyId: 1, competitionId: 2, playerId: 4 };

/**
 * Query slots, in `upsert`'s order: trophy, competition, player, skill (only
 * for a numeric `grantedSkillId`), insert, natural-key select (only after a
 * unique violation), update (only when the overlay changes the stored value).
 */
async function build(...rowsPerQuery: (unknown[] | Error)[]): Promise<{
  service: TrophyAwardsService;
  db: MockDbResult;
  unspent: MockProxy<UnspentSppDecisionService>;
  playerSkills: MockProxy<PlayerSkillsService>;
}> {
  const db = mockDb(...rowsPerQuery);
  const unspent = mock<UnspentSppDecisionService>();
  const playerSkills = mock<PlayerSkillsService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      TrophyAwardsService,
      { provide: DB, useValue: db.db },
      { provide: UnspentSppDecisionService, useValue: unspent },
      { provide: PlayerSkillsService, useValue: playerSkills },
    ],
  }).compile();
  return {
    service: moduleRef.get(TrophyAwardsService),
    db,
    unspent,
    playerSkills,
  };
}

describe('TrophyAwardsService.upsert granted skill', () => {
  it('stores the granted skill on a newly inserted award', async () => {
    const { service, db } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      [awardWithSkill],
    );

    await expect(
      service.upsert({ ...playerAward, grantedSkillId: 11 }),
    ).resolves.toEqual({ trophyAward: awardWithSkill, created: true });
    expect(extractFilterValues(firstCallArg(db.chains[3].where))).toBe(11);
    expect(db.chains[4].values).toHaveBeenCalledWith({
      trophyId: 1,
      competitionId: 2,
      teamEraId: 3,
      playerId: 4,
      grantedSkillId: 11,
    });
  });

  it('re-prices the winner after inserting an award that grants a skill', async () => {
    const { service, unspent } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      [awardWithSkill],
    );
    await service.upsert({ ...playerAward, grantedSkillId: 11 });
    expect(unspent.refreshFixedThreshold).toHaveBeenCalledWith([4]);
  });

  it("marks the winner's granted skill free before re-pricing a new award", async () => {
    const { service, unspent, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      [awardWithSkill],
    );

    await service.upsert({ ...playerAward, grantedSkillId: 11 });

    expect(playerSkills.markTrophyGranted).toHaveBeenCalledWith(4, 11);
    expect(
      playerSkills.markTrophyGranted.mock.invocationCallOrder[0],
    ).toBeLessThan(unspent.refreshFixedThreshold.mock.invocationCallOrder[0]);
  });

  it('marks the granted skill when it is overlaid onto a recorded award', async () => {
    const { service, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      uniqueViolation(),
      [awardWithoutSkill],
      [awardWithSkill],
    );

    await service.upsert({ ...playerAward, grantedSkillId: 11 });

    expect(playerSkills.markTrophyGranted).toHaveBeenCalledWith(4, 11);
  });

  it('marks the stored granted skill again when the upsert omits it', async () => {
    const { service, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      uniqueViolation(),
      [awardWithSkill],
    );

    await service.upsert(playerAward);

    expect(playerSkills.markTrophyGranted).toHaveBeenCalledWith(4, 11);
  });

  it('unmarks the old skill, then marks the new one, then re-prices when the skill changes', async () => {
    const { service, unspent, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      uniqueViolation(),
      [{ ...awardWithSkill, grantedSkillId: 12 }],
      [awardWithSkill],
    );

    await service.upsert({ ...playerAward, grantedSkillId: 11 });

    expect(playerSkills.unmarkTrophyGranted).toHaveBeenCalledWith(4, 12);
    expect(playerSkills.markTrophyGranted).toHaveBeenCalledWith(4, 11);
    const [unmark] = playerSkills.unmarkTrophyGranted.mock.invocationCallOrder;
    const [mark] = playerSkills.markTrophyGranted.mock.invocationCallOrder;
    const [reprice] = unspent.refreshFixedThreshold.mock.invocationCallOrder;
    expect(unmark).toBeLessThan(mark);
    expect(mark).toBeLessThan(reprice);
  });

  it('unmarks the old skill, marks nothing, then re-prices when the skill is cleared', async () => {
    const { service, unspent, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      uniqueViolation(),
      [awardWithSkill],
      [awardWithoutSkill],
    );

    await service.upsert({ ...playerAward, grantedSkillId: null });

    expect(playerSkills.unmarkTrophyGranted).toHaveBeenCalledWith(4, 11);
    expect(playerSkills.markTrophyGranted).not.toHaveBeenCalled();
    expect(
      playerSkills.unmarkTrophyGranted.mock.invocationCallOrder[0],
    ).toBeLessThan(unspent.refreshFixedThreshold.mock.invocationCallOrder[0]);
  });

  it('unmarks nothing when the award had no skill before', async () => {
    const { service, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      uniqueViolation(),
      [awardWithoutSkill],
      [awardWithSkill],
    );

    await service.upsert({ ...playerAward, grantedSkillId: 11 });

    expect(playerSkills.unmarkTrophyGranted).not.toHaveBeenCalled();
  });

  it('unmarks nothing when the stored skill is left alone', async () => {
    const { service, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      uniqueViolation(),
      [awardWithSkill],
    );

    await service.upsert(playerAward);

    expect(playerSkills.unmarkTrophyGranted).not.toHaveBeenCalled();
  });

  it('marks nothing for a new award without a granted skill', async () => {
    const { service, playerSkills } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      [awardWithoutSkill],
    );

    await service.upsert(playerAward);

    expect(playerSkills.markTrophyGranted).not.toHaveBeenCalled();
  });

  it('does not re-price after inserting an award without a skill', async () => {
    const { service, unspent } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      [awardWithoutSkill],
    );
    await service.upsert(playerAward);
    expect(unspent.refreshFixedThreshold).not.toHaveBeenCalled();
  });

  it('overlays the granted skill onto an award an importer already recorded', async () => {
    const { service, db, unspent } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      uniqueViolation(),
      [awardWithoutSkill],
      [awardWithSkill],
    );

    await expect(
      service.upsert({ ...playerAward, grantedSkillId: 11 }),
    ).resolves.toEqual({ trophyAward: awardWithSkill, created: false });
    expect(db.db.update).toHaveBeenCalledWith(trophyAwards);
    expect(db.chains[6].set).toHaveBeenCalledWith({ grantedSkillId: 11 });
    expect(extractFilterValues(firstCallArg(db.chains[6].where))).toBe(10);
    expect(unspent.refreshFixedThreshold).toHaveBeenCalledWith([4]);
  });

  it('leaves a stored granted skill alone when the upsert omits it', async () => {
    const { service, db, unspent } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      uniqueViolation(),
      [awardWithSkill],
    );

    await expect(service.upsert(playerAward)).resolves.toEqual({
      trophyAward: awardWithSkill,
      created: false,
    });
    // No skill lookup and no update: trophy, competition, player, insert, select.
    expect(db.chains).toHaveLength(5);
    // The stored skill is still re-priced, so a refresh that failed after the
    // original insert is repaired by the retry.
    expect(unspent.refreshFixedThreshold).toHaveBeenCalledWith([4]);
  });

  it('does not re-price a recorded player award that has no granted skill', async () => {
    const { service, unspent } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      uniqueViolation(),
      [awardWithoutSkill],
    );

    await service.upsert(playerAward);

    expect(unspent.refreshFixedThreshold).not.toHaveBeenCalled();
  });

  it('does not re-price a recorded team award', async () => {
    const { service, unspent } = await build(
      teamTrophyRow,
      matchingCompetitionRow,
      uniqueViolation(),
      [{ ...awardWithSkill, playerId: null }],
    );

    await service.upsert({
      trophyId: 1,
      competitionId: 2,
      teamEraId: 3,
      playerId: null,
    });

    expect(unspent.refreshFixedThreshold).not.toHaveBeenCalled();
  });

  it('issues no update when the stored granted skill already matches', async () => {
    const { service, db, unspent } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      skillRow,
      uniqueViolation(),
      [awardWithSkill],
    );

    await expect(
      service.upsert({ ...playerAward, grantedSkillId: 11 }),
    ).resolves.toEqual({ trophyAward: awardWithSkill, created: false });
    expect(db.chains).toHaveLength(6);
    // Unchanged skill: no update, but the stored value is still re-priced.
    expect(unspent.refreshFixedThreshold).toHaveBeenCalledWith([4]);
  });

  it('clears a stored granted skill when the upsert sends null', async () => {
    const { service, db, unspent } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      uniqueViolation(),
      [awardWithSkill],
      [awardWithoutSkill],
    );

    await expect(
      service.upsert({ ...playerAward, grantedSkillId: null }),
    ).resolves.toEqual({ trophyAward: awardWithoutSkill, created: false });
    // null needs no skill lookup, so the update is the sixth query.
    expect(db.chains[5].set).toHaveBeenCalledWith({ grantedSkillId: null });
    expect(unspent.refreshFixedThreshold).toHaveBeenCalledWith([4]);
  });

  it('rejects a granted skill on a team award', async () => {
    const { service, db } = await build(teamTrophyRow, matchingCompetitionRow);

    await expect(
      service.upsert({
        trophyId: 1,
        competitionId: 2,
        teamEraId: 3,
        playerId: null,
        grantedSkillId: 11,
      }),
    ).rejects.toBeInstanceOf(TrophyAwardGrantedSkillError);
    expect(db.db.insert).not.toHaveBeenCalled();
  });

  it('rejects a granted skill that does not exist', async () => {
    const { service, db } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      playerRow,
      [],
    );

    await expect(
      service.upsert({ ...playerAward, grantedSkillId: 404 }),
    ).rejects.toBeInstanceOf(TrophyAwardGrantedSkillError);
    expect(db.db.insert).not.toHaveBeenCalled();
  });
});
