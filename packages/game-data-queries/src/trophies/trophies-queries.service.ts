import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  competitionGroups,
  competitions,
  countDistinct,
  DB,
  eq,
  ilike,
  inArray,
  leagues,
  or,
  sql,
  trophies,
  trophyAwardRuleEligiblePositions,
  trophyAwardRuleExcludedMatchEventTypes,
  trophyAwardRuleMatchEventTypes,
} from '@blood-bowl-tracker/db';
import type {
  TrophyAwardRuleKind,
  TrophyAwardRuleMeasure,
} from '@blood-bowl-tracker/domain-enums';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';

/**
 * A single trophy's display header, with whichever scope it carries
 * resolved. Exactly one of the two pairs is populated: a group-scoped trophy
 * names its competition group, a league-scoped one names its league. The
 * database's `trophies_group_or_league` check is what guarantees that.
 */
export type TrophyHeader = {
  id: number;
  name: string;
  description: string | null;
  competitionGroupId: number | null;
  competitionGroupName: string | null;
  leagueId: number | null;
  leagueName: string | null;
  /**
   * The trophy's award rule, as the deepdive needs it to render one sentence
   * about how the trophy is handed out. Exactly one of `awardProcedure` (a
   * human-authored sentence, for the two non-computable kinds) and the
   * generated sentence applies — see TrophyAwardRuleDescriptionService.
   */
  awardRuleKind: TrophyAwardRuleKind;
  awardProcedure: string | null;
  awardRuleTieCutoff: number | null;
  awardRuleThreshold: number | null;
  awardRuleMeasure: TrophyAwardRuleMeasure | null;
};

/**
 * Read-only trophy lookups, listings, award-rule curation and scoped counts
 * for the Discord bot. Trophy ingestion and `resolveByName` are
 * `TrophiesService` in packages/game-data.
 */
@Injectable()
export class TrophiesQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  /**
   * Case-insensitive prefix search for the `/deepdive trophy:` autocomplete.
   * Mirrors `ErasQueriesService.searchByNamePrefix`: the caller's raw text is escaped
   * before it becomes an ILIKE pattern, so `%`/`_` match literally.
   */
  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<
    {
      id: number;
      name: string;
      competitionGroupId: number | null;
      competitionGroupName: string | null;
      leagueName: string | null;
    }[]
  > {
    return (
      this.db
        .select({
          id: trophies.id,
          name: trophies.name,
          competitionGroupId: trophies.competitionGroupId,
          competitionGroupName: competitionGroups.name,
          leagueName: leagues.name,
        })
        .from(trophies)
        // Both joins are outer: a trophy carries exactly one of the two scopes,
        // so an inner join on either would drop every trophy of the other kind.
        // The league is the trophy's own, or the one its competition group
        // belongs to, so every trophy resolves to a league name.
        .leftJoin(
          competitionGroups,
          eq(competitionGroups.id, trophies.competitionGroupId),
        )
        .leftJoin(
          leagues,
          eq(
            leagues.id,
            sql`coalesce(${trophies.leagueId}, ${competitionGroups.leagueId})`,
          ),
        )
        .where(ilike(trophies.name, `${this.likePattern.escape(prefix)}%`))
        .orderBy(trophies.name)
        .limit(limit)
    );
  }

  /** One trophy's deepdive header, or `undefined` when no such trophy exists. */
  async findById(trophyId: number): Promise<TrophyHeader | undefined> {
    const rows = await this.db
      .select({
        id: trophies.id,
        name: trophies.name,
        description: trophies.description,
        competitionGroupId: trophies.competitionGroupId,
        competitionGroupName: competitionGroups.name,
        leagueId: trophies.leagueId,
        leagueName: leagues.name,
        awardRuleKind: trophies.awardRuleKind,
        awardProcedure: trophies.awardProcedure,
        awardRuleTieCutoff: trophies.awardRuleTieCutoff,
        awardRuleThreshold: trophies.awardRuleThreshold,
        awardRuleMeasure: trophies.awardRuleMeasure,
      })
      .from(trophies)
      // Outer for the same reason as in `searchByNamePrefix`.
      .leftJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .leftJoin(leagues, eq(leagues.id, trophies.leagueId))
      .where(eq(trophies.id, trophyId));
    return rows[0];
  }

  /**
   * One trophy's whole curated rule — its event types and its eligible
   * positions — flattened to display strings, the shape
   * TrophyAwardRuleDescriptionService takes, since it holds no database access
   * of its own. Underscores become spaces so a generated sentence reads as
   * prose rather than as column values.
   *
   * Everything the generated sentence needs is read here, in one call, so a
   * later restriction added to the rule cannot be left out of the sentence
   * that describes it.
   *
   * Action types and consequence types are kept separate rather than merged
   * into one list per included/excluded. A compound rule like Top Fouler
   * curates a `foul` action type together with a whole list of consequence
   * types — meaning "a foul that ALSO caused one of these consequences", an
   * AND of the two columns, not a flat OR list of unrelated event types. Only
   * keeping the columns apart lets TrophyAwardRuleDescriptionService render
   * that AND correctly.
   *
   * Eligible positions are read as the curated `Name`-system external ids the
   * junction table stores and reduced to their bare position name, rather than
   * joined through to `positions.name`. Those ids are what the executed rule
   * matches on, so the sentence names exactly the restriction that runs — and
   * it still names it when the importers have not created the `positions` rows
   * yet, which is precisely the case where a join would silently render the
   * rule as unrestricted.
   */
  async findAwardRuleCuration(trophyId: number): Promise<{
    includedActionTypes: string[];
    includedConsequenceTypes: string[];
    excludedActionTypes: string[];
    excludedConsequenceTypes: string[];
    eligiblePositions: string[];
  }> {
    const included = await this.db
      .select({
        actionType: trophyAwardRuleMatchEventTypes.actionType,
        consequenceType: trophyAwardRuleMatchEventTypes.consequenceType,
      })
      .from(trophyAwardRuleMatchEventTypes)
      .where(
        and(
          eq(trophyAwardRuleMatchEventTypes.trophyId, trophyId),
          eq(trophyAwardRuleMatchEventTypes.removed, false),
        ),
      )
      .orderBy(
        trophyAwardRuleMatchEventTypes.actionType,
        trophyAwardRuleMatchEventTypes.consequenceType,
      );
    const excluded = await this.db
      .select({
        actionType: trophyAwardRuleExcludedMatchEventTypes.actionType,
        consequenceType: trophyAwardRuleExcludedMatchEventTypes.consequenceType,
      })
      .from(trophyAwardRuleExcludedMatchEventTypes)
      .where(
        and(
          eq(trophyAwardRuleExcludedMatchEventTypes.trophyId, trophyId),
          eq(trophyAwardRuleExcludedMatchEventTypes.removed, false),
        ),
      )
      .orderBy(
        trophyAwardRuleExcludedMatchEventTypes.actionType,
        trophyAwardRuleExcludedMatchEventTypes.consequenceType,
      );
    const eligible = await this.db
      .select({
        positionNameExternalId:
          trophyAwardRuleEligiblePositions.positionNameExternalId,
      })
      .from(trophyAwardRuleEligiblePositions)
      .where(
        and(
          eq(trophyAwardRuleEligiblePositions.trophyId, trophyId),
          eq(trophyAwardRuleEligiblePositions.removed, false),
        ),
      )
      .orderBy(trophyAwardRuleEligiblePositions.positionNameExternalId);
    return {
      includedActionTypes: included
        .filter((row) => row.actionType !== null)
        .map(toDisplayType),
      includedConsequenceTypes: included
        .filter((row) => row.consequenceType !== null)
        .map(toDisplayType),
      excludedActionTypes: excluded
        .filter((row) => row.actionType !== null)
        .map(toDisplayType),
      excludedConsequenceTypes: excluded
        .filter((row) => row.consequenceType !== null)
        .map(toDisplayType),
      eligiblePositions: eligible.map((row) =>
        toPositionDisplayName(row.positionNameExternalId),
      ),
    };
  }

  /**
   * Every trophy a competition group awards, ordered by name. The competition
   * group deepdive lists these and offers a drill-down button each; it needs
   * no more than the id and label.
   */
  listByCompetitionGroup(
    competitionGroupId: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: trophies.id, name: trophies.name })
      .from(trophies)
      .where(eq(trophies.competitionGroupId, competitionGroupId))
      .orderBy(trophies.name);
  }

  /**
   * Every trophy scoped to a league rather than to one of its competition
   * groups, ordered by name. The league deepdive lists these and offers a
   * drill-down button each, and the competition group deepdive folds them in
   * alongside its own group-scoped trophies — a league-scoped trophy can be
   * awarded in any competition in that league. Mirrors
   * `listByCompetitionGroup`: id and label are all a button needs.
   */
  listByLeague(leagueId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: trophies.id, name: trophies.name })
      .from(trophies)
      .where(eq(trophies.leagueId, leagueId))
      .orderBy(trophies.name);
  }

  /**
   * The whole curated trophy catalog, each row carrying whichever scope
   * awards it — its competition group, or its league when the trophy is
   * league-scoped. Both joins are outer for the same reason as in
   * `findById`: a trophy has exactly one of the two scopes, so an inner join
   * on either would silently drop every trophy of the other kind.
   *
   * Scoping to a league matches a trophy either through its competition
   * group's own `leagueId` or through the trophy's own, so a league-scoped
   * trophy is included when the catalog is narrowed to its league. Ordering
   * is left to the caller, which sorts by scope name then trophy name for
   * display.
   */
  listAllWithLeague(scope: FactScope): Promise<
    {
      id: number;
      name: string;
      competitionGroupId: number | null;
      competitionGroupName: string | null;
      leagueId: number | null;
      leagueName: string | null;
    }[]
  > {
    const scopeLeagueId = scope.leagueId;
    return this.db
      .select({
        id: trophies.id,
        name: trophies.name,
        competitionGroupId: trophies.competitionGroupId,
        competitionGroupName: competitionGroups.name,
        leagueId: trophies.leagueId,
        leagueName: leagues.name,
      })
      .from(trophies)
      .leftJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .leftJoin(leagues, eq(leagues.id, trophies.leagueId))
      .where(
        scopeLeagueId === undefined
          ? undefined
          : or(
              eq(competitionGroups.leagueId, scopeLeagueId),
              eq(trophies.leagueId, scopeLeagueId),
            ),
      );
  }

  /**
   * The counts behind the stats summary's `Trophies:` line. Every one uses
   * `countDistinct(trophies.id)` rather than `count()` so a join that matches
   * a trophy more than once — the league query's competition-group join, the
   * competition query's — can never inflate the number.
   */
  countAll(): Promise<number> {
    return countRows(this.db, trophies);
  }

  /**
   * Both kinds of trophy a league owns: the ones scoped directly to it, and
   * the ones scoped to one of its competition groups. The same `or` condition
   * `listAllWithLeague` uses, and the join is outer for the same reason — an
   * inner join would drop every league-direct trophy.
   */
  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(trophies.id) })
      .from(trophies)
      .leftJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .where(
        or(
          eq(competitionGroups.leagueId, leagueId),
          eq(trophies.leagueId, leagueId),
        ),
      );
    return row.count;
  }

  /**
   * The trophies of every competition group that runs at least one
   * competition in this era, plus any trophy scoped directly to one of those
   * groups' leagues. A league-direct trophy can be awarded at any
   * competition in its league (see `TrophyAwardsService`'s award
   * validation), so it belongs to every era that league has a competition
   * in, not only trophies whose own catalog entry names a group.
   */
  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(trophies.id) })
      .from(trophies)
      .where(
        or(
          inArray(
            trophies.competitionGroupId,
            this.db
              .select({ competitionGroupId: competitions.competitionGroupId })
              .from(competitions)
              .where(eq(competitions.eraId, eraId)),
          ),
          inArray(
            trophies.leagueId,
            this.db
              .select({ leagueId: competitionGroups.leagueId })
              .from(competitions)
              .innerJoin(
                competitionGroups,
                eq(competitionGroups.id, competitions.competitionGroupId),
              )
              .where(eq(competitions.eraId, eraId)),
          ),
        ),
      );
    return row.count;
  }

  /**
   * The trophies of the one competition group this competition belongs to
   * (`competitions.competitionGroupId` is NOT NULL), plus any trophy scoped
   * directly to that group's league — for the same awarding reason as
   * `countByEra`.
   */
  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(trophies.id) })
      .from(trophies)
      .where(
        or(
          inArray(
            trophies.competitionGroupId,
            this.db
              .select({ competitionGroupId: competitions.competitionGroupId })
              .from(competitions)
              .where(eq(competitions.id, competitionId)),
          ),
          inArray(
            trophies.leagueId,
            this.db
              .select({ leagueId: competitionGroups.leagueId })
              .from(competitions)
              .innerJoin(
                competitionGroups,
                eq(competitionGroups.id, competitions.competitionGroupId),
              )
              .where(eq(competitions.id, competitionId)),
          ),
        ),
      );
    return row.count;
  }
}

/**
 * The bare position name inside a `Name`-system position external id, which
 * `NameExternalIdService.forPosition` builds as `"<raceName>: <positionName>"`.
 * An id in any other shape is displayed as-is rather than mangled — it is
 * still the truest description of what the rule matches on.
 */
function toPositionDisplayName(positionNameExternalId: string): string {
  const separator = positionNameExternalId.indexOf(': ');
  return separator === -1
    ? positionNameExternalId
    : positionNameExternalId.slice(separator + 2);
}

function toDisplayType(row: {
  actionType: string | null;
  consequenceType: string | null;
}): string {
  return (row.actionType ?? row.consequenceType ?? '').replaceAll('_', ' ');
}
