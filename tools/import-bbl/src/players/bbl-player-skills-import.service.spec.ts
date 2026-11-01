import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PlayerSkillsImportService,
  SkillsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPlayerSkillsImportService } from './bbl-player-skills-import.service';
import type {
  BblPlayerAdvancements,
  BblPlayerSkillRef,
} from './player-page-parser';

/**
 * The real `SkillsImportService.upsert` resolved shape (see
 * `createUpsertImportServiceBase` and `SkillSchema`), not a two-field
 * placeholder -- `id`, `name`, `createdAt` and `created` are all present on
 * every real response.
 */
function withSkills(skills: BblPlayerSkillRef[]): BblPlayerAdvancements {
  return { skills, characteristicIncreases: [] };
}

function upserted(id: number, name: string) {
  return { id, name, createdAt: new Date(0), created: false };
}

describe('BblPlayerSkillsImportService', () => {
  let service: BblPlayerSkillsImportService;
  let skillsImport: MockProxy<SkillsImportService>;
  let playerSkills: MockProxy<PlayerSkillsImportService>;
  let bootstrap: MockProxy<ExternalSystemBootstrapService>;

  beforeEach(async () => {
    skillsImport = mock<SkillsImportService>();
    playerSkills = mock<PlayerSkillsImportService>();
    bootstrap = mock<ExternalSystemBootstrapService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [42] });
    playerSkills.syncPlayerSkills.mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerSkillsImportService,
        { provide: SkillsImportService, useValue: skillsImport },
        { provide: PlayerSkillsImportService, useValue: playerSkills },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        // `NameExternalIdService` is pure and dependency-free — no
        // constructor, no injected collaborators, no I/O, just identity
        // formatting — so passing the real instance carries none of the
        // coupling risk the "never pass a real collaborator" rule guards
        // against, and this spec contains no copy of its formatting logic to
        // drift from it. Its own behavior is covered in isolation by
        // `name-external-id.service.spec.ts`.
        NameExternalIdService,
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(BblPlayerSkillsImportService);
  });

  it('upserts each distinct skill name once under its Name external id', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));

    await service.syncPlayerSkills(
      new Map([
        [1, withSkills([{ name: 'Block', source: 'starting' as const }])],
        [2, withSkills([{ name: 'Block', source: 'starting' as const }])],
      ]),
    );

    expect(skillsImport.upsert).toHaveBeenCalledTimes(1);
    expect(skillsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Block',
        externalIds: [{ externalSystemId: 42, externalId: 'Block' }],
      },
      expect.anything(),
    );
  });

  it('sends one entry per player skill, carrying source, attribute and order', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Mighty Blow'));
    playerSkills.syncPlayerSkills.mockResolvedValue(1);

    const { result } = await service.syncPlayerSkills(
      new Map([
        [
          5,
          withSkills([
            {
              name: 'Mighty Blow',
              attributeValue: '+1',
              source: 'advancement' as const,
              advancementOrder: 2,
            },
          ]),
        ],
      ]),
    );

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      {
        entries: [
          {
            playerId: 5,
            skillId: 100,
            source: 'advancement',
            attributeValue: '+1',
            advancementOrder: 2,
          },
        ],
        characteristicPlayerIds: [5],
      },
      expect.anything(),
    );
    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
  });

  it('sends a starting entry with a null attribute value and no order', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));

    await service.syncPlayerSkills(
      new Map([
        [5, withSkills([{ name: 'Block', source: 'starting' as const }])],
      ]),
    );

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      {
        entries: [
          {
            playerId: 5,
            skillId: 100,
            source: 'starting',
            attributeValue: null,
          },
        ],
        characteristicPlayerIds: [5],
      },
      expect.anything(),
    );
  });

  it('skips a skill whose upsert failed, without retrying it per player', async () => {
    skillsImport.upsert.mockResolvedValue(undefined);

    const { result } = await service.syncPlayerSkills(
      new Map([
        [1, withSkills([{ name: 'Block', source: 'starting' as const }])],
        [2, withSkills([{ name: 'Block', source: 'starting' as const }])],
      ]),
    );

    expect(skillsImport.upsert).toHaveBeenCalledTimes(1);
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      { entries: [], characteristicPlayerIds: [1, 2] },
      expect.anything(),
    );
    expect(result.errors).toEqual([]);
  });

  it('records the bootstrap failure and writes nothing when the Name system cannot be resolved', async () => {
    bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: { item: {}, message: 'no name system' },
    });

    const { result } = await service.syncPlayerSkills(
      new Map([
        [1, withSkills([{ name: 'Block', source: 'starting' as const }])],
      ]),
    );

    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('reports a player whose skill upsert failed as incomplete, and only that player', async () => {
    skillsImport.upsert.mockImplementation((skill) =>
      Promise.resolve(
        skill.name === 'Block' ? undefined : upserted(101, 'Dodge'),
      ),
    );

    const { incompletePlayerIds } = await service.syncPlayerSkills(
      new Map([
        [
          1,
          withSkills([
            { name: 'Block', source: 'starting' as const },
            { name: 'Dodge', source: 'advancement' as const },
          ]),
        ],
        [2, withSkills([{ name: 'Dodge', source: 'advancement' as const }])],
      ]),
    );

    expect(incompletePlayerIds).toEqual(new Set([1]));
  });

  it('reports no player as incomplete when every skill was written', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));
    playerSkills.syncPlayerSkills.mockResolvedValue(2);

    const { incompletePlayerIds } = await service.syncPlayerSkills(
      new Map([
        [1, withSkills([{ name: 'Block', source: 'starting' as const }])],
        [2, withSkills([{ name: 'Block', source: 'starting' as const }])],
      ]),
    );

    expect(incompletePlayerIds).toEqual(new Set());
  });

  it('reports every player as incomplete when the Name system cannot be resolved', async () => {
    bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: { item: {}, message: 'no name system' },
    });

    const { incompletePlayerIds } = await service.syncPlayerSkills(
      new Map([
        [1, withSkills([{ name: 'Block', source: 'starting' as const }])],
        [2, withSkills([{ name: 'Block', source: 'starting' as const }])],
      ]),
    );

    expect(incompletePlayerIds).toEqual(new Set([1, 2]));
  });

  it('reports every player as incomplete when a skill sync chunk failed', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));
    // The shared sync records a failed chunk as an error and cannot say which
    // players were in it.
    playerSkills.syncPlayerSkills.mockImplementation((_batch, errors) => {
      errors.push({ item: { playerSkills: 1 }, message: 'chunk failed' });
      return Promise.resolve(0);
    });

    const { incompletePlayerIds } = await service.syncPlayerSkills(
      new Map([
        [1, withSkills([{ name: 'Block', source: 'starting' as const }])],
        [2, withSkills([{ name: 'Block', source: 'starting' as const }])],
      ]),
    );

    expect(incompletePlayerIds).toEqual(new Set([1, 2]));
  });

  it('sends nothing when no player had any skills', async () => {
    const { result } = await service.syncPlayerSkills(new Map());

    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.success).toBe(true);
  });

  it('sends characteristic increases after the skills, and lists the player', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Dodge'));

    await service.syncPlayerSkills(
      new Map([
        [
          1,
          {
            skills: [
              {
                name: 'Dodge',
                source: 'advancement' as const,
                advancementOrder: 1,
              },
            ],
            characteristicIncreases: [
              { characteristic: 'AG' as const, advancementOrder: 2 },
            ],
          },
        ],
      ]),
    );

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      {
        entries: [
          {
            playerId: 1,
            skillId: 100,
            source: 'advancement',
            attributeValue: null,
            advancementOrder: 1,
          },
          {
            playerId: 1,
            source: 'characteristic',
            characteristic: 'AG',
            advancementOrder: 2,
          },
        ],
        characteristicPlayerIds: [1],
      },
      expect.anything(),
    );
  });

  it('still lists a player with no skills and no increases', async () => {
    await service.syncPlayerSkills(new Map([[4, withSkills([])]]));

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      { entries: [], characteristicPlayerIds: [4] },
      expect.anything(),
    );
  });
});
