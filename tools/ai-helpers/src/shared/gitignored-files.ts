/**
 * Gitignored dev config files copied into a fresh worktree by
 * `sync-gitignored`. Production variants are deliberately absent: a new
 * worktree must never get production secrets copied in automatically.
 */
export const GITIGNORED_SYNC_FILES: readonly string[] = [
  'apps/discord-bot/.env',
  'tools/download-tp/download-tp-config.json5',
  'tools/import-bbl/import-bbl-config.json5',
  'tools/import-tp/import-tp-config.json5',
  'tools/import-manual/import-manual-config.json5',
  'tools/review-match/review-match-config.json5',
];

/**
 * Gitignored production import configs — the `.production.json5` variant of
 * each importer's config, checked by `check-production-config-port` for a
 * stale `apiBaseUrl` before `deploy-production` opens the tunnel.
 */
export const GITIGNORED_PRODUCTION_IMPORT_CONFIG_FILES: readonly string[] = [
  'tools/import-bbl/import-bbl-config.production.json5',
  'tools/import-tp/import-tp-config.production.json5',
  'tools/import-manual/import-manual-config.production.json5',
];

/**
 * Files `check-drift` compares between the worktree and the main checkout.
 * This is `GITIGNORED_SYNC_FILES` plus the production variants: a developer
 * may have copied one in by hand, and it should still be caught before the
 * worktree is discarded.
 */
export const GITIGNORED_DRIFT_FILES: readonly string[] = [
  ...GITIGNORED_SYNC_FILES,
  'apps/discord-bot/.env.production',
  ...GITIGNORED_PRODUCTION_IMPORT_CONFIG_FILES,
];

/**
 * Large gitignored data directories symlinked (never copied) into a
 * worktree. They read through to the main checkout's files, so they cannot
 * drift and are excluded from `GITIGNORED_DRIFT_FILES`.
 */
export const GITIGNORED_DATA_DIRS: readonly string[] = [
  'tools/import-bbl/data',
  'tools/import-tp/data',
];
