import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type {
  ExternalSystemBootstrapService,
  PlayersImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import type { BblPage } from '../source/bbl-page.types';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { NormalizeExtractedTextService } from '../source/normalize-extracted-text.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblPlayersImportService } from './bbl-players-import.service';
import type { BblPlayer } from './player-page-parser';
import { PlayerPageParser } from './player-page-parser';

const normalizeText = new NormalizeExtractedTextService();

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
  const parser = new PlayerPageParser(normalizeText);
  vi.spyOn(parser, 'extractPlayer').mockImplementation(
    (p) => JSON.parse(p.params.player) as BblPlayer | null,
  );
  return parser;
}

function externalSystemsOk() {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1] });
}

const team: UpsertTeam = {
  name: 'Knights',
  raceId: 70, // DB race id
  coachId: 9,
  eras: [],
  externalIds: [],
};
const teamsByCode = new Map<string, UpsertTeam>([['knu', team]]);
const racesByBblId = new Map<string, { id: number; name: string }>([
  ['7', { id: 70, name: 'Goblin Team' }],
]);
const positionIdsByBblId = new Map<string, number>([['33-7', 200]]);
const eraIdsByName = new Map<string, number>([['LRB', 500]]);

function makeService(
  reader: BblSourceReader,
  opts: {
    bootstrap?: ReturnType<typeof vi.fn>;
    upsertTeam?: ReturnType<typeof vi.fn>;
    upsertPlayerResult?: ReturnType<typeof vi.fn>;
    eras?: EraConfig[];
  } = {},
) {
  const bootstrap = opts.bootstrap ?? externalSystemsOk();
  const upsertTeam =
    opts.upsertTeam ??
    vi.fn().mockResolvedValue({ eras: [{ id: 5000, eraId: 500 }] });
  const upsertPlayerResult =
    opts.upsertPlayerResult ?? vi.fn().mockResolvedValue({ id: 900 });
  const eras: EraConfig[] = opts.eras ?? [
    {
      identity: { name: 'LRB', rulesSets: ['LRB'] },
      dates: { startDate: '2011-09-09', autoAssignByDate: true },
      players: {
        firstPlayerId: 1,
        lastPlayerId: 9999,
        autoAssignByPlayerId: true,
      },
    },
  ];
  const service = new BblPlayersImportService(
    reader,
    makeParser(),
    { upsertPlayerResult } as unknown as PlayersImportService,
    { upsertTeam } as unknown as TeamsImportService,
    { getEras: () => eras } as unknown as EraConfigService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    {
      getBblSystemName: () => 'BBL',
    } as unknown as ExternalSystemNameConfigService,
    new ImportResultService(),
    new PageParseErrorService(new ImportResultService()),
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
    const bootstrap = externalSystemsOk();
    const { service, upsertTeam, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      { bootstrap },
    );

    const { result, playerIdsByPid, positionsUsedByEra, racesActiveByEra } =
      await service.importPlayers({
        teamsByCode,
        positionIdsByBblId,
        racesByBblId,
        eraIdsByName,
      });

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(bootstrap).toHaveBeenCalledWith(
      [{ name: 'BBL', category: 'imported_data_source' }],
      'Failed to upsert external system: ',
    );
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
    // positionId 200, eraId 500 (from eraIdsByName), team.raceId 70.
    expect(positionsUsedByEra).toEqual(new Set(['200:500']));
    expect(racesActiveByEra).toEqual(new Set(['70:500']));
  });

  it('resolves the era via playerIdOverrides when the pid is outside every range', async () => {
    const { service, upsertTeam, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        eras: [
          {
            identity: { name: 'Second', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 100,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
          },
          {
            identity: { name: 'LRB', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 10,
              autoAssignByPlayerId: true,
              playerIdOverrides: [42],
            },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

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
          {
            identity: { name: 'LRB', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
          },
          {
            identity: { name: 'Second', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
              playerIdOverrides: [42],
            },
          },
        ],
      },
    );

    await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName: otherEraIdsByName,
    });

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
          {
            identity: { name: 'Regular', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
          },
          {
            identity: { name: 'Stunty', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
            teams: { teamCodeOverrides: ['knu'] },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName: overrideEraIds,
    });

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('pins a player to a second-league era via its team-code override', async () => {
    // goodPlayer has pid 42 and teamCode 'knu'. Its pid falls within the
    // tLoEG era's pid range, but 'knu' is pinned to the GBBL era (a distinct
    // league) via teamCodeOverrides, which must win over the pid-range match
    // — proving overrides route correctly across league boundaries.
    const overrideEraIds = new Map<string, number>([
      ['LRB', 500],
      ['GBBL 1', 700],
    ]);
    const { service, upsertTeam } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 7000, eraId: 700 }] }),
        eras: [
          {
            leagueName: 'tLoEG',
            identity: { name: 'LRB', rulesSets: ['LRB'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
          },
          {
            leagueName: 'GBBL',
            identity: { name: 'GBBL 1', rulesSets: ['BB2016'] },
            dates: {
              startDate: '2019-08-03',
              endDate: '2019-11-13',
              autoAssignByDate: false,
            },
            players: { autoAssignByPlayerId: false },
            teams: { teamCodeOverrides: ['knu'] },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName: overrideEraIds,
    });

    expect(result.imported).toBe(1);
    // Pinned to the GBBL era's team era (eraId 700), not the tLoEG pid-range
    // era (500).
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [700] },
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
            identity: { name: 'Pid Era', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
              playerIdOverrides: [42],
            },
          },
          {
            identity: { name: 'Team Era', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
            teams: { teamCodeOverrides: ['knu'] },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName: overrideEraIds,
    });

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [600] },
      expect.any(Array),
    );
  });

  it('excludes an autoAssignByPlayerId:false era from the pid-range scan but still honors its teamCodeOverrides', async () => {
    // 'knu' (goodPlayer.teamCode) is pinned to the override-only Side era via
    // teamCodeOverrides. Side has no pid range and autoAssignByPlayerId:false,
    // so nothing else can land there; the pid 42 would otherwise match Main.
    const overrideEraIds = new Map<string, number>([
      ['Main', 400],
      ['Side', 500],
    ]);
    const { service, upsertTeam } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 5000, eraId: 500 }] }),
        eras: [
          {
            identity: { name: 'Main', rulesSets: ['LRB'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
          },
          {
            identity: { name: 'Side', rulesSets: ['CRP'] },
            dates: {
              startDate: '2016-03-12',
              endDate: '2016-11-26',
              autoAssignByDate: false,
            },
            players: { autoAssignByPlayerId: false },
            teams: { teamCodeOverrides: ['knu'] },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName: overrideEraIds,
    });

    expect(result.imported).toBe(1);
    // Pinned to Side (eraId 500), not Main, via team code.
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
  });

  it('skips an autoAssignByPlayerId:false era in the pid-range scan even when its range also matches', async () => {
    // Both "Disabled" and "Enabled" cover pid 42 via firstPlayerId/lastPlayerId,
    // and neither uses teamCodeOverrides or playerIdOverrides for this player,
    // so resolution must fall all the way through to the pid-range
    // `eras.find(...)` scan. "Disabled" is listed FIRST and would be picked if
    // the autoAssignByPlayerId guard were not applied; this proves the guard
    // itself causes eras.find to skip past it to "Enabled".
    const overrideEraIds = new Map<string, number>([
      ['Disabled', 400],
      ['Enabled', 500],
    ]);
    const { service, upsertTeam } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 5000, eraId: 500 }] }),
        eras: [
          {
            identity: { name: 'Disabled', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: false,
            },
          },
          {
            identity: { name: 'Enabled', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName: overrideEraIds,
    });

    expect(result.imported).toBe(1);
    // Lands in "Enabled" (eraId 500), proving "Disabled" was genuinely
    // skipped by the range scan rather than merely checked-and-not-matching.
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
  });

  it('resolves via playerIdOverrides even when the pinned era has autoAssignByPlayerId:false', async () => {
    // The playerIdOverrides lookup is built independently of the
    // autoAssignByPlayerId flag, so a pid pinned to a flagged-off era must
    // still resolve to it — the flag only affects the pid-range fallback.
    const overrideEraIds = new Map<string, number>([['Pinned', 500]]);
    const { service, upsertTeam } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 5000, eraId: 500 }] }),
        eras: [
          {
            identity: { name: 'Pinned', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              autoAssignByPlayerId: false,
              playerIdOverrides: [42],
            },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName: overrideEraIds,
    });

    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
  });

  it('matches a pid >= firstPlayerId against an era with no lastPlayerId (still ongoing, no upper bound)', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        eras: [
          {
            identity: { name: 'LRB', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: { firstPlayerId: 1, autoAssignByPlayerId: true },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

    expect(result.imported).toBe(1);
    expect(upsertPlayerResult).toHaveBeenCalled();
  });

  it('skips and records an error when no era range contains the pid', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        eras: [
          {
            identity: { name: 'LRB', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 10,
              autoAssignByPlayerId: true,
            },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team code is unknown', async () => {
    const { service } = makeService(
      makeReader([plPage({ ...goodPlayer, teamCode: 'zzz' })]),
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('skips and records an error when no position matches the composite key', async () => {
    const { service } = makeService(
      makeReader([plPage({ ...goodPlayer, typId: '99' })]),
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('records an error and returns early when external systems fail', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        bootstrap: vi.fn().mockResolvedValue({
          ok: false,
          error: {
            item: { externalSystems: ['BBL'] },
            message: 'Failed to upsert external system: network timeout',
          },
        }),
      },
    );

    const { result, playerIdsByPid } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through with this caller's prefix: the assertion now
    // fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe(
      'Failed to upsert external system: network timeout',
    );
    // Players bootstraps only the BBL external system (no Name system).
    expect(result.errors[0].item).toEqual({ externalSystems: ['BBL'] });
    expect(playerIdsByPid.size).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('records an error and skips players the parser cannot read', async () => {
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(null, '388')]),
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

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

    const { result, playerIdsByPid } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

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
          {
            identity: { name: 'Unimported Era', rulesSets: ['X'] },
            dates: { startDate: '2011-09-09', autoAssignByDate: true },
            players: {
              firstPlayerId: 1,
              lastPlayerId: 9999,
              autoAssignByPlayerId: true,
            },
          },
        ],
      },
    );

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

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

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

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

    const { result } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team race has no BBL id mapping', async () => {
    const unmappedRaceTeam: UpsertTeam = { ...team, raceId: 999 };
    const localTeamsByCode = new Map<string, UpsertTeam>([
      ['knu', unmappedRaceTeam],
    ]);
    const { service, upsertPlayerResult } = makeService(
      makeReader([plPage(goodPlayer)]),
    );

    const { result } = await service.importPlayers({
      teamsByCode: localTeamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

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

    const { result, playerIdsByPid } = await service.importPlayers({
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    });

    expect(result.imported).toBe(0);
    expect(playerIdsByPid.size).toBe(0);
    expect(upsertPlayerResult).toHaveBeenCalled();
  });

  it('contributes no usage keys for a skipped or errored player', async () => {
    const { service } = makeService(
      makeReader([plPage({ ...goodPlayer, teamCode: 'zzz' })]),
    );

    const { positionsUsedByEra, racesActiveByEra } =
      await service.importPlayers({
        teamsByCode,
        positionIdsByBblId,
        racesByBblId,
        eraIdsByName,
      });

    expect(positionsUsedByEra.size).toBe(0);
    expect(racesActiveByEra.size).toBe(0);
  });
});
