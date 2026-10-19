import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  BblPositionSkillsImportService,
  CURATION_OWNED_RULES_SET_NAMES,
} from './bbl-position-skills-import.service';

/**
 * The canned ImportResult the mocked ImportResultService.result returns.
 * ImportResultService's own `success: errors.length === 0` derivation is
 * covered by packages/import/src/import-result.service.spec.ts; this spec
 * asserts what the service under test *passes to* result() (via
 * `resultArgs()`) and that it returns result()'s value unchanged. The
 * deliberately impossible field values make any leftover assertion that reads
 * the returned object instead of the recorded call arguments fail loudly.
 */
const CANNED_RESULT: ImportResult = {
  success: false,
  imported: -1,
  errors: [{ item: { canned: true }, message: 'canned import result' }],
};

/** The `{ imported, errors }` the service under test handed to ImportResultService.result. */
function resultArgs(importResults: MockProxy<ImportResultService>): {
  imported: number;
  errors: ImportError[];
} {
  return importResults.result.mock.calls[0][0];
}

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
    importResults.result.mockReturnValue(CANNED_RESULT);
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

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([7, 8])]]),
      skillsByPositionId: new Map([
        [3, [{ name: 'Block' }, { name: 'Dodge' }]],
      ]),
      rulesSetsByName: new Map(),
    });

    expect(resultArgs(importResults)).toEqual({ imported: 4, errors: [] });
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              7,
              [
                { name: 'Block', isElite: false },
                { name: 'Dodge', isElite: false },
              ],
            ],
            [
              8,
              [
                { name: 'Block', isElite: false },
                { name: 'Dodge', isElite: false },
              ],
            ],
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
        [3, [{ name: 'Block' }, { name: 'Dodge' }]],
        [4, [{ name: 'Guard' }]],
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
      skillsByPositionId: new Map([
        [3, [{ name: 'Block' }, { name: 'Dodge' }]],
      ]),
      rulesSetsByName: new Map([
        ['CRP', makeRulesSet(7, 'CRP')],
        ['CRP+', makeRulesSet(8, 'CRP+')],
        ['BB2016', makeRulesSet(9, 'BB2016')],
        ['BB2020', makeRulesSet(10, 'BB2020')],
      ]),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([
        [
          3,
          new Map([
            [
              10,
              [
                { name: 'Block', isElite: false },
                { name: 'Dodge', isElite: false },
              ],
            ],
          ]),
        ],
      ]),
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
      skillsByPositionId: new Map([
        [3, [{ name: 'Block' }, { name: 'Dodge' }]],
      ]),
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

  it('pins CURATION_OWNED_RULES_SET_NAMES to the exact list curated-data-skills.spec.ts expects', () => {
    // Cross-referenced with tools/import-manual's "curates exactly the rules
    // sets BblPositionSkillsImportService excludes itself from" test in
    // curated-data-skills.spec.ts, which hardcodes this same list (it cannot
    // import this constant: tools/import-manual declares no dependency on
    // tools/import-bbl). A change to either side without updating the other
    // fails at least one of the two tests.
    expect(CURATION_OWNED_RULES_SET_NAMES).toEqual(['CRP', 'CRP+', 'BB2016']);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    const { result } = await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map(),
      skillsByPositionId: new Map(),
      rulesSetsByName: new Map(),
    });

    expect(result).toBe(CANNED_RESULT);
  });

  it('marks every BBL skill as not elite', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(1);

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([9])]]),
      skillsByPositionId: new Map([[3, [{ name: 'Block' }]]]),
      rulesSetsByName: new Map([['BB2020', makeRulesSet(9, 'BB2020')]]),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map([[3, new Map([[9, [{ name: 'Block', isElite: false }]]])]]),
      expect.anything(),
      expect.anything(),
    );
  });
});
