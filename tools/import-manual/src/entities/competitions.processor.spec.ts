import { CompetitionsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { CompetitionsProcessor } from './competitions.processor';

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

describe('CompetitionsProcessor', () => {
  let processor: CompetitionsProcessor;
  let competitions: MockProxy<CompetitionsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    competitions = mock<CompetitionsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionsProcessor,
        { provide: CompetitionsImportService, useValue: competitions },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(CompetitionsProcessor);
  });

  it('resolves the era ref, upserts, and records the id', async () => {
    competitions.upsertCompetitionResult.mockResolvedValue({ id: 77 });
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: 3 });
    const cannedExternalIds = [
      { externalSystemId: 99, externalId: 'canned:major-season-12' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
    const data = emptyData();
    data.competitions = [
      {
        name: 'Major Season 12',
        type: 'season',
        era: { system: 'Name', id: 'name:first-era' },
        externalIds: [{ system: 'Name', id: 'name:season-12' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: data.competitions[0].era }),
    );
    // The processor must wire each canned resolver output into the exact field
    // the upsert call expects -- not just pass some id through.
    expect(competitions.upsertCompetitionResult).toHaveBeenCalledWith(
      {
        name: 'Major Season 12',
        type: 'season',
        eraId: 3,
        teamEraIds: [],
        externalIds: cannedExternalIds,
      },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:season-12' })).toBe(
      77,
    );
  });

  it('passes a cup type through unchanged', async () => {
    competitions.upsertCompetitionResult.mockResolvedValue({ id: 78 });
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: 4 });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.competitions = [
      {
        name: 'Ogretoberfest 10',
        type: 'cup',
        era: { system: 'Name', id: 'name:second-era' },
        externalIds: [{ system: 'Name', id: 'name:ogre-10' }],
      },
    ];

    await processor.process(makeContext(data, new ExternalIdMap()));

    expect(competitions.upsertCompetitionResult.mock.calls[0][0]).toMatchObject(
      { type: 'cup', eraId: 4 },
    );
  });

  // Resolution-failure counting (how many ImportErrors get recorded) is the
  // resolver's own behaviour and is covered by
  // reference-resolver.service.spec.ts. This test instead asserts the
  // processor's own logic: an unresolved era must skip the entry (no upsert)
  // and never reach toExternalIds.
  it('skips the competition and never upserts when the era is unresolved', async () => {
    refResolver.resolveOptionalRef.mockReturnValue({ ok: false });
    const data = emptyData();
    data.competitions = [
      {
        name: 'Orphan Cup',
        type: 'cup',
        era: { system: 'Name', id: 'name:missing-era' },
        externalIds: [{ system: 'Name', id: 'name:orphan-cup' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(competitions.upsertCompetitionResult).not.toHaveBeenCalled();
    expect(refResolver.toExternalIds).not.toHaveBeenCalled();
  });

  it('passes eraId and type through as undefined for a rename-only entry', async () => {
    competitions.upsertCompetitionResult.mockResolvedValue({ id: 77 });
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: undefined });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.competitions = [
      {
        name: 'Major Season 12',
        externalIds: [{ system: 'tloeg.bbleague.se', id: '35' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    // resolveRef is the non-optional variant: a rename-only entry must never
    // reach it.
    expect(refResolver.resolveRef).not.toHaveBeenCalled();
    expect(competitions.upsertCompetitionResult).toHaveBeenCalledWith(
      {
        name: 'Major Season 12',
        type: undefined,
        eraId: undefined,
        teamEraIds: [],
        externalIds: [],
      },
      ctx.errors,
    );
  });

  it('does not count or record an id when the upsert fails', async () => {
    competitions.upsertCompetitionResult.mockResolvedValue(undefined);
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: 3 });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.competitions = [
      {
        name: 'Doomed',
        type: 'cup',
        era: { system: 'Name', id: 'name:first-era' },
        externalIds: [{ system: 'Name', id: 'name:doomed' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(
      ctx.idMap.resolve({ system: 'Name', id: 'name:doomed' }),
    ).toBeUndefined();
  });
});
