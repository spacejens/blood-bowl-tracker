import { Injectable } from '@nestjs/common';

/** Options for one request made through a {@link TpFetchSession}. */
export type TpFetchOptions = {
  /**
   * The TP frontend page URL this request belongs to, sent as `referer`.
   * Left out of the request when not given.
   */
  referer?: string;
  /** HTTP method. Defaults to `GET`. */
  method?: string;
  /** Request body, for a method that takes one. */
  body?: string;
};

/**
 * One logical visit to TP — e.g. one whole tournament download. Its requests
 * share a cookie jar and are paced against each other; nothing is shared with
 * any other session. Callers make one request at a time: pacing and the
 * cookie jar are only meaningful in sequence, so concurrent calls on the same
 * session (e.g. via `Promise.all`) are not supported.
 */
export type TpFetchSession = {
  /**
   * Requests `url` and returns its body parsed as JSON. Throws when the
   * response is not 2xx, the body is not valid JSON, or the request does not
   * complete within {@link REQUEST_TIMEOUT_MS}; never retries.
   */
  fetch(url: string, options?: TpFetchOptions): Promise<unknown>;
};

/** Mutable state private to the one session it was created for. */
type TpSessionState = {
  cookies: Map<string, string>;
  lastRequestAt: number | undefined;
};

/**
 * The browser-like header set TP accepts plain-HTTP requests with (see
 * docs/download-tp/index.md, "Plain-HTTP fetching"). Found sufficient as a
 * whole, but not individually isolated as necessary, so none is dropped.
 */
const BROWSER_HEADERS: Readonly<Record<string, string>> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en',
  'content-type': 'application/json',
  priority: 'u=1, i',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'x-requested-with': 'XMLHttpRequest',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/** Bounds of the random gap between two requests in the same session. */
const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 2000;

/** A request that hasn't completed within this long is aborted, not retried. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Makes requests to TP's API that TP accepts from a non-browser client. All
 * request logic lives here; a session is only the per-visit state this
 * service's methods run against.
 */
@Injectable()
export class TpFetcherService {
  /** Starts one logical visit, with its own empty cookie jar and pacing. */
  createSession(): TpFetchSession {
    const state: TpSessionState = {
      cookies: new Map<string, string>(),
      lastRequestAt: undefined,
    };
    return {
      fetch: (url, options) => this.fetchInSession(state, url, options),
    };
  }

  private async fetchInSession(
    state: TpSessionState,
    url: string,
    options: TpFetchOptions = {},
  ): Promise<unknown> {
    await this.waitForPacing(state);
    const response = await globalThis.fetch(url, {
      method: options.method ?? 'GET',
      headers: this.buildHeaders(state, options.referer),
      body: options.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    state.lastRequestAt = Date.now();
    this.absorbCookies(state, response.headers.getSetCookie());
    if (!response.ok) {
      throw new Error(
        `TP request to ${url} failed with status ${response.status}`,
      );
    }
    return this.parseJson(url, await response.text());
  }

  /**
   * Waits until a random 0.5–2 s have passed since the session's previous
   * request completed. Time the caller already spent in between counts, so a
   * caller that is slow anyway is not slowed further. A session's first
   * request is never delayed.
   */
  private async waitForPacing(state: TpSessionState): Promise<void> {
    if (state.lastRequestAt === undefined) {
      return;
    }
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    const remaining = state.lastRequestAt + delay - Date.now();
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }

  private buildHeaders(
    state: TpSessionState,
    referer: string | undefined,
  ): Record<string, string> {
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (referer !== undefined) {
      headers.referer = referer;
    }
    if (state.cookies.size > 0) {
      headers.cookie = [...state.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }
    return headers;
  }

  /**
   * Stores each `Set-Cookie` header's name=value pair, a later value
   * replacing an earlier one of the same name. Attributes (domain, path,
   * expiry) are ignored: a session only ever talks to TP, for one visit.
   */
  private absorbCookies(state: TpSessionState, setCookies: string[]): void {
    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      state.cookies.set(
        pair.slice(0, separator).trim(),
        pair.slice(separator + 1).trim(),
      );
    }
  }

  private parseJson(url: string, body: string): unknown {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error(
        `TP request to ${url} returned a body that is not valid JSON`,
      );
    }
  }
}
