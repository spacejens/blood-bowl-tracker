import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionsService, RacesService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ERA_ID, rosterContext, TP_SYSTEM_ID } from '../tp-roster.test-helpers';
import { TpMercenaryRaceErasSyncService } from './tp-mercenary-race-eras-sync.service';

const RACE_ID = 7;

describe('TpMercenaryRaceErasSyncService', () => {
  let service: TpMercenaryRaceErasSyncService;
  let races: MockProxy<RacesService>;
  let positions: MockProxy<PositionsService>;

  beforeEach(async () => {
    races = mock<RacesService>();
    positions = mock<PositionsService>();
    races.resolve.mockResolvedValue({ found: true, id: RACE_ID });
    positions.syncRaceEras.mockResolvedValue({
      positionId: 55,
      raceEraIds: [900],
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMercenaryRaceErasSyncService,
        ImportResultService,
        UpsertRecorderService,
        { provide: RacesService, useValue: races },
        { provide: PositionsService, useValue: positions },
      ],
    }).compile();
    service = moduleRef.get(TpMercenaryRaceErasSyncService);
  });

  const sync = (positionIds: number[], errors: ImportError[] = []) =>
    service.sync({
      positionIds,
      teamRaceCode: 'orc',
      context: rosterContext(),
      errors,
    });

  it('does nothing for a roster with no mercenary hires', async () => {
    const errors: ImportError[] = [];
    await sync([], errors);

    expect(races.resolve).not.toHaveBeenCalled();
    expect(positions.syncRaceEras).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it("records each mercenary position as available to the roster's race in its era, once per position", async () => {
    const errors: ImportError[] = [];
    await sync([55, 56, 55], errors);

    expect(races.resolve).toHaveBeenCalledTimes(1);
    expect(races.resolve).toHaveBeenCalledWith({
      externalSystemId: TP_SYSTEM_ID,
      externalId: 'orc',
    });
    expect(positions.syncRaceEras).toHaveBeenCalledTimes(2);
    expect(positions.syncRaceEras).toHaveBeenCalledWith({
      positionId: 55,
      raceEras: [{ raceId: RACE_ID, eraId: ERA_ID }],
    });
    expect(positions.syncRaceEras).toHaveBeenCalledWith({
      positionId: 56,
      raceEras: [{ raceId: RACE_ID, eraId: ERA_ID }],
    });
    expect(errors).toEqual([]);
  });

  it('records one error and syncs nothing when resolving the race throws', async () => {
    races.resolve.mockRejectedValue(new Error('db down'));
    const errors: ImportError[] = [];

    await sync([55, 56], errors);

    expect(positions.syncRaceEras).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('orc');
    expect(errors[0].message).toContain('db down');
  });

  it('records one error and syncs nothing when the race code cannot be resolved', async () => {
    races.resolve.mockResolvedValue({ found: false });
    const errors: ImportError[] = [];

    await sync([55, 56], errors);

    expect(positions.syncRaceEras).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { teamRaceCode: 'orc', positionIds: [55, 56] },
        message:
          'Skipped the race/era availability of mercenary position(s) 55, 56: could not resolve race code "orc"',
      },
    ]);
  });

  it('records a rejected pair as an error and still syncs the other positions', async () => {
    positions.syncRaceEras
      .mockRejectedValueOnce(new Error('Race 7 is not available in era 40'))
      .mockResolvedValueOnce({ positionId: 56, raceEraIds: [900] });
    const errors: ImportError[] = [];

    await sync([55, 56], errors);

    expect(positions.syncRaceEras).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([
      {
        item: { positionId: 55, raceId: RACE_ID, eraId: ERA_ID },
        message: `Failed to record mercenary position 55 as available to race ${RACE_ID} in era ${ERA_ID}: Race 7 is not available in era 40`,
      },
    ]);
  });
});
