import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { JourneymanLonerService } from '../player-skills/journeyman-loner.service';
import { PlayerCharacteristicsValidationService } from './player-characteristics-validation.service';
import { PlayerLastingInjuryValidationService } from './player-lasting-injury-validation.service';
import { PlayersService } from './players.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayersService,
      {
        provide: PlayerCharacteristicsValidationService,
        useValue: mock<PlayerCharacteristicsValidationService>(),
      },
      {
        provide: PlayerLastingInjuryValidationService,
        useValue: mock<PlayerLastingInjuryValidationService>(),
      },
      {
        provide: JourneymanLonerService,
        useValue: mock<JourneymanLonerService>(),
      },
      { provide: DB, useValue: db },
    ],
  }).compile();
  return { service: moduleRef.get(PlayersService), chains };
}

describe('PlayersService.resolveBatch', () => {
  it('answers each pair with the player id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 7, externalSystemId: 1, externalId: 'id:404' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: 'id:404' },
        { externalSystemId: 1, externalId: 'id:nobody' },
      ]),
    ).resolves.toEqual([{ found: true, id: 7 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('PlayersService.resolve', () => {
  it('answers a single pair with the player id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 7, externalSystemId: 1, externalId: 'id:404' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'id:404' }),
    ).resolves.toEqual({ found: true, id: 7 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'ghost' }),
    ).resolves.toEqual({ found: false });
  });
});
