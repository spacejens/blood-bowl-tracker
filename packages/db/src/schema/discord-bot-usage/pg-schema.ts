import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Operational telemetry for the Discord bot, deliberately kept in its own
 * Postgres schema rather than mixed into `game_data`: nothing here is Blood
 * Bowl domain data, and none of it is history-tracked.
 */
export const discordBotUsage = pgSchema('discord_bot_usage');
