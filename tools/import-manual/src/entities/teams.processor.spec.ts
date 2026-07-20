import type {
  ImportError,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
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
    errors: [] as ImportError[],
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
  it('resolves race, coach, and era refs, upserts, and records ids', async () => {
    const upsertTeam = vi.fn().mockResolvedValue({ id: 99 });
    const processor = new TeamsProcessor({
      upsertTeam,
    } as unknown as TeamsImportService);
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
    expect(upsertTeam).toHaveBeenCalledWith(
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
    const upsertTeam = vi.fn().mockResolvedValue({ id: 100 });
    const processor = new TeamsProcessor({
      upsertTeam,
    } as unknown as TeamsImportService);
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
    expect(upsertTeam.mock.calls[0][0]).toMatchObject({ eras: [] });
  });

  it('skips the team and records errors when references are unresolved', async () => {
    const upsertTeam = vi.fn();
    const processor = new TeamsProcessor({
      upsertTeam,
    } as unknown as TeamsImportService);
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
    expect(upsertTeam).not.toHaveBeenCalled();
    expect(ctx.errors.length).toBe(3);
  });
});
