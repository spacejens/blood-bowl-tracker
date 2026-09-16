import type { Db } from '@blood-bowl-tracker/db';
import { DB, skills } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { firstCallArg } from '../shared/query-assertions.test-helpers';
import { SkillsService, SkillUpsertConflictError } from './skills.service';

const fakeSkill = {
  id: 7,
  name: 'Block',
  createdAt: new Date('2026-01-01'),
};

const data = {
  name: 'Block',
  externalIds: [
    { externalSystemId: 1, externalId: '3' },
    { externalSystemId: 2, externalId: 'Name: Block' },
  ],
};

describe('SkillsService', () => {
  let service: SkillsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [SkillsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(SkillsService);
    return { db, chains };
  }

  it('creates a new skill when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert returns
    // the row; query 2: both external IDs are new, so they get inserted.
    const { db, chains } = await build([], [fakeSkill]);

    const result = await service.upsert(data);

    expect(result).toEqual({ skill: fakeSkill, created: true });
    expect(chains).toHaveLength(3);
    expect(db.insert).toHaveBeenCalledWith(skills);
    expect(db.update).not.toHaveBeenCalled();
    expect(firstCallArg(chains[1].values)).toEqual({ name: 'Block' });
  });

  it('updates the matched skill when one external ID already exists', async () => {
    // query 0: the lookup matches one owner; query 1: the update returns the
    // row; query 2: the still-missing external ID is inserted.
    const { db } = await build(
      [{ ownerId: 7, externalSystemId: 1, externalId: '3' }],
      [{ ...fakeSkill, name: 'Block!' }],
    );

    const result = await service.upsert({ ...data, name: 'Block!' });

    expect(result.created).toBe(false);
    expect(result.skill.name).toBe('Block!');
    expect(db.update).toHaveBeenCalledWith(skills);
  });

  it('rejects an upsert whose external IDs name two different skills', async () => {
    const { db } = await build([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
      { ownerId: 8, externalSystemId: 2, externalId: 'Name: Block' },
    ]);

    await expect(service.upsert(data)).rejects.toBeInstanceOf(
      SkillUpsertConflictError,
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('names the entity in the conflict message', async () => {
    await build([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
      { ownerId: 8, externalSystemId: 2, externalId: 'Name: Block' },
    ]);

    await expect(service.upsert(data)).rejects.toThrow(/skills/);
  });
});
