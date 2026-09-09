import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  interactionEventParameters,
  interactionEvents,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { DbOrTx } from './db-or-tx';
import type { RecordInteractionInput } from './record-interaction-input';
import { UsageEntityUpsertService } from './usage-entity-upsert.service';

/**
 * Records one triggered command, button click or select-menu selection.
 *
 * The whole write runs in a single transaction, so a partial failure can never
 * leave an event with missing parameters or a dangling reference to a row that
 * was not written.
 *
 * Callers treat this as best-effort: a failure here must never affect the
 * reply the user already received.
 */
@Injectable()
export class UsageTrackingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly entities: UsageEntityUpsertService,
  ) {}

  async recordInteraction(input: RecordInteractionInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const userId = await this.entities.upsertUser(tx, {
        discordId: input.discordUserId,
        username: input.username,
      });
      const guildId = await this.recordGuild(tx, { input, userId });
      const channelId = await this.entities.upsertChannel(tx, {
        discordId: input.discordChannelId,
        guildId,
        name: input.channelName ?? null,
      });
      const interactionTypeId = await this.entities.upsertInteractionType(tx, {
        kind: input.kind,
        name: input.name,
      });

      const [event] = await tx
        .insert(interactionEvents)
        .values({
          interactionTypeId,
          userId,
          guildId,
          channelId,
          occurredAt: input.occurredAt,
          outcome: input.outcome,
          errorMessage: input.errorMessage ?? null,
        })
        .returning({ id: interactionEvents.id });

      if (input.parameters.length > 0) {
        await tx.insert(interactionEventParameters).values(
          input.parameters.map((parameter) => ({
            eventId: event.id,
            key: parameter.key,
            value: parameter.value ?? null,
          })),
        );
      }
    });
  }

  /**
   * Upserts the guild and the triggering user's membership of it, returning
   * the guild's id — or `null` for a DM, which belongs to no guild and so has
   * no membership row either.
   *
   * `guilds.name` is NOT NULL, so a guild whose name Discord did not give us
   * falls back to its own snowflake rather than blocking the whole recording.
   */
  private async recordGuild(
    tx: DbOrTx,
    context: { input: RecordInteractionInput; userId: number },
  ): Promise<number | null> {
    const { input, userId } = context;
    if (input.discordGuildId === undefined) {
      return null;
    }
    const guildId = await this.entities.upsertGuild(tx, {
      discordId: input.discordGuildId,
      name: input.guildName ?? input.discordGuildId,
    });
    await this.entities.upsertGuildMember(tx, {
      userId,
      guildId,
      nickname: input.nickname ?? null,
    });
    return guildId;
  }
}
