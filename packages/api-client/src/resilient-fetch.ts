// A plain function rather than a NestJS service, for the same reason
// `createApiClient` is one (see CLAUDE.md, "Service vs. loose function",
// case 3): it is compute with no injectable dependencies, handed to the
// oRPC `RPCLink` at the provider-bootstrap point that constructs the very
// client instance NestJS DI then manages.

/** Each individual attempt is abandoned after this long. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Retries after the first attempt, so 6 total attempts. */
const MAX_RETRIES = 5;

/** Backoff before the first retry; doubles for each subsequent retry. */
const INITIAL_RETRY_DELAY_MS = 1_000;

/**
 * The `init` oRPC hands its `fetch` option (`{ redirect: 'manual' }`).
 */
export type ResilientFetchInit = {
  redirect?: Request['redirect'];
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// HTTP status codes never exceed 599, so a lower bound is the whole test:
// 5xx means the server failed to handle an otherwise valid request, which
// a later attempt may well succeed at. Every other status — 2xx, 3xx and
// notably 4xx (a record the API rejected as bad or incomplete) — is a
// settled answer; retrying it would just loop on the same rejection.
const isRetryableStatus = (status: number): boolean => status >= 500;

/**
 * `fetch` for oRPC's `RPCLink`, bounding each attempt with a timeout and
 * retrying transport-level failures with exponential backoff. The imports
 * this client serves upsert everything they send, so a retried request is
 * safe to repeat.
 */
export async function resilientFetch(
  request: Request,
  init: ResilientFetchInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const isLastAttempt = attempt === MAX_RETRIES;
    try {
      // A Request body can only be consumed once, so each attempt gets its
      // own clone. The caller's own signal is preserved alongside ours, so
      // an externally aborted call still aborts.
      const response = await fetch(request.clone(), {
        ...init,
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      });
      if (!isRetryableStatus(response.status) || isLastAttempt) {
        return response;
      }
    } catch (error) {
      // A thrown fetch is a network failure, a connection reset, or our own
      // timeout abort — all worth another attempt, until they are not.
      if (isLastAttempt) {
        throw error;
      }
    }
    await wait(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
  }
}
