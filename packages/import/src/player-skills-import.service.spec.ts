import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
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
    stubImportRunner(runner);
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSkillsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(PlayerSkillsImportService);
  });

  it('sends nothing and reports nothing for an empty list', async () => {
    const synced = await service.syncPlayerSkills([], errors);

    expect(synced).toBe(0);
    expect(client.playerSkills.sync).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('forwards the entries and returns how many were synced', async () => {
    client.playerSkills.sync.mockResolvedValue({
      playerSkillIds: [51, 52],
    });

    const synced = await service.syncPlayerSkills(
      [entry(), entry({ skillId: 11, source: 'chosen', advancementOrder: 1 })],
      errors,
    );

    expect(synced).toBe(2);
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [
        entry(),
        entry({ skillId: 11, source: 'chosen', advancementOrder: 1 }),
      ],
    });
    expect(errors).toEqual([]);
  });

  it('drops a duplicate natural key, keeping the gained entry over the starting one', async () => {
    client.playerSkills.sync.mockResolvedValue({ playerSkillIds: [51] });

    const synced = await service.syncPlayerSkills(
      [
        entry({ source: 'starting' }),
        entry({ source: 'advancement', advancementOrder: 2 }),
      ],
      errors,
    );

    expect(synced).toBe(1);
    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'advancement', advancementOrder: 2 })],
    });
    expect(errors).toEqual([]);
  });

  it('keeps the lower advancement order when two gained entries share a natural key', async () => {
    client.playerSkills.sync.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        entry({ source: 'chosen', advancementOrder: 3 }),
        entry({ source: 'chosen', advancementOrder: 1 }),
      ],
      errors,
    );

    expect(client.playerSkills.sync).toHaveBeenCalledWith({
      entries: [entry({ source: 'chosen', advancementOrder: 1 })],
    });
  });

  it('treats a missing attributeValue and an explicit null as the same key', async () => {
    client.playerSkills.sync.mockResolvedValue({ playerSkillIds: [51] });

    await service.syncPlayerSkills(
      [
        { playerId: 1, skillId: 10, source: 'starting' },
        entry({ source: 'starting', attributeValue: null }),
      ],
      errors,
    );

    expect(client.playerSkills.sync).toHaveBeenCalledTimes(1);
    const [call] = client.playerSkills.sync.mock.calls;
    expect(call[0].entries).toHaveLength(1);
  });

  it('keeps two entries of the same skill that carry different attribute values', async () => {
    client.playerSkills.sync.mockResolvedValue({
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

    const [call] = client.playerSkills.sync.mock.calls;
    expect(call[0].entries).toHaveLength(2);
  });

  it('sends entries in chunks of the configured size', async () => {
    client.playerSkills.sync.mockResolvedValue({ playerSkillIds: [] });
    const many = Array.from({ length: 501 }, (_value, index) =>
      entry({ skillId: index + 1 }),
    );

    const synced = await service.syncPlayerSkills(many, errors);

    expect(client.playerSkills.sync).toHaveBeenCalledTimes(2);
    expect(client.playerSkills.sync.mock.calls[0][0].entries).toHaveLength(500);
    expect(client.playerSkills.sync.mock.calls[1][0].entries).toHaveLength(1);
    expect(synced).toBe(501);
  });

  it('records a non-fatal error naming the chunk size when a chunk fails', async () => {
    client.playerSkills.sync.mockRejectedValue(new Error('boom'));

    const synced = await service.syncPlayerSkills([entry()], errors);

    expect(synced).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('1 player skill');
    expect(errors[0].message).toContain('boom');
  });

  it('stringifies a non-Error rejection from the call', async () => {
    client.playerSkills.sync.mockRejectedValue('nope');

    await service.syncPlayerSkills([entry()], errors);

    expect(errors[0].message).toContain('nope');
  });
});
