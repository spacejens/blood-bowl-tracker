import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PlayerSkillsImportService,
  SkillsImportService,
} from '@blood-bowl-tracker/import';
import type {
  TpPlayerSkills,
  TpSkillMaster,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpSkillResolverService } from '../skills/tp-skill-resolver.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpPlayerSkillsImportService } from './tp-player-skills-import.service';

/** The external system ids every test's bootstrap mock answers with. */
const TP_SYSTEM_ID = 11;
const NAME_SYSTEM_ID = 22;

/**
 * The real `SkillsImportService.upsert` resolved shape (see
 * `createUpsertImportServiceBase` and `SkillSchema`), not a two-field
 * placeholder -- `id`, `name`, `createdAt` and `created` are all present on
 * every real response.
 */
function upserted(id: number, name: string) {
  return { id, name, createdAt: new Date(0), created: false };
}

/** A minimal `TpPlayerSkills` with only what one test needs supplied. */
function makeSkills(overrides: Partial<TpPlayerSkills> = {}): TpPlayerSkills {
  return { starting: [], gained: [], ...overrides };
}

describe('TpPlayerSkillsImportService', () => {
  let service: TpPlayerSkillsImportService;
  let skillsImport: MockProxy<SkillsImportService>;
  let playerSkills: MockProxy<PlayerSkillsImportService>;
  let bootstrap: MockProxy<ExternalSystemBootstrapService>;
  let externalSystemName: MockProxy<ExternalSystemNameConfigService>;
  let nameExternalId: MockProxy<NameExternalIdService>;
  let skillResolver: MockProxy<TpSkillResolverService>;

  beforeEach(async () => {
    skillsImport = mock<SkillsImportService>();
    playerSkills = mock<PlayerSkillsImportService>();
    bootstrap = mock<ExternalSystemBootstrapService>();
    externalSystemName = mock<ExternalSystemNameConfigService>();
    nameExternalId = mock<NameExternalIdService>();
    skillResolver = mock<TpSkillResolverService>();
    bootstrap.bootstrap.mockResolvedValue({
      ok: true,
      ids: [TP_SYSTEM_ID, NAME_SYSTEM_ID],
    });
    externalSystemName.getTpSystemName.mockReturnValue('tourplay.net');
    nameExternalId.forSkill.mockImplementation(
      (name: string) => `skill:${name}`,
    );
    skillResolver.collectSkillMasterIds.mockImplementation(
      (skillMastersByMasterId: Map<number, TpSkillMaster>) => {
        const byName = new Map<string, Set<number>>();
        for (const [skillMasterId, master] of skillMastersByMasterId) {
          let ids = byName.get(master.name);
          if (ids === undefined) {
            ids = new Set();
            byName.set(master.name, ids);
          }
          ids.add(skillMasterId);
        }
        return byName;
      },
    );
    skillResolver.resolveUnnamedMasterIds.mockResolvedValue(new Map());
    playerSkills.syncPlayerSkills.mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPlayerSkillsImportService,
        { provide: SkillsImportService, useValue: skillsImport },
        { provide: PlayerSkillsImportService, useValue: playerSkills },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        {
          provide: ExternalSystemNameConfigService,
          useValue: externalSystemName,
        },
        { provide: NameExternalIdService, useValue: nameExternalId },
        { provide: TpSkillResolverService, useValue: skillResolver },
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(TpPlayerSkillsImportService);
  });

  /** The tourplay.net external id a scanned skillMasterId self-registers. */
  function tpId(skillMasterId: number) {
    return {
      externalSystemId: TP_SYSTEM_ID,
      externalId: String(skillMasterId),
    };
  }

  /** The Name external id every upserted skill also carries. */
  function nameId(name: string) {
    return { externalSystemId: NAME_SYSTEM_ID, externalId: `skill:${name}` };
  }

  it('records a template skill as starting with no advancement order', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Dodge'));
    playerSkills.syncPlayerSkills.mockResolvedValue(1);

    const { result } = await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [5, makeSkills({ starting: [{ skillMasterId: 87 }] })],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
    });

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
    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
  });

  it("records a player's own skill as chosen when TP says it was not random", async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));

    await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [5, makeSkills({ gained: [{ skillMasterId: 220, isRandom: false }] })],
      ]),
      skillMastersByMasterId: new Map([
        [220, { name: 'Block', isElite: false }],
      ]),
    });

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        {
          playerId: 5,
          skillId: 100,
          source: 'chosen',
          attributeValue: null,
          advancementOrder: 1,
        },
      ],
      expect.anything(),
    );
  });

  it("records a player's own skill as random when TP says it was", async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Block'));

    await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [5, makeSkills({ gained: [{ skillMasterId: 220, isRandom: true }] })],
      ]),
      skillMastersByMasterId: new Map([
        [220, { name: 'Block', isElite: false }],
      ]),
    });

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        {
          playerId: 5,
          skillId: 100,
          source: 'random',
          attributeValue: null,
          advancementOrder: 1,
        },
      ],
      expect.anything(),
    );
  });

  it('numbers gained skills 1-based by their array position', async () => {
    skillsImport.upsert.mockImplementation((data) => {
      const name = data.name ?? '';
      return Promise.resolve(upserted(name === 'Block' ? 100 : 101, name));
    });

    await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [
          5,
          makeSkills({
            gained: [
              { skillMasterId: 220, isRandom: false },
              { skillMasterId: 221, isRandom: true },
            ],
          }),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [220, { name: 'Block', isElite: false }],
        [221, { name: 'Dodge', isElite: false }],
      ]),
    });

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        expect.objectContaining({ skillId: 100, advancementOrder: 1 }),
        expect.objectContaining({ skillId: 101, advancementOrder: 2 }),
      ],
      expect.anything(),
    );
  });

  it('composes a type 0/1/2 attribute value straight onto the entry', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Mighty Blow'));

    await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [
          5,
          makeSkills({
            starting: [
              { skillMasterId: 42, attributeValue: '+1', attributeType: 1 },
            ],
          }),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [42, { name: 'Mighty Blow', isElite: false }],
      ]),
    });

    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        {
          playerId: 5,
          skillId: 100,
          source: 'starting',
          attributeValue: '+1',
        },
      ],
      expect.anything(),
    );
  });

  it("decodes a type-3 attribute through the resolver's own table", async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Hatred'));
    skillResolver.decodeTypeThreeTarget.mockReturnValue('Undead');

    await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [
          5,
          makeSkills({
            starting: [
              { skillMasterId: 307, attributeValue: '110', attributeType: 3 },
            ],
          }),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [307, { name: 'Hatred', isElite: false }],
      ]),
    });

    expect(skillResolver.decodeTypeThreeTarget).toHaveBeenCalledWith(
      307,
      '110',
    );
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        {
          playerId: 5,
          skillId: 100,
          source: 'starting',
          attributeValue: 'Undead',
        },
      ],
      expect.anything(),
    );
  });

  it('drops a skill whose type-3 code cannot be decoded and records one error per code', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Animosity'));
    skillResolver.decodeTypeThreeTarget.mockReturnValue(undefined);

    const { result } = await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [
          5,
          makeSkills({
            starting: [
              {
                skillMasterId: 269,
                attributeValue: '54321',
                attributeType: 3,
              },
            ],
          }),
        ],
        [
          6,
          makeSkills({
            starting: [
              {
                skillMasterId: 269,
                attributeValue: '54321',
                attributeType: 3,
              },
            ],
          }),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [269, { name: 'Animosity', isElite: false }],
      ]),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('269');
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [],
      result.errors,
    );
  });

  it('drops a skillMasterId nothing can name and records one error per id', async () => {
    const { result } = await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [5, makeSkills({ starting: [{ skillMasterId: 999_999 }] })],
        [6, makeSkills({ starting: [{ skillMasterId: 999_999 }] })],
      ]),
      skillMastersByMasterId: new Map(),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('999999');
    expect(skillsImport.upsert).not.toHaveBeenCalled();
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [],
      result.errors,
    );
  });

  it('drops a gained skill nothing can name and keeps numbering off the survivors', async () => {
    const { result } = await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [
          5,
          makeSkills({
            gained: [{ skillMasterId: 999_999, isRandom: false }],
          }),
        ],
      ]),
      skillMastersByMasterId: new Map(),
    });

    expect(result.errors).toHaveLength(1);
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [],
      result.errors,
    );
  });

  it('resolves a skillMasterId no downloaded file names through its curated tourplay.net external id', async () => {
    skillResolver.resolveUnnamedMasterIds.mockResolvedValue(
      new Map([[181, 77]]),
    );

    await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [5, makeSkills({ starting: [{ skillMasterId: 181 }] })],
      ]),
      skillMastersByMasterId: new Map(),
    });

    expect(skillResolver.resolveUnnamedMasterIds).toHaveBeenCalledWith({
      masterIds: new Set([181]),
      tpSystemId: TP_SYSTEM_ID,
    });
    expect(skillsImport.upsert).not.toHaveBeenCalled();
    expect(playerSkills.syncPlayerSkills).toHaveBeenCalledWith(
      [
        {
          playerId: 5,
          skillId: 77,
          source: 'starting',
          attributeValue: null,
        },
      ],
      expect.anything(),
    );
  });

  it('registers every scanned master id for a name as tourplay.net external ids', async () => {
    skillsImport.upsert.mockResolvedValue(upserted(100, 'Dodge'));

    await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [5, makeSkills({ starting: [{ skillMasterId: 87 }] })],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
        [188, { name: 'Dodge', isElite: false }],
      ]),
    });

    expect(skillsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Dodge',
        externalIds: [nameId('Dodge'), tpId(87), tpId(188)],
      },
      expect.anything(),
    );
  });

  it('sends nothing when no player carried a skill group', async () => {
    const { result } = await service.syncPlayerSkills({
      skillsByPlayerId: new Map(),
      skillMastersByMasterId: new Map(),
    });

    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.success).toBe(true);
  });

  it('records the bootstrap failure and writes nothing without a TP system id', async () => {
    bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: { item: {}, message: 'no tp system' },
    });

    const { result } = await service.syncPlayerSkills({
      skillsByPlayerId: new Map([
        [5, makeSkills({ starting: [{ skillMasterId: 87 }] })],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
    });

    expect(playerSkills.syncPlayerSkills).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
