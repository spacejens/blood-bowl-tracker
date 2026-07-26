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

/**
 * Pairs a code-31 (`foul`) event with the code-8 (`injury`) event it caused.
 *
 * TP never logs a `casualty_caused` (code 6) for a foul-caused injury — real
 * local data confirms it (of 1637 code-6 events, exactly 1 shares its acting
 * player and turn with any foul), which is correct: Blood Bowl awards no
 * casualty credit for a foul. But that also left the fouler unconnected to the
 * player they hurt, so a foul and its injury imported as two unrelated rows.
 *
 * The pairing rule is deliberately identical in shape to
 * {@link TpMatchEventsCorrelationService.correlateCasualties}: `turnNumber`
 * equality as the hard, order-independent key, correct direction, and
 * `instant` proximity (within {@link MAX_PAIRING_DELAY_MS}) only as a
 * tiebreak. Real local data shows the same reliability profile: of 659
 * unattributed injuries, 138 share a turn with a same-acting-team foul, 135 of
 * those (97.8%) have exactly one candidate foul, and 86.7% of those are within
 * 120s (median 17s).
 *
 * Only injuries left UNATTRIBUTED by `correlateCasualties` are eligible — an
 * injury already credited to a specific code-6 attacker is never re-credited
 * to a fouler. An unpaired foul is normal (most fouls hurt nobody) and stays a
 * standalone `'foul'` action row.
 */
export interface FoulPairing {
  /** Injury event tpEventId -> the foul event that caused it, when paired. */
  foulByInjuryEventId: Map<number, FoulEvent>;
  /**
   * tpEventIds of foul events that WERE successfully paired (so the per-event
   * dispatcher knows not to also emit them as a standalone action row).
   */
  pairedFoulEventIds: Set<number>;
}

type CasualtyEvent = Extract<TpMatchEvent, { type: 'casualty_caused' }>;
type InjuryEvent = Extract<TpMatchEvent, { type: 'injury' }>;
type FoulEvent = Extract<TpMatchEvent, { type: 'foul' }>;

/** The minimum an event must carry to take part in instant-proximity pairing. */
interface TimedEvent {
  tpEventId: number;
  instant: string;
}

interface PairByNearestInstantOptions<
  A extends TimedEvent,
  C extends TimedEvent,
> {
  /** The events being paired FROM, processed in `matchEvents` array order. */
  actors: A[];
  /** The events being paired TO; each is claimed by at most one actor. */
  candidates: C[];
  /** Hard, time-independent eligibility (turn number + direction). */
  isCandidate: (actor: A, candidate: C) => boolean;
}

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
   * The shared pairing loop behind {@link correlateCasualties} and
   * {@link correlateFouls}: for each actor in array order, choose the
   * still-unclaimed, still-eligible candidate nearest in `instant`, subject to
   * the {@link MAX_PAIRING_DELAY_MS} cutoff. Neither list's order implies
   * direction — TP's registration is asynchronous, so either event can be
   * logged (and timestamped) first.
   */
  private pairByNearestInstant<A extends TimedEvent, C extends TimedEvent>(
    options: PairByNearestInstantOptions<A, C>,
  ): {
    actorByCandidateEventId: Map<number, A>;
    pairedActorEventIds: Set<number>;
  } {
    const { actors, candidates, isCandidate } = options;
    const actorByCandidateEventId = new Map<number, A>();
    const pairedActorEventIds = new Set<number>();
    const claimedCandidateEventIds = new Set<number>();

    for (const actor of actors) {
      let best: C | undefined;
      let bestDiffMs = Infinity;
      for (const candidate of candidates) {
        if (claimedCandidateEventIds.has(candidate.tpEventId)) {
          continue;
        }
        if (!isCandidate(actor, candidate)) {
          continue;
        }
        const diffMs = Math.abs(
          new Date(candidate.instant).getTime() -
            new Date(actor.instant).getTime(),
        );
        // A candidate must be within the cutoff to be eligible at all.
        // Phrased as an inclusion check (`<=`), not its negation, so an
        // unparseable `instant` (diffs to NaN) is naturally excluded too:
        // `NaN <= anything` is always false, so this branch is taken —
        // whereas the negated form `diffMs > MAX` would be false for NaN and
        // would wrongly let it through.
        if (!(diffMs <= MAX_PAIRING_DELAY_MS)) {
          continue;
        }
        if (best === undefined || diffMs < bestDiffMs) {
          best = candidate;
          bestDiffMs = diffMs;
        }
      }
      if (best) {
        actorByCandidateEventId.set(best.tpEventId, actor);
        pairedActorEventIds.add(actor.tpEventId);
        claimedCandidateEventIds.add(best.tpEventId);
      }
    }

    return { actorByCandidateEventId, pairedActorEventIds };
  }

  /**
   * A code-8 is a valid pairing candidate for a code-6 when the injury
   * happened on the casualty-causer's own turn (`injury.turnRosterId`
   * matches the casualty's acting `rosterId`), the victim is on the opposing
   * side (`injury.rosterId` differs from the casualty's `rosterId`), and
   * both carry the same `turnNumber`. This check is fully symmetric in time
   * — neither event's `instant` is consulted — since TP's async
   * registration means either can be logged first.
   */
  private isCasualtyCandidate(
    casualty: CasualtyEvent,
    injury: InjuryEvent,
  ): boolean {
    return (
      injury.turnRosterId === casualty.rosterId &&
      injury.rosterId !== casualty.rosterId &&
      casualty.turnNumber !== undefined &&
      injury.turnNumber === casualty.turnNumber
    );
  }

  /**
   * A code-8 is a valid pairing candidate for a code-31 under exactly the same
   * rule: the injury happened on the fouler's own turn, the victim is on the
   * opposing side, and both carry the same `turnNumber`.
   */
  private isFoulCandidate(foul: FoulEvent, injury: InjuryEvent): boolean {
    return (
      injury.turnRosterId === foul.rosterId &&
      injury.rosterId !== foul.rosterId &&
      foul.turnNumber !== undefined &&
      injury.turnNumber === foul.turnNumber
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
    const { actorByCandidateEventId, pairedActorEventIds } =
      this.pairByNearestInstant<CasualtyEvent, InjuryEvent>({
        actors: matchEvents.filter(
          (e): e is CasualtyEvent => e.type === 'casualty_caused',
        ),
        candidates: matchEvents.filter(
          (e): e is InjuryEvent => e.type === 'injury',
        ),
        isCandidate: (casualty, injury) =>
          this.isCasualtyCandidate(casualty, injury),
      });
    return {
      casualtyByInjuryEventId: actorByCandidateEventId,
      pairedCasualtyEventIds: pairedActorEventIds,
    };
  }

  /**
   * Pair every match's `foul` events with an `injury` event that
   * {@link correlateCasualties} left unattributed — see {@link FoulPairing}
   * for why fouls need their own pass and why the rule is identical in shape.
   * Must be called with the SAME match's `casualtyPairing`, computed first.
   */
  correlateFouls(
    matchEvents: TpMatchEvent[],
    casualtyPairing: CasualtyPairing,
  ): FoulPairing {
    const { actorByCandidateEventId, pairedActorEventIds } =
      this.pairByNearestInstant<FoulEvent, InjuryEvent>({
        actors: matchEvents.filter((e): e is FoulEvent => e.type === 'foul'),
        candidates: matchEvents.filter(
          (e): e is InjuryEvent =>
            e.type === 'injury' &&
            !casualtyPairing.casualtyByInjuryEventId.has(e.tpEventId),
        ),
        isCandidate: (foul, injury) => this.isFoulCandidate(foul, injury),
      });
    return {
      foulByInjuryEventId: actorByCandidateEventId,
      pairedFoulEventIds: pairedActorEventIds,
    };
  }
}
