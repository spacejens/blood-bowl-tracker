import { JourneymanRuleService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type {
  BblPlayerAdvancements,
  BblPlayerSkillRef,
} from './player-page-parser';

/**
 * A BBL journeyman's page lists Loner in the gained colour, numbered among
 * his advancements. The server keeps a journeyman's Loner as a starting
 * skill itself, so the import leaves it out and closes its number: every
 * later skill and increase moves down one. Pure.
 */
@Injectable()
export class BblJourneymanAdvancementsService {
  constructor(private readonly rule: JourneymanRuleService) {}

  /** Whether the Skills cell lists Loner, starting or gained. */
  listsLoner(advancements: BblPlayerAdvancements): boolean {
    return advancements.skills.some((ref) => this.rule.isLonerName(ref.name));
  }

  /** The advancements without the gained Loner, later numbers closed up. */
  withoutGainedLoner(
    advancements: BblPlayerAdvancements,
  ): BblPlayerAdvancements {
    const isGainedLoner = (ref: BblPlayerSkillRef): boolean =>
      ref.source !== 'starting' && this.rule.isLonerName(ref.name);
    const slots = advancements.skills.flatMap((ref) =>
      isGainedLoner(ref) && ref.advancementOrder !== undefined
        ? [ref.advancementOrder]
        : [],
    );
    const shift = (order: number): number =>
      order - slots.filter((slot) => slot < order).length;
    return {
      skills: advancements.skills
        .filter((ref) => !isGainedLoner(ref))
        .map((ref) =>
          ref.advancementOrder === undefined
            ? ref
            : { ...ref, advancementOrder: shift(ref.advancementOrder) },
        ),
      characteristicIncreases: advancements.characteristicIncreases.map(
        (increase) => ({
          ...increase,
          advancementOrder: shift(increase.advancementOrder),
        }),
      ),
    };
  }
}
