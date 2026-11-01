import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { PlayerSkillsImportService } from './player-skills-import.service';
import type { ImportError } from './types';

function entry(overrides: Partial<PlayerSkillEntry> = {}): PlayerSkillEntry {
  return {
    playerId: 1,
    skillId: 10,
    source: 'starting',
    attributeValue: null,
    ...overrides,
  };
}

describe('PlayerSkillsImportService', () => {
  let service: PlayerSkillsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;
  let errors: ImportError[];

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSkillsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(PlayerSkillsImportService);
  });

  it('sends nothing and reports nothing for an empty list', async () => {
    const synced = await service.syncPlayerSkills([], errors);

    expect(synced).toBe(0);
    expect(runner.recordUpsertResult).not.toHaveBeenCalled();
  });

  it('keeps a merged entry free when any duplicate of it was free', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        entry({ source: 'chosen', advancementOrder: 1 }),
        entry({ source: 'chosen', advancementOrder: 3, isFreeExtra: true }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [
        entry({ source: 'chosen', advancementOrder: 1, isFreeExtra: true }),
      ],
    });
  });

  it('forwards the entries and returns how many were synced', async () => {
    runner.recordUpsertResult.mockResolvedValue({
      playerSkillIds: [51, 52],
    });

    const synced = await service.syncPlayerSkills(
      [entry(), entry({ skillId: 11, source: 'chosen', advancementOrder: 1 })],
      errors,
    );

    expect(synced).toBe(2);
    const options = recordUpsertResultOptions(runner);
    expect(options.item).toEqual({ playerSkills: 2 });
    expect(options.errors).toBe(errors);
    await options.upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [
        entry(),
        entry({ skillId: 11, source: 'chosen', advancementOrder: 1 }),
      ],
    });
  });

  it('drops a duplicate natural key, keeping the gained entry over the starting one', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    const synced = await service.syncPlayerSkills(
      [
        entry({ source: 'starting' }),
        entry({ source: 'advancement', advancementOrder: 2 }),
      ],
      errors,
    );

    expect(synced).toBe(1);
    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'advancement', advancementOrder: 2 })],
    });
  });

  it('keeps the lower advancement order when two gained entries share a natural key', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        entry({ source: 'chosen', advancementOrder: 3 }),
        entry({ source: 'chosen', advancementOrder: 1 }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'chosen', advancementOrder: 1 })],
    });
  });

  it('drops a starting candidate that arrives after an existing gained entry', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        entry({ source: 'chosen', advancementOrder: 1 }),
        entry({ source: 'starting' }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'chosen', advancementOrder: 1 })],
    });
  });

  it('drops a gained candidate with no advancement order of its own', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        entry({ source: 'chosen', advancementOrder: 1 }),
        entry({ source: 'random' }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'chosen', advancementOrder: 1 })],
    });
  });

  it('keeps a gained candidate that replaces an existing gained entry which also has no advancement order', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        entry({ source: 'random' }),
        entry({ source: 'chosen', advancementOrder: 5 }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'chosen', advancementOrder: 5 })],
    });
  });

  it('drops a gained candidate whose advancement order is equal to or greater than the existing one', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        entry({ source: 'chosen', advancementOrder: 1 }),
        entry({ source: 'chosen', advancementOrder: 1 }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'chosen', advancementOrder: 1 })],
    });

    await service.syncPlayerSkills(
      [
        entry({ source: 'chosen', advancementOrder: 1 }),
        entry({ source: 'chosen', advancementOrder: 2 }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner, 1).upsert();
    expect(client.playerSkills.sync.mock.calls[1][0]).toEqual({
      entries: [entry({ source: 'chosen', advancementOrder: 1 })],
    });
  });

  it('treats a missing attributeValue and an explicit null as the same key', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        { playerId: 1, skillId: 10, source: 'starting' },
        entry({ source: 'starting', attributeValue: null }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    expect(client.playerSkills.sync).toHaveBeenCalledTimes(1);
    const [call] = client.playerSkills.sync.mock.calls;
    expect(call[0].entries).toHaveLength(1);
  });

  it('keeps two entries of the same skill that carry different attribute values', async () => {
    runner.recordUpsertResult.mockResolvedValue({
      playerSkillIds: [51, 52],
    });

    await service.syncPlayerSkills(
      [
        entry({
          source: 'chosen',
          attributeValue: 'Dwarf',
          advancementOrder: 1,
        }),
        entry({
          source: 'chosen',
          attributeValue: 'Goblin',
          advancementOrder: 2,
        }),
      ],
      errors,
    );

    await recordUpsertResultOptions(runner).upsert();
    const [call] = client.playerSkills.sync.mock.calls;
    expect(call[0].entries).toHaveLength(2);
  });

  it('sends entries in chunks of the configured size', async () => {
    runner.recordUpsertResult.mockResolvedValue({ playerSkillIds: [] });
    const many = Array.from({ length: 501 }, (_value, index) =>
      entry({ skillId: index + 1 }),
    );

    const synced = await service.syncPlayerSkills(many, errors);

    expect(runner.recordUpsertResult).toHaveBeenCalledTimes(2);
    expect(recordUpsertResultOptions(runner, 0).item).toEqual({
      playerSkills: 500,
    });
    expect(recordUpsertResultOptions(runner, 1).item).toEqual({
      playerSkills: 1,
    });
    expect(synced).toBe(501);
  });

  it('counts only the chunks the runner reports as synced', async () => {
    runner.recordUpsertResult
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ playerSkillIds: [] });
    const many = Array.from({ length: 501 }, (_value, index) =>
      entry({ skillId: index + 1 }),
    );

    const synced = await service.syncPlayerSkills(many, errors);

    expect(synced).toBe(1);
  });

  it('builds a failure message naming the chunk size', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const synced = await service.syncPlayerSkills([entry()], errors);

    expect(synced).toBe(0);
    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('boom'))).toBe(
      'Failed to sync 1 player skill(s): boom',
    );
  });

  it('stringifies a non-Error rejection from the call', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.syncPlayerSkills([entry()], errors);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage('nope')).toBe(
      'Failed to sync 1 player skill(s): nope',
    );
  });
});
