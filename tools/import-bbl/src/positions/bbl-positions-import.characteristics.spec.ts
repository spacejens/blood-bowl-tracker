import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  ANY_LASTING_INJURIES,
  ANY_PLAYER_CHARACTERISTICS,
  CHARACTERISTICS,
  makePositionRecord,
  makeService,
  plPage,
  ptPage,
  racesByBblId,
  resultArgs,
  teamRaceIdsByCode,
} from './bbl-positions-import.test-helpers';

describe('BblPositionsImportService characteristics', () => {
  it('records characteristics for a listed-race position under its upserted id', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            races: [{ bblId: '7', name: 'Goblin Team' }],
            isStarPlayer: false,
            characteristics: CHARACTERISTICS,
            skills: [],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(
      makePositionRecord({ id: 100 }),
    );

    const outcome = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(outcome.characteristicsByPositionId).toEqual(
      new Map([[100, CHARACTERISTICS]]),
    );
  });

  it('records characteristics for a star player under its single consolidated id', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '99',
            name: 'Wilhelm Chaney',
            races: [],
            isStarPlayer: true,
            characteristics: CHARACTERISTICS,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '1',
            name: 'Wilhelm Chaney',
            typId: '99',
            teamCode: 'knu',
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(
      makePositionRecord({ id: 900 }),
    );

    const outcome = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(outcome.characteristicsByPositionId).toEqual(
      new Map([[900, CHARACTERISTICS]]),
    );
  });

  it('records characteristics for each row of a reverse-engineered multi-race position', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '55',
            name: 'Kroxigor',
            races: [],
            isStarPlayer: false,
            characteristics: CHARACTERISTICS,
            skills: [],
          }),
        ],
        pl: [
          plPage({
            pid: '1',
            name: 'Kroxigor',
            typId: '55',
            teamCode: 'knu',
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
          plPage({
            pid: '2',
            name: 'Kroxigor',
            typId: '55',
            teamCode: 'col',
            sppTotal: null,
            characteristics: ANY_PLAYER_CHARACTERISTICS,
            lastingInjuries: ANY_LASTING_INJURIES,
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert
      .mockResolvedValueOnce(makePositionRecord({ id: 101 }))
      .mockResolvedValueOnce(makePositionRecord({ id: 102 }));

    const outcome = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(outcome.characteristicsByPositionId).toEqual(
      new Map([
        [101, CHARACTERISTICS],
        [102, CHARACTERISTICS],
      ]),
    );
  });

  it('records an error and no characteristics when the table could not be parsed', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pt: [
          ptPage({
            typId: '33',
            name: 'Goblin Linemen',
            races: [{ bblId: '7', name: 'Goblin Team' }],
            isStarPlayer: false,
            characteristics: null,
            skills: [],
          }),
        ],
      }),
    );
    mocks.positionsImport.upsert.mockResolvedValue(
      makePositionRecord({ id: 100 }),
    );

    const outcome = await service.importPositions(
      racesByBblId,
      teamRaceIdsByCode,
    );

    expect(outcome.characteristicsByPositionId.size).toBe(0);
    // The position's identity still imported; only its characteristics are lost.
    expect(mocks.positionsImport.upsert).toHaveBeenCalledTimes(1);
    expect(resultArgs(mocks.importResults).errors).toEqual([
      {
        item: { typId: '33', name: 'Goblin Linemen' },
        message:
          'Could not read characteristics for position "Goblin Linemen" (33): no MA/ST/AG/PA/AV table on the page',
      },
    ]);
  });
});
