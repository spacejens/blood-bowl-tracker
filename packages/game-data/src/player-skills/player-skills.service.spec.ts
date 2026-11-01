import {
  playerAdvancements,
  players,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SkillValidationError } from '../shared/skill-validation-error';
import { makeService } from './player-skills.test-helpers';

/** Player 1 exists. */
const playerRow = { id: 1 };
/** Skill 7 exists. */
const skillRow = { id: 7 };

const entry = { playerId: 1, skillId: 7, source: 'starting' as const };

describe('PlayerSkillsService', () => {
  describe('markTrophyGranted', () => {
    it("marks the player's rows of that skill that are not yet free", async () => {
      const db = mockDb([{ name: 'Tentacles' }], []);
      const service = await makeService(db);

      await service.markTrophyGranted(1, 7);

      expect(db.db.update).toHaveBeenCalledWith(playerAdvancements);
      expect(firstCallArg(db.chains[1].set)).toEqual({ isFreeExtra: true });
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        1,
        7,
        false,
      ]);
    });

    it('never marks Hatred', async () => {
      const db = mockDb([{ name: 'Hatred' }]);
      const service = await makeService(db);

      await service.markTrophyGranted(1, 7);

      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('does nothing for a skill that does not exist', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await service.markTrophyGranted(1, 7);

      expect(db.db.update).not.toHaveBeenCalled();
    });
  });

  describe('unmarkTrophyGranted', () => {
    it("unmarks the player's free rows of the old skill", async () => {
      const db = mockDb([{ name: 'Tentacles' }], [], []);
      const service = await makeService(db);

      await service.unmarkTrophyGranted(1, 7);

      expect(db.db.update).toHaveBeenCalledWith(playerAdvancements);
      expect(firstCallArg(db.chains[2].set)).toEqual({ isFreeExtra: false });
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        1,
        7,
        true,
      ]);
    });

    it("looks for another of the player's awards that still grants the skill", async () => {
      const db = mockDb([{ name: 'Tentacles' }], [], []);
      const service = await makeService(db);

      await service.unmarkTrophyGranted(1, 7);

      expect(db.chains[1].from).toHaveBeenCalledWith(trophyAwards);
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        1, 7,
      ]);
    });

    it('does not unmark a skill another award of the player still grants', async () => {
      const db = mockDb([{ name: 'Tentacles' }], [{ id: 99 }]);
      const service = await makeService(db);

      await service.unmarkTrophyGranted(1, 7);

      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('never unmarks Hatred', async () => {
      const db = mockDb([{ name: 'Hatred' }]);
      const service = await makeService(db);

      await service.unmarkTrophyGranted(1, 7);

      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('does nothing for a skill that does not exist', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await service.unmarkTrophyGranted(1, 7);

      expect(db.db.update).not.toHaveBeenCalled();
    });
  });

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
      const clear = db.chains[db.chains.length - 1];
      expect(db.db.update).toHaveBeenLastCalledWith(players);
      expect(firstCallArg(clear.set)).toEqual({ unspentSpp: null });
      expect(extractAllFilterValues(firstCallArg(clear.where))).toContain(1);
    });

    it('does not match a stored characteristic row, which names no skill', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [
          {
            id: 60,
            playerId: 1,
            skillId: null,
            source: 'characteristic',
            attributeValue: null,
            advancementOrder: null,
          },
        ],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
      );
      const service = await makeService(db);

      const result = await service.sync({ entries: [entry] });

      expect(result).toEqual({ playerSkillIds: [51] });
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
      // No change, so the stored unspent SPP is not cleared either.
      expect(db.db.update).not.toHaveBeenCalled();
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
      const clear = db.chains[db.chains.length - 1];
      expect(db.db.update).toHaveBeenLastCalledWith(players);
      expect(firstCallArg(clear.set)).toEqual({ unspentSpp: null });
      expect(extractAllFilterValues(firstCallArg(clear.where))).toContain(1);
    });

    it.each(['chosen', 'random'] as const)(
      'keeps a stored %s source when the entry only says advancement',
      async (stored) => {
        const db = mockDb(
          [playerRow],
          [skillRow],
          [
            {
              id: 51,
              playerId: 1,
              skillId: 7,
              source: stored,
              attributeValue: null,
              advancementOrder: 2,
            },
          ],
        );
        const service = await makeService(db);

        const result = await service.sync({
          entries: [{ ...entry, source: 'advancement', advancementOrder: 2 }],
        });

        expect(result).toEqual({ playerSkillIds: [51] });
        // Nothing changed, so nothing is written and the stored unspent SPP
        // is not cleared.
        expect(db.chains).toHaveLength(3);
        expect(db.transaction).not.toHaveBeenCalled();
        expect(db.db.update).not.toHaveBeenCalled();
      },
    );

    it('keeps a stored chosen source but still updates the order an advancement entry gives', async () => {
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
            advancementOrder: 2,
          },
        ],
      );
      const service = await makeService(db);

      await service.sync({
        entries: [{ ...entry, source: 'advancement', advancementOrder: 3 }],
      });

      expect(firstCallArg(db.chains[3].set)).toEqual({ advancementOrder: 3 });
    });

    it.each([
      ['advancement', 'chosen'],
      ['advancement', 'random'],
      ['starting', 'advancement'],
      ['advancement', 'starting'],
    ] as const)(
      'updates a stored %s source to the %s the entry gives',
      async (stored, incoming) => {
        const db = mockDb(
          [playerRow],
          [skillRow],
          [
            {
              id: 51,
              playerId: 1,
              skillId: 7,
              source: stored,
              attributeValue: null,
              advancementOrder: null,
            },
          ],
        );
        const service = await makeService(db);

        await service.sync({ entries: [{ ...entry, source: incoming }] });

        expect(firstCallArg(db.chains[3].set)).toEqual({ source: incoming });
      },
    );

    it('clears advancementOrder when a gained skill changes to starting, even though the entry omits it', async () => {
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
        entries: [{ ...entry, source: 'starting' }],
      });

      expect(result).toEqual({ playerSkillIds: [51] });
      expect(db.transaction).toHaveBeenCalled();
      expect(firstCallArg(db.chains[3].set)).toEqual({
        source: 'starting',
        advancementOrder: null,
      });
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

    it("left-joins the batch's players to their skill-granting trophy awards", async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
      );
      const service = await makeService(db);

      await service.sync({ entries: [entry] });

      expect(firstCallArg(db.chains[0].leftJoin)).toBe(trophyAwards);
      expect(
        extractJoinColumns(firstCallArg(db.chains[0].leftJoin, 0, 1)),
      ).toEqual([
        'trophy_awards.player_id',
        'players.id',
        'trophy_awards.granted_skill_id',
      ]);
      expect(
        extractAllFilterValues(firstCallArg(db.chains[0].leftJoin, 0, 1)),
      ).toEqual([]);
    });

    it('stores an entry the source flags as a free extra', async () => {
      const db = mockDb(
        [playerRow],
        [skillRow],
        [],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
      );
      const service = await makeService(db);

      await service.sync({
        entries: [{ ...entry, source: 'chosen', isFreeExtra: true }],
      });

      expect(firstCallArg(db.chains[3].values)).toEqual([
        {
          playerId: 1,
          skillId: 7,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: null,
          isFreeExtra: true,
        },
      ]);
    });

    it("stores a skill one of the player's own trophy awards grants as a free extra", async () => {
      const db = mockDb(
        [{ id: 1, grantedSkillId: 7 }],
        [{ id: 7, name: 'Tentacles' }],
        [],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
      );
      const service = await makeService(db);

      await service.sync({ entries: [{ ...entry, source: 'advancement' }] });

      expect(firstCallArg(db.chains[3].values)).toEqual([
        expect.objectContaining({ isFreeExtra: true }),
      ]);
    });

    it('does not mark a skill the awards do not name', async () => {
      const db = mockDb(
        [
          { id: 1, grantedSkillId: 8 },
          { id: 1, grantedSkillId: null },
        ],
        [{ id: 7, name: 'Tentacles' }],
        [],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
      );
      const service = await makeService(db);

      await service.sync({ entries: [{ ...entry, source: 'advancement' }] });

      expect(firstCallArg(db.chains[3].values)).toEqual([
        expect.not.objectContaining({ isFreeExtra: true }),
      ]);
    });

    it('stores every gained Hatred as a free extra, flagged by the source or not', async () => {
      const db = mockDb(
        [playerRow],
        [{ id: 7, name: 'Hatred' }],
        [],
        [
          { id: 51, playerId: 1, skillId: 7, attributeValue: 'Orc' },
          { id: 52, playerId: 1, skillId: 7, attributeValue: 'Elf' },
        ],
      );
      const service = await makeService(db);

      await service.sync({
        entries: [
          {
            ...entry,
            source: 'chosen',
            attributeValue: 'Orc',
            isFreeExtra: true,
          },
          { ...entry, source: 'random', attributeValue: 'Elf' },
        ],
      });

      expect(firstCallArg(db.chains[3].values)).toEqual([
        expect.objectContaining({ attributeValue: 'Orc', isFreeExtra: true }),
        expect.objectContaining({ attributeValue: 'Elf', isFreeExtra: true }),
      ]);
    });

    it('leaves a starting Hatred unmarked, even when a trophy award names Hatred', async () => {
      const db = mockDb(
        [{ id: 1, grantedSkillId: 7 }],
        [{ id: 7, name: 'Hatred' }],
        [],
        [{ id: 51, playerId: 1, skillId: 7, attributeValue: 'Dwarf' }],
      );
      const service = await makeService(db);

      await service.sync({
        entries: [{ ...entry, source: 'starting', attributeValue: 'Dwarf' }],
      });

      expect(firstCallArg(db.chains[3].values)).toEqual([
        expect.not.objectContaining({ isFreeExtra: true }),
      ]);
    });

    it('marks an existing row that is not yet free, clearing the stored unspent SPP', async () => {
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
            advancementOrder: 1,
            isFreeExtra: false,
          },
        ],
      );
      const service = await makeService(db);

      const result = await service.sync({
        entries: [
          {
            ...entry,
            source: 'chosen',
            advancementOrder: 1,
            isFreeExtra: true,
          },
        ],
      });

      expect(result).toEqual({ playerSkillIds: [51] });
      expect(firstCallArg(db.chains[3].set)).toEqual({ isFreeExtra: true });
      const clear = db.chains[db.chains.length - 1];
      expect(firstCallArg(clear.set)).toEqual({ unspentSpp: null });
    });

    it('never clears a stored free-extra flag', async () => {
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
            advancementOrder: 1,
            isFreeExtra: true,
          },
        ],
      );
      const service = await makeService(db);

      await service.sync({
        entries: [{ ...entry, source: 'chosen', advancementOrder: 1 }],
      });

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
    /** One row as the query returns it for a skill curated under the rules set. */
    const eliteRow = {
      skillId: 7,
      skillName: 'Mighty Blow',
      source: 'random',
      attributeValue: null,
      advancementOrder: 1,
      category: 'strength',
      isElite: true,
      isFreeExtra: false,
    };

    it("returns the player's skills with their category and elite flag", async () => {
      const db = mockDb([eliteRow]);
      const service = await makeService(db);

      await expect(service.listByPlayer(1, 3)).resolves.toEqual([
        { ...eliteRow },
      ]);
      expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(1);
      expect(db.chains[0].orderBy).toHaveBeenCalled();
    });

    it('keeps a non-elite curated skill non-elite', async () => {
      const db = mockDb([{ ...eliteRow, isElite: false }]);
      const service = await makeService(db);

      await expect(service.listByPlayer(1, 3)).resolves.toEqual([
        { ...eliteRow, isElite: false },
      ]);
    });

    it('reports a skill with no row for this rules set as uncategorised and not elite', async () => {
      // The left join misses, so both joined columns come back null. `isElite`
      // is normalised to false: "not elite" and "this rules set has no such
      // concept" are the same thing to every consumer, exactly as the column's
      // own NOT NULL DEFAULT false says.
      const db = mockDb([{ ...eliteRow, category: null, isElite: null }]);
      const service = await makeService(db);

      await expect(service.listByPlayer(1, 3)).resolves.toEqual([
        {
          ...eliteRow,
          category: null,
          isElite: false,
        },
      ]);
    });

    it('joins the skill rules set rows on the requested rules set', async () => {
      const db = mockDb([eliteRow]);
      const service = await makeService(db);

      await service.listByPlayer(1, 3);

      expect(
        extractAllFilterValues(firstCallArg(db.chains[0].leftJoin, 0, 1)),
      ).toContain(3);
    });

    it('reports the stored free-extra flag with one query', async () => {
      const db = mockDb([{ ...eliteRow, isFreeExtra: true }]);
      const service = await makeService(db);

      await expect(service.listByPlayer(1, 3)).resolves.toEqual([
        { ...eliteRow, isFreeExtra: true },
      ]);
      expect(db.chains).toHaveLength(1);
    });
  });
});
