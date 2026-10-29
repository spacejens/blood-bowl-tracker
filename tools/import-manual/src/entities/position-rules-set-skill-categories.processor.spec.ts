import { PositionRulesSetSkillCategoriesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { PositionRulesSetSkillCategoriesProcessor } from './position-rules-set-skill-categories.processor';

function entry(position: string, primary: string[], secondary: string[]) {
  return {
    position: { system: 'Name', id: position },
    rulesSet: { system: 'Name', id: 'CRP' },
    primary,
    secondary,
  };
}

describe('PositionRulesSetSkillCategoriesProcessor', () => {
  let processor: PositionRulesSetSkillCategoriesProcessor;
  let categoriesImport: MockProxy<PositionRulesSetSkillCategoriesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    categoriesImport = mock<PositionRulesSetSkillCategoriesImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetSkillCategoriesProcessor,
        {
          provide: PositionRulesSetSkillCategoriesImportService,
          useValue: categoriesImport,
        },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(PositionRulesSetSkillCategoriesProcessor);
  });

  function makeContext(entries: unknown[]): ProcessContext {
    return {
      data: ManualDataFileSchema.parse({
        positionRulesSetSkillCategories: entries,
      }),
      systemIds: new Map([['Name', 1]]),
      errors: [],
    };
  }

  it('issues no call for an empty section', async () => {
    expect(await processor.process(makeContext([]))).toBe(0);
    expect(
      categoriesImport.syncPositionRulesSetSkillCategories,
    ).not.toHaveBeenCalled();
  });

  it('resolves both references and syncs one pair per call', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(7) // position
      .mockResolvedValueOnce(3); // rules set
    categoriesImport.syncPositionRulesSetSkillCategories.mockResolvedValue({
      positionRulesSetSkillCategoryIds: [70, 71],
    });

    const ctx = makeContext([
      entry('Human: Lineman', ['general'], ['agility']),
    ]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(1);
    expect(
      categoriesImport.syncPositionRulesSetSkillCategories,
    ).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 7,
            rulesSetId: 3,
            primary: ['general'],
            secondary: ['agility'],
          },
        ],
      },
      ctx.errors,
    );
    expect(refResolver.resolveRef).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'position',
        label:
          'Cannot import skill categories for position "Human: Lineman" under rules set "CRP"',
      }),
    );
  });

  it('skips an entry whose position does not resolve and still syncs the rest', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3);
    categoriesImport.syncPositionRulesSetSkillCategories.mockResolvedValue({
      positionRulesSetSkillCategoryIds: [72],
    });

    const imported = await processor.process(
      makeContext([
        entry('Nope: Nope', ['general'], []),
        entry('Human: Blitzer', ['general'], ['strength']),
      ]),
    );

    expect(imported).toBe(1);
    expect(
      categoriesImport.syncPositionRulesSetSkillCategories,
    ).toHaveBeenCalledTimes(1);
  });

  it('skips an entry whose rules set does not resolve', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(undefined);

    const imported = await processor.process(
      makeContext([entry('Human: Lineman', ['general'], [])]),
    );

    expect(imported).toBe(0);
    expect(
      categoriesImport.syncPositionRulesSetSkillCategories,
    ).not.toHaveBeenCalled();
  });

  it('does not count a pair the API rejected', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(7).mockResolvedValueOnce(3);
    categoriesImport.syncPositionRulesSetSkillCategories.mockResolvedValue(
      undefined,
    );

    expect(
      await processor.process(
        makeContext([entry('Human: Lineman', ['general'], [])]),
      ),
    ).toBe(0);
  });
});
