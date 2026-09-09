/**
 * How one of a position's characteristics is expressed under a rules set.
 *
 * - `absent` — the rules set has no such characteristic at all (in practice
 *   only ever Passing, which the pre-BB2020 rules sets do not have).
 * - `bare` — displayed as a plain number.
 * - `plus` — displayed with a trailing "+": the value names a target a die
 *   roll has to meet. A stored 0 is never a legal value under this format.
 * - `plus_zero_legal` — the same target-number display as `plus`, except
 *   that 0 is itself a legal stored value meaning "structurally incapable"
 *   (a BB2020 Kroxigor or Ogre cannot pass at all), rendered as a bare `0`
 *   rather than `0+`, since `0+` is not a meaningful die-roll target. Any
 *   non-zero value renders exactly as under `plus`.
 *
 * `plus_zero_legal` is a separate enum value rather than a per-characteristic
 * flag because "is 0 legal here" cannot be inferred from the characteristic:
 * Agility and Armour also use `plus` under BB2020/DB2021/BB2025, and 0 is
 * never legal for either of them. Only the format value can answer it.
 *
 * `absent` is only usable in practice for Passing today: Move, Strength,
 * Agility and Armour are non-nullable on `position_rules_sets` (and on
 * `PositionRulesSetEntrySchema` in packages/api-contract), so configuring one
 * of their format columns as `absent` would make every row for that rules set
 * permanently rejected by `PositionRulesSetsService` (it always supplies a
 * value for those four). The enum stays uniform across all five columns
 * rather than special-casing Passing, since a future rules set losing a
 * currently-mandatory characteristic is not implausible.
 */
export const CHARACTERISTIC_FORMATS = [
  'absent',
  'bare',
  'plus',
  'plus_zero_legal',
] as const;
