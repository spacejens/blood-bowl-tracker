import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPositionSkillsImportService } from './bbl-position-skills-import.service';

/** A minimal RulesSet fixture -- only `id` and `name` matter to this service. */
function makeRulesSet(id: number, name: string): RulesSet {
  return {
    id,
    name,
    moveFormat: 'bare',
    strengthFormat: 'bare',
    agilityFormat: 'bare',
    passingFormat: 'absent',
    armourFormat: 'bare',
    createdAt: new Date('2026-01-01'),
  };
}

describe('BblPositionSkillsImportService', () => {
  let service: BblPositionSkillsImportService;
  let startingSkills: MockProxy<StartingSkillsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    startingSkills = mock<StartingSkillsImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockImplementation(({ imported, errors }) => ({
      success: errors.length === 0,
      imported,
      errors,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPositionSkillsImportService,
        { provide: StartingSkillsImportService, useValue: startingSkills },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(BblPositionSkillsImportService);
  });

  it("gives every rules set a position plays under the page's one skill list", async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(4);

    const { result } = await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([7, 8])]]),
      skillsByPositionId: new Map([[3, ['Block', 'Dodge']]]),
      rulesSetsByName: new Map(),
    });

    expect(result.imported).toBe(4);
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [7, ['Block', 'Dodge']],
            [8, ['Block', 'Dodge']],
          ]),
        ],
      ]),
      new Map(),
      [],
    );
  });

  it('skips a position whose page carried no skills at all', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([7])]]),
      skillsByPositionId: new Map(),
      rulesSetsByName: new Map(),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map(),
      [],
    );
  });

  it('skips a position with an empty skill list rather than sending an empty batch', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([7])]]),
      skillsByPositionId: new Map([[3, []]]),
      rulesSetsByName: new Map(),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map(),
      [],
    );
  });

  it('calls syncStartingSkills exactly once for multiple positions and rules sets', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(6);

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([
        [3, new Set([7, 8])],
        [4, new Set([7])],
      ]),
      skillsByPositionId: new Map([
        [3, ['Block', 'Dodge']],
        [4, ['Guard']],
      ]),
      rulesSetsByName: new Map(),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledTimes(1);
  });

  it('excludes the curation-owned older rules sets from what it writes, keeping modern ones', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);

    await service.syncPositionSkills({
      // Position 3 is available under BB2020 (rules set 10) as well as all
      // three curation-owned older rules sets.
      rulesSetIdsByPositionId: new Map([[3, new Set([10, 7, 8, 9])]]),
      skillsByPositionId: new Map([[3, ['Block', 'Dodge']]]),
      rulesSetsByName: new Map([
        ['CRP', makeRulesSet(7, 'CRP')],
        ['CRP+', makeRulesSet(8, 'CRP+')],
        ['BB2016', makeRulesSet(9, 'BB2016')],
        ['BB2020', makeRulesSet(10, 'BB2020')],
      ]),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([[3, new Map([[10, ['Block', 'Dodge']]])]]),
      new Map([
        [7, 'CRP'],
        [8, 'CRP+'],
        [9, 'BB2016'],
        [10, 'BB2020'],
      ]),
      [],
    );
  });

  it('writes nothing for a position only available under curation-owned older rules sets', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([7, 8, 9])]]),
      skillsByPositionId: new Map([[3, ['Block', 'Dodge']]]),
      rulesSetsByName: new Map([
        ['CRP', makeRulesSet(7, 'CRP')],
        ['CRP+', makeRulesSet(8, 'CRP+')],
        ['BB2016', makeRulesSet(9, 'BB2016')],
      ]),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      new Map([
        [7, 'CRP'],
        [8, 'CRP+'],
        [9, 'BB2016'],
      ]),
      [],
    );
  });
});
