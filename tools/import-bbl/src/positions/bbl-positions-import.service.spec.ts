import type {
  ExternalSystemBootstrapService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { BblPlayer } from '../players/player-page-parser';
import { PlayerPageParser } from '../players/player-page-parser';
import type { BblPage } from '../source/bbl-page';
import type { BblSourceReader } from '../source/bbl-source-reader';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblPositionsImportService } from './bbl-positions-import.service';
import type { BblPosition } from './position-page-parser';
import { PositionPageParser } from './position-page-parser';

function ptPage(position: BblPosition | null): BblPage {
  return {
    type: 'pt',
    params: { position: JSON.stringify(position) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function plPage(player: BblPlayer | null): BblPage {
  return {
    type: 'pl',
    params: { player: JSON.stringify(player) },
    load: () => {
      throw new Error('load() should not be called in this test');
    },
  };
}

function makeReader(pt: BblPage[], pl: BblPage[] = []): BblSourceReader {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *pages(type: string) {
      const list = type === 'pt' ? pt : type === 'pl' ? pl : [];
      for (const p of list) {
        yield p;
      }
    },
  } as unknown as BblSourceReader;
}

function makeParsers() {
  const positionParser = new PositionPageParser();
  vi.spyOn(positionParser, 'extractPosition').mockImplementation(
    (p) => JSON.parse(p.params.position) as BblPosition | null,
  );
  const playerParser = new PlayerPageParser();
  vi.spyOn(playerParser, 'extractPlayer').mockImplementation(
    (p) => JSON.parse(p.params.player) as BblPlayer | null,
  );
  return { positionParser, playerParser };
}

interface MakeServiceOptions {
  reader: BblSourceReader;
  bootstrap: ReturnType<typeof vi.fn>;
  upsertPosition: ReturnType<typeof vi.fn>;
  parsers?: {
    positionParser: PositionPageParser;
    playerParser: PlayerPageParser;
  };
}

function makeService({
  reader,
  bootstrap,
  upsertPosition,
  parsers = makeParsers(),
}: MakeServiceOptions) {
  return new BblPositionsImportService(
    reader,
    parsers.positionParser,
    parsers.playerParser,
    { upsertPosition } as unknown as PositionsImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    {
      getBblSystemName: () => 'BBL',
    } as unknown as ExternalSystemNameConfigService,
  );
}

function externalSystemsOk() {
  return vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
}

const racesByBblId = new Map<string, { id: number; name: string }>([
  ['48', { id: 480, name: 'College of Shadow' }],
  ['7', { id: 70, name: 'Goblin Team' }],
  ['14', { id: 140, name: 'Norse Team' }],
]);

const teamRaceIdsByCode = new Map<string, number>([
  ['knu', 140],
  ['col', 480],
]);

describe('BblPositionsImportService', () => {
  it('upserts one row per listed race with composite external ids', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const bootstrap = externalSystemsOk();
    const service = makeService({
      reader: makeReader([
        ptPage({
          typId: '33',
          name: 'Goblin Linemen',
          isStarPlayer: false,
          races: [
            { bblId: '48', name: 'College of Shadow' },
            { bblId: '7', name: 'Goblin Team' },
          ],
        }),
      ]),
      bootstrap,
      upsertPosition,
    });

    const { result, positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(bootstrap).toHaveBeenCalledWith(
      ['BBL', 'Name'],
      'Failed to upsert external system: ',
    );
    expect(result.imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '33-48' },
          {
            externalSystemId: 2,
            externalId: 'College of Shadow: Goblin Linemen',
          },
        ],
      },
      expect.any(Array),
    );
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '33-7' },
          { externalSystemId: 2, externalId: 'Goblin Team: Goblin Linemen' },
        ],
      },
      expect.any(Array),
    );
    // both rows resolve to the same upserted id 100 in this test's mock
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: false,
      raceDbIds: new Set([480, 70]),
    });
  });

  it('imports listed races and an extra reverse-engineered race (non-star) as a duplicate candidate row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '60',
            name: 'Minotaur 2',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        [
          plPage({
            pid: '111',
            name: 'Minotaur 2',
            typId: '60',
            teamCode: 'knu', // -> race 140 (Norse Team, bblId '14'), NOT listed
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(2);
    expect(positionIdsByBblId.get('60-7')).toBe(100);
    expect(positionIdsByBblId.get('60-14')).toBe(100);
    // listed race
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-7' },
          { externalSystemId: 2, externalId: 'Goblin Team: Minotaur 2' },
        ],
      },
      expect.any(Array),
    );
    // extra reverse-engineered race: duplicate row
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-14' },
          { externalSystemId: 2, externalId: 'Norse Team: Minotaur 2' },
        ],
      },
      expect.any(Array),
    );
    // both rows resolve to the same upserted id 100 in this test's mock;
    // the extra race is now just another candidate, not isDeleted
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: false,
      raceDbIds: new Set([70, 140]),
    });
  });

  it('imports listed races and an extra reverse-engineered race (star) merged into one row', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '60',
            name: 'Minotaur 2',
            isStarPlayer: true,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        [
          plPage({
            pid: '111',
            name: 'Minotaur 2',
            typId: '60',
            teamCode: 'knu', // -> race 140 (Norse Team, bblId '14'), NOT listed
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(2);
    expect(positionIdsByBblId.get('60-7')).toBe(100);
    expect(positionIdsByBblId.get('60-14')).toBe(100);
    // listed race row (unchanged listed-race convention: isStarPlayer false)
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-7' },
          { externalSystemId: 2, externalId: 'Goblin Team: Minotaur 2' },
        ],
      },
      expect.any(Array),
    );
    // extra races merged into one star row with a bare-name external id
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 2, externalId: 'Minotaur 2' },
          { externalSystemId: 1, externalId: '60-14' },
          { externalSystemId: 2, externalId: 'Norse Team: Minotaur 2' },
        ],
      },
      expect.any(Array),
    );
    // both rows resolve to the same upserted id 100 in this test's mock;
    // the star candidate merges with the listed-race candidate
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: true,
      raceDbIds: new Set([70, 140]),
    });
  });

  it('imports only listed races when the reverse-engineered race is already listed (dedup, no regression)', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [
              { bblId: '48', name: 'College of Shadow' },
              { bblId: '7', name: 'Goblin Team' },
            ],
          }),
        ],
        [
          plPage({
            pid: '222',
            name: 'Goblin Linemen',
            typId: '33',
            teamCode: 'col', // -> race 480 (College of Shadow, bblId '48') = already listed
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    // Only the 2 listed races import; the resolved race is deduped away.
    expect(result.imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledTimes(2);
  });

  it('skips a listed race not in the map but imports the others', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader([
        ptPage({
          typId: '33',
          name: 'Goblin Linemen',
          isStarPlayer: false,
          races: [
            { bblId: '48', name: 'College of Shadow' },
            { bblId: '999', name: 'Unknown Race' },
          ],
        }),
      ]),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(1);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(result.errors.some((e) => e.message.includes('Unknown Race'))).toBe(
      true,
    );
  });

  it('imports a star player as one row with a positions_race_eras row per resolved race and a bare-name external id', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '99',
            name: 'Wilhelm Chaney',
            isStarPlayer: true,
            races: [],
          }),
        ],
        [
          plPage({
            pid: '123',
            name: 'Wilhelm Chaney',
            typId: '99',
            teamCode: 'knu',
          }),
          plPage({
            pid: '123',
            name: 'Wilhelm Chaney',
            typId: '99',
            teamCode: 'col',
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(1);
    expect(positionIdsByBblId.get('99-14')).toBe(100);
    expect(positionIdsByBblId.get('99-48')).toBe(100);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Wilhelm Chaney',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 2, externalId: 'Wilhelm Chaney' },
          { externalSystemId: 1, externalId: '99-14' },
          { externalSystemId: 2, externalId: 'Norse Team: Wilhelm Chaney' },
          { externalSystemId: 1, externalId: '99-48' },
          {
            externalSystemId: 2,
            externalId: 'College of Shadow: Wilhelm Chaney',
          },
        ],
      },
      expect.any(Array),
    );
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: true,
      raceDbIds: new Set([140, 480]),
    });
  });

  it('imports a defunct-race position as duplicate rows, recorded as a candidate', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '121',
            name: 'Norse Catchers',
            isStarPlayer: false,
            races: [],
          }),
        ],
        [
          plPage({
            pid: '456',
            name: 'Norse Catchers',
            typId: '121',
            teamCode: 'knu',
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(1);
    expect(positionIdsByBblId.get('121-14')).toBe(100);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Norse Catchers',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '121-14' },
          { externalSystemId: 2, externalId: 'Norse Team: Norse Catchers' },
        ],
      },
      expect.any(Array),
    );
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: false,
      raceDbIds: new Set([140]),
    });
  });

  it('skips a zero-race star player when no player is found and records an error', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '99',
            name: 'Zolcath the Zoat',
            isStarPlayer: true,
            races: [],
          }),
        ],
        [],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('Zolcath the Zoat')),
    ).toBe(true);
  });

  it('skips a zero-race non-star position when no player is found and records an error', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '121',
            name: 'Norse Catchers',
            isStarPlayer: false,
            races: [],
          }),
        ],
        [],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('Norse Catchers')),
    ).toBe(true);
  });

  it('skips a resolved player whose team race is not in the maps', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '99',
            name: 'Grotty',
            isStarPlayer: true,
            races: [],
          }),
        ],
        [
          plPage({
            pid: '789',
            name: 'Grotty',
            typId: '99',
            teamCode: 'unknown-code',
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.message.includes('Grotty'))).toBe(true);
  });

  it('skips pages the position parser returns null for', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService({
      reader: makeReader([ptPage(null)]),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(upsertPosition).not.toHaveBeenCalled();
  });

  it('records an error and continues when a position page throws while parsing', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const positionParser = new PositionPageParser();
    vi.spyOn(positionParser, 'extractPosition')
      .mockImplementationOnce(() => {
        throw new Error('bad page');
      })
      .mockImplementationOnce(
        (p) => JSON.parse(p.params.position) as BblPosition | null,
      );
    const playerParser = new PlayerPageParser();
    vi.spyOn(playerParser, 'extractPlayer').mockImplementation(
      (p) => JSON.parse(p.params.player) as BblPlayer | null,
    );
    const service = makeService({
      reader: makeReader([
        ptPage(null),
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
      bootstrap: externalSystemsOk(),
      upsertPosition,
      parsers: { positionParser, playerParser },
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(1);
    expect(
      result.errors.some((e) =>
        e.message.includes('Failed to parse position page'),
      ),
    ).toBe(true);
  });

  it('records one error and skips positions when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'Failed to upsert external system: internal error',
      },
    });
    const upsertPosition = vi.fn();
    const service = makeService({
      reader: makeReader([
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
      bootstrap,
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertPosition).not.toHaveBeenCalled();
  });

  it('returns positionIdsByBblId keyed by `${typId}-${raceBblId}`', async () => {
    // one pt page: position typId '10', listing race bblId '7' (in racesByBblId)
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader([
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '7', name: 'Goblin Team' }],
        }),
      ]),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result, positionIdsByBblId } = await service.importPositions(
      racesByBblId,
      new Map<string, number>(),
    );

    expect(result.success).toBe(true);
    expect(positionIdsByBblId.get('10-7')).toBe(100);
  });

  it('records an error when a scanned team code has no race in teamRaceIdsByCode', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        [
          plPage({
            pid: '333',
            name: 'Lineman',
            typId: '10',
            teamCode: 'ghost', // not in teamRaceIdsByCode
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    // The listed race still imports; the unresolved team code is recorded.
    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('ghost'))).toBe(true);
    expect(
      result.errors.some((e) =>
        e.message.includes('team code not in teamRaceIdsByCode'),
      ),
    ).toBe(true);
  });

  it('records an error when a resolved race db id is missing from racesByBblId', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const teamRaceIdsWithOrphan = new Map<string, number>([
      ['knu', 140],
      ['col', 480],
      ['orphan', 999], // 999 has no entry in racesByBblId
    ]);
    const service = makeService({
      reader: makeReader(
        [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
          }),
        ],
        [
          plPage({
            pid: '444',
            name: 'Lineman',
            typId: '10',
            teamCode: 'orphan', // -> db id 999, absent from racesByBblId
          }),
        ],
      ),
      bootstrap: externalSystemsOk(),
      upsertPosition,
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsWithOrphan,
    );

    expect(result.imported).toBe(1);
    expect(result.errors.some((e) => e.message.includes('999'))).toBe(true);
    expect(
      result.errors.some((e) =>
        e.message.includes('race info missing from racesByBblId'),
      ),
    ).toBe(true);
  });
});
