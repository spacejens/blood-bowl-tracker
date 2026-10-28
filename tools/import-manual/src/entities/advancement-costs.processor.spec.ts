import { AdvancementCostsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { AdvancementCostsProcessor } from './advancement-costs.processor';

function entry(rulesSet: string, advancementNumber: number, sppCost: number) {
  return {
    rulesSet: { system: 'Name', id: rulesSet },
    advancementNumber,
    advancementKind: 'table_roll',
    sppCost,
  };
}

function apiCost(advancementNumber: number, sppCost: number) {
  return {
    rulesSetId: 5,
    advancementNumber,
    advancementKind: 'table_roll',
    sppCost,
  };
}

const TLOEG = { system: 'tloeg.bbleague.se', id: 'tLoEG' };
const FAN_FAVOURITE = { system: 'Name', id: 'Fan Favourite' };

function leagueEntry() {
  return {
    rulesSet: { system: 'Name', id: 'CRP' },
    league: TLOEG,
    advancementNumber: 7,
    advancementKind: 'granted_skill',
    skill: FAN_FAVOURITE,
    sppCost: 125,
  };
}

describe('AdvancementCostsProcessor', () => {
  let processor: AdvancementCostsProcessor;
  let costsImport: MockProxy<AdvancementCostsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    costsImport = mock<AdvancementCostsImportService>();
    refResolver = mock<ReferenceResolverService>();
    refResolver.resolveOptionalRef.mockResolvedValue({
      ok: true,
      id: undefined,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementCostsProcessor,
        { provide: AdvancementCostsImportService, useValue: costsImport },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(AdvancementCostsProcessor);
  });

  function makeContext(advancementCosts: unknown[]): ProcessContext {
    return {
      data: ManualDataFileSchema.parse({ advancementCosts }),
      systemIds: new Map([['Name', 1]]),
      errors: [],
    };
  }

  it('syncs nothing and issues no call when the section is empty', async () => {
    const imported = await processor.process(makeContext([]));

    expect(imported).toBe(0);
    expect(costsImport.syncAdvancementCosts).not.toHaveBeenCalled();
  });

  it('resolves the rules set and sends every cost in one sync call', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    costsImport.syncAdvancementCosts.mockResolvedValue({
      advancementCostIds: [11, 12],
    });

    const ctx = makeContext([entry('CRP', 1, 6), entry('CRP', 2, 10)]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(2);
    expect(costsImport.syncAdvancementCosts).toHaveBeenCalledTimes(1);
    expect(costsImport.syncAdvancementCosts).toHaveBeenCalledWith(
      { costs: [apiCost(1, 6), apiCost(2, 10)] },
      ctx.errors,
    );
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: { system: 'Name', id: 'CRP' },
        kind: 'rulesSet',
        errors: ctx.errors,
        label: 'Cannot import advancement cost for advancement 1 (table_roll)',
      }),
    );
  });

  it('skips an entry whose rules set cannot be resolved and still syncs the rest', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(5);
    costsImport.syncAdvancementCosts.mockResolvedValue({
      advancementCostIds: [11],
    });

    const ctx = makeContext([entry('Nope', 1, 6), entry('CRP', 1, 6)]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(1);
    expect(costsImport.syncAdvancementCosts).toHaveBeenCalledWith(
      { costs: [apiCost(1, 6)] },
      ctx.errors,
    );
  });

  it('issues no sync call when no entry resolves', async () => {
    refResolver.resolveRef.mockResolvedValue(undefined);

    const imported = await processor.process(
      makeContext([entry('Nope', 1, 6)]),
    );

    expect(imported).toBe(0);
    expect(costsImport.syncAdvancementCosts).not.toHaveBeenCalled();
  });

  it('reports 0 imported when the sync call itself fails', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    costsImport.syncAdvancementCosts.mockResolvedValue(undefined);

    const imported = await processor.process(makeContext([entry('CRP', 1, 6)]));

    expect(imported).toBe(0);
  });

  it('resolves the league and skill an entry names and sends their ids', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    refResolver.resolveOptionalRef
      .mockResolvedValueOnce({ ok: true, id: 3 })
      .mockResolvedValueOnce({ ok: true, id: 40 });
    costsImport.syncAdvancementCosts.mockResolvedValue({
      advancementCostIds: [21],
    });

    const ctx = makeContext([leagueEntry()]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(1);
    expect(costsImport.syncAdvancementCosts).toHaveBeenCalledWith(
      {
        costs: [
          {
            rulesSetId: 5,
            leagueId: 3,
            advancementNumber: 7,
            advancementKind: 'granted_skill',
            skillId: 40,
            sppCost: 125,
          },
        ],
      },
      ctx.errors,
    );
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: TLOEG,
        kind: 'league',
        errors: ctx.errors,
      }),
    );
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: FAN_FAVOURITE,
        kind: 'skill',
        errors: ctx.errors,
      }),
    );
  });

  it('sends no league or skill id for an entry that names neither', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    costsImport.syncAdvancementCosts.mockResolvedValue({
      advancementCostIds: [11],
    });

    await processor.process(makeContext([entry('CRP', 1, 6)]));

    const [{ costs }] = costsImport.syncAdvancementCosts.mock.calls[0];
    expect(Object.keys(costs[0]).sort()).toEqual([
      'advancementKind',
      'advancementNumber',
      'rulesSetId',
      'sppCost',
    ]);
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: undefined, kind: 'league' }),
    );
  });

  it('skips an entry whose league does not resolve and still syncs the rest', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    refResolver.resolveOptionalRef.mockResolvedValueOnce({ ok: false });
    costsImport.syncAdvancementCosts.mockResolvedValue({
      advancementCostIds: [11],
    });

    const ctx = makeContext([leagueEntry(), entry('CRP', 1, 6)]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(1);
    expect(costsImport.syncAdvancementCosts).toHaveBeenCalledWith(
      { costs: [apiCost(1, 6)] },
      ctx.errors,
    );
  });

  it('skips an entry whose skill does not resolve', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    refResolver.resolveOptionalRef
      .mockResolvedValueOnce({ ok: true, id: 3 })
      .mockResolvedValueOnce({ ok: false });

    const imported = await processor.process(makeContext([leagueEntry()]));

    expect(imported).toBe(0);
    expect(costsImport.syncAdvancementCosts).not.toHaveBeenCalled();
  });
});
