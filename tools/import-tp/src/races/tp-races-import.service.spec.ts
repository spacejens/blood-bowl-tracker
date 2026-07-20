import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemsImportService,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { TpSourceFile, TpSourceReader } from '../source/tp-source-reader';
import { TpRacesImportService } from './tp-races-import.service';

interface MakeServiceOptions {
  files: () => AsyncIterable<TpSourceFile>;
  upsertExternalSystem: ReturnType<typeof vi.fn>;
  upsertRace: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  files,
  upsertExternalSystem,
  upsertRace,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpRacesImportService(
    { files } as unknown as TpSourceReader,
    new RosterParserService(),
    { upsertRace } as unknown as RacesImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

function makeFiles(entries: TpSourceFile[]): () => AsyncIterable<TpSourceFile> {
  return async function* () {
    await Promise.resolve();
    for (const entry of entries) {
      yield entry;
    }
  };
}

interface RosterOpts {
  id: number;
  teamRace: string;
  raceName: string;
  positions?: { tpPositionId: number; name: string }[];
  coachTpId?: string;
}

function rosterFile(
  era: string,
  competition: string,
  opts: RosterOpts,
): TpSourceFile {
  return {
    era,
    competition,
    type: 'rosters',
    filename: `rosters_${opts.id}.json`,
    content: {
      id: opts.id,
      teamName: `Team ${opts.id}`,
      teamRace: opts.teamRace,
      player: { applicationUserId: opts.coachTpId ?? 'coach-1' },
      rosterMaster: {
        name: opts.raceName,
        starPlayersMasters: [],
        lineUpMasters: (opts.positions ?? []).map((p) => ({
          id: p.tpPositionId,
          position: p.name,
        })),
      },
    },
  };
}

function raceRecord(id: number) {
  return { id, name: 'X', eras: [], createdAt: new Date(), created: true };
}

function twoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
}

describe('TpRacesImportService', () => {
  it('upserts a single-code race with its TP id, Name id and era', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', 'comp', {
          id: 1,
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertRace,
    });

    const { result, raceIdsByTeamRaceCode } = await service.importRaces(
      new Map([['Fourth era', 100]]),
    );

    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(upsertRace).toHaveBeenCalledTimes(1);
    expect(upsertRace).toHaveBeenCalledWith(
      {
        name: 'Dwarf',
        eras: [100],
        externalIds: [
          { externalSystemId: 1, externalId: 'Dwarf_BB2025' },
          { externalSystemId: 2, externalId: 'Dwarf' },
        ],
      },
      expect.any(Array),
    );
    expect(raceIdsByTeamRaceCode.get('Dwarf_BB2025')).toBe(50);
  });

  it('merges multiple codes for one race name into a single upsert call', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', 'comp-a', {
          id: 1,
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
        }),
        rosterFile('Fifth era', 'comp-b', {
          id: 2,
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertRace,
    });

    const { raceIdsByTeamRaceCode } = await service.importRaces(
      new Map([
        ['Fourth era', 100],
        ['Fifth era', 200],
      ]),
    );

    expect(upsertRace).toHaveBeenCalledTimes(1);
    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.name).toBe('Dwarf');
    expect(data.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Dwarf' },
      { externalSystemId: 1, externalId: 'Dwarf_BB2025' },
      { externalSystemId: 2, externalId: 'Dwarf' },
    ]);
    expect(data.eras).toEqual([100, 200]);
    expect(raceIdsByTeamRaceCode.get('Dwarf')).toBe(50);
    expect(raceIdsByTeamRaceCode.get('Dwarf_BB2025')).toBe(50);
  });

  it('accumulates eras when one code appears under multiple eras', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', 'comp-a', {
          id: 1,
          teamRace: 'Orc',
          raceName: 'Orc',
        }),
        rosterFile('Fifth era', 'comp-b', {
          id: 2,
          teamRace: 'Orc',
          raceName: 'Orc',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces(
      new Map([
        ['Fourth era', 100],
        ['Fifth era', 200],
      ]),
    );

    const data = upsertRace.mock.calls[0][0] as UpsertRace;
    expect(data.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Orc' },
      { externalSystemId: 2, externalId: 'Orc' },
    ]);
    expect(data.eras).toEqual([100, 200]);
  });

  it('records a parse error for one bad roster file but imports the rest', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = makeService({
      files: makeFiles([
        {
          era: 'Fourth era',
          competition: 'comp',
          type: 'rosters',
          filename: 'rosters_bad.json',
          content: { id: 9, teamName: 'T', teamRace: 'Orc' }, // no rosterMaster
        },
        rosterFile('Fourth era', 'comp', {
          id: 1,
          teamRace: 'Orc',
          raceName: 'Orc',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertRace,
    });

    const { result } = await service.importRaces(
      new Map([['Fourth era', 100]]),
    );

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('rosters_bad.json')),
    ).toBe(true);
  });

  it('records an error for a roster under an unknown era but still upserts the race', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = makeService({
      files: makeFiles([
        rosterFile('Ghost era', 'comp', {
          id: 1,
          teamRace: 'Orc',
          raceName: 'Orc',
        }),
      ]),
      upsertExternalSystem: twoSystemUpsertMock(),
      upsertRace,
    });

    const { result } = await service.importRaces(
      new Map([['Fourth era', 100]]),
    );

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Ghost era'))).toBe(
      true,
    );
    expect((upsertRace.mock.calls[0][0] as UpsertRace).eras).toEqual([]);
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertRace = vi.fn();
    const service = makeService({
      files: makeFiles([
        rosterFile('Fourth era', 'comp', {
          id: 1,
          teamRace: 'Orc',
          raceName: 'Orc',
        }),
      ]),
      upsertExternalSystem: vi
        .fn()
        .mockRejectedValue(new Error('network timeout')),
      upsertRace,
    });

    const { result } = await service.importRaces(
      new Map([['Fourth era', 100]]),
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertRace).not.toHaveBeenCalled();
  });
});
