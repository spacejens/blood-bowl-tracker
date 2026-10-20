import type { SecretObjective } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

/**
 * Exported for `secret-objective.service.spec.ts`, so its decode tests are
 * driven directly off this map (every known code gets a test case, with no
 * risk of the two lists drifting apart).
 */
export const secretObjectiveByCode: Record<number, SecretObjective> = {
  1: 'red_card',
  2: 'didnt_need_them_anyway',
  3: 'going_alone',
  4: 'fouling_frenzy',
  5: 'going_surfing',
  6: 'ganging_up',
  7: 'whoops',
  8: 'not_so_fast',
  9: 'timely_tackle',
  10: 'precision_passing',
  11: 'hit_em_hard',
  12: 'just_a_little_further',
  13: 'go_long',
  14: 'nuffle_favors_the_bold',
  15: 'all_according_to_plan',
  16: 'headtaker',
};

@Injectable()
export class SecretObjectiveService {
  /**
   * Decodes the card of a TP `secret_objective` (code-42) event. TP stores
   * only an opaque integer; an unmapped code decodes to `'unknown'`.
   */
  decode(code: number): SecretObjective {
    return secretObjectiveByCode[code] ?? 'unknown';
  }
}
