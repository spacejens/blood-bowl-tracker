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

/** Prefix for race deepdive button customIds: `deepdive:race:<id>`. */
export const RACE_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:race:';

/** Prefix for competition deepdive button customIds: `deepdive:competition:<id>`. */
export const COMPETITION_BUTTON_CUSTOM_ID_PREFIX = 'deepdive:competition:';
