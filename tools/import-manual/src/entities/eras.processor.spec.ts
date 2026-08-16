import { ErasImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { ErasProcessor } from './eras.processor';

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    coaches: [],
    teams: [],
    competitions: [],
    sppAwardValues: [],
    trophies: [],
    competitionGroups: [],
  };
}

function makeContext(
  data: ManualDataFile,
  idMap: ExternalIdMap,
): ProcessContext {
  return {
    data,
    systemIds: new Map([['Name', 2]]),
    idMap,
    errors: [],
  };
}

describe('ErasProcessor', () => {
  let processor: ErasProcessor;
  let eras: MockProxy<ErasImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    eras = mock<ErasImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ErasProcessor,
        { provide: ErasImportService, useValue: eras },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(ErasProcessor);
  });

  it('resolves league and rules-set refs, upserts, and records ids', async () => {
    eras.upsertEra.mockResolvedValue({
      id: 50,
      name: 'Season 12',
      leagueId: 3,
      rulesSetIds: [7],
      startDate: '2024-01-01',
      endDate: null,
      createdAt: new Date(),
      created: true,
    });
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: 3 });
    refResolver.resolveRefs.mockReturnValue([7]);
    const cannedExternalIds = [
      { externalSystemId: 99, externalId: 'canned:season-12' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
    const data = emptyData();
    data.eras = [
      {
        name: 'Season 12',
        league: { system: 'Name', id: 'name:my-league' },
        rulesSets: [{ system: 'Name', id: 'name:crp' }],
        startDate: '2024-01-01',
        externalIds: [{ system: 'Name', id: 'name:season-12' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: data.eras[0].league, kind: 'league' }),
    );
    expect(refResolver.resolveRefs).toHaveBeenCalledWith(
      expect.objectContaining({
        refs: data.eras[0].rulesSets,
        kind: 'rulesSet',
      }),
    );
    // The processor must wire each canned resolver output into the exact
    // field the upsert call expects -- not just pass some id through.
    expect(eras.upsertEra).toHaveBeenCalledWith(
      {
        name: 'Season 12',
        leagueId: 3,
        rulesSetIds: [7],
        startDate: '2024-01-01',
        endDate: undefined,
        externalIds: cannedExternalIds,
      },
      ctx.errors,
    );
    expect(
      ctx.idMap.resolve({ system: 'Name', id: 'name:season-12' }, 'era'),
    ).toBe(50);
  });

  it('passes endDate through when present', async () => {
    eras.upsertEra.mockResolvedValue({
      id: 50,
      name: 'E',
      leagueId: 3,
      rulesSetIds: [7],
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      createdAt: new Date(),
      created: true,
    });
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: 3 });
    refResolver.resolveRefs.mockReturnValue([7]);
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.eras = [
      {
        name: 'E',
        league: { system: 'Name', id: 'name:l' },
        rulesSets: [{ system: 'Name', id: 'name:crp' }],
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        externalIds: [{ system: 'Name', id: 'name:e' }],
      },
    ];

    await processor.process(makeContext(data, new ExternalIdMap()));

    expect(eras.upsertEra.mock.calls[0][0]).toMatchObject({
      endDate: '2024-12-31',
    });
  });

  // Resolution-failure counting (how many ImportErrors get recorded) is the
  // resolver's own behaviour and is covered by reference-resolver.service.spec.ts.
  // This test instead asserts the processor's own logic: when either resolver
  // call signals failure it must skip the entry (no upsert) and never reach
  // toExternalIds.
  it('skips the era and never upserts when a reference is unresolved', async () => {
    refResolver.resolveOptionalRef.mockReturnValue({ ok: false });
    refResolver.resolveRefs.mockReturnValue(undefined);
    const data = emptyData();
    data.eras = [
      {
        name: 'Orphan',
        league: { system: 'Name', id: 'name:missing-league' },
        rulesSets: [{ system: 'Name', id: 'name:missing-crp' }],
        startDate: '2024-01-01',
        externalIds: [{ system: 'Name', id: 'name:orphan' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(eras.upsertEra).not.toHaveBeenCalled();
    expect(refResolver.toExternalIds).not.toHaveBeenCalled();
  });

  it('passes leagueId, dates and an empty rules-set list through for a rename-only entry', async () => {
    eras.upsertEra.mockResolvedValue({
      id: 55,
      name: 'First era',
      leagueId: 0,
      rulesSetIds: [],
      startDate: '',
      endDate: null,
      createdAt: new Date(),
      created: true,
    });
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: undefined });
    refResolver.resolveRefs.mockReturnValue([]);
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.eras = [
      {
        name: 'First era',
        rulesSets: [],
        externalIds: [{ system: 'Name', id: 'First era' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(refResolver.resolveRef).not.toHaveBeenCalled();
    expect(eras.upsertEra).toHaveBeenCalledWith(
      {
        name: 'First era',
        leagueId: undefined,
        rulesSetIds: [],
        startDate: undefined,
        endDate: undefined,
        externalIds: [],
      },
      ctx.errors,
    );
  });
});
