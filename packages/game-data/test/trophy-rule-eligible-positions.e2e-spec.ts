import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionGroups,
  competitions,
  DB,
  eq,
  eras,
  externalSystems,
  leagues,
  matches,
  matchEvents,
  matchTeams,
  players,
  positionExternalIds,
  positions,
  races,
  teamEras,
  teams,
  trophies,
  trophyAwardRuleEligiblePositions,
  trophyAwardRuleExcludedMatchEventTypes,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MatchScopeFilterService } from '../src/shared/match-scope-filter.service';
import { MaxCountTrophyRuleService } from '../src/trophy-awards/max-count-trophy-rule.service';
import { MaxSppSumTrophyRuleService } from '../src/trophy-awards/max-spp-sum-trophy-rule.service';
import { MissingTrophyAwardsService } from '../src/trophy-awards/missing-trophy-awards.service';
import { CareerThresholdTrophyRuleService } from '../src/trophy-awards/threshold-trophy-rule.service';
import { TrophyAwardsService } from '../src/trophy-awards/trophy-awards.service';
import { TrophyRuleEventTypeFilterService } from '../src/trophy-awards/trophy-rule-event-type-filter.service';
import { TrophyRulePositionFilterService } from '../src/trophy-awards/trophy-rule-position-filter.service';
import { connectTestDb } from './e2e-database';

/**
 * Bierhallenführer's position restriction, end to end against real Postgres.
 * The unit specs can only assert that a condition reaches `where()`; whether
 * the curated `Name`-system external ids really resolve to the right
 * `positions` rows, and whether the resulting `IN (...)` genuinely keeps a
 * higher-scoring non-Ogre out of the award, are questions only a real
 * database answers.
 *
 * The fixture is deliberately shaped so the restriction is the ONLY thing
 * that changes the answer: the Gnoblar Lineman outscores every Ogre, so a
 * rule that ignored eligible positions would award him.
 */

const GNOBLAR_SPP = 40;
const OGRE_BLOCKER_SPP = 25;
const RUNT_PUNTER_SPP = 12;

interface Fixtures {
  competitionId: number;
  trophyId: number;
  gnoblarId: number;
  ogreBlockerId: number;
  runtPunterId: number;
}

interface SeedOptions {
  /** Curated eligible positions, as `Name`-system external ids. */
  eligible: readonly string[];
}

async function seed(db: Db, options: SeedOptions): Promise<Fixtures> {
  const [league] = await db
    .insert(leagues)
    .values({ name: 'Ogre League' })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'Ogre Era', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  const [coach] = await db
    .insert(coaches)
    .values({ name: 'Ogre Coach' })
    .returning();
  const [race] = await db.insert(races).values({ name: 'Ogre' }).returning();
  const [team] = await db
    .insert(teams)
    .values({ name: 'Appenzeller Jodlers', raceId: race.id, coachId: coach.id })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: team.id, eraId: era.id })
    .returning();
  const [group] = await db
    .insert(competitionGroups)
    .values({ name: 'Ogretoberfest', leagueId: league.id })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({
      name: 'Ogretoberfest 1',
      type: 'cup',
      eraId: era.id,
      competitionGroupId: group.id,
      startDate: '2020-01-01',
    })
    .returning();

  const [nameSystem] = await db
    .insert(externalSystems)
    .values(NAME_EXTERNAL_SYSTEM)
    .returning();
  const positionIdByNameId = new Map<string, number>();
  for (const [name, nameId] of [
    // The stored name is TP's spelling; BBL calls the same position "Ogre
    // Blockers". That disagreement is exactly why the restriction is curated
    // as a Name external id and not as the position's name.
    ['Ogre Blocker', 'Ogre: Ogre Blocker'],
    ['Ogre Runt Punter', 'Ogre: Ogre Runt Punter'],
    ['Gnoblar Lineman', 'Ogre: Gnoblar Lineman'],
  ] as const) {
    const [position] = await db
      .insert(positions)
      .values({ name, isStarPlayer: false })
      .returning();
    await db.insert(positionExternalIds).values({
      positionId: position.id,
      externalSystemId: nameSystem.id,
      externalId: nameId,
    });
    positionIdByNameId.set(nameId, position.id);
  }

  const [trophy] = await db
    .insert(trophies)
    .values({
      name: 'Bierhallenführer',
      recipientKind: 'player',
      competitionGroupId: group.id,
      leagueId: null,
      awardRuleKind: 'max_spp_sum',
      // Stated because the column carries a temporary non-null default for
      // rolling deployments, which a computed kind must not pick up.
      awardProcedure: null,
      awardRuleRole: 'acting',
      awardRuleTieCutoff: 4,
    })
    .returning();
  await db
    .insert(trophyAwardRuleExcludedMatchEventTypes)
    .values({ trophyId: trophy.id, actionType: 'mvp_award' });
  if (options.eligible.length > 0) {
    await db.insert(trophyAwardRuleEligiblePositions).values(
      options.eligible.map((positionNameExternalId) => ({
        trophyId: trophy.id,
        positionNameExternalId,
      })),
    );
  }

  const [match] = await db
    .insert(matches)
    .values({
      competitionId: competition.id,
      playedAt: new Date('2020-01-02'),
      name: 'Ogretoberfest match',
      category: 'normal',
    })
    .returning();
  const [matchTeam] = await db
    .insert(matchTeams)
    .values({ matchId: match.id, teamEraId: teamEra.id })
    .returning();

  const addPlayer = async (
    name: string,
    nameId: string,
    sppValue: number,
  ): Promise<number> => {
    const [player] = await db
      .insert(players)
      .values({
        name,
        teamEraId: teamEra.id,
        positionId: positionIdByNameId.get(nameId)!,
      })
      .returning();
    await db.insert(matchEvents).values({
      matchId: match.id,
      actingMatchTeamId: matchTeam.id,
      actingPlayerId: player.id,
      actionType: 'touchdown',
      sppValue,
    });
    return player.id;
  };

  return {
    competitionId: competition.id,
    trophyId: trophy.id,
    gnoblarId: await addPlayer('Sneaky', 'Ogre: Gnoblar Lineman', GNOBLAR_SPP),
    ogreBlockerId: await addPlayer(
      'Hippo',
      'Ogre: Ogre Blocker',
      OGRE_BLOCKER_SPP,
    ),
    runtPunterId: await addPlayer(
      'Paddan',
      'Ogre: Ogre Runt Punter',
      RUNT_PUNTER_SPP,
    ),
  };
}

describe('trophy award rule eligible positions (real Postgres)', () => {
  let db: Db;
  let service: MissingTrophyAwardsService;

  const awardedPlayerIds = async (trophyId: number): Promise<number[]> =>
    (
      await db
        .select({ playerId: trophyAwards.playerId })
        .from(trophyAwards)
        .where(eq(trophyAwards.trophyId, trophyId))
    ).map((row) => row.playerId!);

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MissingTrophyAwardsService,
        MaxCountTrophyRuleService,
        MaxSppSumTrophyRuleService,
        CareerThresholdTrophyRuleService,
        TrophyAwardsService,
        TrophyRuleEventTypeFilterService,
        TrophyRulePositionFilterService,
        MatchScopeFilterService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(MissingTrophyAwardsService);
  });

  it('awards the best eligible Ogre, not the higher-scoring Gnoblar', async () => {
    const fixtures = await seed(db, {
      eligible: ['Ogre: Ogre Blocker', 'Ogre: Ogre Runt Punter'],
    });

    await service.computeMissingAwards(fixtures.competitionId);

    // The Gnoblar tops the competition's SPP table outright and still loses:
    // he is not an Ogre. Among the two eligible Ogres the higher sum wins.
    await expect(awardedPlayerIds(fixtures.trophyId)).resolves.toEqual([
      fixtures.ogreBlockerId,
    ]);
  });

  it('awards the Gnoblar when the rule curates no restriction', async () => {
    const fixtures = await seed(db, { eligible: [] });

    await service.computeMissingAwards(fixtures.competitionId);

    // The same fixture without the curated rows: no restriction means every
    // non-star player is a candidate, which is what the other trophies rely
    // on. This is what Bierhallenführer did before the restriction existed.
    await expect(awardedPlayerIds(fixtures.trophyId)).resolves.toEqual([
      fixtures.gnoblarId,
    ]);
  });

  it('awards nobody when no curated eligible position exists', async () => {
    const fixtures = await seed(db, { eligible: ['Ogre: Typo Punter'] });

    await service.computeMissingAwards(fixtures.competitionId);

    // A restriction whose ids resolve to nothing must not silently widen back
    // to every player — an authoring typo awards nobody rather than the wrong
    // player.
    await expect(awardedPlayerIds(fixtures.trophyId)).resolves.toEqual([]);
  });
});
