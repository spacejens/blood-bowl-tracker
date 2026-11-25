import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderedWhere } from './fill-query.test-helpers';
import { LookupQueriesService } from './lookup-queries.service';

describe('LookupQueriesService', () => {
  let service: LookupQueriesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LookupQueriesService],
    }).compile();
    service = moduleRef.get(LookupQueriesService);
  });

  describe('ongoingCompetitions', () => {
    it('lists each team enrolled in or playing an ongoing TP competition once', async () => {
      const { db, chains } = mockDb(
        [
          { competitionId: 1, competitionName: 'Major Season 31' },
          { competitionId: 2, competitionName: 'Ogretoberfest 14' },
          { competitionId: 3, competitionName: 'Empty Cup' },
        ],
        [
          { competitionId: 1, teamId: 20 },
          { competitionId: 2, teamId: 21 },
        ],
        [
          { competitionId: 2, teamId: 20 },
          { competitionId: 2, teamId: 21 },
          { competitionId: 1, teamId: 20 },
        ],
      );

      await expect(service.ongoingCompetitions(db)).resolves.toEqual([
        { competitionId: 1, competitionName: 'Major Season 31', teamId: 20 },
        { competitionId: 2, competitionName: 'Ogretoberfest 14', teamId: 21 },
        { competitionId: 2, competitionName: 'Ogretoberfest 14', teamId: 20 },
      ]);

      const ongoing = renderedWhere(chains[0]);
      expect(ongoing.sql).toContain('"competitions"."end_date" is null');
      expect(ongoing.params).toEqual(['tourplay.net']);
      expect(renderedWhere(chains[1]).params).toEqual([1, 2, 3]);
      expect(renderedWhere(chains[2]).params).toEqual([1, 2, 3]);
    });

    it('lists nothing when no competition is ongoing', async () => {
      const { db, chains } = mockDb([]);

      await expect(service.ongoingCompetitions(db)).resolves.toEqual([]);

      expect(chains).toHaveLength(1);
    });
  });

  it("reads the candidates' teams' tourplay.net roster ids", async () => {
    const { db, chains } = mockDb([{ teamId: 20, rosterId: '24801' }]);

    await expect(service.teamRosters(db, [20])).resolves.toEqual([
      { teamId: 20, rosterId: '24801' },
    ]);

    expect(renderedWhere(chains[0]).params).toEqual(['tourplay.net', 20]);
  });

  it("reads every skill's Name-system ids with the skill's name", async () => {
    const row = { skillId: 200, skillName: 'Dodge', nameId: 'Dodge' };
    const { db, chains } = mockDb([row]);

    await expect(service.skillNames(db)).resolves.toEqual([row]);

    expect(renderedWhere(chains[0]).params).toEqual(['Name']);
  });

  it("reads every skill's tourplay.net ids", async () => {
    const { db, chains } = mockDb([{ skillId: 200, masterId: '92' }]);

    await expect(service.tpSkillIds(db)).resolves.toEqual([
      { skillId: 200, masterId: '92' },
    ]);

    expect(renderedWhere(chains[0]).params).toEqual(['tourplay.net']);
  });

  it("reads the candidate positions' tourplay.net ids", async () => {
    const { db, chains } = mockDb([{ positionId: 30, tpPositionId: '288' }]);

    await expect(service.tpPositionIds(db, [30])).resolves.toEqual([
      { positionId: 30, tpPositionId: '288' },
    ]);

    expect(renderedWhere(chains[0]).params).toEqual(['tourplay.net', 30]);
  });

  it('finds skills held with a variant by a player or a position, once each', async () => {
    const { db, chains } = mockDb(
      [{ skillId: 300 }, { skillId: 301 }],
      [{ skillId: 301 }, { skillId: 302 }],
    );

    await expect(service.attributedSkillIds(db)).resolves.toEqual([
      300, 301, 302,
    ]);

    expect(renderedWhere(chains[0]).sql).toContain(
      '"player_advancements"."attribute_value" is not null',
    );
    expect(renderedWhere(chains[1]).sql).toContain(
      '"position_rules_set_skills"."attribute_value" is not null',
    );
  });

  it('reads no rosters without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.teamRosters(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });

  it('reads no TP position ids without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.tpPositionIds(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });
});
