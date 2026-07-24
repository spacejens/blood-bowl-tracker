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
import { mockReferenceResolver } from './reference-resolver-mock.test-helpers';

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

describe('ErasProcessor', () => {
  let processor: ErasProcessor;
  let eras: MockProxy<ErasImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    eras = mock<ErasImportService>();
    refResolver = mockReferenceResolver();
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
    const idMap = new ExternalIdMap();
    idMap.add([{ system: 'Name', id: 'name:my-league' }], 3);
    idMap.add([{ system: 'Name', id: 'name:crp' }], 7);
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
    const ctx = makeContext(data, idMap);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.upsertEra).toHaveBeenCalledWith(
      {
        name: 'Season 12',
        leagueId: 3,
        rulesSetIds: [7],
        startDate: '2024-01-01',
        endDate: undefined,
        externalIds: [{ externalSystemId: 2, externalId: 'name:season-12' }],
      },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:season-12' })).toBe(
      50,
    );
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
    const idMap = new ExternalIdMap();
    idMap.add([{ system: 'Name', id: 'name:l' }], 3);
    idMap.add([{ system: 'Name', id: 'name:crp' }], 7);
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

    await processor.process(makeContext(data, idMap));

    expect(eras.upsertEra.mock.calls[0][0]).toMatchObject({
      endDate: '2024-12-31',
    });
  });

  it('skips the era and records errors when a reference is unresolved', async () => {
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
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(eras.upsertEra).not.toHaveBeenCalled();
    expect(ctx.errors.length).toBe(2);
  });
});
