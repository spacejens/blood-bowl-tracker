import type { SQL } from '@blood-bowl-tracker/db';
import { and, inArray, matchEvents, or } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type { TrophyRuleEventTypes } from './trophy-rule-types';

/**
 * Turns one trophy rule's curated match-event types into a drizzle condition.
 * Pure and dependency-free: it only assembles conditions, issuing no query of
 * its own, so the rule services may take it as a real collaborator in their
 * specs (see CLAUDE.md's pure decision-service carve-out).
 */
@Injectable()
export class TrophyRuleEventTypeFilterService {
  /**
   * Inclusion semantics: an event matches when every curated side matches. A
   * rule curating both an action type and a consequence type therefore selects
   * only events carrying both — the compound "foul that caused a casualty".
   * An empty list on a side imposes no condition for that column, and an
   * entirely uncurated rule builds no condition at all.
   */
  buildAll(types: TrophyRuleEventTypes): SQL | undefined {
    return and(
      types.actionTypes.length === 0
        ? undefined
        : inArray(matchEvents.actionType, types.actionTypes),
      types.consequenceTypes.length === 0
        ? undefined
        : inArray(matchEvents.consequenceType, types.consequenceTypes),
    );
  }

  /**
   * Exclusion semantics: an event matches when ANY curated type matches, so a
   * caller can negate the whole thing to subtract those events back out.
   * OR rather than AND because an exclusion list names alternatives, not a
   * compound.
   */
  buildAny(types: TrophyRuleEventTypes): SQL | undefined {
    return or(
      types.actionTypes.length === 0
        ? undefined
        : inArray(matchEvents.actionType, types.actionTypes),
      types.consequenceTypes.length === 0
        ? undefined
        : inArray(matchEvents.consequenceType, types.consequenceTypes),
    );
  }
}
