import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { RecordInteractionInput } from './record-interaction-input';
import { UsageEntityUpsertService } from './usage-entity-upsert.service';
import { UsageTrackingService } from './usage-tracking.service';

const OCCURRED_AT = new Date('2026-09-09T12:00:00.000Z');

function input(
  overrides: Partial<RecordInteractionInput> = {},
): RecordInteractionInput {
  return {
    kind: 'command',
    name: 'stats',
    occurredAt: OCCURRED_AT,
    discordUserId: 'u1',
    username: 'spacejens',
    discordGuildId: 'g1',
    guildName: 'The Pitch',
    nickname: 'Skitter',
    discordChannelId: 'c1',
    channelName: 'general',
    outcome: 'success',
    parameters: [],
    ...overrides,
  };
}

describe('UsageTrackingService', () => {
  let entities: MockProxy<UsageEntityUpsertService>;

  async function makeService(db: MockDbResult): Promise<UsageTrackingService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsageTrackingService,
        { provide: DB, useValue: db.db },
        { provide: UsageEntityUpsertService, useValue: entities },
      ],
    }).compile();
    return moduleRef.get(UsageTrackingService);
  }

  beforeEach(() => {
    entities = mock<UsageEntityUpsertService>();
    entities.upsertUser.mockResolvedValue(3);
    entities.upsertGuild.mockResolvedValue(7);
    entities.upsertGuildMember.mockResolvedValue(11);
    entities.upsertChannel.mockResolvedValue(5);
    entities.upsertInteractionType.mockResolvedValue(2);
  });

  it('writes everything inside a single transaction', async () => {
    const db = mockDb([{ id: 99 }]);
    const service = await makeService(db);

    await service.recordInteraction(input());

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('upserts the user, guild, membership, channel and type for a guild interaction', async () => {
    const db = mockDb([{ id: 99 }]);
    const service = await makeService(db);

    await service.recordInteraction(input());

    expect(entities.upsertUser.mock.calls[0][1]).toEqual({
      discordId: 'u1',
      username: 'spacejens',
    });
    expect(entities.upsertGuild.mock.calls[0][1]).toEqual({
      discordId: 'g1',
      name: 'The Pitch',
    });
    expect(entities.upsertGuildMember.mock.calls[0][1]).toEqual({
      userId: 3,
      guildId: 7,
      nickname: 'Skitter',
    });
    expect(entities.upsertChannel.mock.calls[0][1]).toEqual({
      discordId: 'c1',
      guildId: 7,
      name: 'general',
    });
    expect(entities.upsertInteractionType.mock.calls[0][1]).toEqual({
      kind: 'command',
      name: 'stats',
    });
  });

  it('falls back to the snowflake when the guild name is unknown', async () => {
    const db = mockDb([{ id: 99 }]);
    const service = await makeService(db);

    await service.recordInteraction(input({ guildName: undefined }));

    expect(entities.upsertGuild.mock.calls[0][1]).toEqual({
      discordId: 'g1',
      name: 'g1',
    });
  });

  it('skips the guild and membership upserts for a DM', async () => {
    const db = mockDb([{ id: 99 }]);
    const service = await makeService(db);

    await service.recordInteraction(
      input({
        discordGuildId: undefined,
        guildName: undefined,
        nickname: undefined,
        channelName: undefined,
      }),
    );

    expect(entities.upsertGuild).not.toHaveBeenCalled();
    expect(entities.upsertGuildMember).not.toHaveBeenCalled();
    expect(entities.upsertChannel.mock.calls[0][1]).toEqual({
      discordId: 'c1',
      guildId: null,
      name: null,
    });
  });

  it('stores an absent nickname as null', async () => {
    const db = mockDb([{ id: 99 }]);
    const service = await makeService(db);

    await service.recordInteraction(input({ nickname: undefined }));

    expect(
      (
        entities.upsertGuildMember.mock.calls[0][1] as {
          nickname: string | null;
        }
      ).nickname,
    ).toBeNull();
  });

  it('inserts a success event with no error message and no parameter rows', async () => {
    const db = mockDb([{ id: 99 }]);
    const service = await makeService(db);

    await service.recordInteraction(input());

    expect(db.chains).toHaveLength(1);
    expect(db.chains[0].values.mock.calls[0][0]).toEqual({
      interactionTypeId: 2,
      userId: 3,
      guildId: 7,
      channelId: 5,
      occurredAt: OCCURRED_AT,
      outcome: 'success',
      errorMessage: null,
    });
  });

  it('inserts a failure event carrying the error message', async () => {
    const db = mockDb([{ id: 99 }]);
    const service = await makeService(db);

    await service.recordInteraction(
      input({ outcome: 'failure', errorMessage: 'boom' }),
    );

    const values = db.chains[0].values.mock.calls[0][0] as {
      outcome: string;
      errorMessage: string | null;
    };
    expect(values.outcome).toBe('failure');
    expect(values.errorMessage).toBe('boom');
  });

  it('inserts one parameter row per supplied parameter', async () => {
    // Query 0: the event insert. Query 1: the parameter insert.
    const db = mockDb([{ id: 99 }], []);
    const service = await makeService(db);

    await service.recordInteraction(
      input({
        parameters: [{ key: 'category', value: 'matches' }, { key: 'empty' }],
      }),
    );

    expect(db.chains).toHaveLength(2);
    expect(db.chains[1].values.mock.calls[0][0]).toEqual([
      { eventId: 99, key: 'category', value: 'matches' },
      { eventId: 99, key: 'empty', value: null },
    ]);
  });
});
