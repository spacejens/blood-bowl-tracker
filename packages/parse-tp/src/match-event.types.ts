import type { SecretObjective } from './secret-objective.service';
import type { WeatherType } from './weather-type.service';

/**
 * The set of injury outcomes TP's `matchEvents[].injuryType` field can carry
 * for a code-8 (injury) event.
 */
export type TpInjuryType =
  | 'None'
  | 'MissNextGame'
  | 'NigglingInjury'
  | 'Dead'
  | 'AV'
  | 'ST'
  | 'MA'
  | 'PA'
  | 'AG';

/** A star player induced via a code-11 (inducements_roll) event. */
export interface TpInducedStarPlayer {
  name: string;
  lineUpMasterId: number;
  number: number;
}

interface TpMatchEventBase {
  /** `matchEvents[].id` — used for external-id synthesis by the import step. */
  tpEventId: number;
  /** `matchEvents[].instant`. */
  instant: string;
  /**
   * `matchEvents[].starPoints` — the Star Player Points TP itself says this
   * event awarded its acting player. Optional because TP reports it only on
   * event kinds that can award SPP (and not always even there); absent on
   * every administrative kind. Read rather than recomputed: TP's figure
   * already reflects race-specific and random-event rules the tracker's own
   * award table does not model, and the observed data contains legitimate
   * non-standard values (a 5-point touchdown, a 3-point casualty) and
   * legitimate zeroes. `0` and absent are therefore different answers.
   */
  starPoints?: number;
}

/**
 * The modeled subset of TP's raw `matchEvents[]` per-roll event log,
 * discriminated by `type` (a stable slug derived from the numeric
 * `matchEventType` code). See `MatchEventParserService.parse` for the full
 * decode table and which codes are dropped.
 */
export type TpMatchEvent =
  | (TpMatchEventBase & {
      type: 'touchdown';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      type: 'mvp_award';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      type: 'completion';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      type: 'interception';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      type: 'deflection';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      type: 'foul';
      lineUpId: number;
      /** The fouling player's own team roster id. */
      rosterId: number;
      /**
       * The game turn this foul happened on, when present (absent on some
       * older events). The hard, order-independent key used to pair this
       * foul with the `injury` it caused — see `correlateFouls` in
       * tools/import-tp, mirroring `casualty_caused.turnNumber`.
       */
      turnNumber?: number;
      /**
       * The acting team's roster id as TP records it on the event, when
       * present. For a foul this is the fouler's own team, so it normally
       * equals `rosterId`; carried for symmetry with `injury.turnRosterId`.
       */
      turnRosterId?: number;
    })
  | (TpMatchEventBase & {
      type: 'sent_off';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      type: 'successful_landing';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      /**
       * A Big Guy's action of throwing a team-mate down field (TP code 45).
       * `lineUpId` is the THROWER; the thrown player's own landing is a
       * separate `catch` event. TP reports 1 SPP for it in every observed
       * instance, but the figure is read from `starPoints`, never assumed.
       */
      type: 'throw_team_mate';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      /**
       * The thrown player's action of being caught (TP code 47) — the
       * counterpart to `throw_team_mate`, with `lineUpId` naming the thrown
       * player. Distinct from `successful_landing` (code 46), which TP
       * records separately.
       */
      type: 'catch';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      /**
       * The action of causing a casualty (code 6) — distinct from `injury`
       * (code 8), which reports the victim + severity. `rosterId` here is
       * the ACTING team (the causer's own roster), following every other
       * event type's convention that the identified `lineUpId` player
       * belongs to `rosterId`. See `tp-match-events-correlation.ts` in
       * tools/import-tp for how this is paired with its `injury` event via
       * `turnNumber`.
       */
      type: 'casualty_caused';
      lineUpId: number;
      rosterId: number;
      /**
       * The game turn this casualty-causing action happened on, when
       * present (absent on some older events). The hard, order-independent
       * pairing key used to correlate this event with its `injury` event —
       * see `tp-match-events-correlation.ts`.
       */
      turnNumber?: number;
    })
  | (TpMatchEventBase & {
      type: 'injury';
      lineUpId: number;
      /** Victim team's roster id. */
      rosterId: number;
      /** Acting team's roster id (whose turn it was), when present. */
      turnRosterId?: number;
      /**
       * The game turn this injury roll happened on, when present (absent on
       * some older events). See `casualty_caused.turnNumber`.
       */
      turnNumber?: number;
      injuryType: TpInjuryType;
    })
  | (TpMatchEventBase & { type: 'weather_roll'; weatherType: WeatherType })
  | (TpMatchEventBase & {
      type: 'inducements_roll';
      rosterId: number;
      totalCost: number;
      starPlayers: TpInducedStarPlayer[];
      /**
       * The portion of the inducements spend paid out of the team's
       * treasury (as opposed to free stadium/petty-cash allowance).
       * Present with a value of `0` in some events, a non-zero value in
       * others, and entirely absent in many older events.
       */
      fromTreasury?: number;
    })
  | (TpMatchEventBase & {
      type: 'winnings_roll';
      localWinnings: number;
      visitorWinnings: number;
    })
  | (TpMatchEventBase & {
      type: 'fan_factor_roll';
      /**
       * Fan factor for the match: Dedicated Fans + a fresh 1d3 roll, per the
       * BB2020 rules. TP's own precomputed `newFanFactor*` fields are always
       * 0 in real payloads, so this is computed from the roll and Dedicated
       * Fans TP does send.
       */
      fanFactorLocal: number;
      fanFactorVisitor: number;
    })
  | (TpMatchEventBase & {
      type: 'journeyman_signing';
      rosterId: number;
      journeymenCount: number;
    })
  | (TpMatchEventBase & {
      type: 'expensive_mistake';
      rosterId: number;
      expensiveMistake: number;
    })
  | (TpMatchEventBase & {
      type: 'dedicated_fans_roll';
      dedicatedFansModifierLocal: number;
      dedicatedFansModifierVisitor: number;
    })
  | (TpMatchEventBase & {
      type: 'secret_objective';
      rosterId: number;
      secretObjective: SecretObjective;
    })
  | (TpMatchEventBase & { type: 'prayers_to_nuffle'; prayersToNuffle: number })
  | (TpMatchEventBase & {
      type: 'concession';
      concedeLocal: boolean;
      concedeVisitor: boolean;
    });

/** Decodes one raw TP `matchEvents[]` entry into a modeled `TpMatchEvent`. */
export type Decoder = (raw: unknown) => TpMatchEvent;
