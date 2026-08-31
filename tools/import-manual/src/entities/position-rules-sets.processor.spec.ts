import { PositionRulesSetsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { PositionRulesSetsProcessor } from './position-rules-sets.processor';

describe('PositionRulesSetsProcessor', () => {
  let processor: PositionRulesSetsProcessor;
  let positionRulesSetsImport: MockProxy<PositionRulesSetsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    positionRulesSetsImport = mock<PositionRulesSetsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetsProcessor,
        {
          provide: PositionRulesSetsImportService,
          useValue: positionRulesSetsImport,
        },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(PositionRulesSetsProcessor);
  });

  function makeContext(positionRulesSets: unknown[]): ProcessContext {
    return {
      data: ManualDataFileSchema.parse({ positionRulesSets }),
      systemIds: new Map([['Name', 1]]),
      errors: [],
    };
  }

  const entry = {
    position: { system: 'Name', id: 'Zombie Lineman' },
    rulesSet: { system: 'Name', id: 'BB2025' },
    move: 4,
    strength: 3,
    agility: 4,
    passing: 5,
    armour: 9,
  };

  it('syncs nothing and issues no call when the section is empty', async () => {
    const imported = await processor.process(makeContext([]));

    expect(imported).toBe(0);
    expect(
      positionRulesSetsImport.syncPositionRulesSets,
    ).not.toHaveBeenCalled();
  });

  it('resolves both refs and syncs the entry', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    positionRulesSetsImport.syncPositionRulesSets.mockResolvedValue({
      positionRulesSetIds: [21],
    });

    const ctx = makeContext([entry]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(1);
    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledWith(
      {
        entries: [
          {
            positionId: 3,
            rulesSetId: 4,
            move: 4,
            strength: 3,
            agility: 4,
            passing: 5,
            armour: 9,
          },
        ],
      },
      ctx.errors,
    );
  });

  it('sends a null passing when the entry omits it', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(5);
    positionRulesSetsImport.syncPositionRulesSets.mockResolvedValue({
      positionRulesSetIds: [22],
    });
    const { passing: _passing, ...withoutPassing } = entry;

    await processor.process(makeContext([withoutPassing]));

    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledWith(
      { entries: [expect.objectContaining({ passing: null })] },
      expect.anything(),
    );
  });

  it('drops an entry whose position ref does not resolve, keeping the rest', async () => {
    // First entry: position unresolved. Second entry: both refs resolve.
    refResolver.resolveRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    positionRulesSetsImport.syncPositionRulesSets.mockResolvedValue({
      positionRulesSetIds: [21],
    });

    const imported = await processor.process(makeContext([entry, entry]));

    expect(imported).toBe(1);
    expect(positionRulesSetsImport.syncPositionRulesSets).toHaveBeenCalledWith(
      { entries: [expect.objectContaining({ positionId: 3 })] },
      expect.anything(),
    );
  });

  it('drops an entry whose rules-set ref does not resolve', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(undefined);

    const imported = await processor.process(makeContext([entry]));

    expect(imported).toBe(0);
    expect(
      positionRulesSetsImport.syncPositionRulesSets,
    ).not.toHaveBeenCalled();
  });

  it('counts nothing when the sync call fails', async () => {
    refResolver.resolveRef.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    positionRulesSetsImport.syncPositionRulesSets.mockResolvedValue(undefined);

    const imported = await processor.process(makeContext([entry]));

    expect(imported).toBe(0);
  });
});
