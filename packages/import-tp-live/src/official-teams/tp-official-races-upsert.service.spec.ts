import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { Race } from '@blood-bowl-tracker/db';
import { RacesService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialRacesUpsertService } from './tp-official-races-upsert.service';
import {
  ERA_IDS,
  NAME_SYSTEM_ID,
  officialRace,
  officialTeamsContext,
  TP_SYSTEM_ID,
} from './tp-official-teams.test-helpers';

function upsertedRace(id: number) {
  return { race: mock<Race & { eras: number[] }>({ id }), created: true };
}

describe('TpOfficialRacesUpsertService', () => {
  let service: TpOfficialRacesUpsertService;
  let races: MockProxy<RacesService>;
  let errors: ImportError[];

  beforeEach(async () => {
    races = mock<RacesService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialRacesUpsertService,
        TpNameExternalIdService,
        TpUpsertRunnerService,
        { provide: RacesService, useValue: races },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialRacesUpsertService);
  });

  it("upserts each race once, merging every variant code onto its display name, in the rules set's eras", async () => {
    races.upsert.mockResolvedValue(upsertedRace(10));

    const result = await service.upsertRaces({
      races: [
        officialRace({ name: 'Vampire', teamRaceCode: 'vamp20' }),
        officialRace({
          name: 'Vampire',
          teamRaceCode: 'vampLegacy20',
          isOfficial: false,
        }),
      ],
      context: officialTeamsContext(),
      errors,
    });

    expect(races.upsert).toHaveBeenCalledTimes(1);
    expect(races.upsert).toHaveBeenCalledWith({
      name: 'Vampire',
      eras: ERA_IDS,
      externalIds: [
        { externalSystemId: TP_SYSTEM_ID, externalId: 'vamp20' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'vampLegacy20' },
        { externalSystemId: NAME_SYSTEM_ID, externalId: 'Vampire' },
      ],
    });
    expect(result.imported).toBe(1);
    expect(result.racesByCode).toEqual(
      new Map([
        ['vamp20', { raceId: 10, raceName: 'Vampire' }],
        ['vampLegacy20', { raceId: 10, raceName: 'Vampire' }],
      ]),
    );
    expect(errors).toEqual([]);
  });

  it('records a failed race and still imports the others', async () => {
    races.upsert
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce(upsertedRace(11));

    const result = await service.upsertRaces({
      races: [
        officialRace({ name: 'Orc', teamRaceCode: 'orc20' }),
        officialRace({ name: 'Dwarf', teamRaceCode: 'dwarf20' }),
      ],
      context: officialTeamsContext(),
      errors,
    });

    expect(result.imported).toBe(1);
    expect(result.racesByCode).toEqual(
      new Map([['dwarf20', { raceId: 11, raceName: 'Dwarf' }]]),
    );
    expect(errors).toEqual([
      {
        item: { race: 'Orc', rulesSet: 'BB2020' },
        message: 'Failed to upsert race "Orc" (BB2020): conflict',
      },
    ]);
  });
});
