/** Options for {@link TpBlockedError}. */
export interface TpBlockedErrorOptions {
  /**
   * Whether the request reached TP and TP answered it with 403. False for a
   * request refused without contacting TP because a back-off was in force.
   * Defaults to true.
   */
  answeredByTp?: boolean;
}

/**
 * TP answered a request with 403 "Access denied": it is blocking this
 * client. Thrown for that response and, until `retryAt`, for every further
 * request from any session in the process, none of which is sent to TP.
 * An import that meets it should stop rather than carry on to its next
 * item, since every further request fails the same way.
 */
export class TpBlockedError extends Error {
  /** The earliest time a request is sent to TP again. */
  readonly retryAt: Date;

  /**
   * True when this request reached TP and TP answered 403; false when it was
   * refused without contacting TP, because an earlier block's back-off had
   * not yet ended.
   */
  readonly answeredByTp: boolean;

  /**
   * Set by an import that meets this block while backfilling a competition,
   * before rethrowing it: the competition exists, but its backfill did not
   * complete, so a retry must force the backfill rather than skip it for an
   * existing competition. Unset for a block met anywhere else.
   */
  backfillInterrupted?: boolean;

  constructor(
    retryAt: Date,
    { answeredByTp = true }: TpBlockedErrorOptions = {},
  ) {
    super(
      `TP is blocking requests (HTTP 403 Access denied); no request is sent to TP before ${retryAt.toISOString()}`,
    );
    this.name = 'TpBlockedError';
    this.retryAt = retryAt;
    this.answeredByTp = answeredByTp;
  }
}
