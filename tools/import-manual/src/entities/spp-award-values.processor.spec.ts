import { SppAwardValuesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ManualDataFileSchema } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { SppAwardValuesProcessor } from './spp-award-values.processor';

describe('SppAwardValuesProcessor', () => {
  let processor: SppAwardValuesProcessor;
  let sppImport: MockProxy<SppAwardValuesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    sppImport = mock<SppAwardValuesImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppAwardValuesProcessor,
        { provide: SppAwardValuesImportService, useValue: sppImport },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(SppAwardValuesProcessor);
  });

  function makeContext(sppAwardValues: unknown[]): ProcessContext {
    return {
      data: ManualDataFileSchema.parse({ sppAwardValues }),
      systemIds: new Map([['Name', 1]]),
      idMap: new ExternalIdMap(),
      errors: [],
    };
  }

  it('syncs nothing and issues no call when the section is empty', async () => {
    const imported = await processor.process(makeContext([]));

    expect(imported).toBe(0);
    expect(sppImport.syncSppAwardValues).not.toHaveBeenCalled();
  });

  it('resolves refs and syncs a baseline entry with a null raceId', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    refResolver.resolveOptionalRef.mockResolvedValue({
      ok: true,
      id: undefined,
    });
    sppImport.syncSppAwardValues.mockResolvedValue({ sppAwardValueIds: [11] });

    const ctx = makeContext([
      {
        rulesSet: { system: 'Name', id: 'CRP' },
        actionType: 'touchdown',
        sppValue: 3,
      },
    ]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(1);
    expect(sppImport.syncSppAwardValues).toHaveBeenCalledWith(
      {
        values: [
          {
            rulesSetId: 5,
            raceId: null,
            actionType: 'touchdown',
            sppValue: 3,
          },
        ],
      },
      ctx.errors,
    );
  });

  it('syncs a race override with the resolved race id', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    refResolver.resolveOptionalRef.mockResolvedValue({ ok: true, id: 7 });
    sppImport.syncSppAwardValues.mockResolvedValue({ sppAwardValueIds: [12] });

    const ctx = makeContext([
      {
        rulesSet: { system: 'Name', id: 'BB2025' },
        race: { system: 'Name', id: 'Orc' },
        actionType: 'touchdown',
        sppValue: 2,
      },
    ]);
    await processor.process(ctx);

    expect(sppImport.syncSppAwardValues).toHaveBeenCalledWith(
      {
        values: [
          { rulesSetId: 5, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      },
      ctx.errors,
    );
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: { system: 'Name', id: 'BB2025' },
        kind: 'rulesSet',
      }),
    );
    // The kind is what keeps this ref off the competition that shares BBL's
    // numeric id space with races (issue #480).
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: { system: 'Name', id: 'Orc' },
        kind: 'race',
      }),
    );
  });

  it('skips an entry whose rules set cannot be resolved and still syncs the rest', async () => {
    refResolver.resolveRef
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(5);
    refResolver.resolveOptionalRef.mockResolvedValue({
      ok: true,
      id: undefined,
    });
    sppImport.syncSppAwardValues.mockResolvedValue({ sppAwardValueIds: [11] });

    const ctx = makeContext([
      {
        rulesSet: { system: 'Name', id: 'Nope' },
        actionType: 'touchdown',
        sppValue: 3,
      },
      {
        rulesSet: { system: 'Name', id: 'CRP' },
        actionType: 'completion',
        sppValue: 1,
      },
    ]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(1);
    expect(sppImport.syncSppAwardValues).toHaveBeenCalledWith(
      {
        values: [
          {
            rulesSetId: 5,
            raceId: null,
            actionType: 'completion',
            sppValue: 1,
          },
        ],
      },
      ctx.errors,
    );
  });

  it('skips an entry whose race ref is present but unresolvable', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    refResolver.resolveOptionalRef.mockResolvedValue({ ok: false });

    const ctx = makeContext([
      {
        rulesSet: { system: 'Name', id: 'BB2025' },
        race: { system: 'Name', id: 'Nope' },
        actionType: 'touchdown',
        sppValue: 2,
      },
    ]);
    const imported = await processor.process(ctx);

    expect(imported).toBe(0);
    expect(sppImport.syncSppAwardValues).not.toHaveBeenCalled();
  });

  it('reports 0 imported when the sync call itself fails', async () => {
    refResolver.resolveRef.mockResolvedValue(5);
    refResolver.resolveOptionalRef.mockResolvedValue({
      ok: true,
      id: undefined,
    });
    sppImport.syncSppAwardValues.mockResolvedValue(undefined);

    const imported = await processor.process(
      makeContext([
        {
          rulesSet: { system: 'Name', id: 'CRP' },
          actionType: 'touchdown',
          sppValue: 3,
        },
      ]),
    );

    expect(imported).toBe(0);
  });
});
