/**
 * The customId prefixes for every deepdive drill-down button. A button's
 * customId is `<prefix><entityId>` (e.g. `deepdive:team:42`); the button
 * handler in `DeepdiveCommandService` strips the prefix to recover the id.
 *
 * These live in a dependency-free leaf module (rather than in
 * `deepdive-command.service.ts`) because the deepdive fact resolvers need them
 * too, and the command service already imports those resolvers — defining the
 * prefixes here keeps that from becoming a circular import.
 */

/** Prefix for era deepdive button customIds: `deepdive:era:<id>`. */
export const ERA_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:era:';

/** Prefix for coach deepdive button customIds: `deepdive:coach:<id>`. */
export const COACH_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:coach:';

/** Prefix for team deepdive button customIds: `deepdive:team:<id>`. */
export const TEAM_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:team:';

/** Prefix for player deepdive button customIds: `deepdive:player:<id>`. */
export const PLAYER_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:player:';

/**
 * Prefix for star player deepdive button customIds:
 * `deepdive:star-player:<positionId>`. The id part is a `positions.id`, not a
 * `players.id` — a star's identity is its position, and each hire is its own
 * players row.
 */
export const STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:star-player:';

/** Prefix for race deepdive button customIds: `deepdive:race:<id>`. */
export const RACE_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:race:';

/** Prefix for competition deepdive button customIds: `deepdive:competition:<id>`. */
export const COMPETITION_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:competition:';

/** Prefix for competition group deepdive button customIds: `deepdive:competition-group:<id>`. */
export const COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX =
  'deepdive:competition-group:';

/** Prefix for trophy deepdive button customIds: `deepdive:trophy:<id>`. */
export const TROPHY_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:trophy:';

/**
 * Every routing prefix a drill-down button can use. Narrowing
 * `EntityComponentEntry.customIdPrefix` to this union (rather than `string`)
 * is what lets `entity-components.service.ts` hold an exhaustive
 * `Record<ButtonCustomIdPrefix, ButtonStyle>` colour map: adding a tenth
 * prefix constant without giving it a colour there becomes a compile error
 * instead of a silently mis-coloured button.
 */
export type ButtonCustomIdPrefix =
  | typeof ERA_BUTTON_CUSTOM_ID_PREFIX
  | typeof COACH_BUTTON_CUSTOM_ID_PREFIX
  | typeof TEAM_BUTTON_CUSTOM_ID_PREFIX
  | typeof PLAYER_BUTTON_CUSTOM_ID_PREFIX
  | typeof STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX
  | typeof RACE_BUTTON_CUSTOM_ID_PREFIX
  | typeof COMPETITION_BUTTON_CUSTOM_ID_PREFIX
  | typeof COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX
  | typeof TROPHY_BUTTON_CUSTOM_ID_PREFIX;
