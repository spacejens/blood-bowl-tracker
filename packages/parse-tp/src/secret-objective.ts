/**
 * The named secret-objective card a TP `secret_objective` (code-42) event
 * decodes to. TP stores only an opaque integer; `secretObjectiveByCode` maps
 * each confirmed code to its named objective, and any unmapped code decodes
 * to `'unknown'`.
 */
export type SecretObjective =
  | 'red_card'
  | 'didnt_need_them_anyway'
  | 'going_alone'
  | 'fouling_frenzy'
  | 'going_surfing'
  | 'ganging_up'
  | 'whoops'
  | 'not_so_fast'
  | 'timely_tackle'
  | 'precision_passing'
  | 'hit_em_hard'
  | 'just_a_little_further'
  | 'go_long'
  | 'nuffle_favors_the_bold'
  | 'all_according_to_plan'
  | 'headtaker'
  | 'unknown';

/**
 * Exported for `match-event-parser.service.spec.ts`, so its secret-objective
 * decode tests are driven directly off this map (every known code gets a test
 * case, with no risk of the two lists drifting apart).
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

export function decodeSecretObjective(code: number): SecretObjective {
  return secretObjectiveByCode[code] ?? 'unknown';
}
