import { sql } from '@blood-bowl-tracker/db';

/**
 * Today's date in UTC, as SQL. The day boundary is pinned to UTC so whether an
 * era has ended never depends on the database session's TimeZone setting, and
 * matches the Discord bot's player status line (`PlayerStatusLineService`),
 * which compares an era's end date with today's date in UTC.
 */
export const UTC_TODAY = sql`(now() at time zone 'UTC')::date`;
