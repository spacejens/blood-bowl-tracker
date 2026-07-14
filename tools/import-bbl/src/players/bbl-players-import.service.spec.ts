import type {
  ExternalSystemsImportService,
  PlayersImportService,
  TeamsImportService,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfigService } from '../eras/era-config.service';
import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblPlayersImportService } from './bbl-players-import.service';
import type { BblPlayer } from './player-page-parser';
import { PlayerPageParser } from './player-page-parser';

function plPage(player: BblPlayer | null, pid = '388'): BblPage {
  return {
    type: 'pl',
    params: { player: JSON.stringify(player), pid },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function makeReader(pl: BblPage[]): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages(type: string) {
      const list = type === 'pl' ? pl : [];
      for (const p of list) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

function makeParser() {
  const parser = new PlayerPageParser();
  vi.spyOn(parser, 'extractPlayer').mockImplementation(
    (p) => JSON.parse(p.params.player) as BblPlayer | null,
  );
  return parser;
}

function externalSystemsOk() {
  return vi.fn().mockResolvedValueOnce(1);
}

const team: UpsertTeamData = {
  name: 'Knights',
  raceId: 70, // DB race id
  coachId: 9,
  eras: [],
  externalIds: [],
};
const teamsByCode = new Map<string, UpsertTeamData>([['knu', team]]);
const racesByBblId = new Map<string, { id: number; name: string }>([
  ['7', { id: 70, name: 'Goblin Team' }],
]);
const positionIdsByBblId = new Map<string, number>([['33-7', 200]]);
const eraIdsByName = new Map<string, number>([['LRB', 500]]);

function makeService(
  reader: BblSourceReader,
  opts: {
    upsertExternalSystem?: ReturnType<typeof vi.fn>;
    upsertTeam?: ReturnType<typeof vi.fn>;
    upsertPlayerResult?: ReturnType<typeof vi.fn>;
    eras?: {
      name: string;
      firstPlayerId: number;
      lastPlayerId?: number;
      playerIdOverrides?: number[];
      teamCodeOverrides?: string[];
    }[];
  } = {},
) {
  const upsertExternalSystem = opts.upsertExternalSystem ?? externalSystemsOk();
  const upsertTeam =
    opts.upsertTeam ??
    vi.fn().mockResolvedValue({ eras: [{ id: 5000, eraId: 500 }] });
  const upsertPlayerResult =
    opts.upsertPlayerResult ?? vi.fn().mockResolvedValue({ id: 900 });
  const eras = opts.eras ?? [
    { name: 'LRB', firstPlayerId: 1, lastPlayerId: 9999 },
  ];
  const service = new BblPlayersImportService(
    reader,
    makeParser(),
    { upsertPlayerResult } as unknown as PlayersImportService,
    { upsertTeam } as unknown as TeamsImportService,
    { getEras: () => eras } as unknown as EraConfigService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    {
      getBblSystemName: () => 'BBL',
    } as unknown as ExternalSystemNameConfigService,
  );
  return { service, upsertTeam, upsertPlayerResult };
}

const goodPlayer: BblPlayer = {
  pid: '42',
  name: 'Griff Oberwald',
  typId: '33',
  teamCode: 'knu',
};

describe('BblPlayersImportService', () => {
  it('imports a resolvable player and maps its pid to the DB id', async () => {
    const { service, upsertTeam, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
    );

    const { result, playerIdsByPid } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(playerIdsByPid.get('42')).toBe(900);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: 'Griff Oberwald',
        teamEraId: 5000,
        positionId: 200,
        externalIds: [{ externalSystemId: 1, externalId: '42' }],
      },
      expect.any(Array),
    );
  });

  it('resolves the era via playerIdOverrides when the pid is outside every range', async () => {
    const { service, upsertTeam, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        eras: [
          { name: 'Second', firstPlayerId: 100, lastPlayerId: 9999 },
          {
            name: 'LRB',
            firstPlayerId: 1,
            lastPlayerId: 10,
            playerIdOverrides: [42],
          },
        ],
      },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
    expect(upsertPlayerResult).toHaveBeenCalled();
  });

  it('prefers a playerIdOverrides match over a range that would also match', async () => {
    const otherEraIdsByName = new Map<string, number>([
      ['LRB', 500],
      ['Second', 600],
    ]);
    const { service, upsertTeam } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        eras: [
          { name: 'LRB', firstPlayerId: 1, lastPlayerId: 9999 },
          {
            name: 'Second',
            firstPlayerId: 1,
            lastPlayerId: 9999,
            playerIdOverrides: [42],
          },
        ],
      },
    );

    await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      otherEraIdsByName,
    );

    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('resolves the era via teamCodeOverrides ahead of the pid range, matching the team era', async () => {
    // goodPlayer has pid 42 and teamCode 'knu'. Its pid falls in "Regular"
    // (1..9999), but 'knu' is pinned to "Stunty" via teamCodeOverrides, which
    // must win — and the upserted team era must be the Stunty era (600), the
    // same era competition resolution would assign that team.
    const overrideEraIds = new Map<string, number>([
      ['Regular', 500],
      ['Stunty', 600],
    ]);
    const { service, upsertTeam } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 6000, eraId: 600 }] }),
        eras: [
          { name: 'Regular', firstPlayerId: 1, lastPlayerId: 9999 },
          {
            name: 'Stunty',
            firstPlayerId: 1,
            lastPlayerId: 9999,
            teamCodeOverrides: ['knu'],
          },
        ],
      },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      overrideEraIds,
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('prefers teamCodeOverrides over playerIdOverrides when the two disagree', async () => {
    // goodPlayer has pid 42 and teamCode 'knu'. Pid 42 is pinned to "Pid Era"
    // via playerIdOverrides, but 'knu' is separately pinned to "Team Era" via
    // teamCodeOverrides — teamCodeOverrides must win.
    const overrideEraIds = new Map<string, number>([
      ['Pid Era', 500],
      ['Team Era', 600],
    ]);
    const { service, upsertTeam } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 6000, eraId: 600 }] }),
        eras: [
          {
            name: 'Pid Era',
            firstPlayerId: 1,
            lastPlayerId: 9999,
            playerIdOverrides: [42],
          },
          {
            name: 'Team Era',
            firstPlayerId: 1,
            lastPlayerId: 9999,
            teamCodeOverrides: ['knu'],
          },
        ],
      },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      overrideEraIds,
    );

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('matches a pid >= firstPlayerId against an era with no lastPlayerId (still ongoing, no upper bound)', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      { eras: [{ name: 'LRB', firstPlayerId: 1 }] },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(1);
    expect(upsertPlayerResult).toHaveBeenCalled();
  });

  it('skips and records an error when no era range contains the pid', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      { eras: [{ name: 'LRB', firstPlayerId: 1, lastPlayerId: 10 }] },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team code is unknown', async () => {
    const { service } = makeService(
      makeReader([plPage({ ...goodPlayer, teamCode: 'zzz' })]),
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('skips and records an error when no position matches the composite key', async () => {
    const { service } = makeService(
      makeReader([plPage({ ...goodPlayer, typId: '99' })]),
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('records an error and returns early when external systems fail', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      { upsertExternalSystem: vi.fn().mockRejectedValue(new Error('boom')) },
    );

    const { result, playerIdsByPid } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.success).toBe(false);
    expect(playerIdsByPid.size).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('records an error and skips players the parser cannot read', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(null, '388')]),
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('388');
    expect(result.errors[0]?.item).toEqual({ pid: '388' });
  });

  it('imports a player whose name is empty and maps its pid', async () => {
    const namelessPlayer: BblPlayer = {
      pid: '388',
      name: '',
      typId: '33',
      teamCode: 'knu',
    };
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(namelessPlayer)]),
    );

    const { result, playerIdsByPid } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(1);
    expect(playerIdsByPid.get('388')).toBe(900);
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: '',
        teamEraId: 5000,
        positionId: 200,
        externalIds: [{ externalSystemId: 1, externalId: '388' }],
      },
      expect.any(Array),
    );
  });

  it('skips and records an error when the pid-matched era was not imported', async () => {
    const { service, upsertTeam, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        eras: [
          { name: 'Unimported Era', firstPlayerId: 1, lastPlayerId: 9999 },
        ],
      },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertTeam).not.toHaveBeenCalled();
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips without recording its own error when the team upsert fails', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      { upsertTeam: vi.fn().mockResolvedValue(undefined) },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the upserted team has no matching era', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 5000, eraId: 999 }] }),
      },
    );

    const { result } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team race has no BBL id mapping', async () => {
    const unmappedRaceTeam: UpsertTeamData = { ...team, raceId: 999 };
    const localTeamsByCode = new Map<string, UpsertTeamData>([
      ['knu', unmappedRaceTeam],
    ]);
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
    );

    const { result } = await service.importPlayers(
      localTeamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('33-?');
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('does not count or map the player when the upsert reports failure', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      { upsertPlayerResult: vi.fn().mockResolvedValue(undefined) },
    );

    const { result, playerIdsByPid } = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(playerIdsByPid.size).toBe(0);
    expect(upsertPlayerResult).toHaveBeenCalled();
  });
});
