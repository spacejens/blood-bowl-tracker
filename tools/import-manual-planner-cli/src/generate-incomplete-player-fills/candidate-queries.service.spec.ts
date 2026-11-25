import { playerExternalIds, players } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CandidateQueriesService } from './candidate-queries.service';
import { renderedWhere, renderSql } from './fill-query.test-helpers';
import type { CandidateScopeRow } from './fill-query.types';

const CANDIDATE: CandidateScopeRow = {
  playerId: 1,
  tpId: '500',
  teamId: 20,
  teamEraId: 21,
  positionId: 30,
  eraId: 4,
  sppTotal: 5,
  unspentSpp: null,
  status: null,
  isJourneyman: false,
  move: 0,
  strength: 0,
  agility: 0,
  passing: null,
  armour: 0,
};

/** The field map a mocked `db.<method>(...)` call got. */
const fieldsOf = (method: unknown, argIndex: number): Record<string, unknown> =>
  (method as { mock: { calls: unknown[][] } }).mock.calls[0][
    argIndex
  ] as Record<string, unknown>;

describe('CandidateQueriesService', () => {
  let service: CandidateQueriesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CandidateQueriesService],
    }).compile();
    service = moduleRef.get(CandidateQueriesService);
  });

  describe('candidates', () => {
    it('reads incomplete non-star TP players, one row each, named by the first TP id', async () => {
      const { db, chains } = mockDb([CANDIDATE]);

      await expect(service.candidates(db)).resolves.toEqual([CANDIDATE]);

      expect(db.selectDistinctOn).toHaveBeenCalledWith(
        [players.id],
        expect.anything(),
      );
      const where = renderedWhere(chains[0]);
      expect(where.sql).toContain('"external_systems"."name" = $');
      expect(where.sql).toContain('"positions"."is_star_player" = $');
      expect(where.sql).toContain('"players"."spp_total" is null');
      expect(where.params).toEqual(
        expect.arrayContaining(['tourplay.net', false, 0]),
      );
      expect(chains[0].orderBy).toHaveBeenCalledWith(
        players.id,
        playerExternalIds.externalId,
      );
    });
  });

  describe('teamPlayers', () => {
    it("reads every non-star TP player of the candidates' teams, flagged incomplete by the candidates' conditions", async () => {
      const teamPlayer = {
        playerId: 1,
        teamId: 20,
        eraId: 4,
        positionId: 30,
        playerName: 'Flame',
        positionName: 'Gnoblar Lineman',
        sppTotal: 20,
        unspentSpp: null,
        isJourneyman: true,
        isIncomplete: true,
      };
      const { db, chains } = mockDb([teamPlayer]);

      await expect(service.teamPlayers(db, [20, 25])).resolves.toEqual([
        teamPlayer,
      ]);

      const where = renderedWhere(chains[0]);
      expect(where.sql).toContain('"team_eras"."team_id" in ($3, $4)');
      expect(where.params).toEqual(['tourplay.net', false, 20, 25]);
      expect(
        renderSql(fieldsOf(db.selectDistinctOn, 1).isIncomplete).sql,
      ).toContain('"players"."status" is null');
      expect(chains[0].orderBy).toHaveBeenCalledWith(players.id);
    });

    it('reads nothing without querying when given nothing to filter by', async () => {
      const { db, chains } = mockDb();

      await expect(service.teamPlayers(db, [])).resolves.toEqual([]);

      expect(chains).toHaveLength(0);
    });
  });

  describe('storedAdvancements', () => {
    it("reads the candidates' advancements that are not removed, with the skill name", async () => {
      const row = {
        playerId: 1,
        source: 'starting',
        skillId: 100,
        skillName: 'Block',
        attributeValue: null,
        isFreeExtra: false,
      };
      const { db, chains } = mockDb([row]);

      await expect(service.storedAdvancements(db, [1, 2])).resolves.toEqual([
        row,
      ]);

      expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
      const where = renderedWhere(chains[0]);
      expect(where.sql).toContain('"player_advancements"."removed" = $1');
      expect(where.params).toEqual([false, 1, 2]);
    });

    it('reads nothing without querying when given nothing to filter by', async () => {
      const { db, chains } = mockDb();

      await expect(service.storedAdvancements(db, [])).resolves.toEqual([]);

      expect(chains).toHaveLength(0);
    });
  });

  describe('paidAdvancements', () => {
    it("keeps the team players' paid advancements, keyed by characteristic abbreviation", async () => {
      const { db, chains } = mockDb([
        {
          playerId: 1,
          skillId: 200,
          attributeValue: '+1',
          characteristic: null,
        },
        {
          playerId: 1,
          skillId: null,
          attributeValue: null,
          characteristic: 'MA',
        },
        {
          playerId: 99,
          skillId: 201,
          attributeValue: null,
          characteristic: null,
        },
      ]);

      await expect(
        service.paidAdvancements(db, { teamIds: [20], playerIds: [1] }),
      ).resolves.toEqual([
        {
          playerId: 1,
          skillId: 200,
          attributeValue: '+1',
          characteristic: null,
        },
        {
          playerId: 1,
          skillId: null,
          attributeValue: null,
          characteristic: 'ma',
        },
      ]);

      const where = renderedWhere(chains[0]);
      expect(where.sql).toContain('"player_advancements"."source" <> $');
      expect(where.sql).toContain('"player_advancements"."is_free_extra" = $');
      expect(where.params).toEqual(
        expect.arrayContaining([20, false, 'starting']),
      );
    });

    it('reads nothing without querying when given nothing to filter by', async () => {
      const { db, chains } = mockDb();

      await expect(
        service.paidAdvancements(db, { teamIds: [], playerIds: [] }),
      ).resolves.toEqual([]);

      expect(chains).toHaveLength(0);
    });
  });

  describe('freeSkillRiskPlayerIds', () => {
    it('reads candidates holding an award of a skill-granting trophy, or one recording a skill', async () => {
      const { db, chains } = mockDb([{ playerId: 9 }]);

      await expect(service.freeSkillRiskPlayerIds(db, [9])).resolves.toEqual([
        9,
      ]);

      const where = renderedWhere(chains[0]);
      expect(where.sql).toContain('"trophies"."grants_skill" = $');
      expect(where.sql).toContain(
        '"trophy_awards"."granted_skill_id" is not null',
      );
      expect(where.params).toEqual([9, true]);
    });

    it('reads nothing without querying when given nothing to filter by', async () => {
      const { db, chains } = mockDb();

      await expect(service.freeSkillRiskPlayerIds(db, [])).resolves.toEqual([]);

      expect(chains).toHaveLength(0);
    });
  });
});
