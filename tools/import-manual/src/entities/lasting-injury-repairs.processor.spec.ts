import { IncompletePlayerFillImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { LastingInjuryRepairEntry } from '../data-file/manual-data-file.schema';
import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { LastingInjuryRepairsProcessor } from './lasting-injury-repairs.processor';

const entry: LastingInjuryRepairEntry = {
  player: { system: 'tourplay.net', id: '586220' },
};

function makeContext(repairs: LastingInjuryRepairEntry[]): ProcessContext {
  return {
    data: { ...ManualDataFileSchema.parse({}), lastingInjuryRepairs: repairs },
    systemIds: new Map([['tourplay.net', 3]]),
    errors: [],
  };
}

describe('LastingInjuryRepairsProcessor', () => {
  let processor: LastingInjuryRepairsProcessor;
  let refResolver: MockProxy<ReferenceResolverService>;
  let fills: MockProxy<IncompletePlayerFillImportService>;

  beforeEach(async () => {
    refResolver = mock<ReferenceResolverService>();
    fills = mock<IncompletePlayerFillImportService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LastingInjuryRepairsProcessor,
        { provide: ReferenceResolverService, useValue: refResolver },
        { provide: IncompletePlayerFillImportService, useValue: fills },
      ],
    }).compile();
    processor = moduleRef.get(LastingInjuryRepairsProcessor);
  });

  it('resolves the player and asks the server to record his reductions', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    fills.recordLastingReductions.mockResolvedValue({
      playerId: 9,
      outcome: 'recorded',
    });
    const ctx = makeContext([entry]);

    expect(await processor.process(ctx)).toBe(1);
    expect(refResolver.resolveRef).toHaveBeenCalledWith({
      ref: entry.player,
      kind: 'player',
      item: entry,
      label:
        'Cannot record the lasting reductions of player tourplay.net 586220',
      systemIds: ctx.systemIds,
      errors: ctx.errors,
    });
    expect(fills.recordLastingReductions).toHaveBeenCalledWith(
      { playerId: 9 },
      ctx.errors,
    );
  });

  it('counts a player the server leaves unchanged as accepted', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    fills.recordLastingReductions.mockResolvedValue({
      playerId: 9,
      outcome: 'unchanged',
    });

    expect(await processor.process(makeContext([entry]))).toBe(1);
  });

  it('skips an entry whose player does not resolve', async () => {
    refResolver.resolveRef.mockResolvedValue(undefined);

    expect(await processor.process(makeContext([entry]))).toBe(0);
    expect(fills.recordLastingReductions).not.toHaveBeenCalled();
  });

  it('carries on after a refused entry', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    fills.recordLastingReductions
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ playerId: 9, outcome: 'recorded' });

    expect(await processor.process(makeContext([entry, entry]))).toBe(1);
    expect(fills.recordLastingReductions).toHaveBeenCalledTimes(2);
  });
});
