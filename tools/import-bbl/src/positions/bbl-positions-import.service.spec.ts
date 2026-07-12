import type {
  ExternalSystemsImportService,
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

function makeService(
  reader: BblSourceReader,
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertPosition: ReturnType<typeof vi.fn>,
  parsers: {
    positionParser: PositionPageParser;
    playerParser: PlayerPageParser;
  } = makeParsers(),
) {
  return new BblPositionsImportService(
    reader,
    parsers.positionParser,
    parsers.playerParser,
    { upsertPosition } as unknown as PositionsImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    {
      getBblSystemName: () => 'BBL',
    } as unknown as ExternalSystemNameConfigService,
  );
}

function externalSystemsOk() {
  return vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
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
    const service = makeService(
      makeReader([
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
      externalSystemsOk(),
      upsertPosition,
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        isStarPlayer: false,
        races: [{ raceId: 480, isDeleted: false }],
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
        races: [{ raceId: 70, isDeleted: false }],
        externalIds: [
          { externalSystemId: 1, externalId: '33-7' },
          { externalSystemId: 2, externalId: 'Goblin Team: Goblin Linemen' },
        ],
      },
      expect.any(Array),
    );
  });

  it('skips a listed race not in the map but imports the others', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService(
      makeReader([
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
      externalSystemsOk(),
      upsertPosition,
    );

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

  it('imports a star player as one row with a positions_races row per resolved race and a bare-name external id', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService(
      makeReader(
        [
          ptPage({
            typId: '99',
            name: 'Wilhelm Chaney',
            isStarPlayer: true,
            races: [],
          }),
        ],
        [
          plPage({ typId: '99', teamCode: 'knu' }),
          plPage({ typId: '99', teamCode: 'col' }),
        ],
      ),
      externalSystemsOk(),
      upsertPosition,
    );

    const { result, positionIdsByBblId } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(1);
    expect(positionIdsByBblId.get('99-14')).toBe(100);
    expect(positionIdsByBblId.get('99-48')).toBe(100);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Wilhelm Chaney',
        isStarPlayer: true,
        races: [
          { raceId: 140, isDeleted: false },
          { raceId: 480, isDeleted: false },
        ],
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
  });

  it('imports a defunct-race position as duplicate rows with isDeleted true', async () => {
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService(
      makeReader(
        [
          ptPage({
            typId: '121',
            name: 'Norse Catchers',
            isStarPlayer: false,
            races: [],
          }),
        ],
        [plPage({ typId: '121', teamCode: 'knu' })],
      ),
      externalSystemsOk(),
      upsertPosition,
    );

    const { result, positionIdsByBblId } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(1);
    expect(positionIdsByBblId.get('121-14')).toBe(100);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Norse Catchers',
        isStarPlayer: false,
        races: [{ raceId: 140, isDeleted: true }],
        externalIds: [
          { externalSystemId: 1, externalId: '121-14' },
          { externalSystemId: 2, externalId: 'Norse Team: Norse Catchers' },
        ],
      },
      expect.any(Array),
    );
  });

  it('skips a zero-race star player when no player is found and records an error', async () => {
    const upsertPosition = vi.fn().mockResolvedValue(true);
    const service = makeService(
      makeReader(
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
      externalSystemsOk(),
      upsertPosition,
    );

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
    const service = makeService(
      makeReader(
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
      externalSystemsOk(),
      upsertPosition,
    );

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
    const service = makeService(
      makeReader(
        [
          ptPage({
            typId: '99',
            name: 'Grotty',
            isStarPlayer: true,
            races: [],
          }),
        ],
        [plPage({ typId: '99', teamCode: 'unknown-code' })],
      ),
      externalSystemsOk(),
      upsertPosition,
    );

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
    const service = makeService(
      makeReader([ptPage(null)]),
      externalSystemsOk(),
      upsertPosition,
    );

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
    const service = makeService(
      makeReader([
        ptPage(null),
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
      externalSystemsOk(),
      upsertPosition,
      { positionParser, playerParser },
    );

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
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(new Error('internal error'));
    const upsertPosition = vi.fn();
    const service = makeService(
      makeReader([
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
      upsertExternalSystem,
      upsertPosition,
    );

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

  it('stringifies a non-Error thrown by the external system upsert', async () => {
    const upsertExternalSystem = vi.fn().mockRejectedValue('boom');
    const upsertPosition = vi.fn();
    const service = makeService(
      makeReader([
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
      upsertExternalSystem,
      upsertPosition,
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('boom'))).toBe(true);
  });

  it('returns positionIdsByBblId keyed by `${typId}-${raceBblId}`', async () => {
    // one pt page: position typId '10', listing race bblId '7' (in racesByBblId)
    const upsertPosition = vi.fn().mockResolvedValue({ id: 100 });
    const service = makeService(
      makeReader([
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '7', name: 'Goblin Team' }],
        }),
      ]),
      externalSystemsOk(),
      upsertPosition,
    );

    const { result, positionIdsByBblId } = await service.importPositions(
      racesByBblId,
      new Map<string, number>(),
    );

    expect(result.success).toBe(true);
    expect(positionIdsByBblId.get('10-7')).toBe(100);
  });
});
