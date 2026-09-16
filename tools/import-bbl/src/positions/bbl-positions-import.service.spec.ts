import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import type { BblPage } from '../source/bbl-page.types';
import {
  ANY_LASTING_INJURIES,
  ANY_PLAYER_CHARACTERISTICS,
  CANNED_PAGE_PARSE_ERROR,
  CANNED_RESULT,
  CHARACTERISTICS,
  makePositionRecord,
  makeService,
  plPage,
  ptPage,
  racesByBblId,
  resultArgs,
  teamRaceIdsByCode,
} from './bbl-positions-import.test-helpers';

describe('BblPositionsImportService', () => {
  it('upserts one row per listed race with composite external ids', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [
              { bblId: '48', name: 'College of Shadow' },
              { bblId: '7', name: 'Goblin Team' },
            ],
            characteristics: null,
            skills: [],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-shadow')
      .mockReturnValueOnce('name-id-goblin');

    const { positionRaceCandidates } = await service.importPositions(
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
    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'College of Shadow',
      'Goblin Linemen',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'Goblin Team',
      'Goblin Linemen',
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '33-48' },
          {
            externalSystemId: 2,
            externalId: 'name-id-shadow',
          },
        ],
      },
      expect.any(Array),
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Goblin Linemen',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '33-7' },
          { externalSystemId: 2, externalId: 'name-id-goblin' },
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

  it('builds the Name external id from the canonicalized race name', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '326',
            name: 'Underworld Snotling',
            isStarPlayer: false,
            races: [{ bblId: '24', name: 'Underworld Denizens Team' }],
            characteristics: null,
            skills: [],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.bblRaceName.canonical.mockReturnValue('Underworld Denizens');
    mocks.nameExternalId.forPosition.mockReturnValue('name-id-underworld');

    await service.importPositions(
      new Map([['24', { id: 240, name: 'Underworld Denizens Team' }]]),
      new Map<string, number>(),
    );

    expect(mocks.bblRaceName.canonical).toHaveBeenCalledWith(
      'Underworld Denizens Team',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenCalledWith(
      'Underworld Denizens',
      'Underworld Snotling',
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Underworld Snotling',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '326-24' },
          { externalSystemId: 2, externalId: 'name-id-underworld' },
        ],
      },
      expect.any(Array),
    );
  });

  it('imports listed races and an extra reverse-engineered race (non-star) as a duplicate candidate row', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '60',
            name: 'Minotaur 2',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '111',
            name: 'Minotaur 2',
            typId: '60',
            teamCode: 'knu', // -> race 140 (Norse Team, bblId '14'), NOT listed
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-goblin')
      .mockReturnValueOnce('name-id-norse');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Goblin Team',
      'Minotaur 2',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'Norse Team',
      'Minotaur 2',
    );
    // listed race
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-7' },
          { externalSystemId: 2, externalId: 'name-id-goblin' },
        ],
      },
      expect.any(Array),
    );
    // extra reverse-engineered race: duplicate row
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
        ],
      },
      expect.any(Array),
    );
    // both rows resolve to the same upserted id 100 in this test's mock,
    // so the extra race just adds another candidate for the same position
    expect(positionRaceCandidates.get(100)).toEqual({
      isStarPlayer: false,
      raceDbIds: new Set([70, 140]),
    });
  });

  it('imports listed races and an extra reverse-engineered race (star) merged into one row', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '60',
            name: 'Minotaur 2',
            isStarPlayer: true,
            races: [{ bblId: '7', name: 'Goblin Team' }],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '111',
            name: 'Minotaur 2',
            typId: '60',
            teamCode: 'knu', // -> race 140 (Norse Team, bblId '14'), NOT listed
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-goblin')
      .mockReturnValueOnce('name-id-norse');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Goblin Team',
      'Minotaur 2',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'Norse Team',
      'Minotaur 2',
    );
    // listed race row (unchanged listed-race convention: isStarPlayer false)
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '60-7' },
          { externalSystemId: 2, externalId: 'name-id-goblin' },
        ],
      },
      expect.any(Array),
    );
    // extra races merged into one star row with a bare-name external id
    // (the 'Minotaur 2' entry comes from the exempt forStarPosition mock)
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Minotaur 2',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 2, externalId: 'Minotaur 2' },
          { externalSystemId: 1, externalId: '60-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
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
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [
              { bblId: '48', name: 'College of Shadow' },
              { bblId: '7', name: 'Goblin Team' },
            ],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '222',
            name: 'Goblin Linemen',
            typId: '33',
            teamCode: 'col', // -> race 480 (College of Shadow, bblId '48') = already listed
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    // Only the 2 listed races import; the resolved race is deduped away.
    expect(resultArgs(mocks.importResults).imported).toBe(2);
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(2);
  });

  it('skips a listed race not in the map but imports the others', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [
              { bblId: '48', name: 'College of Shadow' },
              { bblId: '999', name: 'Unknown Race' },
            ],
            characteristics: null,
            skills: [],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(1);
    expect(errors.some((e) => e.message.includes('Unknown Race'))).toBe(true);
  });

  it('imports a star player as one row with a positions_race_eras row per resolved race and a bare-name external id', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '99',
            name: 'Wilhelm Chaney',
            isStarPlayer: true,
            races: [],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '123',
            name: 'Wilhelm Chaney',
            typId: '99',
            teamCode: 'knu',
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
          plPage({
            pid: '123',
            name: 'Wilhelm Chaney',
            typId: '99',
            teamCode: 'col',
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition
      .mockReturnValueOnce('name-id-norse')
      .mockReturnValueOnce('name-id-shadow');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Norse Team',
      'Wilhelm Chaney',
    );
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      2,
      'College of Shadow',
      'Wilhelm Chaney',
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Wilhelm Chaney',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 2, externalId: 'Wilhelm Chaney' },
          { externalSystemId: 1, externalId: '99-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
          { externalSystemId: 1, externalId: '99-48' },
          {
            externalSystemId: 2,
            externalId: 'name-id-shadow',
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
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '121',
            name: 'Norse Catchers',
            isStarPlayer: false,
            races: [],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '456',
            name: 'Norse Catchers',
            typId: '121',
            teamCode: 'knu',
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition.mockReturnValueOnce('name-id-norse');

    const { positionRaceCandidates } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(resultArgs(mocks.importResults).imported).toBe(1);
    expect(mocks.nameExternalId.forPosition).toHaveBeenNthCalledWith(
      1,
      'Norse Team',
      'Norse Catchers',
    );
    expect(mocks.positionsImport.upsert).toHaveBeenCalledWith(
      {
        name: 'Norse Catchers',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: '121-14' },
          { externalSystemId: 2, externalId: 'name-id-norse' },
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
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '99',
            name: 'Zolcath the Zoat',
            isStarPlayer: true,
            races: [],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('Zolcath the Zoat'))).toBe(
      true,
    );
  });

  it('skips a zero-race non-star position when no player is found and records an error', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '121',
            name: 'Norse Catchers',
            isStarPlayer: false,
            races: [],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('Norse Catchers'))).toBe(true);
  });

  it('skips a resolved player whose team race is not in the maps', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '99',
            name: 'Grotty',
            isStarPlayer: true,
            races: [],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '789',
            name: 'Grotty',
            typId: '99',
            teamCode: 'unknown-code',
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
    expect(errors.some((e) => e.message.includes('Grotty'))).toBe(true);
  });

  it('skips pages the position parser returns null for', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pt: [ptPage(null)] }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(resultArgs(mocks.importResults).imported).toBe(0);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
  });

  it('records an error and continues when a position page throws while parsing', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage(null),
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '48', name: 'College of Shadow' }],
            characteristics: CHARACTERISTICS,
            skills: [],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    const parseError = new Error('bad page');
    mocks.positionParser.extractPosition.mockImplementationOnce(() => {
      throw parseError;
    });

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors).toEqual([CANNED_PAGE_PARSE_ERROR]);
    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      { position: 'null' },
      'position',
      parseError,
    );
  });

  it('records one error and skips positions when an external system upsert fails', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '48', name: 'College of Shadow' }],
            characteristics: null,
            skills: [],
          }),
        ],
      }),
    );
    mocks.bootstrap.bootstrap.mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'Failed to upsert external system: internal error',
      },
    });

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    expect(resultArgs(mocks.importResults).errors).not.toEqual([]);
    expect(
      resultArgs(mocks.importResults).errors.some((e) =>
        e.message.includes('external system'),
      ),
    ).toBe(true);
    expect(mocks.positionsImport.upsert).not.toHaveBeenCalled();
  });

  it('records an error when a scanned team code has no race in teamRaceIdsByCode', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '333',
            name: 'Lineman',
            typId: '10',
            teamCode: 'ghost', // not in teamRaceIdsByCode
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsByCode);

    // The listed race still imports; the unresolved team code is recorded.
    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('ghost'))).toBe(true);
    expect(
      errors.some((e) =>
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
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '444',
            name: 'Lineman',
            typId: '10',
            teamCode: 'orphan', // -> db id 999, absent from racesByBblId
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    await service.importPositions(racesByBblId, teamRaceIdsWithOrphan);

    const { imported, errors } = resultArgs(mocks.importResults);
    expect(imported).toBe(1);
    expect(errors.some((e) => e.message.includes('999'))).toBe(true);
    expect(
      errors.some((e) =>
        e.message.includes('race info missing from racesByBblId'),
      ),
    ).toBe(true);
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '10',
            name: 'Lineman',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
            characteristics: null,
            skills: [],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());

    const { result } = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(result).toBe(CANNED_RESULT);
  });

  it('records a page-parse error and continues when a player page throws during pre-scan, instead of aborting the whole run', async () => {
    const malformedPlPage: BblPage = {
      type: 'pl',
      params: { player: 'not valid json' },
      load: () => {
        throw new Error('load() should not be called in this test');
      },
    };

    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            isStarPlayer: false,
            races: [{ bblId: '7', name: 'Goblin Team' }],
            characteristics: null,
            skills: [],
          }),
        ],
        pl: [malformedPlPage],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(makePositionRecord());
    mocks.nameExternalId.forPosition.mockReturnValueOnce('name-id-goblin');

    const outcome = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(mocks.pageParseError.build).toHaveBeenCalledWith(
      malformedPlPage.params,
      'player',
      expect.any(Error),
    );
    expect(resultArgs(mocks.importResults).errors).toContainEqual(
      CANNED_PAGE_PARSE_ERROR,
    );
    // The listed race for the position on the `pt` page still imported
    // normally -- a malformed player page during pre-scan must not abort the
    // whole positions-import run.
    expect(outcome.result).toBe(CANNED_RESULT);
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).imported).toBe(1);
  });
});
