import { TeamsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { TeamsProcessor } from './teams.processor';

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

function makeContext(data: ManualDataFile): ProcessContext {
  return {
    data,
    systemIds: new Map([['Name', 2]]),
    errors: [],
  };
}

describe('TeamsProcessor', () => {
  let processor: TeamsProcessor;
  let teams: MockProxy<TeamsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    teams = mock<TeamsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsProcessor,
        { provide: TeamsImportService, useValue: teams },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(TeamsProcessor);
  });

  it('resolves race, coach, and era refs and upserts', async () => {
    teams.upsert.mockResolvedValue({
      id: 99,
      name: 'Grave Diggers',
      raceId: 40,
      coachId: 12,
      eras: [{ id: 1, eraId: 50 }],
      createdAt: new Date(),
      created: true,
    });
    // Calls happen in the order the processor makes them: race, then coach.
    refResolver.resolveOptionalRef
      .mockResolvedValueOnce({ ok: true, id: 40 }) // race
      .mockResolvedValueOnce({ ok: true, id: 12 }); // coach
    refResolver.resolveRefs.mockResolvedValue([50]);
    const cannedExternalIds = [
      { externalSystemId: 99, externalId: 'canned:grave-diggers' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
    const data = emptyData();
    data.teams = [
      {
        name: 'Grave Diggers',
        race: { system: 'Name', id: 'name:necromantic' },
        coach: { system: 'Name', id: 'name:bob' },
        eras: [{ system: 'Name', id: 'name:season-12' }],
        externalIds: [{ system: 'Name', id: 'name:grave-diggers' }],
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    // Each canned resolver output must land in the field the processor
    // says it belongs to (raceId vs coachId), not just be passed through.
    expect(teams.upsert).toHaveBeenCalledWith(
      {
        name: 'Grave Diggers',
        raceId: 40,
        coachId: 12,
        eras: [50],
        externalIds: cannedExternalIds,
      },
      ctx.errors,
    );
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: data.teams[0].race, kind: 'race' }),
    );
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: data.teams[0].coach, kind: 'coach' }),
    );
    expect(refResolver.resolveRefs).toHaveBeenCalledWith(
      expect.objectContaining({ refs: data.teams[0].eras, kind: 'era' }),
    );
  });

  it('upserts a team with no eras', async () => {
    teams.upsert.mockResolvedValue({
      id: 100,
      name: 'T',
      raceId: 40,
      coachId: 12,
      eras: [],
      createdAt: new Date(),
      created: true,
    });
    refResolver.resolveOptionalRef
      .mockResolvedValueOnce({ ok: true, id: 40 })
      .mockResolvedValueOnce({ ok: true, id: 12 });
    refResolver.resolveRefs.mockResolvedValue([]);
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.teams = [
      {
        name: 'T',
        race: { system: 'Name', id: 'name:necromantic' },
        coach: { system: 'Name', id: 'name:bob' },
        eras: [],
        externalIds: [{ system: 'Name', id: 'name:t' }],
      },
    ];

    const count = await processor.process(makeContext(data));

    expect(count).toBe(1);
    expect(teams.upsert.mock.calls[0][0]).toMatchObject({ eras: [] });
  });

  // Resolution-failure error counting is the resolver's own behaviour and is
  // covered by reference-resolver.service.spec.ts. This test instead asserts
  // the processor's own logic: it must skip the entry (no upsert) and never
  // reach toExternalIds when any reference fails to resolve.
  it('skips the team and never upserts when references are unresolved', async () => {
    refResolver.resolveOptionalRef.mockResolvedValue({ ok: false });
    refResolver.resolveRefs.mockResolvedValue(undefined);
    const data = emptyData();
    data.teams = [
      {
        name: 'Orphan',
        race: { system: 'Name', id: 'name:missing-race' },
        coach: { system: 'Name', id: 'name:missing-coach' },
        eras: [{ system: 'Name', id: 'name:missing-era' }],
        externalIds: [{ system: 'Name', id: 'name:orphan' }],
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(teams.upsert).not.toHaveBeenCalled();
    expect(refResolver.toExternalIds).not.toHaveBeenCalled();
  });

  it('passes raceId and coachId through as undefined for a rename-only entry', async () => {
    teams.upsert.mockResolvedValue({
      id: 42,
      name: 'Gyttjevrålarna FC',
      raceId: 0,
      coachId: 0,
      eras: [],
      createdAt: new Date(),
      created: true,
    });
    refResolver.resolveOptionalRef.mockResolvedValue({
      ok: true,
      id: undefined,
    });
    refResolver.resolveRefs.mockResolvedValue([]);
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.teams = [
      {
        name: 'Gyttjevrålarna FC',
        eras: [],
        externalIds: [{ system: 'Name', id: 'gyttjevralarna' }],
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(refResolver.resolveRef).not.toHaveBeenCalled();
    expect(teams.upsert).toHaveBeenCalledWith(
      {
        name: 'Gyttjevrålarna FC',
        raceId: undefined,
        coachId: undefined,
        eras: [],
        externalIds: [],
      },
      ctx.errors,
    );
  });

  it('still skips the entry when a supplied race ref cannot be resolved', async () => {
    refResolver.resolveOptionalRef
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, id: 8 });
    refResolver.resolveRefs.mockResolvedValue([]);
    const data = emptyData();
    data.teams = [
      {
        name: 'Orphan Team',
        race: { system: 'Name', id: 'missing-race' },
        coach: { system: 'Name', id: 'bob' },
        eras: [],
        externalIds: [{ system: 'Name', id: 'orphan' }],
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(teams.upsert).not.toHaveBeenCalled();
  });
});
