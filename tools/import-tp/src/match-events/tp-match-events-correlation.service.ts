import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/**
 * Pairs a code-6 (`casualty_caused`) event — the ACTION of a specific player
 * breaking armor — with its code-8 (`injury`) event — the roll reporting the
 * VICTIM and severity.
 *
 * This correlation step is a deliberate, confirmed exception to this
 * project's original TP-import design assumption that "TP embeds the
 * acting/victim player and team directly on each event, so no correlation
 * step is needed" (see `TpMatchEventsImportService`'s doc comment). That
 * assumption holds for every other TP event kind, but not for casualties:
 * TP logs the causing action and the resulting injury roll as two
 * independent events with no shared id, so the specific attacker can only be
 * recovered by pairing them up after the fact — the same kind of
 * action/consequence correlation `tools/import-bbl`'s
 * `match-event-correlation.ts` already does for BBL, just keyed differently.
 *
 * Time-based pairing was explicitly rejected: TP's event registration is
 * asynchronous, so a code-8 can be logged before its corresponding code-6 in
 * the raw `matchEvents[]` array, or carry an earlier `instant` timestamp — a
 * player might also simply get hurt for unrelated reasons shortly after a
 * casualty-causing action elsewhere in the same match. Real local data
 * confirms `turnNumber` equality is a far more reliable, order-independent
 * pairing key: of code-6 events with at least one valid-direction candidate
 * injury, 86.4% (1329/1538) share the exact same `turnNumber` as that
 * candidate. `turnNumber` equality is therefore used as the hard pairing
 * requirement; a code-6 with no same-`turnNumber` candidate stays unpaired
 * rather than being force-matched to a plausible-but-uncertain candidate on
 * a different turn.
 *
 * A casualty erased by an apothecary (or similar effect) never gets a code-8
 * counterpart at all — the code-6 action still fired, but there is genuinely
 * no injury consequence to pair it with. An unpaired code-8 is likewise
 * normal and expected (e.g. a player falling down on their own, or a random
 * event) — neither case is treated as an error.
 */
export interface CasualtyPairing {
  /** Injury event tpEventId -> the casualty event that caused it, when paired. */
  casualtyByInjuryEventId: Map<
    number,
    Extract<TpMatchEvent, { type: 'casualty_caused' }>
  >;
  /**
   * tpEventIds of casualty_caused events that WERE successfully paired (so
   * the per-event dispatcher knows not to also emit them as a standalone
   * row).
   */
  pairedCasualtyEventIds: Set<number>;
}

type CasualtyEvent = Extract<TpMatchEvent, { type: 'casualty_caused' }>;
type InjuryEvent = Extract<TpMatchEvent, { type: 'injury' }>;

/**
 * A candidate injury is only eligible for pairing when its `instant` is
 * within 120 seconds of the casualty's. Real local data (of 1301 pairs
 * produced by this algorithm with no cutoff) shows the delay distribution
 * has no sharp cliff — a smooth long tail out to 1043s — but 120s captures
 * 97.2% of pairs while excluding that tail. The delay does NOT distinguish
 * genuinely ambiguous (multi-candidate) pairings from unambiguous
 * (single-candidate) ones — both groups have nearly identical delay
 * distributions — so this cutoff is purely about bounding implausibly long
 * gaps, not about flagging suspicious multi-candidate pairings.
 */
const MAX_PAIRING_DELAY_MS = 120_000;

@Injectable()
export class TpMatchEventsCorrelationService {
  /**
   * A code-8 is a valid pairing candidate for a code-6 when the injury
   * happened on the casualty-causer's own turn (`injury.turnRosterId`
   * matches the casualty's acting `rosterId`), the victim is on the opposing
   * side (`injury.rosterId` differs from the casualty's `rosterId`), and
   * both carry the same `turnNumber`. This check is fully symmetric in time
   * — neither event's `instant` is consulted — since TP's async
   * registration means either can be logged first.
   */
  private isCandidate(casualty: CasualtyEvent, injury: InjuryEvent): boolean {
    return (
      injury.turnRosterId === casualty.rosterId &&
      injury.rosterId !== casualty.rosterId &&
      casualty.turnNumber !== undefined &&
      injury.turnNumber === casualty.turnNumber
    );
  }

  /**
   * Pair every match's `casualty_caused` events with their `injury` event, in
   * `matchEvents` array order (each code-8 consumed by at most one code-6).
   * A candidate must be within `MAX_PAIRING_DELAY_MS` (120s) of the casualty's
   * `instant` to be eligible at all; among still-eligible, same-turn,
   * correct-direction, still-unclaimed candidates, the nearest by absolute
   * `instant` difference is chosen as a secondary tiebreaker — never as an
   * ordering/direction filter.
   */
  correlateCasualties(matchEvents: TpMatchEvent[]): CasualtyPairing {
    const casualties = matchEvents.filter(
      (e): e is CasualtyEvent => e.type === 'casualty_caused',
    );
    const injuries = matchEvents.filter(
      (e): e is InjuryEvent => e.type === 'injury',
    );

    const casualtyByInjuryEventId = new Map<number, CasualtyEvent>();
    const pairedCasualtyEventIds = new Set<number>();
    const claimedInjuryEventIds = new Set<number>();

    for (const casualty of casualties) {
      let best: InjuryEvent | undefined;
      let bestDiffMs = Infinity;
      for (const injury of injuries) {
        if (claimedInjuryEventIds.has(injury.tpEventId)) {
          continue;
        }
        if (!this.isCandidate(casualty, injury)) {
          continue;
        }
        const diffMs = Math.abs(
          new Date(injury.instant).getTime() -
            new Date(casualty.instant).getTime(),
        );
        // A candidate must be within the cutoff to be eligible at all.
        // Phrased as an inclusion check (`<=`), not its negation, so an
        // unparseable `instant` (diffs to NaN) is naturally excluded too:
        // `NaN <= anything` is always false, so the `!(...)` branch below is
        // taken — whereas the negated form `diffMs > MAX` would be false for
        // NaN and would wrongly let it through.
        if (!(diffMs <= MAX_PAIRING_DELAY_MS)) {
          continue;
        }
        if (best === undefined || diffMs < bestDiffMs) {
          best = injury;
          bestDiffMs = diffMs;
        }
      }
      if (best) {
        casualtyByInjuryEventId.set(best.tpEventId, casualty);
        pairedCasualtyEventIds.add(casualty.tpEventId);
        claimedInjuryEventIds.add(best.tpEventId);
      }
    }

    return { casualtyByInjuryEventId, pairedCasualtyEventIds };
  }
}
