/**
 * The customId prefixes for every drill-down button. A button's customId is
 * `<prefix><idPart>` (e.g. `deepdive:team:42`); the button handler strips the
 * prefix to recover the id part. Most route to `/deepdive`; the on-this-date
 * prefix routes to `/onthisdate` instead.
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

/** Prefix for league deepdive button customIds: `deepdive:league:<id>`. */
export const LEAGUE_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:league:';

/** Prefix for trophy deepdive button customIds: `deepdive:trophy:<id>`. */
export const TROPHY_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:trophy:';

/**
 * Prefix for on-this-date drill-down button customIds:
 * `onthisdate:<MM-DD>[:<scopeKind>:<scopeValue>]`. Unlike every other prefix
 * here, the id part is not an entity id: it is a calendar date plus at most
 * one scope, encoded by `DateButtonIdService`, so a click from a scoped
 * toplist lands on an equally scoped `/onthisdate`. It also routes to
 * `/onthisdate` rather than `/deepdive`, which is why its prefix is not
 * `deepdive:`.
 */
export const ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX = 'onthisdate:';

/**
 * Every routing prefix a drill-down button can use. Narrowing
 * `EntityComponentEntry.customIdPrefix` to this union (rather than `string`)
 * is what lets `entity-components.service.ts` hold an exhaustive
 * `Record<ButtonCustomIdPrefix, ButtonStyle>` colour map: adding a further
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
  | typeof LEAGUE_BUTTON_CUSTOM_ID_PREFIX
  | typeof TROPHY_BUTTON_CUSTOM_ID_PREFIX
  | typeof ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX;
