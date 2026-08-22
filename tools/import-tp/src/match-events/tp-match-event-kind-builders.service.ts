import type {
  ActionType,
  ConsequenceType,
  UpsertMatchEvent,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpInjuryType, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import {
  type TpAdminMatchEvent,
  TpAdminMatchEventBuilderService,
} from './tp-admin-match-event-builder.service';
import type { ResolveTeamEraOptions } from './tp-match-event-helpers.service';
import { TpMatchEventHelpersService } from './tp-match-event-helpers.service';
import type { BuildEventDataOptions } from './tp-match-events-builder.types';

interface ResolvePlayerOptions {
  lineUpId: number;
  matchId: number;
  playerIdsByLineUpId: Map<number, number>;
  errors: ImportError[];
}

/**
 * The nine TP event kinds that are structurally identical action events:
 * one acting player, one acting team, no other payload. Touchdown and
 * mvp_award were already modeled this way; completion, interception,
 * deflection, foul, successful_landing, throw_team_mate, and catch share the
 * exact same shape.
 */
type TpSimpleActionEvent = Extract<
  TpMatchEvent,
  | { type: 'touchdown' }
  | { type: 'completion' }
  | { type: 'interception' }
  | { type: 'deflection' }
  | { type: 'foul' }
  | { type: 'mvp_award' }
  | { type: 'successful_landing' }
  | { type: 'throw_team_mate' }
  | { type: 'catch' }
>;

/**
 * Map a TP `injuryType` to its `consequence_type`. Every value, including
 * `'None'` (a Badly Hurt result), maps to a real consequence.
 */
const INJURY_CONSEQUENCE_BY_TYPE: Record<TpInjuryType, ConsequenceType> = {
  None: 'badly_hurt',
  MissNextGame: 'miss_next_game',
  NigglingInjury: 'niggling_injury',
  Dead: 'death',
  AV: 'stat_reduction_av',
  ST: 'stat_reduction_st',
  MA: 'stat_reduction_ma',
  PA: 'stat_reduction_pa',
  AG: 'stat_reduction_ag',
};

/**
 * Map a TP `injuryType` to the acting-side severity bucket credited to
 * whoever caused it, adopting the same three-bucket convention
 * `tools/import-bbl`'s `SEVERITY_GROUPS` already establishes for this repo:
 * `badly_hurt` stays its own bucket, every lasting-injury/stat-reduction
 * result buckets into `serious_injury`, and `Dead` buckets into `death`.
 */
const INJURY_ACTION_SEVERITY_BY_TYPE: Record<TpInjuryType, ActionType> = {
  None: 'badly_hurt',
  MissNextGame: 'serious_injury',
  NigglingInjury: 'serious_injury',
  Dead: 'death',
  AV: 'serious_injury',
  ST: 'serious_injury',
  MA: 'serious_injury',
  PA: 'serious_injury',
  AG: 'serious_injury',
};

/**
 * Builds the concrete `UpsertMatchEvent`(s) for every TP match event kind.
 * Split out of `TpMatchEventsBuilderService` (which owns `resolveTeamEraId`
 * and the public `buildEventData` dispatcher) purely to stay under this
 * repo's 500-line source file ceiling — conceptually these are all private
 * implementation details of the builder, just hosted in a collaborating
 * service that `TpMatchEventsBuilderService` injects.
 */
@Injectable()
export class TpMatchEventKindBuildersService {
  constructor(
    private readonly importResults: ImportResultService,
    private readonly adminEventBuilder: TpAdminMatchEventBuilderService,
    private readonly helpers: TpMatchEventHelpersService,
  ) {}

  /** Resolve a roster id + era id to its team_eras id, or undefined. */
  resolveTeamEraId(options: ResolveTeamEraOptions): number | undefined {
    return this.helpers.resolveTeamEraId(options);
  }

  /**
   * Resolve a `lineUpId` to its imported player DB id. A `lineUpId` with no
   * imported id yields `undefined` and records a non-fatal error so the event
   * is still emitted with a null player, mirroring BBL's `resolvePlayerId`.
   */
  private resolvePlayer(options: ResolvePlayerOptions): number | undefined {
    const { lineUpId, matchId, playerIdsByLineUpId, errors } = options;
    const id = playerIdsByLineUpId.get(lineUpId);
    if (id === undefined) {
      errors.push(
        this.importResults.error({
          item: { match: matchId, lineUpId },
          message: `Player lineUpId "${lineUpId}" in match "${matchId}" has no imported id; emitting the event with a null player.`,
        }),
      );
      return undefined;
    }
    return id;
  }

  /**
   * Build a simple, single-actor action event (touchdown, completion,
   * interception, deflection, foul, mvp_award, successful_landing,
   * throw_team_mate, catch) — the one shape shared by all nine.
   */
  buildSimpleActionEvent(
    options: BuildEventDataOptions & { event: TpSimpleActionEvent },
    actionType: ActionType,
  ): UpsertMatchEvent[] {
    const {
      event,
      matchId,
      eraId,
      tpSystemId,
      teamErasByRosterId,
      playerIdsByLineUpId,
      errors,
    } = options;
    const data: UpsertMatchEvent = {
      matchId,
      actionType,
      externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
    };
    this.helpers.setIfDefined(
      data,
      'actingTeamEraId',
      this.resolveTeamEraId({
        teamErasByRosterId,
        rosterId: event.rosterId,
        eraId,
      }),
    );
    this.helpers.setIfDefined(
      data,
      'actingPlayerId',
      this.resolvePlayer({
        lineUpId: event.lineUpId,
        matchId,
        playerIdsByLineUpId,
        errors,
      }),
    );
    // TP's own reported figure, passed through verbatim: it already accounts
    // for race-specific and random-event awards the standardised table does
    // not model. `setIfDefined` keeps a reported 0 (a real award of nothing)
    // and drops an absent value, which leaves the column alone.
    this.helpers.setIfDefined(data, 'sppValue', event.starPoints);
    return [data];
  }

  /**
   * Build a `sent_off` event — consequence-side (the player who got sent off),
   * not action-side. Deliberately standalone: TP's `sent_off` (code 32) does
   * not always follow a `foul` (code 31) by the same player (only 58% do
   * within 30s in real data; the rest are e.g. Secret Weapon auto-ejections),
   * so — per the confirmed design — the two are never correlated.
   */
  buildSentOffEvent(
    options: BuildEventDataOptions & {
      event: Extract<TpMatchEvent, { type: 'sent_off' }>;
    },
  ): UpsertMatchEvent[] {
    const {
      event,
      matchId,
      eraId,
      tpSystemId,
      teamErasByRosterId,
      playerIdsByLineUpId,
      errors,
    } = options;
    const data: UpsertMatchEvent = {
      matchId,
      consequenceType: 'sent_off',
      externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
    };
    this.helpers.setIfDefined(
      data,
      'consequenceTeamEraId',
      this.resolveTeamEraId({
        teamErasByRosterId,
        rosterId: event.rosterId,
        eraId,
      }),
    );
    this.helpers.setIfDefined(
      data,
      'consequencePlayerId',
      this.resolvePlayer({
        lineUpId: event.lineUpId,
        matchId,
        playerIdsByLineUpId,
        errors,
      }),
    );
    // A sent_off event has no acting player -- only a consequencePlayerId --
    // so it cannot own an SPP award attributed to an actor. sppValue is
    // intentionally not written here.
    return [data];
  }

  /**
   * Build a standalone `casualty_caused` event, for a code-6 that was NOT
   * paired with a code-8 injury (e.g. the casualty was erased by an
   * apothecary, so no injury roll was ever registered). Still credits the
   * specific acting player, using the generic `'casualty'` action type since
   * severity is unknown with no paired injury to report it.
   */
  buildCasualtyCausedEvent(
    options: BuildEventDataOptions & {
      event: Extract<TpMatchEvent, { type: 'casualty_caused' }>;
    },
  ): UpsertMatchEvent[] {
    const {
      event,
      matchId,
      eraId,
      tpSystemId,
      teamErasByRosterId,
      playerIdsByLineUpId,
      errors,
    } = options;
    const data: UpsertMatchEvent = {
      matchId,
      actionType: 'casualty',
      externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
    };
    this.helpers.setIfDefined(
      data,
      'actingTeamEraId',
      this.resolveTeamEraId({
        teamErasByRosterId,
        rosterId: event.rosterId,
        eraId,
      }),
    );
    this.helpers.setIfDefined(
      data,
      'actingPlayerId',
      this.resolvePlayer({
        lineUpId: event.lineUpId,
        matchId,
        playerIdsByLineUpId,
        errors,
      }),
    );
    // TP's own reported figure, passed through verbatim: it already accounts
    // for race-specific and random-event awards the standardised table does
    // not model. `setIfDefined` keeps a reported 0 (a real award of nothing)
    // and drops an absent value, which leaves the column alone.
    this.helpers.setIfDefined(data, 'sppValue', event.starPoints);
    return [data];
  }

  /**
   * Build an `injury` (code 8) event. The consequence side (the victim +
   * severity) is always emitted, including `injuryType: 'None'` (a real Badly
   * Hurt result, not "nothing happened"). The action side is credited three
   * ways, in priority order:
   *
   * 1. Paired via `casualtyPairing` (a specific code-6 event correlated by
   *    turnNumber) — full credit: the specific acting player and their team,
   *    with the severity bucketed via {@link INJURY_ACTION_SEVERITY_BY_TYPE}.
   * 2. Paired via `foulPairing` (a specific code-31 foul correlated by
   *    turnNumber) — full credit to the fouler and their team, but with
   *    `actionType: 'foul'` rather than a severity bucket: Blood Bowl awards
   *    no casualty credit for a foul, and this one row is what makes a
   *    foul-caused casualty mean the same thing here as it does in the BBL
   *    importer.
   * 3. Not paired, but `turnRosterId` differs from the victim's roster —
   *    opponent-caused per TP's turn-owner field, but the specific player
   *    couldn't be pinned down (e.g. a cross-turn logging quirk); falls back
   *    to team-only credit with the same severity bucketing.
   * 4. Neither — self-inflicted or otherwise unattributable (a player falling
   *    on their own, or a random event); consequence-only, exactly as before.
   *
   * A paired casualty or foul is a genuinely separate TP event with its own
   * `tpEventId` — unlike case 3's team-only inference, which names no
   * specific event — so a merged row carries an external id from each side
   * (action first, then consequence), the same convention `tools/import-bbl`
   * uses for its own merged events, so a re-import can reconcile the row from
   * either side even if a pairing decision changes.
   */
  buildInjuryEvent(
    options: BuildEventDataOptions & {
      event: Extract<TpMatchEvent, { type: 'injury' }>;
    },
  ): UpsertMatchEvent[] {
    const {
      event,
      matchId,
      eraId,
      tpSystemId,
      teamErasByRosterId,
      playerIdsByLineUpId,
      errors,
      casualtyPairing,
      foulPairing,
    } = options;

    // A paired casualty (code 6) and a paired foul (code 31) credit the acting
    // side identically — same team, same player, same code path — and differ
    // only in the action type emitted. `correlateFouls` only ever considers
    // injuries `correlateCasualties` left unattributed, so both can never be
    // set at once; the casualty is preferred if that ever changes.
    const pairedCasualty = casualtyPairing.casualtyByInjuryEventId.get(
      event.tpEventId,
    );
    const pairedFoul = foulPairing.foulByInjuryEventId.get(event.tpEventId);
    const pairedActor = pairedCasualty ?? pairedFoul;

    const externalIds = pairedActor
      ? [
          this.helpers.externalIdEntry(tpSystemId, pairedActor.tpEventId),
          this.helpers.externalIdEntry(tpSystemId, event.tpEventId),
        ]
      : this.helpers.externalId(tpSystemId, event.tpEventId);

    const data: UpsertMatchEvent = {
      matchId,
      consequenceType: INJURY_CONSEQUENCE_BY_TYPE[event.injuryType],
      externalIds,
    };
    this.helpers.setIfDefined(
      data,
      'consequenceTeamEraId',
      this.resolveTeamEraId({
        teamErasByRosterId,
        rosterId: event.rosterId,
        eraId,
      }),
    );
    this.helpers.setIfDefined(
      data,
      'consequencePlayerId',
      this.resolvePlayer({
        lineUpId: event.lineUpId,
        matchId,
        playerIdsByLineUpId,
        errors,
      }),
    );

    if (pairedActor) {
      data.actionType = pairedCasualty
        ? INJURY_ACTION_SEVERITY_BY_TYPE[event.injuryType]
        : 'foul';
      this.helpers.setIfDefined(
        data,
        'actingTeamEraId',
        this.resolveTeamEraId({
          teamErasByRosterId,
          rosterId: pairedActor.rosterId,
          eraId,
        }),
      );
      this.helpers.setIfDefined(
        data,
        'actingPlayerId',
        this.resolvePlayer({
          lineUpId: pairedActor.lineUpId,
          matchId,
          playerIdsByLineUpId,
          errors,
        }),
      );
    } else if (
      event.turnRosterId !== undefined &&
      event.turnRosterId !== event.rosterId
    ) {
      data.actionType = INJURY_ACTION_SEVERITY_BY_TYPE[event.injuryType];
      this.helpers.setIfDefined(
        data,
        'actingTeamEraId',
        this.resolveTeamEraId({
          teamErasByRosterId,
          rosterId: event.turnRosterId,
          eraId,
        }),
      );
    }
    // else: self-inflicted or unattributable — consequence-only. Normal and
    // expected (e.g. a player falling on their own, or a random event).

    // A paired casualty_caused / foul is folded into this row instead of
    // being emitted separately, so its SPP has to travel with it — the
    // merged row's acting player IS the causer. Only the injury's own figure
    // is used when nothing was folded in.
    this.helpers.setIfDefined(
      data,
      'sppValue',
      pairedActor?.starPoints ?? event.starPoints,
    );
    return [data];
  }

  /**
   * Build the administrative TP match events (weather, inducements, winnings,
   * fan factor, journeyman signing, expensive mistake, dedicated fans, secret
   * objective, prayers to Nuffle, concession) for one event. Delegates to
   * {@link TpAdminMatchEventBuilderService}, split out purely to stay under
   * this repo's 500-line source file ceiling.
   */
  buildAdminEvents(
    options: BuildEventDataOptions & { event: TpAdminMatchEvent },
  ): UpsertMatchEvent[] {
    return this.adminEventBuilder.buildAdminEvents(options);
  }
}
