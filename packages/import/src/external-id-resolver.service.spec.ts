import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { ExternalIdResolverService } from './external-id-resolver.service';

describe('ExternalIdResolverService', () => {
  let service: ExternalIdResolverService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalIdResolverService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();
    service = moduleRef.get(ExternalIdResolverService);
  });

  it('returns the id a found single resolve answered with', async () => {
    client.races.resolve.mockResolvedValue({ found: true, id: 7 });

    await expect(
      service.resolve('race', { externalSystemId: 1, externalId: 'id:47' }),
    ).resolves.toBe(7);
    expect(client.races.resolve).toHaveBeenCalledWith({
      externalSystemId: 1,
      externalId: 'id:47',
    });
  });

  it('returns undefined for a not-found single resolve', async () => {
    client.races.resolve.mockResolvedValue({ found: false });

    await expect(
      service.resolve('race', { externalSystemId: 1, externalId: 'id:47' }),
    ).resolves.toBeUndefined();
  });

  it('maps a batch answer index-aligned with the request', async () => {
    client.eras.resolveBatch.mockResolvedValue([
      { found: true, id: 3 },
      { found: false },
      { found: true, id: 5 },
    ]);
    const refs = [
      { externalSystemId: 1, externalId: 'a' },
      { externalSystemId: 1, externalId: 'b' },
      { externalSystemId: 1, externalId: 'c' },
    ];

    await expect(service.resolveBatch('era', refs)).resolves.toEqual([
      3,
      undefined,
      5,
    ]);
    expect(client.eras.resolveBatch).toHaveBeenCalledWith(refs);
  });

  it('answers an empty batch without a round trip', async () => {
    await expect(service.resolveBatch('era', [])).resolves.toEqual([]);
    expect(client.eras.resolveBatch).not.toHaveBeenCalled();
  });

  it('routes each kind to its own contract namespace', async () => {
    const cases = [
      ['coach', client.coaches],
      ['competition', client.competitions],
      ['competitionGroup', client.competitionGroups],
      ['era', client.eras],
      ['league', client.leagues],
      ['position', client.positions],
      ['race', client.races],
      ['rulesSet', client.rulesSets],
      ['team', client.teams],
    ] as const;

    for (const [kind, namespace] of cases) {
      namespace.resolve.mockResolvedValue({ found: true, id: 1 });
      await expect(
        service.resolve(kind, { externalSystemId: 1, externalId: 'x' }),
      ).resolves.toBe(1);
      expect(namespace.resolve).toHaveBeenCalledWith({
        externalSystemId: 1,
        externalId: 'x',
      });
    }
  });
});
