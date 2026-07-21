import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemBootstrapService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpTeamsImportService } from './tp-teams-import.service';

interface MakeServiceOptions {
  bootstrap: ReturnType<typeof vi.fn>;
  upsertTeam: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  bootstrap,
  upsertTeam,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpTeamsImportService(
    { upsertTeam } as unknown as TeamsImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

interface RosterOpts {
  id: number;
  teamName?: string;
  teamRace: string;
  raceName?: string;
  coachTpId: string;
}

function rosterEntry(era: string, opts: RosterOpts): RosterEntry {
  return {
    era,
    competition: 'comp',
    roster: {
      id: opts.id,
      teamName: opts.teamName ?? `Team ${opts.id}`,
      teamRaceCode: opts.teamRace,
      raceName: opts.raceName ?? 'Orc',
      coachTpId: opts.coachTpId,
      positions: [],
      starPositions: [],
      players: [],
    },
  };
}

function teamRecord(id: number) {
  return {
    id,
    name: 'X',
    raceId: 1,
    coachId: 1,
    eras: [],
    createdAt: new Date(),
    created: true,
  };
}

function twoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}

describe('TpTeamsImportService', () => {
  it('upserts a team with resolved race, coach, eras and external ids', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const bootstrap = twoSystemUpsertMock();
    const service = makeService({
      bootstrap,
      upsertTeam,
    });

    const { result } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
      },
    );

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', isBookkeeping: false },
      { name: 'Name', isBookkeeping: true },
    ]);
    expect(result.imported).toBe(1);
    expect(result.success).toBe(true);
    expect(upsertTeam).toHaveBeenCalledWith(
      {
        name: 'Da Boyz',
        raceId: 50,
        coachId: 900,
        eras: [100],
        externalIds: [
          { externalSystemId: 1, externalId: '5' },
          { externalSystemId: 2, externalId: 'Da Boyz' },
        ],
      },
      expect.any(Array),
    );
  });

  it('accumulates eras for one team seen under multiple eras', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const service = makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
        rosterEntry('Fifth era', {
          id: 5,
          teamRace: 'Orc_BB2025',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([
          ['Orc', 50],
          ['Orc_BB2025', 50],
        ]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
        eraIdsByName: new Map([
          ['Fourth era', 100],
          ['Fifth era', 200],
        ]),
      },
    );

    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect((upsertTeam.mock.calls[0][0] as UpsertTeam).eras).toEqual([
      100, 200,
    ]);
  });

  it('keeps the first-seen name/race/coach when a roster id recurs', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const service = makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
        rosterEntry('Fifth era', {
          id: 5,
          teamName: 'Renamed Boyz',
          teamRace: 'Orc_BB2025',
          coachTpId: 'guid-d',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([
          ['Orc', 50],
          ['Orc_BB2025', 60],
        ]),
        coachIdsByTpId: new Map([
          ['guid-c', 900],
          ['guid-d', 901],
        ]),
        eraIdsByName: new Map([
          ['Fourth era', 100],
          ['Fifth era', 200],
        ]),
      },
    );

    expect(upsertTeam).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Da Boyz', raceId: 50, coachId: 900 }),
      expect.any(Array),
    );
  });

  it('skips and records an error when the race cannot be resolved', async () => {
    const upsertTeam = vi.fn();
    const service = makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map(),
        coachIdsByTpId: new Map([['guid-c', 900]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
      },
    );

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve race')),
    ).toBe(true);
  });

  it('skips and records an error when the coach cannot be resolved', async () => {
    const upsertTeam = vi.fn();
    const service = makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map(),
        eraIdsByName: new Map([['Fourth era', 100]]),
      },
    );

    expect(upsertTeam).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('could not resolve coach')),
    ).toBe(true);
  });

  it('records an error for a roster under an unknown era but still upserts the team', async () => {
    const upsertTeam = vi.fn().mockResolvedValue(teamRecord(70));
    const service = makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
        rosterEntry('Ghost era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
      },
    );

    expect(upsertTeam).toHaveBeenCalledTimes(1);
    expect((upsertTeam.mock.calls[0][0] as UpsertTeam).eras).toEqual([100]);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Ghost era'))).toBe(
      true,
    );
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertTeam = vi.fn();
    const service = makeService({
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          item: { externalSystems: ['TP', 'Name'] },
          message: 'network timeout',
        },
      }),
      upsertTeam,
    });

    const { result } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
      },
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(upsertTeam).not.toHaveBeenCalled();
  });

  it('returns teamErasByRosterId with each team resolved eras keyed by roster id', async () => {
    const upsertTeam = vi.fn().mockResolvedValue({
      ...teamRecord(70),
      eras: [{ id: 700, eraId: 100 }],
    });
    const service = makeService({
      bootstrap: twoSystemUpsertMock(),
      upsertTeam,
    });

    const { teamErasByRosterId } = await service.importTeams(
      [
        rosterEntry('Fourth era', {
          id: 5,
          teamName: 'Da Boyz',
          teamRace: 'Orc',
          coachTpId: 'guid-c',
        }),
      ],
      {
        raceIdsByTeamRaceCode: new Map([['Orc', 50]]),
        coachIdsByTpId: new Map([['guid-c', 900]]),
        eraIdsByName: new Map([['Fourth era', 100]]),
      },
    );

    expect(teamErasByRosterId.get(5)).toEqual([{ id: 700, eraId: 100 }]);
  });
});
