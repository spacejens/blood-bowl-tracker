// A plain function rather than a NestJS service, for the same reason
// `createApiClient` is one (see CLAUDE.md, "Service vs. loose function",
// case 3): it is compute with no injectable dependencies, handed to the
// oRPC `RPCLink` at the provider-bootstrap point that constructs the very
// client instance NestJS DI then manages.

/**
 * Each individual attempt is abandoned after this long. Generous rather than
 * tight: `matches`/`matchEvents` upserts arrive in chunks of up to 500 (see
 * `packages/import`'s `DEFAULT_BATCH_CHUNK_SIZE`), and the
 * server processes a batch's items sequentially (`UpsertHandlerService.
 * runBatch`), so this has to comfortably outlast the slowest such chunk —
 * catching a genuinely stalled connection is still the point, not shaving
 * seconds off a healthy one.
 */
const REQUEST_TIMEOUT_MS = 180_000;

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

// Only the gateway/infrastructure statuses a Fly machine restart or an
// overloaded upstream actually produces — the api-server never returns
// them itself. A bare 500 means the server ran and threw (an unclassified
// application fault — see UpsertHandlerService's "anything else propagates
// untouched"), which every retry would reproduce identically: since
// packages/import continues past a failed record rather than aborting the
// run, retrying every 500 would turn one systematic server-side fault into
// a multi-hour stall across an entire import instead of a fast, loud
// failure. 2xx, 3xx and 4xx (a record the API rejected as bad or
// incomplete) are likewise settled answers; retrying them would just loop
// on the same outcome.
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const isRetryableStatus = (status: number): boolean =>
  RETRYABLE_STATUSES.has(status);

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
      // an externally aborted call ends the retry loop instead of being
      // retried through the full backoff schedule.
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
      // Discarding a retried response without draining its body would pin
      // the underlying connection until GC reclaims it; across a long
      // import with many retried calls that adds up to real socket leakage.
      // Best-effort: a stream that's already errored can reject cancel()
      // too, and that's not itself a reason to treat this attempt as failed.
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      // A thrown fetch is a network failure, a connection reset, or our own
      // timeout abort — all worth another attempt, until they are not. A
      // caller-initiated abort is different: retrying it would just burn
      // through the whole backoff schedule before rethrowing regardless.
      if (isLastAttempt || request.signal.aborted) {
        throw error;
      }
    }
    await wait(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
  }
}
