import { SkillsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { SkillsProcessor } from './skills.processor';

describe('SkillsProcessor', () => {
  let processor: SkillsProcessor;
  let skillsImport: MockProxy<SkillsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    skillsImport = mock<SkillsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SkillsProcessor,
        { provide: SkillsImportService, useValue: skillsImport },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(SkillsProcessor);
  });

  function makeContext(skills: unknown[]): ProcessContext {
    return {
      data: ManualDataFileSchema.parse({ skills }),
      systemIds: new Map([['Name', 1]]),
      errors: [],
    };
  }

  const entry = {
    name: 'Piling On',
    externalIds: [{ system: 'Name', id: 'Piling On' }],
  };

  it('imports nothing and issues no call when the section is empty', async () => {
    expect(await processor.process(makeContext([]))).toBe(0);
    expect(skillsImport.upsert).not.toHaveBeenCalled();
  });

  it('upserts each skill with its mapped external ids', async () => {
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'Piling On' },
    ]);
    skillsImport.upsert.mockResolvedValue({
      id: 5,
      name: 'Piling On',
      createdAt: new Date(0),
      created: true,
    });

    const ctx = makeContext([entry]);
    expect(await processor.process(ctx)).toBe(1);
    expect(skillsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Piling On',
        externalIds: [{ externalSystemId: 1, externalId: 'Piling On' }],
      },
      ctx.errors,
    );
  });

  it('counts nothing for a failed upsert', async () => {
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'Piling On' },
    ]);
    skillsImport.upsert.mockResolvedValue(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
  });
});
