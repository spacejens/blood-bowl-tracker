import { Injectable } from '@nestjs/common';

/** Where a source showed the player: its roster, or only a match line-up. */
export type JourneymanSighting = 'roster' | 'lineUp';

/** What one source sighting says about a player. */
export interface JourneymanSightingFacts {
  /** The player's name as the source gives it. */
  name: string;
  /**
   * Whether the player's position is one a journeyman can be drawn from:
   * not a star player, mercenary or Big Guy hire.
   */
  isBasicPosition: boolean;
  sighting: JourneymanSighting;
  /**
   * Whether the roster lists Loner for the player, starting or gained.
   * Undefined when the sighting cannot say (a line-up, or a roster entry
   * without a skills group).
   */
  lonerListed?: boolean;
}

const JOURNEYMAN_NAME = 'journeyman';
const LONER_NAME = 'loner';

/**
 * The one rule BBL, TP bulk and TP live imports use to mark a journeyman: a
 * temporary player named "Journeyman" in a basic position of the team's
 * race, who has Loner for free until recruited. A line-up sighting only ever
 * sets the marker. A roster sighting states it: a renamed player, or one the
 * roster lists without Loner, has been recruited. Pure and I/O-free.
 */
@Injectable()
export class JourneymanRuleService {
  /** Whether the source names the player "Journeyman" (trimmed, any case). */
  isJourneymanName(name: string): boolean {
    return name.trim().toLowerCase() === JOURNEYMAN_NAME;
  }

  /** Whether a skill name is Loner (trimmed, any case). */
  isLonerName(name: string): boolean {
    return name.trim().toLowerCase() === LONER_NAME;
  }

  /**
   * The marker to send for one sighting: true or false, or undefined when
   * the sighting says nothing and the stored marker must stay.
   */
  decide(facts: JourneymanSightingFacts): boolean | undefined {
    const named = facts.isBasicPosition && this.isJourneymanName(facts.name);
    if (facts.sighting === 'lineUp') {
      return named ? true : undefined;
    }
    if (!named) {
      return false;
    }
    return facts.lonerListed ?? true;
  }
}
