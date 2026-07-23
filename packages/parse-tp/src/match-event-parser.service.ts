import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { Decoder } from './match-event-decoders';
import { MatchEventDecodersService } from './match-event-decoders.service';
import type { SecretObjective } from './secret-objective.service';
import type { WeatherType } from './weather-type.service';

export type { SecretObjective } from './secret-objective.service';
export type { WeatherType } from './weather-type.service';

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
      rosterId: number;
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
      newFanFactorLocal: number;
      newFanFactorVisitor: number;
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

const topLevelSchema = z.object({ matchEventType: z.number() });

@Injectable()
export class MatchEventParserService {
  private readonly decoders: Map<number, Decoder>;

  constructor(private readonly matchEventDecoders: MatchEventDecodersService) {
    this.decoders = this.matchEventDecoders.build();
  }

  /**
   * Decode a raw TP `matchEvents[]` array into the modeled subset. Structural
   * markers and per-roll noise (codes such as 0, 1, 18, 19, 27 — including
   * code 27, a "player assigned to line-up" structural row, not a modeled
   * roll) and any unrecognized code are silently dropped so
   * new TP codes never crash the import. `None` injuries are still returned;
   * the import step decides whether to skip them, keeping this parser a pure
   * decode. Throws a descriptive `Error` only when a *known* code's payload
   * fails its schema.
   */
  parse(rawEvents: unknown): TpMatchEvent[] {
    const array = z.array(z.unknown()).safeParse(rawEvents);
    if (!array.success) {
      throw new Error('Invalid TP match events: expected an array.');
    }
    const events: TpMatchEvent[] = [];
    for (const raw of array.data) {
      const head = topLevelSchema.safeParse(raw);
      if (!head.success) {
        continue; // no numeric matchEventType — not a decodable event
      }
      const decoder = this.decoders.get(head.data.matchEventType);
      if (decoder) {
        events.push(decoder(raw));
      }
    }
    return events;
  }
}
