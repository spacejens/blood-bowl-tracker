import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { Position } from '@blood-bowl-tracker/db';
import { PositionsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialPositionsUpsertService } from './tp-official-positions-upsert.service';
import type { TpOfficialRaceRef } from './tp-official-races-upsert.service';
import {
  CHARACTERISTICS,
  NAME_SYSTEM_ID,
  officialPosition,
  officialRace,
  officialTeamsContext,
  TP_SYSTEM_ID,
} from './tp-official-teams.test-helpers';

const ORC: TpOfficialRaceRef = { raceId: 10, raceName: 'Orc' };
const DWARF: TpOfficialRaceRef = { raceId: 11, raceName: 'Dwarf' };
const LEGACY_STATS = { ...CHARACTERISTICS, strength: 4 };

function upsertedPosition(id: number) {
  return { position: mock<Position>({ id }), created: true };
}

describe('TpOfficialPositionsUpsertService', () => {
  let service: TpOfficialPositionsUpsertService;
  let positions: MockProxy<PositionsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    positions = mock<PositionsService>();
    positions.upsert.mockResolvedValue(upsertedPosition(9));
    positions.syncRaceEras.mockResolvedValue({ positionId: 9, raceEraIds: [] });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialPositionsUpsertService,
        TpNameExternalIdService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: PositionsService, useValue: positions },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialPositionsUpsertService);
  });

  it('upserts a regular position with its TP ids and race-scoped Name id, then syncs its race eras', async () => {
    const result = await service.upsertPositions({
      races: [officialRace({ teamRaceCode: 'orc20' })],
      racesByCode: new Map([['orc20', ORC]]),
      context: officialTeamsContext(),
      errors,
    });

    expect(positions.upsert).toHaveBeenCalledWith({
      name: 'Blitzer',
      isStarPlayer: false,
      externalIds: [
        { externalSystemId: TP_SYSTEM_ID, externalId: '77' },
        { externalSystemId: NAME_SYSTEM_ID, externalId: 'Orc: Blitzer' },
      ],
    });
    expect(positions.syncRaceEras).toHaveBeenCalledWith({
      positionId: 9,
      raceEras: [
        { raceId: 10, eraId: 40 },
        { raceId: 10, eraId: 41 },
      ],
    });
    expect(result).toEqual({
      imported: 1,
      slots: [
        {
          positionId: 9,
          name: 'Blitzer',
          characteristics: CHARACTERISTICS,
          skills: [],
          keywordCodes: [],
        },
      ],
    });
    expect(errors).toEqual([]);
  });

  it('collapses one position seen under two variant codes of one race into one upsert carrying both TP ids', async () => {
    await service.upsertPositions({
      races: [
        officialRace({
          teamRaceCode: 'orc20',
          positions: [officialPosition({ tpPositionId: 77 })],
        }),
        officialRace({
          teamRaceCode: 'orcLegacy20',
          isOfficial: false,
          positions: [officialPosition({ tpPositionId: 78 })],
        }),
      ],
      racesByCode: new Map([
        ['orc20', ORC],
        ['orcLegacy20', ORC],
      ]),
      context: officialTeamsContext(),
      errors,
    });

    expect(positions.upsert).toHaveBeenCalledTimes(1);
    expect(positions.upsert.mock.calls[0][0].externalIds).toEqual([
      { externalSystemId: TP_SYSTEM_ID, externalId: '77' },
      { externalSystemId: TP_SYSTEM_ID, externalId: '78' },
      { externalSystemId: NAME_SYSTEM_ID, externalId: 'Orc: Blitzer' },
    ]);
  });

  it.each([
    ['official first', [true, false]],
    ['legacy first', [false, true]],
  ])(
    'keeps the official characteristics over the legacy ones (%s)',
    async (_order, officialFlags) => {
      const result = await service.upsertPositions({
        races: officialFlags.map((isOfficial) =>
          officialRace({
            teamRaceCode: isOfficial ? 'orc20' : 'orcLegacy20',
            isOfficial,
            positions: [
              officialPosition({
                characteristics: isOfficial ? CHARACTERISTICS : LEGACY_STATS,
              }),
            ],
          }),
        ),
        racesByCode: new Map([
          ['orc20', ORC],
          ['orcLegacy20', ORC],
        ]),
        context: officialTeamsContext(),
        errors,
      });

      expect(result.slots[0].characteristics).toEqual(CHARACTERISTICS);
    },
  );

  it('keeps a legacy-only position with its legacy characteristics', async () => {
    const result = await service.upsertPositions({
      races: [
        officialRace({
          teamRaceCode: 'orcLegacy20',
          isOfficial: false,
          positions: [officialPosition({ characteristics: LEGACY_STATS })],
        }),
      ],
      racesByCode: new Map([['orcLegacy20', ORC]]),
      context: officialTeamsContext(),
      errors,
    });

    expect(result.slots[0].characteristics).toEqual(LEGACY_STATS);
  });

  it('gives a star its bare name as TP and Name ids, and one slot for the row every fielding race lands on', async () => {
    const star = officialPosition({
      name: 'Grim Ironjaw',
      isStarPlayer: true,
      tpPositionId: 501,
    });

    const result = await service.upsertPositions({
      races: [
        officialRace({ teamRaceCode: 'orc20', positions: [star] }),
        officialRace({
          name: 'Dwarf',
          teamRaceCode: 'dwarf20',
          positions: [star],
        }),
      ],
      racesByCode: new Map([
        ['orc20', ORC],
        ['dwarf20', DWARF],
      ]),
      context: officialTeamsContext(),
      errors,
    });

    expect(positions.upsert).toHaveBeenCalledTimes(2);
    expect(positions.upsert).toHaveBeenCalledWith({
      name: 'Grim Ironjaw',
      isStarPlayer: true,
      externalIds: [
        { externalSystemId: TP_SYSTEM_ID, externalId: '501' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Grim Ironjaw' },
        { externalSystemId: NAME_SYSTEM_ID, externalId: 'Grim Ironjaw' },
      ],
    });
    expect(positions.syncRaceEras).toHaveBeenCalledWith({
      positionId: 9,
      raceEras: [
        { raceId: 11, eraId: 40 },
        { raceId: 11, eraId: 41 },
      ],
    });
    expect(result.slots).toHaveLength(1);
  });

  it("keeps a star's official values when a legacy listing of it is processed after the official one", async () => {
    const officialStar = officialPosition({
      name: 'Grim Ironjaw',
      isStarPlayer: true,
      tpPositionId: 501,
    });
    const legacyStar = officialPosition({
      name: 'Grim Ironjaw',
      isStarPlayer: true,
      tpPositionId: 501,
      characteristics: LEGACY_STATS,
    });

    const result = await service.upsertPositions({
      races: [
        officialRace({ teamRaceCode: 'orc20', positions: [officialStar] }),
        officialRace({
          name: 'Dwarf',
          teamRaceCode: 'dwarfLegacy20',
          isOfficial: false,
          positions: [legacyStar],
        }),
      ],
      racesByCode: new Map([
        ['orc20', ORC],
        ['dwarfLegacy20', DWARF],
      ]),
      context: officialTeamsContext(),
      errors,
    });

    expect(result.slots).toEqual([
      {
        positionId: 9,
        name: 'Grim Ironjaw',
        characteristics: CHARACTERISTICS,
        skills: [],
        keywordCodes: [],
      },
    ]);
  });

  it('skips the positions of a race that was not imported, reporting it once', async () => {
    const result = await service.upsertPositions({
      races: [
        officialRace({
          teamRaceCode: 'orc20',
          positions: [
            officialPosition(),
            officialPosition({ name: 'Thrower' }),
          ],
        }),
      ],
      racesByCode: new Map(),
      context: officialTeamsContext(),
      errors,
    });

    expect(positions.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ imported: 0, slots: [] });
    expect(errors).toEqual([
      {
        item: { race: 'Orc', teamRaceCode: 'orc20', rulesSet: 'BB2020' },
        message:
          'Skipping the positions of race "Orc" (orc20, BB2020): the race was not imported.',
      },
    ]);
  });

  it('records a failed position and still imports the others', async () => {
    positions.upsert
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce(upsertedPosition(12));

    const result = await service.upsertPositions({
      races: [
        officialRace({
          positions: [
            officialPosition(),
            officialPosition({ name: 'Thrower' }),
          ],
        }),
      ],
      racesByCode: new Map([['orc20', ORC]]),
      context: officialTeamsContext(),
      errors,
    });

    expect(result.imported).toBe(1);
    expect(result.slots.map((slot) => slot.name)).toEqual(['Thrower']);
    expect(errors).toEqual([
      {
        item: { position: 'Blitzer', race: 'Orc', rulesSet: 'BB2020' },
        message:
          'Failed to upsert position "Blitzer" (race "Orc", BB2020): conflict',
      },
    ]);
  });

  it('records a failed race/era sync without dropping the position', async () => {
    positions.syncRaceEras.mockRejectedValue(new Error('boom'));

    const result = await service.upsertPositions({
      races: [officialRace()],
      racesByCode: new Map([['orc20', ORC]]),
      context: officialTeamsContext(),
      errors,
    });

    expect(result.slots).toHaveLength(1);
    expect(errors).toEqual([
      {
        item: { positionId: 9, raceId: 10 },
        message:
          'Failed to sync the race eras of position "Blitzer" (race "Orc"): boom',
      },
    ]);
  });

  it('skips the race/era sync when the rules set has no TP era', async () => {
    await service.upsertPositions({
      races: [officialRace()],
      racesByCode: new Map([['orc20', ORC]]),
      context: officialTeamsContext({ eraIds: [] }),
      errors,
    });

    expect(positions.syncRaceEras).not.toHaveBeenCalled();
  });
});
