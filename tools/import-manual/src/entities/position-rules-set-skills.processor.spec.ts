import { PositionRulesSetSkillsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { PositionRulesSetSkillsProcessor } from './position-rules-set-skills.processor';

describe('PositionRulesSetSkillsProcessor', () => {
  let processor: PositionRulesSetSkillsProcessor;
  let positionRulesSetSkillsImport: MockProxy<PositionRulesSetSkillsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    positionRulesSetSkillsImport = mock<PositionRulesSetSkillsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetSkillsProcessor,
        {
          provide: PositionRulesSetSkillsImportService,
          useValue: positionRulesSetSkillsImport,
        },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(PositionRulesSetSkillsProcessor);
  });

  function makeContext(positionRulesSetSkills: unknown[]): ProcessContext {
    return {
      data: ManualDataFileSchema.parse({ positionRulesSetSkills }),
      systemIds: new Map([['Name', 1]]),
      errors: [],
    };
  }

  const entry = {
    position: { system: 'Name', id: 'Dwarf: Troll Slayer' },
    rulesSet: { system: 'Name', id: 'CRP' },
    skills: [
      { system: 'Name', id: 'Block' },
      { system: 'Name', id: 'Dauntless' },
    ],
  };

  it('syncs nothing and issues no call when the section is empty', async () => {
    expect(await processor.process(makeContext([]))).toBe(0);
    expect(
      positionRulesSetSkillsImport.syncPositionRulesSetSkills,
    ).not.toHaveBeenCalled();
  });

  it('sends one batch per entry, with every resolved skill', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    refResolver.resolveRefs.mockResolvedValue([5, 6]);
    positionRulesSetSkillsImport.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1, 2],
    });

    const ctx = makeContext([entry]);
    expect(await processor.process(ctx)).toBe(2);
    expect(
      positionRulesSetSkillsImport.syncPositionRulesSetSkills,
    ).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 3,
            rulesSetId: 4,
            skillId: 5,
            attributeValue: undefined,
          },
          {
            positionId: 3,
            rulesSetId: 4,
            skillId: 6,
            attributeValue: undefined,
          },
        ],
      },
      ctx.errors,
    );
  });

  it('resolves a wrapped skill reference and attaches its attributeValue', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    refResolver.resolveRefs.mockResolvedValue([5]);
    positionRulesSetSkillsImport.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1],
    });

    const wrappedEntry = {
      position: { system: 'Name', id: 'Dwarf: Troll Slayer' },
      rulesSet: { system: 'Name', id: 'CRP' },
      skills: [
        { skill: { system: 'Name', id: 'Loner' }, attributeValue: '4+' },
      ],
    };

    const ctx = makeContext([wrappedEntry]);
    expect(await processor.process(ctx)).toBe(1);
    expect(refResolver.resolveRefs).toHaveBeenCalledWith(
      expect.objectContaining({
        refs: [{ system: 'Name', id: 'Loner' }],
      }),
    );
    expect(
      positionRulesSetSkillsImport.syncPositionRulesSetSkills,
    ).toHaveBeenCalledWith(
      {
        entries: [
          { positionId: 3, rulesSetId: 4, skillId: 5, attributeValue: '4+' },
        ],
      },
      ctx.errors,
    );
  });

  it('resolves a mix of bare and wrapped skill references in one entry', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    refResolver.resolveRefs.mockResolvedValue([5, 6]);
    positionRulesSetSkillsImport.syncPositionRulesSetSkills.mockResolvedValue({
      positionRulesSetSkillIds: [1, 2],
    });

    const mixedEntry = {
      position: { system: 'Name', id: 'Dwarf: Troll Slayer' },
      rulesSet: { system: 'Name', id: 'CRP' },
      skills: [
        { system: 'Name', id: 'Block' },
        { skill: { system: 'Name', id: 'Loner' }, attributeValue: '4+' },
      ],
    };

    const ctx = makeContext([mixedEntry]);
    expect(await processor.process(ctx)).toBe(2);
    expect(refResolver.resolveRefs).toHaveBeenCalledWith(
      expect.objectContaining({
        refs: [
          { system: 'Name', id: 'Block' },
          { system: 'Name', id: 'Loner' },
        ],
      }),
    );
    expect(
      positionRulesSetSkillsImport.syncPositionRulesSetSkills,
    ).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 3,
            rulesSetId: 4,
            skillId: 5,
            attributeValue: undefined,
          },
          { positionId: 3, rulesSetId: 4, skillId: 6, attributeValue: '4+' },
        ],
      },
      ctx.errors,
    );
  });

  it('drops the whole entry when a skill reference does not resolve', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    refResolver.resolveRefs.mockResolvedValue(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
    expect(
      positionRulesSetSkillsImport.syncPositionRulesSetSkills,
    ).not.toHaveBeenCalled();
  });

  it('drops the entry when the position does not resolve', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
    expect(refResolver.resolveRefs).not.toHaveBeenCalled();
  });

  it('drops the entry when the rules set does not resolve', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
    expect(refResolver.resolveRefs).not.toHaveBeenCalled();
    expect(
      positionRulesSetSkillsImport.syncPositionRulesSetSkills,
    ).not.toHaveBeenCalled();
  });

  it('counts nothing when the sync itself fails', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    refResolver.resolveRefs.mockResolvedValue([5, 6]);
    positionRulesSetSkillsImport.syncPositionRulesSetSkills.mockResolvedValue(
      undefined,
    );

    expect(await processor.process(makeContext([entry]))).toBe(0);
  });
});
