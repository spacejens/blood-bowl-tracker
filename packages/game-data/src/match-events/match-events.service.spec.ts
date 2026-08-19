import {
  DB,
  matchEventExternalIds,
  matchEvents,
  matchTeams,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { SppAwardValuesService } from '../spp/spp-award-values.service';
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
  let sppAwardValues: MockProxy<SppAwardValuesService>;

  beforeEach(async () => {
    externalIdRows = [];
    matchTeamRows = [{ id: 100, teamEraId: 500 }];
    insertCalls = [];
    updateCalls = [];
    sppAwardValues = mock<SppAwardValuesService>();
    sppAwardValues.resolveSppValue.mockResolvedValue(undefined);

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
      transaction: async (callback: (tx: unknown) => unknown) =>
        await callback(mockDb),
    };

    const module = await Test.createTestingModule({
      providers: [
        MatchEventsService,
        { provide: DB, useValue: mockDb },
        { provide: SppAwardValuesService, useValue: sppAwardValues },
      ],
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
      weatherType: 'perfect_conditions',
      externalIds: [{ externalSystemId: 1, externalId: 'tp-weather-1' }],
    });

    expect(result.created).toBe(true);
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({
      matchId: 10,
      eventType: 'weather',
      weatherType: 'perfect_conditions',
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

  it('omits every unsupplied optional field from the insert', async () => {
    await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === matchEvents);
    // baseData supplies matchId, actingTeamEraId, actingPlayerId, actionType
    // and nothing else — so nothing else may reach the database.
    expect(Object.keys(call?.values as object).sort()).toEqual([
      'actingMatchTeamId',
      'actingPlayerId',
      'actionType',
      'matchId',
    ]);
  });

  it('leaves unsupplied fields alone on update rather than nulling them', async () => {
    externalIdRows = [{ ownerId: 1 }];

    await service.upsert(baseData);

    const call = updateCalls.find((c) => c.table === matchEvents);
    expect(Object.keys(call?.set as object).sort()).toEqual([
      'actingMatchTeamId',
      'actingPlayerId',
      'actionType',
      'matchId',
    ]);
  });

  it('writes an explicit null through to the update so a caller can clear a field', async () => {
    externalIdRows = [{ ownerId: 1 }];

    await service.upsert({ ...baseData, winnings: null });

    const call = updateCalls.find((c) => c.table === matchEvents);
    expect(call?.set).toMatchObject({ winnings: null });
  });

  it('persists an avoided casualty with its avoided-by and prevented severity', async () => {
    await service.upsert({
      matchId: 10,
      consequenceTeamEraId: 500,
      consequenceType: 'casualty_avoided',
      consequenceAvoidedBy: 'apothecary',
      consequenceAvoidedSeverity: 'death',
      externalIds: [
        { externalSystemId: 1, externalId: '1000-vor-cas-avoided-0' },
      ],
    });

    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({
      consequenceMatchTeamId: 100,
      consequenceType: 'casualty_avoided',
      consequenceAvoidedBy: 'apothecary',
      consequenceAvoidedSeverity: 'death',
    });
  });

  it('persists an unidentified participant kind on both roles', async () => {
    await service.upsert({
      ...baseData,
      actingUnidentifiedKind: 'mercenary_or_star',
      consequenceUnidentifiedKind: 'journeyman',
    });

    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({
      actingUnidentifiedKind: 'mercenary_or_star',
      consequenceUnidentifiedKind: 'journeyman',
    });
  });

  it('writes an explicit null through for a cleared unidentified kind', async () => {
    externalIdRows = [{ ownerId: 1 }];

    await service.upsert({ ...baseData, actingUnidentifiedKind: null });

    const call = updateCalls.find((c) => c.table === matchEvents);
    expect(call?.set).toMatchObject({ actingUnidentifiedKind: null });
  });

  it('passes a supplied sppValue straight through to the insert', async () => {
    await service.upsert({ ...baseData, sppValue: 3 });

    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({ sppValue: 3 });
    expect(sppAwardValues.resolveSppValue).not.toHaveBeenCalled();
  });

  it('does not resolve an spp value when computeSppValue is not set', async () => {
    await service.upsert(baseData);

    expect(sppAwardValues.resolveSppValue).not.toHaveBeenCalled();
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(Object.keys(call?.values as object)).not.toContain('sppValue');
  });

  it('resolves and writes an spp value when computeSppValue is set', async () => {
    sppAwardValues.resolveSppValue.mockResolvedValue(3);

    await service.upsert({ ...baseData, computeSppValue: true });

    expect(sppAwardValues.resolveSppValue).toHaveBeenCalledWith({
      actingPlayerId: 9,
      actionType: 'touchdown',
    });
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({ sppValue: 3 });
  });

  it('lets an explicit sppValue win over computeSppValue', async () => {
    await service.upsert({ ...baseData, computeSppValue: true, sppValue: 5 });

    expect(sppAwardValues.resolveSppValue).not.toHaveBeenCalled();
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({ sppValue: 5 });
  });

  it('writes a null sppValue when computeSppValue is set but the event has no acting player', async () => {
    await service.upsert({
      matchId: 10,
      actionType: 'inducements',
      inducementsCost: 100,
      computeSppValue: true,
      externalIds: [{ externalSystemId: 1, externalId: 'bbl-ind-1' }],
    });

    expect(sppAwardValues.resolveSppValue).not.toHaveBeenCalled();
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({ sppValue: null });
  });

  it('writes a null sppValue when computeSppValue is set on an event with an explicit null acting player', async () => {
    await service.upsert({
      ...baseData,
      actingPlayerId: null,
      computeSppValue: true,
    });

    expect(sppAwardValues.resolveSppValue).not.toHaveBeenCalled();
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({ sppValue: null });
  });

  it('writes a null sppValue when computeSppValue is set on a consequence-only event', async () => {
    await service.upsert({
      matchId: 10,
      consequenceTeamEraId: 500,
      consequencePlayerId: 9,
      consequenceType: 'casualty',
      computeSppValue: true,
      externalIds: [{ externalSystemId: 1, externalId: 'bbl-cas-suffered-1' }],
    });

    expect(sppAwardValues.resolveSppValue).not.toHaveBeenCalled();
    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({ sppValue: null });
  });

  it('writes a null sppValue when computation was requested but the award table has no row for the event', async () => {
    sppAwardValues.resolveSppValue.mockResolvedValue(undefined);

    await service.upsert({ ...baseData, computeSppValue: true });

    const call = insertCalls.find((c) => c.table === matchEvents);
    expect(call?.values).toMatchObject({ sppValue: null });
  });

  it('clears a stale sppValue on update when a re-import finds no award for the event', async () => {
    externalIdRows = [{ ownerId: 1 }];
    sppAwardValues.resolveSppValue.mockResolvedValue(undefined);

    await service.upsert({ ...baseData, computeSppValue: true });

    const call = updateCalls.find((c) => c.table === matchEvents);
    expect(call?.set).toMatchObject({ sppValue: null });
  });

  describe('death/foul action-type invariant', () => {
    it('throws when a death consequence is paired with an unrelated action type', async () => {
      await expect(
        service.upsert({
          matchId: 10,
          consequenceTeamEraId: 500,
          consequencePlayerId: 9,
          actionType: 'casualty',
          consequenceType: 'death',
          externalIds: [{ externalSystemId: 1, externalId: 'bbl-death-1' }],
        }),
      ).rejects.toThrow(MatchEventUpsertConflictError);
      expect(insertCalls).toHaveLength(0);
    });

    it("accepts a death consequence paired with actionType 'death'", async () => {
      await expect(
        service.upsert({
          matchId: 10,
          consequenceTeamEraId: 500,
          consequencePlayerId: 9,
          actionType: 'death',
          consequenceType: 'death',
          externalIds: [{ externalSystemId: 1, externalId: 'bbl-death-2' }],
        }),
      ).resolves.toBeDefined();
    });

    it("accepts a death consequence paired with actionType 'foul'", async () => {
      await expect(
        service.upsert({
          matchId: 10,
          consequenceTeamEraId: 500,
          consequencePlayerId: 9,
          actionType: 'foul',
          consequenceType: 'death',
          externalIds: [{ externalSystemId: 1, externalId: 'bbl-death-3' }],
        }),
      ).resolves.toBeDefined();
    });

    it('does not validate a non-death consequenceType regardless of actionType', async () => {
      await expect(
        service.upsert({
          matchId: 10,
          consequenceTeamEraId: 500,
          consequencePlayerId: 9,
          actionType: 'casualty',
          consequenceType: 'casualty',
          externalIds: [{ externalSystemId: 1, externalId: 'bbl-cas-1' }],
        }),
      ).resolves.toBeDefined();
    });

    it('does not validate when actionType is left unsupplied on an update', async () => {
      externalIdRows = [{ ownerId: 1 }];

      await expect(
        service.upsert({
          matchId: 10,
          consequenceTeamEraId: 500,
          consequencePlayerId: 9,
          consequenceType: 'death',
          externalIds: [{ externalSystemId: 1, externalId: 'bbl-death-4' }],
        }),
      ).resolves.toBeDefined();
    });
  });
});
