import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';

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
 * A code-8 is a valid pairing candidate for a code-6 when the injury
 * happened on the casualty-causer's own turn (`injury.turnRosterId` matches
 * the casualty's acting `rosterId`), the victim is on the opposing side
 * (`injury.rosterId` differs from the casualty's `rosterId`), and both carry
 * the same `turnNumber`. This check is fully symmetric in time — neither
 * event's `instant` is consulted — since TP's async registration means
 * either can be logged first.
 */
function isCandidate(casualty: CasualtyEvent, injury: InjuryEvent): boolean {
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
 * When a code-6 has multiple same-turn, correct-direction, still-unclaimed
 * candidates, the nearest by absolute `instant` difference is chosen as a
 * secondary tiebreaker — never as an ordering/direction filter.
 */
export function correlateCasualties(
  matchEvents: TpMatchEvent[],
): CasualtyPairing {
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
      if (!isCandidate(casualty, injury)) {
        continue;
      }
      const diffMs = Math.abs(
        new Date(injury.instant).getTime() -
          new Date(casualty.instant).getTime(),
      );
      if (diffMs < bestDiffMs) {
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
