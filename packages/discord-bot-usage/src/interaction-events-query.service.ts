import type {
  Db,
  InteractionKind,
  InteractionOutcome,
  SQL,
} from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  desc,
  discordUsers,
  eq,
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
  occurredAt: Date;
  kind: InteractionKind;
  name: string;
  outcome: InteractionOutcome;
  errorMessage: string | null;
  parameters: InteractionEventParameterRow[];
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
 * `discord_bot_usage.users` is joined unconditionally, even when no user
 * filter is set: `interaction_events.user_id` is NOT NULL with a foreign key
 * to that table, so the inner join can neither drop nor duplicate a row, and
 * only the `where` clause has to vary with the options.
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
      })
      .from(interactionEvents)
      .innerJoin(
        interactionTypes,
        eq(interactionTypes.id, interactionEvents.interactionTypeId),
      )
      .innerJoin(discordUsers, eq(discordUsers.id, interactionEvents.userId))
      .where(this.filters(options))
      .orderBy(desc(interactionEvents.occurredAt))
      .limit(options.limit);

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
      occurredAt: event.occurredAt,
      kind: event.kind,
      name: event.name,
      outcome: event.outcome,
      errorMessage: event.errorMessage,
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
