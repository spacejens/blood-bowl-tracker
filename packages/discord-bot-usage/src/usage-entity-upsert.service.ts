import type { InteractionKind } from '@blood-bowl-tracker/db';
import {
  and,
  channels,
  discordUsers,
  eq,
  guildMembers,
  guilds,
  interactionTypes,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type { DbOrTx } from './db-or-tx';
import { selectThenUpsert } from './select-then-upsert';

export interface UpsertGuildInput {
  discordId: string;
  name: string;
}

export interface UpsertUserInput {
  discordId: string;
  username: string;
}

export interface UpsertGuildMemberInput {
  userId: number;
  guildId: number;
  nickname: string | null;
}

export interface UpsertChannelInput {
  discordId: string;
  guildId: number | null;
  name: string | null;
}

export interface UpsertInteractionTypeInput {
  kind: InteractionKind;
  name: string;
}

/**
 * The insert-or-update half of usage tracking: one method per
 * `discord_bot_usage` enrichment table, each returning the row's serial id so
 * the caller can reference it from the event row.
 *
 * Every method takes the handle to run on rather than reaching for an injected
 * `Db`, because they all run inside `UsageTrackingService`'s single
 * transaction.
 *
 * Every table here is history-tracked, so every write goes through
 * `selectThenUpsert` rather than `ON CONFLICT DO UPDATE` — see that
 * function's doc comment for why the two are not interchangeable against a
 * history-tracked table. `updated_at` is never set explicitly: the
 * `set_updated_at` trigger (installed automatically for a history-tracked
 * table) bumps it only when a write actually changes something, which is
 * also what lets `versioning()` correctly skip writing a history row for a
 * genuine no-op update.
 */
@Injectable()
export class UsageEntityUpsertService {
  async upsertGuild(tx: DbOrTx, guild: UpsertGuildInput): Promise<number> {
    return selectThenUpsert({
      tx,
      table: guilds,
      idColumn: guilds.id,
      where: eq(guilds.discordId, guild.discordId),
      values: { discordId: guild.discordId, name: guild.name },
    });
  }

  async upsertUser(tx: DbOrTx, user: UpsertUserInput): Promise<number> {
    return selectThenUpsert({
      tx,
      table: discordUsers,
      idColumn: discordUsers.id,
      where: eq(discordUsers.discordId, user.discordId),
      values: { discordId: user.discordId, username: user.username },
    });
  }

  async upsertGuildMember(
    tx: DbOrTx,
    member: UpsertGuildMemberInput,
  ): Promise<number> {
    return selectThenUpsert({
      tx,
      table: guildMembers,
      idColumn: guildMembers.id,
      where: and(
        eq(guildMembers.userId, member.userId),
        eq(guildMembers.guildId, member.guildId),
      )!,
      values: {
        userId: member.userId,
        guildId: member.guildId,
        nickname: member.nickname,
      },
    });
  }

  async upsertChannel(
    tx: DbOrTx,
    channel: UpsertChannelInput,
  ): Promise<number> {
    return selectThenUpsert({
      tx,
      table: channels,
      idColumn: channels.id,
      where: eq(channels.discordId, channel.discordId),
      values: {
        discordId: channel.discordId,
        guildId: channel.guildId,
        name: channel.name,
      },
    });
  }

  /**
   * A catalog row's `(kind, name)` identity never changes once created, so
   * there is nothing to update on a repeat call — `selectThenUpsert` still
   * issues the (no-op) update, which the table's triggers correctly recognize
   * as unchanged and skip recording.
   */
  async upsertInteractionType(
    tx: DbOrTx,
    type: UpsertInteractionTypeInput,
  ): Promise<number> {
    return selectThenUpsert({
      tx,
      table: interactionTypes,
      idColumn: interactionTypes.id,
      where: and(
        eq(interactionTypes.kind, type.kind),
        eq(interactionTypes.name, type.name),
      )!,
      values: { kind: type.kind, name: type.name },
    });
  }
}
