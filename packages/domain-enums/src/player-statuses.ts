/**
 * A player's current status, as the source reports it.
 *
 * - `active` — on the roster and available to play (a player missing their
 *   next game through injury is still active).
 * - `dead` — killed; permanently off the roster.
 * - `retired` — permanently left the roster without dying.
 * - `temporarily_retired` — off the roster for now, but may return.
 *
 * Where this is stored, NULL (not a member of this list) means no source has
 * reported a status for the player, which is distinct from a known `active`.
 */
export const PLAYER_STATUSES = [
  'active',
  'dead',
  'retired',
  'temporarily_retired',
] as const;

export type PlayerStatus = (typeof PLAYER_STATUSES)[number];
