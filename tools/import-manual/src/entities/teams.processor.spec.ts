import { TeamsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { mockReferenceResolver } from './reference-resolver-mock.test-helpers';
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

function seededMap(): ExternalIdMap {
  const idMap = new ExternalIdMap();
  idMap.add([{ system: 'Name', id: 'name:necromantic' }], 40);
  idMap.add([{ system: 'Name', id: 'name:bob' }], 12);
  idMap.add([{ system: 'Name', id: 'name:season-12' }], 50);
  return idMap;
}

describe('TeamsProcessor', () => {
  let processor: TeamsProcessor;
  let teams: MockProxy<TeamsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    teams = mock<TeamsImportService>();
    refResolver = mockReferenceResolver();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsProcessor,
        { provide: TeamsImportService, useValue: teams },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(TeamsProcessor);
  });

  it('resolves race, coach, and era refs, upserts, and records ids', async () => {
    teams.upsertTeam.mockResolvedValue({
      id: 99,
      name: 'Grave Diggers',
      raceId: 40,
      coachId: 12,
      eras: [{ id: 1, eraId: 50 }],
      createdAt: new Date(),
      created: true,
    });
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
    const ctx = makeContext(data, seededMap());

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.upsertTeam).toHaveBeenCalledWith(
      {
        name: 'Grave Diggers',
        raceId: 40,
        coachId: 12,
        eras: [50],
        externalIds: [
          { externalSystemId: 2, externalId: 'name:grave-diggers' },
        ],
      },
      ctx.errors,
    );
    expect(
      ctx.idMap.resolve({ system: 'Name', id: 'name:grave-diggers' }),
    ).toBe(99);
  });

  it('upserts a team with no eras', async () => {
    teams.upsertTeam.mockResolvedValue({
      id: 100,
      name: 'T',
      raceId: 40,
      coachId: 12,
      eras: [],
      createdAt: new Date(),
      created: true,
    });
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

    const count = await processor.process(makeContext(data, seededMap()));

    expect(count).toBe(1);
    expect(teams.upsertTeam.mock.calls[0][0]).toMatchObject({ eras: [] });
  });

  it('skips the team and records errors when references are unresolved', async () => {
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
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.upsertTeam).not.toHaveBeenCalled();
    expect(ctx.errors.length).toBe(3);
  });
});
