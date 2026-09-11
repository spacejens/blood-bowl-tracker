import { DB } from '@blood-bowl-tracker/db';
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
import { beforeEach, describe, expect, it } from 'vitest';

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
      occurredAt: OCCURRED_AT,
      kind: 'button',
      name: 'coach:',
      outcome: 'failure',
      errorMessage: 'boom',
      parameters: [],
    });
  });
});
