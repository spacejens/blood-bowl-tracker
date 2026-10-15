import type {
  ExternalId,
  ResolveResult,
  UpsertTrophy,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Trophy } from '@blood-bowl-tracker/db';
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
  trophies,
  trophyAwardRuleEligiblePositions,
  trophyAwardRuleExcludedMatchEventTypes,
  trophyAwardRuleMatchEventTypes,
  trophyExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import type {
  TrophyAwardRuleKind,
  TrophyAwardRuleMeasure,
} from '../trophy-awards/trophy-rule-types';
import { TrophyRuleCurationSyncService } from './trophy-rule-curation-sync.service';

export class TrophyUpsertConflictError extends UpsertConflictError {}

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

@Injectable()
export class TrophiesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly ruleCurationSync: TrophyRuleCurationSyncService,
  ) {}

  /**
   * Case-insensitive prefix search for the `/deepdive trophy:` autocomplete.
   * Mirrors `ErasService.searchByNamePrefix`: the caller's raw text is escaped
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
        .leftJoin(
          competitionGroups,
          eq(competitionGroups.id, trophies.competitionGroupId),
        )
        .leftJoin(leagues, eq(leagues.id, trophies.leagueId))
        .where(ilike(trophies.name, `${this.likePattern.escape(prefix)}%`))
        .orderBy(trophies.name)
        .limit(limit)
    );
  }

  /**
   * Which trophy carries this exact curated name. Answers in the same
   * `{ found, id }` shape as every entity's external-id `resolve`, and for
   * the same reason: an unmatched name is an authoring typo in a curated
   * file, which the caller reports and skips, not a server fault.
   *
   * Exact and case-sensitive, unlike `searchByNamePrefix` above — the caller
   * is quoting a name out of the curated catalog, not searching for one.
   *
   * Two rows sharing a name answers `{ found: false }` rather than picking
   * one arbitrarily: trophy names are not unique by construction (the same
   * name can be curated once per competition tier), so an ambiguous name is
   * exactly as unusable to the caller as an unknown one, and silently
   * awarding the wrong tier's trophy would be worse than reporting it.
   * `limit(2)` is all it takes to tell the two cases apart.
   */
  async resolveByName(name: string): Promise<ResolveResult> {
    const rows = await this.db
      .select({ id: trophies.id })
      .from(trophies)
      .where(eq(trophies.name, name))
      .limit(2);
    return rows.length === 1
      ? { found: true, id: rows[0].id }
      : { found: false };
  }

  /**
   * Resolve one external-id pair to the trophy that already declares it, or
   * `{ found: false }`. How an importer finds a curated trophy by the key its
   * source uses for it (TP's `${disambiguator}-${groupName}`) without ever
   * creating one: an unknown key is authored-data feedback the caller
   * reports, not a trophy to invent.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await resolveByExternalIds({
      db: this.db,
      externalIdTable: trophyExternalIds,
      ownerIdColumn: trophyExternalIds.trophyId,
      externalSystemIdColumn: trophyExternalIds.externalSystemId,
      externalIdColumn: trophyExternalIds.externalId,
      externalIds: [externalId],
    });
    return result;
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
   * The trophy row's scalar rule columns and its junction-table event types
   * must commit or roll back together — a trophy left holding a new rule
   * kind beside a stale set of event-type rows from its old rule is an
   * inconsistent, half-migrated state. The rule-curation sync (`TrophyRuleCurationSyncService`) therefore runs as
   * `upsertByExternalIds`' `afterUpsert` hook, inside the transaction that
   * helper already opens, rather than in a second one of its own. Handing the
   * sync to the helper this way — instead of opening an outer transaction
   * here and passing it down — also keeps the helper's lost-external-id-race
   * retry, which only it can safely own.
   */
  async upsert(
    data: UpsertTrophy,
  ): Promise<{ trophy: Trophy; created: boolean }> {
    const { row: trophy, created } = await upsertByExternalIds<
      typeof trophies,
      typeof trophyExternalIds
    >({
      db: this.db,
      entityTable: trophies,
      entityIdColumn: trophies.id,
      values: {
        name: data.name,
        recipientKind: data.recipientKind,
        description: data.description,
        competitionGroupId: data.competitionGroupId,
        leagueId: data.leagueId,
        awardRuleKind: data.awardRuleKind,
        awardProcedure: data.awardProcedure,
        awardRuleRole: data.awardRuleRole,
        awardRuleTieCutoff: data.awardRuleTieCutoff,
        awardRuleThreshold: data.awardRuleThreshold,
        awardRuleMeasure: data.awardRuleMeasure,
      },
      externalIdTable: trophyExternalIds,
      ownerIdColumn: trophyExternalIds.trophyId,
      externalSystemIdColumn: trophyExternalIds.externalSystemId,
      externalIdColumn: trophyExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: TrophyUpsertConflictError,
      entityLabelPlural: 'trophies',
      buildExternalIdRow: (trophyId, pair) => ({ trophyId, ...pair }),
      afterUpsert: (tx, row) => this.ruleCurationSync.sync(tx, row.id, data),
    });

    return { trophy, created };
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
