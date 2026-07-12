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

function plPage(player: BblPlayer | null): BblPage {
  return {
    type: 'pl',
    params: { player: JSON.stringify(player) },
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
  return vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
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
    upsertPlayer?: ReturnType<typeof vi.fn>;
    eras?: { name: string; firstPlayerId?: number; lastPlayerId?: number }[];
  } = {},
) {
  const upsertExternalSystem = opts.upsertExternalSystem ?? externalSystemsOk();
  const upsertTeam =
    opts.upsertTeam ??
    vi.fn().mockResolvedValue({ eras: [{ id: 5000, eraId: 500 }] });
  const upsertPlayer = opts.upsertPlayer ?? vi.fn().mockResolvedValue(true);
  const eras = opts.eras ?? [
    { name: 'LRB', firstPlayerId: 1, lastPlayerId: 9999 },
  ];
  const service = new BblPlayersImportService(
    reader,
    makeParser(),
    { upsertPlayer } as unknown as PlayersImportService,
    { upsertTeam } as unknown as TeamsImportService,
    { getEras: () => eras } as unknown as EraConfigService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    {
      getBblSystemName: () => 'BBL',
    } as unknown as ExternalSystemNameConfigService,
  );
  return { service, upsertTeam, upsertPlayer };
}

const goodPlayer: BblPlayer = {
  pid: '42',
  name: 'Griff Oberwald',
  typId: '33',
  teamCode: 'knu',
};

describe('BblPlayersImportService', () => {
  it('imports a resolvable player with the expected upsert payload', async () => {
    const { service, upsertTeam, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
    );

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(upsertTeam).toHaveBeenCalledWith(
      { ...team, eras: [500] },
      expect.any(Array),
    );
    expect(upsertPlayer).toHaveBeenCalledWith(
      {
        name: 'Griff Oberwald',
        teamEraId: 5000,
        positionId: 200,
        externalIds: [
          { externalSystemId: 1, externalId: '42' },
          { externalSystemId: 2, externalId: 'Griff Oberwald' },
        ],
      },
      expect.any(Array),
    );
  });

  it('skips and records an error when no era range contains the pid', async () => {
    const { service, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
      { eras: [{ name: 'LRB', firstPlayerId: 1, lastPlayerId: 10 }] },
    );

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team code is unknown', async () => {
    const { service } = makeService(
      makeReader([plPage({ ...goodPlayer, teamCode: 'zzz' })]),
    );

    const result = await service.importPlayers(
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

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('records an error and returns early when external systems fail', async () => {
    const { service, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
      { upsertExternalSystem: vi.fn().mockRejectedValue(new Error('boom')) },
    );

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.success).toBe(false);
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it('skips players the parser cannot read', async () => {
    const { service, upsertPlayer } = makeService(makeReader([plPage(null)]));

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it('skips and records an error when the pid-matched era was not imported', async () => {
    const { service, upsertTeam, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        eras: [
          { name: 'Unimported Era', firstPlayerId: 1, lastPlayerId: 9999 },
        ],
      },
    );

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertTeam).not.toHaveBeenCalled();
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it('skips without recording its own error when the team upsert fails', async () => {
    const { service, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
      { upsertTeam: vi.fn().mockResolvedValue(undefined) },
    );

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it('skips and records an error when the upserted team has no matching era', async () => {
    const { service, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
      {
        upsertTeam: vi
          .fn()
          .mockResolvedValue({ eras: [{ id: 5000, eraId: 999 }] }),
      },
    );

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it('skips and records an error when the team race has no BBL id mapping', async () => {
    const unmappedRaceTeam: UpsertTeamData = { ...team, raceId: 999 };
    const localTeamsByCode = new Map<string, UpsertTeamData>([
      ['knu', unmappedRaceTeam],
    ]);
    const { service, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
    );

    const result = await service.importPlayers(
      localTeamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('33-?');
    expect(upsertPlayer).not.toHaveBeenCalled();
  });

  it('does not count the player as imported when upsertPlayer reports failure', async () => {
    const { service, upsertPlayer } = makeService(
      makeReader([plPage(goodPlayer)]),
      { upsertPlayer: vi.fn().mockResolvedValue(false) },
    );

    const result = await service.importPlayers(
      teamsByCode,
      positionIdsByBblId,
      racesByBblId,
      eraIdsByName,
    );

    expect(result.imported).toBe(0);
    expect(upsertPlayer).toHaveBeenCalled();
  });
});
