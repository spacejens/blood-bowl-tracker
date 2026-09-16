import {
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPositionSkillsImportService } from './bbl-position-skills-import.service';

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
      [],
    );
  });

  it('skips a position whose page carried no skills at all', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([7])]]),
      skillsByPositionId: new Map(),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      new Map(),
      [],
    );
  });

  it('skips a position with an empty skill list rather than sending an empty batch', async () => {
    startingSkills.syncStartingSkills.mockResolvedValue(0);

    await service.syncPositionSkills({
      rulesSetIdsByPositionId: new Map([[3, new Set([7])]]),
      skillsByPositionId: new Map([[3, []]]),
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
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
    });

    expect(startingSkills.syncStartingSkills).toHaveBeenCalledTimes(1);
  });
});
