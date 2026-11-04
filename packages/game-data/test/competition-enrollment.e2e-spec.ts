import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionGroups,
  competitions,
  competitionTeams,
  DB,
  eras,
  externalSystems,
  leagues,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import {
  CompetitionEnrollmentError,
  CompetitionEnrollmentService,
} from '../src/competitions/competition-enrollment.service';
import { CompetitionsService } from '../src/competitions/competitions.service';
import { LikePatternService } from '../src/shared/like-pattern.service';
import { connectTestDb } from './e2e-database';

/**
 * The enrollment rules against real Postgres: the validator's joins return
 * what the rules need, and a rejected upsert leaves no trace.
 */

interface Fixtures {
  systemId: number;
  eraA: number;
  eraB: number;
  groupId: number;
  /** Team eras: two teams of coach X in era A; coach Y's team in eras A and B. */
  xFirstInA: number;
  xSecondInA: number;
  yInA: number;
  yInB: number;
}

const ascending = (ids: number[]): number[] => [...ids].sort((a, b) => a - b);

describe('competition enrollment rules (real Postgres)', () => {
  let db: Db;
  let service: CompetitionsService;
  let f: Fixtures;

  const payload = (
    overrides: Partial<UpsertCompetition> = {},
  ): UpsertCompetition => ({
    name: 'Enrollment Cup',
    type: 'cup',
    eraId: f.eraA,
    startDate: '2020-02-01',
    competitionGroupId: f.groupId,
    teamEraIds: [],
    externalIds: [{ externalSystemId: f.systemId, externalId: 'cup' }],
    ...overrides,
  });

  const enrolledIds = async (): Promise<number[]> =>
    ascending(
      (await db.select().from(competitionTeams)).map((row) => row.teamEraId),
    );

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    const [system] = await db
      .insert(externalSystems)
      .values({ name: 'Source', category: 'imported_data_source' })
      .returning();
    const [league] = await db
      .insert(leagues)
      .values({ name: 'Fixture League' })
      .returning();
    const [eraA, eraB] = await db
      .insert(eras)
      .values([
        { name: 'Era A', leagueId: league.id, startDate: '2020-01-01' },
        { name: 'Era B', leagueId: league.id, startDate: '2021-01-01' },
      ])
      .returning();
    const [group] = await db
      .insert(competitionGroups)
      .values({
        name: 'Enrollment Cup',
        leagueId: league.id,
        namePattern: '^Enrollment Cup$',
      })
      .returning();
    const [race] = await db
      .insert(races)
      .values({ name: 'Fixture Race' })
      .returning();
    const [coachX, coachY] = await db
      .insert(coaches)
      .values([{ name: 'Coach X' }, { name: 'Coach Y' }])
      .returning();
    const [xFirst, xSecond, y] = await db
      .insert(teams)
      .values([
        { name: 'X First', raceId: race.id, coachId: coachX.id },
        { name: 'X Second', raceId: race.id, coachId: coachX.id },
        { name: 'Y Team', raceId: race.id, coachId: coachY.id },
      ])
      .returning();
    const [xFirstInA, xSecondInA, yInA, yInB] = await db
      .insert(teamEras)
      .values([
        { teamId: xFirst.id, eraId: eraA.id },
        { teamId: xSecond.id, eraId: eraA.id },
        { teamId: y.id, eraId: eraA.id },
        { teamId: y.id, eraId: eraB.id },
      ])
      .returning();
    f = {
      systemId: system.id,
      eraA: eraA.id,
      eraB: eraB.id,
      groupId: group.id,
      xFirstInA: xFirstInA.id,
      xSecondInA: xSecondInA.id,
      yInA: yInA.id,
      yInB: yInB.id,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        CompetitionEnrollmentService,
        { provide: LikePatternService, useValue: mock<LikePatternService>() },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CompetitionsService);
  });

  it('enrolls team eras of the competition era with distinct coaches', async () => {
    const { competition } = await service.upsert(
      payload({ teamEraIds: [f.xFirstInA, f.yInA] }),
    );

    expect(ascending(competition.teamEraIds)).toEqual(
      ascending([f.xFirstInA, f.yInA]),
    );
  });

  it('rejects a team era of another era and creates nothing', async () => {
    await expect(
      service.upsert(payload({ teamEraIds: [f.xFirstInA, f.yInB] })),
    ).rejects.toThrow(CompetitionEnrollmentError);
    expect(await db.select().from(competitions)).toEqual([]);
    expect(await enrolledIds()).toEqual([]);
  });

  it('rejects two new teams of one coach and creates nothing', async () => {
    await expect(
      service.upsert(payload({ teamEraIds: [f.xFirstInA, f.xSecondInA] })),
    ).rejects.toThrow('coach "Coach X" already has team era');
    expect(await db.select().from(competitions)).toEqual([]);
  });

  it('rejects a new team of an already-enrolled coach, keeping the existing enrollment', async () => {
    await service.upsert(payload({ teamEraIds: [f.xFirstInA] }));

    await expect(
      service.upsert(payload({ teamEraIds: [f.xSecondInA, f.yInA] })),
    ).rejects.toThrow(CompetitionEnrollmentError);
    expect(await enrolledIds()).toEqual([f.xFirstInA]);
  });

  it('rejects an era change that enrolled team eras do not fit, leaving the era alone', async () => {
    await service.upsert(payload({ teamEraIds: [f.xFirstInA] }));

    await expect(service.upsert(payload({ eraId: f.eraB }))).rejects.toThrow(
      'Cannot move competition "Enrollment Cup"',
    );
    const [stored] = await db.select().from(competitions);
    expect(stored.eraId).toBe(f.eraA);
  });

  it('accepts an unchanged re-import of an enrollment that already breaks the rules', async () => {
    const { competition } = await service.upsert(
      payload({ teamEraIds: [f.xFirstInA] }),
    );
    await db
      .insert(competitionTeams)
      .values({ competitionId: competition.id, teamEraId: f.xSecondInA });

    await expect(
      service.upsert(payload({ teamEraIds: [f.xFirstInA, f.xSecondInA] })),
    ).resolves.toMatchObject({ created: false });
  });
});
