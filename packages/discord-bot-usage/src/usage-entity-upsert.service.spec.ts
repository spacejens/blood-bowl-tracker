import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { UsageEntityUpsertService } from './usage-entity-upsert.service';

async function makeService(
  db: MockDbResult,
): Promise<UsageEntityUpsertService> {
  const moduleRef = await Test.createTestingModule({
    providers: [UsageEntityUpsertService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(UsageEntityUpsertService);
}

describe('UsageEntityUpsertService', () => {
  describe('upsertGuild', () => {
    it('inserts the guild and returns its id when none exists yet', async () => {
      const db = mockDb([], [{ id: 7 }]);
      const service = await makeService(db);

      const id = await service.upsertGuild(db.db, {
        discordId: 'g1',
        name: 'The Pitch',
      });

      expect(id).toBe(7);
      expect(db.chains[1].values.mock.calls[0][0]).toEqual({
        discordId: 'g1',
        name: 'The Pitch',
      });
    });

    it('updates the name of an existing guild', async () => {
      const db = mockDb([{ id: 7 }], []);
      const service = await makeService(db);

      const id = await service.upsertGuild(db.db, {
        discordId: 'g1',
        name: 'Renamed',
      });

      expect(id).toBe(7);
      expect(db.chains[1].set.mock.calls[0][0]).toEqual({
        discordId: 'g1',
        name: 'Renamed',
      });
    });
  });

  describe('upsertUser', () => {
    it('inserts the user and returns its id when none exists yet', async () => {
      const db = mockDb([], [{ id: 3 }]);
      const service = await makeService(db);

      const id = await service.upsertUser(db.db, {
        discordId: 'u1',
        username: 'spacejens',
      });

      expect(id).toBe(3);
      expect(db.chains[1].values.mock.calls[0][0]).toEqual({
        discordId: 'u1',
        username: 'spacejens',
      });
    });

    it('updates the username of an existing user', async () => {
      const db = mockDb([{ id: 3 }], []);
      const service = await makeService(db);

      const id = await service.upsertUser(db.db, {
        discordId: 'u1',
        username: 'renamed',
      });

      expect(id).toBe(3);
      expect(db.chains[1].set.mock.calls[0][0]).toEqual({
        discordId: 'u1',
        username: 'renamed',
      });
    });
  });

  describe('upsertGuildMember', () => {
    it('inserts the membership and returns its id when none exists yet', async () => {
      const db = mockDb([], [{ id: 11 }]);
      const service = await makeService(db);

      const id = await service.upsertGuildMember(db.db, {
        userId: 3,
        guildId: 7,
        nickname: 'Skitter',
      });

      expect(id).toBe(11);
      expect(db.chains[1].values.mock.calls[0][0]).toEqual({
        userId: 3,
        guildId: 7,
        nickname: 'Skitter',
      });
    });

    it('stores a null nickname unchanged', async () => {
      const db = mockDb([], [{ id: 11 }]);
      const service = await makeService(db);

      await service.upsertGuildMember(db.db, {
        userId: 3,
        guildId: 7,
        nickname: null,
      });

      expect(
        (db.chains[1].values.mock.calls[0][0] as { nickname: string | null })
          .nickname,
      ).toBeNull();
    });

    it('updates the nickname of an existing membership', async () => {
      const db = mockDb([{ id: 11 }], []);
      const service = await makeService(db);

      const id = await service.upsertGuildMember(db.db, {
        userId: 3,
        guildId: 7,
        nickname: 'Renamed',
      });

      expect(id).toBe(11);
      expect(db.chains[1].set.mock.calls[0][0]).toEqual({
        userId: 3,
        guildId: 7,
        nickname: 'Renamed',
      });
    });
  });

  describe('upsertChannel', () => {
    it('inserts a guild channel and returns its id when none exists yet', async () => {
      const db = mockDb([], [{ id: 5 }]);
      const service = await makeService(db);

      const id = await service.upsertChannel(db.db, {
        discordId: 'c1',
        guildId: 7,
        name: 'general',
      });

      expect(id).toBe(5);
      expect(db.chains[1].values.mock.calls[0][0]).toEqual({
        discordId: 'c1',
        guildId: 7,
        name: 'general',
      });
    });

    it('inserts a DM channel with a null guild and null name', async () => {
      const db = mockDb([], [{ id: 5 }]);
      const service = await makeService(db);

      await service.upsertChannel(db.db, {
        discordId: 'dm1',
        guildId: null,
        name: null,
      });

      expect(db.chains[1].values.mock.calls[0][0]).toEqual({
        discordId: 'dm1',
        guildId: null,
        name: null,
      });
    });

    it('updates an existing channel', async () => {
      const db = mockDb([{ id: 5 }], []);
      const service = await makeService(db);

      const id = await service.upsertChannel(db.db, {
        discordId: 'c1',
        guildId: 7,
        name: 'renamed',
      });

      expect(id).toBe(5);
      expect(db.chains[1].set.mock.calls[0][0]).toEqual({
        discordId: 'c1',
        guildId: 7,
        name: 'renamed',
      });
    });
  });

  describe('upsertInteractionType', () => {
    it('inserts a newly seen interaction type and returns its id', async () => {
      const db = mockDb([], [{ id: 2 }]);
      const service = await makeService(db);

      const id = await service.upsertInteractionType(db.db, {
        kind: 'command',
        name: 'stats',
      });

      expect(id).toBe(2);
      expect(db.chains[1].values.mock.calls[0][0]).toEqual({
        kind: 'command',
        name: 'stats',
      });
    });

    it('returns the existing id when the type is already catalogued', async () => {
      const db = mockDb([{ id: 2 }], []);
      const service = await makeService(db);

      const id = await service.upsertInteractionType(db.db, {
        kind: 'button',
        name: 'deepdive:era:',
      });

      expect(id).toBe(2);
      expect(db.chains[1].set.mock.calls[0][0]).toEqual({
        kind: 'button',
        name: 'deepdive:era:',
      });
    });
  });
});
