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
