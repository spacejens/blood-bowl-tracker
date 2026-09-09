/**
 * The kinds of thing a match event can record its acting participant doing.
 * Not every value has an acting player: the administrative kinds
 * (`inducements`, `winnings`, `fan_factor`, `journeymen_signings`,
 * `prayers_to_nuffle`) describe the roster rather than a person.
 */
export const ACTION_TYPES = [
  'touchdown',
  'completion',
  'interception',
  'deflection',
  'foul',
  'mvp_award',
  'casualty',
  'badly_hurt',
  'serious_injury',
  'death',
  'inducements',
  'winnings',
  'fan_factor',
  'journeymen_signings',
  'prayers_to_nuffle',
  'secret_objective',
  'successful_landing',
  /**
   * A Big Guy's action of throwing a team-mate down field. Deliberately
   * outside the standardised SPP award table (`SppEarningActionTypeSchema` in
   * packages/api-contract): the source reports its own per-event figure, and
   * no career-total counter exists for it in any source's roster export.
   */
  'throw_team_mate',
  /** The thrown player's action of being caught / landing in a team-mate's hands. */
  'catch',
] as const;

/**
 * What happened to a match event's consequence recipient — casualty
 * severities, longer-term injuries, stat reductions, and the roster-level
 * consequences (`concession`, `dedicated_fans`, `expensive_mistake`).
 */
export const CONSEQUENCE_TYPES = [
  'casualty',
  'badly_hurt',
  'serious_injury',
  'miss_next_game',
  'niggling_injury',
  'stat_reduction_ma',
  'stat_reduction_st',
  'stat_reduction_ag',
  'stat_reduction_av',
  'stat_reduction_pa',
  'death',
  'sent_off',
  'expensive_mistake',
  'concession',
  'dedicated_fans',
  /**
   * A casualty the source reports as prevented (by an apothecary or by
   * regeneration). Deliberately NOT one of the real casualty consequences:
   * the prevented severity is carried separately in
   * `consequence_avoided_severity` / `consequenceAvoidedSeverity`, so no
   * casualty-suffered statistic counts a prevented casualty as a real one.
   * This is why the value is deliberately absent from every
   * `*_SUFFERED_TYPES` list in packages/game-data.
   */
  'casualty_avoided',
] as const;

/**
 * What a source says an un-indexed participant was, when it names the
 * participant as plain text instead of linking a player row. A journeyman or
 * mercenary IS a real player the source merely does not index; only
 * `fans_or_random_event` is genuinely not a player — hence "unidentified"
 * rather than "non-player". The `*_or_*` values preserve the source's own
 * ambiguity instead of inventing a resolution: `mercenary_or_star` means "a
 * mercenary or a star player, the source does not say which".
 */
export const UNIDENTIFIED_PARTICIPANT_KINDS = [
  'journeyman',
  'mercenary',
  'mercenary_or_star',
  'fans_or_random_event',
  'mercenary_or_fans_or_random_event',
] as const;

/** How a casualty the source reports was prevented from taking effect. */
export const CONSEQUENCE_AVOIDED_BY_VALUES = [
  'apothecary',
  'regeneration',
] as const;

/**
 * Top-level classification for match events that have no actor and no
 * consequence recipient (e.g. a weather roll) — parallel to `actionType`/
 * `consequenceType` and mutually exclusive with both.
 */
export const EVENT_TYPES = ['weather'] as const;

/**
 * The named weather condition a `weather`-classified event decodes to, from
 * an importer's raw source-specific weather code (decoded before import
 * reaches the database schema). `'unknown'` is a permanent catch-all for
 * codes not yet mapped. Only set on `weather` events, the same way
 * `actionType`/`consequenceType` are only set on their own kinds.
 */
export const WEATHER_TYPES = [
  'dungeon',
  'sweltering_heat',
  'very_sunny',
  'nice',
  'pouring_rain',
  'blizzard',
  'morning_dew',
  'blossoming_flowers',
  'misty_morning',
  'high_winds',
  'perfect_conditions',
  'melting_astrogranite',
  'blinding_rays',
  'monsoon',
  'leaf_strewn_pitch',
  'autumnal_chill',
  'strong_winds',
  'cold_winds',
  'freezing',
  'heavy_snow',
  'unknown',
] as const;

/**
 * The named secret-objective card a `secret_objective`-classified event
 * decodes to, from TP's raw opaque integer code (decoded before import
 * reaches the database schema). `'unknown'` is a permanent catch-all for
 * codes not yet mapped. Only set on `secret_objective` events.
 */
export const SECRET_OBJECTIVES = [
  'red_card',
  'didnt_need_them_anyway',
  'going_alone',
  'fouling_frenzy',
  'going_surfing',
  'ganging_up',
  'whoops',
  'not_so_fast',
  'timely_tackle',
  'precision_passing',
  'hit_em_hard',
  'just_a_little_further',
  'go_long',
  'nuffle_favors_the_bold',
  'all_according_to_plan',
  'headtaker',
  'unknown',
] as const;
