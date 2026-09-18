import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SkillValidationError } from '../shared/skill-validation-error';
import { PlayerSkillsService } from './player-skills.service';

async function makeService(db: MockDbResult): Promise<PlayerSkillsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [PlayerSkillsService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(PlayerSkillsService);
}

/** Player 1 exists. */
const playerRow = { id: 1 };
/** Skill 7 exists. */
const skillRow = { id: 7 };

const entry = { playerId: 1, skillId: 7, source: 'starting' as const };

describe('PlayerSkillsService', () => {
  describe('sync', () => {
    it('returns no ids and issues no query for an empty entries list', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ entries: [] });

      expect(result).toEqual({ playerSkillIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('inserts a starting skill with nulls for the two optional columns', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ playerSkillIds: [51] });
      expect(firstCallArg(db.chains[3].values)).toEqual([
        {
          playerId: 1,
          skillId: 7,
          source: 'starting',
          attributeValue: null,
          advancementOrder: null,
        },
      ]);
      expect(db.transaction).toHaveBeenCalled();
    });

    it('inserts a gained skill with its variant and order', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: 'Orc' }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [
          {
            ...entry,
            source: 'chosen',
            attributeValue: 'Orc',
            advancementOrder: 2,
          },
        ],
      });

      expect(result).toEqual({ playerSkillIds: [51] });
      expect(firstCallArg(db.chains[3].values)).toEqual([
        {
          playerId: 1,
          skillId: 7,
          source: 'chosen',
          attributeValue: 'Orc',
          advancementOrder: 2,
        },
      ]);
    });

    it('treats the same skill with two different variants as two rows', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [],
        [
          { id: 51, playerId: 1, skillId: 7, attributeValue: 'Orc' },
          { id: 52, playerId: 1, skillId: 7, attributeValue: 'Elf' },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [
          { ...entry, source: 'chosen', attributeValue: 'Orc' },
          { ...entry, source: 'chosen', attributeValue: 'Elf' },
        ],
      });

      expect(result).toEqual({ playerSkillIds: [51, 52] });
    });

    it('treats a null attribute value and an empty-string one as two distinct rows', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [],
        [
          { id: 51, playerId: 1, skillId: 7, attributeValue: null },
          { id: 52, playerId: 1, skillId: 7, attributeValue: '' },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [
          { ...entry, attributeValue: null },
          { ...entry, attributeValue: '' },
        ],
      });

      expect(result).toEqual({ playerSkillIds: [51, 52] });
    });

    it('returns the existing id without writing when the row already matches', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [
          {
            id: 51,
            playerId: 1,
            skillId: 7,
            source: 'starting',
            attributeValue: null,
            advancementOrder: null,
          },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ playerSkillIds: [51] });
      // Only the two precondition selects and the existing-rows select ran.
      expect(db.chains).toHaveLength(3);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("updates an existing row's source when the entry disagrees", async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [
          {
            id: 51,
            playerId: 1,
            skillId: 7,
            source: 'random',
            attributeValue: null,
            advancementOrder: null,
          },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...entry, source: 'chosen' }],
      });

      expect(result).toEqual({ playerSkillIds: [51] });
      expect(db.transaction).toHaveBeenCalled();
      expect(firstCallArg(db.chains[3].set)).toEqual({ source: 'chosen' });
    });

    it('updates advancementOrder when the entry gives a different value', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [
          {
            id: 51,
            playerId: 1,
            skillId: 7,
            source: 'chosen',
            attributeValue: null,
            advancementOrder: 3,
          },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...entry, source: 'chosen', advancementOrder: 5 }],
      });

      expect(result).toEqual({ playerSkillIds: [51] });
      expect(db.transaction).toHaveBeenCalled();
      expect(firstCallArg(db.chains[3].set)).toEqual({ advancementOrder: 5 });
    });

    it('leaves advancementOrder alone when the entry says nothing about it', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [
          {
            id: 51,
            playerId: 1,
            skillId: 7,
            source: 'chosen',
            attributeValue: null,
            advancementOrder: 3,
          },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [{ ...entry, source: 'chosen' }],
      });

      expect(result).toEqual({ playerSkillIds: [51] });
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects an entry naming a player that does not exist', async () => {
      const db = mockDb([], [skillRow]);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toThrow(
        SkillValidationError,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects an entry naming a skill that does not exist', async () => {
      const db = mockDb([playerRow], []);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toThrow(
        /Skill 7 does not exist/,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a batch repeating the same player, skill and variant', async () => {
      const db = mockDb([playerRow], [skillRow]);
      const service = await makeService(db);

      await expect(
        service.sync({ entries: [entry, { ...entry, source: 'chosen' }] }),
      ).rejects.toThrow(/more than once in the same batch/);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('throws when the insert returns no row for a key it was given', async () => {
      const db = mockDb([playerRow], [skillRow], [], []);
      const service = await makeService(db);

      await expect(service.sync({ entries: [entry] })).rejects.toThrow(
        /did not return a row/,
      );
    });
  });

  describe('listByPlayer', () => {
    it("returns the player's skills joined to their names", async () => {
      const row = {
        skillId: 7,
        skillName: 'Block',
        source: 'starting',
        attributeValue: null,
        advancementOrder: null,
      };
      const db = mockDb([row]);
      const service = await makeService(db);

      await expect(service.listByPlayer(1)).resolves.toEqual([row]);
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(1);
      expect(db.chains[0].orderBy).toHaveBeenCalled();
    });
  });
});
