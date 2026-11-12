import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { SkillsService } from './skills.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [SkillsService, { provide: DB, useValue: db }],
  }).compile();
  return { service: moduleRef.get(SkillsService), chains };
}

describe('SkillsService.resolveBatch', () => {
  it('answers each pair with the skill id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: '3' },
        { externalSystemId: 1, externalId: '999' },
      ]),
    ).resolves.toEqual([{ found: true, id: 7 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('SkillsService.resolve', () => {
  it('answers a single pair with the skill id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '3' }),
    ).resolves.toEqual({ found: true, id: 7 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '404' }),
    ).resolves.toEqual({ found: false });
  });
});

describe('SkillsService.namesByExternalId', () => {
  it("answers each external id a skill declares with that skill's name, in one query", async () => {
    const { service, chains } = await makeService([
      { externalId: '154', name: 'Loner' },
      { externalId: '103', name: 'Shadowing' },
    ]);

    await expect(
      service.namesByExternalId({
        externalSystemId: 1,
        externalIds: ['154', '103', '999'],
      }),
    ).resolves.toEqual(
      new Map([
        ['154', 'Loner'],
        ['103', 'Shadowing'],
      ]),
    );
    expect(chains).toHaveLength(1);
  });

  it('returns no names without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(
      service.namesByExternalId({ externalSystemId: 1, externalIds: [] }),
    ).resolves.toEqual(new Map());
    expect(chains).toHaveLength(0);
  });
});
