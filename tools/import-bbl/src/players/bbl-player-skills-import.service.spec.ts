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

/**
 * The real `SkillsImportService.upsert` resolved shape (see
 * `createUpsertImportServiceBase` and `SkillSchema`), not a two-field
 * placeholder -- `id`, `name`, `createdAt` and `created` are all present on
 * every real response.
 */
function upserted(id: number, name: string) {
  return { id, name, createdAt: new Date(0), created: false };
}

describe('BblPlayerSkillsImportService', () => {
  let service: BblPlayerSkillsImportService;
  let skillsImport: MockProxy<SkillsImportService>;
  let playerSkills: MockProxy<PlayerSkillsImportService>;
  let bootstrap: MockProxy<ExternalSystemBootstrapService>;
  let nameExternalId: MockProxy<NameExternalIdService>;

  beforeEach(async () => {
    skillsImport = mock<SkillsImportService>();
    playerSkills = mock<PlayerSkillsImportService>();
    bootstrap = mock<ExternalSystemBootstrapService>();
    nameExternalId = mock<NameExternalIdService>();
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [42] });
    nameExternalId.forSkill.mockImplementation(
      (name: string) => `skill:${name}`,
    );
    playerSkills.syncPlayerSkills.mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerSkillsImportService,
        { provide: SkillsImportService, useValue: skillsImport },
        { provide: PlayerSkillsImportService, useValue: playerSkills },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        { provide: NameExternalIdService, useValue: nameExternalId },
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(BblPlayerSkillsImportService);
  });

  it('upserts each distinct skill name once under its Name external id', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));

    await service.syncPlayerSkills(
      new Map([
        [1, [{ name: 'Block', source: 'starting' as const }]],
        [2, [{ name: 'Block', source: 'starting' as const }]],
      ]),
    );

    expect(skillsImport.upsert).toHaveBeenCalledTimes(1);
    expect(skillsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Block',
        externalIds: [{ externalSystemId: 42, externalId: 'skill:Block' }],
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
          [
            {
              name: 'Mighty Blow',
              attributeValue: '+1',
              source: 'advancement' as const,
              advancementOrder: 2,
            },
          ],
        ],
      ]),
    );

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        {
          playerId: 5,
          skillId: 100,
          source: 'advancement',
          attributeValue: '+1',
          advancementOrder: 2,
        },
      ],
      expect.anything(),
    );
    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
  });

  it('sends a starting entry with a null attribute value and no order', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));

    await service.syncPlayerSkills(
      new Map([[5, [{ name: 'Block', source: 'starting' as const }]]]),
    );

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        {
          playerId: 5,
          skillId: 100,
          source: 'starting',
          attributeValue: null,
        },
      ],
      expect.anything(),
    );
  });

  it('skips a skill whose upsert failed, without retrying it per player', async () => {
    skillsImport.upsert.mockResolvedValue(undefined);

    const { result } = await service.syncPlayerSkills(
      new Map([
        [1, [{ name: 'Block', source: 'starting' as const }]],
        [2, [{ name: 'Block', source: 'starting' as const }]],
      ]),
    );

    expect(skillsImport.upsert).toHaveBeenCalledTimes(1);
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [],
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
      new Map([[1, [{ name: 'Block', source: 'starting' as const }]]]),
    );

    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('sends nothing when no player had any skills', async () => {
    const { result } = await service.syncPlayerSkills(new Map());

    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.success).toBe(true);
  });
});
