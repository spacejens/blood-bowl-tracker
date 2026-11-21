import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionGroups,
  competitions,
  eras,
  leagues,
  matches,
  matchEvents,
  matchTeams,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type {
  ActionType,
  ConsequenceType,
  MatchCategory,
} from '@blood-bowl-tracker/domain-enums';

/* Seed helpers shared by the per-match average e2e specs. */

export interface LeagueFixture {
  leagueId: number;
  eraId: number;
  competitionId: number;
}

/**
 * One event recorded on a side: an action it took (`actionType`, keyed on the
 * acting side) and/or a consequence (`consequenceType`, keyed on the
 * consequence side). The consequence lands on the recording side unless
 * `victimSide` names another side by its index in `PlayMatchesOptions.sides`,
 * which is how one row records a foul by one side injuring the other.
 */
export interface SideEvent {
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
  victimSide?: number;
}

export interface MatchSide {
  teamEraId: number;
  score: number;
  /** Events recorded on this side in every one of the matches. */
  events?: SideEvent[];
}

export interface PlayMatchesOptions {
  count: number;
  competitionId: number;
  category?: MatchCategory;
  sides: MatchSide[];
}

/** One league with one era and one season competition in it. */
export async function seedLeague(
  db: Db,
  suffix: string,
): Promise<LeagueFixture> {
  const [league] = await db
    .insert(leagues)
    .values({ name: `League ${suffix}` })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({
      name: `Era ${suffix}`,
      leagueId: league.id,
      startDate: '2020-01-01',
    })
    .returning();
  const [group] = await db
    .insert(competitionGroups)
    .values({
      name: `Season ${suffix}`,
      leagueId: league.id,
      namePattern: `^Season ${suffix}\\s*\\d+$`,
    })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({
      name: `Season ${suffix} 1`,
      type: 'season',
      eraId: era.id,
      competitionGroupId: group.id,
      startDate: '2020-02-01',
    })
    .returning();
  return {
    leagueId: league.id,
    eraId: era.id,
    competitionId: competition.id,
  };
}

/** A coach; returns the coach id. */
export async function seedCoach(db: Db, name: string): Promise<number> {
  const [coach] = await db.insert(coaches).values({ name }).returning();
  return coach.id;
}

/**
 * A team with its own race; returns the team id. The team gets its own coach
 * (named `<name> Coach`) unless `coachId` names an existing one.
 */
export async function seedTeam(
  db: Db,
  name: string,
  coachId?: number,
): Promise<number> {
  const [race] = await db
    .insert(races)
    .values({ name: `${name} Race` })
    .returning();
  const teamCoachId = coachId ?? (await seedCoach(db, `${name} Coach`));
  const [team] = await db
    .insert(teams)
    .values({ name, raceId: race.id, coachId: teamCoachId })
    .returning();
  return team.id;
}

/** Enter a team into an era; returns the team era id. */
export async function joinEra(
  db: Db,
  teamId: number,
  eraId: number,
): Promise<number> {
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId, eraId })
    .returning();
  return teamEra.id;
}

/** Record `count` identical matches between the given sides. */
export async function playMatches(
  db: Db,
  options: PlayMatchesOptions,
): Promise<void> {
  for (let i = 0; i < options.count; i += 1) {
    const [match] = await db
      .insert(matches)
      .values({
        competitionId: options.competitionId,
        playedAt: new Date(Date.UTC(2020, 2, 1 + i, 12)),
        name: `Match ${i + 1}`,
        category: options.category ?? 'normal',
      })
      .returning();
    const matchTeamIds: number[] = [];
    for (const { teamEraId, score } of options.sides) {
      const [matchTeam] = await db
        .insert(matchTeams)
        .values({ matchId: match.id, teamEraId, score })
        .returning();
      matchTeamIds.push(matchTeam.id);
    }
    const events = options.sides.flatMap(({ events: sideEvents = [] }, index) =>
      sideEvents.map((event) => ({
        matchId: match.id,
        actingMatchTeamId:
          event.actionType === undefined ? undefined : matchTeamIds[index],
        actionType: event.actionType,
        consequenceMatchTeamId:
          event.consequenceType === undefined
            ? undefined
            : matchTeamIds[event.victimSide ?? index],
        consequenceType: event.consequenceType,
      })),
    );
    if (events.length > 0) {
      await db.insert(matchEvents).values(events);
    }
  }
}
