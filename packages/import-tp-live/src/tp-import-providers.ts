/**
 * DI tokens for the inputs this package needs from whichever app runs it.
 * The app provides each from a `@Global()` module, so every module in this
 * package can inject them without importing an app-specific module.
 */

/** Where TP lives. Needed only by the live fetch (`ImportTpLiveModule`). */
export const TP_CONNECTION_PROVIDER = Symbol('TP_CONNECTION_PROVIDER');

/**
 * TP's base URLs, each including a trailing slash. The getter names match
 * tools/download-tp's `DownloadTpConfigService`, which reads the same two
 * values from its config file.
 */
export interface TpConnectionProvider {
  /** Base URL of TP's API; roster API paths are appended to it. */
  getBackendApiUrl(): string;
  /** Base URL of TP's frontend; roster page paths are appended to it. */
  getFrontendUrl(): string;
}

/**
 * The name TP's external system is registered under. Needed by the team and
 * player upserts and by era resolution, bulk and live alike.
 */
export const TP_EXTERNAL_SYSTEM_NAME_PROVIDER = Symbol(
  'TP_EXTERNAL_SYSTEM_NAME_PROVIDER',
);

/**
 * Supplies TP's external-system name. tools/import-tp's
 * `ExternalSystemNameConfigService` has this shape (config-file driven,
 * defaulting to "TP"); a live caller with no config file can supply a plain
 * "TP".
 */
export interface TpExternalSystemNameProvider {
  getTpSystemName(): string;
}

/**
 * Each era's declared rules sets. TP's data names no rules set per era, so
 * the player import reads them from here to validate characteristics and to
 * pick a mercenary hire's curated values.
 */
export const TP_ERA_RULES_SETS_PROVIDER = Symbol('TP_ERA_RULES_SETS_PROVIDER');

/** One era and the rules set names it spans, in chronological order. */
export interface TpEraRulesSets {
  name: string;
  rulesSets: string[];
}

/**
 * Supplies every era's declared rules sets. tools/import-tp's
 * `EraDataConfigService` has this shape (from `league.eras` in its config
 * file); a live caller supplies its own. May throw (or reject) when the
 * eras cannot be read — the player import records that as one error.
 */
export interface TpEraRulesSetsProvider {
  getEras(): TpEraRulesSets[] | Promise<TpEraRulesSets[]>;
}
