import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NameExternalIdService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { BblPlayer } from '../players/player-page-parser';
import { PlayerPageParser } from '../players/player-page-parser';
import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { PageParseErrorService } from '../source/page-parse-error.service';
import { BblPositionsImportService } from './bbl-positions-import.service';
import type { BblPosition } from './position-page-parser';
import { PositionPageParser } from './position-page-parser';

/**
 * The full upsertPosition result record (PositionsImportService.upsertPosition
 * resolves the API's Position + created shape). Defaults match the id=100
 * value repeated across these tests; pass overrides to vary the id.
 */
function makePositionRecord(overrides: { id?: number } = {}) {
  return {
    id: overrides.id ?? 100,
    name: 'Position',
    isStarPlayer: false,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

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

interface Mocks {
  positionParser: MockProxy<PositionPageParser>;
  playerParser: MockProxy<PlayerPageParser>;
  positionsImport: MockProxy<PositionsImportService>;
  bootstrap: MockProxy<ExternalSystemBootstrapService>;
}

/**
 * Builds the service under test through a TestingModule with every
 * collaborator mocked. Deterministic collaborators (name resolution, error
 * building) mirror the real production logic so a regression in the service
 * under test still fails these tests.
 */
async function makeService(
  reader: BblSourceReader,
): Promise<{ service: BblPositionsImportService; mocks: Mocks }> {
  const positionParser = mock<PositionPageParser>();
  positionParser.extractPosition.mockImplementation(
    (p) => JSON.parse(p.params.position) as BblPosition | null,
  );

  const playerParser = mock<PlayerPageParser>();
  playerParser.extractPlayer.mockImplementation(
    (p) => JSON.parse(p.params.player) as BblPlayer | null,
  );

  const positionsImport = mock<PositionsImportService>();

  const bootstrap = mock<ExternalSystemBootstrapService>();
  bootstrap.bootstrap.mockResolvedValue({ ok: true, ids: [1, 2] });

  const nameConfig = mock<ExternalSystemNameConfigService>();
  nameConfig.getBblSystemName.mockReturnValue('BBL');

  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forPosition.mockImplementation(
    (raceName, positionName) => `${raceName}: ${positionName}`,
  );
  nameExternalId.forStarPosition.mockImplementation((name) => name);

  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation((args) => ({
    item: args.item,
    message: args.message,
  }));
  importResults.result.mockImplementation((args) => ({
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  }));

  const pageParseError = mock<PageParseErrorService>();
  pageParseError.build.mockImplementation(
    (pageParams, pageDescription, error) =>
      importResults.error({
        item: { page: pageParams },
        message: `Failed to parse ${pageDescription} page ${JSON.stringify(pageParams)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  );

  const moduleRef = await Test.createTestingModule({
    providers: [
      BblPositionsImportService,
      { provide: BblSourceReader, useValue: reader },
      { provide: PositionPageParser, useValue: positionParser },
      { provide: PlayerPageParser, useValue: playerParser },
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: ExternalSystemBootstrapService, useValue: bootstrap },
      { provide: ExternalSystemNameConfigService, useValue: nameConfig },
      { provide: NameExternalIdService, useValue: nameExternalId },
      { provide: ImportResultService, useValue: importResults },
      { provide: PageParseErrorService, useValue: pageParseError },
    ],
  }).compile();

  return {
    service: moduleRef.get(BblPositionsImportService),
    mocks: { positionParser, playerParser, positionsImport, bootstrap },
  };
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
    const { service, mocks } = await makeService(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result, positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(mocks.bootstrap.bootstrap).toHaveBeenCalledWith(
      [
        { name: 'BBL', category: 'imported_data_source' },
        { name: 'Name', category: 'bookkeeping' },
      ],
      'Failed to upsert external system: ',
    );
    expect(result.imported).toBe(2);
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    const { service, mocks } = await makeService(
      makeReader(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(2);
    expect(positionIdsByBblId.get('60-7')).toBe(100);
    expect(positionIdsByBblId.get('60-14')).toBe(100);
    // listed race
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    const { service, mocks } = await makeService(
      makeReader(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(2);
    expect(positionIdsByBblId.get('60-7')).toBe(100);
    expect(positionIdsByBblId.get('60-14')).toBe(100);
    // listed race row (unchanged listed-race convention: isStarPlayer false)
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    const { service, mocks } = await makeService(
      makeReader(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    // Only the 2 listed races import; the resolved race is deduped away.
    expect(result.imported).toBe(2);
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledTimes(2);
  });

  it('skips a listed race not in the map but imports the others', async () => {
    const { service, mocks } = await makeService(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(1);
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledTimes(1);
    expect(result.errors.some((e) => e.message.includes('Unknown Race'))).toBe(
      true,
    );
  });

  it('imports a star player as one row with a positions_race_eras row per resolved race and a bare-name external id', async () => {
    const { service, mocks } = await makeService(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(1);
    expect(positionIdsByBblId.get('99-14')).toBe(100);
    expect(positionIdsByBblId.get('99-48')).toBe(100);
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledTimes(1);
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    const { service, mocks } = await makeService(
      makeReader(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result, positionIdsByBblId, positionRaceCandidates } =
      await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(result.imported).toBe(1);
    expect(positionIdsByBblId.get('121-14')).toBe(100);
    expect(mocks.positionsImport.upsertPosition).toHaveBeenCalledWith(
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
    const { service, mocks } = await makeService(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(mocks.positionsImport.upsertPosition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('Zolcath the Zoat')),
    ).toBe(true);
  });

  it('skips a zero-race non-star position when no player is found and records an error', async () => {
    const { service, mocks } = await makeService(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(mocks.positionsImport.upsertPosition).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) => e.message.includes('Norse Catchers')),
    ).toBe(true);
  });

  it('skips a resolved player whose team race is not in the maps', async () => {
    const { service, mocks } = await makeService(
      makeReader(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(mocks.positionsImport.upsertPosition).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.message.includes('Grotty'))).toBe(true);
  });

  it('skips pages the position parser returns null for', async () => {
    const { service, mocks } = await makeService(makeReader([ptPage(null)]));
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.imported).toBe(0);
    expect(mocks.positionsImport.upsertPosition).not.toHaveBeenCalled();
  });

  it('records an error and continues when a position page throws while parsing', async () => {
    const { service, mocks } = await makeService(
      makeReader([
        ptPage(null),
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );
    mocks.positionParser.extractPosition.mockImplementationOnce(() => {
      throw new Error('bad page');
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
    const { service, mocks } = await makeService(
      makeReader([
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '48', name: 'College of Shadow' }],
        }),
      ]),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'Failed to upsert external system: internal error',
      },
    });

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(mocks.positionsImport.upsertPosition).not.toHaveBeenCalled();
  });

  it('returns positionIdsByBblId keyed by `${typId}-${raceBblId}`', async () => {
    // one pt page: position typId '10', listing race bblId '7' (in racesByBblId)
    const { service, mocks } = await makeService(
      makeReader([
        ptPage({
          typId: '10',
          name: 'Lineman',
          isStarPlayer: false,
          races: [{ bblId: '7', name: 'Goblin Team' }],
        }),
      ]),
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

    const { result, positionIdsByBblId } = await service.importPositions(
      racesByBblId,
      new Map<string, number>(),
    );

    expect(result.success).toBe(true);
    expect(positionIdsByBblId.get('10-7')).toBe(100);
  });

  it('records an error when a scanned team code has no race in teamRaceIdsByCode', async () => {
    const { service, mocks } = await makeService(
      makeReader(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

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
    const teamRaceIdsWithOrphan = new Map<string, number>([
      ['knu', 140],
      ['col', 480],
      ['orphan', 999], // 999 has no entry in racesByBblId
    ]);
    const { service, mocks } = await makeService(
      makeReader(
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
    );
    mocks.positionsImport.upsertPosition.mockResolvedValue(
      makePositionRecord(),
    );

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
