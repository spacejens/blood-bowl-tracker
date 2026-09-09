/**
 * Who a trophy is awarded to. A `team` trophy names a team era; a `player`
 * trophy names an individual player (whose team era is still recorded on the
 * award row — see `trophy-awards.ts` in packages/db).
 */
export const TROPHY_RECIPIENT_KINDS = ['team', 'player'] as const;
