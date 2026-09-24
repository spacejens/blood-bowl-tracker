import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/**
 * Pairs a code-6 (`casualty_caused`) action with the code-8 (`injury`) roll
 * naming the victim.
 *
 * TP logs the two as independent events with no shared id, so the attacker can
 * only be recovered by pairing them after the fact. Pairing is on `turnNumber`
 * equality, not time: TP registers events asynchronously, so a code-8 can be
 * logged — or timestamped — before its code-6. A code-6 with no same-turn
 * candidate stays unpaired rather than being force-matched to a plausible
 * candidate on another turn.
 *
 * Unpaired events on either side are normal, not errors: an apothecary erases
 * the injury a code-6 caused, and a player can fall on their own.
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
 * Pairs a code-31 (`foul`) event with the code-8 (`injury`) it caused.
 *
 * TP never logs a `casualty_caused` (code 6) for a foul-caused injury — which
 * is correct, since Blood Bowl awards no casualty credit for a foul — so
 * without this the fouler is unconnected to the player they hurt.
 *
 * Only injuries left unattributed by `correlateCasualties` are eligible; an
 * injury already credited to a specific attacker is never re-credited to a
 * fouler. Same-turn candidates outside {@link MAX_PAIRING_DELAY_MS} stay
 * unpaired and import as ordinary casualties — an accepted gap, since TP's
 * foul events carry no stronger signal.
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
