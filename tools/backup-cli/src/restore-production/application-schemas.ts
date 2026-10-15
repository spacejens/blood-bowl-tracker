/**
 * The schemas the application's migrations create, and the only ones
 * `restore-production` drops and restores: `game_data` and
 * `discord_bot_usage` hold the tables, `public` the shared trigger
 * functions, and `drizzle` the migration journal. Neon's own schemas are
 * never touched. `public` comes last because the wipe recreates it empty.
 */
export const APPLICATION_SCHEMAS = [
  'game_data',
  'discord_bot_usage',
  'drizzle',
  'public',
] as const;
