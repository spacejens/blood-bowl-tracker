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
  count,
  DB,
  desc,
  discordUsers,
  eq,
  gte,
  guilds,
  inArray,
  interactionEventParameters,
  interactionEvents,
  interactionTypes,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

/** Milliseconds in a day, for turning `sinceDays` into a cutoff timestamp. */
const MS_PER_DAY = 86_400_000;

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

/** One leaderboard entry: a user and how many interactions they triggered. */
export interface TopUserRow {
  discordUserId: string;
  username: string;
  interactionCount: number;
}

/**
 * What to narrow the leaderboard to. `kind` counts only that one interaction
 * kind, `sinceDays` only interactions in the last N days; omitting both
 * counts every recorded interaction. `limit` is the caller's cap, not this
 * service's.
 */
export interface TopUsersOptions {
  kind?: InteractionKind;
  sinceDays?: number;
  limit: number;
}

/**
 * What to narrow the command-invocation listing to. `sinceDays` covers only
 * invocations in the last N days; omitting it covers every recorded command
 * invocation.
 *
 * There is deliberately no `limit`, unlike `listRecent`/`topUsers`: the caller
 * aggregates over the full matching set rather than showing a capped page, so
 * there is no "top N" for a cap to bound.
 */
export interface CommandInvocationOptions {
  sinceDays?: number;
}

/**
 * One recorded slash-command invocation: who ran it, which command, and which
 * option keys they supplied. Only the parameter *keys* are returned - a caller
 * classifying an invocation as plain or filtered cares which options were
 * present, never what they were set to.
 */
export interface CommandInvocationRow {
  discordUserId: string;
  username: string;
  commandName: string;
  parameterKeys: string[];
}

/** One invocation before its parameter keys are attached. */
interface CommandInvocationHeaderRow extends Omit<
  CommandInvocationRow,
  'parameterKeys'
> {
  id: number;
}

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
   * The users with the most recorded interactions, most active first,
   * optionally narrowed to one interaction kind and/or a recent window.
   *
   * One query, unlike `listRecent`/`findById`: a leaderboard row is an
   * aggregate with no per-event detail to attach, so there is nothing for a
   * second pass to fetch.
   *
   * `interaction_types` is joined unconditionally even though only the `kind`
   * filter reads it — `interaction_events.interaction_type_id` is NOT NULL
   * with a foreign key, so the inner join can neither drop nor duplicate a
   * row, and only the `where` clause has to vary with the options.
   *
   * Ordered by the count descending with the user id ascending as a
   * tiebreaker: without a secondary key, "the top 20" would not be a stable
   * set across users tied on the same count.
   */
  topUsers(options: TopUsersOptions): Promise<TopUserRow[]> {
    return this.db
      .select({
        discordUserId: discordUsers.discordId,
        username: discordUsers.username,
        interactionCount: count(),
      })
      .from(interactionEvents)
      .innerJoin(
        interactionTypes,
        eq(interactionTypes.id, interactionEvents.interactionTypeId),
      )
      .innerJoin(discordUsers, eq(discordUsers.id, interactionEvents.userId))
      .where(this.topUserFilters(options))
      .groupBy(discordUsers.id, discordUsers.discordId, discordUsers.username)
      .orderBy(desc(count()), asc(discordUsers.id))
      .limit(options.limit);
  }

  /**
   * Every recorded slash-command invocation, each carrying the option keys it
   * supplied, optionally narrowed to a recent window.
   *
   * Two queries like `listRecent`, and for a related reason: joining the
   * parameters in would multiply each invocation row by its parameter count,
   * and a caller counting invocations per user needs exactly one row per
   * invocation.
   *
   * `interaction_types.kind = 'command'` is unconditional: a button click or
   * select-menu selection has no plain-vs-filtered invocation shape, so it is
   * not an invocation this method reports on.
   *
   * `channels` and `guilds` are not joined at all, unlike `listRecent` - no
   * caller needs where an invocation happened. Ordered by event id ascending
   * purely for a deterministic result; the caller aggregates, so the order
   * carries no meaning of its own.
   *
   * The select/join block is repeated rather than shared with `listRecent`
   * for the reason `findById` documents: a private helper returning a
   * partially-built drizzle builder has no nameable return type, which breaks
   * declaration emit for this exported class.
   */
  async commandInvocations(
    options: CommandInvocationOptions,
  ): Promise<CommandInvocationRow[]> {
    const events: CommandInvocationHeaderRow[] = await this.db
      .select({
        id: interactionEvents.id,
        discordUserId: discordUsers.discordId,
        username: discordUsers.username,
        commandName: interactionTypes.name,
      })
      .from(interactionEvents)
      .innerJoin(
        interactionTypes,
        eq(interactionTypes.id, interactionEvents.interactionTypeId),
      )
      .innerJoin(discordUsers, eq(discordUsers.id, interactionEvents.userId))
      .where(this.commandInvocationFilters(options))
      .orderBy(asc(interactionEvents.id));

    if (events.length === 0) {
      return [];
    }

    const parameters = await this.db
      .select({
        eventId: interactionEventParameters.eventId,
        key: interactionEventParameters.key,
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
      discordUserId: event.discordUserId,
      username: event.username,
      commandName: event.commandName,
      parameterKeys: parameters
        .filter((parameter) => parameter.eventId === event.id)
        .map((parameter) => parameter.key),
    }));
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

  /**
   * Same shape as `filters`: `and()` of no conditions is `undefined`, which
   * drizzle reads as an unfiltered query, so the unfiltered case needs no
   * special casing. `sinceDays` becomes an absolute cutoff `Date`, matching
   * how `occurred_at` is typed as a timestamp column.
   */
  private topUserFilters(options: TopUsersOptions): SQL | undefined {
    const conditions = [
      options.kind === undefined
        ? undefined
        : eq(interactionTypes.kind, options.kind),
      options.sinceDays === undefined
        ? undefined
        : gte(
            interactionEvents.occurredAt,
            new Date(Date.now() - options.sinceDays * MS_PER_DAY),
          ),
    ].filter((condition) => condition !== undefined);
    return and(...conditions);
  }

  /**
   * Same shape as `topUserFilters`, except the `kind` condition is always
   * present rather than optional - so the result is never `undefined` in
   * practice, and the return type only allows it to keep the signature
   * uniform with the sibling filter helpers.
   */
  private commandInvocationFilters(
    options: CommandInvocationOptions,
  ): SQL | undefined {
    const conditions = [
      eq(interactionTypes.kind, 'command'),
      options.sinceDays === undefined
        ? undefined
        : gte(
            interactionEvents.occurredAt,
            new Date(Date.now() - options.sinceDays * MS_PER_DAY),
          ),
    ].filter((condition) => condition !== undefined);
    return and(...conditions);
  }
}
