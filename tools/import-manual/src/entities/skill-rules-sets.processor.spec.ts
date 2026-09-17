import { SkillRulesSetsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { SkillRulesSetsProcessor } from './skill-rules-sets.processor';

describe('SkillRulesSetsProcessor', () => {
  let processor: SkillRulesSetsProcessor;
  let skillRulesSetsImport: MockProxy<SkillRulesSetsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    skillRulesSetsImport = mock<SkillRulesSetsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SkillRulesSetsProcessor,
        {
          provide: SkillRulesSetsImportService,
          useValue: skillRulesSetsImport,
        },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(SkillRulesSetsProcessor);
  });

  function makeContext(skillRulesSets: unknown[]): ProcessContext {
    return {
      data: ManualDataFileSchema.parse({ skillRulesSets }),
      systemIds: new Map([['Name', 1]]),
      errors: [],
    };
  }

  const entry = {
    skill: { system: 'Name', id: 'Dodge' },
    rulesSet: { system: 'Name', id: 'CRP' },
    category: 'agility',
    isElite: false,
  };

  it('syncs nothing and issues no call when the section is empty', async () => {
    expect(await processor.process(makeContext([]))).toBe(0);
    expect(skillRulesSetsImport.syncSkillRulesSets).not.toHaveBeenCalled();
  });

  it('resolves both refs and sends one batch', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(5).mockResolvedValueOnce(9);
    skillRulesSetsImport.syncSkillRulesSets.mockResolvedValue({
      skillRulesSetIds: [1],
    });

    const ctx = makeContext([entry]);
    expect(await processor.process(ctx)).toBe(1);
    expect(skillRulesSetsImport.syncSkillRulesSets).toHaveBeenCalledWith(
      {
        entries: [
          { skillId: 5, rulesSetId: 9, category: 'agility', isElite: false },
        ],
      },
      ctx.errors,
    );
  });

  it('forwards the curated isElite flag to the sync call', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(5).mockResolvedValueOnce(9);
    skillRulesSetsImport.syncSkillRulesSets.mockResolvedValue({
      skillRulesSetIds: [1],
    });
    const ctx = makeContext([
      {
        skill: { system: 'Name', id: 'Block' },
        rulesSet: { system: 'Name', id: 'BB2025' },
        category: 'general',
        isElite: true,
      },
    ]);

    await processor.process(ctx);

    expect(skillRulesSetsImport.syncSkillRulesSets).toHaveBeenCalledWith(
      {
        entries: [
          { skillId: 5, rulesSetId: 9, category: 'general', isElite: true },
        ],
      },
      ctx.errors,
    );
  });

  it('drops an entry whose skill does not resolve and keeps the others', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(9);
    skillRulesSetsImport.syncSkillRulesSets.mockResolvedValue({
      skillRulesSetIds: [1],
    });

    const ctx = makeContext([
      { ...entry, skill: { system: 'Name', id: 'Nonsense' } },
      entry,
    ]);
    expect(await processor.process(ctx)).toBe(1);
    expect(skillRulesSetsImport.syncSkillRulesSets).toHaveBeenCalledWith(
      {
        entries: [
          { skillId: 5, rulesSetId: 9, category: 'agility', isElite: false },
        ],
      },
      ctx.errors,
    );
  });

  it('drops an entry whose rules set does not resolve and never syncs', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(undefined);

    const ctx = makeContext([entry]);
    expect(await processor.process(ctx)).toBe(0);
    expect(skillRulesSetsImport.syncSkillRulesSets).not.toHaveBeenCalled();
  });

  it('counts nothing when the sync itself fails', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(5).mockResolvedValueOnce(9);
    skillRulesSetsImport.syncSkillRulesSets.mockResolvedValue(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
  });
});
