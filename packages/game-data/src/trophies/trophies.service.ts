import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import type { Db, Trophy } from '@blood-bowl-tracker/db';
import {
  competitionGroups,
  DB,
  leagues,
  trophies,
  trophyExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike, or } from 'drizzle-orm';

import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { MissingRequiredFieldError } from '../shared/missing-required-field-error';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

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
};

@Injectable()
export class TrophiesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
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

  async upsert(
    data: UpsertTrophy,
  ): Promise<{ trophy: Trophy; created: boolean }> {
    if (data.externalIds.length === 0) {
      return this.upsertByName(data);
    }

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
      },
      externalIdTable: trophyExternalIds,
      ownerIdColumn: trophyExternalIds.trophyId,
      externalSystemIdColumn: trophyExternalIds.externalSystemId,
      externalIdColumn: trophyExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: TrophyUpsertConflictError,
      entityLabelPlural: 'trophies',
      buildExternalIdRow: (trophyId, pair) => ({ trophyId, ...pair }),
    });

    return { trophy, created };
  }

  /**
   * The empty-`externalIds` path, which no other entity has.
   *
   * A trophy is allowed to carry no external id at all. The curated catalog
   * currently gives every trophy — including the TP-only "Ogretoberfest" — an
   * explicit external id, so no curated trophy exercises this path today, but
   * it stays supported for a future trophy that needs it (e.g. one with no
   * source system to key on yet). `upsertByExternalIds`
   * resolves an existing row purely from external ids, so such a payload
   * would insert a fresh duplicate on every import run. Matching on exact
   * `name` instead keeps it idempotent.
   *
   * This is NOT a shared "Name" external id, and creates no auto-merge
   * surface: the BBL and TP importers always supply real external ids and
   * therefore never reach this branch, so two genuinely different trophies
   * that happen to share a label (e.g. Major "1st" vs. Minor "1st") can still
   * never be conflated by an importer. The precedent for matching by name
   * alone is `ExternalSystemsService.upsert`.
   *
   * One scenario this branch must still guard against: a future TP awards
   * importer (not yet written; giving trophies external ids turned out to be a
   * pure curated-data change, not an importer change) that creates a same-named
   * row via the external-id path (e.g. it resolves its own external id to a
   * *new* trophy row instead of attaching that id to the existing row already
   * found by name) before the manual importer's next run. That would leave two
   * rows sharing one `name`, and this fallback — which matches by name alone —
   * would otherwise pick one of them arbitrarily. To prevent silently doing
   * that, the name lookup below throws `TrophyUpsertConflictError` if it ever
   * finds more than one row. Closing this gap here means that future TP
   * awards importer MUST attach its external id to the existing row (found by
   * name) rather than blindly calling upsert with only external ids and
   * letting a fresh row get created — otherwise the conflict this guard
   * raises will legitimately fire on the next manual-import run. This only
   * matters if a trophy with no external ids is added to the catalog again;
   * none currently exists.
   */
  private async upsertByName(
    data: UpsertTrophy,
  ): Promise<{ trophy: Trophy; created: boolean }> {
    if (data.name === undefined) {
      throw new MissingRequiredFieldError(
        'Cannot upsert a trophy with no external ids and no name: there is nothing to match or create it by.',
      );
    }

    const existing = await this.db
      .select()
      .from(trophies)
      .where(eq(trophies.name, data.name));

    if (existing.length > 1) {
      throw new TrophyUpsertConflictError(
        `Multiple trophies named "${data.name}"`,
      );
    }

    if (existing[0]) {
      const updated = await this.db
        .update(trophies)
        .set({
          name: data.name,
          recipientKind: data.recipientKind,
          description: data.description,
          competitionGroupId: data.competitionGroupId,
          leagueId: data.leagueId,
        })
        .where(eq(trophies.id, existing[0].id))
        .returning();
      return { trophy: updated[0], created: false };
    }

    if (data.recipientKind === undefined) {
      throw new MissingRequiredFieldError(
        'Cannot create new trophies: missing required field(s): recipientKind',
      );
    }

    const inserted = await this.db
      .insert(trophies)
      .values({
        name: data.name,
        recipientKind: data.recipientKind,
        description: data.description,
        competitionGroupId: data.competitionGroupId,
        leagueId: data.leagueId,
      })
      .returning();
    return { trophy: inserted[0], created: true };
  }
}
