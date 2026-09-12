import type { SQL } from '@blood-bowl-tracker/db';
import { inArray, positions, sql } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type { TrophyRuleEligiblePositions } from './trophy-rule-types';

/**
 * Turns one trophy rule's eligible positions into a drizzle condition. It
 * issues no query of its own, but what it returns is part of a live one: the
 * rule services splice it straight into a `WHERE` clause. That concrete
 * `SQL`-building behaviour is exactly what CLAUDE.md's real-collaborator
 * carve-outs exclude, so the rule services mock this service in their specs
 * and its own behaviour is asserted here in `trophy-rule-position-filter.service.spec.ts`.
 */
@Injectable()
export class TrophyRulePositionFilterService {
  /**
   * `undefined` — the trophy curates no position restriction at all — imposes
   * no condition, the same "uncurated means unrestricted" convention the
   * event-type filter uses for an empty list.
   *
   * An EMPTY list is the opposite and deliberately so: it means the trophy
   * DOES restrict its candidates, but none of the curated positions resolved
   * to a row (an authoring typo, or an import that never created them). That
   * must award nothing rather than silently fall back to every player in the
   * competition, so it builds a condition no row can satisfy. `inArray` with
   * an empty list is not used for this: drizzle rejects it.
   */
  build(positionIds: TrophyRuleEligiblePositions): SQL | undefined {
    if (positionIds === undefined) {
      return undefined;
    }
    if (positionIds.length === 0) {
      return sql`false`;
    }
    return inArray(positions.id, positionIds);
  }
}
