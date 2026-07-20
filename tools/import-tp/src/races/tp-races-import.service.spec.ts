import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemBootstrapService,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpRacesImportService } from './tp-races-import.service';

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRace: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  bootstrap,
  upsertRace,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpRacesImportService(
    { upsertRace } as unknown as RacesImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

interface RosterOpts {
  id: number;
  teamRace: string;
  raceName: string;
  positions?: { tpPositionId: number; name: string }[];
  coachTpId?: string;
}

function rosterEntry(era: string, opts: RosterOpts): RosterEntry {
  return {
    era,
    roster: {
      id: opts.id,
      teamName: `Team ${opts.id}`,
      teamRaceCode: opts.teamRace,
      raceName: opts.raceName,
      coachTpId: opts.coachTpId ?? 'coach-1',
      positions: opts.positions ?? [],
    },
  };
}

function raceRecord(id: number) {
  return { id, name: 'X', eras: [], createdAt: new Date(), created: true };
}

function twoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}

describe('TpRacesImportService', () => {
  it('upserts a single-code race with its TP id, Name id and era', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const bootstrap = twoSystemUpsertMock();
    const service = makeService({
      bootstrap,
      upsertRace,
    });

    const { result, raceIdsByTeamRaceCode } = await service.importRaces(
      [
        rosterEntry('Fourth era', {
          id: 1,
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
        }),
      ],
      new Map([['Fourth era', 100]]),
    );

    expect(bootstrap).toHaveBeenCalledWith(['TP', 'Name']);
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
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { raceIdsByTeamRaceCode } = await service.importRaces(
      [
        rosterEntry('Fourth era', {
          id: 1,
          teamRace: 'Dwarf',
          raceName: 'Dwarf',
        }),
        rosterEntry('Fifth era', {
          id: 2,
          teamRace: 'Dwarf_BB2025',
          raceName: 'Dwarf',
        }),
      ],
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
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    await service.importRaces(
      [
        rosterEntry('Fourth era', { id: 1, teamRace: 'Orc', raceName: 'Orc' }),
        rosterEntry('Fifth era', { id: 2, teamRace: 'Orc', raceName: 'Orc' }),
      ],
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

  it('records an error for a roster under an unknown era but still upserts the race', async () => {
    const upsertRace = vi.fn().mockResolvedValue(raceRecord(50));
    const service = makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertRace,
    });

    const { result } = await service.importRaces(
      [rosterEntry('Ghost era', { id: 1, teamRace: 'Orc', raceName: 'Orc' })],
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
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP', 'Name'] },
          message: 'network timeout',
        },
      }),
      upsertRace,
    });

    const { result } = await service.importRaces(
      [rosterEntry('Fourth era', { id: 1, teamRace: 'Orc', raceName: 'Orc' })],
      new Map([['Fourth era', 100]]),
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertRace).not.toHaveBeenCalled();
  });
});
