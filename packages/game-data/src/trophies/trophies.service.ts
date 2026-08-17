import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import type { Db, Trophy } from '@blood-bowl-tracker/db';
import {
  competitionGroups,
  DB,
  trophies,
  trophyExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike } from 'drizzle-orm';

import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { MissingRequiredFieldError } from '../shared/missing-required-field-error';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class TrophyUpsertConflictError extends UpsertConflictError {}

/** A single trophy's display header, with its competition group resolved. */
export type TrophyHeader = {
  id: number;
  name: string;
  description: string | null;
  competitionGroupId: number;
  competitionGroupName: string;
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
  ): Promise<{ id: number; name: string; competitionGroupName: string }[]> {
    return this.db
      .select({
        id: trophies.id,
        name: trophies.name,
        competitionGroupName: competitionGroups.name,
      })
      .from(trophies)
      .innerJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .where(ilike(trophies.name, `${this.likePattern.escape(prefix)}%`))
      .orderBy(trophies.name)
      .limit(limit);
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
      })
      .from(trophies)
      .innerJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .where(eq(trophies.id, trophyId));
    return rows[0];
  }

  /**
   * Every trophy a competition group awards, ordered by name. The competition
   * group deepdive (#455) lists these and offers a drill-down button each; it
   * needs no more than the id and label.
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
   * The whole curated trophy catalog, for the `trophies.list` insight (#422),
   * each row carrying the competition group that awards it. Optionally scoped
   * to a league: trophies have no league of their own, so the filter goes
   * through the competition group's `leagueId` (which is NOT NULL, so the
   * inner join loses nothing). Ordering is left to the caller, which sorts by
   * group then name for display.
   */
  listAllWithLeague(scope: FactScope): Promise<
    {
      id: number;
      name: string;
      competitionGroupId: number;
      competitionGroupName: string;
    }[]
  > {
    return this.db
      .select({
        id: trophies.id,
        name: trophies.name,
        competitionGroupId: trophies.competitionGroupId,
        competitionGroupName: competitionGroups.name,
      })
      .from(trophies)
      .innerJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .where(
        scope.leagueId === undefined
          ? undefined
          : eq(competitionGroups.leagueId, scope.leagueId),
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
   * (issue #446) currently gives every trophy — including the TP-only
   * "Ogretoberfest" — an explicit external id, so no curated trophy exercises
   * this path today, but it stays supported for a future trophy that needs
   * it (e.g. one with no source system to key on yet). `upsertByExternalIds`
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
   * importer (not yet written; issue #446 turned out to be a pure
   * curated-data change, not this importer) that creates a same-named row via
   * the external-id path (e.g. it resolves its own external id to a *new*
   * trophy row instead of attaching that id to the existing row already found
   * by name) before the manual importer's next run. That would leave two rows
   * sharing one `name`, and this fallback — which matches by name alone —
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
      })
      .returning();
    return { trophy: inserted[0], created: true };
  }
}
