import {
  DB,
  matchEventExternalIds,
  matchEvents,
  matchTeams,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MatchEventsService,
  MatchEventUpsertConflictError,
} from './match-events.service';

const fakeEvent = {
  id: 1,
  matchId: 10,
  actingMatchTeamId: 100,
  consequenceMatchTeamId: null,
  actingPlayerId: 9,
  consequencePlayerId: null,
  actionType: 'touchdown',
  consequenceType: null,
  createdAt: new Date('2026-01-01'),
};

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
  };
}

describe('MatchEventsService', () => {
  let service: MatchEventsService;
  let externalIdRows: { ownerId: number }[];
  let matchTeamRows: { id: number; teamEraId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    matchTeamRows = [{ id: 100, teamEraId: 500 }];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === matchTeams ? matchTeamRows : externalIdRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeEvent]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakeEvent]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [MatchEventsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(MatchEventsService);
  });

  const baseData = {
    matchId: 10,
    actingTeamEraId: 500,
    actingPlayerId: 9,
    actionType: 'touchdown' as const,
    externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
  };

  it('creates a new event, resolving team-era to match_team id', async () => {
    const result = await service.upsert(baseData);

    expect(result.created).toBe(true);
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({
      matchId: 10,
      actingMatchTeamId: 100,
      actingPlayerId: 9,
      actionType: 'touchdown',
    });
  });

  it('updates the matching event when exactly one external id matches', async () => {
    externalIdRows = [{ ownerId: 1 }];

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === matchEvents)).toBe(true);
  });

  it('throws MatchEventUpsertConflictError when external ids match different events', async () => {
    externalIdRows = [{ ownerId: 1 }, { ownerId: 2 }];

    await expect(service.upsert(baseData)).rejects.toThrow(
      MatchEventUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
  });

  it('throws when a supplied team era is not a participant of the match', async () => {
    matchTeamRows = [{ id: 100, teamEraId: 999 }];

    await expect(service.upsert(baseData)).rejects.toThrow(
      MatchEventUpsertConflictError,
    );
  });

  it('inserts only new external-id pairs on update', async () => {
    externalIdRows = [{ ownerId: 1 }];

    await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === matchEventExternalIds);
    expect(call?.values).toEqual([
      { matchEventId: 1, externalSystemId: 1, externalId: '1000-vor-td-0' },
    ]);
  });

  it('persists an administrative weather event via eventType with its weatherType payload', async () => {
    const result = await service.upsert({
      matchId: 10,
      eventType: 'weather',
      weatherType: 104,
      externalIds: [{ externalSystemId: 1, externalId: 'tp-weather-1' }],
    });

    expect(result.created).toBe(true);
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({
      matchId: 10,
      eventType: 'weather',
      actionType: null,
      weatherType: 104,
      actingPlayerId: null,
      consequencePlayerId: null,
    });
  });

  it('persists inducementsFromTreasury on an inducements event', async () => {
    await service.upsert({
      matchId: 10,
      actionType: 'inducements',
      inducementsFromTreasury: 50,
      externalIds: [{ externalSystemId: 1, externalId: 'tp-inducements-1' }],
    });

    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({
      matchId: 10,
      actionType: 'inducements',
      inducementsFromTreasury: 50,
    });
  });
});
