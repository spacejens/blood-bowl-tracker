import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import type { Db, Trophy } from '@blood-bowl-tracker/db';
import { DB, trophies, trophyExternalIds } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { MissingRequiredFieldError } from '../shared/missing-required-field-error';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class TrophyUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class TrophiesService {
  constructor(@Inject(DB) private readonly db: Db) {}

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
   * A trophy is allowed to carry no external id at all (the TP-only
   * "Ogretoberfest" has no BBL equivalent, and TP's `awardType` codes cannot
   * be resolved into stable ids until a competition-classification concept
   * exists — issues #445, #446). `upsertByExternalIds` resolves an existing
   * row purely from external ids, so such a payload would insert a fresh
   * duplicate on every import run. Matching on exact `name` instead keeps it
   * idempotent.
   *
   * This is NOT a shared "Name" external id, and creates no auto-merge
   * surface: the BBL and TP importers always supply real external ids and
   * therefore never reach this branch, so two genuinely different trophies
   * that happen to share a label (e.g. Major "1st" vs. Minor "1st") can still
   * never be conflated by an importer. The precedent for matching by name
   * alone is `ExternalSystemsService.upsert`.
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

    if (existing[0]) {
      const updated = await this.db
        .update(trophies)
        .set({
          name: data.name,
          recipientKind: data.recipientKind,
          description: data.description,
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
      })
      .returning();
    return { trophy: inserted[0], created: true };
  }
}
