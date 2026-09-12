import type {
  Db,
  InteractionKind,
  InteractionOutcome,
  SQL,
} from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  channels,
  DB,
  desc,
  discordUsers,
  eq,
  guilds,
  inArray,
  interactionEventParameters,
  interactionEvents,
  interactionTypes,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

/** What to narrow the listing to. `limit` is the caller's cap, not this service's. */
export interface ListRecentInteractionEventsOptions {
  discordUserId?: string;
  outcome?: InteractionOutcome;
  limit: number;
}

export interface InteractionEventParameterRow {
  key: string;
  value: string | null;
}

export interface InteractionEventRow {
  id: number;
  occurredAt: Date;
  kind: InteractionKind;
  name: string;
  outcome: InteractionOutcome;
  errorMessage: string | null;
  username: string;
  guildName: string | null;
  channelName: string | null;
  parameters: InteractionEventParameterRow[];
}

/** One event before its parameters are attached — what the events query selects. */
type InteractionEventHeaderRow = Omit<InteractionEventRow, 'parameters'>;

/**
 * Reads back what `UsageTrackingService` recorded: the most recent
 * interactions, newest first, optionally narrowed to one Discord user and/or
 * one outcome.
 *
 * Two queries rather than one join: fetching the parameters alongside the
 * events would multiply the event rows by their parameter count, which the
 * `limit` would then cut mid-event. The events page is resolved first and its
 * parameters fetched by event id afterwards - the mirror image of the write
 * side, which also treats the event and its parameters as two steps. Zero
 * matching events short-circuits before the second query.
 *
 * `discord_bot_usage.users` and `channels` are joined unconditionally, even
 * when no user filter is set: `interaction_events.user_id` and `channel_id`
 * are both NOT NULL with a foreign key to their respective tables, so an
 * inner join to either can neither drop nor duplicate a row, and only the
 * `where` clause has to vary with the options. `guilds` is left-joined
 * instead: `interaction_events.guild_id` is nullable (a DM belongs to no
 * guild), so an inner join there would silently drop DM rows.
 *
 * Ordered by `occurred_at` desc with `id` desc as a tiebreaker: two events
 * can share the same millisecond-precision `occurred_at`, and without a
 * secondary key "the 20 most recent" would not be a stable set across runs.
 */
@Injectable()
export class InteractionEventsQueryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listRecent(
    options: ListRecentInteractionEventsOptions,
  ): Promise<InteractionEventRow[]> {
    const events = await this.db
      .select({
        id: interactionEvents.id,
        occurredAt: interactionEvents.occurredAt,
        kind: interactionTypes.kind,
        name: interactionTypes.name,
        outcome: interactionEvents.outcome,
        errorMessage: interactionEvents.errorMessage,
        username: discordUsers.username,
        guildName: guilds.name,
        channelName: channels.name,
      })
      .from(interactionEvents)
      .innerJoin(
        interactionTypes,
        eq(interactionTypes.id, interactionEvents.interactionTypeId),
      )
      .innerJoin(discordUsers, eq(discordUsers.id, interactionEvents.userId))
      .innerJoin(channels, eq(channels.id, interactionEvents.channelId))
      .leftJoin(guilds, eq(guilds.id, interactionEvents.guildId))
      .where(this.filters(options))
      .orderBy(desc(interactionEvents.occurredAt), desc(interactionEvents.id))
      .limit(options.limit);

    return this.withParameters(events);
  }

  /**
   * One event by its `interaction_events.id`, shaped exactly like a
   * `listRecent` row — what the `/debuginteractions` retrigger button needs
   * to rebuild the original invocation. The select/join block is repeated
   * from `listRecent` on purpose: a private helper returning a
   * partially-built drizzle builder has no nameable return type, which
   * breaks declaration emit for this exported class.
   */
  async findById(eventId: number): Promise<InteractionEventRow | undefined> {
    const events = await this.db
      .select({
        id: interactionEvents.id,
        occurredAt: interactionEvents.occurredAt,
        kind: interactionTypes.kind,
        name: interactionTypes.name,
        outcome: interactionEvents.outcome,
        errorMessage: interactionEvents.errorMessage,
        username: discordUsers.username,
        guildName: guilds.name,
        channelName: channels.name,
      })
      .from(interactionEvents)
      .innerJoin(
        interactionTypes,
        eq(interactionTypes.id, interactionEvents.interactionTypeId),
      )
      .innerJoin(discordUsers, eq(discordUsers.id, interactionEvents.userId))
      .innerJoin(channels, eq(channels.id, interactionEvents.channelId))
      .leftJoin(guilds, eq(guilds.id, interactionEvents.guildId))
      .where(eq(interactionEvents.id, eventId))
      .limit(1);

    const rows = await this.withParameters(events);
    return rows[0];
  }

  /**
   * Attaches each event's recorded parameters, in insertion order. Shared by
   * both read paths; zero events short-circuits before the second query.
   */
  private async withParameters(
    events: InteractionEventHeaderRow[],
  ): Promise<InteractionEventRow[]> {
    if (events.length === 0) {
      return [];
    }
    const parameters = await this.db
      .select({
        eventId: interactionEventParameters.eventId,
        key: interactionEventParameters.key,
        value: interactionEventParameters.value,
      })
      .from(interactionEventParameters)
      .where(
        inArray(
          interactionEventParameters.eventId,
          events.map((event) => event.id),
        ),
      )
      .orderBy(asc(interactionEventParameters.id));

    return events.map((event) => ({
      ...event,
      parameters: parameters
        .filter((parameter) => parameter.eventId === event.id)
        .map((parameter) => ({ key: parameter.key, value: parameter.value })),
    }));
  }

  /**
   * `and()` of no conditions is `undefined`, which drizzle reads as an
   * unfiltered query - so the unfiltered case needs no special casing.
   */
  private filters(
    options: ListRecentInteractionEventsOptions,
  ): SQL | undefined {
    const conditions = [
      options.discordUserId === undefined
        ? undefined
        : eq(discordUsers.discordId, options.discordUserId),
      options.outcome === undefined
        ? undefined
        : eq(interactionEvents.outcome, options.outcome),
    ].filter((condition) => condition !== undefined);
    return and(...conditions);
  }
}
