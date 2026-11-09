import type {
  ExternalId,
  ResolveResult,
  UpsertTrophy,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Trophy } from '@blood-bowl-tracker/db';
import { DB, eq, trophies, trophyExternalIds } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import { TrophyRuleCurationSyncService } from './trophy-rule-curation-sync.service';

export class TrophyUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class TrophiesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ruleCurationSync: TrophyRuleCurationSyncService,
  ) {}

  /**
   * Which trophy carries this exact curated name. Answers in the same
   * `{ found, id }` shape as every entity's external-id `resolve`, and for
   * the same reason: an unmatched name is an authoring typo in a curated
   * file, which the caller reports and skips, not a server fault.
   *
   * Exact and case-sensitive, unlike a case-insensitive prefix search — the
   * caller is quoting a name out of the curated catalog, not searching for one.
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

  /**
   * The trophy row's scalar rule columns and its junction-table event types
   * must commit or roll back together — a trophy left holding a new rule
   * kind beside a stale set of event-type rows from its old rule is an
   * inconsistent, half-migrated state. The rule-curation sync
   * (`TrophyRuleCurationSyncService`) therefore runs as `upsertByExternalIds`'
   * `afterUpsert` hook, inside the transaction that helper already opens,
   * rather than in a second one of its own. Handing the
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
      buildExternalIdRow: (trophyId, externalId) => ({
        trophyId,
        ...externalId,
      }),
      afterUpsert: (tx, row) => this.ruleCurationSync.sync(tx, row.id, data),
    });

    return { trophy, created };
  }
}
