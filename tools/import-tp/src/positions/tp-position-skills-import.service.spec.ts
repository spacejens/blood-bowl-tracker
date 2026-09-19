import {
  ExternalSystemBootstrapService,
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpSkillResolverService } from '../skills/tp-skill-resolver.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpPositionSkillsImportService } from './tp-position-skills-import.service';

/** The external system id every test's bootstrap mock answers with. */
const TP_SYSTEM_ID = 11;

describe('TpPositionSkillsImportService', () => {
  let service: TpPositionSkillsImportService;
  let startingSkills: MockProxy<StartingSkillsImportService>;
  let importResults: MockProxy<ImportResultService>;
  let bootstrap: MockProxy<ExternalSystemBootstrapService>;
  let externalSystemName: MockProxy<ExternalSystemNameConfigService>;
  let skillResolver: MockProxy<TpSkillResolverService>;

  beforeEach(async () => {
    startingSkills = mock<StartingSkillsImportService>();
    importResults = mock<ImportResultService>();
    bootstrap = mock<ExternalSystemBootstrapService>();
    externalSystemName = mock<ExternalSystemNameConfigService>();
    skillResolver = mock<TpSkillResolverService>();
    importResults.error.mockImplementation((error) => error);
    importResults.result.mockImplementation(({ imported, errors }) => ({
      success: errors.length === 0,
      imported,
      errors,
    }));
    bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [TP_SYSTEM_ID] });
    externalSystemName.getTpSystemName.mockReturnValue('tourplay.net');
    // No curated tourplay.net id answers, unless a test says otherwise: an
    // index with no entry reads as undefined, i.e. "not found".
    skillResolver.resolveUnnamedMasterIds.mockResolvedValue(new Map());
    // decodeTypeThreeTarget's default mock behavior (undefined) already
    // matches "the opaque code is not explained"; tests where a code IS
    // explained set their own canned mockReturnValue.
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPositionSkillsImportService,
        { provide: StartingSkillsImportService, useValue: startingSkills },
        { provide: ImportResultService, useValue: importResults },
        { provide: ExternalSystemBootstrapService, useValue: bootstrap },
        {
          provide: ExternalSystemNameConfigService,
          useValue: externalSystemName,
        },
        { provide: TpSkillResolverService, useValue: skillResolver },
      ],
    }).compile();
    service = moduleRef.get(TpPositionSkillsImportService);
  });

  /** The tourplay.net external id a scanned skillMasterId self-registers. */
  function tpId(skillMasterId: number) {
    return {
      externalSystemId: TP_SYSTEM_ID,
      externalId: String(skillMasterId),
    };
  }

  // The resolver is fully mocked in this spec, so the catalogue's actual
  // content never matters here -- only that a catalogue is threaded through
  // to `decodeTypeThreeTarget`. Real code-to-keyword resolution is covered by
  // TpSkillResolverService's own spec.
  const catalog = { byCode: new Map() };

  it('resolves each id to its name and keeps the attribute value separate', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(2);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([
        ['Dodge', new Set([87])],
        ['Loner', new Set([154])],
      ]),
    );

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [
                { skillMasterId: 87 },
                { skillMasterId: 154, attributeValue: '4+' },
              ],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
        [154, { name: 'Loner', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(result.imported).toBe(2);
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [
                { name: 'Dodge', isElite: false, externalIds: [tpId(87)] },
                {
                  name: 'Loner',
                  attributeValue: '4+',
                  isElite: false,
                  externalIds: [tpId(154)],
                },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[7, 'BB2020']]),
      [],
    );
  });

  it('keeps a numeric-bonus attribute value separate from the name too', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Mighty Blow', new Set([42])]]),
    );

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 42, attributeValue: '+1' }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [42, { name: 'Mighty Blow', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(result.imported).toBe(1);
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [
                {
                  name: 'Mighty Blow',
                  attributeValue: '+1',
                  isElite: false,
                  externalIds: [tpId(42)],
                },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[7, 'BB2020']]),
      [],
    );
  });

  it('records an error for an unresolvable id and keeps the rest of the list', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Dodge', new Set([87])]]),
    );

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 87 }, { skillMasterId: 999 }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [7, [{ name: 'Dodge', isElite: false, externalIds: [tpId(87)] }]],
          ]),
        ],
      ]),
      new Map([[7, 'BB2020']]),
      expect.any(Array),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('999');
    expect(result.errors[0].message).toContain('Blocker');
  });

  it('records an error naming the rules set alongside the position', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 999 }]]])],
      ]),
      skillMastersByMasterId: new Map(),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(result.errors[0].message).toContain('rules set "BB2020"');
    expect(result.errors[0].message).toContain('position "Blocker"');
  });

  it('falls back to bare ids when a position or rules set name is not mapped', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 999 }]]])],
      ]),
      skillMastersByMasterId: new Map(),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(result.errors[0].message).toContain('rules set "id 7"');
    expect(result.errors[0].message).toContain('position "id 3"');
  });

  it('excludes a type-3 opaque attribute code and reports it, without blocking other skills', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Dodge', new Set([87])]]),
    );

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [
                { skillMasterId: 87 },
                {
                  skillMasterId: 269,
                  attributeValue: '54321',
                  attributeType: 3,
                },
              ],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
        [269, { name: 'Animosity', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [7, [{ name: 'Dodge', isElite: false, externalIds: [tpId(87)] }]],
          ]),
        ],
      ]),
      new Map([[7, 'BB2020']]),
      expect.any(Array),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('269');
    expect(result.errors[0].message).toContain('54321');
    expect(result.errors[0].message).toContain('Blocker');
  });

  it('composes a type-3 reference whose opaque code the Hatred table explains', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Hatred', new Set([307])]]),
    );
    skillResolver.decodeTypeThreeTarget.mockReturnValue('Undead');

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [{ skillMasterId: 307, attributeValue: '110', attributeType: 3 }],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [307, { name: 'Hatred', isElite: false }],
      ]),
      positionNamesById: new Map([[3, "Morg 'n' Thorg"]]),
      rulesSetNamesById: new Map([[7, 'BB2025']]),
      catalog,
    });

    expect(result.errors).toEqual([]);
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [
                {
                  name: 'Hatred',
                  attributeValue: 'Undead',
                  isElite: false,
                  externalIds: [tpId(307)],
                },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[7, 'BB2025']]),
      [],
    );
  });

  it('still reports a type-3 reference whose opaque code the Hatred table does not explain', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);
    skillResolver.collectSkillMasterIds.mockReturnValue(new Map());

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [
                {
                  skillMasterId: 269,
                  attributeValue: '54321',
                  attributeType: 3,
                },
              ],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [269, { name: 'Animosity', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Black Ark Corsair']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain(
      'no curated keyword carries that code',
    );
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map([[7, 'BB2020']]),
      result.errors,
    );
  });

  it('reports a type-3 opaque attribute code once, however many positions reference it', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);
    skillResolver.collectSkillMasterIds.mockReturnValue(new Map());

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [
                {
                  skillMasterId: 269,
                  attributeValue: '54321',
                  attributeType: 3,
                },
              ],
            ],
          ]),
        ],
        [
          4,
          new Map([
            [
              7,
              [
                {
                  skillMasterId: 269,
                  attributeValue: '54321',
                  attributeType: 3,
                },
              ],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [269, { name: 'Animosity', isElite: false }],
      ]),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(result.errors).toHaveLength(1);
  });

  it('reports an unresolvable id once, however many positions reference it', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 999 }]]])],
        [4, new Map([[7, [{ skillMasterId: 999 }]]])],
      ]),
      skillMastersByMasterId: new Map(),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(result.errors).toHaveLength(1);
  });

  it('sends nothing for a position whose every skill is unresolvable', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 999 }]]])],
      ]),
      skillMastersByMasterId: new Map(),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map(),
      expect.any(Array),
    );
  });

  it("merges a star's name-carried exclusive skill in alongside its ordinary skills", async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(2);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Dodge', new Set([87])]]),
    );

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 87 }, { name: 'The Ballista' }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
      positionNamesById: new Map([[3, "Morg 'n' Thorg"]]),
      rulesSetNamesById: new Map([[7, 'BB2025']]),
      catalog,
    });

    // A name-carried reference needs no id lookup, so it can never produce
    // the unresolvable-skillMasterId error the id path reports.
    expect(result.errors).toEqual([]);
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [
                { name: 'Dodge', isElite: false, externalIds: [tpId(87)] },
                { name: 'The Ballista', isElite: false },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[7, 'BB2025']]),
      [],
    );
  });

  it("threads TP's elite marker into the starting skill ref", async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Block', new Set([220])]]),
    );

    await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[9, [{ skillMasterId: 220 }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [220, { name: 'Block', isElite: true }],
      ]),
      positionNamesById: new Map([[3, 'Blitzer']]),
      rulesSetNamesById: new Map([[9, 'BB2025']]),
      catalog,
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [9, [{ name: 'Block', isElite: true, externalIds: [tpId(220)] }]],
          ]),
        ],
      ]),
      expect.anything(),
      expect.anything(),
    );
  });

  it('composes a type-3 Animosity reference whose opaque code the Animosity table explains', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Animosity', new Set([269])]]),
    );
    skillResolver.decodeTypeThreeTarget.mockReturnValue('Goblin');

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [{ skillMasterId: 269, attributeValue: '111', attributeType: 3 }],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [269, { name: 'Animosity', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Skaven Clanrat']]),
      rulesSetNamesById: new Map([[7, 'BB2025']]),
      catalog,
    });

    expect(result.errors).toEqual([]);
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [
                {
                  name: 'Animosity',
                  attributeValue: 'Goblin',
                  isElite: false,
                  externalIds: [tpId(269)],
                },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[7, 'BB2025']]),
      [],
    );
  });

  it('reports a type-3 code the catalogue does not carry, even for an Animosity reference', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    // The resolver is fully mocked here (default: undefined), so this only
    // confirms the service reports whatever the resolver could not explain --
    // TpSkillResolverService's own spec covers which codes the catalogue
    // actually carries.
    skillResolver.collectSkillMasterIds.mockReturnValue(new Map());
    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [{ skillMasterId: 269, attributeValue: '110', attributeType: 3 }],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [269, { name: 'Animosity', isElite: false }],
      ]),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain(
      'no curated keyword carries that code',
    );
  });

  it('reports a type-3 reference for a resolved skill that is neither Hatred nor Animosity', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    // 87 (Dodge) resolves to a name but has no type-3 lookup of its own --
    // decodeTypeThreeTarget's fallback branch (neither 307 nor 269) must
    // still report this as unresolvable, not silently compose it.
    skillResolver.collectSkillMasterIds.mockReturnValue(new Map());
    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [
          3,
          new Map([
            [
              7,
              [{ skillMasterId: 87, attributeValue: '110', attributeType: 3 }],
            ],
          ]),
        ],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain(
      'no curated keyword carries that code',
    );
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map(),
      result.errors,
    );
  });

  it('registers every TP skillMasterId seen for a name as a tourplay.net external id', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);

    // TP assigns the same skill a new id per rules set; the scan sees both.
    // The upserted skill must end up carrying both, on the very first ref --
    // StartingSkillsImportService upserts a name only once per run.
    skillResolver.collectSkillMasterIds.mockReturnValue(
      new Map([['Dodge', new Set([87, 188])]]),
    );
    await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 87 }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
        [188, { name: 'Dodge', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [
                {
                  name: 'Dodge',
                  isElite: false,
                  externalIds: [tpId(87), tpId(188)],
                },
              ],
            ],
          ]),
        ],
      ]),
      new Map([[7, 'BB2020']]),
      [],
    );
  });

  it('resolves a skillMasterId no downloaded file names through its curated tourplay.net external id', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);
    skillResolver.resolveUnnamedMasterIds.mockResolvedValue(
      new Map([[181, 77]]),
    );

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 181 }]]])],
      ]),
      skillMastersByMasterId: new Map(),
      positionNamesById: new Map([[3, 'Dwarf Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
      catalog,
    });

    expect(result.errors).toEqual([]);
    expect(skillResolver.resolveUnnamedMasterIds).toHaveBeenCalledWith({
      masterIds: new Set([181]),
      tpSystemId: TP_SYSTEM_ID,
    });
    // The resolved id goes through as `skillId`, so the shared pipeline skips
    // its upsert-by-name step; the name is only a cache key there.
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [7, [{ name: 'TP skill 181', isElite: false, skillId: 77 }]],
          ]),
        ],
      ]),
      new Map([[7, 'BB2020']]),
      [],
    );
  });

  it('still reports a skillMasterId no curated tourplay.net id answers for', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);
    skillResolver.resolveUnnamedMasterIds.mockResolvedValue(new Map());

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 999_999 }]]])],
      ]),
      skillMastersByMasterId: new Map(),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Could not resolve');
    expect(result.errors[0]?.message).toContain('999999');
  });

  it('records the bootstrap failure and imports nothing when the TP external system cannot be resolved', async () => {
    const bootstrapError = { item: {}, message: 'bootstrap failed' };
    bootstrap.bootstrap.mockResolvedValue({ ok: false, error: bootstrapError });

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 87 }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
      catalog,
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toEqual([bootstrapError]);
    // Without a TP system id there are no external ids to register, so
    // nothing is sent rather than being written without them.
    expect(startingSkills.syncStartingSkills).not.toHaveBeenCalled();
  });
});
