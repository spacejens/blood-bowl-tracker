import type { InteractionKind } from '@blood-bowl-tracker/db';
import {
  channels,
  discordUsers,
  guildMembers,
  guilds,
  interactionTypes,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type { DbOrTx } from './db-or-tx';

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
 * `ON CONFLICT DO UPDATE` is safe on these tables, unlike on the
 * history-tracked `game_data` ones: no versioning trigger fires here, so
 * there is no candidate-row history write to strand.
 *
 * Each conflict clause also sets `updated_at` explicitly. The `set_updated_at`
 * trigger is installed only for history-tracked tables, so nothing else would
 * move that column.
 */
@Injectable()
export class UsageEntityUpsertService {
  async upsertGuild(tx: DbOrTx, guild: UpsertGuildInput): Promise<number> {
    const [row] = await tx
      .insert(guilds)
      .values({ discordId: guild.discordId, name: guild.name })
      .onConflictDoUpdate({
        target: guilds.discordId,
        set: { name: guild.name, updatedAt: new Date() },
      })
      .returning({ id: guilds.id });
    return row.id;
  }

  async upsertUser(tx: DbOrTx, user: UpsertUserInput): Promise<number> {
    const [row] = await tx
      .insert(discordUsers)
      .values({ discordId: user.discordId, username: user.username })
      .onConflictDoUpdate({
        target: discordUsers.discordId,
        set: { username: user.username, updatedAt: new Date() },
      })
      .returning({ id: discordUsers.id });
    return row.id;
  }

  async upsertGuildMember(
    tx: DbOrTx,
    member: UpsertGuildMemberInput,
  ): Promise<number> {
    const [row] = await tx
      .insert(guildMembers)
      .values({
        userId: member.userId,
        guildId: member.guildId,
        nickname: member.nickname,
      })
      .onConflictDoUpdate({
        target: [guildMembers.userId, guildMembers.guildId],
        set: { nickname: member.nickname, updatedAt: new Date() },
      })
      .returning({ id: guildMembers.id });
    return row.id;
  }

  async upsertChannel(
    tx: DbOrTx,
    channel: UpsertChannelInput,
  ): Promise<number> {
    const [row] = await tx
      .insert(channels)
      .values({
        discordId: channel.discordId,
        guildId: channel.guildId,
        name: channel.name,
      })
      .onConflictDoUpdate({
        target: channels.discordId,
        set: {
          guildId: channel.guildId,
          name: channel.name,
          updatedAt: new Date(),
        },
      })
      .returning({ id: channels.id });
    return row.id;
  }

  /**
   * A catalog row's `(kind, name)` identity never changes once created, so the
   * conflict clause rewrites `name` with the value it already holds. That
   * no-op update is deliberate: `ON CONFLICT DO NOTHING` returns no row, which
   * would leave the caller without the id it needs.
   */
  async upsertInteractionType(
    tx: DbOrTx,
    type: UpsertInteractionTypeInput,
  ): Promise<number> {
    const [row] = await tx
      .insert(interactionTypes)
      .values({ kind: type.kind, name: type.name })
      .onConflictDoUpdate({
        target: [interactionTypes.kind, interactionTypes.name],
        set: { name: type.name },
      })
      .returning({ id: interactionTypes.id });
    return row.id;
  }
}
