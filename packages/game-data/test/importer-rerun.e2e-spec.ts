import type { Db, PgTable } from '@blood-bowl-tracker/db';
import {
  coaches,
  coachesHistory,
  competitionGroups,
  competitions,
  competitionsHistory,
  DB,
  eras,
  erasHistory,
  externalSystems,
  leagues,
  leaguesHistory,
  positions,
  positionsHistory,
  races,
  racesHistory,
  skills,
  skillsHistory,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { CoachesService } from '../src/coaches/coaches.service';
import { CompetitionsService } from '../src/competitions/competitions.service';
import { ErasService } from '../src/eras/eras.service';
import { LeaguesService } from '../src/leagues/leagues.service';
import { PositionsService } from '../src/positions/positions.service';
import { RacesService } from '../src/races/races.service';
import { LikePatternService } from '../src/shared/like-pattern.service';
import { MatchEventCountsService } from '../src/shared/match-event-counts.service';
import { MatchOutcomeCountsService } from '../src/shared/match-outcome-counts.service';
import { TrophyAwardCountsService } from '../src/shared/trophy-award-counts.service';
import { SkillsService } from '../src/skills/skills.service';
import { connectTestDb } from './e2e-database';

/**
 * Importers run again and again against a database that is never dropped.
 * These tests pin, per entity, that re-sending identical data writes nothing
 * (no history row, no `updated_at` bump), and that a source importer's
 * re-run never undoes a name the manual importer curated. Trophies have
 * their own file, `trophy-rule-curation-rerun.e2e-spec.ts`.
 */

interface Services {
  leagues: LeaguesService;
  eras: ErasService;
  races: RacesService;
  coaches: CoachesService;
  skills: SkillsService;
  positions: PositionsService;
  competitions: CompetitionsService;
}

interface Fixtures {
  systemId: number;
  leagueId: number;
  eraId: number;
  groupId: number;
}

type TablePair = readonly [PgTable, PgTable];

/** Each tracked table and its history table, read whole. */
async function snapshot(
  db: Db,
  pairs: readonly TablePair[],
): Promise<unknown[]> {
  const result: unknown[] = [];
  for (const [table, history] of pairs) {
    result.push(await db.select().from(table));
    result.push(await db.select().from(history));
  }
  return result;
}

function externalIds(fixtures: Fixtures, id: string) {
  return [{ externalSystemId: fixtures.systemId, externalId: id }];
}

interface RerunCase {
  label: string;
  tables: readonly TablePair[];
  upsert: (services: Services, fixtures: Fixtures) => Promise<unknown>;
}

const RERUN_CASES: readonly RerunCase[] = [
  {
    label: 'league',
    tables: [[leagues, leaguesHistory]],
    upsert: (s, f) =>
      s.leagues.upsert({
        name: 'Rerun League',
        externalIds: externalIds(f, 'l'),
      }),
  },
  {
    label: 'era',
    tables: [[eras, erasHistory]],
    upsert: (s, f) =>
      s.eras.upsert({
        name: 'Rerun Era',
        leagueId: f.leagueId,
        rulesSetIds: [],
        startDate: '2021-01-01',
        endDate: null,
        externalIds: externalIds(f, 'e'),
      }),
  },
  {
    label: 'race',
    tables: [[races, racesHistory]],
    upsert: (s, f) =>
      s.races.upsert({
        name: 'Ogre',
        eras: [],
        externalIds: externalIds(f, 'r'),
      }),
  },
  {
    label: 'coach',
    tables: [[coaches, coachesHistory]],
    upsert: (s, f) =>
      s.coaches.upsert({ name: 'Roze M', externalIds: externalIds(f, 'c') }),
  },
  {
    label: 'skill',
    tables: [[skills, skillsHistory]],
    upsert: (s, f) =>
      s.skills.upsert({ name: 'Block', externalIds: externalIds(f, 's') }),
  },
  {
    label: 'position',
    tables: [[positions, positionsHistory]],
    upsert: (s, f) =>
      s.positions.upsert({
        name: 'Ogre Blocker',
        isStarPlayer: false,
        externalIds: externalIds(f, 'p'),
      }),
  },
  {
    label: 'competition',
    tables: [[competitions, competitionsHistory]],
    upsert: (s, f) =>
      s.competitions.upsert({
        name: 'Chaos Cup 1',
        type: 'cup',
        eraId: f.eraId,
        startDate: '2020-02-01',
        endDate: '2020-02-02',
        competitionGroupId: f.groupId,
        teamEraIds: [],
        externalIds: externalIds(f, 'k'),
      }),
  },
];

interface RenamePayload {
  name: string;
  renameExisting?: boolean;
}

interface RenameCase {
  label: string;
  tables: readonly TablePair[];
  /** Upserts the entity and resolves to its stored name afterwards. */
  upsert: (
    services: Services,
    fixtures: Fixtures,
    payload: RenamePayload,
  ) => Promise<string>;
}

const RENAME_CASES: readonly RenameCase[] = [
  {
    label: 'coach',
    tables: [[coaches, coachesHistory]],
    upsert: async (s, f, p) =>
      (await s.coaches.upsert({ ...p, externalIds: externalIds(f, 'c') })).coach
        .name,
  },
  {
    label: 'skill',
    tables: [[skills, skillsHistory]],
    upsert: async (s, f, p) =>
      (await s.skills.upsert({ ...p, externalIds: externalIds(f, 's') })).skill
        .name,
  },
  {
    label: 'position',
    tables: [[positions, positionsHistory]],
    upsert: async (s, f, p) =>
      (
        await s.positions.upsert({
          ...p,
          isStarPlayer: false,
          externalIds: externalIds(f, 'p'),
        })
      ).position.name,
  },
  {
    label: 'competition',
    tables: [[competitions, competitionsHistory]],
    upsert: async (s, f, p) =>
      (
        await s.competitions.upsert({
          ...p,
          type: 'cup',
          eraId: f.eraId,
          startDate: '2020-02-01',
          endDate: '2020-02-02',
          competitionGroupId: f.groupId,
          teamEraIds: [],
          externalIds: externalIds(f, 'k'),
        })
      ).competition.name,
  },
];

describe('importer re-runs (real Postgres)', () => {
  let db: Db;
  let services: Services;
  let fixtures: Fixtures;

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
    const [era] = await db
      .insert(eras)
      .values({
        name: 'Fixture Era',
        leagueId: league.id,
        startDate: '2020-01-01',
      })
      .returning();
    const [group] = await db
      .insert(competitionGroups)
      .values({
        name: 'Chaos Cup',
        leagueId: league.id,
        namePattern: '^Chaos Cup(?:\\s*\\d+)?$',
      })
      .returning();
    fixtures = {
      systemId: system.id,
      leagueId: league.id,
      eraId: era.id,
      groupId: group.id,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesService,
        ErasService,
        RacesService,
        CoachesService,
        SkillsService,
        PositionsService,
        CompetitionsService,
        { provide: LikePatternService, useValue: mock<LikePatternService>() },
        {
          provide: MatchEventCountsService,
          useValue: mock<MatchEventCountsService>(),
        },
        {
          provide: MatchOutcomeCountsService,
          useValue: mock<MatchOutcomeCountsService>(),
        },
        {
          provide: TrophyAwardCountsService,
          useValue: mock<TrophyAwardCountsService>(),
        },
        { provide: DB, useValue: db },
      ],
    }).compile();
    services = {
      leagues: moduleRef.get(LeaguesService),
      eras: moduleRef.get(ErasService),
      races: moduleRef.get(RacesService),
      coaches: moduleRef.get(CoachesService),
      skills: moduleRef.get(SkillsService),
      positions: moduleRef.get(PositionsService),
      competitions: moduleRef.get(CompetitionsService),
    };
  });

  describe.each(RERUN_CASES)('$label', ({ tables, upsert }) => {
    it('writes nothing when re-run with identical data', async () => {
      await upsert(services, fixtures);
      const before = await snapshot(db, tables);

      await upsert(services, fixtures);

      expect(await snapshot(db, tables)).toEqual(before);
    });
  });

  describe.each(RENAME_CASES)('$label name', ({ tables, upsert }) => {
    it('takes the payload name on create (a fresh import)', async () => {
      await expect(
        upsert(services, fixtures, { name: 'Raw Name' }),
      ).resolves.toBe('Raw Name');
    });

    it('keeps a curated rename when a source importer re-sends its raw name, writing nothing', async () => {
      await upsert(services, fixtures, { name: 'Raw Name' });
      await expect(
        upsert(services, fixtures, {
          name: 'Curated Name',
          renameExisting: true,
        }),
      ).resolves.toBe('Curated Name');
      const before = await snapshot(db, tables);

      await expect(
        upsert(services, fixtures, { name: 'Raw Name' }),
      ).resolves.toBe('Curated Name');

      expect(await snapshot(db, tables)).toEqual(before);
    });
  });
});
