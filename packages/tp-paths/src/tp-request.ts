/**
 * TP's two base URLs, each with a trailing slash. tools/download-tp's
 * DownloadTpConfigService and packages/import-tp-live's TpConnectionProvider
 * both satisfy it, so either can be passed to a path service's request
 * methods as is.
 */
export interface TpBaseUrls {
  /** Base URL of TP's API; API paths are appended to it. */
  getBackendApiUrl(): string;
  /** Base URL of TP's frontend; page paths are appended to it. */
  getFrontendBaseUrl(): string;
}

/** One request to TP's API, exactly as TP's own frontend makes it. */
export interface TpRequest {
  /**
   * The API path relative to the backend API base URL, query string
   * included. tools/download-tp names its output file after it.
   */
  path: string;
  /** The full API URL to fetch. */
  url: string;
  /** The full URL of the frontend page the request is sent from (its referer). */
  referer: string;
}
