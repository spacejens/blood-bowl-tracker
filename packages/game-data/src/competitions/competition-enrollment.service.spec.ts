import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  CompetitionEnrollmentError,
  CompetitionEnrollmentService,
} from './competition-enrollment.service';

async function makeService(...rowsPerQuery: unknown[][]): Promise<{
  service: CompetitionEnrollmentService;
  chains: QueryChain[];
}> {
  const { db, chains } = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [CompetitionEnrollmentService, { provide: DB, useValue: db }],
  }).compile();
  return { service: moduleRef.get(CompetitionEnrollmentService), chains };
}

const data: UpsertCompetition = {
  name: 'Major Season 24',
  type: 'season',
  eraId: 20,
  teamEraIds: [100, 101],
  externalIds: [{ externalSystemId: 1, externalId: '73' }],
};

const owner = (ownerId: number) => ({
  ownerId,
  externalSystemId: 1,
  externalId: '73',
});

const stored = { id: 1, name: 'Stored Season', eraId: 20 };

const teamEra = (
  teamEraId: number,
  overrides: Partial<{
    eraId: number;
    teamName: string;
    coachId: number;
    coachName: string;
  }> = {},
) => ({
  teamEraId,
  eraId: 20,
  teamName: `Team ${teamEraId}`,
  coachId: teamEraId,
  coachName: `Coach ${teamEraId}`,
  ...overrides,
});

describe('CompetitionEnrollmentService', () => {
  describe('creating a competition', () => {
    it('accepts team eras of its era with distinct coaches', async () => {
      const { service, chains } = await makeService(
        [],
        [teamEra(100), teamEra(101)],
      );

      await expect(service.validate(data)).resolves.toBeUndefined();
      expect(chains).toHaveLength(2);
      expect(extractFilterValues(firstCallArg(chains[1].where))).toEqual([
        100, 101,
      ]);
    });

    it('rejects a team era of another era', async () => {
      const { service } = await makeService(
        [],
        [
          teamEra(100),
          teamEra(101, {
            eraId: 21,
            teamName: 'Orcland Raiders',
            coachName: 'Bob',
          }),
        ],
      );

      await expect(service.validate(data)).rejects.toThrow(
        'Cannot enroll team era 101 (team "Orcland Raiders", coach "Bob") in competition "Major Season 24": the team era belongs to era 21, but the competition belongs to era 20',
      );
    });

    it('rejects two new team eras of the same coach', async () => {
      const { service } = await makeService(
        [],
        [
          teamEra(100, {
            teamName: 'Orcland Raiders',
            coachId: 9,
            coachName: 'Bob',
          }),
          teamEra(101, {
            teamName: 'Elfheim Eagles',
            coachId: 9,
            coachName: 'Bob',
          }),
        ],
      );

      await expect(service.validate(data)).rejects.toThrow(
        'Cannot enroll team era 101 (team "Elfheim Eagles") in competition "Major Season 24": coach "Bob" already has team era 100 (team "Orcland Raiders") in it',
      );
    });

    it('checks new team eras in request order, whatever order the database returns them in', async () => {
      const { service } = await makeService(
        [],
        [
          teamEra(100, { coachId: 9, coachName: 'Bob' }),
          teamEra(101, { coachId: 9, coachName: 'Bob' }),
        ],
      );

      await expect(
        service.validate({ ...data, teamEraIds: [101, 100] }),
      ).rejects.toThrow(
        /^Cannot enroll team era 100 .* already has team era 101 /,
      );
    });

    it('labels a nameless new competition in its messages', async () => {
      const { service } = await makeService([], [teamEra(100, { eraId: 21 })]);

      await expect(
        service.validate({ ...data, name: undefined, teamEraIds: [100] }),
      ).rejects.toThrow('in competition "unnamed new competition"');
    });

    it('leaves a requested team era id matching no row to the upsert', async () => {
      const { service } = await makeService([], [teamEra(100)]);

      await expect(service.validate(data)).resolves.toBeUndefined();
    });

    it('checks nothing when no team eras are requested', async () => {
      const { service, chains } = await makeService([]);

      await expect(
        service.validate({ ...data, teamEraIds: [] }),
      ).resolves.toBeUndefined();
      expect(chains).toHaveLength(1);
    });

    it('leaves a create without an era to the upsert, which reports the missing field', async () => {
      const { service, chains } = await makeService([]);

      await expect(
        service.validate({ ...data, eraId: undefined }),
      ).resolves.toBeUndefined();
      expect(chains).toHaveLength(1);
    });
  });

  it('leaves external ids matching several competitions to the upsert, which reports the conflict', async () => {
    const { service, chains } = await makeService([owner(1), owner(2)]);

    await expect(service.validate(data)).resolves.toBeUndefined();
    expect(chains).toHaveLength(1);
  });

  describe('updating a competition', () => {
    it('queries only the team eras that are not enrolled yet', async () => {
      const { service, chains } = await makeService(
        [owner(1)],
        [stored],
        [teamEra(100)],
        [teamEra(101)],
      );

      await expect(service.validate(data)).resolves.toBeUndefined();
      expect(chains).toHaveLength(4);
      expect(extractFilterValues(firstCallArg(chains[1].where))).toBe(1);
      expect(extractFilterValues(firstCallArg(chains[2].where))).toBe(1);
      expect(extractFilterValues(firstCallArg(chains[3].where))).toEqual([101]);
    });

    it('rejects a new team era whose coach already has an enrolled one', async () => {
      const { service } = await makeService(
        [owner(1)],
        [stored],
        [
          teamEra(100, {
            teamName: 'Orcland Raiders',
            coachId: 9,
            coachName: 'Bob',
          }),
        ],
        [
          teamEra(101, {
            teamName: 'Elfheim Eagles',
            coachId: 9,
            coachName: 'Bob',
          }),
        ],
      );

      await expect(service.validate(data)).rejects.toThrow(
        'Cannot enroll team era 101 (team "Elfheim Eagles") in competition "Stored Season": coach "Bob" already has team era 100 (team "Orcland Raiders") in it',
      );
    });

    it('checks new team eras against the stored era when the payload omits eraId', async () => {
      const { service } = await makeService(
        [owner(1)],
        [stored],
        [],
        [teamEra(100), teamEra(101, { eraId: 21 })],
      );

      await expect(
        service.validate({ ...data, eraId: undefined }),
      ).rejects.toThrow(
        'the team era belongs to era 21, but the competition belongs to era 20',
      );
    });

    it('accepts an unchanged re-import even when the stored enrollment already breaks the rules', async () => {
      const { service, chains } = await makeService(
        [owner(1)],
        [stored],
        [teamEra(100, { coachId: 9 }), teamEra(101, { coachId: 9, eraId: 21 })],
      );

      await expect(service.validate(data)).resolves.toBeUndefined();
      expect(chains).toHaveLength(3);
    });

    it('rejects moving the competition to an era its enrolled team eras do not belong to', async () => {
      const { service, chains } = await makeService(
        [owner(1)],
        [stored],
        [teamEra(100, { teamName: 'Orcland Raiders', coachName: 'Bob' })],
      );

      await expect(
        service.validate({ ...data, eraId: 21, teamEraIds: [] }),
      ).rejects.toThrow(
        'Cannot move competition "Stored Season" to era 21: enrolled team era 100 (team "Orcland Raiders", coach "Bob") belongs to era 20',
      );
      expect(chains).toHaveLength(3);
    });

    it('accepts an era change when nothing is enrolled yet, checking new team eras against the new era', async () => {
      const { service } = await makeService(
        [owner(1)],
        [stored],
        [],
        [teamEra(100, { eraId: 21 })],
      );

      await expect(
        service.validate({ ...data, eraId: 21, teamEraIds: [100] }),
      ).resolves.toBeUndefined();
    });
  });

  it('throws its own named error class', async () => {
    const { service } = await makeService([], [teamEra(100, { eraId: 21 })]);

    const error: unknown = await service
      .validate({ ...data, teamEraIds: [100] })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CompetitionEnrollmentError);
    expect((error as Error).name).toBe('CompetitionEnrollmentError');
  });
});
