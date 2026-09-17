import {
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import { HatredTargetService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpPositionSkillsImportService } from './tp-position-skills-import.service';

describe('TpPositionSkillsImportService', () => {
  let service: TpPositionSkillsImportService;
  let startingSkills: MockProxy<StartingSkillsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    startingSkills = mock<StartingSkillsImportService>();
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((error) => error);
    importResults.result.mockImplementation(({ imported, errors }) => ({
      success: errors.length === 0,
      imported,
      errors,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPositionSkillsImportService,
        HatredTargetService,
        { provide: StartingSkillsImportService, useValue: startingSkills },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(TpPositionSkillsImportService);
  });

  it('resolves each id to its name and keeps the attribute value separate', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(2);

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
                { name: 'Dodge', isElite: false },
                { name: 'Loner', attributeValue: '4+', isElite: false },
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

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 42, attributeValue: '+1' }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [42, { name: 'Mighty Blow', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
    });

    expect(result.imported).toBe(1);
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [{ name: 'Mighty Blow', attributeValue: '+1', isElite: false }],
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

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 87 }, { skillMasterId: 999 }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
      positionNamesById: new Map([[3, 'Blocker']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([[3, new Map([[7, [{ name: 'Dodge', isElite: false }]]])]]),
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
    });

    expect(result.errors[0].message).toContain('rules set "id 7"');
    expect(result.errors[0].message).toContain('position "id 3"');
  });

  it('excludes a type-3 opaque attribute code and reports it, without blocking other skills', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);

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
                  attributeValue: '111',
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
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([[3, new Map([[7, [{ name: 'Dodge', isElite: false }]]])]]),
      new Map([[7, 'BB2020']]),
      expect.any(Array),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('269');
    expect(result.errors[0].message).toContain('111');
    expect(result.errors[0].message).toContain('Blocker');
  });

  it('composes a type-3 reference whose opaque code the Hatred table explains', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);

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
      positionNamesById: new Map([[3, 'Black Ark Corsair']]),
      rulesSetNamesById: new Map([[7, 'BB2020']]),
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('unresolvable type-3 opaque');
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map([[7, 'BB2020']]),
      result.errors,
    );
  });

  it('reports a type-3 opaque attribute code once, however many positions reference it', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

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
        [
          4,
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
      positionNamesById: new Map(),
      rulesSetNamesById: new Map(),
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
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map(),
      expect.any(Array),
    );
  });

  it("merges a star's name-carried exclusive skill in alongside its ordinary skills", async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(2);

    const { result } = await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[7, [{ skillMasterId: 87 }, { name: 'The Ballista' }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [87, { name: 'Dodge', isElite: false }],
      ]),
      positionNamesById: new Map([[3, "Morg 'n' Thorg"]]),
      rulesSetNamesById: new Map([[7, 'BB2025']]),
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
                { name: 'Dodge', isElite: false },
                { name: 'The Ballista' },
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

    await service.syncPositionSkills({
      skillRefsByPositionId: new Map([
        [3, new Map([[9, [{ skillMasterId: 220 }]]])],
      ]),
      skillMastersByMasterId: new Map([
        [220, { name: 'Block', isElite: true }],
      ]),
      positionNamesById: new Map([[3, 'Blitzer']]),
      rulesSetNamesById: new Map([[9, 'BB2025']]),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([[3, new Map([[9, [{ name: 'Block', isElite: true }]]])]]),
      expect.anything(),
      expect.anything(),
    );
  });
});
