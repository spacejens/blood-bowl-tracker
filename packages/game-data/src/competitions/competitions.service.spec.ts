import type { Db } from '@blood-bowl-tracker/db';
import { competitions, competitionTeams, DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractFilterValues,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { MissingRequiredFieldError } from '../shared/missing-required-field-error';
import {
  CompetitionEnrollmentError,
  CompetitionEnrollmentService,
} from './competition-enrollment.service';
import {
  CompetitionsService,
  CompetitionUpsertConflictError,
} from './competitions.service';

const fakeCompetition = {
  id: 1,
  name: 'Major Season 24',
  type: 'season',
  eraId: 20,
  createdAt: new Date('2026-01-01'),
};

describe('CompetitionsService', () => {
  let service: CompetitionsService;
  let enrollment: MockProxy<CompetitionEnrollmentService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        { provide: CompetitionEnrollmentService, useValue: enrollment },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CompetitionsService);
    return { db, chains };
  }

  beforeEach(() => {
    enrollment = mock<CompetitionEnrollmentService>();
  });

  const baseData = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    teamEraIds: [100, 101],
    startDate: '2024-01-15',
    endDate: '2024-06-30',
    externalIds: [
      { externalSystemId: 1, externalId: '73' },
      { externalSystemId: 2, externalId: 'Major Season 24' },
    ],
  };

  // competitions.competition_group_id is NOT NULL with no database default,
  // so every create-path payload has to carry one; baseData deliberately
  // omits it so the update-path tests keep asserting on the columns they
  // actually exercise.
  const createData = { ...baseData, competitionGroupId: 3 };

  describe('upsert', () => {
    it('validates the enrollment against the full payload', async () => {
      await build([], [fakeCompetition]);

      await service.upsert(createData);

      expect(enrollment.validate).toHaveBeenCalledWith(createData);
    });

    it('writes nothing when the enrollment is rejected', async () => {
      const { chains } = await build([], [fakeCompetition]);
      enrollment.validate.mockRejectedValue(
        new CompetitionEnrollmentError('coach already enrolled'),
      );

      await expect(service.upsert(createData)).rejects.toThrow(
        CompetitionEnrollmentError,
      );
      expect(chains).toHaveLength(0);
    });

    it('creates a new competition with its team-era links when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new and get
      // inserted; query 3: no existing team-era links; query 4: both
      // team-era links are new and get inserted.
      const { db, chains } = await build([], [fakeCompetition]);

      const result = await service.upsert(createData);

      expect(result).toEqual({
        competition: { ...fakeCompetition, teamEraIds: [100, 101] },
        created: true,
      });
      expect(chains).toHaveLength(5);
      expect(db.insert).toHaveBeenCalledWith(competitions);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts the competition with its name, type, eraId and both dates', async () => {
      const { chains } = await build([], [fakeCompetition]);

      await service.upsert(createData);

      expect(firstCallArg(chains[1].values)).toEqual({
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        startDate: '2024-01-15',
        endDate: '2024-06-30',
        competitionGroupId: 3,
      });
    });

    it('omits endDate from the insert when the payload omits it', async () => {
      const { chains } = await build([], [fakeCompetition]);

      await service.upsert({ ...createData, endDate: undefined });

      expect(firstCallArg(chains[1].values)).toStrictEqual({
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        startDate: '2024-01-15',
        competitionGroupId: 3,
      });
    });

    it('throws MissingRequiredFieldError when creating a competition with no startDate', async () => {
      const { db } = await build([]);

      await expect(
        service.upsert({ ...createData, startDate: undefined }),
      ).rejects.toThrow(MissingRequiredFieldError);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('throws MissingRequiredFieldError when creating a competition with no competitionGroupId', async () => {
      const { db } = await build([]);

      await expect(service.upsert(baseData)).rejects.toThrow(
        MissingRequiredFieldError,
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('leaves stored dates alone on update when the payload omits them', async () => {
      // query 0: the external-id lookup matches competition 1; query 1: the
      // update.
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '73' }],
        [fakeCompetition],
      );

      await service.upsert({
        ...baseData,
        renameExisting: true,
        startDate: undefined,
        endDate: undefined,
      });

      expect(firstCallArg(chains[1].set)).toStrictEqual({
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
      });
    });

    it('writes null on update when the payload explicitly clears endDate', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '73' }],
        [fakeCompetition],
      );

      await service.upsert({ ...baseData, endDate: null });

      expect(firstCallArg(chains[1].set)).toMatchObject({ endDate: null });
    });

    it('updates the matching competition when exactly one external ID matches', async () => {
      const { db } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '73' }],
        [fakeCompetition],
      );

      const result = await service.upsert(baseData);

      expect(result.created).toBe(false);
      expect(db.update).toHaveBeenCalledWith(competitions);
    });

    it('throws CompetitionUpsertConflictError when external IDs match different competitions', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: '73' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Major Season 24' },
      ]);

      await expect(service.upsert(baseData)).rejects.toThrow(
        CompetitionUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts only the competition_teams rows that are new', async () => {
      const { chains } = await build(
        [],
        [fakeCompetition],
        [],
        [{ teamEraId: 100 }],
      );

      const result = await service.upsert(createData);

      expect(firstCallArg(chains[4].values)).toEqual([
        { competitionId: 1, teamEraId: 101 },
      ]);
      expect(result.competition.teamEraIds).toEqual([100, 101]);
    });

    it('does not insert competition_teams rows when all links already exist', async () => {
      const { db, chains } = await build(
        [],
        [fakeCompetition],
        [],
        [{ teamEraId: 100 }, { teamEraId: 101 }],
      );

      const result = await service.upsert(createData);

      expect(chains).toHaveLength(4);
      expect(db.insert).not.toHaveBeenCalledWith(competitionTeams);
      expect(result.competition.teamEraIds).toEqual([100, 101]);
    });

    it('writes competitionGroupId when the payload supplies one', async () => {
      const { chains } = await build([], [fakeCompetition]);

      await service.upsert({ ...baseData, competitionGroupId: 4 });

      expect(firstCallArg(chains[1].values)).toMatchObject({
        competitionGroupId: 4,
      });
    });

    it('updates only the supplied column, leaving eraId and type alone', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '35' }],
        [fakeCompetition],
      );

      await service.upsert({
        name: 'Major Season 12',
        renameExisting: true,
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '35' }],
      });

      expect(firstCallArg(chains[1].set)).toEqual({ name: 'Major Season 12' });
    });

    it('leaves the name out of an update that does not ask to rename', async () => {
      const { db, chains } = await build(
        [
          { ownerId: 1, externalSystemId: 1, externalId: '73' },
          { ownerId: 1, externalSystemId: 2, externalId: 'Major Season 24' },
        ],
        [fakeCompetition],
        [],
      );

      await service.upsert({ ...baseData, name: 'Raw Source Name' });

      expect(db.update).toHaveBeenCalledWith(competitions);
      expect(firstCallArg(chains[1].set)).toEqual({
        type: 'season',
        eraId: 20,
        startDate: '2024-01-15',
        endDate: '2024-06-30',
      });
    });

    it('renames on update when the payload asks to', async () => {
      const { chains } = await build(
        [
          { ownerId: 1, externalSystemId: 1, externalId: '73' },
          { ownerId: 1, externalSystemId: 2, externalId: 'Major Season 24' },
        ],
        [fakeCompetition],
        [],
      );

      await service.upsert({
        ...baseData,
        name: 'Major Season 24',
        renameExisting: true,
      });

      expect(firstCallArg(chains[1].set)).toMatchObject({
        name: 'Major Season 24',
      });
    });
  });

  describe('findById', () => {
    it('returns the competition row when found', async () => {
      await build([
        {
          id: 7,
          name: 'Major Season 24',
          type: 'season',
          eraId: 20,
          startDate: '2024-01-15',
          endDate: '2024-06-30',
        },
      ]);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        startDate: '2024-01-15',
        endDate: '2024-06-30',
      });
    });

    it('returns undefined when no competition matches', async () => {
      await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
    });

    it('selects the competition dates alongside its id/name/type/eraId', async () => {
      const { db } = await build([]);

      await service.findById(1);

      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['startDate', 'endDate']),
      );
    });
  });

  describe('listNamesAndTypesByGroup', () => {
    it('lists the name and type of every competition in the group', async () => {
      const rows = [
        { id: 7, name: 'Chaos Cup 7', type: 'cup' },
        { id: 8, name: 'Chaos Cup 8', type: 'cup' },
      ];
      const { db, chains } = await build(rows);

      await expect(service.listNamesAndTypesByGroup(3)).resolves.toEqual(rows);
      expect(chains[0].from).toHaveBeenCalledWith(competitions);
      expect(
        Object.keys(firstCallArg(db.select) as Record<string, unknown>).sort(),
      ).toEqual(['id', 'name', 'type']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(3);
    });
  });

  describe('findGroupIdById', () => {
    it("returns the competition's group id", async () => {
      const { chains } = await build([{ competitionGroupId: 3 }]);

      await expect(service.findGroupIdById(12)).resolves.toBe(3);
      expect(chains[0].from).toHaveBeenCalledWith(competitions);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(12);
    });

    it('returns undefined when no competition matches', async () => {
      await build([]);

      await expect(service.findGroupIdById(999)).resolves.toBeUndefined();
    });
  });
});
