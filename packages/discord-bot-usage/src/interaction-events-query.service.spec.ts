import { channels, DB, guilds } from '@blood-bowl-tracker/db';
import type {
  MockDbResult,
  QueryChain,
} from '@blood-bowl-tracker/db/test-helpers';
import {
  is,
  mockDb,
  Param,
  SQL,
  StringChunk,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InteractionEventsQueryService } from './interaction-events-query.service';

const OCCURRED_AT = new Date('2026-09-09T12:00:00.000Z');
const EARLIER = new Date('2026-09-08T12:00:00.000Z');

/** One row shaped the way the events query selects it. */
function eventRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    occurredAt: OCCURRED_AT,
    kind: 'command',
    name: 'insights',
    outcome: 'success',
    errorMessage: null,
    username: 'coach42',
    guildName: 'Test League',
    channelName: 'general',
    ...overrides,
  };
}

/** One row shaped the way the top-users aggregate query selects it. */
function topUserRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    discordUserId: '100',
    username: 'coach42',
    interactionCount: 7,
    ...overrides,
  };
}

/** Every literal value drizzle stored in a captured condition tree, in order. */
function filterValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown): void => {
    if (is(node, Param)) {
      values.push((node as unknown as { value: unknown }).value);
    } else if (is(node, SQL)) {
      for (const chunk of node.queryChunks) walk(chunk);
    } else if (Array.isArray(node)) {
      for (const chunk of node) walk(chunk);
    }
  };
  walk(condition);
  return values;
}

/** The static SQL text of a captured expression, with values omitted. */
function sqlText(expr: unknown): string {
  if (!is(expr, SQL)) return '';
  return expr.queryChunks
    .map((chunk) =>
      is(chunk, StringChunk) ? chunk.value.join('') : sqlText(chunk),
    )
    .join('');
}

function whereArg(chain: QueryChain): unknown {
  return chain.where.mock.calls[0][0];
}

/** The underlying column's own `name`, out of a captured `desc(...)`/`asc(...)` expression. */
function orderedColumnName(expr: unknown): string | undefined {
  if (!is(expr, SQL)) return undefined;
  for (const chunk of expr.queryChunks) {
    if (
      !is(chunk, StringChunk) &&
      typeof (chunk as { name?: unknown }).name === 'string'
    ) {
      return (chunk as { name: string }).name;
    }
  }
  return undefined;
}

describe('InteractionEventsQueryService', () => {
  async function makeService(
    db: MockDbResult,
  ): Promise<InteractionEventsQueryService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        InteractionEventsQueryService,
        { provide: DB, useValue: db.db },
      ],
    }).compile();
    return moduleRef.get(InteractionEventsQueryService);
  }

  let db: MockDbResult;

  beforeEach(() => {
    db = mockDb([eventRow()], []);
  });

  it('returns the most recent events, newest first, capped at the limit', async () => {
    db = mockDb(
      [
        eventRow({ id: 2, occurredAt: OCCURRED_AT }),
        eventRow({ id: 1, occurredAt: EARLIER }),
      ],
      [],
    );
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows.map((row) => row.occurredAt)).toEqual([OCCURRED_AT, EARLIER]);
    expect(db.chains[0].limit).toHaveBeenCalledWith(20);
    expect(sqlText(db.chains[0].orderBy.mock.calls[0][0])).toContain(' desc');
  });

  it('breaks ties on occurredAt with the event id, both descending, in that column order', async () => {
    const service = await makeService(db);

    await service.listRecent({ limit: 20 });

    const [primary, secondary] = db.chains[0].orderBy.mock.calls[0] as [
      unknown,
      unknown,
    ];
    expect(orderedColumnName(primary)).toBe('occurred_at');
    expect(sqlText(primary)).toContain(' desc');
    expect(orderedColumnName(secondary)).toBe('id');
    expect(sqlText(secondary)).toContain(' desc');
  });

  it('applies no filter when neither option is given', async () => {
    const service = await makeService(db);

    await service.listRecent({ limit: 20 });

    expect(whereArg(db.chains[0])).toBeUndefined();
  });

  it('filters on the Discord user id when only that option is given', async () => {
    const service = await makeService(db);

    await service.listRecent({ discordUserId: 'u1', limit: 20 });

    expect(filterValues(whereArg(db.chains[0]))).toEqual(['u1']);
  });

  it('filters on the outcome when only that option is given', async () => {
    const service = await makeService(db);

    await service.listRecent({ outcome: 'failure', limit: 20 });

    expect(filterValues(whereArg(db.chains[0]))).toEqual(['failure']);
  });

  it('combines both filters when both options are given', async () => {
    const service = await makeService(db);

    await service.listRecent({
      discordUserId: 'u1',
      outcome: 'failure',
      limit: 20,
    });

    expect(filterValues(whereArg(db.chains[0]))).toEqual(['u1', 'failure']);
  });

  it('issues no parameters query when no events match', async () => {
    db = mockDb([]);
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows).toEqual([]);
    expect(db.chains).toHaveLength(1);
  });

  it('fetches parameters for exactly the returned event ids', async () => {
    db = mockDb([eventRow({ id: 7 }), eventRow({ id: 9 })], []);
    const service = await makeService(db);

    await service.listRecent({ limit: 20 });

    expect(filterValues(whereArg(db.chains[1]))).toEqual([7, 9]);
  });

  it('attaches each event its own parameters and leaves the others empty', async () => {
    db = mockDb(
      [
        eventRow({ id: 7, name: 'insights' }),
        eventRow({ id: 9, name: 'onthisdate' }),
      ],
      [
        { eventId: 7, key: 'race', value: 'Orc' },
        { eventId: 7, key: 'era', value: null },
      ],
    );
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows[0].parameters).toEqual([
      { key: 'race', value: 'Orc' },
      { key: 'era', value: null },
    ]);
    expect(rows[1].parameters).toEqual([]);
  });

  it('keeps repeated parameter keys, in the order the rows came back', async () => {
    db = mockDb(
      [eventRow({ id: 7, kind: 'select_menu', name: 'coach:' })],
      [
        { eventId: 7, key: 'value', value: 'first' },
        { eventId: 7, key: 'value', value: 'second' },
      ],
    );
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows[0].parameters).toEqual([
      { key: 'value', value: 'first' },
      { key: 'value', value: 'second' },
    ]);
  });

  it('carries the catalog kind and name and the outcome fields through', async () => {
    db = mockDb(
      [
        eventRow({
          kind: 'button',
          name: 'coach:',
          outcome: 'failure',
          errorMessage: 'boom',
        }),
      ],
      [],
    );
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows[0]).toEqual({
      id: 1,
      occurredAt: OCCURRED_AT,
      kind: 'button',
      name: 'coach:',
      outcome: 'failure',
      errorMessage: 'boom',
      username: 'coach42',
      guildName: 'Test League',
      channelName: 'general',
      parameters: [],
    });
  });

  it('carries the triggering username, guild name and channel name through', async () => {
    db = mockDb(
      [
        eventRow({
          username: 'zog',
          guildName: 'Orcland',
          channelName: 'blood-bowl',
        }),
      ],
      [],
    );
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows[0].username).toBe('zog');
    expect(rows[0].guildName).toBe('Orcland');
    expect(rows[0].channelName).toBe('blood-bowl');
  });

  it('carries a null guild name and channel name through for a DM', async () => {
    db = mockDb([eventRow({ guildName: null, channelName: null })], []);
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows[0].guildName).toBeNull();
    expect(rows[0].channelName).toBeNull();
  });

  it('inner-joins channels and left-joins guilds for their names', async () => {
    const service = await makeService(db);

    await service.listRecent({ limit: 20 });

    const chain = db.chains[0];
    const innerJoinTables = chain.innerJoin.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    const leftJoinTables = chain.leftJoin.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(innerJoinTables).toContain(channels);
    expect(leftJoinTables).toContain(guilds);
  });

  it('carries each event id through to the returned rows', async () => {
    db = mockDb([eventRow({ id: 5 })], []);
    const service = await makeService(db);

    const rows = await service.listRecent({ limit: 20 });

    expect(rows[0].id).toBe(5);
  });

  describe('findById', () => {
    it('returns the single event with its parameters', async () => {
      const mocked = mockDb(
        [eventRow({ id: 7, kind: 'button', name: 'coach:' })],
        [{ eventId: 7, key: 'id', value: '42' }],
      );
      const moduleRef = await Test.createTestingModule({
        providers: [
          InteractionEventsQueryService,
          { provide: DB, useValue: mocked.db },
        ],
      }).compile();
      const service = moduleRef.get(InteractionEventsQueryService);

      const found = await service.findById(7);

      expect(found).toEqual({
        id: 7,
        occurredAt: OCCURRED_AT,
        kind: 'button',
        name: 'coach:',
        outcome: 'success',
        errorMessage: null,
        username: 'coach42',
        guildName: 'Test League',
        channelName: 'general',
        parameters: [{ key: 'id', value: '42' }],
      });
    });

    it('filters on the event id', async () => {
      const mocked = mockDb([eventRow({ id: 7 })], []);
      const moduleRef = await Test.createTestingModule({
        providers: [
          InteractionEventsQueryService,
          { provide: DB, useValue: mocked.db },
        ],
      }).compile();
      const service = moduleRef.get(InteractionEventsQueryService);

      await service.findById(7);

      expect(filterValues(whereArg(mocked.chains[0]))).toEqual([7]);
    });

    it('returns undefined and issues no parameter query when no event matches', async () => {
      const mocked = mockDb([]);
      const moduleRef = await Test.createTestingModule({
        providers: [
          InteractionEventsQueryService,
          { provide: DB, useValue: mocked.db },
        ],
      }).compile();
      const service = moduleRef.get(InteractionEventsQueryService);

      expect(await service.findById(7)).toBeUndefined();
      expect(mocked.chains).toHaveLength(1);
    });
  });

  describe('topUsers', () => {
    /** A fixed "now" so the sinceDays cutoff is an exact, assertable Date. */
    const NOW = new Date('2026-09-12T00:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns one row per user, most interactions first', async () => {
      const mocked = mockDb([
        topUserRow({
          discordUserId: '100',
          username: 'alice',
          interactionCount: 42,
        }),
        topUserRow({
          discordUserId: '200',
          username: 'bob',
          interactionCount: 17,
        }),
      ]);
      const service = await makeService(mocked);

      const rows = await service.topUsers({ limit: 20 });

      expect(rows).toEqual([
        { discordUserId: '100', username: 'alice', interactionCount: 42 },
        { discordUserId: '200', username: 'bob', interactionCount: 17 },
      ]);
    });

    it('caps the leaderboard at the caller-supplied limit', async () => {
      const mocked = mockDb([topUserRow()]);
      const service = await makeService(mocked);

      await service.topUsers({ limit: 20 });

      expect(mocked.chains[0].limit).toHaveBeenCalledWith(20);
    });

    it('groups by the user id and the selected user columns', async () => {
      const mocked = mockDb([topUserRow()]);
      const service = await makeService(mocked);

      await service.topUsers({ limit: 20 });

      const grouped = mocked.chains[0].groupBy.mock.calls[0] as {
        name: string;
      }[];
      expect(grouped.map((column) => column.name)).toEqual([
        'id',
        'discord_id',
        'username',
      ]);
    });

    it('orders by the count descending, breaking ties on the user id ascending', async () => {
      const mocked = mockDb([topUserRow()]);
      const service = await makeService(mocked);

      await service.topUsers({ limit: 20 });

      const [primary, secondary] = mocked.chains[0].orderBy.mock.calls[0] as [
        unknown,
        unknown,
      ];
      expect(sqlText(primary)).toContain('count(');
      expect(sqlText(primary)).toContain(' desc');
      expect(orderedColumnName(secondary)).toBe('id');
      expect(sqlText(secondary)).toContain(' asc');
    });

    it('applies no filter when neither option is given', async () => {
      const mocked = mockDb([topUserRow()]);
      const service = await makeService(mocked);

      await service.topUsers({ limit: 20 });

      expect(whereArg(mocked.chains[0])).toBeUndefined();
    });

    it('filters on the interaction kind when only that option is given', async () => {
      const mocked = mockDb([topUserRow()]);
      const service = await makeService(mocked);

      await service.topUsers({ kind: 'button', limit: 20 });

      expect(filterValues(whereArg(mocked.chains[0]))).toEqual(['button']);
    });

    it('filters on a cutoff sinceDays before now when only that option is given', async () => {
      const mocked = mockDb([topUserRow()]);
      const service = await makeService(mocked);

      await service.topUsers({ sinceDays: 7, limit: 20 });

      expect(filterValues(whereArg(mocked.chains[0]))).toEqual([
        new Date('2026-09-05T00:00:00.000Z'),
      ]);
    });

    it('combines both filters when both options are given', async () => {
      const mocked = mockDb([topUserRow()]);
      const service = await makeService(mocked);

      await service.topUsers({ kind: 'command', sinceDays: 1, limit: 20 });

      expect(filterValues(whereArg(mocked.chains[0]))).toEqual([
        'command',
        new Date('2026-09-11T00:00:00.000Z'),
      ]);
    });

    it('issues exactly one query and returns nothing when no interaction matches', async () => {
      const mocked = mockDb([]);
      const service = await makeService(mocked);

      const rows = await service.topUsers({ limit: 20 });

      expect(rows).toEqual([]);
      expect(mocked.chains).toHaveLength(1);
    });
  });
});
